import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { db } from '../db/schema';
import { useMatchStore } from '../store/matchStore';
import { useUiStore } from '../store/uiStore';
import { useShallow } from 'zustand/react/shallow';
import { computePlayerStats, computeTeamStats } from '../stats/engine';
import { SET_STATUS, FORMAT, SIDE } from '../constants';
import { useMatchStats } from '../hooks/useMatchStats';
import { useRecordAlerts } from '../hooks/useRecordAlerts';
import { useWakeLock } from '../hooks/useWakeLock';
import { haptic } from '../utils/haptic';
import { STORAGE_KEYS, getBoolStorage, setBoolStorage, getStorageItem } from '../utils/storage';
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
import { ServeZoneModal } from '../components/match/ServeZoneModal';

export function LiveMatchPage() {
  const { matchId: matchIdParam } = useParams();
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();
  const isRevising     = searchParams.get('revise') === '1';
  const revisingSetId  = searchParams.get('setId') ? parseInt(searchParams.get('setId'), 10) : null;
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
  const [rotErrOpen,       setRotErrOpen]       = useState(false);

  const [liberoPlayer,        setLiberoPlayer]        = useState(null);
  const [confettiNav,         setConfettiNav]         = useState(null); // { path, matchWin } | null
  const [setSummaryData,      setSetSummaryData]      = useState(null); // { winner } | null
  const [teamName,            setTeamName]            = useState('');
  const [opponentName,        setOpponentName]        = useState('');
  const [liveStatsDefaultTab, setLiveStatsDefaultTab] = useState(null);
  const [aceZoneHints,        setAceZoneHints]        = useState({}); // { [playerId]: { [zone]: count } }
  const [flipLayout,          setFlipLayout]          = useState(() => getBoolStorage(STORAGE_KEYS.FLIP_LAYOUT));

  const handleToggleFlip = useCallback(() => {
    setFlipLayout((prev) => {
      const next = !prev;
      setBoolStorage(STORAGE_KEYS.FLIP_LAYOUT, next);
      return next;
    });
  }, []);

  const {
    recordHomeRotError,
    setMatch, setLineup, setPlayerNicknames, setLibero, swapLibero,
    endSet, endMatch, finishRevisedSet, clearPendingSetWin,
    confirmServeZone, dismissServeZoneModal, loadServeReticles, loadSetFormationData,
    pendingSetWin, ourScore, oppScore, ourSetsWon, oppSetsWon, format,
    pendingServeContact, serveReticles,
    teamId, lineup, setNumber, pointHistory, currentRun,
  } = useMatchStore(useShallow((s) => ({
    recordHomeRotError:   s.recordHomeRotError,
    setMatch:             s.setMatch,
    setLineup:            s.setLineup,
    setPlayerNicknames:   s.setPlayerNicknames,
    setLibero:            s.setLibero,
    swapLibero:           s.swapLibero,
    endSet:               s.endSet,
    endMatch:             s.endMatch,
    finishRevisedSet:     s.finishRevisedSet,
    clearPendingSetWin:   s.clearPendingSetWin,
    confirmServeZone:     s.confirmServeZone,
    dismissServeZoneModal: s.dismissServeZoneModal,
    loadServeReticles:    s.loadServeReticles,
    loadSetFormationData: s.loadSetFormationData,
    pendingSetWin:        s.pendingSetWin,
    ourScore:             s.ourScore,
    oppScore:             s.oppScore,
    ourSetsWon:           s.ourSetsWon,
    oppSetsWon:           s.oppSetsWon,
    format:               s.format,
    pendingServeContact:  s.pendingServeContact,
    serveReticles:        s.serveReticles,
    teamId:               s.teamId,
    lineup:               s.lineup,
    setNumber:            s.setNumber,
    pointHistory:         s.pointHistory,
    currentRun:           s.currentRun,
  })));
  const { playerStats, teamStats } = useMatchStats();
  const showToast = useUiStore((s) => s.showToast);

  const records = useLiveQuery(
    () => teamId ? db.records.where('team_id').equals(teamId).toArray() : [],
    [teamId], []
  );

  // Full-match contacts for accurate cross-set record tracking.
  // Loaded once per set (not a live subscription) to avoid re-rendering on every tap.
  // committedContacts (Zustand) provides real-time current-set data.
  const matchId = parseInt(matchIdParam, 10);
  const { currentSetId, committedContacts } = useMatchStore(useShallow((s) => ({
    currentSetId:      s.currentSetId,
    committedContacts: s.committedContacts,
  })));

  const [priorContacts, setPriorContacts] = useState([]);
  useEffect(() => {
    if (!matchId) return;
    db.contacts.where('match_id').equals(matchId).toArray()
      .then(setPriorContacts)
      .catch(() => setPriorContacts([]));
  }, [matchId, currentSetId]);

  // Merge: prior-set contacts from DB + current-set contacts from Zustand.
  // Deduplication by id handles the brief window after a set transition where
  // the completed set's contacts appear in both arrays.
  const allMatchContacts = useMemo(() => {
    const currentIds = new Set(committedContacts.map((c) => c.id));
    return [...priorContacts.filter((c) => !currentIds.has(c.id)), ...committedContacts];
  }, [priorContacts, committedContacts]);

  const matchPositionMap = useMemo(() =>
    Object.fromEntries(lineup.filter((sl) => sl.playerId).map((sl) => [sl.playerId, sl.positionLabel])),
    [lineup]
  );

  const matchPlayerStats = useMemo(
    () => computePlayerStats(allMatchContacts, setNumber, matchPositionMap),
    [allMatchContacts, setNumber, matchPositionMap]
  );
  const matchTeamStats = useMemo(
    () => computeTeamStats(allMatchContacts, setNumber),
    [allMatchContacts, setNumber]
  );

  const { activeAlerts } = useRecordAlerts(records ?? [], matchPlayerStats, matchTeamStats);

  // Keep screen awake during live match if setting is on
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const wakeLockEnabled = useMemo(() => {
    try { return localStorage.getItem(STORAGE_KEYS.WAKE_LOCK) === '1'; } catch { return false; }
  }, []);
  useWakeLock(wakeLockEnabled);

  // Haptic feedback on score change
  const prevScoreRef = useRef({ our: ourScore, opp: oppScore });
  useEffect(() => {
    const prev = prevScoreRef.current;
    if (ourScore !== prev.our || oppScore !== prev.opp) {
      haptic(28);
      prevScoreRef.current = { our: ourScore, opp: oppScore };
    }
  }, [ourScore, oppScore]);


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
    screen.orientation?.lock?.('landscape').catch((err) => { console.warn('[VBStat] orientation lock:', err?.message ?? err); });
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
      try {
      // Level 1: match + target set in parallel
      const [match, currentSetOrNull] = await Promise.all([
        db.matches.get(matchId),
        isRevising && revisingSetId
          ? db.sets.get(revisingSetId)
          : db.sets.where('match_id').equals(matchId).filter((s) => s.status === SET_STATUS.IN_PROGRESS).first(),
      ]);
      if (!match) return;

      // If no in-progress set, fall back to last set
      let currentSet = currentSetOrNull;
      if (!currentSet && !isRevising) {
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
        const so1Row = lineupRows.find(r => r.serve_order === 1);
        const sz = so1Row?.position ?? 1;
        const initialRotNum = ((1 - sz + 6) % 6) + 1;
        setLineup(lineup, initialRotNum);
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

      // Build nickname map for all players including the libero so the libero
      // respects the same name-display setting as the rest of the court.
      setPlayerNicknames(
        Object.fromEntries(
          [...players, libero].filter(Boolean).map((p) => [p.id, p.nickname ?? ''])
        )
      );

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
      setMatch(matchId, currentSet.id, season?.team_id ?? null, match.format ?? null, match.last_set_score ?? 15);
      loadSetFormationData(currentSet);
      setReady(true);
      await loadServeReticles(currentSet.id);

      // Load ace zone hints from full season data (non-critical, fires after UI is ready)
      if (match.season_id) {
        try {
          const seasonMatches = await db.matches.where('season_id').equals(match.season_id).toArray();
          const seasonMatchIds = seasonMatches.map((m) => m.id);
          if (seasonMatchIds.length) {
            const aces = await db.contacts
              .where('match_id').anyOf(seasonMatchIds)
              .filter((c) => c.action === 'serve' && c.result === 'ace' && c.zone != null)
              .toArray();
            const hints = {};
            for (const c of aces) {
              if (!hints[c.player_id]) hints[c.player_id] = {};
              hints[c.player_id][c.zone] = (hints[c.player_id][c.zone] ?? 0) + 1;
            }
            setAceZoneHints(hints);
          }
        } catch (e) {
          // hints are non-critical — silent fail
        }
      }
      } catch (err) {
        console.error('LiveMatchPage init failed:', err);
      }
    }

    init();
  }, [matchIdParam, isRevising, revisingSetId]);

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
            <p className="text-slate-600 text-xs mt-3">Tip: lock rotation in Control Center to keep landscape locked</p>
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
          flipLayout={flipLayout}
        />
        <div className="flex flex-row flex-1 min-h-0">
          <CourtGrid aceZoneHints={aceZoneHints} />
          <OppScoringColumn />
        </div>
      </div>

      <ActionBar
        onSubOpen={() => setSubOpen(true)}
        onMenuOpen={() => setMenuOpen(true)}
        onStatsOpen={() => setStatsOpen(true)}
        onSummaryOpen={() => setSummaryOpen(true)}
        onLiberoIn={() => setLiberoSwapOpen(true)}
        onRotErrOpen={() => setRotErrOpen(true)}
        liberoPlayer={liberoPlayer}
        alertCount={activeAlerts.length}
      />

      {rotErrOpen && (
        <ConfirmDialog
          title="Rotation Violation / Overlapping?"
          message="Award 1 point to the opposing team for a home team rotation error."
          confirmLabel="Confirm ROT Error"
          onConfirm={() => { recordHomeRotError(); setRotErrOpen(false); }}
          onCancel={() => setRotErrOpen(false)}
        />
      )}

      {subOpen          && <SubstitutionModal onClose={() => setSubOpen(false)} />}
      {liberoPickerOpen && <LiberoPickerModal onClose={() => setLiberoPickerOpen(false)} onPick={handleLiberoPick} />}
      {liberoSwapOpen && liberoPlayer && (
        <LiberoSwapModal
          liberoPlayer={liberoPlayer}
          onClose={() => setLiberoSwapOpen(false)}
          onPick={(idx) => { swapLibero(liberoPlayer, idx); setLiberoSwapOpen(false); }}
        />
      )}
      {menuOpen  && <MenuDrawer onClose={() => setMenuOpen(false)} flipLayout={flipLayout} onFlipLayout={handleToggleFlip} teamName={teamName} opponentName={opponentName} />}
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
          winMessage={getStorageItem(STORAGE_KEYS.WIN_MESSAGE, '')}
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
            await endSet(winner);
            if (winner === SIDE.US) {
              setConfettiNav({ path: `/matches/${matchIdParam}/set-lineup`, matchWin: false });
            } else {
              navigate(`/matches/${matchIdParam}/set-lineup`);
            }
          }}
        />
      )}

      {pendingServeContact && (() => {
        const pid = pendingServeContact.player_id;
        const hasMatchServes = committedContacts.some(
          (c) => c.player_id === pid && c.action === 'serve' && !c.opponent_contact
        );
        let serverAceZones;
        if (hasMatchServes) {
          serverAceZones = {};
          for (const c of committedContacts) {
            if (c.player_id === pid && c.action === 'serve' && c.result === 'ace' && c.zone != null && !c.opponent_contact) {
              serverAceZones[c.zone] = (serverAceZones[c.zone] ?? 0) + 1;
            }
          }
        } else {
          serverAceZones = aceZoneHints[pid] ?? {};
        }
        return (
          <ServeZoneModal
            pendingContact={pendingServeContact}
            reticles={serveReticles}
            onConfirm={confirmServeZone}
            onDismiss={dismissServeZoneModal}
            serverAceZones={serverAceZones}
          />
        );
      })()}

      {pendingSetWin && (() => {
        const setsNeeded  = format === FORMAT.BEST_OF_3 ? 2 : 3;
        const newSetsUs   = ourSetsWon + (pendingSetWin === SIDE.US   ? 1 : 0);
        const newSetsThem = oppSetsWon + (pendingSetWin === SIDE.THEM ? 1 : 0);
        const isMatchOver = isRevising || newSetsUs >= setsNeeded || newSetsThem >= setsNeeded;
        return (
          <ConfirmDialog
            title={isRevising ? 'Finish Revised Set?' : (isMatchOver ? 'End Match?' : 'End Set?')}
            message={`Final score: ${ourScore} – ${oppScore}. ${isRevising ? 'Save this set and return to the match summary?' : (isMatchOver ? 'End the match with this score?' : 'End the set with this score?')}`}
            confirmLabel={isRevising ? 'Save Set' : (isMatchOver ? 'End Match' : 'End Set')}
            cancelLabel="Keep Playing"
            onConfirm={async () => {
              if (isRevising) {
                await finishRevisedSet(pendingSetWin);
                clearPendingSetWin();
                navigate(`/matches/${matchIdParam}/summary`);
              } else if (isMatchOver) {
                await endMatch(pendingSetWin);
                clearPendingSetWin();
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
