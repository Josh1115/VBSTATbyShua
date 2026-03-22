// Centralized localStorage key constants and typed get/set helpers.
// Import STORAGE_KEYS instead of using raw strings to prevent typos and
// make key usage searchable across the codebase.

export const STORAGE_KEYS = {
  AMOLED:             'vbstat_amoled',
  ACCENT:             'vbstat_accent',
  COACH_NAME:         'vbstat_coach_name',
  MAX_SUBS:           'vbstat_max_subs',
  DEFAULT_FORMAT:     'vbstat_default_format',
  PLAYER_NAME_FORMAT: 'vbstat_player_name_format',
  SCORE_DETAIL:       'vbstat_score_detail',
  MATCH_VIEW_DEFAULT: 'vbstat_match_view_default',
  DEFAULT_TEAM_ID:    'vbstat_default_team_id',
  DEFAULT_SEASON_ID:  'vbstat_default_season_id',
  WAKE_LOCK:          'vbstat_wake_lock',
  HAPTIC:             'vbstat_haptic',
  FLIP_LAYOUT:        'vbstat_flip_layout',
  LAST_SET_SCORE:     'vbstat_last_set_score',
};

export function getStorageItem(key, defaultValue = null) {
  try {
    const v = localStorage.getItem(key);
    return v !== null ? v : defaultValue;
  } catch {
    return defaultValue;
  }
}

export function setStorageItem(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, String(value));
  } catch { /* quota exceeded or private mode — ignore */ }
}

export function getBoolStorage(key) {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function setBoolStorage(key, value) {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch { /* quota exceeded or private mode — ignore */ }
}

export function getIntStorage(key, defaultValue = NaN) {
  try {
    const v = parseInt(localStorage.getItem(key), 10);
    return isNaN(v) ? defaultValue : v;
  } catch {
    return defaultValue;
  }
}
