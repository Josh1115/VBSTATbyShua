import { useRef, useState } from 'react';

const W = 912;
const H = 608;
const ZONE_GRID = [
  [1, 6, 5],
  [2, 3, 4],
];

function calcZone(nx, ny) {
  const col = nx < 1 / 3 ? 0 : nx < 2 / 3 ? 1 : 2;
  const row = ny < 0.5 ? 0 : 1;
  return ZONE_GRID[row][col];
}

export function ServeZoneModal({ pendingContact, reticles, onConfirm, onDismiss }) {
  const courtRef = useRef(null);
  const [pendingCoords, setPendingCoords] = useState(null);

  function handleCourtTap(e) {
    e.preventDefault();
    const rect = courtRef.current.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    setPendingCoords({ nx, ny, zone: calcZone(nx, ny) });
  }

  function handleConfirm() {
    if (!pendingCoords) return;
    onConfirm(pendingContact.contactId, pendingCoords.nx, pendingCoords.ny, pendingCoords.zone);
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/85 flex flex-col items-center justify-center gap-3 p-4">

      {/* Court */}
      <div className="flex flex-col items-center gap-1">
        {/* Wrapper div handles tap — more reliable than SVG onPointerDown on iOS Safari */}
        <div
          ref={courtRef}
          className="relative rounded overflow-hidden"
          style={{ maxWidth: '90vw', maxHeight: '65vh', aspectRatio: `${W} / ${H}`, touchAction: 'none', cursor: 'crosshair' }}
          onPointerDown={handleCourtTap}
        >
          <svg
            viewBox={`0 0 ${W} ${H}`}
            style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }}
          >
            {/* Background */}
            <rect width={W} height={H} fill="#0f172a" />

            {/* Zone cells */}
            {ZONE_GRID.map((row, ri) =>
              row.map((zone, ci) => {
                const x = ci * (W / 3);
                const y = ri * (H / 2);
                return (
                  <g key={zone}>
                    <rect
                      x={x} y={y}
                      width={W / 3} height={H / 2}
                      fill="transparent"
                      stroke="#334155"
                      strokeWidth={1}
                    />
                    <text
                      x={x + W / 6} y={y + H / 4}
                      textAnchor="middle" dominantBaseline="middle"
                      fill="rgba(148,163,184,0.4)" fontSize={22} fontWeight="bold"
                    >
                      {zone}
                    </text>
                  </g>
                );
              })
            )}

            {/* Net line at bottom */}
            <line x1={0} y1={H - 2} x2={W} y2={H - 2} stroke="#f97316" strokeWidth={3} />

            {/* Confirmed reticles */}
            {reticles.map((r) =>
              r.result === 'ace' ? (
                <text
                  key={r.contactId}
                  x={r.court_x * W} y={r.court_y * H}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={14} fill="#f59e0b"
                >★</text>
              ) : (
                <circle
                  key={r.contactId}
                  cx={r.court_x * W} cy={r.court_y * H}
                  r={6} fill="none" stroke="#34d399" strokeWidth={2}
                />
              )
            )}

            {/* Pending reticle (before confirm) */}
            {pendingCoords && (
              pendingContact.result === 'ace' ? (
                <text
                  x={pendingCoords.nx * W} y={pendingCoords.ny * H}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={18} fill="#f59e0b" opacity={0.65}
                >★</text>
              ) : (
                <circle
                  cx={pendingCoords.nx * W} cy={pendingCoords.ny * H}
                  r={8} fill="none" stroke="#34d399" strokeWidth={2} opacity={0.65}
                />
              )
            )}
          </svg>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-orange-400">NET</span>
      </div>

      {/* Buttons below court */}
      <div className="flex items-center gap-4">
        <p className="text-slate-400 text-sm">
          Zone: <span className="text-white font-bold text-base">{pendingCoords?.zone ?? '—'}</span>
        </p>
        <button
          onPointerDown={(e) => { e.preventDefault(); onDismiss(); }}
          className="px-6 py-2 rounded bg-slate-700 text-slate-300 text-sm font-semibold active:brightness-75 select-none"
        >
          SKIP
        </button>
        <button
          onPointerDown={(e) => { e.preventDefault(); handleConfirm(); }}
          disabled={!pendingCoords}
          className="px-6 py-2 rounded bg-emerald-600 text-white text-sm font-bold active:brightness-75 select-none disabled:opacity-40 disabled:pointer-events-none"
        >
          CONFIRM ✓
        </button>
      </div>
    </div>
  );
}
