import { fmtPct, fmtCount, fmtBlocks, fmtRate, fmtPassRating, fmtHitting, fmtVER } from './formatters';
import { VERBadge } from '../components/stats/VERBadge';

function soColor(v, row) {
  if (v == null) return '';
  if (row?._minSo) return 'text-yellow-400 font-semibold';
  if (v < 0.40) return 'text-red-400 font-semibold';
  if (v > 0.60) return 'text-emerald-400';
  return '';
}

function bpColor(v, row) {
  if (v == null) return '';
  if (row?._minBp) return 'text-yellow-400 font-semibold';
  if (v < 0.25) return 'text-red-400 font-semibold';
  if (v > 0.50) return 'text-emerald-400';
  return '';
}

const SP_MP_COLS = [
  { key: 'sp', label: 'SP', fmt: fmtCount },
  { key: 'mp', label: 'MP', fmt: fmtCount },
];

export const SERVING_COLS = {
  all: [
    { key: 'name',     label: 'Player' },
    ...SP_MP_COLS,
    { key: 'sa',       label: 'SA',     fmt: fmtCount },
    { key: 'ace',      label: 'ACE',    fmt: fmtCount },
    { key: 'srv_pt',   label: 'SRV PT', fmt: fmtCount },
    { key: 'se',       label: 'SE',     fmt: fmtCount },
    { key: 'se_ob',    label: 'SOB',   fmt: fmtCount },
    { key: 'se_net',   label: 'SNET',  fmt: fmtCount },
    { key: 'se_foot',  label: 'FOOT',  fmt: fmtCount },
    { key: 'ace_pct',  label: 'ACE%',  fmt: fmtPct   },
    { key: 'se_pct',   label: 'SE%',   fmt: fmtPct   },
    { key: 'si_pct',   label: 'S%',    fmt: fmtPct   },
    { key: 'sob_pct',  label: 'SOB%',  fmt: fmtPct   },
    { key: 'snet_pct', label: 'SNET%', fmt: fmtPct   },
  ],
  float: [
    { key: 'name',      label: 'Player' },
    ...SP_MP_COLS,
    { key: 'f_sa',      label: 'SA',    fmt: fmtCount },
    { key: 'f_ace',     label: 'ACE',   fmt: fmtCount },
    { key: 'f_se',      label: 'SE',    fmt: fmtCount },
    { key: 'f_ace_pct', label: 'ACE%',  fmt: fmtPct   },
    { key: 'f_se_pct',  label: 'SE%',   fmt: fmtPct   },
    { key: 'f_si_pct',  label: 'S%',    fmt: fmtPct   },
  ],
  top: [
    { key: 'name',      label: 'Player' },
    ...SP_MP_COLS,
    { key: 't_sa',      label: 'SA',    fmt: fmtCount },
    { key: 't_ace',     label: 'ACE',   fmt: fmtCount },
    { key: 't_se',      label: 'SE',    fmt: fmtCount },
    { key: 't_ace_pct', label: 'ACE%',  fmt: fmtPct   },
    { key: 't_se_pct',  label: 'SE%',   fmt: fmtPct   },
    { key: 't_si_pct',  label: 'S%',    fmt: fmtPct   },
  ],
};

export const TAB_COLUMNS = {
  serving: SERVING_COLS.all,
  passing: [
    { key: 'name',    label: 'Player' },
    ...SP_MP_COLS,
    { key: 'pa',      label: 'REC',   fmt: fmtCount     },
    { key: 'p0',      label: 'P0',    fmt: fmtCount     },
    { key: 'p1',      label: 'P1',    fmt: fmtCount     },
    { key: 'p2',      label: 'P2',    fmt: fmtCount     },
    { key: 'p3',      label: 'P3',    fmt: fmtCount     },
    { key: 'apr',     label: 'APR',   fmt: fmtPassRating },
    { key: 'pp_pct',  label: '3OPT%', fmt: fmtPct       },
  ],
  attacking: [
    { key: 'name',      label: 'Player' },
    ...SP_MP_COLS,
    { key: 'ta',        label: 'TA',    fmt: fmtCount   },
    { key: 'k',          label: 'K',       fmt: fmtCount   },
    { key: 'k_pure',     label: 'PURE',    fmt: fmtCount   },
    { key: 'k_pure_pct', label: 'PURE%',   fmt: fmtPct     },
    { key: 'k_tool',     label: 'TOOL',    fmt: fmtCount   },
    { key: 'k_tool_pct', label: 'TOOL%',   fmt: fmtPct     },
    { key: 'k_over',     label: 'OVER',    fmt: fmtCount   },
    { key: 'k_over_pct', label: 'OVER%',   fmt: fmtPct     },
    { key: 'k_tip',      label: 'TIP',     fmt: fmtCount   },
    { key: 'k_tip_pct',  label: 'TIP%',    fmt: fmtPct     },
    { key: 'k_bk',       label: 'BK',      fmt: fmtCount   },
    { key: 'k_bk_pct',   label: 'BK%',     fmt: fmtPct     },
    { key: 'ae',        label: 'AE',    fmt: fmtCount   },
    { key: 'ae_ob',     label: 'OB',    fmt: fmtCount   },
    { key: 'ae_net',    label: 'NET',   fmt: fmtCount   },
    { key: 'ae_blk',    label: 'BLK',   fmt: fmtCount   },
    { key: 'ae_bra',    label: 'BRA',   fmt: fmtCount   },
    { key: 'fbs',       label: 'FBS',   fmt: fmtCount   },
    { key: 'hit_pct',   label: 'HIT%',  fmt: fmtHitting },
    { key: 'k_pct',     label: 'K%',    fmt: fmtPct     },
    { key: 'kps',       label: 'KPS',   fmt: fmtRate },
  ],
  ver: [
    { key: 'name',      label: 'Player' },
    ...SP_MP_COLS,
    { key: 'ver',       label: 'VER',   fmt: fmtVER,    render: (v) => <VERBadge ver={v} /> },
    { key: 'k',         label: 'K',     fmt: fmtCount   },
    { key: 'ace',       label: 'ACE',   fmt: fmtCount   },
    { key: 'bs',        label: 'BS',    fmt: fmtCount   },
    { key: 'ba',        label: 'BA',    fmt: fmtCount   },
    { key: 'ast',       label: 'AST',   fmt: fmtCount   },
    { key: 'dig',       label: 'DIG',   fmt: fmtCount   },
    { key: 'pa',        label: 'REC',   fmt: fmtCount   },
    { key: 'p0',        label: 'P0',    fmt: fmtCount   },
    { key: 'p1',        label: 'P1',    fmt: fmtCount   },
    { key: 'p2',        label: 'P2',    fmt: fmtCount   },
    { key: 'p3',        label: 'P3',    fmt: fmtCount   },
    { key: 'ae',        label: 'AE',    fmt: fmtCount   },
    { key: 'se',        label: 'SE',    fmt: fmtCount   },
    { key: 'bhe',       label: 'BHE',   fmt: fmtCount   },
    { key: 'fbe',       label: 'FBE',   fmt: fmtCount   },
    { key: 'lift',      label: 'L',     fmt: fmtCount   },
    { key: 'net',       label: 'NET',   fmt: fmtCount   },
  ],
  blocking: [
    { key: 'name',  label: 'Player' },
    ...SP_MP_COLS,
    { key: 'blk',   label: 'BLK',   fmt: fmtBlocks },
    { key: 'bs',    label: 'BS',    fmt: fmtCount },
    { key: 'ba',    label: 'BA',    fmt: fmtCount },
    { key: 'be',    label: 'BE',    fmt: fmtCount },
    { key: 'bps',   label: 'BPS',   fmt: fmtRate },
  ],
  defense: [
    { key: 'name',   label: 'Player' },
    ...SP_MP_COLS,
    { key: 'dig',    label: 'DIG',   fmt: fmtCount },
    { key: 'fb_dig', label: 'FREE',  fmt: fmtCount },
    { key: 'de',     label: 'DE',    fmt: fmtCount },
    { key: 'dips',   label: 'DiPS',  fmt: fmtRate },
    { key: 'fbr',    label: 'FBR',   fmt: fmtCount },
    { key: 'fbs',    label: 'FBS',   fmt: fmtCount },
    { key: 'fbe',    label: 'FBE',   fmt: fmtCount },
  ],
  setting: [
    { key: 'name',    label: 'Player' },
    ...SP_MP_COLS,
    { key: 'set_att', label: 'ATT', fmt: fmtCount },
    { key: 'ast',     label: 'AST', fmt: fmtCount },
    { key: 'bhe',     label: 'BHE', fmt: fmtCount },
    { key: 'lift',    label: 'L',   fmt: fmtCount },
    { key: 'dbl',     label: 'DBL', fmt: fmtCount },
    { key: 'aps',     label: 'APS', fmt: fmtRate  },
  ],
};

// IS/OOS per-rotation table columns (used in ReportsPage rotation analysis)
export const ISOOS_COLS = [
  { key: 'name',        label: 'Rot'       },
  { key: 'is_ta',       label: 'IS',        fmt: fmtCount   },
  { key: 'is_k_pct',    label: 'IS K%',     fmt: fmtPct     },
  { key: 'is_hit_pct',  label: 'IS HIT%',   fmt: fmtHitting },
  { key: 'is_win_pct',  label: 'IS Win%',   fmt: fmtPct     },
  { key: 'oos_ta',      label: 'OOS',       fmt: fmtCount   },
  { key: 'oos_k_pct',   label: 'OOS K%',    fmt: fmtPct     },
  { key: 'oos_hit_pct', label: 'OOS HIT%',  fmt: fmtHitting },
  { key: 'oos_win_pct', label: 'OOS Win%',  fmt: fmtPct     },
];

// Transition/free-ball per-rotation table columns
export const TRANS_COLS = [
  { key: 'name',          label: 'Rot'       },
  { key: 'free_ta',       label: 'FB ATK',   fmt: fmtCount   },
  { key: 'free_k_pct',    label: 'FB K%',    fmt: fmtPct     },
  { key: 'free_hit_pct',  label: 'FB HIT%',  fmt: fmtHitting },
  { key: 'free_win_pct',  label: 'FB Win%',  fmt: fmtPct     },
  { key: 'trans_ta',      label: 'TR ATK',   fmt: fmtCount   },
  { key: 'trans_k_pct',   label: 'TR K%',    fmt: fmtPct     },
  { key: 'trans_hit_pct', label: 'TR HIT%',  fmt: fmtHitting },
  { key: 'trans_win_pct', label: 'TR Win%',  fmt: fmtPct     },
];

// Run-streak per-rotation table columns
const fmtAvg = (val) => val == null ? '—' : val.toFixed(1);
export const RUN_COLS = [
  { key: 'name',       label: 'Rot' },
  { key: 'max_run',    label: 'Best', fmt: fmtCount },
  { key: 'avg_run',    label: 'Avg',  fmt: fmtAvg   },
  { key: 'runs_3plus', label: '3+',   fmt: fmtCount },
  { key: 'runs_5plus', label: '5+',   fmt: fmtCount },
];

export const ROTATION_COLS = [
  { key: 'name',    label: 'Rotation' },
  { key: 'so_pct',  label: 'SO%',    fmt: fmtPct,   cellClass: soColor },
  { key: 'so_opp',  label: 'SO Opp', fmt: fmtCount },
  { key: 'so_win',  label: 'SO Win', fmt: fmtCount },
  { key: 'bp_pct',  label: 'SP%',    fmt: fmtPct,   cellClass: bpColor },
  { key: 'bp_opp',  label: 'SP Opp', fmt: fmtCount },
  { key: 'bp_win',  label: 'SP Win', fmt: fmtCount },
];
