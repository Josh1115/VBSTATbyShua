import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { PageHeader } from '../../components/layout/PageHeader';
import { useUiStore, selectShowToast } from '../../store/uiStore';
import { fmtDateShort, calcAPR } from '../../stats/formatters';
import { getIntStorage, setStorageItem, STORAGE_KEYS } from '../../utils/storage';

const RATING_BG = {
  0: 'bg-red-600 active:brightness-75',
  1: 'bg-orange-500 active:brightness-75',
  2: 'bg-yellow-500 active:brightness-75',
  3: 'bg-emerald-500 active:brightness-75',
};

const DRAFT_KEY = 'vbstat_draft_serve_receive';

function readDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY)); } catch { return null; }
}

// ─── Setup screen ────────────────────────────────────────────────────────────

function SetupView({ onStart, onResume, onDiscardDraft }) {
  const [teamId, setTeamId]   = useState(() => {
    const saved = getIntStorage(STORAGE_KEYS.DEFAULT_TEAM_ID);
    return !isNaN(saved) ? saved : null;
  });
  const [checked, setChecked] = useState(new Set());
  const [draft]               = useState(readDraft);

  const teams   = useLiveQuery(() => db.teams.orderBy('name').toArray(), []);
  const players = useLiveQuery(
    () => teamId ? db.players.where('team_id').equals(teamId).filter((p) => p.is_active).toArray() : [],
    [teamId]
  );
  const recentSessions = useLiveQuery(
    () => db.practice_sessions.where('tool_type').equals('serve_receive').reverse().limit(10).toArray(),
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

  function toggleAll() {
    setChecked(allOn ? new Set() : new Set(sorted.map((p) => p.id)));
  }

  return (
    <div className="p-4 space-y-4">
      {/* Resume draft banner */}
      {draft && (
        <div className="bg-orange-900/40 border border-orange-700 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-orange-200">Resume unsaved session?</p>
            <p className="text-xs text-orange-300/70 mt-0.5">
              {draft.players?.length ?? 0} players · {draft.players?.reduce((s, p) => s + (p.passes?.length ?? 0), 0) ?? 0} passes
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={onDiscardDraft} className="text-xs text-slate-400 font-semibold px-2 py-1">Discard</button>
            <button onClick={() => onResume(draft)} className="text-xs bg-orange-600 text-white font-bold rounded-lg px-3 py-1.5">Resume</button>
          </div>
        </div>
      )}

      {/* Team picker */}
      <div className="bg-surface rounded-xl p-4 space-y-2">
        <label className="text-xs text-slate-400 uppercase tracking-wide font-semibold block">Team</label>
        <select
          value={teamId ?? ''}
          onChange={(e) => { setTeamId(Number(e.target.value) || null); setChecked(new Set()); }}
          className="w-full bg-slate-700 rounded-lg px-3 py-2.5 text-sm text-white border border-slate-600 focus:outline-none focus:border-primary"
        >
          <option value="">Select a team…</option>
          {(teams ?? []).map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {/* Player list */}
      {teamId && (
        <div className="bg-surface rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-700 flex items-center justify-between">
            <span className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Players</span>
            <button onClick={toggleAll} className="text-xs text-primary font-semibold">
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

      {/* Start */}
      {checked.size > 0 && (
        <button
          onClick={() => onStart({ players: sorted.filter((p) => checked.has(p.id)), teamId })}
          className="w-full bg-primary rounded-xl p-4 font-bold text-white text-base active:scale-[0.97] transition-transform"
        >
          Start Session · {checked.size} player{checked.size !== 1 ? 's' : ''}
        </button>
      )}

      {/* Recent Sessions */}
      {recentSessions?.length > 0 && (
        <div className="bg-surface rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-700">
            <span className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Recent Sessions</span>
          </div>
          {recentSessions.map((s) => (
            <div key={s.id} className="px-4 py-2.5 border-b border-slate-700/50 last:border-0">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold truncate mr-2">{s.label}</span>
                <span className="text-xs text-slate-500 flex-shrink-0">{fmtDateShort(s.date)}</span>
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {s.data.overallAPR} APR · {s.data.totalPasses} passes
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Active session screen ───────────────────────────────────────────────────

function SessionView({ players: initPlayers, teamId }) {
  const [players, setPlayers] = useState(() =>
    initPlayers.map((p) => ({
      id: p.id,
      name: p.name,
      jersey: p.jersey_number ?? p.jersey,
      passes: p.passes ?? [],
    }))
  );
  const [history, setHistory] = useState([]);
  const showToast = useUiStore(selectShowToast);

  // Auto-save draft on every change
  useEffect(() => {
    setStorageItem(DRAFT_KEY, JSON.stringify({ players, teamId }));
  }, [players, teamId]);

  function record(playerId, rating) {
    setPlayers((ps) => ps.map((p) => p.id === playerId ? { ...p, passes: [...p.passes, rating] } : p));
    setHistory((h) => [...h, { playerId, rating }]);
  }

  function undo() {
    const last = history[history.length - 1];
    if (!last) return;
    setPlayers((ps) => ps.map((p) => p.id === last.playerId ? { ...p, passes: p.passes.slice(0, -1) } : p));
    setHistory((h) => h.slice(0, -1));
  }

  async function handleSave() {
    const label = players.map((p) => `#${p.jersey} ${p.name.split(' ').pop()}`).join(', ');
    await db.practice_sessions.add({
      tool_type: 'serve_receive',
      team_id: teamId ?? null,
      date: new Date().toISOString(),
      label,
      data: {
        players: players.map((p) => ({ ...p, apr: calcAPR(p.passes) })),
        overallAPR,
        totalPasses,
      },
    });
    setStorageItem(DRAFT_KEY, null);
    showToast('Session saved', 'success');
  }

  const totalPasses = players.reduce((s, p) => s + p.passes.length, 0);
  const totalSum    = players.reduce((s, p) => s + p.passes.reduce((a, b) => a + b, 0), 0);
  const overallAPR  = totalPasses ? (totalSum / totalPasses).toFixed(2) : '—';

  return (
    <div className="p-4 space-y-4">
      {/* Overall banner */}
      <div className="bg-surface rounded-xl px-4 py-3 flex items-center gap-4">
        <div className="flex-1">
          <div className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">Overall APR</div>
          <div className="text-3xl font-black font-mono text-primary leading-none mt-0.5">{overallAPR}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">Passes</div>
          <div className="text-3xl font-black font-mono leading-none mt-0.5">{totalPasses}</div>
        </div>
        <button
          onClick={undo}
          disabled={!history.length}
          className="bg-slate-700 disabled:opacity-30 rounded-lg px-4 py-2 text-sm font-semibold active:scale-95 transition-transform"
        >
          Undo
        </button>
      </div>

      {/* Player cards */}
      <div className="grid grid-cols-2 gap-3">
        {players.map((player) => {
          const apr = calcAPR(player.passes);
          return (
            <div key={player.id} className="bg-surface rounded-xl p-3 space-y-2">
              <div className="flex items-baseline justify-between">
                <div className="min-w-0">
                  <span className="text-xs text-slate-400 font-mono mr-1">#{player.jersey}</span>
                  <span className="font-semibold text-sm">{player.name.split(' ').pop()}</span>
                </div>
                <div className="text-right flex-shrink-0 ml-1">
                  <span className="text-lg font-black font-mono text-primary">{apr != null ? apr.toFixed(2) : '—'}</span>
                  <span className="text-[10px] text-slate-500 ml-0.5">/{player.passes.length}</span>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {[0, 1, 2, 3].map((r) => (
                  <button
                    key={r}
                    onClick={() => record(player.id, r)}
                    className={`${RATING_BG[r]} text-white font-black text-base rounded-lg py-2.5 active:scale-95 transition-transform`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={handleSave}
        disabled={totalPasses === 0}
        className="w-full bg-emerald-700 disabled:opacity-30 rounded-xl py-3 font-bold text-white text-sm active:scale-[0.97] transition-transform"
      >
        Save Session
      </button>
    </div>
  );
}

// ─── Page shell ──────────────────────────────────────────────────────────────

export function ServeReceivePage() {
  const [session, setSession] = useState(null); // null | { players, teamId }

  function handleResume(draft) {
    setSession({ players: draft.players ?? [], teamId: draft.teamId });
  }

  function handleReset() {
    setSession(null);
    setStorageItem(DRAFT_KEY, null);
  }

  return (
    <div>
      <PageHeader
        title="Serve Receive"
        backTo={session ? null : '/tools'}
        action={
          session && (
            <button onClick={handleReset} className="text-sm text-red-400 font-semibold px-2 py-1">
              Reset
            </button>
          )
        }
      />
      {session
        ? <SessionView players={session.players} teamId={session.teamId} />
        : <SetupView onStart={setSession} onResume={handleResume} onDiscardDraft={() => setStorageItem(DRAFT_KEY, null)} />
      }
    </div>
  );
}
