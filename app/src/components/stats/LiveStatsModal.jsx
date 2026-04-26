import { memo, useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useShallow } from 'zustand/react/shallow';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMatchStore } from '../../store/matchStore';
import { useMatchStats } from '../../hooks/useMatchStats';
import { db } from '../../db/schema';
import { computeTeamStats, computeOppDisplayStats, computeRotationStats, computeRotationContactStats, computeISvsOOS, computeFreeDigWin, computeTransitionAttack, computePlayerStats, computeXKByPassRating, computePointQuality, computeServingPoints } from '../../stats/engine';
import { StatTable } from './StatTable';
import { PointQualityPanel } from './PointQualityPanel';
import { fmtCount, fmtPct, fmtHitting, fmtPassRating, fmtVER } from '../../stats/formatters';
import { SERVING_COLS as _SERVING_COLS } from '../../stats/columns';
import { VERBadge } from './VERBadge';
import { SetScoresStrip } from './panels/SetScoresStrip';
import { BoxSparkline } from './panels/BoxSparkline';
import { TeamStatsTable } from './panels/TeamStatsTable';
import { RotationTable } from './panels/RotationTable';
import { ISvsOOSTable, EMPTY_ISVSOOS, EMPTY_FREEDIG, EMPTY_TRANSATK } from './panels/ISvsOOSTable';
import { ServeZoneStatsPanel } from './panels/ServeZoneStatsPanel';
import { OffenseBalanceChart } from './panels/OffenseBalanceChart';
import { RecordsProgressPanel } from './panels/RecordsProgressPanel';

const TABS = ['POINTS', 'SERVING', 'PASSING', 'ATTACKING', 'BLOCKING', 'DEFENSE', 'VER', 'RECORDS'];

const SERVE_VIEWS = ['ALL', 'FLOAT', 'TOP'];

// Live modal shows per-match serving data — strip season-only SP/MP/se_foot cols.
const _liveKeys = new Set(['sp', 'mp', 'se_foot']);
const _live = (cols) => cols.filter((c) => !_liveKeys.has(c.key));
const SERVING_COLS = {
  ALL:   _live(_SERVING_COLS.all),
  FLOAT: _live(_SERVING_COLS.float),
  TOP:   _live(_SERVING_COLS.top),
};

const COLUMNS = {
  PASSING: [
    { key: 'name',   label: 'Player' },
    { key: 'pa',     label: 'REC', fmt: fmtCount },
    { key: 'p0',     label: 'P0',  fmt: fmtCount },
    { key: 'p1',     label: 'P1',  fmt: fmtCount },
    { key: 'p2',     label: 'P2',  fmt: fmtCount },
    { key: 'p3',     label: 'P3',  fmt: fmtCount },
    { key: 'apr',    label: 'APR', fmt: fmtPassRating },
    { key: 'pp_pct', label: '3OPT%', fmt: fmtPct },
  ],
  ATTACKING: [
    { key: 'name',    label: 'Player' },
    { key: 'ta',      label: 'TA',   fmt: fmtCount },
    { key: 'k',       label: 'K',    fmt: fmtCount },
    { key: 'ae',      label: 'AE',   fmt: fmtCount },
    { key: 'hit_pct', label: 'HIT%', fmt: fmtHitting },
    { key: 'k_pct',   label: 'K%',   fmt: fmtPct },
  ],
  BLOCKING: [
    { key: 'name', label: 'Player' },
    { key: 'bs',   label: 'BS',  fmt: fmtCount },
    { key: 'ba',   label: 'BA',  fmt: fmtCount },
    { key: 'be',   label: 'BE',  fmt: fmtCount },
    { key: 'bps',  label: 'BPS', fmt: fmtPassRating },
  ],
  DEFENSE: [
    { key: 'name',   label: 'Player' },
    { key: 'dig',    label: 'DIG',  fmt: fmtCount },
    { key: 'fb_dig', label: 'FB',   fmt: fmtCount },
    { key: 'de',     label: 'DE',   fmt: fmtCount },
    { key: 'dips',   label: 'DiPS', fmt: fmtPassRating },
  ],
  VER: [
    { key: 'name', label: 'Player' },
    { key: 'ver',  label: 'VER',  fmt: fmtVER,  render: (v, row) => <VERBadge ver={v} position={row.pos_label} /> },
    { key: 'k',    label: 'K',    fmt: fmtCount },
    { key: 'ace',  label: 'ACE',  fmt: fmtCount },
    { key: 'bs',   label: 'BS',   fmt: fmtCount },
    { key: 'ba',   label: 'BA',   fmt: fmtCount },
    { key: 'ast',  label: 'AST',  fmt: fmtCount },
    { key: 'dig',  label: 'DIG',  fmt: fmtCount },
    { key: 'ae',   label: 'AE',   fmt: fmtCount },
    { key: 'se',   label: 'SE',   fmt: fmtCount },
    { key: 'bhe',  label: 'BHE',  fmt: fmtCount },
  ],
};

// ── Main Component ────────────────────────────────────────────────────────────
export const LiveStatsModal = memo(function LiveStatsModal({ open, onClose, teamName, opponentName, recordAlerts = [], records = [], defaultTab = null }) {
  const [activeView, setActiveView] = useState('box');
  const [activeTab,  setActiveTab]  = useState('POINTS');
  const [serveView,  setServeView]  = useState('ALL');
  const [scope,      setScope]      = useState('set');

  useEffect(() => {
    if (open && defaultTab === 'RECORDS') {
      setActiveView('stats');
      setActiveTab('RECORDS');
    }
  }, [open, defaultTab]);

  const {
    ourScore, oppScore, ourSetsWon, oppSetsWon, setNumber, format,
    matchId, teamId, pointHistory, lineup,
    currentSetId, committedContacts, committedRallies,
  } = useMatchStore(useShallow((s) => ({
    ourScore:          s.ourScore,
    oppScore:          s.oppScore,
    ourSetsWon:        s.ourSetsWon,
    oppSetsWon:        s.oppSetsWon,
    setNumber:         s.setNumber,
    format:            s.format,
    matchId:           s.matchId,
    teamId:            s.teamId,
    pointHistory:      s.pointHistory,
    lineup:            s.lineup,
    currentSetId:      s.currentSetId,
    committedContacts: s.committedContacts,
    committedRallies:  s.committedRallies,
  })));

  const { teamStats, oppStats, playerStats, pointQuality } = useMatchStats();

  const allMatchContacts = useLiveQuery(
    () => matchId ? db.contacts.where('match_id').equals(matchId).toArray() : [],
    [matchId]
  );
  const allMatchSets = useLiveQuery(
    () => matchId ? db.sets.where('match_id').equals(matchId).toArray() : [],
    [matchId]
  );

  const allMatchRallies = useLiveQuery(
    () => allMatchSets?.length
      ? Promise.all(allMatchSets.map((s) => db.rallies.where('set_id').equals(s.id).toArray()))
          .then((arrays) => arrays.flat())
      : [],
    [allMatchSets]
  );
  const roster = useLiveQuery(
    () => teamId ? db.players.where('team_id').equals(teamId).filter((p) => p.is_active).toArray() : [],
    [teamId]
  );

  // Full position map covers starters + any subs who played
  const fullPositionMap = useMemo(() => {
    const map = {};
    for (const p of roster ?? []) map[p.id] = p.position;
    // Lineup positionLabel overrides DB position for currently slotted players
    for (const sl of lineup) if (sl.playerId) map[sl.playerId] = sl.positionLabel ?? map[sl.playerId];
    return map;
  }, [roster, lineup]);

  const matchPlayerStats = useMemo(
    () => computePlayerStats(allMatchContacts ?? [], setNumber, fullPositionMap),
    [allMatchContacts, setNumber, fullPositionMap]
  );

  const xkByPlayer = useMemo(
    () => computeXKByPassRating(committedContacts),
    [committedContacts]
  );

  const matchPointQuality = useMemo(
    () => computePointQuality(allMatchContacts ?? []),
    [allMatchContacts]
  );

  const matchOppTotal = useMemo(
    () => (allMatchSets ?? []).reduce((sum, s) => sum + (s.opp_score ?? 0), 0),
    [allMatchSets]
  );

  const nameMap = useMemo(
    () => Object.fromEntries((roster ?? []).map(p => [String(p.id), p.name])),
    [roster]
  );

  const matchTeamStats = useMemo(
    () => computeTeamStats(allMatchContacts ?? [], setNumber),
    [allMatchContacts, setNumber]
  );
  const matchOppStats = useMemo(
    () => computeOppDisplayStats(allMatchContacts ?? []),
    [allMatchContacts]
  );

  // Rotation point stats — wraps existing computeRotationStats into per-rotation shape
  function buildRotPts(rallies) {
    const raw = computeRotationStats(rallies ?? []);
    const result = {};
    for (let r = 1; r <= 6; r++) {
      const rot = raw.rotations[r] ?? {};
      const ptsWon  = (rot.so_win  ?? 0) + (rot.bp_win  ?? 0);
      const ptsLost = (rot.so_opp  ?? 0) - (rot.so_win  ?? 0) + (rot.bp_opp ?? 0) - (rot.bp_win ?? 0);
      const ptsTotal = (rot.so_opp ?? 0) + (rot.bp_opp ?? 0);
      result[r] = {
        pts_won:  ptsWon,
        pts_lost: ptsLost,
        pts_total: ptsTotal,
        win_pct:  ptsTotal > 0 ? ptsWon / ptsTotal : null,
        so_pct:   rot.so_pct ?? null,
        bp_pct:   rot.bp_pct ?? null,
      };
    }
    return result;
  }

  const setRotPts   = useMemo(() => buildRotPts(committedRallies),  [committedRallies]);
  const matchRotPts = useMemo(() => buildRotPts(allMatchRallies),    [allMatchRallies]);

  const setRotContacts   = useMemo(
    () => computeRotationContactStats(committedContacts.filter((c) => c.set_id === currentSetId)),
    [committedContacts, currentSetId]
  );
  const matchRotContacts = useMemo(
    () => computeRotationContactStats(allMatchContacts ?? []),
    [allMatchContacts]
  );

  const setISvsOOS = useMemo(
    () => computeISvsOOS(
      committedContacts.filter((c) => c.set_id === currentSetId),
      committedRallies
    ),
    [committedContacts, currentSetId, committedRallies]
  );
  const matchISvsOOS = useMemo(
    () => computeISvsOOS(allMatchContacts ?? [], allMatchRallies ?? []),
    [allMatchContacts, allMatchRallies]
  );

  const setFreeDigWin = useMemo(
    () => computeFreeDigWin(
      committedContacts.filter((c) => c.set_id === currentSetId),
      committedRallies
    ),
    [committedContacts, currentSetId, committedRallies]
  );
  const matchFreeDigWin = useMemo(
    () => computeFreeDigWin(allMatchContacts ?? [], allMatchRallies ?? []),
    [allMatchContacts, allMatchRallies]
  );

  const setTransAtk = useMemo(
    () => computeTransitionAttack(committedContacts.filter((c) => c.set_id === currentSetId), committedRallies),
    [committedContacts, currentSetId, committedRallies]
  );
  const matchTransAtk = useMemo(
    () => computeTransitionAttack(allMatchContacts ?? [], allMatchRallies ?? []),
    [allMatchContacts, allMatchRallies]
  );

  const serveZoneContacts = useMemo(() => {
    const src = scope === 'set'
      ? committedContacts.filter(c => c.set_id === currentSetId)
      : (allMatchContacts ?? []);
    return src.filter(c => c.action === 'serve' && c.zone != null);
  }, [scope, committedContacts, currentSetId, allMatchContacts]);

  const scoreTimelineCharts = useMemo(() => {
    const rallies = allMatchRallies ?? [];
    const sets    = allMatchSets    ?? [];
    if (!rallies.length || !sets.length) return [];
    return [...sets]
      .filter(s => s.status !== 'scheduled')
      .sort((a, b) => a.set_number - b.set_number)
      .map(set => {
        const setRallies = rallies
          .filter(r => r.set_id === set.id)
          .sort((a, b) => a.rally_number - b.rally_number);
        if (!setRallies.length) return null;
        const pts = [{ x: 0, us: 0, opp: 0 }];
        let us = 0, opp = 0;
        for (const r of setRallies) {
          if (r.point_winner === 'us') us++;
          else opp++;
          pts.push({ x: pts.length, us, opp });
        }
        const maxScore = Math.max(...pts.map(d => Math.max(d.us, d.opp)), 1);
        return { set, pts, maxScore };
      })
      .filter(Boolean);
  }, [allMatchRallies, allMatchSets]);

  const setServingPoints   = useMemo(() => computeServingPoints(committedRallies),       [committedRallies]);
  const matchServingPoints = useMemo(() => computeServingPoints(allMatchRallies ?? []),   [allMatchRallies]);

  // All hooks must be called before any early return
  const rows = useMemo(() => {
    const srvPts = scope === 'set' ? setServingPoints : matchServingPoints;
    return lineup
      .filter((sl) => sl.playerId)
      .map((sl) => ({
        id:     sl.playerId,
        name:   sl.playerName,
        ...((scope === 'set' ? playerStats : matchPlayerStats)[sl.playerId] ?? {}),
        srv_pt: srvPts[sl.playerId] ?? 0,
      }));
  }, [lineup, playerStats, matchPlayerStats, scope, setServingPoints, matchServingPoints]);

  if (!open) return null;

  const t           = scope === 'set' ? teamStats       : matchTeamStats;
  const opp         = scope === 'set' ? oppStats        : matchOppStats;
  const rotPts      = scope === 'set' ? setRotPts       : matchRotPts;
  const rotContacts = scope === 'set' ? setRotContacts  : matchRotContacts;
  const isvsoos     = scope === 'set' ? setISvsOOS      : matchISvsOOS;
  const freeDigWin  = scope === 'set' ? setFreeDigWin   : matchFreeDigWin;
  const transAtk    = scope === 'set' ? setTransAtk     : matchTransAtk;

  const activeColumns = activeTab === 'SERVING' ? SERVING_COLS[serveView] : COLUMNS[activeTab] ?? [];
  const maxSets = format === 'best_of_5' ? 5 : 3;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
        <span className="text-white font-bold text-lg tracking-wide">
          LIVE STATS · Set {setNumber}
        </span>
        <button
          onPointerDown={(e) => { e.preventDefault(); onClose(); }}
          className="text-slate-400 hover:text-white text-2xl leading-none"
        >
          ✕
        </button>
      </div>

      {/* Top-level tab bar */}
      <div className="flex border-b border-slate-700 flex-shrink-0">
        {[['box', 'BOX SCORE'], ['stats', 'STATS']].map(([key, label]) => (
          <button
            key={key}
            onPointerDown={(e) => { e.preventDefault(); setActiveView(key); }}
            className={`flex-1 py-2.5 text-sm font-bold tracking-wide ${
              activeView === key
                ? 'text-primary border-b-2 border-primary'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">

        {activeView === 'box' ? (
          <>
            {/* Scope toggle */}
            <div className="flex gap-2 px-4 py-3 border-b border-slate-800">
              {['set', 'match'].map((s) => (
                <button
                  key={s}
                  onPointerDown={(e) => { e.preventDefault(); setScope(s); }}
                  className={`px-4 py-1 rounded text-xs font-bold transition-colors ${
                    scope === s
                      ? 'bg-slate-600 text-white'
                      : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
                  }`}
                >
                  {s.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Score header */}
            <div className="flex items-center justify-center gap-6 px-4 py-4">
              <div className="text-center min-w-[4rem]">
                <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">
                  {teamName || 'HOME'}
                </div>
                <div className="text-5xl font-black tabular-nums text-white">{ourScore}</div>
              </div>
              <div className="text-center">
                <div className="text-slate-400 text-base font-bold">{ourSetsWon} – {oppSetsWon}</div>
                <div className="text-slate-600 text-xs mt-0.5">Set {setNumber} of {maxSets}</div>
              </div>
              <div className="text-center min-w-[4rem]">
                <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">
                  {opponentName || 'AWAY'}
                </div>
                <div className="text-5xl font-black tabular-nums text-slate-300">{oppScore}</div>
              </div>
            </div>

            {/* Set scores strip */}
            <div className="border-t border-slate-800">
              <SetScoresStrip
                allMatchSets={allMatchSets}
                currentSetNumber={setNumber}
                ourScore={ourScore}
                oppScore={oppScore}
              />
            </div>

            {/* Sparkline */}
            <div className="border-t border-slate-800 py-2">
              <BoxSparkline pointHistory={pointHistory} />
            </div>

            {/* Team stats */}
            <div className="border-t border-slate-800">
              <TeamStatsTable t={t} opp={opp} />
            </div>

            {/* Rotation analysis */}
            <div className="border-t border-slate-800">
              <RotationTable rotPts={rotPts} rotContacts={rotContacts} />
            </div>

            {/* In-System / Out-of-System */}
            <div className="border-t border-slate-800">
              <ISvsOOSTable
                data={isvsoos ?? EMPTY_ISVSOOS}
                freeDigData={freeDigWin ?? EMPTY_FREEDIG}
                transAtkData={transAtk ?? EMPTY_TRANSATK}
              />
            </div>
          </>
        ) : (
          <div className="flex flex-col h-full">
            {/* Stats detail tab bar */}
            <div className="flex border-b border-slate-700 flex-shrink-0">
              <button
                onPointerDown={(e) => { e.preventDefault(); setActiveView('box'); }}
                className="px-3 py-2 text-xs font-bold text-slate-400 hover:text-white border-r border-slate-700 flex-shrink-0"
              >
                ◂ BOX
              </button>
              {TABS.map((tab) => (
                <button
                  key={tab}
                  onPointerDown={(e) => { e.preventDefault(); setActiveTab(tab); }}
                  className={`flex-1 py-2 text-xs font-semibold tracking-wide relative ${
                    activeTab === tab
                      ? 'text-primary border-b-2 border-primary'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {tab}
                  {tab === 'RECORDS' && recordAlerts.length > 0 && (
                    <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-yellow-500 text-black text-[9px] font-black flex items-center justify-center leading-none">
                      {recordAlerts.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Scope toggle — set vs match */}
            {activeTab !== 'RECORDS' && (
              <div className="flex gap-2 px-3 py-2 border-b border-slate-800 bg-black/20 flex-shrink-0">
                {['set', 'match'].map((s) => (
                  <button
                    key={s}
                    onPointerDown={(e) => { e.preventDefault(); setScope(s); }}
                    className={`px-4 py-1 rounded text-xs font-bold transition-colors ${
                      scope === s
                        ? 'bg-slate-600 text-white'
                        : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
                    }`}
                  >
                    {s === 'set' ? `SET ${setNumber}` : 'MATCH'}
                  </button>
                ))}
              </div>
            )}

            {/* Serve sub-toggle */}
            {activeTab === 'SERVING' && (
              <div className="flex gap-1 px-3 py-2 border-b border-slate-800 bg-black/20 flex-shrink-0">
                {SERVE_VIEWS.map((v) => (
                  <button
                    key={v}
                    onPointerDown={(e) => { e.preventDefault(); setServeView(v); }}
                    className={`flex-1 py-1 rounded text-xs font-bold transition-colors ${
                      serveView === v
                        ? 'bg-slate-600 text-white'
                        : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
                    }`}
                  >
                    {v === 'TOP' ? 'TOP SPIN' : v}
                  </button>
                ))}
              </div>
            )}

            {/* Detail content */}
            <div className="flex-1 overflow-y-auto">
              {activeTab === 'POINTS'
                ? <div className="p-4 space-y-4">
                    <PointQualityPanel
                      pq={scope === 'set' ? pointQuality : matchPointQuality}
                      oppScored={scope === 'set' ? oppScore : matchOppTotal}
                    />
                    {scoreTimelineCharts.length > 0 && (
                      <div className="space-y-4">
                        <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Score Timeline</p>
                        <div className="flex gap-4">
                          <span className="flex items-center gap-1 text-xs text-slate-400">
                            <span className="inline-block w-4 h-0.5 bg-orange-400 rounded" />
                            {teamName || 'Us'}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-slate-400">
                            <span className="inline-block w-4 h-0.5 bg-slate-400 rounded" />
                            {opponentName || 'Opp'}
                          </span>
                        </div>
                        {scoreTimelineCharts
                          .filter(c => scope === 'match' || c.set.set_number === setNumber)
                          .map(({ set, pts, maxScore }) => (
                          <div key={set.id}>
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Set {set.set_number}</p>
                            <ResponsiveContainer width="100%" height={130}>
                              <LineChart data={pts} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                                <XAxis dataKey="x" hide />
                                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} domain={[0, 25]} ticks={[5, 10, 15, 20, 25]} interval={0} allowDecimals={false} />
                                <Tooltip
                                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                                  labelStyle={{ color: '#cbd5e1' }}
                                  formatter={(val, name) => [val, name === 'us' ? (teamName || 'Us') : (opponentName || 'Opp')]}
                                  labelFormatter={() => ''}
                                />
                                <Line type="monotone" dataKey="us"  stroke="#f97316" strokeWidth={2} dot={false} name="us" />
                                <Line type="monotone" dataKey="opp" stroke="#94a3b8" strokeWidth={2} dot={false} name="opp" />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                : activeTab === 'RECORDS'
                ? <RecordsProgressPanel
                    records={records}
                    playerStats={matchPlayerStats}
                    teamStats={matchTeamStats}
                    lineup={lineup}
                    roster={roster}
                  />
                : (
                  <>
                    <StatTable columns={activeColumns} rows={rows} />
                    {activeTab === 'SERVING' && (
                      <ServeZoneStatsPanel contacts={serveZoneContacts} />
                    )}
                    {activeTab === 'ATTACKING' && (
                      <div className="border-t border-slate-800">
                        <OffenseBalanceChart
                          setPlayerStats={playerStats}
                          matchPlayerStats={matchPlayerStats}
                          positionMap={fullPositionMap}
                        />
                        {(() => {
                          const xkRows = Object.entries(xkByPlayer)
                            .filter(([, x]) => (x.xk1_ta ?? 0) > 0 || (x.xk2_ta ?? 0) > 0 || (x.xk3_ta ?? 0) > 0)
                            .map(([pid, x]) => ({ pid, name: nameMap[pid] ?? `#${pid}`, ...x }));
                          if (!xkRows.length) return null;
                          const cell = 'px-2 py-1.5 text-right tabular-nums text-slate-300';
                          return (
                            <div className="px-4 pb-4 space-y-3">
                              <div className="bg-slate-800/60 rounded-xl p-3">
                                <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Kill% by Pass Rating (xK%)</p>
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b border-slate-700">
                                      <th className="px-2 py-1.5 text-left font-semibold text-slate-400">Player</th>
                                      <th className="px-2 py-1.5 text-right font-semibold text-slate-400">xK1%</th>
                                      <th className="px-2 py-1.5 text-right font-semibold text-slate-400">xK2%</th>
                                      <th className="px-2 py-1.5 text-right font-semibold text-slate-400">xK3%</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {xkRows.map((r, i) => (
                                      <tr key={r.pid} className={`border-b border-slate-800/60 ${i % 2 !== 0 ? 'bg-slate-900/30' : ''}`}>
                                        <td className="px-2 py-1.5 text-slate-300">{r.name}</td>
                                        <td className={cell}>{fmtPct(r.xk1)}</td>
                                        <td className={cell}>{fmtPct(r.xk2)}</td>
                                        <td className={cell}>{fmtPct(r.xk3)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              <div className="bg-slate-800/60 rounded-xl p-3">
                                <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Hit% by Pass Rating (xHIT%)</p>
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b border-slate-700">
                                      <th className="px-2 py-1.5 text-left font-semibold text-slate-400">Player</th>
                                      <th className="px-2 py-1.5 text-right font-semibold text-slate-400">xHIT1</th>
                                      <th className="px-2 py-1.5 text-right font-semibold text-slate-400">xHIT2</th>
                                      <th className="px-2 py-1.5 text-right font-semibold text-slate-400">xHIT3</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {xkRows.map((r, i) => (
                                      <tr key={r.pid} className={`border-b border-slate-800/60 ${i % 2 !== 0 ? 'bg-slate-900/30' : ''}`}>
                                        <td className="px-2 py-1.5 text-slate-300">{r.name}</td>
                                        <td className={cell}>{fmtHitting(r.xhit1)}</td>
                                        <td className={cell}>{fmtHitting(r.xhit2)}</td>
                                        <td className={cell}>{fmtHitting(r.xhit3)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </>
                )
              }
            </div>
          </div>
        )}

      </div>
    </div>
  );
});
