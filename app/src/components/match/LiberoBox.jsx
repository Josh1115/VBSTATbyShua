import { memo, useEffect, useRef, useState } from 'react';
import { useMatchStore } from '../../store/matchStore';

const lastName = (name) => {
  if (!name) return '';
  const parts = name.trim().split(' ');
  return parts[parts.length - 1];
};

export const LiberoBox = memo(function LiberoBox({ liberoPlayer, onAssignLibero }) {
  const liberoOnCourt               = useMatchStore((s) => s.liberoOnCourt);
  const swapLibero                  = useMatchStore((s) => s.swapLibero);
  const lineup                      = useMatchStore((s) => s.lineup);
  const liberoReplacedName          = useMatchStore((s) => s.liberoReplacedName);
  const liberoReplacedJersey        = useMatchStore((s) => s.liberoReplacedJersey);
  const liberoReplacedPositionLabel = useMatchStore((s) => s.liberoReplacedPositionLabel);

  const [pulse, setPulse] = useState(false);
  const prevKey = useRef(`${liberoPlayer?.id}-${liberoOnCourt}`);

  useEffect(() => {
    const key = `${liberoPlayer?.id}-${liberoOnCourt}`;
    if (key !== prevKey.current) {
      prevKey.current = key;
      if (liberoPlayer) {
        setPulse(true);
        const t = setTimeout(() => setPulse(false), 450);
        return () => clearTimeout(t);
      }
    }
  }, [liberoPlayer?.id, liberoOnCourt]);

  if (!liberoPlayer) {
    return (
      <div
        className={`flex items-center gap-1.5 px-2 py-0.5 bg-black/30 rounded border transition-colors
          ${onAssignLibero
            ? 'border-slate-600 hover:border-slate-400 hover:bg-black/50 cursor-pointer'
            : 'border-slate-700'
          }`}
        onPointerDown={onAssignLibero ? (e) => { e.preventDefault(); onAssignLibero(); } : undefined}
      >
        <span className="text-sm text-slate-600">○</span>
        <div className="flex flex-col leading-none">
          <span className="text-xs text-slate-500 font-bold">Libero</span>
          <span className="text-xs text-slate-600">{onAssignLibero ? 'tap to assign' : '—'}</span>
        </div>
      </div>
    );
  }

  // Can swap in when a non-libero back-row player (S5 or S6 = indices 4, 5) is available
  const canSwap = liberoOnCourt || [4, 5].some(
    (i) => lineup[i]?.playerId && lineup[i].playerId !== liberoPlayer.id
  );

  // Libero is on court — show the benched player (the one sitting out)
  if (liberoOnCourt) {
    return (
      <div className={`flex items-center gap-1.5 px-2 py-0.5 bg-black/30 rounded border transition-colors ${pulse ? 'border-emerald-400 animate-libero-pulse' : 'border-slate-700'}`}>
        <div className="flex flex-col leading-none">
          <span className="text-xs text-slate-400 font-bold">
            #{liberoReplacedJersey}
            {liberoReplacedPositionLabel ? ` (${liberoReplacedPositionLabel})` : ''}
          </span>
          <span className="text-xs text-slate-300 truncate max-w-[9.4vmin]">{lastName(liberoReplacedName)}</span>
        </div>

        <button
          onPointerDown={(e) => { e.preventDefault(); swapLibero(liberoPlayer); }}
          className="text-xs font-bold px-2.5 py-1.5 rounded leading-none border transition-colors bg-slate-700 border-slate-500 text-slate-200 hover:bg-slate-600"
        >
          SWAP OUT
        </button>
      </div>
    );
  }

  // Libero is on bench — show libero info
  return (
    <div className={`flex items-center gap-3 px-5 py-0.5 bg-black/30 rounded border transition-colors ${pulse ? 'border-emerald-400 animate-libero-pulse' : 'border-slate-700'}`}>
      <div className="flex flex-col leading-none">
        <span className="text-xs text-emerald-400 font-bold">#{liberoPlayer.jersey_number}</span>
        <span className="text-xs text-slate-300 truncate max-w-[20vmin]">{lastName(liberoPlayer.name)}</span>
      </div>

      <button
        disabled={!canSwap}
        onPointerDown={(e) => { e.preventDefault(); swapLibero(liberoPlayer); }}
        className={`text-[2vmin] font-bold min-w-[20vmin] py-2 rounded leading-none border transition-colors text-center
          ${canSwap
            ? 'bg-emerald-800 border-emerald-600 text-emerald-200 hover:bg-emerald-700'
            : 'bg-transparent border-slate-700 text-slate-700 cursor-not-allowed'
          }`}
      >
        SWAP IN
      </button>
    </div>
  );
});
