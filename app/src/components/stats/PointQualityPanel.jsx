import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

const SLICE_COLORS = {
  Earned: '#22c55e',
  Free:   '#38bdf8',
  Given:  '#f87171',
};

function PointsPieChart({ earned, free, given }) {
  const total = earned + free + given;
  if (total === 0) return null;

  const data = [
    { name: 'Earned', value: earned },
    { name: 'Free',   value: free   },
    { name: 'Given',  value: given  },
  ].filter((d) => d.value > 0);

  const pct = (v) => `${Math.round((v / total) * 100)}%`;

  const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, name, value }) => {
    const RADIAN = Math.PI / 180;
    const r = innerRadius + (outerRadius - innerRadius) * 0.55;
    const x = cx + r * Math.cos(-midAngle * RADIAN);
    const y = cy + r * Math.sin(-midAngle * RADIAN);
    if (value / total < 0.07) return null;
    return (
      <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="bold" fill="#fff">
        {pct(value)}
      </text>
    );
  };

  return (
    <div className="bg-surface rounded-xl p-3">
      <div className="text-xs text-slate-400 mb-2 uppercase tracking-wide text-center">Point Distribution</div>
      <ResponsiveContainer width="100%" height={140}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            outerRadius={62}
            dataKey="value"
            labelLine={false}
            label={renderLabel}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={SLICE_COLORS[entry.name]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
            formatter={(value, name) => [`${value} (${pct(value)})`, name]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex justify-center gap-4 mt-1">
        {data.map((entry) => (
          <div key={entry.name} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: SLICE_COLORS[entry.name] }} />
            <span className="text-[11px] text-slate-400">{entry.name} <span className="font-bold text-slate-200">{entry.value}</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Section({ title, total, color, items }) {
  return (
    <div className={`rounded-xl p-3 ${color}`}>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs font-bold uppercase tracking-wide opacity-70">{title}</span>
        <span className="text-2xl font-black">{total}</span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {items.map(([label, val]) => val > 0 && (
          <span key={label} className="text-xs opacity-80">
            {label} <span className="font-bold">{val}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function PointQualityPanel({ pq }) {
  const pct = (v) => v != null ? `${Math.round(v * 100)}%` : '—';
  const scored = pq.scored;

  return (
    <div className="space-y-3">
      <div className="bg-surface rounded-xl p-3 text-center">
        <div className="text-xs text-slate-400 mb-1 uppercase tracking-wide">Points Scored</div>
        <div className="text-3xl font-black text-white">{scored}</div>
        {scored > 0 && (
          <div className="flex mt-2 rounded overflow-hidden h-3">
            <div className="bg-emerald-500 transition-all" style={{ width: `${(pq.earned.total / scored) * 100}%` }} />
            <div className="bg-sky-500 transition-all"     style={{ width: `${(pq.free.total   / scored) * 100}%` }} />
          </div>
        )}
        {scored > 0 && (
          <div className="flex justify-between text-[10px] text-slate-500 mt-1 px-0.5">
            <span className="text-emerald-400">EARNED {pct(pq.earned_pct)}</span>
            <span className="text-sky-400">FREE {pct(pq.free_pct)}</span>
          </div>
        )}
      </div>

      <PointsPieChart
        earned={pq.earned.total}
        free={pq.free.total}
        given={pq.given.total}
      />

      <Section
        title="Earned — we scored"
        total={pq.earned.total}
        color="bg-emerald-900/40 text-emerald-100"
        items={[['ACE', pq.earned.ace], ['K', pq.earned.k], ['SBLK', pq.earned.sblk], ['HBLK', pq.earned.hblk]]}
      />
      <Section
        title="Free — opp error"
        total={pq.free.total}
        color="bg-sky-900/40 text-sky-100"
        items={[['SE', pq.free.se], ['AE', pq.free.ae], ['BHE', pq.free.bhe], ['NET', pq.free.net]]}
      />
      <Section
        title="Given — our error"
        total={pq.given.total}
        color="bg-red-900/40 text-red-100"
        items={[['SE', pq.given.se], ['AE', pq.given.ae], ['P0', pq.given.p0], ['LIFT', pq.given.lift], ['DBL', pq.given.dbl], ['NET', pq.given.net]]}
      />
    </div>
  );
}
