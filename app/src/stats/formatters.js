// Null-safe wrapper — returns '—' when val is null/undefined
export const fmt = (val, fn) => val == null ? '—' : fn(val);

// +0.312 / -0.045  (hitting%)
export const fmtHitting = (val) =>
  fmt(val, v => (v < 0 ? '-' : '+') + Math.abs(v).toFixed(3));

// 2.34  (pass avg)
export const fmtPassRating = (val) => fmt(val, v => v.toFixed(2));

// 18.3%  (ace%, SO%, BP%, etc.)
export const fmtPct = (val) => fmt(val, v => (v * 100).toFixed(1) + '%');

// Integer counts  (kills, aces, digs, etc.)
export const fmtCount = (val) => fmt(val, v => String(Math.round(v)));

// Fractional per-set rates  (KPS, BPS, DiPS, APS, etc.)
export const fmtRate = (val) => fmt(val, v => v.toFixed(2));

// +3.24 / -1.45  (Volleyball Efficiency Rating)
export const fmtVER = (val) => fmt(val, v => (v >= 0 ? '+' : '') + v.toFixed(2));

// Date formatters
const DATE_FMT_FULL  = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const DATE_FMT_SHORT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

// "Jan 5, 2026"
export const fmtDate = (iso) => iso ? DATE_FMT_FULL.format(new Date(iso)) : '—';

// "Jan 5" (no year)
export const fmtDateShort = (iso) => iso ? DATE_FMT_SHORT.format(new Date(iso)) : '—';

// Player name display — format is one of:
//   'initial_last' (default) → "J. Smith"
//   'first_last'             → "John Smith"
//   'last'                   → "Smith"
//   'first'                  → "John"
//   'nickname'               → nickname if set, else first name
export function fmtPlayerName(name, nickname, format) {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  const first = parts[0];
  const last  = parts[parts.length - 1];
  switch (format) {
    case 'first_last': return name.trim();
    case 'last':       return last;
    case 'first':      return first;
    case 'nickname':   return nickname || first;
    case 'initial_last':
    default:
      return parts.length === 1 ? first : `${first[0]}. ${last}`;
  }
}

// Pass average rating (null when no passes)
export function calcAPR(passes) {
  if (!passes.length) return null;
  return passes.reduce((s, v) => s + v, 0) / passes.length;
}
