import { useState, useEffect, useRef, useMemo } from 'react';
import { STORAGE_KEYS, getStorageItem, getIntStorage } from '../utils/storage';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { MATCH_STATUS } from '../constants';
import { fmtDate, fmtHitting, fmtPct } from '../stats/formatters';
import { computePlayerStats, computeTeamStats } from '../stats/engine';
import { deleteMatch } from '../stats/queries';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { NetDivider } from '../components/ui/NetDivider';
import { SwipeableMatchCard } from '../components/ui/SwipeableMatchCard';
import { VBPlayerScene } from '../components/ui/VBPlayerScene';
import { CourtWhiteboard } from '../components/match/CourtWhiteboard';

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
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [matchView, setMatchView] = useState(() => getStorageItem(STORAGE_KEYS.MATCH_VIEW_DEFAULT, 'recent'));
  const scoreDetail = getStorageItem(STORAGE_KEYS.SCORE_DETAIL, 'sets');

  // ── Schedule-edit modal state ─────────────────────────────────────────────
  const [schedOpen,      setSchedOpen]      = useState(false);
  const [editMatchId,    setEditMatchId]    = useState(null);
  const [schedOpp,       setSchedOpp]       = useState('');
  const [schedOppAbbr,   setSchedOppAbbr]   = useState('');
  const [schedDate,      setSchedDate]      = useState(() => new Date().toISOString().slice(0, 10));
  const [schedLoc,       setSchedLoc]       = useState('home');
  const [schedConf,      setSchedConf]      = useState('non-con');
  const [schedMatchType,  setSchedMatchType]  = useState('reg-season');
  const [schedTourneyName,  setSchedTourneyName]  = useState('');
  const [schedTourneyRound, setSchedTourneyRound] = useState('pool');
  const [schedPlayoffRound, setSchedPlayoffRound] = useState('');
  const [schedSaving,    setSchedSaving]    = useState(false);

  const todayDisplay = useMemo(() => {
    const d = new Date();
    const day = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    return `${day} · ${month} ${d.getDate()}`;
  }, []);

  const defaultTeamId   = useMemo(() => getIntStorage(STORAGE_KEYS.DEFAULT_TEAM_ID),   []);
  const defaultSeasonId = useMemo(() => getIntStorage(STORAGE_KEYS.DEFAULT_SEASON_ID), []);

  const recentMatches = useLiveQuery(async () => {
    let matches;
    if (matchView === 'recent') {
      if (defaultSeasonId) {
        const arr = await db.matches.where('season_id').equals(defaultSeasonId).sortBy('date');
        matches = arr.reverse().slice(0, 5);
      } else {
        matches = await db.matches.orderBy('date').reverse().limit(5).toArray();
      }
    } else {
      const now = Date.now();
      const all = defaultSeasonId
        ? await db.matches.where('season_id').equals(defaultSeasonId).toArray()
        : await db.matches.toArray();
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
  }, [matchView, defaultSeasonId]);

  const allTimeRecord = useLiveQuery(async () => {
    const all = await db.matches.where('status').equals(MATCH_STATUS.COMPLETE)
      .filter(m => m.match_type !== 'exhibition').toArray();
    const wins = all.filter((m) => (m.our_sets_won ?? 0) > (m.opp_sets_won ?? 0)).length;
    return { wins, losses: all.length - wins, total: all.length };
  }, []);

  const seasonRecord = useLiveQuery(async () => {
    if (!defaultTeamId || !defaultSeasonId) return null;
    const [team, season, allSeasonMatches] = await Promise.all([
      db.teams.get(defaultTeamId),
      db.seasons.get(defaultSeasonId),
      db.matches.where('season_id').equals(defaultSeasonId)
        .filter(m => m.match_type !== 'exhibition')
        .toArray(),
    ]);
    const matches = allSeasonMatches.filter(m => m.status === MATCH_STATUS.COMPLETE);
    if (!team || !season) return null;
    const isWin = m => (m.our_sets_won ?? 0) > (m.opp_sets_won ?? 0);
    const wins   = matches.filter(isWin).length;
    const losses = matches.length - wins;
    const homeW  = matches.filter(m => m.location === 'home'    &&  isWin(m)).length;
    const homeL  = matches.filter(m => m.location === 'home'    && !isWin(m)).length;
    const awayW  = matches.filter(m => m.location === 'away'    &&  isWin(m)).length;
    const awayL  = matches.filter(m => m.location === 'away'    && !isWin(m)).length;
    const neutW  = matches.filter(m => m.location === 'neutral' &&  isWin(m)).length;
    const neutL  = matches.filter(m => m.location === 'neutral' && !isWin(m)).length;
    const confW  = matches.filter(m => m.conference === 'conference' &&  isWin(m)).length;
    const confL  = matches.filter(m => m.conference === 'conference' && !isWin(m)).length;
    const last5  = [...matches].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
    const last5W = last5.filter(isWin).length;
    const last5L = last5.length - last5W;
    return {
      teamName:   team.name ?? team.abbreviation ?? 'Team',
      seasonName: season.name ?? String(season.year),
      wins, losses, total: matches.length,
      winPct:  matches.length ? wins / matches.length : null,
      homeW, homeL, awayW, awayL, neutW, neutL, confW, confL, last5W, last5L, last5Count: last5.length,
      hasLocData: (homeW + homeL + awayW + awayL + neutW + neutL) > 0,
      matchProgress: { completed: matches.length, total: allSeasonMatches.length },
    };
  }, [defaultTeamId, defaultSeasonId]);

  const nextMatch = useLiveQuery(async () => {
    if (!defaultSeasonId) return null;
    const all = await db.matches.where('season_id').equals(defaultSeasonId).toArray();
    const upcoming = all
      .filter(m => m.status === MATCH_STATUS.SCHEDULED || m.status === MATCH_STATUS.SETUP)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    if (!upcoming.length) return null;
    const m = upcoming[0];
    let opponentName = m.opponent_name;
    if (!opponentName && m.opponent_id) {
      const opp = await db.opponents.get(m.opponent_id);
      opponentName = opp?.name ?? null;
    }
    return { ...m, opponent_name: opponentName };
  }, [defaultSeasonId]);

  const seasonLeaders = useLiveQuery(async () => {
    if (!defaultTeamId || !defaultSeasonId) return null;
    const matches = await db.matches
      .where('season_id').equals(defaultSeasonId)
      .filter(m => m.status === MATCH_STATUS.COMPLETE && m.match_type !== 'exhibition')
      .toArray();
    if (!matches.length) return null;
    const matchIds = matches.map(m => m.id);
    const [contacts, players] = await Promise.all([
      db.contacts.where('match_id').anyOf(matchIds).toArray(),
      db.players.where('team_id').equals(defaultTeamId).toArray(),
    ]);
    const nameMap = Object.fromEntries(players.map(p => [p.id, p.name ?? `#${p.jersey_number}`]));
    const stats = computePlayerStats(contacts);
    const findLeader = (getValue) => {
      let best = null;
      for (const [id, ps] of Object.entries(stats)) {
        const val = getValue(ps);
        if (val > 0 && (!best || val > best.val)) {
          best = { name: nameMap[id] ?? '—', val, id: Number(id) };
        }
      }
      return best;
    };
    const ts = computeTeamStats(contacts);
    return {
      kills:   findLeader(ps => ps.k   ?? 0),
      aces:    findLeader(ps => ps.ace  ?? 0),
      blocks:  findLeader(ps => (ps.bs ?? 0) + (ps.ba ?? 0)),
      digs:    findLeader(ps => ps.dig  ?? 0),
      assists: findLeader(ps => ps.ast  ?? 0),
      rec:     findLeader(ps => (ps.pa ?? 0) >= 5 ? (ps.pa ?? 0) : 0),
      apr:     findLeader(ps => (ps.pa ?? 0) >= 5 ? (ps.apr ?? 0) : 0),
      teamTotals: {
        k:   ts.k,
        ace: ts.ace,
        blk: (ts.bs ?? 0) + (ts.ba ?? 0),
        dig: ts.dig,
        ast: ts.ast,
        rec: ts.pa,
        apr: ts.apr,
      },
      teamStats: {
        hit_pct: ts.hit_pct,
        si_pct:  ts.si_pct,
        ace_pct: ts.ace_pct,
      },
    };
  }, [defaultTeamId, defaultSeasonId]);

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

  const [displaySeasonRecord, setDisplaySeasonRecord] = useState({ wins: 0, losses: 0 });
  const seasonRecordAnimated = useRef(false);

  useEffect(() => {
    if (!seasonRecord) return;
    if (seasonRecordAnimated.current) {
      setDisplaySeasonRecord({ wins: seasonRecord.wins, losses: seasonRecord.losses });
      return;
    }
    seasonRecordAnimated.current = true;
    const { wins, losses } = seasonRecord;
    const steps = 20;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      const t = step / steps;
      setDisplaySeasonRecord({ wins: Math.round(wins * t), losses: Math.round(losses * t) });
      if (step >= steps) { clearInterval(timer); setDisplaySeasonRecord({ wins, losses }); }
    }, 600 / steps);
    return () => clearInterval(timer);
  }, [seasonRecord]);

  const inProgress    = recentMatches?.find((m) => m.status === MATCH_STATUS.IN_PROGRESS);
  const displayMatches = recentMatches ?? [];

  function openEditMatch(match) {
    setEditMatchId(match.id);
    setSchedOpp(match.opponent_name ?? '');
    setSchedOppAbbr(match.opponent_abbr ?? '');
    setSchedDate(match.date ? match.date.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setSchedLoc(match.location ?? 'home');
    setSchedConf(match.conference ?? 'non-con');
    setSchedMatchType(match.match_type ?? 'reg-season');
    setSchedTourneyName(match.tournament_name ?? '');
    setSchedTourneyRound(match.tournament_round ?? 'pool');
    setSchedPlayoffRound(match.playoff_round ?? '');
    setSchedOpen(true);
  }

  async function handleScheduleGame() {
    if (!schedOpp.trim()) return;
    setSchedSaving(true);
    try {
      let oppRecord = await db.opponents.where('name').equals(schedOpp.trim()).first();
      if (!oppRecord) {
        const oppId = await db.opponents.add({ name: schedOpp.trim() });
        oppRecord = { id: oppId, name: schedOpp.trim() };
      }
      const fields = {
        opponent_id:   oppRecord.id,
        opponent_name: oppRecord.name,
        opponent_abbr: schedOppAbbr.trim().toUpperCase() || null,
        date:          schedDate ? new Date(schedDate + 'T12:00:00').toISOString() : new Date().toISOString(),
        location:      schedLoc,
        conference:    schedConf,
        match_type:       schedMatchType,
        tournament_name:  schedMatchType === 'tourney' ? schedTourneyName.trim() || null : null,
        tournament_round: schedMatchType === 'tourney' ? schedTourneyRound : null,
        playoff_round:    schedMatchType === 'ihsa-playoffs' ? schedPlayoffRound.trim() || null : null,
      };
      await db.matches.update(editMatchId, fields);
      resetSchedForm();
    } finally {
      setSchedSaving(false);
    }
  }

  function resetSchedForm() {
    setEditMatchId(null);
    setSchedOpp('');
    setSchedOppAbbr('');
    setSchedDate(new Date().toISOString().slice(0, 10));
    setSchedLoc('home');
    setSchedConf('non-con');
    setSchedMatchType('reg-season');
    setSchedTourneyName('');
    setSchedTourneyRound('pool');
    setSchedPlayoffRound('');
    setSchedOpen(false);
  }

  return (
    <div>
      {/* ── Header ── */}
      <header className="sticky top-0 z-20 bg-bg border-b border-slate-800 px-4 pt-3 pb-6 text-center relative">

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
          {/* Left antenna — full-height rod with alternating red/white stripes */}
          <rect x="44" y="0"  width="3" height="57" fill="white" />
          <rect x="44" y="0"  width="3" height="4"  fill="#ef4444" />
          <rect x="44" y="8"  width="3" height="4"  fill="#ef4444" />
          <rect x="44" y="16" width="3" height="4"  fill="#ef4444" />
          <rect x="44" y="24" width="3" height="4"  fill="#ef4444" />
          <rect x="44" y="32" width="3" height="4"  fill="#ef4444" />
          <rect x="44" y="40" width="3" height="4"  fill="#ef4444" />
          <rect x="44" y="48" width="3" height="4"  fill="#ef4444" />
          {/* Right antenna */}
          <rect x="553" y="0"  width="3" height="57" fill="white" />
          <rect x="553" y="0"  width="3" height="4"  fill="#ef4444" />
          <rect x="553" y="8"  width="3" height="4"  fill="#ef4444" />
          <rect x="553" y="16" width="3" height="4"  fill="#ef4444" />
          <rect x="553" y="24" width="3" height="4"  fill="#ef4444" />
          <rect x="553" y="32" width="3" height="4"  fill="#ef4444" />
          <rect x="553" y="40" width="3" height="4"  fill="#ef4444" />
          <rect x="553" y="48" width="3" height="4"  fill="#ef4444" />
        </svg>

        <VBPlayerScene />

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

        <h1 className="tracking-wide flex flex-col items-center gap-0.5">
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
          <span className="text-slate-400 font-normal text-sm tracking-wide italic">
            powered by Shua Stat Engine
          </span>
        </h1>
        <div className="text-[12px] font-semibold tracking-[0.22em] text-slate-600 uppercase mt-1">
          Precision Sideline Analytics
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

        </div>

        {/* ── Season record card (shown when default team + season set) ── */}
        {seasonRecord && (
          <div className="bg-surface rounded-xl overflow-hidden animate-slide-up-fade card-top-glow" style={{ animationDelay: '200ms' }}>
            {/* Header */}
            <div className="px-4 py-2 border-b border-slate-700/60 text-center">
              <span
                className="text-sm font-black tracking-widest text-white uppercase"
                style={{ fontFamily: "'Orbitron', sans-serif" }}
              >
                {seasonRecord.teamName}
              </span>
              <span className="text-slate-600 mx-2">·</span>
              <span className="text-xs text-slate-400 font-semibold">{seasonRecord.seasonName}</span>
            </div>

            {/* W / L numbers */}
            <div className="grid grid-cols-2 divide-x divide-slate-700/60">
              <div className="py-5 text-center">
                <div
                  className="text-7xl font-black text-emerald-400 tabular-nums leading-none scoreboard-flicker"
                  style={{ fontFamily: "'Orbitron', sans-serif" }}
                >
                  {displaySeasonRecord.wins}
                </div>
                <div className="text-xs font-black tracking-[0.2em] text-emerald-700 mt-2">WINS</div>
              </div>
              <div className="py-5 text-center">
                <div
                  className="text-7xl font-black text-red-400 tabular-nums leading-none scoreboard-flicker"
                  style={{ fontFamily: "'Orbitron', sans-serif" }}
                >
                  {displaySeasonRecord.losses}
                </div>
                <div className="text-xs font-black tracking-[0.2em] text-red-800 mt-2">LOSSES</div>
              </div>
            </div>

            {/* Stats row */}
            <div className="px-4 py-2.5 border-t border-slate-700/60 flex items-center justify-center gap-3 flex-wrap text-xs">
              {seasonRecord.winPct !== null && (
                <>
                  <span className="font-black text-primary">
                    {Math.round(seasonRecord.winPct * 100)}% WIN
                  </span>
                  {seasonRecord.hasLocData && <span className="text-slate-700">·</span>}
                </>
              )}
              {seasonRecord.hasLocData && (
                <>
                  {(seasonRecord.homeW + seasonRecord.homeL) > 0 && (
                    <span className="text-slate-400 font-semibold">
                      {seasonRecord.homeW}–{seasonRecord.homeL} <span className="text-slate-500">HOME</span>
                    </span>
                  )}
                  {(seasonRecord.awayW + seasonRecord.awayL) > 0 && (
                    <>
                      <span className="text-slate-700">·</span>
                      <span className="text-slate-400 font-semibold">
                        {seasonRecord.awayW}–{seasonRecord.awayL} <span className="text-slate-500">AWAY</span>
                      </span>
                    </>
                  )}
                  {(seasonRecord.neutW + seasonRecord.neutL) > 0 && (
                    <>
                      <span className="text-slate-700">·</span>
                      <span className="text-slate-400 font-semibold">
                        {seasonRecord.neutW}–{seasonRecord.neutL} <span className="text-slate-500">NEUT</span>
                      </span>
                    </>
                  )}
                  {(seasonRecord.confW + seasonRecord.confL) > 0 && (
                    <>
                      <span className="text-slate-700">·</span>
                      <span className="text-slate-400 font-semibold">
                        {seasonRecord.confW}–{seasonRecord.confL} <span className="text-slate-500">CONF</span>
                      </span>
                    </>
                  )}
                  {seasonRecord.last5Count > 0 && (
                    <>
                      <span className="text-slate-700">·</span>
                      <span className="text-slate-400 font-semibold">
                        {seasonRecord.last5W}–{seasonRecord.last5L} <span className="text-slate-500">L{seasonRecord.last5Count}</span>
                      </span>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Season progress bar */}
            {seasonRecord.matchProgress.total > 0 && (
              <div className="px-4 pt-2 pb-3 border-t border-slate-700/60">
                <div className="flex justify-between text-[10px] font-bold tracking-[0.15em] text-slate-500 mb-1.5">
                  <span>SEASON PROGRESS</span>
                  <span>{seasonRecord.matchProgress.completed} / {seasonRecord.matchProgress.total}</span>
                </div>
                <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-700"
                    style={{ width: `${(seasonRecord.matchProgress.completed / seasonRecord.matchProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Quick team stats strip ── */}
        {seasonLeaders?.teamStats && (
          <div className="grid grid-cols-3 gap-2 animate-slide-up-fade" style={{ animationDelay: '220ms' }}>
            {[
              { label: 'HIT%', val: fmtHitting(seasonLeaders.teamStats.hit_pct) },
              { label: 'SRV%', val: fmtPct(seasonLeaders.teamStats.si_pct)      },
              { label: 'ACE%', val: fmtPct(seasonLeaders.teamStats.ace_pct)     },
            ].map(({ label, val }) => (
              <button
                key={label}
                onClick={() => defaultSeasonId && navigate(`/seasons/${defaultSeasonId}/team`)}
                disabled={!defaultSeasonId}
                className="bg-surface rounded-xl p-3 text-center active:scale-95 transition-transform disabled:active:scale-100"
              >
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</div>
                <div className="text-xl font-black text-primary tabular-nums mt-0.5">{val}</div>
              </button>
            ))}
          </div>
        )}

        {/* ── W–L record strip (fallback when no default season set) ── */}
        {!seasonRecord && allTimeRecord && allTimeRecord.total > 0 && (
          <div className="flex items-center gap-4 px-1 animate-slide-up-fade" style={{ animationDelay: '200ms' }}>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-400">{displayRecord.wins}W</span>
              <span className="text-xs font-black px-2 py-0.5 rounded bg-red-900/60 text-red-400">{displayRecord.losses}L</span>
            </div>
            <span className="text-xs text-slate-500">{allTimeRecord.total} match{allTimeRecord.total !== 1 ? 'es' : ''} all time</span>
          </div>
        )}

        {/* ── Season Leaders ── */}
        {(seasonRecord || seasonLeaders) && (() => {
          const LEADERS = [
            { label: 'K',   key: 'kills',   ttKey: 'k'   },
            { label: 'ACE', key: 'aces',    ttKey: 'ace' },
            { label: 'BLK', key: 'blocks',  ttKey: 'blk' },
            { label: 'DIG', key: 'digs',    ttKey: 'dig' },
            { label: 'AST', key: 'assists', ttKey: 'ast' },
            { label: 'REC', key: 'rec',     ttKey: 'rec' },
            { label: 'APR', key: 'apr',     ttKey: 'apr', fmt: v => Number(v).toFixed(2) },
          ];
          const tt = seasonLeaders?.teamTotals;
          return (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 px-0.5 animate-slide-up-fade" style={{ animationDelay: '250ms' }}>Season Leaders</p>
              <div className="grid grid-cols-7 gap-2">
                {LEADERS.map(({ label, key, fmt }, i) => {
                  const leader = seasonLeaders?.[key];
                  const canNav = leader?.id && defaultTeamId;
                  return (
                    <button
                      key={key}
                      onClick={() => canNav && navigate(`/teams/${defaultTeamId}/players/${leader.id}?season=${defaultSeasonId}`)}
                      disabled={!canNav}
                      className="bg-surface rounded-xl p-2 text-center flex flex-col items-center gap-1 animate-slide-up-fade active:scale-95 transition-transform disabled:active:scale-100"
                      style={{ animationDelay: `${260 + i * 45}ms` }}
                    >
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</span>
                      {leader ? (
                        <>
                          <span className="text-xl font-black text-primary tabular-nums leading-none">{fmt ? fmt(leader.val) : leader.val}</span>
                          <span className="text-[10px] font-semibold text-slate-300 leading-tight text-center break-words w-full">{leader.name}</span>
                        </>
                      ) : (
                        <span className="text-xl font-black text-slate-600 leading-none">—</span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 px-0.5 animate-slide-up-fade" style={{ animationDelay: `${260 + LEADERS.length * 45}ms` }}>Team Totals</p>
              <div className="grid grid-cols-7 gap-2">
                {LEADERS.map(({ label, ttKey, fmt }, i) => {
                  const teamVal = tt?.[ttKey];
                  const canNav  = !!defaultSeasonId;
                  return (
                    <button
                      key={ttKey}
                      onClick={() => canNav && navigate(`/seasons/${defaultSeasonId}/team`)}
                      disabled={!canNav}
                      className="bg-surface rounded-xl p-2 text-center flex flex-col items-center gap-1 animate-slide-up-fade active:scale-95 transition-transform disabled:active:scale-100"
                      style={{ animationDelay: `${320 + LEADERS.length * 45 + i * 45}ms` }}
                    >
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</span>
                      <span className="text-xl font-black text-slate-300 tabular-nums leading-none">
                        {teamVal != null ? (fmt ? fmt(teamVal) : teamVal) : '—'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* ── Opponents + Next Match (side by side) ── */}
        <div className="flex gap-2 animate-slide-up-fade" style={{ animationDelay: '180ms' }}>
          <button
            onClick={() => navigate('/opponents')}
            className="group flex-1 card-top-glow bg-surface rounded-xl p-3 text-left flex items-center gap-2.5 hover:bg-slate-700 active:scale-[0.97] transition-[transform,background-color] duration-75"
          >
            <span className="text-2xl inline-block transition-transform duration-75 group-active:-translate-y-1 group-active:scale-125">🔭</span>
            <div className="min-w-0">
              <div className="font-semibold text-sm">Opponents</div>
              <div className="text-[11px] text-slate-400 truncate">Scouting & history</div>
            </div>
            <span className="text-slate-500 ml-auto">›</span>
          </button>

          {nextMatch ? (
            <div className="group flex-1 card-top-glow bg-surface rounded-xl p-3 text-left flex items-center gap-2.5">
              {(() => {
                const d = nextMatch.date ? new Date(nextMatch.date) : null;
                const mon = d ? d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase() : '—';
                const day = d ? d.getDate() : '—';
                return (
                  <div
                    className="flex-shrink-0 w-9 h-9 rounded-md overflow-hidden border border-slate-600 flex flex-col cursor-pointer"
                    onClick={() => navigate(`/matches/${nextMatch.id}/setup`)}
                  >
                    <div className="bg-primary text-white text-[8px] font-black tracking-wider text-center leading-none py-0.5">{mon}</div>
                    <div className="flex-1 bg-slate-800 flex items-center justify-center text-sm font-black text-white leading-none tabular-nums">{day}</div>
                  </div>
                );
              })()}
              <div
                className="min-w-0 flex-1 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => navigate(`/matches/${nextMatch.id}/setup`)}
              >
                <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 leading-none mb-0.5">Next</div>
                <div className="font-semibold text-sm truncate">{nextMatch.opponent_name ?? 'TBD'}</div>
                <div className="flex items-center gap-1 mt-0.5">
                  {nextMatch.location && (
                    <span className={`text-[9px] font-bold px-1 py-0.5 rounded uppercase ${
                      nextMatch.location === 'home' ? 'bg-emerald-900/50 text-emerald-400' :
                      nextMatch.location === 'away' ? 'bg-red-900/50 text-red-400' :
                                                      'bg-slate-700 text-slate-400'
                    }`}>
                      {nextMatch.location === 'home' ? 'H' : nextMatch.location === 'away' ? 'A' : 'N'}
                    </span>
                  )}
                  <span className="text-[11px] text-slate-400 truncate">{fmtDate(nextMatch.date)}</span>
                </div>
              </div>
              {nextMatch.status === MATCH_STATUS.SCHEDULED ? (
                <button
                  onClick={() => openEditMatch(nextMatch)}
                  className="text-slate-400 hover:text-white px-1.5 py-1 rounded transition-colors text-base leading-none"
                  title="Edit match"
                >
                  ✎
                </button>
              ) : (
                <span className="text-slate-500">›</span>
              )}
            </div>
          ) : null}
        </div>

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

          {displayMatches.map((match, idx) => (
            <SwipeableMatchCard
              key={match.id}
              onDeleteConfirm={() => setConfirmDelete(match)}
              animDelay={`${idx * 40}ms`}
            >
              {match.status === MATCH_STATUS.SCHEDULED ? (
                <div className="w-full bg-surface rounded-xl px-4 py-3 flex items-center justify-between border-l-4 border-transparent">
                  <div>
                    <div className="font-semibold flex items-center gap-1.5 flex-wrap">
                      {match.opponent_name ?? 'vs. Unknown'}
                      {match.match_type === 'tourney' && match.tournament_name && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-900/50 text-violet-300 uppercase tracking-wide">{match.tournament_name}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {match.location && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                          match.location === 'home'    ? 'bg-emerald-900/50 text-emerald-400' :
                          match.location === 'away'    ? 'bg-red-900/50 text-red-400' :
                                                         'bg-slate-700 text-slate-400'
                        }`}>
                          {match.location === 'home' ? 'H' : match.location === 'away' ? 'A' : 'N'}
                        </span>
                      )}
                      <span className="text-xs text-slate-400">
                        {match.season ? `${match.season.name ?? match.season.year} · ` : ''}{fmtDate(match.date)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEditMatch(match)}
                      className="text-xs font-semibold px-2.5 py-1 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => navigate(`/matches/new?season=${match.season_id}&match=${match.id}`)}
                      className="text-xs font-semibold px-2.5 py-1 rounded bg-amber-900/40 text-amber-400 hover:bg-amber-900/60 transition-colors"
                    >
                      ▶ Start
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => navigate(
                    match.status === MATCH_STATUS.COMPLETE
                      ? `/matches/${match.id}/summary`
                      : `/matches/${match.id}/live`
                  )}
                  className={`w-full bg-surface p-4 text-left flex items-center justify-between hover:bg-slate-700 rounded-xl transition-colors border-l-4 ${
                    match.status === MATCH_STATUS.COMPLETE
                      ? (match.our_sets_won ?? 0) > (match.opp_sets_won ?? 0)
                        ? 'border-emerald-600'
                        : 'border-red-700'
                      : match.status === MATCH_STATUS.IN_PROGRESS
                      ? 'border-primary'
                      : 'border-transparent'
                  }`}
                >
                  <div>
                    <div className="font-semibold flex items-center gap-1.5 flex-wrap">
                      <span>
                        {match.opponent_name ?? 'vs. Unknown'}
                        {match.opponent_maxpreps_rank != null && (
                          <span className="text-slate-400 font-normal"> #{match.opponent_maxpreps_rank}</span>
                        )}
                      </span>
                      {match.match_type === 'tourney' && match.tournament_name && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-900/50 text-violet-300 uppercase tracking-wide">{match.tournament_name}</span>
                      )}
                    </div>
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
              )}
            </SwipeableMatchCard>
          ))}
        </section>

        <NetDivider />

        {/* ── Tools + Whiteboard (side by side) ── */}
        <div className="flex gap-2 animate-slide-up-fade" style={{ animationDelay: '200ms' }}>
          <button
            onClick={() => navigate('/tools')}
            className="group flex-1 card-top-glow bg-surface rounded-xl p-3 text-left flex items-center gap-2.5 hover:bg-slate-700 active:scale-[0.97] transition-[transform,background-color] duration-75"
          >
            <span className="text-2xl inline-block transition-transform duration-75 group-active:-translate-y-1 group-active:scale-125">🛠️</span>
            <div className="min-w-0">
              <div className="font-semibold text-sm">Tools</div>
              <div className="text-[11px] text-slate-400 truncate">Practice utilities</div>
            </div>
            <span className="text-slate-500 ml-auto">›</span>
          </button>

          <button
            onClick={() => setShowWhiteboard(true)}
            className="group flex-1 card-top-glow bg-surface rounded-xl p-3 text-left flex items-center gap-2.5 hover:bg-slate-700 active:scale-[0.97] transition-[transform,background-color] duration-75"
          >
            <span className="text-2xl inline-block transition-transform duration-75 group-active:-translate-y-1 group-active:scale-125">📋</span>
            <div className="min-w-0">
              <div className="font-semibold text-sm">Whiteboard</div>
              <div className="text-[11px] text-slate-400 truncate">Timeout draw & diagram</div>
            </div>
            <span className="text-slate-500 ml-auto">›</span>
          </button>
        </div>

        <div
          className="text-[11px] font-semibold tracking-[0.18em] text-slate-600 text-center pt-2 pb-1"
          style={{ fontFamily: "'Orbitron', sans-serif" }}
        >
          {todayDisplay}
        </div>
      </div>

      {showWhiteboard && (
        <CourtWhiteboard onClose={() => setShowWhiteboard(false)} />
      )}

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

      {/* ── Edit Scheduled Match Modal ── */}
      {schedOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm">
          <div className="flex min-h-full items-center justify-center p-4">
          <div className="bg-bg w-full max-w-md rounded-2xl p-6 space-y-4 shadow-2xl">
            <h2 className="text-lg font-bold">Edit Scheduled Game</h2>

            {/* Opponent */}
            <div>
              <label className="block text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wide">Opponent</label>
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={schedOpp}
                  onChange={(e) => setSchedOpp(e.target.value)}
                  placeholder="Opponent team name"
                  className="flex-1 bg-surface border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary placeholder:text-slate-600"
                  autoFocus
                />
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wide leading-none">Abbr</span>
                  <input
                    type="text"
                    value={schedOppAbbr}
                    onChange={(e) => setSchedOppAbbr(e.target.value.toUpperCase().slice(0, 3))}
                    placeholder="OPP"
                    maxLength={3}
                    className="w-[56px] bg-surface border border-slate-600 text-white rounded-lg px-2 py-2 text-sm text-center font-bold uppercase tracking-widest focus:outline-none focus:border-primary placeholder:text-slate-600"
                  />
                </div>
              </div>
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wide">Date</label>
              <input
                type="date"
                value={schedDate}
                onChange={(e) => setSchedDate(e.target.value)}
                className="w-full bg-surface border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              />
            </div>

            {/* Location */}
            <div>
              <label className="block text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wide">Location</label>
              <div className="flex gap-2">
                {['home', 'away', 'neutral'].map((loc) => (
                  <button
                    key={loc}
                    onClick={() => setSchedLoc(loc)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors
                      ${schedLoc === loc
                        ? 'bg-primary text-white border-primary'
                        : 'bg-surface text-slate-300 border-slate-600 hover:border-slate-400'
                      }`}
                  >
                    {loc.charAt(0).toUpperCase() + loc.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Conference */}
            <div>
              <label className="block text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wide">Opponent Type</label>
              <div className="flex gap-2">
                {[['conference', 'Conference'], ['non-con', 'Non-Con']].map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setSchedConf(val)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors
                      ${schedConf === val
                        ? 'bg-primary text-white border-primary'
                        : 'bg-surface text-slate-300 border-slate-600 hover:border-slate-400'
                      }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Match Type */}
            <div>
              <label className="block text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wide">Match Type</label>
              <div className="flex gap-2">
                {[['reg-season', 'Reg Season'], ['tourney', 'Tourney'], ['ihsa-playoffs', 'IHSA Playoffs'], ['exhibition', 'Exhibition']].map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setSchedMatchType(val)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors
                      ${schedMatchType === val
                        ? 'bg-primary text-white border-primary'
                        : 'bg-surface text-slate-300 border-slate-600 hover:border-slate-400'
                      }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tournament Name + Round */}
            {schedMatchType === 'tourney' && (
              <>
                <div>
                  <label className="block text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wide">
                    Tournament Name <span className="text-slate-500 normal-case font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={schedTourneyName}
                    onChange={(e) => setSchedTourneyName(e.target.value)}
                    placeholder="e.g. Holiday Classic, IHSA Sectional…"
                    className="w-full bg-surface border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary placeholder-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wide">Round</label>
                  <div className="flex gap-2">
                    {[['pool', 'Pool Play'], ['bracket', 'Bracket / Playoffs']].map(([val, label]) => (
                      <button
                        key={val}
                        onClick={() => setSchedTourneyRound(val)}
                        className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors
                          ${schedTourneyRound === val
                            ? 'bg-primary text-white border-primary'
                            : 'bg-surface text-slate-300 border-slate-600 hover:border-slate-400'
                          }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Playoff Round */}
            {schedMatchType === 'ihsa-playoffs' && (
              <div>
                <label className="block text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wide">Playoff Round</label>
                <input
                  type="text"
                  value={schedPlayoffRound}
                  onChange={(e) => setSchedPlayoffRound(e.target.value)}
                  placeholder="e.g. Regional, Sectional, Super-Sectional, State…"
                  className="w-full bg-surface border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary placeholder-slate-500"
                />
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button variant="secondary" className="flex-1" onClick={resetSchedForm}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                disabled={!schedOpp.trim() || schedSaving}
                onClick={handleScheduleGame}
              >
                {schedSaving ? 'Saving…' : 'Save Game'}
              </Button>
            </div>
          </div>
          </div>
        </div>
      )}
    </div>
  );
}
