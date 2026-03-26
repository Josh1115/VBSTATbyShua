/**
 * Build name and jersey lookup maps from an array of player objects.
 * Returns { playerNames: { [id]: name }, playerJerseys: { [id]: jerseyNumber } }.
 */
export function buildPlayerMaps(players) {
  const playerNames   = {};
  const playerJerseys = {};
  for (const p of players ?? []) {
    playerNames[p.id]   = p.name;
    playerJerseys[p.id] = p.jersey_number ?? '';
  }
  return { playerNames, playerJerseys };
}
