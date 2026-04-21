import { db } from '../db/schema';

// ── Helpers ───────────────────────────────────────────────────────────────────

function norm(s) { return (s ?? '').trim().toLowerCase(); }

function groupBy(arr, key) {
  const map = new Map();
  for (const item of arr) {
    const k = item[key];
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
}

// Natural keys — used to match records across devices
const nkOrg    = o => norm(o.name);
const nkTeam   = t => `${norm(t.name)}|${t.gender ?? ''}|${t.level ?? ''}`;
const nkSeason = s => String(s.year ?? '');
const nkPlayer = p => `${p.jersey_number ?? ''}|${norm(p.name)}`;
const nkOpp    = o => norm(o.name);
const nkMatch  = m => `${norm(m.opponent_name)}|${(m.date ?? '').slice(0, 10)}`;

// ── Phase 1 — Preview (read-only) ─────────────────────────────────────────────

export async function parseMergePreview(file) {
  let data;
  try {
    const text = await file.text();
    data = JSON.parse(text);
  } catch {
    return { valid: false, error: 'Invalid file — could not parse JSON.' };
  }

  if (!data.version) return { valid: false, error: 'Invalid backup: missing version field.' };

  const required = ['organizations', 'teams', 'seasons', 'players', 'opponents', 'matches', 'sets', 'rallies', 'contacts'];
  const missing  = required.filter(t => !Array.isArray(data[t]));
  if (missing.length) return { valid: false, error: `Missing tables: ${missing.join(', ')}` };

  // Load existing DB records needed to classify imported matches
  const [exOrgs, exTeams, exSeasons, exMatches, exContacts] = await Promise.all([
    db.organizations.toArray(),
    db.teams.toArray(),
    db.seasons.toArray(),
    db.matches.toArray(),
    db.contacts.toArray(),
  ]);

  const exOrgByKey    = new Map(exOrgs.map(o    => [nkOrg(o),                       o]));
  const exTeamByKey   = new Map(exTeams.map(t   => [`${t.org_id}|${nkTeam(t)}`,     t]));
  const exSeasonByKey = new Map(exSeasons.map(s => [`${s.team_id}|${nkSeason(s)}`,  s]));
  const exMatchByKey  = new Map(exMatches.map(m => [`${m.season_id}|${nkMatch(m)}`, m]));

  const exContactsByMatch = new Map();
  for (const c of exContacts) {
    exContactsByMatch.set(c.match_id, (exContactsByMatch.get(c.match_id) ?? 0) + 1);
  }

  // Build imported-id → existing-id maps for hierarchy above match
  const impOrgMap    = new Map();
  const impTeamMap   = new Map();
  const impSeasonMap = new Map();

  for (const o of data.organizations) {
    const ex = exOrgByKey.get(nkOrg(o));
    if (ex) impOrgMap.set(o.id, ex.id);
  }
  for (const t of data.teams) {
    const exOrgId = impOrgMap.get(t.org_id);
    if (exOrgId == null) continue;
    const ex = exTeamByKey.get(`${exOrgId}|${nkTeam(t)}`);
    if (ex) impTeamMap.set(t.id, ex.id);
  }
  for (const s of data.seasons) {
    const exTeamId = impTeamMap.get(s.team_id);
    if (exTeamId == null) continue;
    const ex = exSeasonByKey.get(`${exTeamId}|${nkSeason(s)}`);
    if (ex) impSeasonMap.set(s.id, ex.id);
  }

  // Contact and set counts per imported match
  const impContactsByMatch = new Map();
  for (const c of data.contacts) {
    impContactsByMatch.set(c.match_id, (impContactsByMatch.get(c.match_id) ?? 0) + 1);
  }
  const impSeasonById = new Map(data.seasons.map(s => [s.id, s]));

  const newMatches = [];
  const conflicts  = [];

  for (const m of data.matches) {
    const exSeasonId = impSeasonMap.get(m.season_id);
    const seasonYear = impSeasonById.get(m.season_id)?.year ?? '?';

    const info = {
      id:           m.id,
      opponentName: m.opponent_name ?? 'Unknown',
      date:         (m.date ?? '').slice(0, 10),
      ourSetsWon:   m.our_sets_won  ?? 0,
      oppSetsWon:   m.opp_sets_won  ?? 0,
      contactCount: impContactsByMatch.get(m.id) ?? 0,
      status:       m.status,
      seasonYear,
    };

    if (exSeasonId == null) {
      newMatches.push(info);
      continue;
    }

    const exMatch = exMatchByKey.get(`${exSeasonId}|${nkMatch(m)}`);
    if (!exMatch) {
      newMatches.push(info);
    } else {
      conflicts.push({
        importedId: m.id,
        imported:   info,
        current: {
          id:           exMatch.id,
          opponentName: exMatch.opponent_name ?? 'Unknown',
          date:         (exMatch.date ?? '').slice(0, 10),
          ourSetsWon:   exMatch.our_sets_won  ?? 0,
          oppSetsWon:   exMatch.opp_sets_won  ?? 0,
          contactCount: exContactsByMatch.get(exMatch.id) ?? 0,
          status:       exMatch.status,
          seasonYear,
        },
      });
    }
  }

  return { valid: true, error: null, newMatches, conflicts, _data: data };
}

// ── Phase 2 — Execute ─────────────────────────────────────────────────────────

// decisions: { [importedMatchId]: 'keep' | 'replace' }
// matches absent from decisions are new and always imported
export async function executeMerge(preview, decisions) {
  const data = preview._data;

  const impSetsByMatch   = groupBy(data.sets,                  'match_id');
  const impLineupsBySet  = groupBy(data.lineups        ?? [],  'set_id');
  const impSubsBySet     = groupBy(data.substitutions  ?? [],  'set_id');
  const impRalliesBySet  = groupBy(data.rallies,               'set_id');
  const impContactsBySet = groupBy(data.contacts,              'set_id');

  const [exOrgs, exTeams, exSeasons, exPlayers, exOpps, exMatches] = await Promise.all([
    db.organizations.toArray(),
    db.teams.toArray(),
    db.seasons.toArray(),
    db.players.toArray(),
    db.opponents.toArray(),
    db.matches.toArray(),
  ]);

  const exOrgByKey    = new Map(exOrgs.map(o    => [nkOrg(o),                       o]));
  const exTeamByKey   = new Map(exTeams.map(t   => [`${t.org_id}|${nkTeam(t)}`,     t]));
  const exSeasonByKey = new Map(exSeasons.map(s => [`${s.team_id}|${nkSeason(s)}`,  s]));
  const exPlayerByKey = new Map(exPlayers.map(p => [`${p.team_id}|${nkPlayer(p)}`,  p]));
  const exOppByKey    = new Map(exOpps.map(o    => [nkOpp(o),                       o]));
  const exMatchByKey  = new Map(exMatches.map(m => [`${m.season_id}|${nkMatch(m)}`, m]));

  const orgMap    = new Map(); // imported id → db id
  const teamMap   = new Map();
  const seasonMap = new Map();
  const playerMap = new Map();
  const oppMap    = new Map();

  let matchesAdded    = 0;
  let matchesReplaced = 0;

  await db.transaction('rw', db.tables, async () => {

    // ── 1. Organizations ───────────────────────────────────────────────────
    for (const o of data.organizations) {
      const ex = exOrgByKey.get(nkOrg(o));
      if (ex) { orgMap.set(o.id, ex.id); continue; }
      const { id: _, ...rest } = o;
      const newId = await db.organizations.add(rest);
      orgMap.set(o.id, newId);
      exOrgByKey.set(nkOrg({ ...rest, id: newId }), { ...rest, id: newId });
    }

    // ── 2. Teams ───────────────────────────────────────────────────────────
    for (const t of data.teams) {
      const exOrgId = orgMap.get(t.org_id);
      if (exOrgId == null) continue;
      const ex = exTeamByKey.get(`${exOrgId}|${nkTeam(t)}`);
      if (ex) { teamMap.set(t.id, ex.id); continue; }
      const { id: _, org_id: __, ...rest } = t;
      const newId = await db.teams.add({ ...rest, org_id: exOrgId });
      teamMap.set(t.id, newId);
      exTeamByKey.set(`${exOrgId}|${nkTeam({ ...rest, id: newId })}`, { ...rest, id: newId, org_id: exOrgId });
    }

    // ── 3. Seasons ─────────────────────────────────────────────────────────
    for (const s of data.seasons) {
      const exTeamId = teamMap.get(s.team_id);
      if (exTeamId == null) continue;
      const ex = exSeasonByKey.get(`${exTeamId}|${nkSeason(s)}`);
      if (ex) { seasonMap.set(s.id, ex.id); continue; }
      const { id: _, team_id: __, ...rest } = s;
      const newId = await db.seasons.add({ ...rest, team_id: exTeamId });
      seasonMap.set(s.id, newId);
    }

    // ── 4. Players ─────────────────────────────────────────────────────────
    for (const p of data.players) {
      const exTeamId = teamMap.get(p.team_id);
      if (exTeamId == null) continue;
      const ex = exPlayerByKey.get(`${exTeamId}|${nkPlayer(p)}`);
      if (ex) { playerMap.set(p.id, ex.id); continue; }
      const { id: _, team_id: __, ...rest } = p;
      const newId = await db.players.add({ ...rest, team_id: exTeamId });
      playerMap.set(p.id, newId);
      exPlayerByKey.set(`${exTeamId}|${nkPlayer({ ...rest, id: newId })}`, { ...rest, id: newId, team_id: exTeamId });
    }

    // ── 5. Opponents ───────────────────────────────────────────────────────
    for (const o of data.opponents) {
      const ex = exOppByKey.get(nkOpp(o));
      if (ex) { oppMap.set(o.id, ex.id); continue; }
      const { id: _, ...rest } = o;
      const newId = await db.opponents.add(rest);
      oppMap.set(o.id, newId);
      exOppByKey.set(nkOpp({ ...rest, id: newId }), { ...rest, id: newId });
    }

    // ── 6. Matches ─────────────────────────────────────────────────────────
    for (const impMatch of data.matches) {
      const decision   = decisions[impMatch.id]; // 'keep' | 'replace' | undefined = new
      const exSeasonId = seasonMap.get(impMatch.season_id);
      if (exSeasonId == null) continue;

      if (decision === 'keep') {
        const ex = exMatchByKey.get(`${exSeasonId}|${nkMatch(impMatch)}`);
        if (ex) {
          // Map to existing so optional-table refs resolve correctly
          // (no data imported for this match)
        }
        continue;
      }

      if (decision === 'replace') {
        const ex = exMatchByKey.get(`${exSeasonId}|${nkMatch(impMatch)}`);
        if (ex) {
          const exSets   = await db.sets.where('match_id').equals(ex.id).toArray();
          const exSetIds = exSets.map(s => s.id);
          await db.contacts.where('match_id').equals(ex.id).delete();
          if (exSetIds.length) {
            await db.rallies.where('set_id').anyOf(exSetIds).delete();
            await db.lineups.where('set_id').anyOf(exSetIds).delete();
            await db.substitutions.where('set_id').anyOf(exSetIds).delete();
          }
          await db.sets.where('match_id').equals(ex.id).delete();
          await db.matches.delete(ex.id);
          matchesReplaced++;
        }
      }

      // Insert match
      const matchToInsert  = { ...impMatch };
      delete matchToInsert.id;
      matchToInsert.season_id   = exSeasonId;
      matchToInsert.opponent_id = impMatch.opponent_id != null
        ? (oppMap.get(impMatch.opponent_id) ?? null)
        : null;
      const newMatchId = await db.matches.add(matchToInsert);
      if (decision !== 'replace') matchesAdded++;

      // ── Sets ──────────────────────────────────────────────────────────
      const impSets  = impSetsByMatch.get(impMatch.id) ?? [];
      const localSetMap = new Map(); // imp set id → new set id

      if (impSets.length) {
        const setRows = impSets.map(s => {
          const row = { ...s, match_id: newMatchId };
          delete row.id;
          return row;
        });
        const newSetIds = await db.sets.bulkAdd(setRows, { allKeys: true });
        impSets.forEach((s, i) => localSetMap.set(s.id, newSetIds[i]));
      }

      // ── Lineups ───────────────────────────────────────────────────────
      const lineupRows = [];
      for (const impSet of impSets) {
        const newSetId = localSetMap.get(impSet.id);
        if (newSetId == null) continue;
        for (const lu of impLineupsBySet.get(impSet.id) ?? []) {
          const row = { ...lu, set_id: newSetId, player_id: lu.player_id != null ? (playerMap.get(lu.player_id) ?? null) : null };
          delete row.id;
          lineupRows.push(row);
        }
      }
      if (lineupRows.length) await db.lineups.bulkAdd(lineupRows);

      // ── Substitutions ─────────────────────────────────────────────────
      const subRows = [];
      for (const impSet of impSets) {
        const newSetId = localSetMap.get(impSet.id);
        if (newSetId == null) continue;
        for (const sub of impSubsBySet.get(impSet.id) ?? []) {
          const row = {
            ...sub,
            set_id:        newSetId,
            player_in_id:  sub.player_in_id  != null ? (playerMap.get(sub.player_in_id)  ?? null) : null,
            player_out_id: sub.player_out_id != null ? (playerMap.get(sub.player_out_id) ?? null) : null,
          };
          delete row.id;
          subRows.push(row);
        }
      }
      if (subRows.length) await db.substitutions.bulkAdd(subRows);

      // ── Rallies ───────────────────────────────────────────────────────
      const localRallyMap = new Map();
      const rallyOrigIds  = [];
      const rallyRows     = [];
      for (const impSet of impSets) {
        const newSetId = localSetMap.get(impSet.id);
        if (newSetId == null) continue;
        for (const rally of impRalliesBySet.get(impSet.id) ?? []) {
          rallyOrigIds.push(rally.id);
          const row = { ...rally, set_id: newSetId };
          delete row.id;
          rallyRows.push(row);
        }
      }
      if (rallyRows.length) {
        const newRallyIds = await db.rallies.bulkAdd(rallyRows, { allKeys: true });
        rallyOrigIds.forEach((origId, i) => localRallyMap.set(origId, newRallyIds[i]));
      }

      // ── Contacts ──────────────────────────────────────────────────────
      const contactRows = [];
      for (const impSet of impSets) {
        const newSetId = localSetMap.get(impSet.id);
        if (newSetId == null) continue;
        for (const c of impContactsBySet.get(impSet.id) ?? []) {
          const row = {
            ...c,
            match_id:  newMatchId,
            set_id:    newSetId,
            rally_id:  c.rally_id  != null ? (localRallyMap.get(c.rally_id)  ?? null) : null,
            player_id: c.player_id != null ? (playerMap.get(c.player_id)     ?? null) : null,
          };
          delete row.id;
          contactRows.push(row);
        }
      }
      if (contactRows.length) await db.contacts.bulkAdd(contactRows);
    }

    // ── 7. Historical records ──────────────────────────────────────────────
    if (Array.isArray(data.historical_records)) {
      const exHistorical = await db.historical_records.toArray();
      const exHistSet    = new Set(
        exHistorical.map(r => `${r.team_id}|${r.category}|${r.stat}|${norm(r.player_name ?? '')}|${r.value}`)
      );
      const toAdd = [];
      for (const rec of data.historical_records) {
        const exTeamId = teamMap.get(rec.team_id);
        if (exTeamId == null) continue;
        const key = `${exTeamId}|${rec.category}|${rec.stat}|${norm(rec.player_name ?? '')}|${rec.value}`;
        if (!exHistSet.has(key)) {
          const row = { ...rec, team_id: exTeamId };
          delete row.id;
          toAdd.push(row);
          exHistSet.add(key);
        }
      }
      if (toAdd.length) await db.historical_records.bulkAdd(toAdd);
    }

  });

  return { matchesAdded, matchesReplaced };
}
