import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { computeMatchStats } from '../stats/engine';
import { exportMatchCSV, exportMatchPDF, exportMaxPrepsCSV } from '../stats/export';
import { fmtHitting, fmtPassRating, fmtPct, fmtCount, fmtDate, fmtVER } from '../stats/formatters';
import { ROTATION_COLS } from '../stats/columns';
import { PageHeader } from '../components/layout/PageHeader';
import { TabBar } from '../components/ui/Tab';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { StatTable } from '../components/stats/StatTable';
import { RotationSpotlight } from '../components/stats/RotationSpotlight';
import { PointQualityPanel } from '../components/stats/PointQualityPanel';
import { RotationRadarChart } from '../components/charts/RotationRadarChart';
import { CourtHeatMap } from '../components/charts/CourtHeatMap';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';

const TABS = [
  { value: 'points',    label: 'Points'    },
  { value: 'trends',    label: 'Trends'    },
  { value: 'serving',   label: 'Serving'   },
  { value: 'passing',   label: 'Passing'   },
  { value: 'attacking', label: 'Attacking' },
  { value: 'blocking',  label: 'Blocking'  },
  { value: 'defense',   label: 'Defense'   },
  { value: 'setting',   label: 'Setting'   },
  { value: 'rotation',  label: 'Rotation'  },
  { value: 'compare',   label: 'Compare'   },
];

// ── Match Notes ──────────────────────────────────────────────────────────────

function MatchNotes({ matchId, initialNotes }) {
  const [notes, setNotes] = useState(initialNotes ?? '');
  const timerRef = useRef(null);

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

function computeSetTrends(contacts, sets) {
  if (!contacts?.length || !sets?.length) return [];
  const setNumById = Object.fromEntries(sets.map(s => [s.id, s.set_number]));
  const bySet = {};
  for (const c of contacts) {
    const sn = setNumById[c.set_id];
    if (!sn) continue;
    if (!bySet[sn]) bySet[sn] = { ta: 0, k: 0, ae: 0, pa: 0, p0: 0, p1: 0, p2: 0, p3: 0, sa: 0, ace: 0, se: 0 };
    const s = bySet[sn];
    if (c.action === 'attack') {
      s.ta++; if (c.result === 'kill') s.k++; if (c.result === 'error') s.ae++;
    } else if (c.action === 'pass') {
      s.pa++;
      if (c.result === '0') s.p0++;
      else if (c.result === '1') s.p1++;
      else if (c.result === '2') s.p2++;
      else if (c.result === '3') s.p3++;
    } else if (c.action === 'serve') {
      s.sa++; if (c.result === 'ace') s.ace++; if (c.result === 'error') s.se++;
    }
  }
  return Object.entries(bySet)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([sn, s]) => ({
      name: `Set ${sn}`,
      'K%':    s.ta ? Math.round(s.k / s.ta * 100) : 0,
      'HIT%':  s.ta ? Math.round((s.k - s.ae) / s.ta * 100) : 0,
      'APR':   s.pa ? Math.round(((s.p1 * 1 + s.p2 * 2 + s.p3 * 3) / s.pa) * 100) / 100 : 0,
      'ACE%':  s.sa ? Math.round(s.ace / s.sa * 100) : 0,
      'SE%':   s.sa ? Math.round(s.se  / s.sa * 100) : 0,
    }));
}

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

const RALLY_BUCKETS = [
  { label: '1',    min: 1, max: 1  },
  { label: '2–3',  min: 2, max: 3  },
  { label: '4–6',  min: 4, max: 6  },
  { label: '7–10', min: 7, max: 10 },
  { label: '11+',  min: 11, max: Infinity },
];

function computeRallyHistogram(contacts) {
  if (!contacts?.length) return [];
  const lenByRally = new Map();
  for (const c of contacts) {
    if (!c.rally_id) continue;
    lenByRally.set(c.rally_id, (lenByRally.get(c.rally_id) ?? 0) + 1);
  }
  const counts = RALLY_BUCKETS.map(b => ({ name: b.label, rallies: 0 }));
  for (const len of lenByRally.values()) {
    const idx = RALLY_BUCKETS.findIndex(b => len >= b.min && len <= b.max);
    if (idx >= 0) counts[idx].rallies++;
  }
  const total = counts.reduce((s, c) => s + c.rallies, 0);
  return counts.map(c => ({ ...c, pct: total ? Math.round(c.rallies / total * 100) : 0 }));
}

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

const SP_MP_COLS = [
  { key: 'sp', label: 'SP', fmt: fmtCount },
  { key: 'mp', label: 'MP', fmt: fmtCount },
];

const SERVING_COLS = {
  all: [
    { key: 'name',     label: 'Player' },
    ...SP_MP_COLS,
    { key: 'sa',       label: 'SA',    fmt: fmtCount },
    { key: 'ace',      label: 'ACE',   fmt: fmtCount },
    { key: 'se',       label: 'SE',    fmt: fmtCount },
    { key: 'se_ob',    label: 'SOB',   fmt: fmtCount },
    { key: 'se_net',   label: 'SNET',  fmt: fmtCount },
    { key: 'ace_pct',  label: 'ACE%',  fmt: fmtPct   },
    { key: 'si_pct',   label: 'S%',    fmt: fmtPct   },
    { key: 'sob_pct',  label: 'SOB%',  fmt: fmtPct   },
    { key: 'snet_pct', label: 'SNET%', fmt: fmtPct   },
  ],
  float: [
    { key: 'name',      label: 'Player' },
    ...SP_MP_COLS,
    { key: 'f_sa',      label: 'SA',    fmt: fmtCount },
    { key: 'f_ace',     label: 'ACE',   fmt: fmtCount },
    { key: 'f_se',      label: 'SE',    fmt: fmtCount },
    { key: 'f_ace_pct', label: 'ACE%',  fmt: fmtPct   },
    { key: 'f_si_pct',  label: 'S%',  fmt: fmtPct   },
  ],
  top: [
    { key: 'name',      label: 'Player' },
    ...SP_MP_COLS,
    { key: 't_sa',      label: 'SA',    fmt: fmtCount },
    { key: 't_ace',     label: 'ACE',   fmt: fmtCount },
    { key: 't_se',      label: 'SE',    fmt: fmtCount },
    { key: 't_ace_pct', label: 'ACE%',  fmt: fmtPct   },
    { key: 't_si_pct',  label: 'S%',  fmt: fmtPct   },
  ],
};

const TAB_COLUMNS = {
  serving: SERVING_COLS.all,
  passing: [
    { key: 'name',    label: 'Player' },
    ...SP_MP_COLS,
    { key: 'pa',      label: 'PA',    fmt: fmtCount     },
    { key: 'p0',      label: 'P0',    fmt: fmtCount     },
    { key: 'p1',      label: 'P1',    fmt: fmtCount     },
    { key: 'p2',      label: 'P2',    fmt: fmtCount     },
    { key: 'p3',      label: 'P3',    fmt: fmtCount     },
    { key: 'apr',     label: 'APR',   fmt: fmtPassRating },
    { key: 'pp_pct',  label: '3OPT%', fmt: fmtPct       },
  ],
  attacking: [
    { key: 'name',      label: 'Player' },
    ...SP_MP_COLS,
    { key: 'ta',        label: 'TA',    fmt: fmtCount   },
    { key: 'k',         label: 'K',     fmt: fmtCount   },
    { key: 'ae',        label: 'AE',    fmt: fmtCount   },
    { key: 'hit_pct',   label: 'HIT%',  fmt: fmtHitting },
    { key: 'k_pct',     label: 'K%',    fmt: fmtPct     },
    { key: 'kps',       label: 'KPS',   fmt: (v) => fmtCount(v != null ? +v.toFixed(2) : null) },
    { key: 'pos_label', label: 'POS',   fmt: (v) => v ?? '—' },
    { key: 'pos_mult',  label: '×',     fmt: (v) => v != null ? `×${v.toFixed(2)}` : '—' },
    { key: 'ver',       label: 'VER',   fmt: fmtVER     },
  ],
  blocking: [
    { key: 'name',  label: 'Player' },
    ...SP_MP_COLS,
    { key: 'bs',    label: 'BS',    fmt: fmtCount },
    { key: 'ba',    label: 'BA',    fmt: fmtCount },
    { key: 'be',    label: 'BE',    fmt: fmtCount },
    { key: 'bps',   label: 'BPS',   fmt: (v) => fmtCount(v != null ? +v.toFixed(2) : null) },
  ],
  defense: [
    { key: 'name',  label: 'Player' },
    ...SP_MP_COLS,
    { key: 'dig',   label: 'DIG',   fmt: fmtCount },
    { key: 'de',    label: 'DE',    fmt: fmtCount },
    { key: 'dips',  label: 'DiPS',  fmt: (v) => fmtCount(v != null ? +v.toFixed(2) : null) },
    { key: 'fbr',   label: 'FBR',   fmt: fmtCount },
    { key: 'fbs',   label: 'FBS',   fmt: fmtCount },
  ],
  setting: [
    { key: 'name',  label: 'Player' },
    ...SP_MP_COLS,
    { key: 'ast',   label: 'AST',   fmt: fmtCount },
    { key: 'bhe',   label: 'BHE',   fmt: fmtCount },
    { key: 'aps',   label: 'APS',   fmt: fmtPassRating },
  ],
};


export function MatchSummaryPage() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const id = Number(matchId);

  const [tab, setTab] = useState('points');
  const [serveView, setServeView] = useState('all');
  const [stats, setStats] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sharingCard, setSharingCard] = useState(false);
  const shareCardRef = useRef(null);

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

  // Compute stats once match data is ready
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    computeMatchStats(id)
      .then((s) => { setStats(s); setContacts(s.contacts); })
      .finally(() => setLoading(false));
  }, [id]);

  const playerNames   = players
    ? Object.fromEntries(Object.entries(players).map(([pid, p]) => [pid, p.name]))
    : {};
  const playerJerseys = players
    ? Object.fromEntries(Object.entries(players).map(([pid, p]) => [pid, p.jersey_number ?? '']))
    : {};

  const playerRows = useMemo(() =>
    stats
      ? Object.entries(stats.players).map(([pid, s]) => ({
          id:   pid,
          name: playerNames[pid] ?? `#${pid}`,
          ...s,
        }))
      : [],
    [stats, playerNames]
  );

  const rotationRows = useMemo(() =>
    stats
      ? Object.entries(stats.rotation.rotations).map(([n, r]) => ({
          id: n,
          name: `Rotation ${n}`,
          ...r,
        }))
      : [],
    [stats]
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
      const html2canvas = (await import('html2canvas')).default;
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

      {!loading && match && (
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
                    <div key={s.id} className={`rounded-lg px-3 py-1 text-sm border ${won ? 'bg-emerald-900/30 border-emerald-700/50' : 'bg-red-900/30 border-red-800/50'}`}>
                      <span className={`text-xs mr-1 font-semibold ${won ? 'text-emerald-500' : 'text-red-500'}`}>S{s.set_number}</span>
                      <span className={`font-bold font-mono ${won ? 'text-emerald-300' : 'text-red-300'}`}>{s.our_score}–{s.opp_score}</span>
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

          {/* Team totals strip */}
          {stats && (
            <div className="mx-4 mb-2 bg-surface rounded-xl p-3 grid grid-cols-4 gap-2 text-center text-sm">
              {[
                { label: 'HIT%',  val: fmtHitting(stats.team.hit_pct) },
                { label: 'ACE%',  val: fmtPct(stats.team.ace_pct)     },
                { label: 'APR',   val: fmtPassRating(stats.team.apr)  },
                { label: 'SO%',   val: fmtPct(stats.rotation.so_pct)  },
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
            {tab === 'points' && stats && (
              <PointQualityPanel pq={stats.pointQuality} />
            )}

            {tab === 'trends' && (
              <div className="space-y-8">
                <SetTrendsChart contacts={contacts} sets={sets ?? []} />
                <div className="border-t border-slate-700/50 pt-6">
                  <RallyHistogram contacts={contacts} />
                </div>
              </div>
            )}

            {tab === 'compare' && (
              <PlayerComparison playerRows={playerRows} />
            )}

            {tab === 'serving' && (
              <>
                <div className="flex gap-1 mb-3">
                  {[['all', 'ALL'], ['float', 'FLOAT'], ['top', 'TOP SPIN']].map(([v, label]) => (
                    <button
                      key={v}
                      onClick={() => setServeView(v)}
                      className={`flex-1 py-1.5 rounded text-xs font-bold transition-colors ${
                        serveView === v
                          ? 'bg-slate-600 text-white'
                          : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <StatTable columns={SERVING_COLS[serveView]} rows={playerRows} />
              </>
            )}

            {TAB_COLUMNS[tab] && (
              <StatTable
                columns={TAB_COLUMNS[tab]}
                rows={playerRows}
              />
            )}

            {tab === 'rotation' && stats?.rotation && (
              <div className="space-y-6">
                <RotationBarChart rotationRows={rotationRows} />
                <RotationRadarChart rotationStats={stats.rotation} />
                <RotationSpotlight rows={rotationRows} />
                <StatTable columns={ROTATION_COLS} rows={rotationRows} />
                <div className="grid grid-cols-2 gap-4 text-sm text-center">
                  <div className="bg-surface rounded-xl p-3">
                    <div className="text-xs text-slate-400">Overall SO%</div>
                    <div className="text-lg font-bold text-primary">{fmtPct(stats.rotation.so_pct)}</div>
                  </div>
                  <div className="bg-surface rounded-xl p-3">
                    <div className="text-xs text-slate-400">Overall SP%</div>
                    <div className="text-lg font-bold text-sky-400">{fmtPct(stats.rotation.bp_pct)}</div>
                  </div>
                </div>
                <CourtHeatMap contacts={contacts} />
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
    </div>
  );
}
