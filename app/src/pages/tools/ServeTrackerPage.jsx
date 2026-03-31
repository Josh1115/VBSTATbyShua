import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { PageHeader } from '../../components/layout/PageHeader';
import { useUiStore, selectShowToast } from '../../store/uiStore';
import { fmtDateShort } from '../../stats/formatters';
import { getIntStorage, setStorageItem, readDraftJson, STORAGE_KEYS } from '../../utils/storage';

// Standard FIVB zone layout from server's POV (aiming at opponent's court)
// Front row: 4 | 3 | 2    Back row: 5 | 6 | 1
const ZONE_ROWS = [[4, 3, 2], [5, 6, 1]];
const DRAFT_KEY = 'vbstat_draft_serve_tracker';

function heatStyle(count, max) {
  if (!count || !max) return {};
  const t = count / max;
  return { backgroundColor: `rgba(249,115,22,${(0.15 + t * 0.55).toFixed(2)})` };
}

function calcStats(serves) {
  const total    = serves.length;
  const inCount  = serves.filter((s) => typeof s === 'number').length;
  const netCount = serves.filter((s) => s === 'net').length;
  const outCount = serves.filter((s) => s === 'out').length;
  const zoneCounts = {};
  for (const s of serves) {
    if (typeof s === 'number') zoneCounts[s] = (zoneCounts[s] ?? 0) + 1;
  }
  return { total, inCount, netCount, outCount, zoneCounts };
}

// ─── Shared UI primitives ─────────────────────────────────────────────────────

function ZoneGrid({ zoneCounts, onZone }) {
  const maxZone = Math.max(0, ...Object.values(zoneCounts));
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] text-slate-500 uppercase tracking-wide text-center font-semibold">← Opponent's court →</p>
      {ZONE_ROWS.map((row, ri) => (
        <div key={ri} className="grid grid-cols-3 gap-1.5">
          {row.map((zone) => {
            const count = zoneCounts[zone] ?? 0;
            return (
              <button
                key={zone}
                onClick={() => onZone(zone)}
                style={count ? heatStyle(count, maxZone) : undefined}
                className="rounded-xl py-7 flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-transform bg-slate-800 border border-slate-700"
              >
                <span className="text-2xl font-black text-white">{zone}</span>
                {count > 0 && <span className="text-xs font-mono text-white/75">{count}</span>}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function ErrorButtons({ netCount, outCount, onNet, onOut }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <button
        onClick={onNet}
        className="relative bg-red-900/60 border border-red-700 hover:bg-red-800/60 text-white font-bold rounded-xl py-4 flex items-center justify-center gap-2 active:scale-95 transition-transform"
      >
        <span className="text-lg">🥅</span>
        <span className="text-base">NET</span>
        {netCount > 0 && <span className="absolute right-3 text-sm font-mono text-red-300">{netCount}</span>}
      </button>
      <button
        onClick={onOut}
        className="relative bg-slate-700/60 border border-slate-600 hover:bg-slate-600/60 text-white font-bold rounded-xl py-4 flex items-center justify-center gap-2 active:scale-95 transition-transform"
      >
        <span className="text-base">OUT</span>
        {outCount > 0 && <span className="absolute right-3 text-sm font-mono text-slate-300">{outCount}</span>}
      </button>
    </div>
  );
}

function StatsBar({ stats, onUndo, canUndo }) {
  const inPct = stats.total ? Math.round(stats.inCount / stats.total * 100) : null;
  const sePct = stats.total ? Math.round((stats.netCount + stats.outCount) / stats.total * 100) : null;
  return (
    <div className="bg-surface rounded-xl px-4 py-3 flex items-center justify-between">
      <Chip label="Total" value={stats.total || '—'} />
      <Chip label="In"    value={inPct  !== null ? `${inPct}%`  : '—'} color="text-emerald-400" />
      <Chip label="SE"    value={sePct  !== null ? `${sePct}%`  : '—'} color="text-red-400" />
      <Chip label="Net"   value={stats.netCount || '—'} color="text-red-400" />
      <Chip label="Out"   value={stats.outCount || '—'} color="text-slate-400" />
      <button
        onClick={onUndo}
        disabled={!canUndo}
        className="bg-slate-700 disabled:opacity-30 rounded-lg px-3 py-1.5 text-sm font-semibold active:scale-95 transition-transform"
      >
        Undo
      </button>
    </div>
  );
}

function Chip({ label, value, color = 'text-white' }) {
  return (
    <div className="text-center">
      <div className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">{label}</div>
      <div className={`text-lg font-black font-mono leading-tight ${color}`}>{value}</div>
    </div>
  );
}

// ─── Setup screen ─────────────────────────────────────────────────────────────

function SetupView({ onStart, onResume, onDiscardDraft }) {
  const [mode,    setMode]    = useState('individual'); // 'team' | 'individual'
  const [teamId,  setTeamId]  = useState(() => {
    const saved = getIntStorage(STORAGE_KEYS.DEFAULT_TEAM_ID);
    return !isNaN(saved) ? saved : null;
  });
  const [checked, setChecked] = useState(new Set());
  const [draft]               = useState(() => readDraftJson(DRAFT_KEY));

  const teams   = useLiveQuery(() => db.teams.orderBy('name').toArray(), []);
  const players = useLiveQuery(
    () => teamId ? db.players.where('team_id').equals(teamId).filter((p) => p.is_active).toArray() : [],
    [teamId]
  );
  const recentSessions = useLiveQuery(
    () => db.practice_sessions.where('tool_type').equals('serve_tracker').reverse().limit(10).toArray(),
    []
  );

  const sorted = [...(players ?? [])].sort((a, b) => (a.jersey_number ?? 0) - (b.jersey_number ?? 0));
  const allOn  = sorted.length > 0 && sorted.every((p) => checked.has(p.id));

  function toggle(id) {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function switchMode(m) {
    setMode(m);
    setChecked(new Set());
  }

  const teamName = (teams ?? []).find((t) => t.id === teamId)?.name ?? null;

  const canStartTeam       = mode === 'team';
  const canStartIndividual = mode === 'individual' && checked.size > 0;

  return (
    <div className="p-4 space-y-4">
      {/* Resume draft banner */}
      {draft && (
        <div className="bg-orange-900/40 border border-orange-700 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-orange-200">Resume unsaved session?</p>
            <p className="text-xs text-orange-300/70 mt-0.5 truncate">
              {draft.type === 'team' ? `Team · ${draft.serves?.length ?? 0} serves` : `${draft.players?.length ?? 0} servers`}
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={onDiscardDraft} className="text-xs text-slate-400 font-semibold px-2 py-1">Discard</button>
            <button onClick={() => onResume(draft)} className="text-xs bg-orange-600 text-white font-bold rounded-lg px-3 py-1.5">Resume</button>
          </div>
        </div>
      )}

      {/* Mode toggle */}
      <div className="bg-surface rounded-xl p-1 grid grid-cols-2 gap-1">
        {[
          { key: 'team',       label: '👥 Team',       desc: 'All serves together' },
          { key: 'individual', label: '👤 Individual',  desc: 'Per-player breakdown' },
        ].map(({ key, label, desc }) => (
          <button
            key={key}
            onClick={() => switchMode(key)}
            className={`rounded-lg py-2.5 px-3 text-sm font-semibold transition-colors flex flex-col items-center gap-0.5 ${
              mode === key ? 'bg-primary text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>{label}</span>
            <span className={`text-[10px] font-normal ${mode === key ? 'text-orange-100/70' : 'text-slate-500'}`}>{desc}</span>
          </button>
        ))}
      </div>

      {/* Team picker */}
      <div className="bg-surface rounded-xl p-4 space-y-2">
        <label className="text-xs text-slate-400 uppercase tracking-wide font-semibold block">
          Team {mode === 'team' && <span className="text-slate-600 normal-case font-normal">(optional)</span>}
        </label>
        <select
          value={teamId ?? ''}
          onChange={(e) => { setTeamId(Number(e.target.value) || null); setChecked(new Set()); }}
          className="w-full bg-slate-700 rounded-lg px-3 py-2.5 text-sm text-white border border-slate-600 focus:outline-none focus:border-primary"
        >
          <option value="">Select a team…</option>
          {(teams ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {/* Player list — individual mode only */}
      {mode === 'individual' && teamId && (
        <div className="bg-surface rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-700 flex items-center justify-between">
            <span className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Servers</span>
            <button
              onClick={() => setChecked(allOn ? new Set() : new Set(sorted.map((p) => p.id)))}
              className="text-xs text-primary font-semibold"
            >
              {allOn ? 'Deselect all' : 'Select all'}
            </button>
          </div>

          {sorted.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-slate-500">No active players on this team</p>
          )}

          {sorted.map((player) => (
            <button
              key={player.id}
              onClick={() => toggle(player.id)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors border-b border-slate-700/50 last:border-0"
            >
              <div className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border-2 transition-colors ${
                checked.has(player.id) ? 'bg-primary border-primary' : 'border-slate-600'
              }`}>
                {checked.has(player.id) && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <span className="text-sm font-mono text-slate-400 w-8 text-left">#{player.jersey_number}</span>
              <span className="font-semibold text-sm flex-1 text-left">{player.name}</span>
              <span className="text-xs text-slate-500">{player.position}</span>
            </button>
          ))}
        </div>
      )}

      {/* Start buttons */}
      {canStartTeam && (
        <button
          onClick={() => onStart({ mode: 'team', label: teamName ?? 'Team', teamId })}
          className="w-full bg-primary rounded-xl p-4 font-bold text-white text-base active:scale-[0.97] transition-transform"
        >
          Start Team Session{teamName ? ` · ${teamName}` : ''}
        </button>
      )}
      {canStartIndividual && (
        <button
          onClick={() => onStart({ mode: 'individual', players: sorted.filter((p) => checked.has(p.id)), teamId })}
          className="w-full bg-primary rounded-xl p-4 font-bold text-white text-base active:scale-[0.97] transition-transform"
        >
          Start Session · {checked.size} server{checked.size !== 1 ? 's' : ''}
        </button>
      )}

      {/* Recent Sessions */}
      {recentSessions?.length > 0 && (
        <div className="bg-surface rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-700">
            <span className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Recent Sessions</span>
          </div>
          {recentSessions.map((s) => {
            const d = s.data;
            let total, inCount;
            if (d.mode === 'team') {
              total = d.stats.total;
              inCount = d.stats.inCount;
            } else {
              total = d.players.reduce((acc, p) => acc + p.stats.total, 0);
              inCount = d.players.reduce((acc, p) => acc + p.stats.inCount, 0);
            }
            const pct = total ? Math.round(inCount / total * 100) : 0;
            return (
              <div key={s.id} className="px-4 py-2.5 border-b border-slate-700/50 last:border-0">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold truncate mr-2">{s.label}</span>
                  <span className="text-xs text-slate-500 flex-shrink-0">{fmtDateShort(s.date)}</span>
                </div>
                <div className="text-xs text-slate-400 mt-0.5">{total} serves · {pct}% in</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Team session ─────────────────────────────────────────────────────────────

function TeamSessionView({ label, teamId, initialServes = [] }) {
  const [serves,  setServes]  = useState(initialServes);
  const [history, setHistory] = useState(initialServes.map((s) => s));
  const showToast = useUiStore(selectShowToast);

  // Auto-save draft on every change
  useEffect(() => {
    setStorageItem(DRAFT_KEY, JSON.stringify({ type: 'team', label, teamId, serves }));
  }, [serves, label, teamId]);

  function record(serve) {
    setServes((s) => [...s, serve]);
    setHistory((h) => [...h, serve]);
  }

  function undo() {
    if (!history.length) return;
    setServes((s) => s.slice(0, -1));
    setHistory((h) => h.slice(0, -1));
  }

  async function handleSave() {
    await db.practice_sessions.add({
      tool_type: 'serve_tracker',
      team_id: teamId ?? null,
      date: new Date().toISOString(),
      label,
      data: { mode: 'team', label, stats },
    });
    setStorageItem(DRAFT_KEY, null);
    showToast('Session saved', 'success');
  }

  const stats = calcStats(serves);

  return (
    <div className="p-4 space-y-4">
      <div className="bg-surface rounded-xl px-4 py-2.5 flex items-center gap-2">
        <span className="text-lg">👥</span>
        <span className="font-semibold text-sm">{label}</span>
        <span className="text-xs text-slate-500 ml-1">— Team attempts</span>
      </div>

      <ZoneGrid zoneCounts={stats.zoneCounts} onZone={record} />
      <ErrorButtons netCount={stats.netCount} outCount={stats.outCount} onNet={() => record('net')} onOut={() => record('out')} />
      <StatsBar stats={stats} onUndo={undo} canUndo={history.length > 0} />
      <button
        onClick={handleSave}
        disabled={stats.total === 0}
        className="w-full bg-emerald-700 disabled:opacity-30 rounded-xl py-3 font-bold text-white text-sm active:scale-[0.97] transition-transform"
      >
        Save Session
      </button>
    </div>
  );
}

// ─── Individual session ───────────────────────────────────────────────────────

function IndividualSessionView({ players: initPlayers, teamId }) {
  const [players,   setPlayers]   = useState(() =>
    initPlayers.map((p) => ({ id: p.id, name: p.name, jersey: p.jersey_number ?? p.jersey, serves: p.serves ?? [] }))
  );
  const [activeIdx, setActiveIdx] = useState(0);
  const [history,   setHistory]   = useState([]);
  const showToast = useUiStore(selectShowToast);

  // Auto-save draft on every change
  useEffect(() => {
    setStorageItem(DRAFT_KEY, JSON.stringify({ type: 'individual', teamId, players }));
  }, [players, teamId]);

  function record(serve) {
    setPlayers((ps) => ps.map((p, i) => i === activeIdx ? { ...p, serves: [...p.serves, serve] } : p));
    setHistory((h) => [...h, { idx: activeIdx, serve }]);
  }

  function undo() {
    const last = history[history.length - 1];
    if (!last) return;
    setPlayers((ps) => ps.map((p, i) => i === last.idx ? { ...p, serves: p.serves.slice(0, -1) } : p));
    setHistory((h) => h.slice(0, -1));
  }

  async function handleSave() {
    const label = players.map((p) => `#${p.jersey} ${p.name.split(' ').pop()}`).join(', ');
    await db.practice_sessions.add({
      tool_type: 'serve_tracker',
      team_id: teamId ?? null,
      date: new Date().toISOString(),
      label,
      data: {
        mode: 'individual',
        players: players.map((p) => ({ id: p.id, name: p.name, jersey: p.jersey, stats: calcStats(p.serves) })),
      },
    });
    setStorageItem(DRAFT_KEY, null);
    showToast('Session saved', 'success');
  }

  const active = players[activeIdx];
  const stats  = calcStats(active.serves);
  const totalServes = players.reduce((s, p) => s + p.serves.length, 0);

  return (
    <div className="p-4 space-y-4">
      {/* Server tabs */}
      <div className="flex gap-2 overflow-x-auto pb-0.5 no-scrollbar">
        {players.map((p, i) => (
          <button
            key={p.id}
            onClick={() => setActiveIdx(i)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              i === activeIdx ? 'bg-primary text-white' : 'bg-surface text-slate-300 hover:bg-slate-700'
            }`}
          >
            #{p.jersey} {p.name.split(' ').pop()}
          </button>
        ))}
      </div>

      <ZoneGrid zoneCounts={stats.zoneCounts} onZone={record} />
      <ErrorButtons netCount={stats.netCount} outCount={stats.outCount} onNet={() => record('net')} onOut={() => record('out')} />
      <StatsBar stats={stats} onUndo={undo} canUndo={history.length > 0} />
      <button
        onClick={handleSave}
        disabled={totalServes === 0}
        className="w-full bg-emerald-700 disabled:opacity-30 rounded-xl py-3 font-bold text-white text-sm active:scale-[0.97] transition-transform"
      >
        Save Session
      </button>
    </div>
  );
}

// ─── Page shell ───────────────────────────────────────────────────────────────

export function ServeTrackerPage() {
  const [session, setSession] = useState(null); // null | { mode, label?, players?, teamId, initialServes? }

  function handleResume(draft) {
    if (draft.type === 'team') {
      setSession({ mode: 'team', label: draft.label, teamId: draft.teamId, initialServes: draft.serves ?? [] });
    } else {
      setSession({ mode: 'individual', players: draft.players ?? [], teamId: draft.teamId });
    }
  }

  function handleReset() {
    setSession(null);
    setStorageItem(DRAFT_KEY, null);
  }

  return (
    <div>
      <PageHeader
        title="Serve Tracker"
        backTo={session ? null : '/tools'}
        action={
          session && (
            <button onClick={handleReset} className="text-sm text-red-400 font-semibold px-2 py-1">
              Reset
            </button>
          )
        }
      />
      {!session && (
        <SetupView
          onStart={setSession}
          onResume={handleResume}
          onDiscardDraft={() => setStorageItem(DRAFT_KEY, null)}
        />
      )}
      {session?.mode === 'team' && (
        <TeamSessionView label={session.label} teamId={session.teamId} initialServes={session.initialServes ?? []} />
      )}
      {session?.mode === 'individual' && (
        <IndividualSessionView players={session.players} teamId={session.teamId} />
      )}
    </div>
  );
}
