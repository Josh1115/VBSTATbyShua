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

// +3.24 / -1.45  (Volleyball Efficiency Rating)
export const fmtVER = (val) => fmt(val, v => (v >= 0 ? '+' : '') + v.toFixed(2));

// Date formatters
const DATE_FMT_FULL = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// "Jan 5, 2026"
export const fmtDate = (iso) => iso ? DATE_FMT_FULL.format(new Date(iso)) : '—';
