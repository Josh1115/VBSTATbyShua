import { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { fmtHitting, fmtPassRating, fmtPct } from '../../stats/formatters';

const STAT_OPTIONS = [
  { key: 'ver',     label: 'VER',   fmtY: v => v?.toFixed(1) ?? '',      fmtTip: v => v?.toFixed(2) ?? '—'  },
  { key: 'hit_pct', label: 'HIT%',  fmtY: v => v != null ? ((v >= 0 ? '+' : '') + (v * 100).toFixed(0) + '%') : '', fmtTip: fmtHitting },
  { key: 'k_pct',   label: 'K%',    fmtY: v => v != null ? (v * 100).toFixed(0) + '%' : '', fmtTip: fmtPct  },
  { key: 'apr',     label: 'APR',   fmtY: v => v?.toFixed(1) ?? '',      fmtTip: fmtPassRating               },
  { key: 'kps',     label: 'K/S',   fmtY: v => v?.toFixed(1) ?? '',      fmtTip: v => v?.toFixed(2) ?? '—'  },
  { key: 'dips',    label: 'Dig/S', fmtY: v => v?.toFixed(1) ?? '',      fmtTip: v => v?.toFixed(2) ?? '—'  },
  { key: 'recs',    label: 'REC/S', fmtY: v => v?.toFixed(1) ?? '',      fmtTip: v => v?.toFixed(2) ?? '—'  },
  { key: 'si_pct',  label: 'S%',    fmtY: v => v != null ? (v * 100).toFixed(0) + '%' : '', fmtTip: fmtPct  },
  { key: 'ace_pct', label: 'ACE%',  fmtY: v => v != null ? (v * 100).toFixed(0) + '%' : '', fmtTip: fmtPct  },
];

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4', '#ec4899', '#f97316'];

const CHIP = 'px-3 py-1 rounded-full text-xs font-semibold transition-colors';
const chipClass = active =>
  active ? `${CHIP} bg-primary text-white` : `${CHIP} bg-surface text-slate-400 hover:text-white`;

const fmtShortDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

export function PlayerTrendsChart({ trends, playerNames }) {
  const [statKey, setStatKey] = useState('ver');

  if (!trends?.matches.length || !Object.keys(trends.byPlayer).length) return null;

  const stat = STAT_OPTIONS.find(s => s.key === statKey);

  // One object per match; each player ID is a key with their stat value (or null)
  const data = trends.matches.map((m, i) => {
    const row = {
      name:         m.opponentAbbr || m.opponentName || `M${i + 1}`,
      opponentName: m.opponentName,
    };
    for (const [pid, entries] of Object.entries(trends.byPlayer)) {
      row[pid] = entries[i]?.[statKey] ?? null;
    }
    return row;
  });

  // Only render players who have at least one non-null value for this stat
  const playerIds = Object.keys(trends.byPlayer).filter(pid =>
    data.some(d => d[pid] != null)
  );

  if (!playerIds.length) {
    return (
      <p className="text-sm text-slate-500 text-center py-6">
        No data for this stat in the selected matches.
      </p>
    );
  }

  return (
    <>
      <div className="flex gap-1.5 flex-wrap mb-4">
        {STAT_OPTIONS.map(s => (
          <button key={s.key} onClick={() => setStatKey(s.key)} className={chipClass(statKey === s.key)}>
            {s.label}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 32 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            angle={-35}
            textAnchor="end"
            interval={0}
          />
          <YAxis
            tickFormatter={stat.fmtY}
            tick={{ fill: '#94a3b8', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <Tooltip
            cursor={{ stroke: '#334155' }}
            contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8 }}
            labelStyle={{ color: '#f1f5f9', marginBottom: 4 }}
            labelFormatter={(label, payload) => {
              const opp = payload?.[0]?.payload?.opponentName;
              return opp ? `${label} vs ${opp}` : label;
            }}
            formatter={(val, _key, item) => [
              stat.fmtTip(val),
              playerNames[item.dataKey] ?? `#${item.dataKey}`,
            ]}
          />
          <Legend
            formatter={pid => playerNames[pid] ?? `#${pid}`}
            wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
          />
          {playerIds.map((pid, i) => (
            <Line
              key={pid}
              dataKey={pid}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3, fill: COLORS[i % COLORS.length] }}
              activeDot={{ r: 5 }}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </>
  );
}
