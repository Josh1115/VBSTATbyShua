import { db } from '../db/schema';

// ── Single-match queries ────────────────────────────────────────────────────

export const getContactsForMatch = (matchId) =>
  db.contacts.where('match_id').equals(matchId).toArray();

// Count of sets used as denominator in per-set stats (KPS, DiPS, etc.)
// Counts complete sets + 1 if a set is currently in progress.
export const getSetsPlayedCount = async (matchId) => {
  const sets = await db.sets.where('match_id').equals(matchId).toArray();
  const complete   = sets.filter(s => s.status === 'complete').length;
  const inProgress = sets.some(s => s.status === 'in_progress');
  return complete + (inProgress ? 1 : 0) || 1;
};

// Rallies for a match — requires two hops (match → sets → rallies)
export const getRalliesForMatch = async (matchId) => {
  const sets   = await db.sets.where('match_id').equals(matchId).toArray();
  const setIds = sets.map(s => s.id);
  return setIds.length
    ? db.rallies.where('set_id').anyOf(setIds).toArray()
    : [];
};

// ── Multi-match queries (season / report view) ──────────────────────────────

export const getContactsForMatches = (matchIds) =>
  matchIds.length
    ? db.contacts.where('match_id').anyOf(matchIds).toArray()
    : Promise.resolve([]);

export const getMatchesForSeason = (seasonId) =>
  db.matches.where('season_id').equals(seasonId).toArray();

// Rallies for multiple matches — used by season-level stats
export const getRalliesForMatches = async (matchIds) => {
  if (!matchIds.length) return [];
  const sets = await db.sets.where('match_id').anyOf(matchIds).toArray();
  const setIds = sets.map(s => s.id);
  return setIds.length
    ? db.rallies.where('set_id').anyOf(setIds).toArray()
    : [];
};

// Returns { [player_id]: modal_position_label } derived from actual lineup and substitution records.
// Lineup records (starters) take precedence; substitution in_position_label fills the gap for sub players.
// Uses the most frequently-played position when a player appears at multiple positions.
export const getPlayerPositionsForMatches = async (matchIds) => {
  if (!matchIds.length) return {};
  const sets = await db.sets.where('match_id').anyOf(matchIds).toArray();
  const setIds = sets.map(s => s.id);
  if (!setIds.length) return {};

  const [lineupRows, subRows] = await Promise.all([
    db.lineups.where('set_id').anyOf(setIds).toArray(),
    db.substitutions.where('set_id').anyOf(setIds).toArray(),
  ]);

  const tally = {};

  // Starters — from lineup records
  for (const row of lineupRows) {
    if (!row.player_id || !row.position_label) continue;
    (tally[row.player_id] ??= {})[row.position_label] =
      ((tally[row.player_id][row.position_label] ?? 0) + 1);
  }

  // Sub players — only use substitution position if player has no lineup record at all
  const lineupPlayerIds = new Set(lineupRows.map(r => r.player_id));
  for (const row of subRows) {
    if (!row.player_in || !row.in_position_label) continue;
    if (lineupPlayerIds.has(row.player_in)) continue; // lineup record wins
    (tally[row.player_in] ??= {})[row.in_position_label] =
      ((tally[row.player_in][row.in_position_label] ?? 0) + 1);
  }

  return Object.fromEntries(
    Object.entries(tally).map(([pid, counts]) => [
      pid,
      Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0],
    ])
  );
};
