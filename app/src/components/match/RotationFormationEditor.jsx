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
    (r + 2) % 6, // TL = position 4
    (r + 1) % 6, // TM = position 3
    r % 6,       // TR = position 2
    (r + 3) % 6, // BL = position 5
    (r + 4) % 6, // BM = position 6
    (r + 5) % 6, // BR = position 1
  ];
}

/**
 * RotationFormationEditor — drag-and-drop 2×3 court grid for one rotation's
 * serve-receive formation.
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
  const [draggingCell, setDraggingCell] = useState(null);
  const [dragOverCell, setDragOverCell] = useState(null);

  // Re-sync when formation prop changes (e.g., parent resets)
  // Use a key on the parent instead if needed; this handles explicit prop updates.
  const handleReset = () => {
    const def = defaultFormation(rotationNum);
    setGrid(def);
    onChange(rotationNum, null);
  };

  const swapCells = (from, to) => {
    if (from === to) return;
    const next = [...grid];
    [next[from], next[to]] = [next[to], next[from]];
    setGrid(next);
    onChange(rotationNum, next);
  };

  const getPlayer = (soIdx) => {
    const pid = serveOrderIds?.[soIdx];
    return pid ? (players ?? []).find((p) => String(p.id) === String(pid)) : null;
  };

  return (
    <div className="space-y-2">
      {/* 2×3 court grid */}
      <div
        className="grid grid-cols-3 gap-1.5 select-none"
        onPointerLeave={() => { setDraggingCell(null); setDragOverCell(null); }}
        onPointerUp={() => {
          if (draggingCell !== null && dragOverCell !== null) swapCells(draggingCell, dragOverCell);
          setDraggingCell(null);
          setDragOverCell(null);
        }}
      >
        {grid.map((soIdx, cellIdx) => {
          const player   = getPlayer(soIdx);
          const isDragging = draggingCell === cellIdx;
          const isOver     = dragOverCell === cellIdx && draggingCell !== cellIdx;
          // Front row = cells 0-2, back row = cells 3-5
          const isBack = cellIdx >= 3;
          return (
            <div
              key={cellIdx}
              className={`relative rounded-lg border px-2 py-2 text-center cursor-grab touch-none transition-colors
                ${isDragging
                  ? 'opacity-50 border-primary bg-primary/10'
                  : isOver
                    ? 'border-primary bg-slate-700 ring-1 ring-primary/60'
                    : isBack
                      ? 'border-slate-600 bg-slate-800/60'
                      : 'border-slate-600 bg-slate-700/60'
                }`}
              onPointerDown={(e) => { e.preventDefault(); setDraggingCell(cellIdx); setDragOverCell(cellIdx); }}
              onPointerEnter={() => { if (draggingCell !== null) setDragOverCell(cellIdx); }}
            >
              <span className="absolute top-0.5 left-1 text-[9px] text-slate-500">{CELL_LABELS[cellIdx]}</span>
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
            </div>
          );
        })}
      </div>

      {/* Net divider visual */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-px bg-slate-600" />
        <span className="text-[9px] text-slate-500 uppercase tracking-widest">net</span>
        <div className="flex-1 h-px bg-slate-600" />
      </div>

      <button
        onClick={handleReset}
        className="text-xs text-slate-500 hover:text-slate-300 underline"
      >
        Reset to default
      </button>
    </div>
  );
}
