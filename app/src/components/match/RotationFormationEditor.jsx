import { useState } from 'react';

// Grid cell labels in display order: [TL, TM, TR, BL, BM, BR]
const CELL_LABELS = ['TL', 'TM', 'TR', 'BL', 'BM', 'BR'];

// Default serve-receive grid order for each rotation (as serve_order indices 0-5).
// For rotation R, player with serve_order index (R-1) is serving (position 1).
// Standard grid: TL=pos4, TM=pos3, TR=pos2, BL=pos5, BM=pos6, BR=pos1
// pos4 = soIdx (R+2)%6, pos3 = (R+1)%6, pos2 = R%6,
// pos5 = (R+3)%6, pos6 = (R+4)%6, pos1 = (R+5)%6
function defaultFormation(rotNum) {
  const r = rotNum - 1;
  return [
    (r + 3) % 6, // TL = position 4
    (r + 2) % 6, // TM = position 3
    (r + 1) % 6, // TR = position 2
    (r + 4) % 6, // BL = position 5
    (r + 5) % 6, // BM = position 6
    r       % 6, // BR = position 1 (server)
  ];
}

/**
 * RotationFormationEditor — tap-to-select 2×3 court grid for one rotation's
 * serve-receive formation. Tap a cell to select it, then tap any other cell
 * to swap their positions. Tap the same cell again to deselect.
 *
 * Props:
 *   rotationNum    — 1-6
 *   serveOrderIds  — string[6] player IDs in serve order (index 0 = serve_order 1)
 *   players        — Player[] from DB (for name display)
 *   formation      — number[6] | null (serve_order indices per grid cell, or null = default)
 *   onChange       — (rotationNum, newFormation: number[6] | null) => void
 */
export function RotationFormationEditor({ rotationNum, serveOrderIds, players, formation, onChange }) {
  // Local grid state: array of 6 serve_order indices (0-5) for cells [TL,TM,TR,BL,BM,BR]
  const [grid, setGrid] = useState(() => formation ?? defaultFormation(rotationNum));
  const [selectedCell, setSelectedCell] = useState(null);

  // Re-sync when formation prop changes (e.g., parent resets)
  const handleReset = () => {
    const def = defaultFormation(rotationNum);
    setGrid(def);
    setSelectedCell(null);
    onChange(rotationNum, null);
  };

  const swapCells = (from, to) => {
    const next = [...grid];
    [next[from], next[to]] = [next[to], next[from]];
    setGrid(next);
    onChange(rotationNum, next);
  };

  const handleTap = (cellIdx) => {
    if (selectedCell === null) {
      setSelectedCell(cellIdx);
    } else if (selectedCell === cellIdx) {
      setSelectedCell(null);
    } else {
      swapCells(selectedCell, cellIdx);
      setSelectedCell(null);
    }
  };

  const getPlayer = (soIdx) => {
    const pid = serveOrderIds?.[soIdx];
    return pid ? (players ?? []).find((p) => String(p.id) === String(pid)) : null;
  };

  const hasSelection = selectedCell !== null;

  return (
    <div className="space-y-2">
      {/* 2×3 court grid */}
      <div className="grid grid-cols-3 gap-1.5 select-none">
        {grid.map((soIdx, cellIdx) => {
          const player     = getPlayer(soIdx);
          const isSelected = selectedCell === cellIdx;
          const isTarget   = hasSelection && !isSelected;

          return (
            <button
              key={cellIdx}
              type="button"
              onPointerDown={(e) => { e.preventDefault(); handleTap(cellIdx); }}
              className={`relative rounded-lg border px-2 py-2 text-center transition-colors
                ${isSelected
                  ? 'border-primary bg-primary/20 ring-1 ring-primary/60'
                  : isTarget
                    ? 'border-slate-500 bg-slate-700/80'
                    : 'border-slate-600 bg-slate-800/60'
                }`}
            >
              <span className="absolute top-0.5 left-1 text-[9px] text-slate-500">{CELL_LABELS[cellIdx]}</span>
              {isSelected && (
                <span className="absolute top-0.5 right-1 text-[9px] text-primary font-bold">✓</span>
              )}
              {player ? (
                <>
                  <span className="block text-xs font-bold text-white leading-tight">
                    #{player.jersey_number}
                  </span>
                  <span className="block text-[10px] text-slate-300 leading-tight truncate">
                    {player.name?.split(' ').pop()}
                  </span>
                  <span className="block text-[9px] text-slate-500">{player.position}</span>
                </>
              ) : (
                <span className="text-xs text-slate-600">—</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Net divider visual */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-px bg-slate-600" />
        <span className="text-[9px] text-slate-500 uppercase tracking-widest">net</span>
        <div className="flex-1 h-px bg-slate-600" />
      </div>

      <div className="flex items-center justify-between">
        {hasSelection ? (
          <span className="text-[10px] text-primary">Tap another cell to swap, or tap again to deselect</span>
        ) : (
          <span className="text-[10px] text-slate-500">Tap any cell to move a player</span>
        )}
        <button
          onClick={handleReset}
          className="text-xs text-slate-500 hover:text-slate-300 underline"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
