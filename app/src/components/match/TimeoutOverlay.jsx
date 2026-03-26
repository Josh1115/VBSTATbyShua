import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useMatchStore } from '../../store/matchStore';
import {
  computePlayerStats, computeTeamStats, computeRotationStats,
  computePointQuality, computeOppDisplayStats,
} from '../../stats/engine';
import { TAB_COLUMNS, SERVING_COLS, ROTATION_COLS } from '../../stats/columns';
import { StatTable } from '../stats/StatTable';
import { SubToggle } from '../stats/SubToggle';
import { SetTrendsChart } from '../stats/SetTrendsChart';
import { RallyHistogram } from '../stats/RallyHistogram';
import { PlayerComparison } from '../stats/PlayerComparison';
import { PointQualityPanel } from '../stats/PointQualityPanel';
import { RotationSpotlight } from '../stats/RotationSpotlight';
import { RotationBarChart } from '../charts/RotationBarChart';
import { RotationRadarChart } from '../charts/RotationRadarChart';
import { CourtHeatMap } from '../charts/CourtHeatMap';
import { RecordAlertPanel } from './RecordAlertPanel';
import { fmtCount, fmtPct, fmtHitting, fmtPassRating } from '../../stats/formatters';

const TABS = [
  { value: 'scoring',   label: 'Scoring'   },
  { value: 'trends',    label: 'Trends'    },
  { value: 'serving',   label: 'Serving'   },
  { value: 'passing',   label: 'Passing'   },
  { value: 'attacking', label: 'Attacking' },
  { value: 'blocking',  label: 'Blocking'  },
  { value: 'defense',   label: 'Defense'   },
  { value: 'ver',       label: 'VER'       },
  { value: 'compare',   label: 'Compare'   },
  { value: 'opp',       label: 'Opp'       },
];

const CIRCUMFERENCE = 2 * Math.PI * 54; // ≈ 339.3

const MILESTONE_ORDER = ['beat', 'tie', 'one_away', 'pct90', 'pct80'];

// Classify the decisive contact of a rally into a short label
function classifyPoint(lastContact, pointWinner) {
  if (!lastContact) return { label: '?', ours: pointWinner === 'us' };
  const { action, result, opponent_contact: opp } = lastContact;
  const ours = pointWinner === 'us';

  let label = '?';
  if (!opp) {
    if (action === 'serve'  && result === 'ace')   label = 'ACE';
    else if (action === 'serve'  && result === 'error')  label = 'SE';
    else if (action === 'attack' && result === 'kill')   label = 'K';
    else if (action === 'attack' && result === 'error')  label = 'AE';
    else if (action === 'block'  && (result === 'solo' || result === 'assist')) label = 'BLK';
    else if (action === 'error')                         label = 'ERR';
  } else {
    if (action === 'serve'  && result === 'error')  label = 'OPP SE';
    else if (action === 'attack' && result === 'error')  label = 'OPP AE';
    else if (action === 'attack' && result === 'kill')   label = 'OPP K';
    else if (action === 'block'  && result === 'solo')   label = 'OPP BLK';
    else if (action === 'error')                         label = 'OPP ERR';
  }
  return { label, ours };
}

export function TimeoutOverlay({ onClose, recordAlerts = [], scoreAtLastTimeout = null }) {
  const [activeTab,   setActiveTab]   = useState('scoring');
  const [serveView,   setServeView]   = useState('all');
  const [passingView, setPassingView] = useState('passing');
  const [trendsView,  setTrendsView]  = useState('trends');
  const [secondsLeft, setSecondsLeft] = useState(60);

  const lineup            = useMatchStore((s) => s.lineup);
  const setNumber         = useMatchStore((s) => s.setNumber);
  const committedContacts = useMatchStore((s) => s.committedContacts);
  const committedRallies  = useMatchStore((s) => s.committedRallies);
  const currentSetId      = useMatchStore((s) => s.currentSetId);
  const ourScore          = useMatchStore((s) => s.ourScore);
  const oppScore          = useMatchStore((s) => s.oppScore);
  const rotationNum       = useMatchStore((s) => s.rotationNum);
  const pointHistory      = useMatchStore((s) => s.pointHistory);
  const serveSide         = useMatchStore((s) => s.serveSide);

  const setContacts = useMemo(
    () => committedContacts.filter((c) => c.set_id === currentSetId),
    [committedContacts, currentSetId]
  );

  const setRallies = useMemo(
    () => committedRallies.filter((r) => r.set_id === currentSetId),
    [committedRallies, currentSetId]
  );

  const timelineData = useMemo(() => {
    const sorted = [...setRallies].sort((a, b) => a.rally_number - b.rally_number);
    const pts = [{ x: 0, us: 0, opp: 0 }];
    let us = 0, opp = 0;
    for (const r of sorted) {
      if (r.point_winner === 'us') us++;
      else opp++;
      pts.push({ x: pts.length, us, opp });
    }
    return pts;
  }, [setRallies]);

  const playerStats  = useMemo(() => computePlayerStats(setContacts, 1),  [setContacts]);
  const teamStats    = useMemo(() => computeTeamStats(setContacts, 1),    [setContacts]);
  const pointQuality = useMemo(() => computePointQuality(setContacts),    [setContacts]);
  const oppStats     = useMemo(() => computeOppDisplayStats(setContacts), [setContacts]);

  const rotationStats = useMemo(() => computeRotationStats(setRallies), [setRallies]);

  const rotationRows = useMemo(() => {
    if (!rotationStats?.rotations) return [];
    return Object.entries(rotationStats.rotations).map(([n, r]) => ({
      id:     Number(n),
      name:   `Rotation ${n}`,
      so_pct: r.so_pct ?? null,
      so_opp: r.so_opp,
      so_win: r.so_win,
      bp_pct: r.bp_pct ?? null,
      bp_opp: r.bp_opp,
      bp_win: r.bp_win,
    }));
  }, [rotationStats]);

  const currentRotStat = rotationStats.rotations?.[rotationNum] ?? null;

  // ── Feature 2: Error leader (SE + AE combined) ────────────────────────────
  const errorLeader = useMemo(() => {
    const onCourt = lineup.filter((sl) => sl.playerId);
    let worst = null;
    for (const sl of onCourt) {
      const ps = playerStats[sl.playerId];
      if (!ps) continue;
      const errs = (ps.se ?? 0) + (ps.ae ?? 0);
      if (errs > 0 && (!worst || errs > worst.errs)) {
        worst = { name: sl.playerName, errs, se: ps.se ?? 0, ae: ps.ae ?? 0 };
      }
    }
    return worst;
  }, [lineup, playerStats]);

  // ── Feature 3: Point type breakdown of last 10 rallies ────────────────────
  const pointBreakdown = useMemo(() => {
    const last10 = setRallies.slice(-10);
    const contactsByRally = {};
    for (const c of setContacts) {
      const key = c.rally_number;
      if (!contactsByRally[key] || c.timestamp > contactsByRally[key].timestamp) {
        contactsByRally[key] = c;
      }
    }
    return last10.map((r) => classifyPoint(contactsByRally[r.rally_number], r.point_winner));
  }, [setRallies, setContacts]);

  // Decrement timer every second
  useEffect(() => {
    const id = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Auto-close when timer hits 0
  useEffect(() => {
    if (secondsLeft <= 0) onClose();
  }, [secondsLeft, onClose]);

  const playerRows = lineup
    .filter((sl) => sl.playerId)
    .map((sl) => {
      const ps = playerStats[sl.playerId] ?? {};
      return { id: sl.playerId, name: sl.playerName, ...ps };
    });

  const totalsRow = useMemo(() => ({ name: 'Total', ...teamStats }), [teamStats]);

  const currentSet = useMemo(
    () => [{ id: currentSetId, set_number: setNumber }],
    [currentSetId, setNumber]
  );

  const strokeDashoffset = CIRCUMFERENCE * (1 - Math.max(secondsLeft, 0) / 60);
  const ringColor =
    secondsLeft >= 30 ? '#22c55e' :
    secondsLeft >= 15 ? '#eab308' :
    '#ef4444';

  function soColor(pct) {
    if (pct == null) return 'text-slate-400';
    if (pct < 0.40) return 'text-red-400';
    if (pct < 0.50) return 'text-yellow-400';
    if (pct >= 0.60) return 'text-emerald-400';
    return 'text-slate-300';
  }
  function bpColor(pct) {
    if (pct == null) return 'text-slate-400';
    if (pct < 0.25) return 'text-red-400';
    if (pct < 0.38) return 'text-yellow-400';
    if (pct >= 0.50) return 'text-emerald-400';
    return 'text-slate-300';
  }

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/95 flex">

      {/* Left panel: tabbed stat table */}
      <div className="flex flex-col w-[65%] border-r border-slate-700">
        <div className="flex items-center px-4 py-3 border-b border-slate-700 shrink-0">
          <span className="text-white font-bold text-lg tracking-wide">
            TIMEOUT · Set {setNumber}
          </span>
        </div>

        {/* Team summary strip */}
        {(() => {
          const t = teamStats;
          const n = (v) => v ?? 0;
          const pct = (v) => v != null ? Math.round(v * 100) + '%' : '—';
          const dec1 = (v) => v != null ? v.toFixed(1) : '—';
          const groups = [
            { label: 'SERVING',   items: [`${n(t.sa)} SA`, `${n(t.ace)} ACE`, `${n(t.se)} SE`, `${pct(t.si_pct)} S%`] },
            { label: 'ATTACKING', items: [`${n(t.ta)} TA`, `${n(t.k)} K`, `${n(t.ae)} AE`, `${fmtHitting(t.hit_pct)} HIT`] },
            { label: 'PASSING',   items: [`${n(t.pa)} PA`, `${dec1(t.apr)} APR`, `${pct(t.pp_pct)} 3OPT`] },
            { label: 'BLOCKING',  items: [`${n(t.bs)} BS`, `${n(t.ba)} BA`] },
            { label: 'DEFENSE',   items: [`${n(t.dig)} DIG`, `${n(t.de)} DE`] },
          ];
          return (
            <div className="flex border-b border-slate-700 shrink-0 bg-slate-800/50 divide-x divide-slate-700">
              {groups.map((g) => (
                <div key={g.label} className="flex flex-col px-3 py-2 gap-1 min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{g.label}</span>
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                    {g.items.map((item) => (
                      <span key={item} className="text-sm font-semibold text-slate-200 whitespace-nowrap">{item}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Scrollable tab bar */}
        <div className="flex overflow-x-auto border-b border-slate-700 shrink-0" style={{ scrollbarWidth: 'none' }}>
          {TABS.map(({ value, label }) => (
            <button
              key={value}
              onPointerDown={(e) => { e.preventDefault(); setActiveTab(value); }}
              className={`flex-shrink-0 px-3 py-2 text-xs font-semibold tracking-wide whitespace-nowrap ${
                activeTab === value
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-3">

          {activeTab === 'scoring' && (
            <PointQualityPanel pq={pointQuality} oppScored={oppScore} />
          )}

          {activeTab === 'trends' && (
            <>
              <SubToggle
                options={[['trends', 'TRENDS'], ['rotation', 'ROTATION']]}
                value={trendsView}
                onChange={setTrendsView}
              />
              {trendsView === 'trends' && (
                <div className="space-y-8">
                  <SetTrendsChart contacts={setContacts} sets={currentSet} />
                  <div className="border-t border-slate-700/50 pt-6">
                    <RallyHistogram contacts={setContacts} />
                  </div>
                </div>
              )}
              {trendsView === 'rotation' && (
                <div className="space-y-4">
                  <RotationBarChart rotationRows={rotationRows} />
                  <RotationRadarChart rotationStats={rotationStats} />
                  <RotationSpotlight rows={rotationRows} />
                  <StatTable columns={ROTATION_COLS} rows={rotationRows} />
                  <div className="grid grid-cols-2 gap-4 text-sm text-center">
                    <div className="bg-surface rounded-xl p-3">
                      <div className="text-xs text-slate-400">Overall SO%</div>
                      <div className="text-lg font-bold text-primary">{fmtPct(rotationStats.so_pct)}</div>
                    </div>
                    <div className="bg-surface rounded-xl p-3">
                      <div className="text-xs text-slate-400">Overall SP%</div>
                      <div className="text-lg font-bold text-sky-400">{fmtPct(rotationStats.bp_pct)}</div>
                    </div>
                  </div>
                  <CourtHeatMap contacts={setContacts} />
                </div>
              )}
            </>
          )}

          {activeTab === 'serving' && (
            <>
              <SubToggle
                options={[['all', 'ALL'], ['float', 'FLOAT'], ['top', 'TOP SPIN']]}
                value={serveView}
                onChange={setServeView}
              />
              <StatTable columns={SERVING_COLS[serveView]} rows={playerRows} totalsRow={totalsRow} />
            </>
          )}

          {activeTab === 'passing' && (
            <>
              <SubToggle
                options={[['passing', 'PASSING'], ['setting', 'SETTING']]}
                value={passingView}
                onChange={setPassingView}
              />
              <StatTable columns={TAB_COLUMNS[passingView]} rows={playerRows} totalsRow={totalsRow} />
            </>
          )}

          {activeTab === 'attacking' && (
            <StatTable columns={TAB_COLUMNS['attacking']} rows={playerRows} totalsRow={totalsRow} />
          )}

          {activeTab === 'blocking' && (
            <StatTable columns={TAB_COLUMNS['blocking']} rows={playerRows} totalsRow={totalsRow} />
          )}

          {activeTab === 'defense' && (
            <StatTable columns={TAB_COLUMNS['defense']} rows={playerRows} totalsRow={totalsRow} />
          )}

          {activeTab === 'ver' && (
            <StatTable columns={TAB_COLUMNS['ver']} rows={playerRows} totalsRow={totalsRow} />
          )}

          {activeTab === 'compare' && (
            <PlayerComparison playerRows={playerRows} />
          )}

          {activeTab === 'opp' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">Opponent performance this set</p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'ACE',  val: oppStats.ace,  desc: 'Aces vs us'          },
                  { label: 'SE',   val: oppStats.se,   desc: 'Serve errors'         },
                  { label: 'K',    val: oppStats.k,    desc: 'Kills'                },
                  { label: 'AE',   val: oppStats.ae,   desc: 'Attack errors'        },
                  { label: 'BLK',  val: oppStats.blk,  desc: 'Blocked by us'        },
                  { label: 'ERR',  val: oppStats.errs, desc: 'Ball handling errors' },
                ].map(({ label, val, desc }) => (
                  <div key={label} className="bg-surface rounded-xl p-3 text-center">
                    <div className="text-xs text-slate-400 mb-1">{desc}</div>
                    <div className="text-2xl font-black text-primary">{val}</div>
                    <div className="text-xs font-bold text-slate-300 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Score timeline for current set */}
        {timelineData.length > 1 && (
          <div className="shrink-0 border-t border-slate-700 px-3 pt-2 pb-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Set {setNumber} Timeline</p>
            <ResponsiveContainer width="100%" height={90}>
              <LineChart data={timelineData} margin={{ top: 2, right: 6, left: -28, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="x" hide />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} domain={[0, 25]} ticks={[5, 10, 15, 20, 25]} interval={0} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '4px 8px' }}
                  formatter={(val, name) => [val, name === 'us' ? 'Us' : 'Opp']}
                  labelFormatter={() => ''}
                />
                <Line type="monotone" dataKey="us"  stroke="#f97316" strokeWidth={2} dot={false} name="us" />
                <Line type="monotone" dataKey="opp" stroke="#94a3b8" strokeWidth={2} dot={false} name="opp" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Right panel */}
      <div className="flex flex-col items-center justify-center gap-3 flex-1 px-3">

        {/* Current score */}
        <div className="text-center">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">Set {setNumber} Score</div>
          <div className="text-4xl font-black tabular-nums tracking-tight">
            <span className="text-white">{ourScore}</span>
            <span className="text-slate-500 mx-1">–</span>
            <span className="text-slate-400">{oppScore}</span>
          </div>
        </div>

        {/* Score since last timeout */}
        {scoreAtLastTimeout !== null && (
          <div className="text-center">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">Since Last TO</div>
            <div className="text-lg font-bold tabular-nums">
              <span className={ourScore - scoreAtLastTimeout.us > oppScore - scoreAtLastTimeout.them ? 'text-emerald-400' : 'text-white'}>
                +{ourScore - scoreAtLastTimeout.us}
              </span>
              <span className="text-slate-500 mx-1">–</span>
              <span className={oppScore - scoreAtLastTimeout.them > ourScore - scoreAtLastTimeout.us ? 'text-red-400' : 'text-slate-400'}>
                +{oppScore - scoreAtLastTimeout.them}
              </span>
            </div>
          </div>
        )}

        {/* Point type breakdown */}
        {pointBreakdown.length > 0 && (
          <div className="text-center w-full">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
              Last {pointBreakdown.length} Points
            </div>
            <div className="flex gap-1 justify-center flex-wrap">
              {pointBreakdown.map((pt, i) => (
                <div
                  key={i}
                  className={clsx(
                    'px-1.5 py-0.5 rounded text-[10px] font-black leading-none',
                    pt.ours
                      ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50'
                      : 'bg-red-900/60 text-red-300 border border-red-700/50'
                  )}
                >
                  {pt.label}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rotation SO%/BP% */}
        <div className="text-center w-full">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
            R{rotationNum} This Set
          </div>
          <div className="flex gap-3 justify-center">
            <div className="text-center">
              <div className="text-[10px] text-slate-500 mb-0.5">SO%</div>
              <div className={`text-lg font-black ${soColor(currentRotStat?.so_pct)}`}>
                {currentRotStat?.so_opp > 0 ? fmtPct(currentRotStat.so_pct) : '—'}
              </div>
              {currentRotStat?.so_opp > 0 && (
                <div className="text-[9px] text-slate-600">{currentRotStat.so_win}/{currentRotStat.so_opp}</div>
              )}
            </div>
            <div className="w-px bg-slate-700 self-stretch" />
            <div className="text-center">
              <div className="text-[10px] text-slate-500 mb-0.5">SP%</div>
              <div className={`text-lg font-black ${bpColor(currentRotStat?.bp_pct)}`}>
                {currentRotStat?.bp_opp > 0 ? fmtPct(currentRotStat.bp_pct) : '—'}
              </div>
              {currentRotStat?.bp_opp > 0 && (
                <div className="text-[9px] text-slate-600">{currentRotStat.bp_win}/{currentRotStat.bp_opp}</div>
              )}
            </div>
          </div>
        </div>

        {/* Error leader */}
        {errorLeader && (
          <div className="text-center">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">Error Leader</div>
            <div className="flex items-center gap-2 justify-center">
              <span className="text-red-400 font-black text-lg">{errorLeader.errs}</span>
              <span className="text-slate-300 font-semibold text-sm">{errorLeader.name}</span>
              <span className="text-[10px] text-slate-500">
                {errorLeader.se > 0 && `${errorLeader.se} SE`}
                {errorLeader.se > 0 && errorLeader.ae > 0 && ' · '}
                {errorLeader.ae > 0 && `${errorLeader.ae} AE`}
              </span>
            </div>
          </div>
        )}

        {/* Next server */}
        <div className="text-center">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">Next Server</div>
          <div className="text-sm font-semibold text-slate-200">
            {(serveSide === 'us' ? lineup[0] : lineup[1])?.playerName || '—'}
          </div>
        </div>

        {/* Record alerts */}
        {recordAlerts.length > 0 && (() => {
          const sorted = [...recordAlerts].sort(
            (a, b) => MILESTONE_ORDER.indexOf(a.milestone) - MILESTONE_ORDER.indexOf(b.milestone)
          );
          return (
            <div className="w-full overflow-y-auto max-h-24">
              <RecordAlertPanel alerts={sorted.slice(0, 3)} />
            </div>
          );
        })()}

        {/* Countdown ring */}
        <svg width="100" height="100" viewBox="0 0 140 140">
          <circle cx="70" cy="70" r="54" fill="none" stroke="#334155" strokeWidth="10" />
          <circle
            cx="70" cy="70" r="54"
            fill="none"
            stroke={ringColor}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={strokeDashoffset}
            transform="rotate(-90 70 70)"
            style={{ transition: 'stroke-dashoffset 0.5s linear, stroke 0.5s' }}
          />
          <text
            x="70" y="70"
            textAnchor="middle"
            dominantBaseline="central"
            fill="white"
            fontSize="28"
            fontWeight="bold"
            fontFamily="monospace"
          >
            {Math.max(secondsLeft, 0)}
          </text>
        </svg>

        <button
          onPointerDown={(e) => { e.preventDefault(); onClose(); }}
          className="px-8 py-2.5 bg-primary hover:brightness-110 text-white font-bold text-sm tracking-widest uppercase rounded active:brightness-75 select-none"
        >
          Resume
        </button>
      </div>
    </div>
  );
}
