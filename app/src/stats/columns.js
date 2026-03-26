import { fmtPct, fmtCount, fmtRate, fmtPassRating, fmtHitting, fmtVER } from './formatters';

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

const SP_MP_COLS = [
  { key: 'sp', label: 'SP', fmt: fmtCount },
  { key: 'mp', label: 'MP', fmt: fmtCount },
];

export const SERVING_COLS = {
  all: [
    { key: 'name',     label: 'Player' },
    ...SP_MP_COLS,
    { key: 'sa',       label: 'SA',    fmt: fmtCount },
    { key: 'ace',      label: 'ACE',   fmt: fmtCount },
    { key: 'se',       label: 'SE',    fmt: fmtCount },
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
    { key: 'k',         label: 'K',     fmt: fmtCount   },
    { key: 'ae',        label: 'AE',    fmt: fmtCount   },
    { key: 'hit_pct',   label: 'HIT%',  fmt: fmtHitting },
    { key: 'k_pct',     label: 'K%',    fmt: fmtPct     },
    { key: 'kps',       label: 'KPS',   fmt: fmtRate },
  ],
  ver: [
    { key: 'name',      label: 'Player' },
    ...SP_MP_COLS,
    { key: 'ver',       label: 'VER',   fmt: fmtVER     },
    { key: 'k',         label: 'K',     fmt: fmtCount   },
    { key: 'ace',       label: 'ACE',   fmt: fmtCount   },
    { key: 'bs',        label: 'BS',    fmt: fmtCount   },
    { key: 'ba',        label: 'BA',    fmt: fmtCount   },
    { key: 'ast',       label: 'AST',   fmt: fmtCount   },
    { key: 'dig',       label: 'DIG',   fmt: fmtCount   },
    { key: 'ae',        label: 'AE',    fmt: fmtCount   },
    { key: 'se',        label: 'SE',    fmt: fmtCount   },
    { key: 'bhe',       label: 'BHE',   fmt: fmtCount   },
    { key: 'fbe',       label: 'FBE',   fmt: fmtCount   },
  ],
  blocking: [
    { key: 'name',  label: 'Player' },
    ...SP_MP_COLS,
    { key: 'bs',    label: 'BS',    fmt: fmtCount },
    { key: 'ba',    label: 'BA',    fmt: fmtCount },
    { key: 'be',    label: 'BE',    fmt: fmtCount },
    { key: 'bps',   label: 'BPS',   fmt: fmtRate },
  ],
  defense: [
    { key: 'name',  label: 'Player' },
    ...SP_MP_COLS,
    { key: 'dig',   label: 'DIG',   fmt: fmtCount },
    { key: 'de',    label: 'DE',    fmt: fmtCount },
    { key: 'dips',  label: 'DiPS',  fmt: fmtRate },
    { key: 'fbr',   label: 'FBR',   fmt: fmtCount },
    { key: 'fbs',   label: 'FBS',   fmt: fmtCount },
    { key: 'fbe',   label: 'FBE',   fmt: fmtCount },
  ],
  setting: [
    { key: 'name',  label: 'Player' },
    ...SP_MP_COLS,
    { key: 'ast',   label: 'AST',   fmt: fmtCount },
    { key: 'bhe',   label: 'BHE',   fmt: fmtCount },
    { key: 'aps',   label: 'APS',   fmt: fmtRate },
  ],
};

export const ROTATION_COLS = [
  { key: 'name',    label: 'Rotation' },
  { key: 'so_pct',  label: 'SO%',    fmt: fmtPct,   cellClass: soColor },
  { key: 'so_opp',  label: 'SO Opp', fmt: fmtCount },
  { key: 'so_win',  label: 'SO Win', fmt: fmtCount },
  { key: 'bp_pct',  label: 'SP%',    fmt: fmtPct,   cellClass: bpColor },
  { key: 'bp_opp',  label: 'SP Opp', fmt: fmtCount },
  { key: 'bp_win',  label: 'SP Win', fmt: fmtCount },
];
