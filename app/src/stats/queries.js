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
  return Math.max(1, complete + (inProgress ? 1 : 0));
};

// Batched version — single query for multiple matches, returns { [matchId]: count }
export const getBatchSetsPlayedCount = async (matchIds) => {
  if (!matchIds.length) return {};
  const sets = await db.sets.where('match_id').anyOf(matchIds).toArray();
  const counts = Object.fromEntries(matchIds.map(id => [id, 0]));
  let inProgress = {};
  for (const s of sets) {
    if (s.status === 'complete')     counts[s.match_id] = (counts[s.match_id] ?? 0) + 1;
    if (s.status === 'in_progress')  inProgress[s.match_id] = true;
  }
  for (const id of matchIds) {
    if (inProgress[id]) counts[id] = (counts[id] ?? 0) + 1;
    if (!counts[id]) counts[id] = 1;
  }
  return counts;
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

// Sum of opp_score across all complete sets for the given matches
export const getOppScoredForMatches = async (matchIds) => {
  if (!matchIds.length) return 0;
  const sets = await db.sets.where('match_id').anyOf(matchIds).toArray();
  return sets
    .filter(s => s.status === 'complete')
    .reduce((sum, s) => sum + (s.opp_score ?? 0), 0);
};

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

// Cascade-delete a match and all dependent records
export async function deleteMatch(matchId) {
  const sets   = await db.sets.where('match_id').equals(matchId).toArray();
  const setIds = sets.map((s) => s.id);
  await Promise.all([
    db.contacts.where('match_id').equals(matchId).delete(),
    db.rallies.where('set_id').anyOf(setIds).delete(),
    db.lineups.where('set_id').anyOf(setIds).delete(),
    db.substitutions.where('set_id').anyOf(setIds).delete(),
  ]);
  await db.sets.where('match_id').equals(matchId).delete();
  await db.matches.delete(matchId);
}
