import { useEffect, useRef } from 'react';

/**
 * Acquires a screen wake lock while `enabled` is true.
 * Automatically re-acquires after the page regains visibility.
 */
export function useWakeLock(enabled) {
  const lockRef    = useRef(null);
  const releasedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (!('wakeLock' in navigator)) return;

    releasedRef.current = false;

    async function acquire() {
      try {
        lockRef.current = await navigator.wakeLock.request('screen');
        lockRef.current.addEventListener('release', () => { lockRef.current = null; });
      } catch {
        // Permission denied or not supported — silently ignore
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible' && !lockRef.current && !releasedRef.current) {
        acquire();
      }
    }

    acquire();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      releasedRef.current = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      lockRef.current?.release().catch((err) => { console.warn('[VBStat] wake lock release:', err?.message ?? err); });
      lockRef.current = null;
    };
  }, [enabled]);
}
