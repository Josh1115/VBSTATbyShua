export function RotationSpotlight({ rows }) {
  if (!rows || rows.length === 0) return null;

  const weakSO = rows
    .filter(r => r.so_opp >= 5 && r.so_pct < 0.40)
    .sort((a, b) => a.so_pct - b.so_pct)[0];

  const weakBP = rows
    .filter(r => r.bp_opp >= 5 && r.bp_pct < 0.25)
    .sort((a, b) => a.bp_pct - b.bp_pct)[0];

  if (!weakSO && !weakBP) return null;

  const parts = [];
  if (weakSO) parts.push(`${weakSO.name} SO% ${Math.round(weakSO.so_pct * 100)}%`);
  if (weakBP) parts.push(`${weakBP.name} BP% ${Math.round(weakBP.bp_pct * 100)}%`);

  return (
    <div className="bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2 text-sm">
      <span className="text-red-400 font-semibold">⚠ Focus Areas: </span>
      <span className="text-slate-300">{parts.join(' · ')}</span>
    </div>
  );
}
