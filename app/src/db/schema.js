import Dexie from 'dexie';

export const db = new Dexie('VBAPPv2');

db.version(5).stores({
  contacts: '++id, match_id, player_id, action, set_id, rally_id, rotation_num',
});

db.version(4).stores({
  records: '++id, team_id, type, player_id',
});

db.version(3).stores({
  records: '++id, team_id, type',
});

db.version(2).stores({
  saved_lineups: '++id, team_id',
});

db.version(1).stores({
  // School or club
  // Queryable: name, type
  organizations: '++id, name, type',

  // Teams belong to an org
  // gender: M | F | Mixed
  // level: varsity | jv | frosh | club
  // Queryable: by org_id (list all org teams)
  teams: '++id, org_id, name',

  // Seasons belong to a team
  // Queryable: by team_id; year for ordering
  seasons: '++id, team_id, year',

  // Players belong to a team
  // position: OH | OPP | MB | S | L | DS | RS
  // Queryable: by team_id; is_active for active roster filter
  players: '++id, team_id, is_active',

  // Opponent teams
  // Queryable: by name
  opponents: '++id, name',

  // Matches belong to a season, played against an opponent
  // status: setup | in_progress | complete
  // Queryable: by season_id (season schedule), by status (find live match), by date (recent)
  // Two common patterns: WHERE season_id=X | WHERE status='in_progress' | ORDER BY date DESC
  matches: '++id, season_id, status, date',

  // Sets belong to a match
  // status: in_progress | complete
  // Queryable: by match_id (all sets in match)
  sets: '++id, match_id, set_number',

  // Starting lineup for a set (6 rows per set)
  // Queryable: by set_id (get full lineup)
  lineups: '++id, set_id, player_id',

  // Substitutions within a set
  // Queryable: by set_id (all subs in set)
  substitutions: '++id, set_id, rally_number',

  // One rally per point
  // point_winner: us | them
  // serve_side: us | them
  // our_rotation: 1–6
  // Queryable: by set_id (all rallies in set) — primary access pattern
  rallies: '++id, set_id, rally_number',

  // Every ball contact in a rally
  // action: serve | pass | set | attack | block | dig | freeball_receive | freeball_send | cover
  // result: varies by action (see directives/01-db-schema.md)
  // court_x, court_y: 0.0–1.0 normalized; zone: 1–6 pre-computed
  // opponent_contact: true if opponent made this touch
  //
  // Index strategy: match_id first (broadest filter), then player_id for per-player stats,
  // then action for category queries. set_id for set-level queries.
  contacts: '++id, match_id, player_id, action, set_id, rally_id',
});

export default db;
