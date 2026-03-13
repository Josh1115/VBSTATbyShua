import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useMatchStore } from '../../store/matchStore';
import { computePlayerStats } from '../../stats/engine';
import { SIDE } from '../../constants';

function useCountUp(duration = 800) {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef(null);
  useEffect(() => {
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1);
      setProgress(p);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [duration]);
  return progress;
}

function countVal(v, progress) {
  if (v == null) return '—';
  return Math.round(v * progress);
}

function countFloat(v, progress) {
  if (v == null) return '—';
  return (v * progress).toFixed(1);
}

export const SetSummaryModal = memo(function SetSummaryModal({ winner, teamName, opponentName, onContinue }) {
  const lineup            = useMatchStore((s) => s.lineup);
  const committedContacts = useMatchStore((s) => s.committedContacts);
  const currentSetId      = useMatchStore((s) => s.currentSetId);
  const ourScore          = useMatchStore((s) => s.ourScore);
  const oppScore          = useMatchStore((s) => s.oppScore);
  const setNumber         = useMatchStore((s) => s.setNumber);

  const setContacts = useMemo(
    () => committedContacts.filter((c) => c.set_id === currentSetId),
    [committedContacts, currentSetId]
  );

  const playerStats = useMemo(() => computePlayerStats(setContacts, 1), [setContacts]);

  const rows = lineup
    .filter((sl) => sl.playerId)
    .map((sl) => ({ id: sl.playerId, name: sl.playerName, ...(playerStats[sl.playerId] ?? {}) }))
    .sort((a, b) => (b.k ?? 0) - (a.k ?? 0));

  const progress = useCountUp(900);

  const weWon = winner === SIDE.US;

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/96 flex flex-col items-center justify-center px-4">
      <div className="animate-set-summary-in w-full max-w-2xl flex flex-col gap-4">

        {/* Header */}
        <div className="text-center">
          <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${weWon ? 'text-emerald-500' : 'text-red-500'}`}>
            {weWon ? 'Set Won' : 'Set Lost'}
          </div>
          <div className="text-4xl font-black tabular-nums tracking-tight">
            <span className={weWon ? 'text-orange-400' : 'text-white'}>{ourScore}</span>
            <span className="text-slate-500 mx-2">–</span>
            <span className={!weWon ? 'text-red-400' : 'text-slate-400'}>{oppScore}</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1 uppercase tracking-wide font-semibold">
            {teamName || 'HOME'} vs {opponentName || 'AWAY'} · Set {setNumber}
          </div>
        </div>

        {/* Player stats table */}
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_repeat(5,minmax(0,1fr))] text-[10px] font-bold uppercase tracking-wider text-slate-500 px-4 py-2 border-b border-slate-700">
            <span>Player</span>
            <span className="text-center text-orange-400">K</span>
            <span className="text-center text-emerald-400">ACE</span>
            <span className="text-center text-sky-400">DIG</span>
            <span className="text-center text-red-400">ERR</span>
            <span className="text-center text-teal-400">APR</span>
          </div>
          {rows.map((r) => {
            const errs = (r.ae ?? 0) + (r.se ?? 0);
            return (
              <div
                key={r.id}
                className="grid grid-cols-[1fr_repeat(5,minmax(0,1fr))] items-center px-4 py-2 border-b border-slate-700/40 last:border-0"
              >
                <span className="text-sm font-semibold text-slate-200 truncate">{r.name}</span>
                <span className="text-center text-[13px] font-bold text-orange-400">{countVal(r.k ?? 0, progress)}</span>
                <span className="text-center text-[13px] font-bold text-emerald-400">{countVal(r.ace ?? 0, progress)}</span>
                <span className="text-center text-[13px] font-bold text-sky-400">{countVal(r.dig ?? 0, progress)}</span>
                <span className="text-center text-[13px] font-bold text-red-400">{countVal(errs, progress)}</span>
                <span className="text-center text-[13px] font-bold text-teal-400">{r.apr != null ? countFloat(r.apr, progress) : '—'}</span>
              </div>
            );
          })}
        </div>

        {/* Continue button */}
        <button
          onPointerDown={(e) => { e.preventDefault(); onContinue(); }}
          className="w-full py-3 bg-primary hover:brightness-110 text-white font-bold text-sm tracking-widest uppercase rounded-xl active:brightness-75 select-none"
        >
          Start Next Set →
        </button>

      </div>
    </div>
  );
});
