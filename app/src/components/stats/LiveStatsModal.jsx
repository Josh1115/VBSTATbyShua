import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMatchStore } from '../../store/matchStore';
import { useMatchStats } from '../../hooks/useMatchStats';
import { db } from '../../db/schema';
import { computeTeamStats, computeOppDisplayStats, computeRotationStats, computeRotationContactStats } from '../../stats/engine';
import { StatTable } from './StatTable';
import { PointQualityPanel } from './PointQualityPanel';
import { RecordAlertPanel } from '../match/RecordAlertPanel';
import { fmtCount, fmtPct, fmtHitting, fmtPassRating, fmtVER } from '../../stats/formatters';

const TABS = ['POINTS', 'SERVING', 'PASSING', 'ATTACKING', 'BLOCKING', 'DEFENSE', 'VER', 'RECORDS'];

const SERVE_VIEWS = ['ALL', 'FLOAT', 'TOP'];

const SERVING_COLS = {
  ALL: [
    { key: 'name',    label: 'Player' },
    { key: 'sa',      label: 'SA',   fmt: fmtCount },
    { key: 'ace',     label: 'ACE',  fmt: fmtCount },
    { key: 'se',      label: 'SE',   fmt: fmtCount },
    { key: 'ace_pct', label: 'ACE%', fmt: fmtPct },
    { key: 'si_pct',  label: 'S%',   fmt: fmtPct },
  ],
  FLOAT: [
    { key: 'name',      label: 'Player' },
    { key: 'f_sa',      label: 'SA',   fmt: fmtCount },
    { key: 'f_ace',     label: 'ACE',  fmt: fmtCount },
    { key: 'f_se',      label: 'SE',   fmt: fmtCount },
    { key: 'f_ace_pct', label: 'ACE%', fmt: fmtPct },
    { key: 'f_si_pct',  label: 'S%',   fmt: fmtPct },
  ],
  TOP: [
    { key: 'name',      label: 'Player' },
    { key: 't_sa',      label: 'SA',   fmt: fmtCount },
    { key: 't_ace',     label: 'ACE',  fmt: fmtCount },
    { key: 't_se',      label: 'SE',   fmt: fmtCount },
    { key: 't_ace_pct', label: 'ACE%', fmt: fmtPct },
    { key: 't_si_pct',  label: 'S%',   fmt: fmtPct },
  ],
};

const COLUMNS = {
  PASSING: [
    { key: 'name',   label: 'Player' },
    { key: 'pa',     label: 'PA',  fmt: fmtCount },
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
    { key: 'name', label: 'Player' },
    { key: 'dig',  label: 'DIG',  fmt: fmtCount },
    { key: 'de',   label: 'DE',   fmt: fmtCount },
    { key: 'dips', label: 'DiPS', fmt: fmtPassRating },
  ],
  VER: [
    { key: 'name', label: 'Player' },
    { key: 'ver',  label: 'VER',  fmt: fmtVER   },
    { key: 'k',    label: 'K',    fmt: fmtCount },
    { key: 'ace',  label: 'ACE',  fmt: fmtCount },
    { key: 'dig',  label: 'DIG',  fmt: fmtCount },
    { key: 'ast',  label: 'AST',  fmt: fmtCount },
    { key: 'bs',   label: 'BS',   fmt: fmtCount },
  ],
};

// ── Box Sparkline ─────────────────────────────────────────────────────────────
function BoxSparkline({ pointHistory }) {
  if (pointHistory.length < 3) {
    return (
      <div className="w-full h-10 flex items-center justify-center">
        <span className="text-slate-600 text-xs">No data yet</span>
      </div>
    );
  }

  const diffs = [0];
  for (const p of pointHistory) diffs.push(diffs[diffs.length - 1] + (p.side === 'us' ? 1 : -1));
  const maxAbs = Math.max(1, ...diffs.map(Math.abs));
  const W = 320, H = 40, m = 4;
  const cx = (i) => m + (i / (diffs.length - 1)) * (W - 2 * m);
  const cy = (d) => H / 2 - (d / maxAbs) * (H / 2 - m);
  const polyPts = diffs.map((d, i) => `${cx(i).toFixed(1)},${cy(d).toFixed(1)}`).join(' ');
  const lastDiff = diffs[diffs.length - 1];
  const color = lastDiff > 0 ? '#f97316' : lastDiff < 0 ? '#ef4444' : '#64748b';
  const lastX = cx(diffs.length - 1);
  const lastY = cy(lastDiff);
  const labelText = lastDiff > 0 ? `+${lastDiff}` : String(lastDiff);

  return (
    <div className="w-full px-2">
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: 'block', overflow: 'visible' }}
        preserveAspectRatio="none"
      >
        <line x1={m} y1={H / 2} x2={W - m} y2={H / 2} stroke="#334155" strokeWidth={1} strokeDasharray="3,3" />
        <polyline points={polyPts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={lastX} cy={lastY} r={3} fill={color} />
        {lastDiff !== 0 && (
          <text x={lastX + 5} y={lastY + 4} fontSize={9} fill={color} fontWeight="bold">
            {labelText}
          </text>
        )}
      </svg>
    </div>
  );
}

// ── Set Scores Strip ──────────────────────────────────────────────────────────
function SetScoresStrip({ allMatchSets, currentSetNumber, ourScore, oppScore }) {
  const sorted = [...(allMatchSets ?? [])].sort((a, b) => a.set_number - b.set_number);
  if (!sorted.length) return null;
  return (
    <div className="flex gap-3 px-4 py-2 flex-wrap">
      {sorted.map((s) => {
        const isCurrent = s.set_number === currentSetNumber;
        const usScore = isCurrent ? ourScore : s.our_score;
        const themScore = isCurrent ? oppScore : s.opp_score;
        return (
          <span
            key={s.set_number}
            className={`text-sm font-semibold tabular-nums ${isCurrent ? 'text-white' : 'text-slate-500'}`}
          >
            {isCurrent ? '▶ ' : ''}S{s.set_number}: {usScore} – {themScore}
          </span>
        );
      })}
    </div>
  );
}

// ── Team Stats Comparison ─────────────────────────────────────────────────────
function TeamStatsTable({ t, opp }) {
  const n = (v) => v ?? 0;
  const rows = [
    { label: 'Kills',   us: n(t.k),                 them: n(opp.k)   },
    { label: 'Aces',    us: n(t.ace),                them: n(opp.ace) },
    { label: 'Srv Err', us: n(t.se),                 them: n(opp.se)  },
    { label: 'Blocks',  us: n(t.bs) + n(t.ba) * 0.5, them: n(opp.blk) },
    { label: 'Digs',    us: n(t.dig),                them: '—'        },
    { label: 'Hit%',    us: fmtHitting(t.hit_pct),   them: '—'        },
    { label: 'APR',     us: fmtPassRating(t.apr),    them: '—'        },
  ];
  return (
    <div className="px-4 pt-3 pb-4">
      <div className="text-xs font-bold uppercase tracking-widest text-slate-500 text-center mb-2">
        Team Stats
      </div>
      <table className="w-full">
        <thead>
          <tr className="text-xs text-slate-600 uppercase tracking-wide">
            <th className="text-right pr-2 pb-1 w-20">US</th>
            <th className="text-center px-4 pb-1" />
            <th className="text-left pl-2 pb-1 w-20">THEM</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ label, us, them }) => (
            <tr key={label} className="border-b border-slate-800">
              <td className="py-1.5 pr-2 text-right text-slate-200 font-bold tabular-nums">{us}</td>
              <td className="py-1.5 px-4 text-center text-xs text-slate-500 uppercase tracking-wide">{label}</td>
              <td className="py-1.5 pl-2 text-left text-slate-400 tabular-nums">{them}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Rotation Analysis Table ───────────────────────────────────────────────────
const pct   = (v) => v != null ? Math.round(v * 100) + '%' : '—';
const dec1  = (v) => v != null ? v.toFixed(1) : '—';
const hitFmt = (v) => v != null ? (v >= 0 ? '+' : '') + (v * 1000).toFixed(0) : '—';
const n     = (v) => v ?? 0;

function RotationTable({ rotPts, rotContacts }) {
  const ROTATIONS = [1, 2, 3, 4, 5, 6];

  const rows = [
    { label: 'WIN%',  fmt: (r) => pct(rotPts[r]?.win_pct),    hi: true  },
    { label: 'S/O%',  fmt: (r) => pct(rotPts[r]?.so_pct),     hi: true  },
    { label: 'SRV%',  fmt: (r) => pct(rotPts[r]?.bp_pct),     hi: false },
    { label: 'PTS W', fmt: (r) => n(rotPts[r]?.pts_won),      hi: false },
    { label: 'PTS L', fmt: (r) => n(rotPts[r]?.pts_lost),     hi: false },
    null, // divider
    { label: 'K',     fmt: (r) => n(rotContacts[r]?.k),       hi: false },
    { label: 'ACE',   fmt: (r) => n(rotContacts[r]?.ace),     hi: false },
    { label: 'ERR',   fmt: (r) => n(rotContacts[r]?.ae) + n(rotContacts[r]?.se), hi: false },
    { label: 'APR',   fmt: (r) => dec1(rotContacts[r]?.apr),  hi: false },
    { label: 'HIT%',  fmt: (r) => hitFmt(rotContacts[r]?.hit_pct), hi: false },
  ];

  // Find best rotation per highlighted row
  function bestRot(rowFmt, higherBetter = true) {
    let best = null, bestVal = higherBetter ? -Infinity : Infinity;
    for (const r of ROTATIONS) {
      const raw = rowFmt === 'so' ? rotPts[r]?.so_pct
        : rowFmt === 'bp' ? rotPts[r]?.bp_pct
        : rowFmt === 'win' ? rotPts[r]?.win_pct : null;
      if (raw != null && (higherBetter ? raw > bestVal : raw < bestVal)) {
        bestVal = raw; best = r;
      }
    }
    return best;
  }

  return (
    <div className="px-4 pt-3 pb-4">
      <div className="text-xs font-bold uppercase tracking-widest text-slate-500 text-center mb-2">
        Rotation Analysis
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-center min-w-[320px]">
          <thead>
            <tr>
              <th className="text-left text-[10px] text-slate-600 pr-2 pb-1 uppercase tracking-wide w-12">Stat</th>
              {ROTATIONS.map((r) => (
                <th key={r} className="text-[11px] font-black text-orange-400 pb-1">R{r}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              if (row === null) return (
                <tr key={`div-${i}`}><td colSpan={7} className="py-0.5"><div className="border-t border-slate-800" /></td></tr>
              );
              return (
                <tr key={row.label} className="border-b border-slate-800/50">
                  <td className="text-left text-[10px] text-slate-500 uppercase tracking-wide pr-2 py-1">{row.label}</td>
                  {ROTATIONS.map((r) => {
                    const val = row.fmt(r);
                    const hasData = rotPts[r]?.pts_total > 0 || (rotContacts[r] && (rotContacts[r].k > 0 || rotContacts[r].sa > 0 || rotContacts[r].pa > 0));
                    return (
                      <td
                        key={r}
                        className={`text-[12px] font-bold tabular-nums py-1 ${hasData ? 'text-slate-200' : 'text-slate-700'}`}
                      >
                        {val}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-slate-600 mt-2 text-center">
        S/O% = sideout when receiving · SRV% = point scored when serving
      </p>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function LiveStatsModal({ open, onClose, teamName, opponentName, recordAlerts = [], defaultTab = null }) {
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

  const ourScore     = useMatchStore((s) => s.ourScore);
  const oppScore     = useMatchStore((s) => s.oppScore);
  const ourSetsWon   = useMatchStore((s) => s.ourSetsWon);
  const oppSetsWon   = useMatchStore((s) => s.oppSetsWon);
  const setNumber    = useMatchStore((s) => s.setNumber);
  const format       = useMatchStore((s) => s.format);
  const matchId      = useMatchStore((s) => s.matchId);
  const pointHistory  = useMatchStore((s) => s.pointHistory);
  const lineup        = useMatchStore((s) => s.lineup);
  const currentSetId  = useMatchStore((s) => s.currentSetId);
  const committedContacts = useMatchStore((s) => s.committedContacts);

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
  const currentSetRallies = useLiveQuery(
    () => currentSetId ? db.rallies.where('set_id').equals(currentSetId).toArray() : [],
    [currentSetId]
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

  const setRotPts   = useMemo(() => buildRotPts(currentSetRallies),  [currentSetRallies]);
  const matchRotPts = useMemo(() => buildRotPts(allMatchRallies),    [allMatchRallies]);

  const setRotContacts   = useMemo(
    () => computeRotationContactStats(committedContacts.filter((c) => c.set_id === currentSetId)),
    [committedContacts, currentSetId]
  );
  const matchRotContacts = useMemo(
    () => computeRotationContactStats(allMatchContacts ?? []),
    [allMatchContacts]
  );

  if (!open) return null;

  const t          = scope === 'set' ? teamStats       : matchTeamStats;
  const opp        = scope === 'set' ? oppStats        : matchOppStats;
  const rotPts     = scope === 'set' ? setRotPts       : matchRotPts;
  const rotContacts = scope === 'set' ? setRotContacts : matchRotContacts;

  const rows = lineup
    .filter((sl) => sl.playerId)
    .map((sl) => ({
      id:   sl.playerId,
      name: sl.playerName,
      ...(playerStats[sl.playerId] ?? {}),
    }));

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
                ? <div className="p-4"><PointQualityPanel pq={pointQuality} /></div>
                : activeTab === 'RECORDS'
                ? <RecordAlertPanel alerts={recordAlerts} />
                : <StatTable columns={activeColumns} rows={rows} />
              }
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
