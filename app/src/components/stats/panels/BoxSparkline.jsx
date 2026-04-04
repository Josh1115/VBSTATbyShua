export function BoxSparkline({ pointHistory }) {
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
