export function SetScoresStrip({ allMatchSets, currentSetNumber, ourScore, oppScore }) {
  const sorted = [...(allMatchSets ?? [])].sort((a, b) => a.set_number - b.set_number);
  if (!sorted.length) return null;
  return (
    <div className="flex gap-3 px-4 py-2 flex-wrap">
      {sorted.map((s) => {
        const isCurrent = s.set_number === currentSetNumber;
        const usScore = isCurrent ? ourScore : s.our_score;
        const themScore = isCurrent ? oppScore : s.opp_score;
        return (
          <span
            key={s.set_number}
            className={`text-sm font-semibold tabular-nums ${isCurrent ? 'text-white' : 'text-slate-500'}`}
          >
            {isCurrent ? '▶ ' : ''}S{s.set_number}: {usScore} – {themScore}
          </span>
        );
      })}
    </div>
  );
}
