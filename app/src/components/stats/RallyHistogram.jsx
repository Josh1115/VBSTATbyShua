import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { computeRallyHistogram } from '../../stats/engine';

const BAR_COLORS = ['#f97316', '#fb923c', '#fbbf24', '#4ade80', '#60a5fa'];

export function RallyHistogram({ contacts }) {
  const data = useMemo(() => computeRallyHistogram(contacts), [contacts]);
  const total = data.reduce((s, d) => s + d.rallies, 0);

  if (!total) return <p className="text-slate-500 text-sm text-center py-6">No rally data yet.</p>;

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
