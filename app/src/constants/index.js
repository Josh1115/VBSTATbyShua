// Player positions
export const POSITIONS = {
  S:   'Setter',
  OH:  'Outside Hitter',
  OPP: 'Opposite',
  MB:  'Middle Blocker',
  L:   'Libero',
  DS:  'Defensive Specialist',
  RS:  'Right Side',
};
export const POSITION_KEYS = Object.keys(POSITIONS);

// Match states
export const MATCH_STATUS = {
  SCHEDULED:   'scheduled',
  SETUP:       'setup',
  IN_PROGRESS: 'in_progress',
  COMPLETE:    'complete',
};

// Set states
export const SET_STATUS = {
  IN_PROGRESS: 'in_progress',
  COMPLETE:    'complete',
};

// Serve side / point winner
export const SIDE = {
  US:   'us',
  THEM: 'them',
};

// Serve / receive type (tracked on every serve and pass contact)
export const SERVE_TYPE = {
  FLOAT:    'float',
  TOPSPIN:  'topspin',
};

// Contact action types
export const ACTION = {
  SERVE:             'serve',
  PASS:              'pass',
  SET:               'set',
  ATTACK:            'attack',
  BLOCK:             'block',
  DIG:               'dig',
  FREEBALL_RECEIVE:  'freeball_receive',
  FREEBALL_SEND:     'freeball_send',
  COVER:             'cover',
  ERROR:             'error',
};

// Contact results by action
export const RESULT = {
  // serve
  ACE:                 'ace',
  IN:                  'in',
  ERROR:               'error',
  // set
  ASSIST:              'assist',
  BALL_HANDLING_ERROR: 'ball_handling_error',
  // attack
  KILL:                'kill',
  ATTEMPT:             'attempt',
  // block — note: stored value 'assist' is disambiguated at query time via action='block'
  SOLO:                'solo',
  BLOCK_ASSIST:        'assist',
  // dig
  SUCCESS:             'success',
  FREEBALL:            'freeball',
  // freeball
  FREE_BALL_ERROR:     'free_ball_error',
  // other errors
  LIFT:                'lift',
  DOUBLE:              'double',
  NET_TOUCH:           'net',
  ROTATION_ERROR:      'rotation_error',
};

// Match format
export const FORMAT = {
  BEST_OF_3: 'best_of_3',
  BEST_OF_5: 'best_of_5',
};

// Trackable stats for live record alerts
export const TRACKABLE_STATS = [
  { label: 'Kills',           key: 'k',       type: 'count' },
  { label: 'Aces',            key: 'ace',     type: 'count' },
  { label: 'Digs',            key: 'dig',     type: 'count' },
  { label: 'Solo Blocks',     key: 'bs',      type: 'count' },
  { label: 'Block Assists',   key: 'ba',      type: 'count' },
  { label: 'Assists',         key: 'ast',     type: 'count' },
  { label: 'Attack Attempts', key: 'ta',      type: 'count' },
  { label: 'Hitting %',       key: 'hit_pct', type: 'rate'  },
  { label: 'Kill %',          key: 'k_pct',   type: 'rate'  },
  { label: 'Avg Pass Rating', key: 'apr',     type: 'rate'  },
];

// VER position multipliers — adjust raw efficiency to account for positional opportunity.
// Libero (1.20) and DS (1.15) face harder serve-receive and dig situations with fewer
// high-value scoring actions, so their raw VER underrepresents contribution.
// MB (1.05) is slightly boosted because middle opportunities are fewer per set than OH/OPP.
// S (0.90) reflects that setters accumulate assists (not kills), which are weighted lower.
// OH/OPP (1.00) are the baseline. Adjust for your program's positional balance if needed.
export const POSITION_MULTIPLIERS = {
  OH:  1.00,
  OPP: 1.00,
  RS:  1.00,
  MB:  1.05,
  S:   0.90,
  L:   1.20,
  DS:  1.15,
};

// App accent colors — shared between main.jsx (CSS variable bootstrap) and SettingsPage
export const ACCENT_COLORS = [
  { id: 'orange', label: 'Orange', hex: '#f97316', rgb: '249 115 22' },
  { id: 'blue',   label: 'Blue',   hex: '#3b82f6', rgb: '59 130 246' },
  { id: 'green',  label: 'Green',  hex: '#22c55e', rgb: '34 197 94'  },
  { id: 'red',    label: 'Red',    hex: '#ef4444', rgb: '239 68 68'  },
  { id: 'purple', label: 'Purple', hex: '#a855f7', rgb: '168 85 247' },
];

// NFHS rules
// MAX_SUBS_PER_SET: intentionally 18 (club/college rules) rather than NFHS's 12.
// Overridable via localStorage key 'vbstat_max_subs'. Change to 12 for strict NFHS play.
export const NFHS = {
  MAX_SUBS_PER_SET:     18,
  MAX_TIMEOUTS_PER_SET:  2,
  SET_WIN_SCORE:        25,
  FIFTH_SET_WIN_SCORE:  15,
  WIN_BY:                2,
};

