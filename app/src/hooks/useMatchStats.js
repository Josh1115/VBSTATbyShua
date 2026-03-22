import { useMemo } from 'react';
import { useMatchStore } from '../store/matchStore';
import { useShallow } from 'zustand/react/shallow';
import { computePlayerStats, computeTeamStats, computeOppDisplayStats, computePointQuality } from '../stats/engine';

export function useMatchStats() {
  const { committedContacts, setNumber, lineup } = useMatchStore(useShallow((s) => ({
    committedContacts: s.committedContacts,
    setNumber:         s.setNumber,
    lineup:            s.lineup,
  })));

  const playerPositions = useMemo(() =>
    Object.fromEntries(lineup.filter((s) => s.playerId).map((s) => [s.playerId, s.positionLabel])),
    [lineup]
  );

  const playerStats    = useMemo(() => computePlayerStats(committedContacts, setNumber, playerPositions), [committedContacts, setNumber, playerPositions]);
  const teamStats      = useMemo(() => computeTeamStats(committedContacts, setNumber),                   [committedContacts, setNumber]);
  const oppStats       = useMemo(() => computeOppDisplayStats(committedContacts),                        [committedContacts]);
  const pointQuality   = useMemo(() => computePointQuality(committedContacts),                           [committedContacts]);
  return { playerStats, teamStats, oppStats, pointQuality };
}
