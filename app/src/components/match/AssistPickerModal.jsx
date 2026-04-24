import { memo } from 'react';
import { fmtPlayerName } from '../../stats/formatters';

export const AssistPickerModal = memo(function AssistPickerModal({
  open,
  attackerPlayerId,
  lineup,
  liberoId,
  playerNicknames,
  nameFormat,
  onSelect,
  onDismiss,
}) {
  if (!open) return null;

  const onCourt = lineup.filter(sl => sl.playerId && sl.playerId !== attackerPlayerId);

  const setter = onCourt.find(sl => sl.positionLabel === 'S');
  const libero = onCourt.find(sl => sl.playerId === liberoId);
  const others = onCourt.filter(sl => sl !== setter && sl !== libero);

  const ordered = [setter, libero, ...others].filter(Boolean);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75"
      onPointerDown={(e) => { if (e.target === e.currentTarget) onDismiss(); }}
    >
      <div className="bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl w-72 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-900/60">
          <div>
            <span className="text-white font-bold text-[2.4vmin] leading-none">Assist?</span>
            <span className="block text-slate-400 text-[1.6vmin] leading-none mt-0.5">Tap the player who set the ball</span>
          </div>
          <button
            onPointerDown={(e) => { e.preventDefault(); onDismiss(); }}
            className="text-slate-400 hover:text-white text-[3vmin] font-bold leading-none px-1"
          >
            ×
          </button>
        </div>

        {/* Player list */}
        <div className="flex flex-col divide-y divide-slate-700/60">
          {ordered.map((sl, idx) => {
            const isFirst = idx === 0 && sl.positionLabel === 'S';
            const isLibero = sl.playerId === liberoId;
            const posColor =
              sl.positionLabel === 'S'   ? 'text-blue-400'   :
              sl.positionLabel === 'L'   ? 'text-teal-400'   :
              sl.positionLabel === 'OH'  ? 'text-orange-400' :
              sl.positionLabel === 'MB'  ? 'text-green-400'  :
              sl.positionLabel === 'OPP' ? 'text-purple-400' :
              'text-slate-400';

            return (
              <button
                key={sl.playerId}
                onPointerDown={(e) => { e.preventDefault(); onSelect(sl.playerId); }}
                className={`flex items-center gap-3 px-4 py-3 text-left active:bg-slate-600/60 transition-colors
                  ${isFirst ? 'bg-blue-950/30 hover:bg-blue-900/30' : 'hover:bg-slate-700/40'}`}
              >
                <span className="text-slate-300 font-black text-[2.2vmin] w-8 text-center shrink-0">
                  #{sl.jersey}
                </span>
                <span className="text-white font-semibold text-[2.2vmin] flex-1 leading-none">
                  {fmtPlayerName(sl.playerName, playerNicknames?.[sl.playerId] ?? '', nameFormat)}
                </span>
                <span className={`font-bold text-[1.8vmin] leading-none ${posColor}`}>
                  {sl.positionLabel}
                  {isFirst && <span className="ml-1 text-blue-400/60 text-[1.4vmin]">★</span>}
                  {isLibero && !isFirst && <span className="ml-1 text-teal-400/60 text-[1.4vmin]">◉</span>}
                </span>
              </button>
            );
          })}
        </div>

        {/* Unassisted option */}
        <div className="border-t border-slate-700 px-4 py-2 bg-slate-900/30">
          <button
            onPointerDown={(e) => { e.preventDefault(); onSelect(null); }}
            className="w-full text-center text-slate-500 hover:text-slate-300 text-[1.8vmin] font-semibold py-1 active:text-slate-200"
          >
            No Assist (unassisted kill)
          </button>
        </div>
      </div>
    </div>
  );
});
