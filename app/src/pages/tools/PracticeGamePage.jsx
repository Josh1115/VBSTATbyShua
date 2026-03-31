import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getBoolStorage, getIntStorage, setStorageItem, readDraftJson, STORAGE_KEYS } from '../../utils/storage';
import { db } from '../../db/schema';
import { PageHeader } from '../../components/layout/PageHeader';
import { useUiStore, selectShowToast } from '../../store/uiStore';
import { fmtDateShort, calcAPR } from '../../stats/formatters';
import { NFHS } from '../../constants';

const RATING_BG = {
  0: 'bg-red-600',
  1: 'bg-orange-500',
  2: 'bg-yellow-500',
  3: 'bg-emerald-500',
};

const DRAFT_KEY = 'vbstat_draft_practice_game';

function StatChip({ label, value, color = 'text-white' }) {
  return (
    <div className="text-center">
      <div className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">{label}</div>
      <div className={`text-lg font-black font-mono leading-tight ${color}`}>{value ?? '—'}</div>
    </div>
  );
}

function ActionBtn({ label, sub, onClick, color = 'bg-slate-700' }) {
  return (
    <button
      onClick={onClick}
      className={`${color} border border-white/10 text-white font-bold rounded-xl py-3.5 flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-transform`}
    >
      <span className="text-sm">{label}</span>
      {sub && <span className="text-[10px] font-normal text-white/55">{sub}</span>}
    </button>
  );
}

// ─── Setup ────────────────────────────────────────────────────────────────────

function SetupView({ onStart, onResume, onDiscardDraft }) {
  const [teamId,   setTeamId]   = useState(() => {
    const saved = getIntStorage(STORAGE_KEYS.DEFAULT_TEAM_ID);
    return !isNaN(saved) ? saved : null;
  });
  const [opponent, setOpponent] = useState('');
  const [checked,  setChecked]  = useState(new Set());
  const [draft]                 = useState(() => readDraftJson(DRAFT_KEY));

  const teams   = useLiveQuery(() => db.teams.orderBy('name').toArray(), []);
  const players = useLiveQuery(
    () => teamId ? db.players.where('team_id').equals(teamId).filter((p) => p.is_active).toArray() : [],
    [teamId]
  );
  const recentSessions = useLiveQuery(
    () => db.practice_sessions.where('tool_type').equals('practice_game').reverse().limit(10).toArray(),
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

  return (
    <div className="p-4 space-y-4">
      {/* Resume draft banner */}
      {draft && (
        <div className="bg-orange-900/40 border border-orange-700 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-orange-200">Resume unsaved game?</p>
            <p className="text-xs text-orange-300/70 mt-0.5 truncate">
              vs {draft.opponent || 'Scrimmage'} · Set {(draft.sets?.length ?? 0) + 1}
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
          {(teams ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {/* Opponent */}
      <div className="bg-surface rounded-xl p-4 space-y-2">
        <label className="text-xs text-slate-400 uppercase tracking-wide font-semibold block">
          Opponent <span className="text-slate-600 normal-case font-normal">(optional)</span>
        </label>
        <input
          type="text"
          value={opponent}
          onChange={(e) => setOpponent(e.target.value)}
          placeholder="e.g. Blue team, JV scrimmage…"
          className="w-full bg-slate-700 rounded-lg px-3 py-2.5 text-sm text-white border border-slate-600 focus:outline-none focus:border-primary placeholder-slate-500"
        />
      </div>

      {/* Player list */}
      {teamId && (
        <div className="bg-surface rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-700 flex items-center justify-between">
            <span className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Players</span>
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

      {/* Start */}
      {checked.size > 0 && (
        <button
          onClick={() => onStart({ players: sorted.filter((p) => checked.has(p.id)), teamId, opponent: opponent.trim() })}
          className="w-full bg-primary rounded-xl p-4 font-bold text-white text-base active:scale-[0.97] transition-transform"
        >
          Start Practice Game · {checked.size} player{checked.size !== 1 ? 's' : ''}
        </button>
      )}

      {/* Recent sessions */}
      {recentSessions?.length > 0 && (
        <div className="bg-surface rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-700">
            <span className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Recent Sessions</span>
          </div>
          {recentSessions.map((s) => {
            const { sets } = s.data;
            const usWins  = sets.filter((st) => st.us  > st.opp).length;
            const oppWins = sets.filter((st) => st.opp > st.us).length;
            const result  = sets.length > 0 ? `${usWins > oppWins ? 'W' : usWins < oppWins ? 'L' : 'T'} ${usWins}-${oppWins}` : null;
            const setStr  = sets.map((st) => `${st.us}-${st.opp}`).join('  ');
            return (
              <div key={s.id} className="px-4 py-2.5 border-b border-slate-700/50 last:border-0">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold truncate mr-2">{s.label}</span>
                  <span className="text-xs text-slate-500 flex-shrink-0">{fmtDateShort(s.date)}</span>
                </div>
                {sets.length > 0 && (
                  <div className="text-xs text-slate-400 mt-0.5">
                    {result && (
                      <span className={`mr-1.5 font-bold ${usWins > oppWins ? 'text-emerald-400' : usWins < oppWins ? 'text-red-400' : 'text-slate-400'}`}>
                        {result}
                      </span>
                    )}
                    {setStr}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Game screen ──────────────────────────────────────────────────────────────

function GameView({ players: initPlayers, teamId, opponent, initialState }) {
  const flipLayout = getBoolStorage(STORAGE_KEYS.FLIP_LAYOUT);

  const [players,   setPlayers]   = useState(() =>
    initialState?.players ?? initPlayers.map((p) => ({
      id: p.id, name: p.name, jersey: p.jersey_number ?? p.jersey,
      kills: 0, errors: 0, aces: 0, serveErrors: 0,
      digs: 0, blocks: 0, passes: [],
    }))
  );
  const [sets,      setSets]      = useState(initialState?.sets      ?? []);
  const [ourScore,  setOurScore]  = useState(initialState?.ourScore  ?? 0);
  const [oppScore,  setOppScore]  = useState(initialState?.oppScore  ?? 0);
  const [activeIdx, setActiveIdx] = useState(0);
  const [undoStack, setUndoStack] = useState([]);
  const showToast = useUiStore(selectShowToast);

  // Auto-save draft on every game state change
  useEffect(() => {
    setStorageItem(DRAFT_KEY, JSON.stringify({
      players, sets, ourScore, oppScore, opponent, teamId,
    }));
  }, [players, sets, ourScore, oppScore, opponent, teamId]);

  // Auto-end set when win condition is met (NFHS rules)
  useEffect(() => {
    const setNum = sets.length + 1;
    const target = setNum === 5 ? NFHS.FIFTH_SET_WIN_SCORE : NFHS.SET_WIN_SCORE;
    const maxScore = Math.max(ourScore, oppScore);
    const diff = Math.abs(ourScore - oppScore);
    if (maxScore >= target && diff >= NFHS.WIN_BY) {
      setSets((s) => [...s, { us: ourScore, opp: oppScore }]);
      setOurScore(0);
      setOppScore(0);
      setUndoStack([]);
    }
  }, [ourScore, oppScore]); // eslint-disable-line react-hooks/exhaustive-deps

  function applyAction(action) {
    if (action.side === 'us')  setOurScore((s) => s + 1);
    if (action.side === 'opp') setOppScore((s) => s + 1);
    if (action.playerIdx != null) {
      setPlayers((ps) => ps.map((p, i) => {
        if (i !== action.playerIdx) return p;
        if (action.stat === 'pass') return { ...p, passes: [...p.passes, action.passRating] };
        return { ...p, [action.stat]: p[action.stat] + 1 };
      }));
    }
    setUndoStack((h) => [...h, action]);
  }

  function undo() {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    if (last.side === 'us')  setOurScore((s) => Math.max(0, s - 1));
    if (last.side === 'opp') setOppScore((s) => Math.max(0, s - 1));
    if (last.playerIdx != null) {
      setPlayers((ps) => ps.map((p, i) => {
        if (i !== last.playerIdx) return p;
        if (last.stat === 'pass') return { ...p, passes: p.passes.slice(0, -1) };
        return { ...p, [last.stat]: Math.max(0, p[last.stat] - 1) };
      }));
    }
    setUndoStack((h) => h.slice(0, -1));
  }

  function tap(stat, side = null) {
    applyAction({ side, playerIdx: activeIdx, stat });
  }

  function tapPass(r) {
    applyAction({ side: null, playerIdx: activeIdx, stat: 'pass', passRating: r });
  }

  function endSet() {
    if (ourScore === 0 && oppScore === 0) return;
    setSets((s) => [...s, { us: ourScore, opp: oppScore }]);
    setOurScore(0);
    setOppScore(0);
    setUndoStack([]);
  }

  async function handleSave() {
    const finalSets = (ourScore > 0 || oppScore > 0) ? [...sets, { us: ourScore, opp: oppScore }] : sets;
    const oppLabel  = opponent || 'Scrimmage';
    const usWins    = finalSets.filter((s) => s.us  > s.opp).length;
    const oppWins   = finalSets.filter((s) => s.opp > s.us).length;
    const result    = finalSets.length ? ` (${usWins > oppWins ? 'W' : usWins < oppWins ? 'L' : 'T'} ${usWins}-${oppWins})` : '';
    await db.practice_sessions.add({
      tool_type: 'practice_game',
      team_id:   teamId ?? null,
      date:      new Date().toISOString(),
      label:     `vs ${oppLabel}${result}`,
      data:      { opponent: oppLabel, sets: finalSets, players },
    });
    setStorageItem(DRAFT_KEY, null);
    showToast('Session saved', 'success');
  }

  const active  = players[activeIdx];
  const apr     = calcAPR(active.passes);
  const hasData = sets.length > 0 || ourScore > 0 || oppScore > 0;

  // Scoreboard columns — respect flipLayout setting
  const usCol = (
    <div className="text-center flex-1">
      <div className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-1">Us</div>
      <div className="text-5xl font-black font-mono text-primary leading-none">{ourScore}</div>
    </div>
  );
  const oppCol = (
    <div className="text-center flex-1">
      <div className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-1 truncate">{opponent || 'Opp'}</div>
      <div className="text-5xl font-black font-mono leading-none">{oppScore}</div>
    </div>
  );

  return (
    <div className="p-4 space-y-4">
      {/* Score header */}
      <div className="bg-surface rounded-xl p-4 space-y-3">
        <div className="flex items-start">
          {flipLayout ? oppCol : usCol}
          <div className="flex flex-col items-center gap-1 px-4 pt-1 min-w-0">
            <div className="text-xs text-slate-500 font-semibold whitespace-nowrap">Set {sets.length + 1}</div>
            {sets.length > 0 && (
              <div className="text-xs text-slate-500 text-center">{sets.map((s) => `${s.us}-${s.opp}`).join('  ')}</div>
            )}
            <button
              onClick={endSet}
              disabled={ourScore === 0 && oppScore === 0}
              className="mt-1 text-xs text-slate-200 bg-slate-700 disabled:opacity-30 rounded-lg px-3 py-1 active:scale-95 transition-transform whitespace-nowrap"
            >
              End Set
            </button>
          </div>
          {flipLayout ? usCol : oppCol}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => applyAction({ side: 'us',  playerIdx: null })}
            className="bg-emerald-800/60 border border-emerald-700 text-white font-bold rounded-xl py-3 active:scale-95 transition-transform text-sm"
          >
            + Our Point
          </button>
          <button
            onClick={() => applyAction({ side: 'opp', playerIdx: null })}
            className="bg-slate-700/60 border border-slate-600 text-white font-bold rounded-xl py-3 active:scale-95 transition-transform text-sm"
          >
            + Opp Point
          </button>
        </div>
      </div>

      {/* Player tabs */}
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

      {/* Action grid */}
      <div className="bg-surface rounded-xl p-3 space-y-3">
        <div className="space-y-1.5">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold px-0.5">Attack</div>
          <div className="grid grid-cols-2 gap-2">
            <ActionBtn label="Kill"  sub="+our point"  onClick={() => tap('kills',       'us')}  color="bg-emerald-700/80" />
            <ActionBtn label="Error" sub="+opp point"  onClick={() => tap('errors',      'opp')} color="bg-red-900/70"    />
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold px-0.5">Serve</div>
          <div className="grid grid-cols-2 gap-2">
            <ActionBtn label="Ace"          sub="+our point"  onClick={() => tap('aces',       'us')}  color="bg-emerald-700/80" />
            <ActionBtn label="Serve Error"  sub="+opp point"  onClick={() => tap('serveErrors','opp')} color="bg-red-900/70"    />
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold px-0.5">Defense</div>
          <div className="grid grid-cols-2 gap-2">
            <ActionBtn label="Dig"   onClick={() => tap('digs',   null)} color="bg-slate-700" />
            <ActionBtn label="Block" sub="+our point" onClick={() => tap('blocks', 'us')} color="bg-emerald-700/80" />
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold px-0.5">Pass</div>
          <div className="grid grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((r) => (
              <button
                key={r}
                onClick={() => tapPass(r)}
                className={`${RATING_BG[r]} text-white font-black text-base rounded-lg py-3 active:scale-95 transition-transform`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Active player stats */}
      <div className="bg-surface rounded-xl px-4 py-3">
        <div className="text-xs text-slate-400 font-semibold mb-2.5">
          #{active.jersey} {active.name.split(' ').pop()}
        </div>
        <div className="grid grid-cols-4 gap-2">
          <StatChip label="Kills"  value={active.kills}        color="text-emerald-400" />
          <StatChip label="Errs"   value={active.errors}       color="text-red-400"     />
          <StatChip label="Aces"   value={active.aces}         color="text-emerald-400" />
          <StatChip label="SE"     value={active.serveErrors}  color="text-red-400"     />
          <StatChip label="Digs"   value={active.digs}   />
          <StatChip label="Blks"   value={active.blocks}       color="text-emerald-400" />
          <StatChip label="APR"    value={apr}                 color="text-primary"     />
          <StatChip label="Pass"   value={active.passes.length} />
        </div>
      </div>

      {/* Undo + Save */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={undo}
          disabled={undoStack.length === 0}
          className="bg-slate-700 disabled:opacity-30 rounded-xl py-3 font-semibold text-white text-sm active:scale-[0.97] transition-transform"
        >
          Undo
        </button>
        <button
          onClick={handleSave}
          disabled={!hasData}
          className="bg-emerald-700 disabled:opacity-30 rounded-xl py-3 font-bold text-white text-sm active:scale-[0.97] transition-transform"
        >
          Save Session
        </button>
      </div>
    </div>
  );
}

// ─── Page shell ───────────────────────────────────────────────────────────────

export function PracticeGamePage() {
  const [session, setSession] = useState(null);

  function handleResume(draft) {
    setSession({
      players: draft.players ?? [],
      teamId: draft.teamId,
      opponent: draft.opponent ?? '',
      initialState: { players: draft.players, sets: draft.sets, ourScore: draft.ourScore, oppScore: draft.oppScore },
    });
  }

  function handleReset() {
    setSession(null);
    setStorageItem(DRAFT_KEY, null);
  }

  return (
    <div>
      <PageHeader
        title="Practice Game"
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
        ? <GameView
            players={session.players}
            teamId={session.teamId}
            opponent={session.opponent}
            initialState={session.initialState}
          />
        : <SetupView
            onStart={setSession}
            onResume={handleResume}
            onDiscardDraft={() => setStorageItem(DRAFT_KEY, null)}
          />
      }
    </div>
  );
}
