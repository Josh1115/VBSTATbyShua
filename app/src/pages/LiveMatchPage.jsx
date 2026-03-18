import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { useMatchStore } from '../store/matchStore';
import { computePlayerStats, computeTeamStats } from '../stats/engine';
import { SET_STATUS, FORMAT, SIDE, MATCH_STATUS } from '../constants';
import { useMatchStats } from '../hooks/useMatchStats';
import { useRecordAlerts } from '../hooks/useRecordAlerts';
import { useWakeLock } from '../hooks/useWakeLock';
import { haptic } from '../utils/haptic';
import { ScoreHeader } from '../components/match/ScoreHeader';
import { CourtGrid } from '../components/court/CourtGrid';
import { ActionBar } from '../components/match/ActionBar';
import { SubstitutionModal } from '../components/match/SubstitutionModal';
import { LiberoPickerModal } from '../components/match/LiberoPickerModal';
import { LiberoSwapModal } from '../components/match/LiberoSwapModal';
import { MenuDrawer } from '../components/match/MenuDrawer';
import { LiveStatsModal } from '../components/stats/LiveStatsModal';
import { ScoringSummaryModal } from '../components/stats/ScoringSummaryModal';
import { TimeoutOverlay } from '../components/match/TimeoutOverlay';
import { OppScoringColumn } from '../components/match/OppScoringColumn';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Confetti } from '../components/ui/Confetti';
import { SetSummaryModal } from '../components/match/SetSummaryModal';

export function LiveMatchPage() {
  const { matchId: matchIdParam } = useParams();
  const navigate = useNavigate();
  const [ready,        setReady]        = useState(false);
  const [screenH,      setScreenH]      = useState(() => window.innerHeight);
  const [subOpen,      setSubOpen]      = useState(false);
  const [menuOpen,     setMenuOpen]     = useState(false);
  const [statsOpen,    setStatsOpen]    = useState(false);
  const [summaryOpen,  setSummaryOpen]  = useState(false);
  const [timeoutOpen,      setTimeoutOpen]      = useState(false);
  const [scoreAtTimeoutClose, setScoreAtTimeoutClose] = useState(null);
  const [liberoPickerOpen, setLiberoPickerOpen] = useState(false);
  const [liberoSwapOpen,   setLiberoSwapOpen]   = useState(false);

  const [liberoPlayer,        setLiberoPlayer]        = useState(null);
  const [confettiNav,         setConfettiNav]         = useState(null); // { path, matchWin } | null
  const [setSummaryData,      setSetSummaryData]      = useState(null); // { winner } | null
  const [teamName,            setTeamName]            = useState('');
  const [opponentName,        setOpponentName]        = useState('');
  const [liveStatsDefaultTab, setLiveStatsDefaultTab] = useState(null);

  const setMatch            = useMatchStore((s) => s.setMatch);
  const setLineup           = useMatchStore((s) => s.setLineup);
  const setPlayerNicknames  = useMatchStore((s) => s.setPlayerNicknames);
  const setLibero           = useMatchStore((s) => s.setLibero);
  const swapLibero          = useMatchStore((s) => s.swapLibero);
  const endSet              = useMatchStore((s) => s.endSet);
  const endMatch            = useMatchStore((s) => s.endMatch);
  const clearPendingSetWin  = useMatchStore((s) => s.clearPendingSetWin);
  const pendingSetWin       = useMatchStore((s) => s.pendingSetWin);
  const ourScore            = useMatchStore((s) => s.ourScore);
  const oppScore            = useMatchStore((s) => s.oppScore);
  const ourSetsWon          = useMatchStore((s) => s.ourSetsWon);
  const oppSetsWon          = useMatchStore((s) => s.oppSetsWon);
  const format              = useMatchStore((s) => s.format);

  const teamId       = useMatchStore((s) => s.teamId);
  const lineup       = useMatchStore((s) => s.lineup);
  const setNumber    = useMatchStore((s) => s.setNumber);
  const pointHistory = useMatchStore((s) => s.pointHistory);
  const currentRun   = useMatchStore((s) => s.currentRun);
  const { playerStats, teamStats } = useMatchStats();

  const [records, setRecords] = useState([]);
  useEffect(() => {
    if (!teamId) return;
    db.records.where('team_id').equals(teamId).toArray().then(setRecords);
  }, [teamId]);

  // Full-match contacts (across all sets) for accurate cross-set record tracking
  const matchId = parseInt(matchIdParam, 10);
  const allMatchContacts = useLiveQuery(
    () => matchId ? db.contacts.where('match_id').equals(matchId).toArray() : [],
    [matchId]
  );

  const matchPositionMap = useMemo(() =>
    Object.fromEntries(lineup.filter((sl) => sl.playerId).map((sl) => [sl.playerId, sl.positionLabel])),
    [lineup]
  );

  const matchPlayerStats = useMemo(
    () => computePlayerStats(allMatchContacts ?? [], setNumber, matchPositionMap),
    [allMatchContacts, setNumber, matchPositionMap]
  );
  const matchTeamStats = useMemo(
    () => computeTeamStats(allMatchContacts ?? [], setNumber),
    [allMatchContacts, setNumber]
  );

  const { activeAlerts, pendingAlerts, markPendingShown } = useRecordAlerts(records ?? [], matchPlayerStats, matchTeamStats);

  // Keep screen awake during live match if setting is on
  useWakeLock(localStorage.getItem('vbstat_wake_lock') === '1');

  // Haptic feedback on score change
  const prevScoreRef = useRef({ our: ourScore, opp: oppScore });
  useEffect(() => {
    const prev = prevScoreRef.current;
    if (ourScore !== prev.our || oppScore !== prev.opp) {
      haptic(28);
      prevScoreRef.current = { our: ourScore, opp: oppScore };
    }
  }, [ourScore, oppScore]);

  // Auto-open LiveStatsModal on RECORDS tab when new milestone is crossed between points
  const pointCount = pointHistory.length;
  useEffect(() => {
    if (pointCount > 0 && pendingAlerts.length > 0) {
      markPendingShown();
      setStatsOpen(true);
      setLiveStatsDefaultTab('RECORDS');
    }
  // intentionally only re-runs when a new point is scored; markPendingShown and
  // setStatsOpen are stable refs that don't need to be deps
  }, [pointCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTimeoutClose = useCallback(() => {
    const { ourScore, oppScore } = useMatchStore.getState();
    setScoreAtTimeoutClose({ us: ourScore, them: oppScore });
    setTimeoutOpen(false);
  }, []);
  const handleLiberoPick   = useCallback((player) => {
    setLibero(player.id);
    setLiberoPlayer(player);
    setLiberoPickerOpen(false);
  }, [setLibero]);

  useEffect(() => {
    // Lock to landscape; release on unmount
    screen.orientation?.lock('landscape').catch(() => {});
    return () => screen.orientation?.unlock?.();
  }, []);

  // Use window.innerHeight for reliable cross-platform viewport height
  // (100dvh can include browser chrome on older iOS, hiding the ActionBar)
  useEffect(() => {
    const update = () => setScreenH(window.innerHeight);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Detect portrait orientation (Safari on iPad ignores orientation lock)
  const [isPortrait, setIsPortrait] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait)');
    setIsPortrait(mq.matches);
    const handler = (e) => setIsPortrait(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    const matchId = parseInt(matchIdParam, 10);
    if (!matchId) return;

    async function init() {
      // Level 1: match + in-progress set in parallel
      const [match, currentSetOrNull] = await Promise.all([
        db.matches.get(matchId),
        db.sets.where('match_id').equals(matchId).filter((s) => s.status === SET_STATUS.IN_PROGRESS).first(),
      ]);
      if (!match) return;

      // If no in-progress set, fall back to last set
      let currentSet = currentSetOrNull;
      if (!currentSet) {
        const allSets = await db.sets.where('match_id').equals(matchId).sortBy('set_number');
        currentSet = allSets[allSets.length - 1];
      }
      if (!currentSet) {
        // Scheduled match with no sets yet — send to setup to configure lineup
        navigate(`/matches/new?match=${matchId}`);
        return;
      }

      // Level 2: season + lineup rows in parallel
      const [season, lineupRows] = await Promise.all([
        match.season_id ? db.seasons.get(match.season_id) : null,
        db.lineups.where('set_id').equals(currentSet.id).toArray(),
      ]);

      // Level 3: team + lineup players + explicit libero in parallel
      const playerIds = lineupRows.map((r) => r.player_id);
      const [team, players, explicitLibero] = await Promise.all([
        season?.team_id ? db.teams.get(season.team_id) : null,
        playerIds.length ? db.players.bulkGet(playerIds) : [],
        currentSet.libero_player_id ? db.players.get(currentSet.libero_player_id) : null,
      ]);

      if (lineupRows.length > 0) {
        const lineup = lineupRows
          .map((row, i) => ({
            position:      row.position,
            serveOrder:    row.serve_order ?? row.position,
            playerId:      row.player_id,
            playerName:    players[i]?.name ?? '',
            jersey:        players[i]?.jersey_number ?? '',
            positionLabel: row.position_label || players[i]?.position || '',
            year:          players[i]?.year ?? '',
          }))
          .sort((a, b) => a.position - b.position);
        setLineup(lineup);
        setPlayerNicknames(
          Object.fromEntries(players.filter(Boolean).map((p) => [p.id, p.nickname ?? '']))
        );
      }

      // Resolve libero: explicit set designation → full-roster 'L' scan → nothing
      let libero = explicitLibero;
      if (!libero && season?.team_id) {
        libero = await db.players
          .where('team_id').equals(season.team_id)
          .filter((p) => p.position === 'L' && p.is_active)
          .first();
      }
      if (libero) {
        setLibero(libero.id);
        setLiberoPlayer(libero);
      }

      // Resolve opponent name: stored on match, or look up from opponents table
      let resolvedOpponentName = match.opponent_name ?? '';
      if (!resolvedOpponentName && match.opponent_id) {
        const opp = await db.opponents.get(match.opponent_id);
        resolvedOpponentName = opp?.name ?? '';
      }

      // Use stored abbreviation; fall back to first 3 chars of full name
      const teamDisplayName = team?.abbreviation
        || (team?.name ? team.name.slice(0, 3).toUpperCase() : '');
      const oppDisplayName = match.opponent_abbr
        || (resolvedOpponentName ? resolvedOpponentName.slice(0, 3).toUpperCase() : '');

      setTeamName(teamDisplayName);
      setOpponentName(oppDisplayName);
      setMatch(matchId, currentSet.id, season?.team_id ?? null, match.format ?? null);
      setReady(true);
    }

    init();
  }, [matchIdParam]);

  if (!ready) {
    return (
      <div className="h-screen bg-bg flex items-center justify-center">
        <span className="text-slate-400 text-sm">Loading match…</span>
      </div>
    );
  }

  const scanlineAlpha = currentRun.count >= 7 ? 0.06
    : currentRun.count >= 5 ? 0.045
    : currentRun.count >= 3 ? 0.03
    : 0.015;

  return (
    // Full viewport, no scroll, column layout
    // h-dvh = dynamic viewport height (accounts for iOS Safari browser chrome)
    <div className="w-screen flex flex-col bg-court overflow-hidden" style={{ height: screenH }}>

      {/* CRT scanline overlay — intensity scales with run count */}
      <div
        className="absolute inset-0 crt-scanlines-live pointer-events-none z-[5]"
        aria-hidden="true"
        style={{ '--scanline-alpha': scanlineAlpha }}
      />

      {/* Portrait orientation guard — Safari on iPad ignores orientation lock */}
      {isPortrait && (
        <div className="fixed inset-0 z-[100] bg-slate-900 flex flex-col items-center justify-center gap-6 text-center px-8">
          <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="2" />
            <path d="M12 18h.01" />
          </svg>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'rotate(-90deg)' }}>
            <path d="M4.5 10.5 12 3l7.5 7.5" />
            <path d="M12 3v18" />
          </svg>
          <div>
            <p className="text-white text-xl font-bold mb-2">Rotate to Landscape</p>
            <p className="text-slate-400 text-sm">The stat screen requires landscape orientation</p>
          </div>
        </div>
      )}

      {/* Middle section: score header + court/scoring row */}
      <div className="flex flex-col flex-1 min-h-0">
        <ScoreHeader
          liberoPlayer={liberoPlayer}
          teamName={teamName}
          opponentName={opponentName}
          onTimeoutCalled={() => setTimeoutOpen(true)}
          onAssignLibero={!liberoPlayer ? () => setLiberoPickerOpen(true) : undefined}
        />
        <div className="flex flex-row flex-1 min-h-0">
          <CourtGrid />
          <OppScoringColumn />
        </div>
      </div>

      <ActionBar
        onSubOpen={() => setSubOpen(true)}
        onMenuOpen={() => setMenuOpen(true)}
        onStatsOpen={() => setStatsOpen(true)}
        onSummaryOpen={() => setSummaryOpen(true)}
        onLiberoIn={() => setLiberoSwapOpen(true)}
        liberoPlayer={liberoPlayer}
      />

      {subOpen          && <SubstitutionModal onClose={() => setSubOpen(false)} />}
      {liberoPickerOpen && <LiberoPickerModal onClose={() => setLiberoPickerOpen(false)} onPick={handleLiberoPick} />}
      {liberoSwapOpen && liberoPlayer && (
        <LiberoSwapModal
          liberoPlayer={liberoPlayer}
          onClose={() => setLiberoSwapOpen(false)}
          onPick={(idx) => { swapLibero(liberoPlayer, idx); setLiberoSwapOpen(false); }}
        />
      )}
      {menuOpen  && <MenuDrawer        onClose={() => setMenuOpen(false)} />}
      <LiveStatsModal
        open={statsOpen}
        onClose={() => { setStatsOpen(false); setLiveStatsDefaultTab(null); }}
        teamName={teamName}
        opponentName={opponentName}
        recordAlerts={activeAlerts}
        records={records}
        defaultTab={liveStatsDefaultTab}
      />
      {summaryOpen && <ScoringSummaryModal onClose={() => setSummaryOpen(false)} />}
      {timeoutOpen && <TimeoutOverlay onClose={handleTimeoutClose} recordAlerts={activeAlerts} scoreAtLastTimeout={scoreAtTimeoutClose} />}

      {confettiNav && (
        <Confetti
          matchWin={confettiNav.matchWin}
          teamName={teamName}
          onDone={() => { const p = confettiNav.path; setConfettiNav(null); navigate(p); }}
        />
      )}

      {setSummaryData && (
        <SetSummaryModal
          winner={setSummaryData.winner}
          teamName={teamName}
          opponentName={opponentName}
          onContinue={async () => {
            const { winner } = setSummaryData;
            setSetSummaryData(null);
            if (pendingAlerts.length > 0) {
              markPendingShown();
              setLiveStatsDefaultTab('RECORDS');
              setStatsOpen(true);
            }
            await endSet(winner);
            if (winner === SIDE.US) {
              setConfettiNav({ path: `/matches/${matchIdParam}/set-lineup`, matchWin: false });
            } else {
              navigate(`/matches/${matchIdParam}/set-lineup`);
            }
          }}
        />
      )}

      {pendingSetWin && (() => {
        const setsNeeded  = format === FORMAT.BEST_OF_3 ? 2 : 3;
        const newSetsUs   = ourSetsWon + (pendingSetWin === SIDE.US   ? 1 : 0);
        const newSetsThem = oppSetsWon + (pendingSetWin === SIDE.THEM ? 1 : 0);
        const isMatchOver = newSetsUs >= setsNeeded || newSetsThem >= setsNeeded;
        return (
          <ConfirmDialog
            title={isMatchOver ? 'End Match?' : 'End Set?'}
            message={`Final score: ${ourScore} – ${oppScore}. ${isMatchOver ? 'End the match with this score?' : 'End the set with this score?'}`}
            confirmLabel={isMatchOver ? 'End Match' : 'End Set'}
            cancelLabel="Keep Playing"
            onConfirm={async () => {
              if (isMatchOver) {
                await endMatch(pendingSetWin);
                clearPendingSetWin();
                if (pendingAlerts.length > 0) {
                  markPendingShown();
                  setLiveStatsDefaultTab('RECORDS');
                  setStatsOpen(true);
                }
                if (pendingSetWin === SIDE.US) {
                  setConfettiNav({ path: `/matches/${matchIdParam}/summary`, matchWin: true });
                } else {
                  navigate(`/matches/${matchIdParam}/summary`);
                }
              } else {
                // Show set summary before transitioning to next set
                const winner = pendingSetWin;
                clearPendingSetWin();
                setSetSummaryData({ winner });
              }
            }}
            onCancel={clearPendingSetWin}
          />
        );
      })()}
    </div>
  );
}
