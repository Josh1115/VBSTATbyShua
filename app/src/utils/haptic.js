import { getBoolStorage, STORAGE_KEYS } from './storage';

/**
 * Trigger haptic feedback if the user has enabled it and the browser supports it.
 * @param {number|number[]} pattern - ms duration or vibrate pattern array
 */
export function haptic(pattern = 25) {
  if (typeof navigator.vibrate !== 'function') return;
  if (!getBoolStorage(STORAGE_KEYS.HAPTIC)) return;
  navigator.vibrate(pattern);
}
