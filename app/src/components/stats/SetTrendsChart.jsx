import { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { computeSetTrends } from '../../stats/engine';

const TREND_METRICS = [
  { key: 'K%',   color: '#f97316', label: 'Kill %'     },
  { key: 'HIT%', color: '#60a5fa', label: 'Hitting %'  },
  { key: 'APR',  color: '#4ade80', label: 'Pass Rating' },
  { key: 'ACE%', color: '#c084fc', label: 'Ace %'      },
];

export function SetTrendsChart({ contacts, sets }) {
  const [metric, setMetric] = useState('K%');
  const data = useMemo(() => computeSetTrends(contacts, sets), [contacts, sets]);
  const curr = TREND_METRICS.find(m => m.key === metric);

  if (!data.length) return <p className="text-slate-500 text-sm text-center py-6">No data yet.</p>;

  return (
    <div className="space-y-3">
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
