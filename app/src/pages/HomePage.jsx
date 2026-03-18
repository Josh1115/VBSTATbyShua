import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { MATCH_STATUS } from '../constants';
import { fmtDate } from '../stats/formatters';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { NetDivider } from '../components/ui/NetDivider';
import { SwipeableMatchCard } from '../components/ui/SwipeableMatchCard';

// ─── Constants ────────────────────────────────────────────────────────────────

const BALL_TYPES = [
  { type: 'spike',    cls: 'animate-spike-drop',   dur: 1700 },
  { type: 'floater',  cls: 'animate-floater-arc',  dur: 1900 },
  { type: 'ace',      cls: 'animate-ace-serve',    dur: 1400 },
  { type: 'freeball', cls: 'animate-freeball-arc', dur: 2600 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtSetScores(sets) {
  return sets.map((s) => `${s.our_score ?? 0}-${s.opp_score ?? 0}`).join(' · ');
}

async function deleteMatch(matchId) {
  const sets = await db.sets.where('match_id').equals(matchId).toArray();
  const setIds = sets.map((s) => s.id);
  await Promise.all([
    db.contacts.where('match_id').equals(matchId).delete(),
    db.rallies.where('set_id').anyOf(setIds).delete(),
    db.lineups.where('set_id').anyOf(setIds).delete(),
    db.substitutions.where('set_id').anyOf(setIds).delete(),
  ]);
  await db.sets.where('match_id').equals(matchId).delete();
  await db.matches.delete(matchId);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SetPips({ ourSets, oppSets }) {
  const our = ourSets ?? 0;
  const opp = oppSets ?? 0;
  if (our + opp === 0) return <span className="text-xs text-slate-500 font-mono">–</span>;
  return (
    <div className="flex gap-1 items-center">
      {Array.from({ length: our }).map((_, i) => (
        <span key={`o${i}`} className="w-2.5 h-2.5 rounded-full bg-primary" />
      ))}
      {Array.from({ length: opp }).map((_, i) => (
        <span key={`t${i}`} className="w-2.5 h-2.5 rounded-full bg-slate-600" />
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function HomePage() {
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [matchView, setMatchView] = useState(() => localStorage.getItem('vbstat_match_view_default') ?? 'recent');
  const [scoreDetail] = useState(() => localStorage.getItem('vbstat_score_detail') ?? 'sets');

  const todayDisplay = useMemo(() => {
    const d = new Date();
    const day = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    return `${day} · ${month} ${d.getDate()}`;
  }, []);

  const recentMatches = useLiveQuery(async () => {
    let matches;
    if (matchView === 'recent') {
      matches = await db.matches.orderBy('date').reverse().limit(5).toArray();
    } else {
      const now = Date.now();
      const all = await db.matches.toArray();
      matches = all
        .sort((a, b) => Math.abs(new Date(a.date) - now) - Math.abs(new Date(b.date) - now))
        .slice(0, 5)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    const seasonIds = [...new Set(matches.map((m) => m.season_id).filter(Boolean))];
    const seasons = seasonIds.length ? await db.seasons.bulkGet(seasonIds) : [];
    const seasonMap = Object.fromEntries(seasons.filter(Boolean).map((s) => [s.id, s]));

    const needLookup = matches.filter((m) => !m.opponent_name && m.opponent_id);
    const oppIds = [...new Set(needLookup.map((m) => m.opponent_id))];
    const opps = oppIds.length ? await db.opponents.bulkGet(oppIds) : [];
    const oppMap = Object.fromEntries(opps.filter(Boolean).map((o) => [o.id, o.name]));

    const enriched = matches.map((m) => ({
      ...m,
      season: seasonMap[m.season_id],
      opponent_name: m.opponent_name ?? oppMap[m.opponent_id] ?? null,
    }));

    const active = enriched.find((m) => m.status === MATCH_STATUS.IN_PROGRESS);
    if (active) {
      const currentSet = await db.sets
        .where('match_id').equals(active.id)
        .filter((s) => s.status === 'in_progress')
        .first();
      active.currentSet = currentSet ?? null;
    }

    const completeIds = enriched.filter((m) => m.status === MATCH_STATUS.COMPLETE).map((m) => m.id);
    if (completeIds.length) {
      const allSets = await db.sets.where('match_id').anyOf(completeIds).sortBy('set_number');
      const setsById = {};
      for (const s of allSets) { (setsById[s.match_id] ??= []).push(s); }
      enriched.forEach((m) => { m.sets = setsById[m.id] ?? []; });
    }

    return enriched;
  }, [matchView]);

  const allTimeRecord = useLiveQuery(async () => {
    const all = await db.matches.where('status').equals(MATCH_STATUS.COMPLETE).toArray();
    const wins = all.filter((m) => (m.our_sets_won ?? 0) > (m.opp_sets_won ?? 0)).length;
    return { wins, losses: all.length - wins, total: all.length };
  }, []);

  // ── Multi-ball system ──────────────────────────────────────────────────────
  const [balls,       setBalls]       = useState([]); // [{ id, type, left }]
  const [netRippling, setNetRippling] = useState(false);

  function fireBall(typeStr, leftPct) {
    const pick = typeStr
      ? (BALL_TYPES.find((b) => b.type === typeStr) ?? BALL_TYPES[0])
      : BALL_TYPES[Math.floor(Math.random() * BALL_TYPES.length)];
    const id   = performance.now() + Math.random();
    const left = leftPct ?? (20 + Math.random() * 60);
    setBalls((prev) => [...prev, { id, type: pick.type, left }]);
    setTimeout(() => setBalls((prev) => prev.filter((b) => b.id !== id)), pick.dur);
  }

  function fireBurst() {
    const positions = [12, 28, 50, 68, 84];
    const shuffled  = [...BALL_TYPES].sort(() => Math.random() - 0.5);
    const count     = 4 + Math.floor(Math.random() * 2); // 4 or 5 balls
    positions.slice(0, count).forEach((pos, i) => {
      setTimeout(() => fireBall(shuffled[i % shuffled.length].type, pos), i * 130);
    });
    setNetRippling(true);
    setTimeout(() => setNetRippling(false), 800);
  }

  // Auto-fire a single ball periodically
  useEffect(() => {
    const trigger = () => fireBall(null, 50);
    const first   = setTimeout(trigger, 2500);
    const interval = setInterval(trigger, 15000);
    return () => { clearTimeout(first); clearInterval(interval); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Long-press logo for burst ─────────────────────────────────────────────
  const longPressTimer = useRef(null);
  const isLongPress    = useRef(false);

  function handleLogoPointerDown() {
    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      fireBurst();
    }, 500);
  }

  function handleLogoPointerUp() {
    clearTimeout(longPressTimer.current);
  }

  function handleLogoClick() {
    if (isLongPress.current) return; // already handled by long-press
    fireBall(null, 50);
    setNetRippling(true);
    setTimeout(() => setNetRippling(false), 450);
  }

  // ── W–L count-up on load ──────────────────────────────────────────────────
  const [displayRecord, setDisplayRecord] = useState({ wins: 0, losses: 0 });
  const recordAnimated = useRef(false);

  useEffect(() => {
    if (!allTimeRecord || allTimeRecord.total === 0) return;
    if (recordAnimated.current) {
      setDisplayRecord({ wins: allTimeRecord.wins, losses: allTimeRecord.losses });
      return;
    }
    recordAnimated.current = true;
    const { wins, losses } = allTimeRecord;
    const steps = 20;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      const t = step / steps;
      setDisplayRecord({ wins: Math.round(wins * t), losses: Math.round(losses * t) });
      if (step >= steps) { clearInterval(timer); setDisplayRecord({ wins, losses }); }
    }, 600 / steps);
    return () => clearInterval(timer);
  }, [allTimeRecord]);

  const inProgress    = recentMatches?.find((m) => m.status === MATCH_STATUS.IN_PROGRESS);
  const displayMatches = recentMatches ?? [];

  return (
    <div>
      {/* ── Header ── */}
      <header className="sticky top-0 z-20 bg-bg border-b border-slate-800 px-4 py-3 text-center relative">

        {/* Volleyball net watermark (mesh sways via .net-wave CSS) */}
        <svg
          className={`absolute inset-0 w-full h-full pointer-events-none overflow-hidden${netRippling ? ' net-ripple' : ''}`}
          aria-hidden="true"
          viewBox="0 0 600 66"
          preserveAspectRatio="xMidYMid slice"
          style={{ opacity: 0.18 }}
        >
          <defs>
            <pattern id="vb-net-mesh" x="0" y="0" width="18" height="10" patternUnits="userSpaceOnUse">
              <path d="M 18 0 L 0 0 0 10" fill="none" stroke="white" strokeWidth="0.65" />
            </pattern>
          </defs>
          <rect x="0" y="30" width="600" height="24" fill="url(#vb-net-mesh)" className="net-wave" />
          <rect x="0" y="25" width="600" height="6" fill="white" />
          <rect x="0" y="54" width="600" height="3" fill="white" />
          <rect x="44"  y="6"  width="3" height="19" fill="white" />
          <rect x="44"  y="6"  width="3" height="4"  fill="#ef4444" />
          <rect x="44"  y="14" width="3" height="4"  fill="#ef4444" />
          <rect x="553" y="6"  width="3" height="19" fill="white" />
          <rect x="553" y="6"  width="3" height="4"  fill="#ef4444" />
          <rect x="553" y="14" width="3" height="4"  fill="#ef4444" />
        </svg>

        <div className="absolute inset-0 crt-scanlines pointer-events-none overflow-hidden" aria-hidden="true" />

        {/* Flying balls (supports multiple simultaneous) */}
        {balls.map((ball) => (
          <div
            key={ball.id}
            className="absolute top-0 pointer-events-none z-10"
            style={{ left: `${ball.left}%` }}
            aria-hidden="true"
          >
            <span className={`text-3xl inline-block ${BALL_TYPES.find((b) => b.type === ball.type)?.cls ?? 'animate-spike-drop'}`}>
              🏐
            </span>
          </div>
        ))}

        <h1 className="tracking-wide flex items-baseline justify-center gap-3">
          <span
            className="scoreboard-flicker text-4xl md:text-5xl cursor-pointer select-none"
            style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 900, letterSpacing: '0.12em', color: '#f97316' }}
            onClick={handleLogoClick}
            onPointerDown={handleLogoPointerDown}
            onPointerUp={handleLogoPointerUp}
            onPointerLeave={handleLogoPointerUp}
          >
            VBSTAT
          </span>
          <span className="text-slate-400 font-normal text-lg">
            by {localStorage.getItem('vbstat_coach_name') || 'SHUA'}
          </span>
        </h1>
        <div
          className="text-[11px] font-semibold tracking-[0.18em] text-slate-500 mt-0.5"
          style={{ fontFamily: "'Orbitron', sans-serif" }}
        >
          {todayDisplay}
        </div>
      </header>

      <div className="p-4 md:p-6 space-y-4">

        {/* ── Active match banner ── */}
        {inProgress && (
          <div className="sonar-ring card-top-glow bg-primary/20 border border-primary rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-primary font-semibold uppercase tracking-wide">Match In Progress</p>
              <p className="font-bold">{inProgress.opponent_name ?? 'Active Match'}</p>
              <div className="flex gap-3 mt-1 text-sm font-mono">
                <span>Sets&nbsp;{inProgress.our_sets_won ?? 0}–{inProgress.opp_sets_won ?? 0}</span>
                <span className="text-slate-400">·</span>
                <span>
                  Set&nbsp;{(inProgress.our_sets_won ?? 0) + (inProgress.opp_sets_won ?? 0) + 1}&nbsp;
                  {inProgress.currentSet?.our_score ?? 0}–{inProgress.currentSet?.opp_score ?? 0}
                </span>
              </div>
            </div>
            <button
              onClick={() => navigate(`/matches/${inProgress.id}/live`)}
              className="bg-primary text-white font-bold px-5 py-2.5 rounded-lg text-sm active:scale-95 transition-transform"
            >
              Resume
            </button>
          </div>
        )}

        {/* ── Quick start ── */}
        <div className="space-y-3">
          {/* Hero: New Match — shimmer sweep + ball spin on hover */}
          <button
            onClick={() => navigate('/matches/new')}
            className="group w-full card-top-glow btn-shimmer bg-primary/90 hover:bg-primary rounded-xl p-5 text-left flex items-center gap-4 transition-[transform,filter,background-color] duration-75 active:scale-[0.97] active:brightness-90 animate-slide-up-fade shadow-lg"
            style={{ animationDelay: '0ms' }}
          >
            <span className="text-5xl inline-block vb-ball-spin">🏐</span>
            <div>
              <div className="font-bold text-lg text-white">New Match</div>
              <div className="text-sm text-orange-100/80">Start recording stats</div>
            </div>
          </button>

          {/* Secondary: Seasons + Teams */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => navigate('/seasons')}
              className="group card-top-glow bg-surface rounded-xl p-4 text-left hover:bg-slate-700 hover:brightness-110 transition-[transform,filter,background-color] duration-75 active:scale-[0.97] active:brightness-90 animate-slide-up-fade"
              style={{ animationDelay: '80ms' }}
            >
              <span className="text-3xl mb-2 inline-block transition-transform duration-75 group-active:-translate-y-1.5 group-active:scale-125">📅</span>
              <div className="font-semibold text-sm">Seasons</div>
              <div className="text-xs text-slate-400">Browse by season</div>
            </button>
            <button
              onClick={() => navigate('/teams')}
              className="group card-top-glow bg-surface rounded-xl p-4 text-left hover:bg-slate-700 hover:brightness-110 transition-[transform,filter,background-color] duration-75 active:scale-[0.97] active:brightness-90 animate-slide-up-fade"
              style={{ animationDelay: '160ms' }}
            >
              <span className="text-3xl mb-2 inline-block transition-transform duration-75 group-active:-translate-y-1.5 group-active:scale-125">👥</span>
              <div className="font-semibold text-sm">Teams</div>
              <div className="text-xs text-slate-400">Rosters</div>
            </button>
          </div>
        </div>

        {/* ── W–L record strip ── */}
        {allTimeRecord && allTimeRecord.total > 0 && (
          <div className="flex items-center gap-4 px-1 animate-slide-up-fade" style={{ animationDelay: '200ms' }}>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-400">{displayRecord.wins}W</span>
              <span className="text-xs font-black px-2 py-0.5 rounded bg-red-900/60 text-red-400">{displayRecord.losses}L</span>
            </div>
            <span className="text-xs text-slate-500">{allTimeRecord.total} match{allTimeRecord.total !== 1 ? 'es' : ''} all time</span>
          </div>
        )}

        {/* ── Tools ── */}
        <button
          onClick={() => navigate('/tools')}
          className="group w-full card-top-glow bg-surface rounded-xl p-4 text-left flex items-center gap-4 hover:bg-slate-700 active:scale-[0.97] transition-[transform,background-color] duration-75 animate-slide-up-fade"
          style={{ animationDelay: '200ms' }}
        >
          <span className="text-3xl inline-block transition-transform duration-75 group-active:-translate-y-1.5 group-active:scale-125">🛠️</span>
          <div className="flex-1">
            <div className="font-semibold text-sm">Tools</div>
            <div className="text-xs text-slate-400">Practice utilities for coaches</div>
          </div>
          <span className="text-slate-500 text-lg">›</span>
        </button>

        <NetDivider />

        {/* ── Recent matches ── */}
        <section className="relative">
          {/* Volleyball court top-down watermark */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 360 200"
            preserveAspectRatio="xMidYMid slice"
            style={{ opacity: 0.04 }}
            aria-hidden="true"
          >
            {/* Court boundary */}
            <rect x="6" y="6" width="348" height="188" fill="none" stroke="white" strokeWidth="2" rx="1" />
            {/* Net — center vertical line */}
            <line x1="180" y1="6"   x2="180" y2="194" stroke="white" strokeWidth="3" />
            {/* Attack lines */}
            <line x1="120" y1="6"   x2="120" y2="194" stroke="white" strokeWidth="1" />
            <line x1="240" y1="6"   x2="240" y2="194" stroke="white" strokeWidth="1" />
            {/* Antenna dots at net top & bottom */}
            <circle cx="180" cy="6"   r="3" fill="white" />
            <circle cx="180" cy="194" r="3" fill="white" />
            {/* Service zone center dashes */}
            <line x1="6"   y1="100" x2="120" y2="100" stroke="white" strokeWidth="0.8" strokeDasharray="10 6" />
            <line x1="240" y1="100" x2="354" y2="100" stroke="white" strokeWidth="0.8" strokeDasharray="10 6" />
          </svg>

          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
              {matchView === 'recent' ? 'Recent' : 'Closest'} Matches
              {displayMatches.length > 0 && (
                <span className="ml-1.5 text-[10px] font-bold bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded-full">{displayMatches.length}</span>
              )}
            </h2>
            <div className="flex items-center gap-2">
              <div className="flex bg-slate-800 rounded-lg p-0.5">
                <button
                  onClick={() => setMatchView('recent')}
                  className={`text-[10px] font-semibold px-2 py-1 rounded-md transition-colors ${matchView === 'recent' ? 'bg-slate-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  Recent
                </button>
                <button
                  onClick={() => setMatchView('closest')}
                  className={`text-[10px] font-semibold px-2 py-1 rounded-md transition-colors ${matchView === 'closest' ? 'bg-slate-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  Closest
                </button>
              </div>
              {displayMatches.length > 0 && (
                <button onClick={() => navigate('/seasons')} className="text-xs text-primary hover:text-orange-300 transition-colors">
                  See all →
                </button>
              )}
            </div>
          </div>

          {displayMatches.length === 0 && (
            <EmptyState
              icon="🏐"
              iconClassName="animate-ball-bounce"
              title="No matches yet"
              description={
                <span>
                  Tap{' '}
                  <button onClick={() => navigate('/matches/new')} className="text-primary underline underline-offset-2">
                    New Match
                  </button>
                  {' '}to start tracking stats
                </span>
              }
            />
          )}

          {displayMatches.map((match, index) => (
            <SwipeableMatchCard
              key={match.id}
              onDeleteConfirm={() => setConfirmDelete(match)}
              animDelay={`${index * 40}ms`}
            >
              <button
                onClick={() => navigate(
                  match.status === MATCH_STATUS.COMPLETE
                    ? `/matches/${match.id}/summary`
                    : `/matches/${match.id}/live`
                )}
                className="w-full bg-surface p-4 text-left flex items-center justify-between hover:bg-slate-700 rounded-xl transition-colors"
              >
                  <div>
                    <div className="font-semibold">{match.opponent_name ?? 'vs. Unknown'}</div>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {match.location && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                          match.location === 'home'    ? 'bg-emerald-900/50 text-emerald-400' :
                          match.location === 'away'    ? 'bg-red-900/50 text-red-400' :
                                                         'bg-slate-700 text-slate-400'
                        }`}>
                          {match.location === 'home' ? 'H' : match.location === 'away' ? 'A' : 'N'}
                        </span>
                      )}
                      {match.conference && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                          match.conference === 'conference' ? 'bg-blue-900/50 text-blue-400' : 'bg-slate-700 text-slate-400'
                        }`}>
                          {match.conference === 'conference' ? 'CON' : 'NC'}
                        </span>
                      )}
                      <span className="text-xs text-slate-400">
                        {match.season ? `${match.season.name ?? match.season.year} · ` : ''}{fmtDate(match.date)}
                      </span>
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1.5">
                      {match.status === MATCH_STATUS.COMPLETE && (() => {
                        const won = (match.our_sets_won ?? 0) > (match.opp_sets_won ?? 0);
                        return (
                          <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${won ? 'bg-emerald-900/60 text-emerald-400' : 'bg-red-900/60 text-red-400'}`}>
                            {won ? 'W' : 'L'}
                          </span>
                        );
                      })()}
                      {scoreDetail === 'scores' && match.sets?.length
                        ? <span className="text-xs font-mono text-slate-300">{fmtSetScores(match.sets)}</span>
                        : <SetPips ourSets={match.our_sets_won} oppSets={match.opp_sets_won} />
                      }
                    </div>
                    <div className={`text-xs flex items-center gap-1 ${match.status === MATCH_STATUS.IN_PROGRESS ? 'text-primary' : 'text-slate-400'}`}>
                      {match.status === MATCH_STATUS.IN_PROGRESS && (
                        <span className="serve-pulse inline-block w-1.5 h-1.5 rounded-full bg-primary" />
                      )}
                      {match.status === MATCH_STATUS.IN_PROGRESS ? 'Live'
                        : match.status === MATCH_STATUS.COMPLETE ? 'Final'
                        : 'Setup'}
                    </div>
                  </div>
              </button>
            </SwipeableMatchCard>
          ))}
        </section>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete Match?"
          message={`Delete match vs. ${confirmDelete.opponent_name ?? 'Unknown'}? This will permanently remove all sets, contacts, and stats for this match.`}
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            await deleteMatch(confirmDelete.id);
            setConfirmDelete(null);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
