import { memo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMatchStore } from '../../store/matchStore';
import { useUiStore } from '../../store/uiStore';


const HOLD_MS = 450;

function useHoldButton(onFire) {
  const timerRef    = useRef(null);
  const [held, setHeld] = useState(false);

  const onDown = (e) => {
    e.preventDefault();
    setHeld(true);
    timerRef.current = setTimeout(() => { setHeld(false); onFire(); }, HOLD_MS);
  };
  const onUp = () => {
    clearTimeout(timerRef.current);
    setHeld(false);
  };

  return { onDown, onUp, held };
}


export const ActionBar = memo(function ActionBar({ onSubOpen, onMenuOpen, onStatsOpen, onSummaryOpen, liberoPlayer, onLiberoIn, onRotErrOpen, alertCount = 0 }) {
  const navigate       = useNavigate();
  const rotateForward  = useMatchStore((s) => s.rotateForward);
  const rotateBackward = useMatchStore((s) => s.rotateBackward);
  const undoLast       = useMatchStore((s) => s.undoLast);
  const subsUsed       = useMatchStore((s) => s.subsUsed);
  const maxSubsPerSet  = useMatchStore((s) => s.maxSubsPerSet);
  const actionHistory  = useMatchStore((s) => s.actionHistory);
  const showToast      = useUiStore((s) => s.showToast);

  const lastFeedItem   = useMatchStore((s) => s.lastFeedItem);
  const liberoOnCourt  = useMatchStore((s) => s.liberoOnCourt);
  const swapLibero     = useMatchStore((s) => s.swapLibero);
  const lineup         = useMatchStore((s) => s.lineup);

  const backHold = useHoldButton(rotateBackward);
  const fwdHold  = useHoldButton(rotateForward);

  const canSwapLibero = liberoPlayer && (liberoOnCourt || [4, 5].some(
    (i) => lineup[i]?.playerId && lineup[i].playerId !== liberoPlayer.id
  ));

  const lastAction = actionHistory[0] ?? null;

  const subsMaxed = subsUsed >= maxSubsPerSet;

  // Derive a short label for the UNDO button from the last action
  let undoLabel = null;
  if (lastAction) {
    if (lastAction.type === 'point_us')         undoLabel = '+1';
    else if (lastAction.type === 'point_them')  undoLabel = 'PT';
    else if (lastAction.type === 'timeout')     undoLabel = 'TO';
    else if (lastAction.type === 'sub')         undoLabel = 'SUB';
    else if (lastAction.type === 'libero_swap') undoLabel = 'LIB';
    else if (lastFeedItem?.label) {
      // Feed format: "[+1 ]LastName ActionDesc" — drop the +1 prefix and first word (last name)
      const stripped = lastFeedItem.label.replace(/^\+1 /, '');
      const parts    = stripped.split(' ');
      undoLabel = parts.slice(1).join(' ') || parts[0];
    }
  }

  const handleSub = () => {
    if (subsMaxed) { showToast(`Substitution limit reached (${maxSubsPerSet}/set)`, 'error'); return; }
    onSubOpen();
  };

  const btnBase = 'flex-1 h-full flex flex-col items-center justify-center font-bold rounded-none select-none transition-[transform,filter,background-color] duration-75 active:brightness-75 active:scale-y-90 active:scale-x-[0.97] border-r border-slate-700 last:border-r-0';

  return (
    <div className="flex-none flex h-[3.65vmin] border-t border-slate-700 bg-surface">

      {/* Rotate backward — hold to confirm */}
      <button
        onPointerDown={backHold.onDown}
        onPointerUp={backHold.onUp}
        onPointerLeave={backHold.onUp}
        className={`${btnBase} hover:bg-slate-700 relative overflow-hidden
          ${backHold.held ? 'bg-slate-600 text-orange-300' : 'bg-slate-800 text-slate-300'}`}
      >
        {backHold.held && (
          <span className="absolute inset-0 bg-orange-500/40 animate-[grow_450ms_linear_forwards] origin-left" />
        )}
        <span className={`text-[1.53vmin] leading-none ${backHold.held ? 'text-orange-400' : 'text-slate-500'}`}>ROT BACK</span>
      </button>

      {/* Rotate forward — hold to confirm */}
      <button
        onPointerDown={fwdHold.onDown}
        onPointerUp={fwdHold.onUp}
        onPointerLeave={fwdHold.onUp}
        className={`${btnBase} hover:bg-slate-700 relative overflow-hidden
          ${fwdHold.held ? 'bg-slate-600 text-orange-300' : 'bg-slate-800 text-slate-300'}`}
      >
        {fwdHold.held && (
          <span className="absolute inset-0 bg-orange-500/40 animate-[grow_450ms_linear_forwards] origin-left" />
        )}
        <span className={`text-[1.53vmin] leading-none ${fwdHold.held ? 'text-orange-400' : 'text-slate-500'}`}>ROT FWD</span>
      </button>

      {/* Undo */}
      <button
        onPointerDown={(e) => { e.preventDefault(); undoLast(); }}
        disabled={!lastAction}
        className={`${btnBase} bg-slate-800 hover:bg-slate-700
          ${lastAction ? 'text-yellow-400' : 'text-slate-600'}`}
      >
        <span className="text-[12px] font-bold leading-none">UNDO</span>
        {undoLabel && (
          <span className="text-[1.45vmin] leading-none mt-0.5 text-yellow-300/70 truncate max-w-full px-1">
            {undoLabel}
          </span>
        )}
      </button>

      {/* Sub */}
      <button
        onPointerDown={(e) => { e.preventDefault(); handleSub(); }}
        className={`${btnBase} ${subsMaxed ? 'bg-slate-800 text-slate-600' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
      >
        <span className="text-[1.53vmin] leading-none">SUB</span>
      </button>

      {/* Libero swap */}
      {liberoPlayer && (
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            if (!canSwapLibero) return;
            if (liberoOnCourt) swapLibero(liberoPlayer); else onLiberoIn?.();
          }}
          className={`${btnBase} ${canSwapLibero
            ? liberoOnCourt
              ? 'bg-emerald-900/60 text-emerald-300 hover:bg-emerald-800/70'
              : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
            : 'bg-slate-800 text-slate-700'}`}
        >
          <span className="text-[1.53vmin] leading-none">{liberoOnCourt ? 'LIB ON' : 'LIB OFF'}</span>
        </button>
      )}

      {/* ROT ERR — home team rotation violation */}
      <button
        onPointerDown={(e) => { e.preventDefault(); onRotErrOpen(); }}
        className={`${btnBase} bg-slate-800 text-rose-400 hover:bg-rose-950/60`}
      >
        <span className="text-[1.53vmin] leading-none">ROT ERR</span>
      </button>

      {/* Stats */}
      <div className="relative flex-1 h-full">
        <button
          onPointerDown={(e) => { e.preventDefault(); onStatsOpen(); }}
          className={`${btnBase} w-full bg-slate-800 text-slate-300 hover:bg-slate-700`}
        >
          <span className={`text-[12px] leading-none ${alertCount > 0 ? 'text-orange-400' : 'text-slate-500'}`}>STATS</span>
        </button>
        {alertCount > 0 && (
          <span className="pointer-events-none absolute top-1 right-1 h-2 w-2 rounded-full bg-orange-400 animate-pulse" />
        )}
      </div>

      {/* Scoring summary */}
      <button
        onPointerDown={(e) => { e.preventDefault(); onSummaryOpen(); }}
        className={`${btnBase} bg-slate-800 text-slate-300 hover:bg-slate-700`}
      >
        <span className="text-[12px] text-slate-500 leading-none">SCORE</span>
      </button>

      {/* Home */}
      <button
        onPointerDown={(e) => { e.preventDefault(); navigate('/'); }}
        className={`${btnBase} bg-slate-800 text-slate-400 hover:bg-slate-700`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-[1.7vmin] h-[1.7vmin]" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10.707 2.293a1 1 0 0 0-1.414 0l-7 7A1 1 0 0 0 3 11h1v6a1 1 0 0 0 1 1h4v-4h2v4h4a1 1 0 0 0 1-1v-6h1a1 1 0 0 0 .707-1.707l-7-7z" />
        </svg>
      </button>

      {/* Menu */}
      <button
        onPointerDown={(e) => { e.preventDefault(); onMenuOpen(); }}
        className={`${btnBase} bg-slate-800 text-slate-400 hover:bg-slate-700`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-[1.7vmin] h-[1.7vmin]" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M3 5a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1zm0 5a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1zm0 5a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
});
