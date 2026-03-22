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
  // other errors
  LIFT:                'lift',
  DOUBLE:              'double',
  NET_TOUCH:           'net',
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

