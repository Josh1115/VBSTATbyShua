import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { MATCH_STATUS } from '../constants';
import { fmtDate } from '../stats/formatters';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { NetDivider } from '../components/ui/NetDivider';

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

export function HomePage() {
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(null);

  const recentMatches = useLiveQuery(async () => {
    const matches = await db.matches.orderBy('date').reverse().limit(5).toArray();

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

    return enriched;
  }, []);

  const allTimeRecord = useLiveQuery(async () => {
    const all = await db.matches.where('status').equals(MATCH_STATUS.COMPLETE).toArray();
    const wins = all.filter((m) => (m.our_sets_won ?? 0) > (m.opp_sets_won ?? 0)).length;
    return { wins, losses: all.length - wins, total: all.length };
  }, []);

  const [ballKey, setBallKey] = useState(0);
  const [showBall, setShowBall] = useState(false);
  const [ballType, setBallType] = useState('spike'); // 'spike' | 'floater' | 'ace' | 'freeball'
  const [netRippling, setNetRippling] = useState(false);

  const BALL_TYPES = [
    { type: 'spike',    cls: 'animate-spike-drop',   dur: 1700 },
    { type: 'floater',  cls: 'animate-floater-arc',  dur: 1900 },
    { type: 'ace',      cls: 'animate-ace-serve',    dur: 1400 },
    { type: 'freeball', cls: 'animate-freeball-arc', dur: 2600 },
  ];

  useEffect(() => {
    const trigger = () => {
      const pick = BALL_TYPES[Math.floor(Math.random() * BALL_TYPES.length)];
      setBallType(pick.type);
      setBallKey((k) => k + 1);
      setShowBall(true);
      setTimeout(() => setShowBall(false), pick.dur);
    };
    const first = setTimeout(trigger, 2500);
    const interval = setInterval(trigger, 15000);
    return () => { clearTimeout(first); clearInterval(interval); };
  }, []);

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

  const inProgress = recentMatches?.find((m) => m.status === MATCH_STATUS.IN_PROGRESS);
  const displayMatches = recentMatches ?? [];

  return (
    <div>
      <header className="sticky top-0 z-20 bg-bg border-b border-slate-800 px-4 py-3 text-center relative">
        {/* Volleyball net watermark */}
        <svg
          className={`absolute inset-0 w-full h-full pointer-events-none overflow-hidden${netRippling ? ' net-ripple' : ''}`}
          aria-hidden="true"
          viewBox="0 0 600 66"
          preserveAspectRatio="xMidYMid slice"
          style={{ opacity: 0.07 }}
        >
          <defs>
            <pattern id="vb-net-mesh" x="0" y="0" width="18" height="10" patternUnits="userSpaceOnUse">
              <path d="M 18 0 L 0 0 0 10" fill="none" stroke="white" strokeWidth="0.65" />
            </pattern>
          </defs>
          {/* Net mesh */}
          <rect x="0" y="30" width="600" height="24" fill="url(#vb-net-mesh)" className="net-wave" />
          {/* Top white tape */}
          <rect x="0" y="25" width="600" height="6" fill="white" />
          {/* Bottom tape */}
          <rect x="0" y="54" width="600" height="3" fill="white" />
          {/* Left antenna — red/white stripes above tape */}
          <rect x="44" y="6"  width="3" height="19" fill="white" />
          <rect x="44" y="6"  width="3" height="4"  fill="#ef4444" />
          <rect x="44" y="14" width="3" height="4"  fill="#ef4444" />
          {/* Right antenna */}
          <rect x="553" y="6"  width="3" height="19" fill="white" />
          <rect x="553" y="6"  width="3" height="4"  fill="#ef4444" />
          <rect x="553" y="14" width="3" height="4"  fill="#ef4444" />
        </svg>
        <div className="absolute inset-0 crt-scanlines pointer-events-none overflow-hidden" aria-hidden="true" />
        {showBall && (
          <div key={ballKey} className="absolute inset-x-0 top-0 flex justify-center pointer-events-none z-10" aria-hidden="true">
            <span className={`text-3xl inline-block ${BALL_TYPES.find(b => b.type === ballType)?.cls ?? 'animate-spike-drop'}`}>🏐</span>
          </div>
        )}
        <h1 className="tracking-wide flex items-baseline justify-center gap-3">
          <span
            className="scoreboard-flicker text-4xl md:text-5xl cursor-pointer select-none"
            style={{
              fontFamily: "'Orbitron', sans-serif",
              fontWeight: 900,
              letterSpacing: '0.12em',
              color: '#f97316',
            }}
            onClick={() => {
              const pick = BALL_TYPES[Math.floor(Math.random() * BALL_TYPES.length)];
              setBallType(pick.type);
              setBallKey((k) => k + 1);
              setShowBall(true);
              setTimeout(() => setShowBall(false), pick.dur);
              setNetRippling(true);
              setTimeout(() => setNetRippling(false), 450);
            }}
          >
            VBSTAT
          </span>
          <span className="text-slate-400 font-normal text-lg">by SHUA</span>
        </h1>
      </header>

      <div className="p-4 md:p-6 space-y-4">
        {/* Active match banner */}
        {inProgress && (
          <div className="sonar-ring card-top-glow bg-primary/20 border border-primary rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-primary font-semibold uppercase tracking-wide">Match In Progress</p>
              <p className="font-bold">{inProgress.opponent_name ?? 'Active Match'}</p>
              <div className="flex gap-3 mt-1 text-sm font-mono">
                <span>
                  Sets&nbsp;{inProgress.our_sets_won ?? 0}–{inProgress.opp_sets_won ?? 0}
                </span>
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

        {/* Quick start */}
        <div className="space-y-3">
          {/* Hero: New Match */}
          <button
            onClick={() => navigate('/matches/new')}
            className="group w-full card-top-glow bg-primary/90 hover:bg-primary rounded-xl p-5 text-left flex items-center gap-4 transition-[transform,filter,background-color] duration-75 active:scale-[0.97] active:brightness-90 animate-slide-up-fade shadow-lg"
            style={{ animationDelay: '0ms' }}
          >
            <span className="text-5xl inline-block transition-transform duration-75 group-active:-translate-y-2 group-active:scale-125">🏐</span>
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

        {/* W–L record strip */}
        {allTimeRecord && allTimeRecord.total > 0 && (
          <div className="flex items-center gap-4 px-1 animate-slide-up-fade" style={{ animationDelay: '200ms' }}>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-400">{displayRecord.wins}W</span>
              <span className="text-xs font-black px-2 py-0.5 rounded bg-red-900/60 text-red-400">{displayRecord.losses}L</span>
            </div>
            <span className="text-xs text-slate-500">{allTimeRecord.total} match{allTimeRecord.total !== 1 ? 'es' : ''} all time</span>
          </div>
        )}

        {/* Tools */}
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

        {/* Recent matches */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
              Recent Matches
              {displayMatches.length > 0 && (
                <span className="ml-1.5 text-[10px] font-bold bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded-full">{displayMatches.length}</span>
              )}
            </h2>
            {displayMatches.length > 0 && (
              <button onClick={() => navigate('/seasons')} className="text-xs text-primary hover:text-orange-300 transition-colors">
                See all →
              </button>
            )}
          </div>
          {displayMatches.length === 0 && (
            <EmptyState
              icon="🏐"
              iconClassName="animate-ball-bounce"
              title="No matches yet"
              description={
                <span>
                  Tap{' '}
                  <button
                    onClick={() => navigate('/matches/new')}
                    className="text-primary underline underline-offset-2"
                  >
                    New Match
                  </button>
                  {' '}to start tracking stats
                </span>
              }
            />
          )}
          {displayMatches.map((match, index) => (
            <div key={match.id} className="bg-surface rounded-xl mb-2 flex items-center animate-slide-in-right" style={{ animationDelay: `${index * 40}ms` }}>
              <button
                onClick={() => navigate(
                  match.status === MATCH_STATUS.COMPLETE
                    ? `/matches/${match.id}/summary`
                    : `/matches/${match.id}/live`
                )}
                className="flex-1 p-4 text-left flex items-center justify-between hover:bg-slate-700 rounded-l-xl transition-colors"
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
                    <SetPips ourSets={match.our_sets_won} oppSets={match.opp_sets_won} />
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
              <button
                onClick={() => setConfirmDelete(match)}
                className="px-4 py-4 text-slate-600 hover:text-red-400 transition-colors rounded-r-xl"
                title="Delete match"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              </button>
            </div>
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
