import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export function RotationBarChart({ rotationRows }) {
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
