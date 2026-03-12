import { fmtPct, fmtCount } from './formatters';

function soColor(v) {
  if (v == null) return '';
  if (v < 0.40) return 'text-red-400 font-semibold';
  if (v < 0.50) return 'text-yellow-400';
  if (v > 0.60) return 'text-emerald-400';
  return '';
}

function bpColor(v) {
  if (v == null) return '';
  if (v < 0.25) return 'text-red-400 font-semibold';
  if (v < 0.38) return 'text-yellow-400';
  if (v > 0.50) return 'text-emerald-400';
  return '';
}

export const ROTATION_COLS = [
  { key: 'name',    label: 'Rotation' },
  { key: 'so_pct',  label: 'SO%',    fmt: fmtPct,   cellClass: soColor },
  { key: 'so_opp',  label: 'SO Opp', fmt: fmtCount },
  { key: 'so_win',  label: 'SO Win', fmt: fmtCount },
  { key: 'bp_pct',  label: 'BP%',    fmt: fmtPct,   cellClass: bpColor },
  { key: 'bp_opp',  label: 'BP Opp', fmt: fmtCount },
  { key: 'bp_win',  label: 'BP Win', fmt: fmtCount },
];
