import { useRef, useCallback } from 'react';

/**
 * Returns touch event handlers that detect horizontal swipes.
 * @param {object} opts
 * @param {() => void} opts.onSwipeLeft  - called when user swipes left (→ next)
 * @param {() => void} opts.onSwipeRight - called when user swipes right (→ prev)
 * @param {number}     [opts.minDist=50] - minimum px distance to count as swipe
 */
export function useSwipe({ onSwipeLeft, onSwipeRight, minDist = 50 }) {
  const startX = useRef(null);
  const startY = useRef(null);

  const onTouchStart = useCallback((e) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
  }, []);

  const onTouchEnd = useCallback((e) => {
    if (startX.current == null) return;
    const dx = e.changedTouches[0].clientX - startX.current;
    const dy = e.changedTouches[0].clientY - startY.current;
    // Ignore if mostly vertical (scrolling)
    if (Math.abs(dy) > Math.abs(dx)) { startX.current = null; return; }
    if (dx < -minDist) onSwipeLeft?.();
    else if (dx > minDist) onSwipeRight?.();
    startX.current = null;
  }, [onSwipeLeft, onSwipeRight, minDist]);

  return { onTouchStart, onTouchEnd };
}
