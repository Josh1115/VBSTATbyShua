import { useEffect, useMemo, useRef } from 'react';
import { TRACKABLE_STATS } from '../constants';

/**
 * Compute the highest milestone met for a (currentValue, recordValue, statType) triple.
 * Returns the milestone string or null if none met.
 */
export function computeMilestone(current, record, statType) {
  if (current == null || record == null || isNaN(current) || isNaN(record) || record <= 0) return null;

  if (current > record) return 'beat';
  if (current === record) return 'tie';

  if (statType === 'count') {
    if (current === record - 1) return 'one_away';
    if (current >= Math.floor(record * 0.9)) return 'pct90';
    if (current >= Math.floor(record * 0.8)) return 'pct80';
  } else {
    // rate stat — no one_away
    if (current >= record * 0.9) return 'pct90';
    if (current >= record * 0.8) return 'pct80';
  }

  return null;
}

/**
 * useRecordAlerts(records, playerStats, teamStats)
 *
 * records      - array of DB record objects (individual_match + team_match only)
 * playerStats  - { [playerId]: statRow } from useMatchStats()
 * teamStats    - single statRow from useMatchStats()
 *
 * Returns:
 *   activeAlerts      - all currently-met milestones (always up-to-date)
 *   pendingAlerts     - milestones not yet shown (drives auto-open)
 *   markPendingShown  - call when opening modal; marks pending as shown
 */
export function useRecordAlerts(records, playerStats, teamStats) {
  // Tracks which (recordId, milestone) pairs have been shown this match
  const shownRef = useRef(new Set());

  // Prune stale shownRef entries when a record is deleted or replaced
  useEffect(() => {
    const currentIds = new Set(records?.map((r) => r.id) ?? []);
    for (const key of shownRef.current) {
      const recordId = Number(key.split('_')[0]);
      if (!currentIds.has(recordId)) shownRef.current.delete(key);
    }
  }, [records]);

  const activeAlerts = useMemo(() => {
    if (!records?.length) return [];

    const alerts = [];

    for (const record of records) {
      if (record.type !== 'individual_match' && record.type !== 'team_match') continue;

      const statDef = TRACKABLE_STATS.find((s) => s.key === record.stat);
      if (!statDef) continue; // legacy free-text record — skip

      const recordValue = parseFloat(record.value);
      if (isNaN(recordValue)) continue;

      let statRow = null;
      let playerName = 'Team';

      if (record.type === 'individual_match') {
        if (!record.player_id) continue;
        statRow = playerStats?.[record.player_id];
        playerName = record.player_name || 'Player';
      } else {
        statRow = teamStats;
      }

      if (!statRow) continue;

      const currentValue = statRow[statDef.key];
      if (currentValue == null) continue;

      const milestone = computeMilestone(currentValue, recordValue, statDef.type);
      if (!milestone) continue;

      alerts.push({
        recordId:     record.id,
        playerId:     record.player_id ?? null,
        playerName,
        statLabel:    statDef.label,
        statKey:      statDef.key,
        currentValue,
        recordValue,
        milestone,
      });
    }

    return alerts;
  }, [records, playerStats, teamStats]);

  const pendingAlerts = useMemo(() => {
    return activeAlerts.filter(
      (a) => !shownRef.current.has(`${a.recordId}_${a.milestone}`)
    );
  }, [activeAlerts]);

  function markPendingShown() {
    for (const a of pendingAlerts) {
      shownRef.current.add(`${a.recordId}_${a.milestone}`);
    }
  }

  return { activeAlerts, pendingAlerts, markPendingShown };
}
