import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { computeMatchStats, computeSetTrends, computeRallyHistogram,
         computePlayerStats, computeTeamStats, computeRotationStats, computePointQuality,
         computeServeZoneStats } from '../stats/engine';
import { getRalliesForMatch } from '../stats/queries';
import { exportMatchCSV, exportMatchPDF, exportMaxPrepsCSV } from '../stats/export';
import { fmtHitting, fmtPassRating, fmtPct, fmtCount, fmtDate, fmtVER } from '../stats/formatters';
import { ROTATION_COLS, SERVING_COLS, TAB_COLUMNS } from '../stats/columns';
import { PageHeader } from '../components/layout/PageHeader';
import { TabBar } from '../components/ui/Tab';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { StatTable } from '../components/stats/StatTable';
import { RotationSpotlight } from '../components/stats/RotationSpotlight';
import { PointQualityPanel } from '../components/stats/PointQualityPanel';
import { RotationRadarChart } from '../components/charts/RotationRadarChart';
import { CourtHeatMap } from '../components/charts/CourtHeatMap';
import { ReviseSetModal } from '../components/match/ReviseSetModal';
import { BoxScoreEntryModal } from '../components/match/BoxScoreEntryModal';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';

// Zone layout (server's perspective, top = back row)
//   [1, 6, 5]
//   [2, 3, 4]
const ZONE_ROWS = [[1, 6, 5], [2, 3, 4]];

function ServeZoneGrid({ zones }) {
  const total = Object.values(zones).reduce((s, z) => s + z.sa, 0);
  if (!total) return null;
  return (
    <div className="mt-4">
      <p className="text-xs text-slate-400 mb-2 font-semibold uppercase tracking-wide">Serve Zone Distribution</p>
      <div className="grid grid-rows-2 gap-1">
        {ZONE_ROWS.map((row, ri) => (
          <div key={ri} className="grid grid-cols-3 gap-1">
            {row.map((z) => {
              const s = zones[z];
              const pct = total ? Math.round(s.sa / total * 100) : 0;
              const intensity = Math.min(pct / 40, 1); // saturate at 40%
              return (
                <div
                  key={z}
                  className="rounded-lg p-2 text-center relative overflow-hidden"
                  style={{ background: `rgba(249,115,22,${0.05 + intensity * 0.35})`, border: '1px solid rgba(249,115,22,0.2)' }}
                >
                  <div className="text-[10px] text-slate-400 font-bold">Z{z}</div>
                  <div className="text-base font-black text-white">{s.sa}</div>
                  <div className="text-[9px] text-slate-400">{pct}%</div>
                  {s.ace > 0 && <div className="text-[9px] text-yellow-400">{s.ace} ACE</div>}
                  {s.se  > 0 && <div className="text-[9px] text-red-400">{s.se} ERR</div>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

const RETICLE_ZONE_GRID = [[1, 6, 5], [2, 3, 4]];
const RW = 912, RH = 608;

function PlayerServePlacementCard({ player, contacts, playerJerseys }) {
  const [serveType, setServeType] = useState('all');

  const jersey = playerJerseys?.[player.id] ?? '';
  const pid    = Number(player.id);

  const serves = contacts.filter(c =>
    c.action === 'serve' && !c.opponent_contact &&
    c.player_id === pid && c.court_x != null &&
    (serveType === 'all' || c.serve_type === serveType)
  );

  const zoneCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  for (const c of serves) if (c.zone) zoneCounts[c.zone]++;

  return (
    <div className="mt-3 bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="font-bold text-white text-sm">
            {jersey ? `#${jersey} ` : ''}{player.name}
          </span>
          <span className="text-xs text-slate-400">
            {player.sa ?? 0} SA · {player.ace ?? 0} ACE · {fmtPct(player.si_pct)} SI%
          </span>
        </div>
        <SubToggle
          options={[['all', 'ALL'], ['float', 'FLOAT'], ['topspin', 'TOP SPIN']]}
          value={serveType}
          onChange={setServeType}
        />
      </div>

      {/* Court */}
      {serves.length === 0 ? (
        <p className="text-xs text-slate-500 text-center py-5">
          No serve placement data for this filter
        </p>
      ) : (
        <div className="px-3 pb-3">
          <div className="rounded-lg overflow-hidden" style={{ aspectRatio: `${RW} / ${RH}` }}>
            <svg viewBox={`0 0 ${RW} ${RH}`} style={{ width: '100%', height: '100%', display: 'block' }}>
              <rect width={RW} height={RH} fill="#0f172a" />

              {/* Zone cells with count overlay */}
              {RETICLE_ZONE_GRID.map((row, ri) =>
                row.map((zone, ci) => {
                  const x  = ci * (RW / 3);
                  const y  = ri * (RH / 2);
                  const ct = zoneCounts[zone] ?? 0;
                  return (
                    <g key={zone}>
                      <rect x={x} y={y} width={RW / 3} height={RH / 2}
                        fill="transparent" stroke="#334155" strokeWidth={1} />
                      <text x={x + RW / 6} y={y + RH / 4}
                        textAnchor="middle" dominantBaseline="middle"
                        fill="rgba(148,163,184,0.2)" fontSize={22} fontWeight="bold"
                      >{zone}</text>
                      {ct > 0 && (
                        <text x={x + RW / 3 - 10} y={y + 18}
                          textAnchor="end" dominantBaseline="middle"
                          fill="rgba(148,163,184,0.5)" fontSize={13} fontWeight="bold"
                        >×{ct}</text>
                      )}
                    </g>
                  );
                })
              )}

              {/* Net */}
              <line x1={0} y1={RH - 2} x2={RW} y2={RH - 2} stroke="#f97316" strokeWidth={3} />
              <text x={RW / 2} y={RH - 14} textAnchor="middle" dominantBaseline="middle"
                fill="#f97316" fontSize={18} fontWeight="bold" letterSpacing={4} opacity={0.75}
              >NET</text>

              {/* Reticles */}
              {serves.map((c) =>
                c.result === 'ace' ? (
                  <text key={c.id} x={c.court_x * RW} y={c.court_y * RH}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={16} fill="#f59e0b"
                  >★</text>
                ) : (
                  <circle key={c.id} cx={c.court_x * RW} cy={c.court_y * RH}
                    r={7} fill="rgba(52,211,153,0.2)" stroke="#34d399" strokeWidth={2}
                  />
                )
              )}
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}

function ServeReticlePlot({ contacts, serveType }) {
  const serves = contacts.filter(c =>
    c.action === 'serve' && !c.opponent_contact && c.court_x != null &&
    (serveType === 'all' || c.serve_type === serveType)
  );
  if (!serves.length) return null;
  const aces = serves.filter(c => c.result === 'ace').length;
  const ins  = serves.filter(c => c.result !== 'ace').length;

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Serve Placement</p>
        <div className="flex gap-3 text-xs text-slate-400">
          {aces > 0 && <span className="text-yellow-400 font-bold">★ {aces} ace{aces !== 1 ? 's' : ''}</span>}
          {ins > 0  && <span className="text-emerald-400 font-bold">○ {ins} in-play</span>}
        </div>
      </div>
      <div className="rounded-lg overflow-hidden" style={{ aspectRatio: `${RW} / ${RH}` }}>
        <svg viewBox={`0 0 ${RW} ${RH}`} style={{ width: '100%', height: '100%', display: 'block' }}>
          {/* Background */}
          <rect width={RW} height={RH} fill="#0f172a" />

          {/* Zone cells */}
          {RETICLE_ZONE_GRID.map((row, ri) =>
            row.map((zone, ci) => {
              const x = ci * (RW / 3);
              const y = ri * (RH / 2);
              return (
                <g key={zone}>
                  <rect x={x} y={y} width={RW / 3} height={RH / 2}
                    fill="transparent" stroke="#334155" strokeWidth={1} />
                  <text x={x + RW / 6} y={y + RH / 4}
                    textAnchor="middle" dominantBaseline="middle"
                    fill="rgba(148,163,184,0.25)" fontSize={22} fontWeight="bold"
                  >{zone}</text>
                </g>
              );
            })
          )}

          {/* Net line */}
          <line x1={0} y1={RH - 2} x2={RW} y2={RH - 2} stroke="#f97316" strokeWidth={3} />
          <text x={RW / 2} y={RH - 14} textAnchor="middle" dominantBaseline="middle"
            fill="#f97316" fontSize={18} fontWeight="bold" letterSpacing={4} opacity={0.75}
          >NET</text>

          {/* Reticles */}
          {serves.map((c) =>
            c.result === 'ace' ? (
              <text key={c.id} x={c.court_x * RW} y={c.court_y * RH}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={16} fill="#f59e0b"
              >★</text>
            ) : (
              <circle key={c.id} cx={c.court_x * RW} cy={c.court_y * RH}
                r={7} fill="rgba(52,211,153,0.2)" stroke="#34d399" strokeWidth={2}
              />
            )
          )}
        </svg>
      </div>
    </div>
  );
}

function SubToggle({ options, value, onChange }) {
  return (
    <div className="flex gap-1 mb-3">
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`flex-1 py-1.5 rounded text-xs font-bold transition-colors ${
            value === v ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const TABS = [
  { value: 'points',    label: 'Points'    },
  { value: 'trends',    label: 'Trends'    },
  { value: 'serving',   label: 'Serving'   },
  { value: 'passing',   label: 'Passing'   },
  { value: 'attacking', label: 'Attacking' },
  { value: 'blocking',  label: 'Blocking'  },
  { value: 'defense',   label: 'Defense'   },
  { value: 'compare',   label: 'Compare'   },
  { value: 'opponent',  label: 'Opp'       },
];

// ── Match Notes ──────────────────────────────────────────────────────────────

function MatchNotes({ matchId, initialNotes }) {
  const [notes, setNotes] = useState(initialNotes ?? '');
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  function handleChange(e) {
    const v = e.target.value;
    setNotes(v);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      db.matches.update(matchId, { notes: v });
    }, 600);
  }

  return (
    <div className="px-4 mt-3">
      <label className="block text-xs text-slate-400 mb-1 font-medium">Coach Notes</label>
      <textarea
        value={notes}
        onChange={handleChange}
        placeholder="Add notes about this match…"
        className="w-full bg-surface border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 resize-none focus:outline-none focus:border-primary/60 transition-colors"
        rows={3}
      />
    </div>
  );
}

// ── Set-by-Set Trend Chart ───────────────────────────────────────────────────

const TREND_METRICS = [
  { key: 'K%',   color: '#f97316', label: 'Kill %'     },
  { key: 'HIT%', color: '#60a5fa', label: 'Hitting %'  },
  { key: 'APR',  color: '#4ade80', label: 'Pass Rating' },
  { key: 'ACE%', color: '#c084fc', label: 'Ace %'      },
];

function SetTrendsChart({ contacts, sets }) {
  const [metric, setMetric] = useState('K%');
  const data = useMemo(() => computeSetTrends(contacts, sets), [contacts, sets]);
  const curr = TREND_METRICS.find(m => m.key === metric);

  if (!data.length) return <p className="text-slate-500 text-sm text-center py-6">No data yet.</p>;

  return (
    <div className="space-y-3">
      {/* Metric selector */}
      <div className="flex gap-1">
        {TREND_METRICS.map(m => (
          <button
            key={m.key}
            onClick={() => setMetric(m.key)}
            className={`flex-1 py-1.5 rounded text-xs font-bold transition-colors ${
              metric === m.key ? 'text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
            style={metric === m.key ? { backgroundColor: m.color + '33', color: m.color, border: `1px solid ${m.color}66` } : {}}
          >
            {m.key}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
          <Tooltip
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
            labelStyle={{ color: '#cbd5e1' }}
            itemStyle={{ color: curr?.color }}
          />
          <Bar dataKey={metric} radius={[4, 4, 0, 0]} fill={curr?.color ?? '#f97316'} />
        </BarChart>
      </ResponsiveContainer>

      {/* Per-set summary row */}
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${data.length}, 1fr)` }}>
        {data.map(d => (
          <div key={d.name} className="bg-surface rounded-lg p-2 text-center">
            <div className="text-xs text-slate-400">{d.name}</div>
            <div className="font-bold text-sm" style={{ color: curr?.color }}>
              {metric === 'APR' ? d[metric].toFixed(2) : `${d[metric]}%`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Player Comparison ────────────────────────────────────────────────────────

const COMPARE_STATS = [
  { key: 'k',       label: 'Kills',      fmt: fmtCount     },
  { key: 'ta',      label: 'Attacks',    fmt: fmtCount     },
  { key: 'k_pct',   label: 'K%',         fmt: fmtPct       },
  { key: 'hit_pct', label: 'HIT%',       fmt: fmtHitting   },
  { key: 'sa',      label: 'Serves',     fmt: fmtCount     },
  { key: 'ace',     label: 'Aces',       fmt: fmtCount     },
  { key: 'ace_pct', label: 'ACE%',       fmt: fmtPct       },
  { key: 'pa',      label: 'Passes',     fmt: fmtCount     },
  { key: 'apr',     label: 'APR',        fmt: fmtPassRating },
  { key: 'p3',      label: 'P3s',        fmt: fmtCount     },
  { key: 'dig',     label: 'Digs',       fmt: fmtCount     },
  { key: 'bs',      label: 'Solo Blks',  fmt: fmtCount     },
  { key: 'ba',      label: 'Blk Asst',   fmt: fmtCount     },
  { key: 'ast',     label: 'Assists',    fmt: fmtCount     },
];

const POS_COLORS = { S: '#60a5fa', OH: '#fb923c', MB: '#4ade80', OPP: '#c084fc', L: '#34d399', DS: '#94a3b8' };

function PlayerComparison({ playerRows }) {
  const ids = playerRows.map(r => String(r.id));
  const [p1Id, setP1Id] = useState(ids[0] ?? '');
  const [p2Id, setP2Id] = useState(ids[1] ?? '');

  const p1 = playerRows.find(r => String(r.id) === p1Id);
  const p2 = playerRows.find(r => String(r.id) === p2Id);

  function PlayerSelect({ value, onChange }) {
    return (
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="flex-1 bg-surface border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/60"
      >
        {playerRows.map(r => (
          <option key={r.id} value={String(r.id)}>{r.name}</option>
        ))}
      </select>
    );
  }

  function StatBar({ v1, v2 }) {
    const max = Math.max(v1 ?? 0, v2 ?? 0);
    if (!max) return null;
    const pct1 = max ? Math.round((v1 ?? 0) / max * 100) : 0;
    const pct2 = max ? Math.round((v2 ?? 0) / max * 100) : 0;
    return (
      <div className="flex gap-0.5 h-1 rounded-full overflow-hidden bg-slate-800 my-1">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct1}%` }} />
        <div className="flex-1" />
        <div className="h-full rounded-full bg-sky-400 transition-all" style={{ width: `${pct2}%` }} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <PlayerSelect value={p1Id} onChange={setP1Id} />
        <span className="self-center text-slate-500 font-bold text-sm">vs</span>
        <PlayerSelect value={p2Id} onChange={setP2Id} />
      </div>

      {p1 && p2 && (
        <>
          {/* Player header chips */}
          <div className="flex gap-2">
            {[p1, p2].map((p, i) => (
              <div key={p.id} className={`flex-1 rounded-xl p-3 text-center ${i === 0 ? 'bg-primary/15 border border-primary/30' : 'bg-sky-400/10 border border-sky-400/30'}`}>
                <div className="font-bold text-sm">{p.name}</div>
                {p.position && (
                  <div className="text-xs mt-0.5 font-semibold" style={{ color: POS_COLORS[p.position] ?? '#94a3b8' }}>
                    {p.position}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Stat rows */}
          <div className="bg-surface rounded-xl overflow-hidden">
            {COMPARE_STATS.map(({ key, label, fmt }) => {
              const v1 = p1[key];
              const v2 = p2[key];
              if (v1 == null && v2 == null) return null;
              const f1 = fmt ? fmt(v1) : (v1 ?? '—');
              const f2 = fmt ? fmt(v2) : (v2 ?? '—');
              if (f1 === '—' && f2 === '—') return null;
              const n1 = v1 ?? 0;
              const n2 = v2 ?? 0;
              const better1 = n1 > n2;
              const better2 = n2 > n1;
              return (
                <div key={key} className="px-3 py-2 border-b border-slate-700/50 last:border-0">
                  <div className="flex items-center">
                    <span className={`w-16 text-right text-sm font-bold tabular-nums ${better1 ? 'text-primary' : 'text-slate-300'}`}>{f1}</span>
                    <span className="flex-1 text-center text-xs text-slate-400 px-2">{label}</span>
                    <span className={`w-16 text-left text-sm font-bold tabular-nums ${better2 ? 'text-sky-400' : 'text-slate-300'}`}>{f2}</span>
                  </div>
                  <StatBar v1={n1} v2={n2} />
                </div>
              );
            })}
          </div>
        </>
      )}

      {playerRows.length < 2 && (
        <p className="text-slate-500 text-sm text-center py-6">Need at least 2 players with stats to compare.</p>
      )}
    </div>
  );
}

// ── Rotation Bar Chart ───────────────────────────────────────────────────────

function RotationBarChart({ rotationRows }) {
  const data = rotationRows.map(r => ({
    name: `R${r.id}`,
    'SO%': r.so_pct != null ? Math.round(r.so_pct * 100) : 0,
    'SP%': r.bp_pct != null ? Math.round(r.bp_pct * 100) : 0,
  }));

  if (!data.length) return null;

  return (
    <div>
      <div className="text-xs text-slate-400 font-medium mb-2 uppercase tracking-wider">SO% &amp; SP% by Rotation</div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} unit="%" domain={[0, 100]} />
          <Tooltip
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
            labelStyle={{ color: '#cbd5e1' }}
            formatter={(v) => `${v}%`}
          />
          <Bar dataKey="SO%" fill="#f97316" radius={[3, 3, 0, 0]} />
          <Bar dataKey="SP%" fill="#60a5fa" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Rally Length Histogram ───────────────────────────────────────────────────

function RallyHistogram({ contacts }) {
  const data = useMemo(() => computeRallyHistogram(contacts), [contacts]);
  const total = data.reduce((s, d) => s + d.rallies, 0);

  if (!total) return <p className="text-slate-500 text-sm text-center py-6">No rally data yet.</p>;

  const BAR_COLORS = ['#f97316', '#fb923c', '#fbbf24', '#4ade80', '#60a5fa'];

  return (
    <div>
      <div className="text-xs text-slate-400 font-medium mb-2 uppercase tracking-wider">
        Rally Length Distribution · {total} rallies
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} allowDecimals={false} />
          <Tooltip
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
            labelStyle={{ color: '#cbd5e1' }}
            formatter={(v, _name, props) => [`${v} rallies (${props.payload.pct}%)`, 'Count']}
          />
          <Bar dataKey="rallies" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={`cell-${i}`} fill={BAR_COLORS[i % BAR_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {/* Quick stat row */}
      <div className="grid grid-cols-2 gap-2 mt-2 text-center">
        <div className="bg-surface rounded-lg p-2">
          <div className="text-xs text-slate-400">Quick Points (1-hit)</div>
          <div className="font-bold text-primary">{data[0]?.pct ?? 0}%</div>
        </div>
        <div className="bg-surface rounded-lg p-2">
          <div className="text-xs text-slate-400">Long Rallies (7+)</div>
          <div className="font-bold text-sky-400">{((data[3]?.pct ?? 0) + (data[4]?.pct ?? 0))}%</div>
        </div>
      </div>
    </div>
  );
}

// ── Share Card ───────────────────────────────────────────────────────────────

const ShareCard = ({ cardRef, match, sets, stats, fmtDate }) => {
  if (!match || !stats) return null;
  const won = (match.our_sets_won ?? 0) > (match.opp_sets_won ?? 0);
  const completedSets = (sets ?? []).filter(s => s.status === 'complete');

  return (
    <div
      ref={cardRef}
      style={{
        position: 'absolute', left: '-9999px', top: 0,
        width: 380, background: '#0f172a', borderRadius: 16,
        padding: '20px 24px', fontFamily: 'system-ui, -apple-system, sans-serif',
        color: 'white', overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: '#f97316', textTransform: 'uppercase', marginBottom: 2 }}>
            VBSTAT · Match Result
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.1 }}>
            vs. {match.opponent_name ?? 'Opponent'}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
            {fmtDate(match.date)}{match.location ? ` · ${match.location}` : ''}
          </div>
        </div>
        <div style={{
          fontSize: 32, fontWeight: 900, letterSpacing: '-0.02em',
          color: won ? '#4ade80' : '#f87171', lineHeight: 1,
        }}>
          {won ? 'W' : 'L'} {match.our_sets_won ?? 0}–{match.opp_sets_won ?? 0}
        </div>
      </div>

      {/* Set score chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {completedSets.map(s => {
          const sw = s.our_score > s.opp_score;
          return (
            <div key={s.id} style={{
              background: sw ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)',
              border: `1px solid ${sw ? 'rgba(52,211,153,0.4)' : 'rgba(248,113,113,0.4)'}`,
              borderRadius: 8, padding: '3px 10px', fontSize: 13,
            }}>
              <span style={{ color: sw ? '#4ade80' : '#f87171', fontWeight: 700, marginRight: 4, fontSize: 10 }}>S{s.set_number}</span>
              <span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{s.our_score}–{s.opp_score}</span>
            </div>
          );
        })}
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid #334155', marginBottom: 14 }} />

      {/* Key stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, textAlign: 'center' }}>
        {[
          { label: 'HIT%',  val: fmtHitting(stats.team.hit_pct) },
          { label: 'ACE%',  val: fmtPct(stats.team.ace_pct)     },
          { label: 'APR',   val: fmtPassRating(stats.team.apr)  },
          { label: 'SO%',   val: fmtPct(stats.rotation.so_pct)  },
        ].map(({ label, val }) => (
          <div key={label} style={{ background: '#1e293b', borderRadius: 8, padding: '8px 4px' }}>
            <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#f97316' }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ marginTop: 14, fontSize: 10, color: '#475569', textAlign: 'right' }}>
        Tracked with VBSTAT by SHUA
      </div>
    </div>
  );
};

export function MatchSummaryPage() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const id = Number(matchId);

  const [tab, setTab] = useState('points');
  const [serveView,     setServeView]     = useState('all');
  const [selectedServingPlayerId, setSelectedServingPlayerId] = useState(null);
  const [trendsView,    setTrendsView]    = useState('trends');
  const [passingView,   setPassingView]   = useState('passing');
  const [stats, setStats] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [rawRallies, setRawRallies] = useState([]);
  const [selectedSetId, setSelectedSetId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statsError, setStatsError] = useState(null);
  const [sharingCard, setSharingCard] = useState(false);
  const shareCardRef    = useRef(null);
  const html2canvasRef  = useRef(null);
  const [reviseModalSet, setReviseModalSet] = useState(null);
  const [boxScoreSet, setBoxScoreSet] = useState(null);
  const [statsVersion, setStatsVersion] = useState(0);

  // Match + sets from Dexie (live)
  const match = useLiveQuery(() => db.matches.get(id), [id]);
  const sets   = useLiveQuery(() => db.sets.where('match_id').equals(id).sortBy('set_number'), [id]);

  // Players keyed by id for name lookup (match → season → team)
  const players = useLiveQuery(async () => {
    if (!match?.season_id) return {};
    const season = await db.seasons.get(match.season_id);
    if (!season?.team_id) return {};
    const list = await db.players.where('team_id').equals(season.team_id).toArray();
    return Object.fromEntries(list.map(p => [p.id, p]));
  }, [match?.season_id]);

  // Preload html2canvas so share-card handler has no cold-start delay
  useEffect(() => { import('html2canvas').then((m) => { html2canvasRef.current = m.default; }); }, []);

  // Compute stats once match data is ready (re-runs after a box score save)
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setStatsError(null);
    setSelectedSetId(null);
    Promise.all([computeMatchStats(id), getRalliesForMatch(id)])
      .then(([s, rallies]) => { setStats(s); setContacts(s.contacts); setRawRallies(rallies); })
      .catch((err) => {
        console.error('computeMatchStats failed', err);
        setStatsError(err?.message ?? 'Failed to load stats');
      })
      .finally(() => setLoading(false));
  }, [id, statsVersion]);

  const displayStats = useMemo(() => {
    if (!stats) return null;
    if (!selectedSetId) return stats;
    const fc = stats.contacts.filter(c => c.set_id === selectedSetId);
    const fr = rawRallies.filter(r => r.set_id === selectedSetId);
    return {
      ...stats,
      contacts:     fc,
      players:      computePlayerStats(fc, 1),
      team:         computeTeamStats(fc, 1),
      rotation:     computeRotationStats(fr),
      pointQuality: computePointQuality(fc),
      serveZones:   computeServeZoneStats(fc),
    };
  }, [stats, rawRallies, selectedSetId]);

  const playerNames   = useMemo(() => players
    ? Object.fromEntries(Object.entries(players).map(([pid, p]) => [pid, p.name]))
    : {}, [players]);
  const playerJerseys = useMemo(() => players
    ? Object.fromEntries(Object.entries(players).map(([pid, p]) => [pid, p.jersey_number ?? '']))
    : {}, [players]);
  const playerList = useMemo(() => players ? Object.values(players) : [], [players]);

  const playerRows = useMemo(() =>
    displayStats
      ? Object.entries(displayStats.players).map(([pid, s]) => ({
          id:   pid,
          name: playerNames[pid] ?? `#${pid}`,
          ...s,
        }))
      : [],
    [displayStats, playerNames]
  );

  const statTotals = useMemo(() => {
    if (!playerRows.length) return null;
    const sum = (key) => playerRows.reduce((acc, r) => acc + (r[key] ?? 0), 0);

    const sp = sum('sp'), mp = sum('mp');

    // Serving
    const sa = sum('sa'), ace = sum('ace'), se = sum('se'),
          se_ob = sum('se_ob'), se_net = sum('se_net');
    const f_sa = sum('f_sa'), f_ace = sum('f_ace'), f_se = sum('f_se');
    const t_sa = sum('t_sa'), t_ace = sum('t_ace'), t_se = sum('t_se');

    // Passing & setting
    const pa = sum('pa'), p0 = sum('p0'), p1 = sum('p1'),
          p2 = sum('p2'), p3 = sum('p3');
    const ast = sum('ast'), bhe = sum('bhe');

    // Attacking & blocking
    const ta = sum('ta'), k = sum('k'), ae = sum('ae');
    const bs = sum('bs'), ba = sum('ba'), be = sum('be');

    // Defense
    const dig = sum('dig'), de = sum('de'),
          fbr = sum('fbr'), fbs = sum('fbs');

    return {
      // Serving views
      all: {
        name: 'TOTAL', sp, mp, sa, ace, se, se_ob, se_net,
        ace_pct:  sa > 0 ? ace / sa : null,
        si_pct:   sa > 0 ? (sa - se) / sa : null,
        sob_pct:  sa > 0 ? se_ob / sa : null,
        snet_pct: sa > 0 ? se_net / sa : null,
      },
      float: {
        name: 'TOTAL', sp, mp, f_sa, f_ace, f_se,
        f_ace_pct: f_sa > 0 ? f_ace / f_sa : null,
        f_si_pct:  f_sa > 0 ? (f_sa - f_se) / f_sa : null,
      },
      top: {
        name: 'TOTAL', sp, mp, t_sa, t_ace, t_se,
        t_ace_pct: t_sa > 0 ? t_ace / t_sa : null,
        t_si_pct:  t_sa > 0 ? (t_sa - t_se) / t_sa : null,
      },
      // Passing views
      passing: {
        name: 'TOTAL', sp, mp, pa, p0, p1, p2, p3,
        apr:    pa > 0 ? (p1 + p2 * 2 + p3 * 3) / pa : null,
        pp_pct: pa > 0 ? p3 / pa : null,
      },
      setting: {
        name: 'TOTAL', sp, mp, ast, bhe,
        aps: sp > 0 ? ast / sp : null,
      },
      // Attacking views
      attacking: {
        name: 'TOTAL', sp, mp, ta, k, ae,
        hit_pct:   ta > 0 ? (k - ae) / ta : null,
        k_pct:     ta > 0 ? k / ta : null,
        kps:       sp > 0 ? k / sp : null,
        pos_label: null, pos_mult: null, ver: null,
      },
      blocking: {
        name: 'TOTAL', sp, mp, bs, ba, be,
        bps: sp > 0 ? (bs + ba * 0.5) / sp : null,
      },
      // Defense view
      defense: {
        name: 'TOTAL', sp, mp, dig, de, fbr, fbs,
        dips: sp > 0 ? dig / sp : null,
      },
    };
  }, [playerRows]);

  const rotationRows = useMemo(() =>
    displayStats
      ? Object.entries(displayStats.rotation.rotations).map(([n, r]) => ({
          id: n,
          name: `Rotation ${n}`,
          ...r,
        }))
      : [],
    [displayStats]
  );

  const matchMeta = match ? { ...match, sets: sets ?? [] } : {};

  function handlePDF() {
    if (!stats || !match) return;
    exportMatchPDF(matchMeta, stats.players, stats.team, stats.rotation, playerNames,
      `match-${id}-stats.pdf`);
  }

  function handleCSV() {
    if (!stats) return;
    exportMatchCSV(stats.players, playerNames, `match-${id}-stats.csv`);
  }

  function handleMaxPreps() {
    if (!stats) return;
    exportMaxPrepsCSV(stats.players, playerNames, playerJerseys, stats.setsPlayed, `match-${id}-maxpreps.txt`);
  }

  async function handleShareCard() {
    if (!shareCardRef.current || !stats || !match) return;
    setSharingCard(true);
    try {
      const html2canvas = html2canvasRef.current ?? (await import('html2canvas')).default;
      const canvas = await html2canvas(shareCardRef.current, {
        backgroundColor: '#0f172a',
        scale: 2,
        useCORS: true,
        logging: false,
      });
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const filename = `vbstat-vs-${(match.opponent_name ?? 'opponent').replace(/\s+/g, '-').toLowerCase()}.png`;
        if (navigator.share && navigator.canShare?.({ files: [new File([blob], filename, { type: 'image/png' })] })) {
          await navigator.share({ files: [new File([blob], filename, { type: 'image/png' })], title: 'Match Result' });
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = filename; a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
      }, 'image/png');
    } finally {
      setSharingCard(false);
    }
  }

  return (
    <div>
      <PageHeader title="Match Summary" backTo="/" />

      {loading && (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      )}

      {!loading && statsError && (
        <div className="flex flex-col items-center py-16 gap-4 px-4 text-center">
          <p className="text-slate-400 text-sm">Could not load match stats.</p>
          <p className="text-slate-600 text-xs">{statsError}</p>
          <Button variant="secondary" onClick={() => setStatsVersion((v) => v + 1)}>Retry</Button>
        </div>
      )}

      {!loading && !statsError && match && (
        <>
          {/* Match header */}
          <div className="px-4 pt-4 pb-2">
            <h2 className="text-xl font-bold">vs. {match.opponent_name ?? 'Opponent'}</h2>
            {match.status === 'complete' && (() => {
              const won = (match.our_sets_won ?? 0) > (match.opp_sets_won ?? 0);
              return (
                <div className={`text-2xl font-black tracking-tight mt-0.5 ${won ? 'text-emerald-400' : 'text-red-400'}`}>
                  {won ? 'W' : 'L'} {match.our_sets_won ?? 0}–{match.opp_sets_won ?? 0}
                </div>
              );
            })()}
            <p className="text-sm text-slate-400">
              {fmtDate(match.date)}
              {match.location && (
                <span className="ml-2 capitalize text-slate-500">· {match.location}</span>
              )}
              {match.conference && (
                <span className="ml-2 text-slate-500">· {match.conference === 'conference' ? 'Conference' : 'Non-Con'}</span>
              )}
              {match.match_type && (
                <span className="ml-2 text-slate-500">· {{ 'reg-season': 'Reg Season', 'tourney': 'Tourney', 'ihsa-playoffs': 'IHSA Playoffs', 'exhibition': 'Exhibition' }[match.match_type]}</span>
              )}
            </p>

            {/* Set scores */}
            {sets && sets.length > 0 && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {sets.filter(s => s.status === 'complete').map((s) => {
                  const won = s.our_score > s.opp_score;
                  return (
                    <div key={s.id} className="flex items-center gap-1">
                      <div className={`rounded-lg px-3 py-1 text-sm border ${won ? 'bg-emerald-900/30 border-emerald-700/50' : 'bg-red-900/30 border-red-800/50'}`}>
                        <span className={`text-xs mr-1 font-semibold ${won ? 'text-emerald-500' : 'text-red-500'}`}>S{s.set_number}</span>
                        <span className={`font-bold font-mono ${won ? 'text-emerald-300' : 'text-red-300'}`}>{s.our_score}–{s.opp_score}</span>
                      </div>
                      <button
                        onClick={() => setReviseModalSet(s)}
                        title="Revise set"
                        className="text-xs text-slate-600 hover:text-slate-300 px-1 transition-colors"
                      >
                        ✎
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Match Notes */}
            <MatchNotes matchId={id} initialNotes={match.notes ?? ''} />

            {/* Export bar */}
            <div className="flex gap-2 mt-3 flex-wrap">
              <Button size="sm" variant="secondary" disabled={!stats} onClick={handlePDF}>
                PDF
              </Button>
              <Button size="sm" variant="secondary" disabled={!stats} onClick={handleCSV}>
                CSV
              </Button>
              <Button size="sm" variant="secondary" disabled={!stats} onClick={handleMaxPreps}>
                MaxPreps
              </Button>
              <Button size="sm" variant="secondary" disabled={!stats || sharingCard} onClick={handleShareCard}>
                {sharingCard ? '…' : '📸 Share Card'}
              </Button>
            </div>
          </div>

          {/* Set filter picker */}
          {sets && sets.length > 1 && stats && (
            <div className="flex gap-1.5 mx-4 mb-3">
              <button
                onClick={() => setSelectedSetId(null)}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                  !selectedSetId ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                ALL
              </button>
              {sets.filter(s => s.status !== 'scheduled').map(s => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSetId(s.id)}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                    selectedSetId === s.id ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  S{s.set_number}
                </button>
              ))}
            </div>
          )}

          {/* Team totals strip */}
          {displayStats && (
            <div className="mx-4 mb-2 bg-surface rounded-xl p-3 grid grid-cols-5 gap-2 text-center text-sm">
              {[
                { label: 'HIT%',  val: fmtHitting(displayStats.team.hit_pct)  },
                { label: 'S%',    val: fmtPct(displayStats.team.si_pct)        },
                { label: 'Aces',  val: fmtCount(displayStats.team.ace)         },
                { label: 'Kills', val: fmtCount(displayStats.team.k)           },
                { label: 'APR',   val: fmtPassRating(displayStats.team.apr)    },
              ].map(({ label, val }) => (
                <div key={label}>
                  <div className="text-xs text-slate-400">{label}</div>
                  <div className="font-bold text-primary">{val}</div>
                </div>
              ))}
            </div>
          )}

          {/* Tab bar */}
          <TabBar tabs={TABS} active={tab} onChange={setTab} />

          {/* Tab content */}
          <div key={tab} className="p-4 md:p-6 animate-fade-in">
            {tab === 'points' && displayStats && (
              <PointQualityPanel pq={displayStats.pointQuality} />
            )}

            {tab === 'trends' && (
              <>
                <SubToggle
                  options={[['trends', 'TRENDS'], ['rotation', 'ROTATION']]}
                  value={trendsView}
                  onChange={setTrendsView}
                />
                {trendsView === 'trends' && (
                  <div className="space-y-8 mt-3">
                    <SetTrendsChart contacts={contacts} sets={sets ?? []} />
                    <div className="border-t border-slate-700/50 pt-6">
                      <RallyHistogram contacts={contacts} />
                    </div>
                  </div>
                )}
                {trendsView === 'rotation' && displayStats?.rotation && (
                  <div className="space-y-6 mt-3">
                    <RotationBarChart rotationRows={rotationRows} />
                    <RotationRadarChart rotationStats={displayStats.rotation} />
                    <RotationSpotlight rows={rotationRows} />
                    <StatTable columns={ROTATION_COLS} rows={rotationRows} />
                    <div className="grid grid-cols-2 gap-4 text-sm text-center">
                      <div className="bg-surface rounded-xl p-3">
                        <div className="text-xs text-slate-400">Overall SO%</div>
                        <div className="text-lg font-bold text-primary">{fmtPct(displayStats.rotation.so_pct)}</div>
                      </div>
                      <div className="bg-surface rounded-xl p-3">
                        <div className="text-xs text-slate-400">Overall SP%</div>
                        <div className="text-lg font-bold text-sky-400">{fmtPct(displayStats.rotation.bp_pct)}</div>
                      </div>
                    </div>
                    <CourtHeatMap contacts={contacts} />
                  </div>
                )}
              </>
            )}

            {tab === 'serving' && (
              <>
                <SubToggle
                  options={[['all', 'ALL'], ['float', 'FLOAT'], ['top', 'TOP SPIN']]}
                  value={serveView}
                  onChange={(v) => { setServeView(v); setSelectedServingPlayerId(null); }}
                />
                <StatTable
                  columns={SERVING_COLS[serveView]}
                  rows={playerRows}
                  totalsRow={statTotals?.[serveView]}
                  onRowClick={(row) => setSelectedServingPlayerId(id => String(id) === String(row.id) ? null : row.id)}
                  selectedRowId={selectedServingPlayerId}
                />
                {selectedServingPlayerId && displayStats?.contacts && (() => {
                  const player = playerRows.find(r => String(r.id) === String(selectedServingPlayerId));
                  return player ? (
                    <PlayerServePlacementCard
                      player={player}
                      contacts={displayStats.contacts}
                      playerJerseys={playerJerseys}
                    />
                  ) : null;
                })()}
                {displayStats?.serveZones && (
                  <ServeZoneGrid zones={displayStats.serveZones} />
                )}
                {displayStats?.contacts && (
                  <ServeReticlePlot contacts={displayStats.contacts} serveType={serveView} />
                )}
              </>
            )}

            {tab === 'passing' && (
              <>
                <SubToggle
                  options={[['passing', 'PASSING'], ['setting', 'SETTING']]}
                  value={passingView}
                  onChange={setPassingView}
                />
                <StatTable columns={TAB_COLUMNS[passingView]} rows={playerRows} totalsRow={statTotals?.[passingView]} />
              </>
            )}

            {tab === 'attacking' && (
              <StatTable columns={TAB_COLUMNS['attacking']} rows={playerRows} totalsRow={statTotals?.attacking} />
            )}

            {tab === 'blocking' && (
              <StatTable columns={TAB_COLUMNS['blocking']} rows={playerRows} totalsRow={statTotals?.blocking} />
            )}

            {tab === 'defense' && (
              <StatTable columns={TAB_COLUMNS['defense']} rows={playerRows} totalsRow={statTotals?.defense} />
            )}

            {tab === 'compare' && (
              <PlayerComparison playerRows={playerRows} />
            )}

            {tab === 'opponent' && displayStats?.opp && (
              <div className="space-y-3">
                <p className="text-xs text-slate-400 mb-4">Opponent performance this match</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'ACE',  val: displayStats.opp.ace,  desc: 'Aces vs us'         },
                    { label: 'SE',   val: displayStats.opp.se,   desc: 'Serve errors'        },
                    { label: 'K',    val: displayStats.opp.k,    desc: 'Kills'               },
                    { label: 'AE',   val: displayStats.opp.ae,   desc: 'Attack errors'       },
                    { label: 'BLK',  val: displayStats.opp.blk,  desc: 'Blocked by us'       },
                    { label: 'ERR',  val: displayStats.opp.errs, desc: 'Ball handling errors' },
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

            <div className="pt-6">
              <Button size="lg" className="w-full" onClick={() => navigate('/')}>
                Done
              </Button>
            </div>
          </div>
        </>
      )}

      {!loading && !match && (
        <div className="p-4 text-slate-400">Match not found.</div>
      )}

      {/* Off-screen share card — rendered for html2canvas capture */}
      <ShareCard
        cardRef={shareCardRef}
        match={match}
        sets={sets}
        stats={stats}
        fmtDate={fmtDate}
      />

      {reviseModalSet && (
        <ReviseSetModal
          set={reviseModalSet}
          matchId={id}
          onClose={() => setReviseModalSet(null)}
          onBoxScore={(s) => { setReviseModalSet(null); setBoxScoreSet(s); }}
        />
      )}

      {boxScoreSet && (
        <BoxScoreEntryModal
          set={boxScoreSet}
          matchId={id}
          players={playerList}
          onClose={() => setBoxScoreSet(null)}
          onSaved={() => { setBoxScoreSet(null); setStatsVersion((v) => v + 1); }}
        />
      )}
    </div>
  );
}
