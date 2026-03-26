import { memo, useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useShallow } from 'zustand/react/shallow';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMatchStore } from '../../store/matchStore';
import { useMatchStats } from '../../hooks/useMatchStats';
import { db } from '../../db/schema';
import { computeTeamStats, computeOppDisplayStats, computeRotationStats, computeRotationContactStats, computeISvsOOS, computeFreeDigWin, computeTransitionAttack, computePlayerStats } from '../../stats/engine';
import { StatTable } from './StatTable';
import { PointQualityPanel } from './PointQualityPanel';
import { computeMilestone } from '../../hooks/useRecordAlerts';
import { TRACKABLE_STATS } from '../../constants';
import { fmtCount, fmtPct, fmtHitting, fmtPassRating, fmtVER } from '../../stats/formatters';

const TABS = ['POINTS', 'SERVING', 'PASSING', 'ATTACKING', 'BLOCKING', 'DEFENSE', 'VER', 'RECORDS'];

const SERVE_VIEWS = ['ALL', 'FLOAT', 'TOP'];

const SERVING_COLS = {
  ALL: [
    { key: 'name',     label: 'Player' },
    { key: 'sa',       label: 'SA',    fmt: fmtCount },
    { key: 'ace',      label: 'ACE',   fmt: fmtCount },
    { key: 'se',       label: 'SE',    fmt: fmtCount },
    { key: 'se_ob',    label: 'SOB',   fmt: fmtCount },
    { key: 'se_net',   label: 'SNET',  fmt: fmtCount },
    { key: 'ace_pct',  label: 'ACE%',  fmt: fmtPct },
    { key: 'se_pct',   label: 'SE%',   fmt: fmtPct },
    { key: 'si_pct',   label: 'S%',    fmt: fmtPct },
    { key: 'sob_pct',  label: 'SOB%',  fmt: fmtPct },
    { key: 'snet_pct', label: 'SNET%', fmt: fmtPct },
  ],
  FLOAT: [
    { key: 'name',      label: 'Player' },
    { key: 'f_sa',      label: 'SA',   fmt: fmtCount },
    { key: 'f_ace',     label: 'ACE',  fmt: fmtCount },
    { key: 'f_se',      label: 'SE',   fmt: fmtCount },
    { key: 'f_ace_pct', label: 'ACE%', fmt: fmtPct },
    { key: 'f_se_pct',  label: 'SE%',  fmt: fmtPct },
    { key: 'f_si_pct',  label: 'S%',   fmt: fmtPct },
  ],
  TOP: [
    { key: 'name',      label: 'Player' },
    { key: 't_sa',      label: 'SA',   fmt: fmtCount },
    { key: 't_ace',     label: 'ACE',  fmt: fmtCount },
    { key: 't_se',      label: 'SE',   fmt: fmtCount },
    { key: 't_ace_pct', label: 'ACE%', fmt: fmtPct },
    { key: 't_se_pct',  label: 'SE%',  fmt: fmtPct },
    { key: 't_si_pct',  label: 'S%',   fmt: fmtPct },
  ],
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
    { key: 'ver',  label: 'VER',  fmt: fmtVER   },
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

// ── Serve Zone Stats Panel ────────────────────────────────────────────────────
const SERVE_ZONE_GRID = [
  [1, 6, 5],
  [2, 3, 4],
];
const SZ_W = 270, SZ_H = 180;

function ServeZoneStatsPanel({ contacts }) {
  const zoned = contacts.filter(c => c.action === 'serve' && c.zone != null);

  if (zoned.length === 0) {
    return (
      <div className="p-4 text-center text-slate-600 text-xs">
        No serve zone data yet — tap a zone after each serve
      </div>
    );
  }

  // Per-zone counts
  const stats = {};
  for (let z = 1; z <= 6; z++) stats[z] = { total: 0, ace: 0, in: 0 };
  for (const c of zoned) {
    const z = c.zone;
    if (!stats[z]) continue;
    stats[z].total += 1;
    if (c.result === 'ace') stats[z].ace += 1;
    if (c.result === 'in')  stats[z].in  += 1;
  }

  const maxTotal = Math.max(1, ...Object.values(stats).map(s => s.total));

  return (
    <div className="border-t border-slate-800 p-4 space-y-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Serve Zone Breakdown</p>

      {/* Court heatmap */}
      <div className="flex justify-center">
        <div className="flex flex-col items-center gap-1">
          <svg viewBox={`0 0 ${SZ_W} ${SZ_H}`} width={SZ_W} height={SZ_H} style={{ maxWidth: '100%' }} className="rounded overflow-hidden">
            <rect width={SZ_W} height={SZ_H} fill="#0f172a" />
            {SERVE_ZONE_GRID.map((row, ri) =>
              row.map((zone, ci) => {
                const x = ci * (SZ_W / 3);
                const y = ri * (SZ_H / 2);
                const s = stats[zone];
                const t = s.total ? Math.log1p(s.total) / Math.log1p(maxTotal) : 0;
                // Interpolate blue (cold) → red (hot) via RGB
                const r = Math.round(t * 220);
                const g = 0;
                const b = Math.round((1 - t) * 220);
                const cellFill = s.total ? `rgb(${r},${g},${b})` : '#0f172a';
                const cellOpacity = s.total ? 0.15 + 0.85 * t : 1;
                return (
                  <g key={zone}>
                    <rect x={x} y={y} width={SZ_W/3} height={SZ_H/2}
                      fill={cellFill} opacity={cellOpacity} stroke="#1e293b" strokeWidth={1} />
                    <text x={x + SZ_W/6} y={y + SZ_H/4 - 6}
                      textAnchor="middle" dominantBaseline="middle"
                      fill="rgba(255,255,255,0.4)" fontSize={10}>Z{zone}</text>
                    <text x={x + SZ_W/6} y={y + SZ_H/4 + 8}
                      textAnchor="middle" dominantBaseline="middle"
                      fill={t > 0.35 ? '#fff' : '#94a3b8'} fontSize={16} fontWeight="bold">
                      {s.total}
                    </text>
                    {s.ace > 0 && (
                      <text x={x + SZ_W/6} y={y + SZ_H/4 + 22}
                        textAnchor="middle" dominantBaseline="middle"
                        fill="#f59e0b" fontSize={10}>
                        {s.ace}★
                      </text>
                    )}
                  </g>
                );
              })
            )}
            {/* Net at bottom */}
            <line x1={0} y1={SZ_H - 2} x2={SZ_W} y2={SZ_H - 2} stroke="#f97316" strokeWidth={2} strokeDasharray="6 3" opacity={0.7} />
          </svg>
          <span className="text-[9px] font-bold uppercase tracking-widest text-orange-400">NET</span>
        </div>
      </div>

      {/* Zone breakdown table */}
      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate-500 border-b border-slate-800">
            <th className="text-left py-1 font-semibold">Zone</th>
            <th className="text-right py-1 font-semibold">Total</th>
            <th className="text-right py-1 font-semibold">ACE</th>
            <th className="text-right py-1 font-semibold">IN</th>
            <th className="text-right py-1 font-semibold">ACE%</th>
            <th className="text-right py-1 font-semibold">IN%</th>
          </tr>
        </thead>
        <tbody>
          {[1,2,3,4,5,6].filter(z => stats[z].total > 0).map(z => {
            const s = stats[z];
            const acePct = s.total ? Math.round(s.ace / s.total * 100) : 0;
            const inPct  = s.total ? Math.round((s.ace + s.in) / s.total * 100) : 0;
            return (
              <tr key={z} className="border-b border-slate-800/50 text-slate-300">
                <td className="py-1 font-semibold text-slate-400">Z{z}</td>
                <td className="text-right py-1 tabular-nums">{s.total}</td>
                <td className="text-right py-1 tabular-nums text-amber-400">{s.ace}</td>
                <td className="text-right py-1 tabular-nums">{s.in}</td>
                <td className="text-right py-1 tabular-nums">{acePct}%</td>
                <td className="text-right py-1 tabular-nums">{inPct}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[9px] text-slate-600 text-center">Red = high frequency · Blue = low frequency · ★ = ace count</p>
    </div>
  );
}

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
const hitFmt = fmtHitting;
const n     = (v) => v ?? 0;

function RotationTable({ rotPts, rotContacts }) {
  const ROTATIONS = [1, 2, 3, 4, 5, 6];

  const rows = [
    { label: 'WIN%',  fmt: (r) => pct(rotPts[r]?.win_pct)    },
    { label: 'S/O%',  fmt: (r) => pct(rotPts[r]?.so_pct)     },
    { label: 'SRV%',  fmt: (r) => pct(rotPts[r]?.bp_pct)     },
    { label: 'PTS W', fmt: (r) => n(rotPts[r]?.pts_won)      },
    { label: 'PTS L', fmt: (r) => n(rotPts[r]?.pts_lost)     },
    null, // divider
    { label: 'K',     fmt: (r) => n(rotContacts[r]?.k)       },
    { label: 'ACE',   fmt: (r) => n(rotContacts[r]?.ace)     },
    { label: 'ERR',   fmt: (r) => n(rotContacts[r]?.ae) + n(rotContacts[r]?.se) },
    { label: 'APR',   fmt: (r) => dec1(rotContacts[r]?.apr)  },
    { label: 'HIT%',  fmt: (r) => hitFmt(rotContacts[r]?.hit_pct) },
  ];

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

// ── In-System / Out-of-System Table ──────────────────────────────────────────
function ISvsOOSTable({ data, freeDigData, transAtkData }) {
  const ROTATIONS = [1, 2, 3, 4, 5, 6];
  const pctFmt = (won, pa) => pa > 0 ? Math.round(won / pa * 100) + '%' : '—';
  const cntFmt = (v) => v > 0 ? v : '—';
  const effFmt = fmtHitting;

  const rows = [
    {
      label:     'IS ATK',
      labelCls:  'text-emerald-700',
      fmt:       (r) => cntFmt(n(data.byRotation[r]?.is?.ta)),
      total:     ()  => cntFmt(n(data.total.is?.ta)),
    },
    {
      label:     'IS K%',
      labelCls:  'text-emerald-700',
      fmt:       (r) => pctFmt(data.byRotation[r]?.is?.k ?? 0, data.byRotation[r]?.is?.ta ?? 0),
      total:     ()  => pctFmt(data.total.is?.k, data.total.is?.ta),
    },
    {
      label:     'IS HIT%',
      labelCls:  'text-emerald-700',
      fmt:       (r) => effFmt(data.byRotation[r]?.is?.hit_pct),
      total:     ()  => effFmt(data.total.is?.hit_pct),
    },
    {
      label:     'IS WIN%',
      labelCls:  'text-emerald-700',
      fmt:       (r) => pctFmt(data.byRotation[r]?.is?.win ?? 0, data.byRotation[r]?.is?.ta ?? 0),
      total:     ()  => pctFmt(data.total.is?.win, data.total.is?.ta),
    },
    null,
    {
      label:     'OOS ATK',
      labelCls:  'text-amber-700',
      fmt:       (r) => cntFmt(n(data.byRotation[r]?.oos?.ta)),
      total:     ()  => cntFmt(n(data.total.oos?.ta)),
    },
    {
      label:     'OOS K%',
      labelCls:  'text-amber-700',
      fmt:       (r) => pctFmt(data.byRotation[r]?.oos?.k ?? 0, data.byRotation[r]?.oos?.ta ?? 0),
      total:     ()  => pctFmt(data.total.oos?.k, data.total.oos?.ta),
    },
    {
      label:     'OOS HIT%',
      labelCls:  'text-amber-700',
      fmt:       (r) => effFmt(data.byRotation[r]?.oos?.hit_pct),
      total:     ()  => effFmt(data.total.oos?.hit_pct),
    },
    {
      label:     'OOS WIN%',
      labelCls:  'text-amber-700',
      fmt:       (r) => pctFmt(data.byRotation[r]?.oos?.win ?? 0, data.byRotation[r]?.oos?.ta ?? 0),
      total:     ()  => pctFmt(data.total.oos?.win, data.total.oos?.ta),
    },
    null,
    {
      label:     'FREE Dig',
      labelCls:  'text-cyan-700',
      fmt:       (r) => cntFmt(n(freeDigData.byRotation[r]?.fb_dig)),
      total:     ()  => cntFmt(n(freeDigData.total.fb_dig)),
    },
    {
      label:     'FREEWIN%',
      labelCls:  'text-cyan-700',
      fmt:       (r) => pctFmt(freeDigData.byRotation[r]?.fb_won ?? 0, freeDigData.byRotation[r]?.fb_dig ?? 0),
      total:     ()  => pctFmt(freeDigData.total.fb_won, freeDigData.total.fb_dig),
    },
    null,
    {
      label:     'FREE ATK',
      labelCls:  'text-cyan-600',
      fmt:       (r) => cntFmt(n(transAtkData.free.byRotation[r]?.ta)),
      total:     ()  => cntFmt(n(transAtkData.free.total.ta)),
    },
    {
      label:     'FREE K%',
      labelCls:  'text-cyan-600',
      fmt:       (r) => pctFmt(transAtkData.free.byRotation[r]?.k ?? 0, transAtkData.free.byRotation[r]?.ta ?? 0),
      total:     ()  => pctFmt(transAtkData.free.total.k, transAtkData.free.total.ta),
    },
    {
      label:     'FREE HIT%',
      labelCls:  'text-cyan-600',
      fmt:       (r) => effFmt(transAtkData.free.byRotation[r]?.hit_pct),
      total:     ()  => effFmt(transAtkData.free.total.hit_pct),
    },
    {
      label:     'FREE WIN%',
      labelCls:  'text-cyan-600',
      fmt:       (r) => pctFmt(transAtkData.free.byRotation[r]?.win ?? 0, transAtkData.free.byRotation[r]?.ta ?? 0),
      total:     ()  => pctFmt(transAtkData.free.total.win, transAtkData.free.total.ta),
    },
    null,
    {
      label:     'TRANS ATK',
      labelCls:  'text-violet-600',
      fmt:       (r) => cntFmt(n(transAtkData.transition.byRotation[r]?.ta)),
      total:     ()  => cntFmt(n(transAtkData.transition.total.ta)),
    },
    {
      label:     'TRANS K%',
      labelCls:  'text-violet-600',
      fmt:       (r) => pctFmt(transAtkData.transition.byRotation[r]?.k ?? 0, transAtkData.transition.byRotation[r]?.ta ?? 0),
      total:     ()  => pctFmt(transAtkData.transition.total.k, transAtkData.transition.total.ta),
    },
    {
      label:     'TRANS HIT%',
      labelCls:  'text-violet-600',
      fmt:       (r) => effFmt(transAtkData.transition.byRotation[r]?.hit_pct),
      total:     ()  => effFmt(transAtkData.transition.total.hit_pct),
    },
    {
      label:     'TRANS WIN%',
      labelCls:  'text-violet-600',
      fmt:       (r) => pctFmt(transAtkData.transition.byRotation[r]?.win ?? 0, transAtkData.transition.byRotation[r]?.ta ?? 0),
      total:     ()  => pctFmt(transAtkData.transition.total.win, transAtkData.transition.total.ta),
    },
  ];

  return (
    <div className="px-4 pt-3 pb-4">
      <div className="text-xs font-bold uppercase tracking-widest text-slate-500 text-center mb-2">
        In-System / Out-of-System
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-center min-w-[340px]">
          <thead>
            <tr>
              <th className="text-left text-[10px] text-slate-600 pr-2 pb-1 uppercase tracking-wide w-14">Stat</th>
              {ROTATIONS.map((r) => (
                <th key={r} className="text-[11px] font-black text-orange-400 pb-1">R{r}</th>
              ))}
              <th className="text-[11px] font-black text-slate-400 pb-1">TOT</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              if (row === null) return (
                <tr key={`div-${i}`}><td colSpan={8} className="py-0.5"><div className="border-t border-slate-800" /></td></tr>
              );
              return (
                <tr key={row.label} className="border-b border-slate-800/50">
                  <td className={`text-left text-[10px] uppercase tracking-wide pr-2 py-1 font-semibold ${row.labelCls}`}>
                    {row.label}
                  </td>
                  {ROTATIONS.map((r) => {
                    const val = row.fmt(r);
                    return (
                      <td key={r} className={`text-[12px] font-bold tabular-nums py-1 ${val !== '—' ? 'text-slate-200' : 'text-slate-700'}`}>
                        {val}
                      </td>
                    );
                  })}
                  <td className="text-[12px] font-bold tabular-nums py-1 text-slate-300">
                    {row.total()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-slate-600 mt-2 text-center">
        IS/OOS = serve rec pass rating · FREE = freeball dig · TRANS = any dig
      </p>
    </div>
  );
}

// ── Offense Balance Chart ─────────────────────────────────────────────────────
const POS_CFG = {
  OH:    { label: 'OH',    barCls: 'bg-orange-500', textCls: 'text-orange-400' },
  MB:    { label: 'MB',    barCls: 'bg-indigo-500', textCls: 'text-indigo-400' },
  OPP:   { label: 'OPP',  barCls: 'bg-purple-500', textCls: 'text-purple-400' },
  Other: { label: 'Other', barCls: 'bg-slate-500',  textCls: 'text-slate-400'  },
};
const PRIMARY_POS = ['OH', 'MB', 'OPP'];

function buildPosGroups(playerStats, positionMap) {
  const acc = {};
  for (const key of [...PRIMARY_POS, 'Other']) acc[key] = { ta: 0, k: 0, ae: 0 };
  for (const [playerId, s] of Object.entries(playerStats)) {
    const pos = positionMap[Number(playerId)] ?? positionMap[playerId];
    const grp = PRIMARY_POS.includes(pos) ? pos : 'Other';
    acc[grp].ta += s.ta ?? 0;
    acc[grp].k  += s.k  ?? 0;
    acc[grp].ae += s.ae ?? 0;
  }
  return [...PRIMARY_POS, 'Other']
    .map((pos) => ({ pos, ...acc[pos], hit_pct: acc[pos].ta > 0 ? (acc[pos].k - acc[pos].ae) / acc[pos].ta : null }))
    .filter((g) => g.ta > 0);
}

function OffenseBalanceChart({ setPlayerStats, matchPlayerStats, positionMap }) {
  const [scope, setScope] = useState('set');
  const playerStats = scope === 'set' ? setPlayerStats : matchPlayerStats;
  const groups = useMemo(() => buildPosGroups(playerStats, positionMap), [playerStats, positionMap]);

  const totalK  = groups.reduce((s, g) => s + g.k,  0);
  const totalTA = groups.reduce((s, g) => s + g.ta, 0);
  const totalAE = groups.reduce((s, g) => s + g.ae, 0);
  const teamHit = totalTA > 0 ? (totalK - totalAE) / totalTA : null;

  return (
    <div className="px-4 pt-3 pb-5">
      {/* Header + toggle */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
          Offense Balance
        </span>
        <div className="flex gap-1">
          {['set', 'match'].map((s) => (
            <button
              key={s}
              onPointerDown={(e) => { e.preventDefault(); setScope(s); }}
              className={`px-2.5 py-0.5 rounded text-[10px] font-bold transition-colors ${
                scope === s ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
              }`}
            >
              {s.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {totalTA === 0 ? (
        <p className="text-xs text-slate-600 text-center py-3">No attack data yet</p>
      ) : (
        <>
          {/* Kill distribution — stacked bar */}
          <div className="mb-4">
            <p className="text-[10px] text-slate-600 mb-1.5 text-center uppercase tracking-wide">Kill Share</p>
            <div className="flex h-6 rounded overflow-hidden gap-px">
              {groups.map((g) => {
                const pct = totalK > 0 ? (g.k / totalK) * 100 : 0;
                if (pct === 0) return null;
                const cfg = POS_CFG[g.pos] ?? POS_CFG.Other;
                return (
                  <div
                    key={g.pos}
                    style={{ width: `${pct}%` }}
                    className={`${cfg.barCls} flex items-center justify-center text-[9px] font-black text-white/90 transition-all`}
                  >
                    {pct >= 11 ? g.pos : ''}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-center gap-4 mt-1.5 flex-wrap">
              {groups.map((g) => {
                const pct = totalK > 0 ? Math.round(g.k / totalK * 100) : 0;
                const cfg = POS_CFG[g.pos] ?? POS_CFG.Other;
                return (
                  <span key={g.pos} className={`text-[10px] font-bold ${cfg.textCls}`}>
                    {g.pos} {pct}% ({g.k}K)
                  </span>
                );
              })}
            </div>
          </div>

          {/* TA share — per-position bars */}
          <div className="mb-4">
            <p className="text-[10px] text-slate-600 mb-1.5 text-center uppercase tracking-wide">Attack Volume (TA)</p>
            <div className="space-y-1.5">
              {groups.map((g) => {
                const pct = totalTA > 0 ? (g.ta / totalTA) * 100 : 0;
                const cfg = POS_CFG[g.pos] ?? POS_CFG.Other;
                return (
                  <div key={g.pos} className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold w-8 text-right ${cfg.textCls}`}>{g.pos}</span>
                    <div className="flex-1 h-3 bg-slate-800 rounded overflow-hidden">
                      <div className={`h-full ${cfg.barCls} rounded transition-all opacity-80`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[10px] text-slate-400 tabular-nums w-16 text-right">{Math.round(pct)}% · {g.ta}ta</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Stats table */}
          <table className="w-full">
            <thead>
              <tr className="text-[10px] text-slate-600 uppercase tracking-wide border-b border-slate-800">
                <th className="text-left pb-1">Pos</th>
                <th className="pb-1">TA</th>
                <th className="pb-1">K</th>
                <th className="pb-1">AE</th>
                <th className="pb-1">HIT%</th>
                <th className="pb-1">K%</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const cfg = POS_CFG[g.pos] ?? POS_CFG.Other;
                const hitStr = fmtHitting(g.hit_pct);
                const kPct = g.ta > 0 ? Math.round(g.k / g.ta * 100) + '%' : '—';
                return (
                  <tr key={g.pos} className="border-b border-slate-800/50">
                    <td className={`text-left text-xs font-bold py-1.5 ${cfg.textCls}`}>{g.pos}</td>
                    <td className="text-center text-xs tabular-nums text-slate-300 py-1.5">{g.ta}</td>
                    <td className="text-center text-xs tabular-nums text-slate-300 py-1.5">{g.k}</td>
                    <td className="text-center text-xs tabular-nums text-slate-300 py-1.5">{g.ae}</td>
                    <td className="text-center text-xs tabular-nums font-bold text-slate-200 py-1.5">{hitStr}</td>
                    <td className="text-center text-xs tabular-nums text-slate-300 py-1.5">{kPct}</td>
                  </tr>
                );
              })}
              <tr className="text-[10px] text-slate-500 uppercase">
                <td className="text-left pt-1.5 font-semibold">TEAM</td>
                <td className="text-center pt-1.5 tabular-nums">{totalTA}</td>
                <td className="text-center pt-1.5 tabular-nums">{totalK}</td>
                <td className="text-center pt-1.5 tabular-nums">{totalAE}</td>
                <td className="text-center pt-1.5 tabular-nums font-bold text-slate-400">
                  {teamHit != null ? (teamHit >= 0 ? '+' : '') + (teamHit * 1000).toFixed(0) : '—'}
                </td>
                <td className="text-center pt-1.5 tabular-nums">
                  {totalTA > 0 ? Math.round(totalK / totalTA * 100) + '%' : '—'}
                </td>
              </tr>
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

// Stable empty fallbacks — hoisted to avoid recreation on every render
const _emptyISSlot  = () => ({ ta:0, k:0, ae:0, win:0, k_pct:null, hit_pct:null, win_pct:null });
const _emptyISGroup = () => ({ is: _emptyISSlot(), oos: _emptyISSlot() });
const EMPTY_ISVSOOS = { byRotation: Object.fromEntries(Array.from({length:6},(_,i)=>[i+1,_emptyISGroup()])), total: _emptyISGroup() };
const EMPTY_FREEDIG  = { byRotation: Object.fromEntries(Array.from({length:6},(_,i)=>[i+1,{fb_dig:0,fb_won:0}])), total: {fb_dig:0,fb_won:0} };
const _emptyAtkSlot  = () => ({ ta:0, k:0, ae:0, win:0, hit_pct:null, k_pct:null, win_pct:null });
const _emptyAtkGroup = () => ({ total: _emptyAtkSlot(), byRotation: Object.fromEntries(Array.from({length:6},(_,i)=>[i+1,_emptyAtkSlot()])) });
const EMPTY_TRANSATK = { free: _emptyAtkGroup(), transition: _emptyAtkGroup() };

// ── Records Progress Panel ────────────────────────────────────────────────────

const MILESTONE_BADGE = {
  beat:     { icon: '🏆', cls: 'bg-yellow-500/20 border-yellow-500 text-yellow-300', short: 'RECORD' },
  tie:      { icon: '⚡', cls: 'bg-slate-400/20 border-slate-300 text-slate-200',   short: 'TIED'   },
  one_away: { icon: '🔥', cls: 'bg-orange-500/20 border-orange-400 text-orange-300', short: '1 AWAY' },
  pct90:    { icon: '▲',  cls: 'bg-yellow-600/20 border-yellow-500 text-yellow-400', short: '90%+'   },
  pct80:    { icon: '▲',  cls: 'bg-green-600/20  border-green-500  text-green-400',  short: '80%+'   },
};

function RecordRow({ record, playerStats, teamStats }) {
  const statDef = TRACKABLE_STATS.find((s) => s.key === record.stat);
  if (!statDef) return null;
  const recordVal = parseFloat(record.value);
  if (isNaN(recordVal) || recordVal <= 0) return null;

  const currentVal = record.type === 'team_match'
    ? (teamStats?.[statDef.key] ?? 0)
    : (playerStats?.[record.player_id]?.[statDef.key] ?? 0);

  const milestone = computeMilestone(currentVal, recordVal, statDef.type);
  const badge     = milestone ? MILESTONE_BADGE[milestone] : null;
  const fillPct   = Math.min(currentVal / recordVal, 1);

  const barCls =
    milestone === 'beat'     ? 'bg-yellow-400' :
    milestone === 'tie'      ? 'bg-slate-300'  :
    milestone === 'one_away' ? 'bg-orange-400' :
    milestone === 'pct90'    ? 'bg-yellow-500' :
    milestone === 'pct80'    ? 'bg-green-500'  :
    'bg-slate-600';

  const displayCurr = statDef.type === 'rate' ? Number(currentVal).toFixed(3) : currentVal;
  const displayRec  = statDef.type === 'rate' ? recordVal.toFixed(3) : recordVal;
  const remaining   = statDef.type === 'count' && milestone !== 'beat' && milestone !== 'tie'
    ? Math.ceil(recordVal - currentVal)
    : null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="text-xs text-slate-400 truncate">{statDef.label}</span>
          {badge && (
            <span className={`flex-shrink-0 text-[9px] font-black px-1 py-0.5 rounded border ${badge.cls}`}>
              {badge.icon} {badge.short}
            </span>
          )}
        </div>
        <div className="flex-shrink-0 flex items-baseline gap-1">
          <span className="font-black text-white tabular-nums">{displayCurr}</span>
          <span className="text-slate-500 text-xs">/ {displayRec}</span>
          {remaining !== null && remaining > 0 && (
            <span className="text-slate-600 text-[10px]">−{remaining}</span>
          )}
        </div>
      </div>
      <div className="h-1.5 bg-slate-700/80 rounded-full overflow-hidden">
        <div
          className={`h-full ${barCls} rounded-full transition-all duration-300`}
          style={{ width: `${Math.round(fillPct * 100)}%` }}
        />
      </div>
    </div>
  );
}

function RecordsProgressPanel({ records, playerStats, teamStats, lineup, roster }) {
  if (!(records ?? []).length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-8">
        <span className="text-3xl">📋</span>
        <p className="text-slate-300 font-semibold text-sm">No records set for this team</p>
        <p className="text-slate-500 text-xs">
          Go to Teams → [Team] → Records to add records. Individual Match and Team Match records show live progress here.
        </p>
      </div>
    );
  }

  // Build player info from roster + current lineup overrides
  const playerInfo = {};
  for (const p of roster ?? []) playerInfo[p.id] = { name: p.name, jersey: p.jersey_number };
  for (const sl of lineup) {
    if (sl.playerId) {
      playerInfo[sl.playerId] = {
        name:   playerInfo[sl.playerId]?.name   ?? sl.playerName,
        jersey: playerInfo[sl.playerId]?.jersey ?? sl.jersey,
      };
    }
  }

  const lineupPlayerIds = new Set(lineup.map((sl) => sl.playerId).filter(Boolean));

  // Separate live-trackable (match) records from season/reference records
  const liveRecords   = (records ?? []).filter((r) => r.type === 'individual_match' || r.type === 'team_match');
  const seasonRecords = (records ?? []).filter((r) => r.type === 'individual_season' || r.type === 'team_season');

  // Group live records: individual by player, team together
  const byPlayer = {};
  const teamMatchRecs = [];
  for (const r of liveRecords) {
    if (r.type === 'team_match') {
      teamMatchRecs.push(r);
    } else {
      const key = String(r.player_id ?? 'unknown');
      if (!byPlayer[key]) byPlayer[key] = [];
      byPlayer[key].push(r);
    }
  }

  // Sort players: on-court first, then bench
  const sortedPlayerIds = Object.keys(byPlayer).sort((a, b) => {
    const aIn = lineupPlayerIds.has(Number(a)) ? 0 : 1;
    const bIn = lineupPlayerIds.has(Number(b)) ? 0 : 1;
    return aIn - bIn;
  });

  return (
    <div className="p-4 space-y-4">

      {/* ── Live-tracked match records ── */}
      {liveRecords.length === 0 && (
        <p className="text-xs text-slate-500 text-center py-2">
          No Individual Match or Team Match records — add them in Teams → Records to see live progress.
        </p>
      )}

      {sortedPlayerIds.map((playerId) => {
        const id   = Number(playerId);
        const info = playerInfo[id];
        const recs = byPlayer[playerId];
        const lastName = info?.name ? info.name.split(' ').pop() : (recs[0]?.player_name ?? 'Player');
        const isOnCourt = lineupPlayerIds.has(id);
        return (
          <div key={playerId} className="bg-slate-800/50 rounded-xl p-3 space-y-3">
            <div className="flex items-center gap-2">
              {info?.jersey && <span className="text-xs font-mono text-slate-500">#{info.jersey}</span>}
              <span className="text-sm font-bold text-white">{lastName}</span>
              {!isOnCourt && <span className="text-[10px] text-slate-600 font-semibold uppercase tracking-wide">bench</span>}
            </div>
            {recs.map((r) => (
              <RecordRow key={r.id} record={r} playerStats={playerStats} teamStats={teamStats} />
            ))}
          </div>
        );
      })}

      {teamMatchRecs.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl p-3 space-y-3">
          <span className="text-sm font-bold text-white">Team</span>
          {teamMatchRecs.map((r) => (
            <RecordRow key={r.id} record={r} playerStats={playerStats} teamStats={teamStats} />
          ))}
        </div>
      )}

      {/* ── Season / reference records ── */}
      {seasonRecords.length > 0 && (
        <>
          <div className="border-t border-slate-700/60 pt-3">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold mb-3">Season Records (reference)</p>
            <div className="space-y-2">
              {seasonRecords.map((r) => {
                const isTeam   = r.type === 'team_season';
                const nameStr  = isTeam
                  ? 'Team'
                  : r.player_name ?? playerInfo[r.player_id]?.name ?? 'Player';
                const lastName = nameStr.split(' ').pop();
                const jersey   = !isTeam ? playerInfo[r.player_id]?.jersey : null;
                return (
                  <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 bg-slate-800/40 rounded-lg">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {jersey && <span className="text-xs font-mono text-slate-500 flex-shrink-0">#{jersey}</span>}
                      <span className="text-sm text-slate-300 font-semibold truncate">{lastName}</span>
                      <span className="text-xs text-slate-500 truncate">{r.stat}</span>
                    </div>
                    <div className="flex-shrink-0 flex items-baseline gap-1">
                      <span className="font-black text-white tabular-nums">{r.value}</span>
                      {r.opponent && <span className="text-[10px] text-slate-600">vs {r.opponent}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

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

  // All hooks must be called before any early return
  const rows = useMemo(() =>
    lineup
      .filter((sl) => sl.playerId)
      .map((sl) => ({ id: sl.playerId, name: sl.playerName, ...(playerStats[sl.playerId] ?? {}) })),
    [lineup, playerStats]
  );

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
                ? <div className="p-4 space-y-6">
                    <PointQualityPanel pq={pointQuality} oppScored={oppScore} />
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
                        {scoreTimelineCharts.map(({ set, pts, maxScore }) => (
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
