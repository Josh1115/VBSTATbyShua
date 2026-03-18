import { useState, useRef } from 'react';

// Swipe-left to reveal delete. Wraps a single match card row.
export function SwipeableMatchCard({ onDeleteConfirm, animDelay, children }) {
  const [offset, setOffset]       = useState(0);
  const [isSnapping, setIsSnapping] = useState(false);
  const touchStartX = useRef(null);
  const hasSwiped   = useRef(false);
  const REVEAL = 72;

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    hasSwiped.current   = false;
    setIsSnapping(false);
  };

  const handleTouchMove = (e) => {
    if (touchStartX.current === null) return;
    const dx = touchStartX.current - e.touches[0].clientX;
    if (Math.abs(dx) > 5) hasSwiped.current = true;
    if (dx < 0) { setOffset(0); return; }            // block right-swipe
    setOffset(Math.min(dx, REVEAL + 16));             // allow slight over-drag
  };

  const handleTouchEnd = () => {
    setIsSnapping(true);
    setOffset(offset > REVEAL * 0.45 ? REVEAL : 0);  // snap open or closed
    touchStartX.current = null;
  };

  return (
    <div
      className="relative overflow-hidden rounded-xl mb-2 animate-slide-in-right"
      style={{ animationDelay: animDelay }}
    >
      {/* Red delete backing revealed on swipe */}
      <div
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-red-600 rounded-r-xl cursor-pointer"
        style={{ width: REVEAL }}
        onClick={onDeleteConfirm}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
        </svg>
      </div>

      {/* Sliding content layer */}
      <div
        style={{
          transform:  `translateX(-${offset}px)`,
          transition: isSnapping ? 'transform 280ms cubic-bezier(0.25, 1, 0.5, 1)' : 'none',
          willChange: 'transform',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClickCapture={(e) => {
          // Block the click that fires after a swipe gesture
          if (hasSwiped.current) {
            hasSwiped.current = false;
            e.stopPropagation();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
