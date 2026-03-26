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
      <div className="flex items-center justify-center gap-3">
        <div className="flex flex-col justify-center gap-3 pl-1">
          {data.map((entry) => (
            <div key={entry.name} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: SLICE_COLORS[entry.name] }} />
              <span className="text-sm text-slate-400">{entry.name} <span className="font-bold text-slate-200">{entry.value}</span></span>
            </div>
          ))}
        </div>
        <div className="w-[140px] flex-shrink-0">
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
        </div>
      </div>
    </div>
  );
}

function Section({ title, total, color, items }) {
  return (
    <div className={`rounded-xl p-3 ${color}`}>
      <div className="text-xs font-bold uppercase tracking-wide opacity-70 mb-3">{title}</div>
      <div className="flex flex-wrap justify-center items-start gap-x-5 gap-y-2">
        {items.map(([label, val]) => val > 0 && (
          <div key={label} className="flex flex-col items-center min-w-[2rem]">
            <span className="text-xl font-black leading-none">{val}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide opacity-60 mt-0.5">{label}</span>
          </div>
        ))}
        <span className="text-xl font-black leading-none opacity-40">=</span>
        <div className="flex flex-col items-center min-w-[2rem]">
          <span className="text-xl font-black leading-none">{total}</span>
          <span className="text-[10px] font-semibold uppercase tracking-wide opacity-60 mt-0.5">Total</span>
        </div>
      </div>
    </div>
  );
}

function EarnedVsGiven({ earned, given }) {
  if (earned + given === 0) return null;

  const ratio = given > 0 ? earned / given : Infinity;

  let label, labelColor, labelBg;
  if (ratio >= 3.0) {
    label = 'Dominant';    labelColor = 'text-emerald-300'; labelBg = 'bg-emerald-900/50';
  } else if (ratio >= 2.0) {
    label = 'In Control';  labelColor = 'text-green-300';   labelBg = 'bg-green-900/50';
  } else if (ratio >= 1.5) {
    label = 'Competitive'; labelColor = 'text-lime-300';    labelBg = 'bg-lime-900/50';
  } else if (ratio >= 1.0) {
    label = 'Balanced';    labelColor = 'text-yellow-300';  labelBg = 'bg-yellow-900/40';
  } else if (ratio >= 0.67) {
    label = 'Struggling';  labelColor = 'text-orange-300';  labelBg = 'bg-orange-900/40';
  } else {
    label = 'Giving Away'; labelColor = 'text-red-300';     labelBg = 'bg-red-900/40';
  }

  const ratioStr = ratio === Infinity ? '∞ : 1' : `${ratio.toFixed(1)} : 1`;
  const earnedPct = Math.round((earned / (earned + given)) * 100);

  return (
    <div className="bg-surface rounded-xl p-4 flex flex-col items-center text-center">
      <span className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-2">Earned vs Given</span>
      <div className="flex items-baseline gap-3 mb-1">
        <span className="text-4xl font-black text-emerald-400 tabular-nums">{earned}</span>
        <span className="text-slate-500 font-bold text-2xl">:</span>
        <span className="text-4xl font-black text-red-400 tabular-nums">{given}</span>
      </div>
      <span className="text-base font-bold text-slate-300 tabular-nums mb-3">{ratioStr}</span>
      <div className="w-full h-2 rounded-full bg-red-900/40 overflow-hidden mb-1">
        <div
          className="h-full rounded-full bg-emerald-500 transition-[width] duration-500"
          style={{ width: `${earnedPct}%` }}
        />
      </div>
      <div className="flex justify-between w-full mb-3">
        <span className="text-[10px] text-emerald-500/60 font-semibold">EARNED</span>
        <span className="text-[10px] text-red-400/60 font-semibold">GIVEN</span>
      </div>
      <span className={`text-sm font-bold px-3 py-1 rounded-full ${labelBg} ${labelColor}`}>{label}</span>
    </div>
  );
}

export function PointQualityPanel({ pq, oppScored }) {
  const diff = oppScored != null ? pq.scored - oppScored : null;
  const diffLabel = diff == null ? '—' : diff > 0 ? `+${diff}` : String(diff);
  const diffColor = diff == null || diff === 0 ? 'text-slate-400' : diff > 0 ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className="space-y-3">
      <div className="bg-surface rounded-xl p-3">
        <div className="flex justify-around">
          <div className="flex flex-col items-center">
            <div className="text-xs text-slate-400 mb-1 uppercase tracking-wide">Points Scored</div>
            <div className="text-3xl font-black text-white">{pq.scored}</div>
          </div>
          <div className="w-px bg-slate-700 self-stretch" />
          <div className="flex flex-col items-center">
            <div className="text-xs text-slate-400 mb-1 uppercase tracking-wide">Pts Diff</div>
            <div className={`text-3xl font-black ${diffColor}`}>{diffLabel}</div>
          </div>
          <div className="w-px bg-slate-700 self-stretch" />
          <div className="flex flex-col items-center">
            <div className="text-xs text-slate-400 mb-1 uppercase tracking-wide">Opp Points</div>
            <div className="text-3xl font-black text-slate-400">{oppScored ?? '—'}</div>
          </div>
        </div>
      </div>

      <EarnedVsGiven earned={pq.earned.total} given={pq.given.total} />

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
        items={[['SE', pq.given.se], ['AE', pq.given.ae], ['P0', pq.given.p0], ['LIFT', pq.given.lift], ['DBL', pq.given.dbl], ['NET', pq.given.net], ['ROT', pq.given.rot]]}
      />
    </div>
  );
}
