import { useRef } from 'react';

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

  function handleCourtTap(e) {
    e.preventDefault();
    const rect = courtRef.current.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    onConfirm(pendingContact.contactId, nx, ny, calcZone(nx, ny));
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/85 flex flex-col items-center justify-center gap-2 p-2">

      {/* Court — fills as much of the landscape viewport as possible.
          Width is the binding constraint on iPad landscape: min(95vw, 132vh)
          keeps the court within 95% of screen width while also preventing it
          from exceeding 88% of screen height (132vh = 88vh × 1.5 aspect).   */}
      <div
        ref={courtRef}
        className="relative rounded overflow-hidden"
        style={{ width: 'min(95vw, 132vh)', aspectRatio: `${W} / ${H}`, touchAction: 'none', cursor: 'crosshair' }}
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

          {/* Net line at bottom with NET label inside the SVG */}
          <line x1={0} y1={H - 2} x2={W} y2={H - 2} stroke="#f97316" strokeWidth={3} />
          <text
            x={W / 2} y={H - 14}
            textAnchor="middle" dominantBaseline="middle"
            fill="#f97316" fontSize={18} fontWeight="bold" letterSpacing={4}
            opacity={0.75}
          >NET</text>

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
        </svg>
      </div>

      {/* SKIP only — tapping the court confirms immediately */}
      <div className="flex items-center">
        <button
          onPointerDown={(e) => { e.preventDefault(); onDismiss(); }}
          className="px-6 py-2 rounded bg-slate-700 text-slate-300 text-sm font-semibold active:brightness-75 select-none"
        >
          SKIP
        </button>
      </div>
    </div>
  );
}
