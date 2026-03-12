import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useMatchStore } from '../../store/matchStore';
import { computePlayerStats, computeTeamStats } from '../../stats/engine';
import { StatTable } from '../stats/StatTable';
import { fmtCount, fmtPct, fmtHitting, fmtPassRating } from '../../stats/formatters';
import { RecordAlertPanel } from './RecordAlertPanel';

const TABS = ['SERVING', 'PASSING', 'ATTACKING', 'BLOCKING', 'DEFENSE'];

const COLUMNS = {
  SERVING: [
    { key: 'name',    label: 'Player' },
    { key: 'sa',      label: 'SA',   fmt: fmtCount },
    { key: 'ace',     label: 'ACE',  fmt: fmtCount },
    { key: 'se',      label: 'SE',   fmt: fmtCount },
    { key: 'ace_pct', label: 'ACE%', fmt: fmtPct },
    { key: 'si_pct',  label: 'S%', fmt: fmtPct },
  ],
  PASSING: [
    { key: 'name',   label: 'Player' },
    { key: 'pa',     label: 'PA',  fmt: fmtCount },
    { key: 'p0',     label: 'P0',  fmt: fmtCount },
    { key: 'p1',     label: 'P1',  fmt: fmtCount },
    { key: 'p2',     label: 'P2',  fmt: fmtCount },
    { key: 'p3',     label: 'P3',  fmt: fmtCount },
    { key: 'apr',    label: 'APR', fmt: fmtPassRating },
    { key: 'pp_pct', label: 'PP%', fmt: fmtPct },
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
    { key: 'name', label: 'Player' },
    { key: 'dig',  label: 'DIG',  fmt: fmtCount },
    { key: 'de',   label: 'DE',   fmt: fmtCount },
    { key: 'dips', label: 'DiPS', fmt: fmtPassRating },
  ],
};

const CIRCUMFERENCE = 2 * Math.PI * 54; // ≈ 339.3

const MILESTONE_ORDER = ['beat', 'tie', 'one_away', 'pct90', 'pct80'];

export function TimeoutOverlay({ onClose, recordAlerts = [], scoreAtLastTimeout = null }) {
  const [activeTab,   setActiveTab]   = useState('SERVING');
  const [secondsLeft, setSecondsLeft] = useState(60);

  const lineup            = useMatchStore((s) => s.lineup);
  const setNumber         = useMatchStore((s) => s.setNumber);
  const committedContacts = useMatchStore((s) => s.committedContacts);
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

  const playerStats = useMemo(() => computePlayerStats(setContacts, 1), [setContacts]);
  const teamStats   = useMemo(() => computeTeamStats(setContacts, 1),   [setContacts]);

  // Decrement timer every second
  useEffect(() => {
    const id = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Auto-close when timer hits 0
  useEffect(() => {
    if (secondsLeft <= 0) onClose();
  }, [secondsLeft, onClose]);

  const rows = lineup
    .filter((sl) => sl.playerId)
    .map((sl) => ({
      id:   sl.playerId,
      name: sl.playerName,
      ...(playerStats[sl.playerId] ?? {}),
    }));

  const strokeDashoffset = CIRCUMFERENCE * (1 - Math.max(secondsLeft, 0) / 60);
  const ringColor =
    secondsLeft >= 30 ? '#22c55e' :
    secondsLeft >= 15 ? '#eab308' :
    '#ef4444';

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
          const hitPct = (v) => v != null ? (v >= 0 ? '+' : '') + (v * 1000).toFixed(0) : '—';
          const groups = [
            { label: 'SERVING',   items: [`${n(t.sa)} SA`, `${n(t.ace)} ACE`, `${n(t.se)} SE`, `${pct(t.si_pct)} SIP`] },
            { label: 'ATTACKING', items: [`${n(t.ta)} TA`, `${n(t.k)} K`, `${n(t.ae)} AE`, `${hitPct(t.hit_pct)} HIT`] },
            { label: 'PASSING',   items: [`${n(t.pa)} PA`, `${dec1(t.apr)} APR`, `${pct(t.pp_pct)} PP`] },
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

        <div className="flex border-b border-slate-700 shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab}
              onPointerDown={(e) => { e.preventDefault(); setActiveTab(tab); }}
              className={`flex-1 py-2 text-xs font-semibold tracking-wide ${
                activeTab === tab
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          <StatTable columns={COLUMNS[activeTab]} rows={rows} />
        </div>
      </div>

      {/* Right panel */}
      <div className="flex flex-col items-center justify-center gap-4 flex-1 px-3">

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

        {/* Momentum strip — last 10 points */}
        {pointHistory.length > 0 && (
          <div className="text-center">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Last {Math.min(pointHistory.length, 10)} Points</div>
            <div className="flex gap-1 justify-center">
              {pointHistory.slice(-10).map((p, i) => (
                <div
                  key={i}
                  className={clsx(
                    'w-4 h-4 rounded-sm',
                    p.side === 'us' ? 'bg-emerald-500' : 'bg-red-500'
                  )}
                />
              ))}
            </div>
          </div>
        )}

        {/* Rotation + next server */}
        <div className="text-center">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">Rotation · Next Server</div>
          <div className="text-sm font-semibold text-slate-200">
            R{rotationNum} · {(serveSide === 'us' ? lineup[0] : lineup[1])?.playerName || '—'}
          </div>
        </div>

        {/* Record alerts */}
        {recordAlerts.length > 0 && (() => {
          const sorted = [...recordAlerts].sort(
            (a, b) => MILESTONE_ORDER.indexOf(a.milestone) - MILESTONE_ORDER.indexOf(b.milestone)
          );
          return (
            <div className="w-full overflow-y-auto max-h-32">
              <RecordAlertPanel alerts={sorted.slice(0, 3)} />
            </div>
          );
        })()}

        {/* Countdown ring */}
        <svg width="120" height="120" viewBox="0 0 140 140">
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
          className="px-8 py-3 bg-primary hover:brightness-110 text-white font-bold text-sm tracking-widest uppercase rounded active:brightness-75 select-none"
        >
          Resume
        </button>
      </div>
    </div>
  );
}
