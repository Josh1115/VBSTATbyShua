const SERVE_ZONE_GRID = [
  [1, 6, 5],
  [2, 3, 4],
];
const SZ_W = 270, SZ_H = 180;

export function ServeZoneStatsPanel({ contacts }) {
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
