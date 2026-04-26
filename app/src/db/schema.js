import Dexie from 'dexie';

export const db = new Dexie('VBAPPv2');

// v15: add tourney_entries table for manual tournament history.
db.version(15).stores({
  rallies:            '++id, set_id, rally_number',
  sets:               '++id, match_id, set_number',
  lineups:            '++id, set_id, player_id',
  substitutions:      '++id, set_id, rally_number',
  organizations:      '++id, name, type',
  teams:              '++id, org_id, name',
  seasons:            '++id, team_id, year',
  players:            '++id, team_id, is_active',
  opponents:          '++id, name',
  saved_lineups:      '++id, team_id',
  contacts:           '++id, match_id, player_id, action, set_id, rally_id, rotation_num',
  matches:            '++id, season_id, status, date, opponent_id',
  opp_tendencies:     '++id, opp_id, match_id',
  timeouts:           '++id, match_id, set_id',
  historical_records: '++id, team_id, category, stat',
  season_history:     '++id, team_id, year',
  tourney_entries:    '++id, team_id, year',
});

// v14: add season_history table for per-season program history.
db.version(14).stores({
  rallies:            '++id, set_id, rally_number',
  sets:               '++id, match_id, set_number',
  lineups:            '++id, set_id, player_id',
  substitutions:      '++id, set_id, rally_number',
  organizations:      '++id, name, type',
  teams:              '++id, org_id, name',
  seasons:            '++id, team_id, year',
  players:            '++id, team_id, is_active',
  opponents:          '++id, name',
  saved_lineups:      '++id, team_id',
  contacts:           '++id, match_id, player_id, action, set_id, rally_id, rotation_num',
  matches:            '++id, season_id, status, date, opponent_id',
  opp_tendencies:     '++id, opp_id, match_id',
  timeouts:           '++id, match_id, set_id',
  historical_records: '++id, team_id, category, stat',
  season_history:     '++id, team_id, year',
});

// v13: add historical_records table for pre-app season records.
db.version(13).stores({
  rallies:            '++id, set_id, rally_number',
  sets:               '++id, match_id, set_number',
  lineups:            '++id, set_id, player_id',
  substitutions:      '++id, set_id, rally_number',
  organizations:      '++id, name, type',
  teams:              '++id, org_id, name',
  seasons:            '++id, team_id, year',
  players:            '++id, team_id, is_active',
  opponents:          '++id, name',
  saved_lineups:      '++id, team_id',
  contacts:           '++id, match_id, player_id, action, set_id, rally_id, rotation_num',
  matches:            '++id, season_id, status, date, opponent_id',
  opp_tendencies:     '++id, opp_id, match_id',
  timeouts:           '++id, match_id, set_id',
  historical_records: '++id, team_id, category, stat',
});

// v12: add timeouts table for timeout effectiveness tracking.
db.version(12).stores({
  rallies:         '++id, set_id, rally_number',
  sets:            '++id, match_id, set_number',
  lineups:         '++id, set_id, player_id',
  substitutions:   '++id, set_id, rally_number',
  organizations:   '++id, name, type',
  teams:           '++id, org_id, name',
  seasons:         '++id, team_id, year',
  players:         '++id, team_id, is_active',
  opponents:       '++id, name',
  saved_lineups:   '++id, team_id',
  contacts:        '++id, match_id, player_id, action, set_id, rally_id, rotation_num',
  matches:         '++id, season_id, status, date, opponent_id',
  opp_tendencies:  '++id, opp_id, match_id',
  timeouts:        '++id, match_id, set_id',
});

// v11: add opponent_id index on matches for efficient opponent history queries.
db.version(11).stores({
  rallies:         '++id, set_id, rally_number',
  sets:            '++id, match_id, set_number',
  lineups:         '++id, set_id, player_id',
  substitutions:   '++id, set_id, rally_number',
  organizations:   '++id, name, type',
  teams:           '++id, org_id, name',
  seasons:         '++id, team_id, year',
  players:         '++id, team_id, is_active',
  opponents:       '++id, name',
  saved_lineups:   '++id, team_id',
  contacts:        '++id, match_id, player_id, action, set_id, rally_id, rotation_num',
  matches:         '++id, season_id, status, date, opponent_id',
  opp_tendencies:  '++id, opp_id, match_id',
});

// v10: add opp_tendencies table for structured opponent scouting data.
db.version(10).stores({
  rallies:         '++id, set_id, rally_number',
  sets:            '++id, match_id, set_number',
  lineups:         '++id, set_id, player_id',
  substitutions:   '++id, set_id, rally_number',
  organizations:   '++id, name, type',
  teams:           '++id, org_id, name',
  seasons:         '++id, team_id, year',
  players:         '++id, team_id, is_active',
  opponents:       '++id, name',
  saved_lineups:   '++id, team_id',
  contacts:        '++id, match_id, player_id, action, set_id, rally_id, rotation_num',
  matches:         '++id, season_id, status, date',
  opp_tendencies:  '++id, opp_id, match_id',
});

// v9: re-declare every table that was only ever defined in v1.
//   If a prior failed migration left the DB in a state where these tables
//   were never created, this forces Dexie to create them. If they already
//   exist, Dexie no-ops. No data is ever lost by re-declaring the same schema.
db.version(9).stores({
  rallies:       '++id, set_id, rally_number',
  sets:          '++id, match_id, set_number',
  lineups:       '++id, set_id, player_id',
  substitutions: '++id, set_id, rally_number',
  organizations: '++id, name, type',
  teams:         '++id, org_id, name',
  seasons:       '++id, team_id, year',
  players:       '++id, team_id, is_active',
  opponents:     '++id, name',
  saved_lineups: '++id, team_id',
  contacts:      '++id, match_id, player_id, action, set_id, rally_id, rotation_num',
  matches:       '++id, season_id, status, date',
});

// v8: remove compound indexes — they are not used by any query and are not
//   supported in Safari/WebKit before iOS 15.2, causing the v7 migration to
//   fail and breaking all IndexedDB writes on iPad.
db.version(8).stores({
  contacts: '++id, match_id, player_id, action, set_id, rally_id, rotation_num',
  matches:  '++id, season_id, status, date',
});

// v7: originally added compound indexes; changed to simple indexes because
//   compound indexes are not supported in Safari/WebKit before iOS 15.2.
//   Users already at v7 with compound indexes are cleaned up by v8 above.
//   Users stuck at v6 (failed v7) can now migrate through v7 successfully.
db.version(7).stores({
  contacts: '++id, match_id, player_id, action, set_id, rally_id, rotation_num',
  matches:  '++id, season_id, status, date',
});

db.version(6).stores({
  practice_sessions: '++id, team_id, tool_type, date',
});

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
  organizations: '++id, name, type',
  teams:         '++id, org_id, name',
  seasons:       '++id, team_id, year',
  players:       '++id, team_id, is_active',
  opponents:     '++id, name',
  matches:       '++id, season_id, status, date',
  sets:          '++id, match_id, set_number',
  lineups:       '++id, set_id, player_id',
  substitutions: '++id, set_id, rally_number',
  rallies:       '++id, set_id, rally_number',
  contacts:      '++id, match_id, player_id, action, set_id, rally_id',
});

// When another page/tab needs to upgrade the DB to a newer version, close
// this connection immediately so the upgrade isn't blocked indefinitely.
db.on('versionchange', () => {
  db.close();
  window.location.reload();
});

// If another connection is blocking the upgrade, reload and retry.
db.on('blocked', () => {
  window.location.reload();
});

// If the DB fails to open for ANY reason (corrupt state, version mismatch,
// failed prior migration, etc.), delete the DB and reload so the app stays
// functional. A sessionStorage flag prevents an infinite reload loop in
// environments where IndexedDB itself is unavailable (e.g. iOS Private Mode).
db.open().catch(async (err) => {
  console.error('[VBStat] DB open failed, resetting database:', err);
  const alreadyReset = sessionStorage.getItem('vbstat_db_reset');
  if (alreadyReset) {
    console.error('[VBStat] DB reset already attempted — IndexedDB may be unavailable in this context.');
    return;
  }
  sessionStorage.setItem('vbstat_db_reset', '1');
  try { await Dexie.delete('VBAPPv2'); } catch (deleteErr) { console.error('[VBStat] DB delete failed:', deleteErr); }
  window.location.reload();
});

export default db;
