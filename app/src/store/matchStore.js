import { create } from 'zustand';
import { ACTION, RESULT, SIDE, FORMAT, SET_STATUS, MATCH_STATUS, NFHS } from '../constants';
import { db } from '../db/schema';
import { useUiStore } from './uiStore';
import { getIntStorage, STORAGE_KEYS } from '../utils/storage';


const emptyLineup = () =>
  Array.from({ length: 6 }, (_, i) => ({
    position:   i + 1,
    serveOrder: i + 1,
    playerId:   null,
    playerName: '',
    jersey:     '',
  }));

// Pure rotation helpers — used by rotateForward, rotateBackward, addPoint, undoLast
// serveOrder travels with the player so it stays fixed to them through rotations.
const rotateFwd = (lineup) => lineup.map((_, i) => ({
  position:      i + 1,
  serveOrder:    lineup[(i + 1) % 6].serveOrder,
  playerId:      lineup[(i + 1) % 6].playerId,
  playerName:    lineup[(i + 1) % 6].playerName,
  jersey:        lineup[(i + 1) % 6].jersey,
  positionLabel: lineup[(i + 1) % 6].positionLabel,
}));

const rotateBwd = (lineup) => lineup.map((_, i) => ({
  position:      i + 1,
  serveOrder:    lineup[(i + 5) % 6].serveOrder,
  playerId:      lineup[(i + 5) % 6].playerId,
  playerName:    lineup[(i + 5) % 6].playerName,
  jersey:        lineup[(i + 5) % 6].jersey,
  positionLabel: lineup[(i + 5) % 6].positionLabel,
}));

// Pure helper — handles libero auto-swap-in/out on rotation.
// Called only when rotate===true and liberoId is set.
// Returns updated lineup and libero tracking fields.
function autoSwapLibero(s, newLineup) {
  let lineup = newLineup;
  let { liberoOnCourt, liberoReplacedPlayerId, liberoReplacedName,
        liberoReplacedJersey, liberoReplacedPositionLabel } = s;

  if (liberoOnCourt) {
    const liberoIdx = lineup.findIndex((sl) => sl.playerId === s.liberoId);
    if (liberoIdx !== -1) {
      const liberoPos = lineup[liberoIdx].position;
      if (liberoPos >= 2 && liberoPos <= 4) {
        lineup = lineup.map((sl, i) =>
          i === liberoIdx
            ? { ...sl, playerId: liberoReplacedPlayerId, playerName: liberoReplacedName, jersey: liberoReplacedJersey, positionLabel: liberoReplacedPositionLabel }
            : sl
        );
        liberoOnCourt = false;
      }
    }
  } else if (liberoReplacedPlayerId && s.liberoName) {
    const mbIdx = lineup.findIndex((sl) => sl.playerId === liberoReplacedPlayerId);
    if (mbIdx !== -1) {
      const mbPos = lineup[mbIdx].position;
      if (mbPos === 1 || mbPos === 5 || mbPos === 6) {
        lineup = lineup.map((sl, i) =>
          i === mbIdx
            ? { ...sl, playerId: s.liberoId, playerName: s.liberoName, jersey: s.liberoJersey, positionLabel: 'L' }
            : sl
        );
        liberoOnCourt = true;
      }
    }
  }

  return { lineup, liberoOnCourt, liberoReplacedPlayerId, liberoReplacedName, liberoReplacedJersey, liberoReplacedPositionLabel };
}

// Common per-set reset fields shared between resetCurrentSet() and endSet().
// Returns a fresh object each call so callers get their own {} and [] references.
// Replace one element in an array by id without cloning every element.
// Returns a new array with only the matching item replaced.
function replaceOneContact(arr, id, patch) {
  const idx = arr.findIndex((c) => c.id === id);
  if (idx === -1) return arr;
  return [...arr.slice(0, idx), { ...arr[idx], ...patch }, ...arr.slice(idx + 1)];
}

const makeSetResetState = () => ({
  ourScore:                    0,
  oppScore:                    0,
  ourTimeouts:                 0,
  oppTimeouts:                 0,
  subsUsed:                    0,
  subPairs:                    {},
  exhaustedPlayerIds:          [],
  rallyCount:                  0,
  rotationNum:                 1,
  committedContacts:           [],
  committedRallies:            [],
  actionHistory:               [],
  lastSetContactId:            null,
  pendingHblk:                 null,
  lastFeedItem:                null,
  rallyPhase:                  'pre_serve',
  currentRun:                  { side: null, count: 0 },
  pointHistory:                [],
  liberoReplacedPositionLabel: '',
  pendingServeContact:         null,
  serveReticles:               [],
  serveReceiveFormations:      null,
  plannedSubs:                 [],
});

function checkSetWin(ourScore, oppScore, setNumber, format, lastSetScore) {
  const decidingSet = format === FORMAT.BEST_OF_3 ? 3 : 5;
  const target = setNumber === decidingSet ? (lastSetScore ?? 15) : NFHS.SET_WIN_SCORE;
  if (ourScore >= target && ourScore - oppScore >= NFHS.WIN_BY) return SIDE.US;
  if (oppScore >= target && oppScore - ourScore >= NFHS.WIN_BY) return SIDE.THEM;
  return null;
}

const OPP_REASON = {
  K:   { action: ACTION.ATTACK, result: RESULT.KILL,                pointSide: SIDE.THEM, feedLabel: 'Opp Kill'        },
  BLK: { action: ACTION.BLOCK,  result: RESULT.SOLO,                pointSide: SIDE.THEM, feedLabel: 'Opp Block'       },
  SE:  { action: ACTION.SERVE,  result: RESULT.ERROR,               pointSide: SIDE.US,   feedLabel: '+1 Opp Srv Err'  },
  AE:  { action: ACTION.ATTACK, result: RESULT.ERROR,               pointSide: SIDE.US,   feedLabel: '+1 Opp Atk Err'  },
  BHE: { action: ACTION.ERROR,  result: RESULT.BALL_HANDLING_ERROR, pointSide: SIDE.US,   feedLabel: '+1 Opp BHE'      },
  NET: { action: ACTION.ERROR,  result: RESULT.NET_TOUCH,           pointSide: SIDE.US,   feedLabel: '+1 Opp Net'      },
  ROT: { action: ACTION.ERROR,  result: RESULT.ROTATION_ERROR,      pointSide: SIDE.US,   feedLabel: '+1 Opp ROT'      },
};

function getStatLabel(action, result, lastName) {
  switch (action) {
    case 'attack':
      if (result === 'kill')    return `+1 ${lastName} Kill`;
      if (result === 'error')   return `${lastName} Atk Err`;
      if (result === 'blocked') return `${lastName} Blocked`;
      return `${lastName} Attack`;
    case 'serve':
      if (result === 'ace')   return `+1 ${lastName} Ace`;
      if (result === 'error') return `${lastName} Serve Err`;
      return `${lastName} Serve`;
    case 'dig':    return `${lastName} Dig`;
    case 'block':
      if (result === 'solo')   return `+1 ${lastName} Solo Blk`;
      if (result === 'assist') return `+1 ${lastName} Blk Ast`;
      return `${lastName} Block`;
    case 'pass':   return `${lastName} Pass ${result}`;
    case 'set':    return `${lastName} Set`;
    case 'error':
      if (result === 'lift')   return `${lastName} Lift`;
      if (result === 'double') return `${lastName} Dbl`;
      if (result === 'net')    return `${lastName} Net`;
      return `${lastName} Error`;
    default:       return `${lastName} ${action}`;
  }
}

function setFeed(setFn, label) {
  const id = Date.now();
  setFn({ lastFeedItem: { label, id } });
}

const pushAction = (get, set, entry) => {
  const prev = get().actionHistory;
  set({ actionHistory: [entry, ...prev] });
};

const INITIAL_STATE = {
  matchId:               null,
  teamId:                null,
  currentSetId:          null,
  setNumber:             1,

  ourScore:              0,
  oppScore:              0,
  ourSetsWon:            0,
  oppSetsWon:            0,

  serveSide:             SIDE.US,
  lineup:                emptyLineup(),
  ourTimeouts:           0,
  oppTimeouts:           0,
  subsUsed:              0,
  maxSubsPerSet:         NFHS.MAX_SUBS_PER_SET,
  subPairs:              {}, // { [playerId]: slotIdx } — permanent per-set pairing
  exhaustedPlayerIds:    [], // players who have completed their one allowed return sub

  teamJerseyColor:       'black',
  liberoJerseyColor:     'black',

  liberoId:              null,
  liberoName:            '',
  liberoJersey:          '',
  liberoOnCourt:         false,
  liberoReplacedPlayerId:      null,
  liberoReplacedName:          '',
  liberoReplacedJersey:        '',
  liberoReplacedPositionLabel: '',

  committedContacts:     [],   // in-memory mirror of Dexie contacts for live stats
  committedRallies:      [],   // in-memory mirror of Dexie rallies for current set
  rallyCount:            0,
  rotationNum:           1,

  actionHistory:         [],   // array of up to 10 action descriptors, newest first
  lastSetContactId:      null, // id of the most recent SET contact this set (O(1) assist lookup)
  pendingHblk:           null, // { playerId } | null — waiting for block assist partner
  lastFeedItem:          null, // { label: string, id: number }
  rallyPhase:            'pre_serve', // 'pre_serve' | 'in_rally'
  currentRun:            { side: null, count: 0 }, // current consecutive-point streak
  pointHistory:          [], // { side: 'us'|'them' }[] — one entry per point this set
  pendingSetWin:         null, // 'us' | 'them' | null — set win detected, awaiting confirmation
  format:                null, // 'best_of_3' | 'best_of_5'
  lastSetScore:          15,   // win score for the deciding set (15 or 25)
  playerNicknames:       {},   // { [playerId]: nickname string } — populated at lineup load
  pendingServeContact:   null, // { contactId, result } | null — triggers serve zone modal
  serveReticles:         [],   // [{ contactId, result, court_x, court_y, zone }]

  serveReceiveFormations: null, // { [rotationNum]: number[6] } | null — soIdx per grid cell
  plannedSubs:            [],   // [{ rotation, player_out_so, player_in_id }]
  _undoInFlight:          false, // guard against concurrent undo taps
};

export const useMatchStore = create((set, get) => ({
  ...INITIAL_STATE,

  setMatch:   (matchId, setId, teamId, format, lastSetScore) => {
    const saved = getIntStorage(STORAGE_KEYS.MAX_SUBS);
    const maxSubsPerSet = !isNaN(saved) && saved > 0 ? saved : NFHS.MAX_SUBS_PER_SET;
    set({ matchId, currentSetId: setId, teamId, format, lastSetScore: lastSetScore ?? 15, maxSubsPerSet });
  },
  resetMatch: () => set(INITIAL_STATE),
  setLineup:          (lineup) => set({ lineup }),
  setPlayerNicknames: (map)    => set({ playerNicknames: map }),
  setLibero:  (liberoId) => set({ liberoId }),

  rotateForward:  () => set((s) => ({ lineup: rotateFwd(s.lineup) })),
  rotateBackward: () => set((s) => ({ lineup: rotateBwd(s.lineup) })),

  adjustScore: (side, delta) =>
    set((s) => {
      const key = side === SIDE.US ? 'ourScore' : 'oppScore';
      return { [key]: Math.max(0, s[key] + delta) };
    }),

  addPoint: async (side) => {
    const s = get();
    let { ourScore, oppScore, serveSide, lineup, setNumber, rallyCount, rotationNum } = s;
    let rotate       = false;
    let newServeSide = serveSide;

    if (side === SIDE.US) {
      ourScore += 1;
      if (serveSide === SIDE.THEM) { newServeSide = SIDE.US; rotate = true; }
    } else {
      oppScore += 1;
      if (serveSide === SIDE.US) { newServeSide = SIDE.THEM; }
    }

    // ── Commit score immediately ───────────────────────────────────────────
    // This MUST be the first set() call. Everything below can theoretically
    // throw (rotation math, libero swap, DB write) — the score must survive
    // any of those failures. Two set() calls = two renders, but that is
    // infinitely better than the score not updating at all.
    set({ ourScore, oppScore });

    // ── Rotation / libero / run calculations ──────────────────────────────
    const prevRun  = s.currentRun ?? { side: null, count: 0 };
    const newRun   = prevRun.side === side
      ? { side, count: Math.min(25, prevRun.count + 1) }
      : { side, count: 1 };

    const newRotationNum = rotate ? (rotationNum % 6) + 1 : rotationNum;
    let newLineup = rotate ? rotateFwd(lineup) : lineup;

    // Auto libero swap — only on rotations where we have a designated libero
    const liberoState = (rotate && s.liberoId)
      ? autoSwapLibero(s, newLineup)
      : {
          lineup:                      newLineup,
          liberoOnCourt:               s.liberoOnCourt,
          liberoReplacedPlayerId:      s.liberoReplacedPlayerId,
          liberoReplacedName:          s.liberoReplacedName,
          liberoReplacedJersey:        s.liberoReplacedJersey,
          liberoReplacedPositionLabel: s.liberoReplacedPositionLabel,
        };
    const { lineup: finalLineup, liberoOnCourt, liberoReplacedPlayerId,
            liberoReplacedName, liberoReplacedJersey, liberoReplacedPositionLabel } = liberoState;

    // ── Action history entry (for undo) ───────────────────────────────────
    const actionKey = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    if (side === SIDE.US) {
      pushAction(get, set, {
        type:                        'point_us',
        rallyId:                     null,
        _actionKey:                  actionKey,
        prevServeSide:               serveSide,
        prevRallyPhase:              s.rallyPhase,
        prevLineup:                  lineup,
        prevRotation:                rotationNum,
        prevRun,
        prevLiberoOnCourt:               s.liberoOnCourt,
        prevLiberoReplacedPlayerId:      s.liberoReplacedPlayerId,
        prevLiberoReplacedName:          s.liberoReplacedName,
        prevLiberoReplacedJersey:        s.liberoReplacedJersey,
        prevLiberoReplacedPositionLabel: s.liberoReplacedPositionLabel,
      });
    } else {
      pushAction(get, set, {
        type:           'point_them',
        rallyId:        null,
        _actionKey:     actionKey,
        prevServeSide:  serveSide,
        prevRallyPhase: s.rallyPhase,
        prevRun,
      });
    }

    // ── Full state update (rotation, libero, rally metadata) ──────────────
    set({
      rallyPhase:    'pre_serve',
      serveSide:     newServeSide,
      lineup:        finalLineup,
      rallyCount:    rallyCount + 1,
      rotationNum:   newRotationNum,
      currentRun:    newRun,
      pointHistory:  [...s.pointHistory, { side }],
      liberoOnCourt,
      liberoReplacedPlayerId,
      liberoReplacedName,
      liberoReplacedJersey,
      liberoReplacedPositionLabel,
      committedRallies: [...s.committedRallies, {
        set_id:       s.currentSetId,
        rally_number: rallyCount,
        serve_side:   serveSide,
        point_winner: side,
        our_rotation: rotationNum,
      }],
    });

    const winner = checkSetWin(ourScore, oppScore, setNumber, s.format, s.lastSetScore);
    if (winner) set({ pendingSetWin: winner });

    // 3. Persist rally to DB — best effort. The score is already committed to
    //   Zustand state above and must NOT be rolled back on failure: a dropped
    //   rally row only breaks undo for that point, while a score rollback would
    //   corrupt the live scoreboard in a way the user can't recover from.
    try {
      const rallyId = await db.rallies.add({
        set_id:       s.currentSetId,
        rally_number: rallyCount,
        serve_side:   serveSide,
        point_winner: side,
        our_rotation: rotationNum,
        timestamp:    Date.now(),
      });

      // Backfill real rallyId so undo can delete the correct row
      set((cur) => ({
        actionHistory: cur.actionHistory.map((a) =>
          a._actionKey === actionKey ? { ...a, rallyId } : a
        ),
      }));
    } catch (err) {
      // Rally write failed — score stays as-is. Undo for this point won't work
      // but the live score is correct, which is what matters during a match.
      console.error('[VBStat] rallies.add failed (score kept):', err);
    }
  },

  clearPendingSetWin: () => set({ pendingSetWin: null }),

  // Manually adjust home (us) or away (them) score by +1 or -1.
  // Used to correct scoring errors. Clamps at 0, checks set-win, fully undoable.
  fudgeScore: (side, delta) => {
    const s = get();
    if (side === SIDE.US) {
      const next = Math.max(0, s.ourScore + delta);
      if (next === s.ourScore) return;
      set((cur) => ({
        ourScore:      next,
        actionHistory: [{ type: 'fudge', side, delta }, ...cur.actionHistory],
        lastFeedItem:  { label: `Score adj: ${delta > 0 ? '+' : ''}${delta} (Us)`, id: Date.now() },
      }));
      const winner = checkSetWin(next, s.oppScore, s.setNumber, s.format, s.lastSetScore);
      if (winner) set({ pendingSetWin: winner });
    } else {
      const next = Math.max(0, s.oppScore + delta);
      if (next === s.oppScore) return;
      set((cur) => ({
        oppScore:      next,
        actionHistory: [{ type: 'fudge', side, delta }, ...cur.actionHistory],
        lastFeedItem:  { label: `Score adj: ${delta > 0 ? '+' : ''}${delta} (Opp)`, id: Date.now() },
      }));
      const winner = checkSetWin(s.ourScore, next, s.setNumber, s.format, s.lastSetScore);
      if (winner) set({ pendingSetWin: winner });
    }
  },

  undoLast: async () => {
    // Guard against concurrent taps: two async undo calls racing on the same
    // actionHistory[0] would double-delete the same DB row and corrupt state.
    if (get()._undoInFlight) return;
    set({ _undoInFlight: true });

    const s = get();
    if (!s.actionHistory.length) { set({ _undoInFlight: false }); return; }
    const [action, ...rest] = s.actionHistory;

    try {

    switch (action.type) {

      case 'contact': {
        await db.contacts.delete(action.contactId);
        if (action.autoSetId) {
          await db.contacts.delete(action.autoSetId);
        } else if (action.assistId) {
          await db.contacts.update(action.assistId, { result: action.prevAssistResult ?? RESULT.ATTEMPT });
        }
        set({
          actionHistory:     rest,
          committedContacts: s.committedContacts
            .filter(c => c.id !== action.contactId && c.id !== action.autoSetId)
            .map(c => !action.autoSetId && c.id === action.assistId ? { ...c, result: action.prevAssistResult ?? RESULT.ATTEMPT } : c),
          lastFeedItem: null,
          // Restore rallyPhase to what it was before this contact was recorded
          rallyPhase: action.prevRallyPhase ?? 'pre_serve',
          // Clear lastSetContactId if the undone contact was the tracked setter contact
          ...(s.lastSetContactId === action.contactId ? { lastSetContactId: null } : {}),
          serveReticles: s.serveReticles.filter(r => r.contactId !== action.contactId),
          pendingServeContact: s.pendingServeContact?.contactId === action.contactId
            ? null : s.pendingServeContact,
        });
        break;
      }

      // Blocked attack: AE contact for home player + opp BLK contact bundled together.
      // Identical to 'contact' undo but also deletes the opponent block contact.
      case 'blocked_attack': {
        await db.contacts.delete(action.contactId);
        if (action.blkContactId) await db.contacts.delete(action.blkContactId);
        if (action.autoSetId) {
          await db.contacts.delete(action.autoSetId);
        } else if (action.assistId) {
          await db.contacts.update(action.assistId, { result: action.prevAssistResult ?? RESULT.ATTEMPT });
        }
        set({
          actionHistory:     rest,
          committedContacts: s.committedContacts
            .filter(c => c.id !== action.contactId && c.id !== action.blkContactId && c.id !== action.autoSetId)
            .map(c => !action.autoSetId && c.id === action.assistId ? { ...c, result: action.prevAssistResult ?? RESULT.ATTEMPT } : c),
          lastFeedItem: null,
          rallyPhase: action.prevRallyPhase ?? 'pre_serve',
        });
        break;
      }

      case 'hblk_contact': {
        await db.contacts.delete(action.contactId1);
        await db.contacts.delete(action.contactId2);
        set({
          actionHistory:     rest,
          committedContacts: s.committedContacts
            .filter(c => c.id !== action.contactId1 && c.id !== action.contactId2),
          lastFeedItem: null,
        });
        break;
      }

      case 'opp_contact': {
        await db.contacts.delete(action.contactId);
        set({
          actionHistory:     rest,
          committedContacts: s.committedContacts.filter(c => c.id !== action.contactId),
          lastFeedItem:      null,
        });
        break;
      }

      case 'point_us': {
        if (action.rallyId) await db.rallies.delete(action.rallyId);
        set({
          actionHistory:    rest,
          ourScore:         Math.max(0, s.ourScore - 1),
          serveSide:        action.prevServeSide,
          rallyPhase:       action.prevRallyPhase ?? 'pre_serve',
          lineup:           action.prevLineup,
          rotationNum:      action.prevRotation,
          rallyCount:       Math.max(0, s.rallyCount - 1),
          pendingHblk:      null,
          lastFeedItem:     null,
          pendingSetWin:    null, // clear any set-win triggered by the undone point
          currentRun:       action.prevRun ?? { side: null, count: 0 },
          pointHistory:     s.pointHistory.slice(0, -1),
          committedRallies: s.committedRallies.slice(0, -1),
          ...(action.prevLiberoOnCourt !== undefined && {
            liberoOnCourt:               action.prevLiberoOnCourt,
            liberoReplacedPlayerId:      action.prevLiberoReplacedPlayerId ?? null,
            liberoReplacedName:          action.prevLiberoReplacedName ?? '',
            liberoReplacedJersey:        action.prevLiberoReplacedJersey ?? '',
            liberoReplacedPositionLabel: action.prevLiberoReplacedPositionLabel ?? '',
          }),
        });
        break;
      }

      case 'point_them': {
        if (action.rallyId) await db.rallies.delete(action.rallyId);
        set({
          actionHistory:    rest,
          oppScore:         Math.max(0, s.oppScore - 1),
          serveSide:        action.prevServeSide,
          rallyPhase:       action.prevRallyPhase ?? 'pre_serve',
          rallyCount:       Math.max(0, s.rallyCount - 1),
          pendingHblk:      null,
          lastFeedItem:     null,
          pendingSetWin:    null, // clear any set-win triggered by the undone point
          currentRun:       action.prevRun ?? { side: null, count: 0 },
          pointHistory:     s.pointHistory.slice(0, -1),
          committedRallies: s.committedRallies.slice(0, -1),
        });
        break;
      }

      case 'timeout': {
        if (action.side === SIDE.US)
          set({ actionHistory: rest, ourTimeouts: Math.max(0, s.ourTimeouts - 1) });
        else
          set({ actionHistory: rest, oppTimeouts: Math.max(0, s.oppTimeouts - 1) });
        if (action.timeoutId != null) {
          db.timeouts.delete(action.timeoutId).catch(() => {});
        }
        break;
      }

      case 'sub': {
        await db.substitutions.delete(action.subId);
        const newLineup = s.lineup.map((sl, i) =>
          i === action.slotIdx
            ? { ...sl, playerId: action.prevPlayerId, playerName: action.prevName, jersey: action.prevJersey, positionLabel: action.prevPositionLabel }
            : sl
        );
        set({
          actionHistory:       rest,
          lineup:              newLineup,
          subsUsed:            action.prevSubsUsed,
          subPairs:            action.prevSubPairs            ?? s.subPairs,
          exhaustedPlayerIds:  action.prevExhaustedPlayerIds ?? s.exhaustedPlayerIds,
          ...(action.prevLiberoOnCourt !== undefined && { liberoOnCourt: action.prevLiberoOnCourt }),
        });
        break;
      }

      case 'libero_swap': {
        await db.substitutions.delete(action.subId);
        set({
          actionHistory:               rest,
          liberoOnCourt:               action.prevLiberoOnCourt,
          lineup:                      action.prevLineup,
          liberoReplacedPlayerId:      action.prevReplacedId,
          liberoReplacedName:          action.prevReplacedName,
          liberoReplacedJersey:        action.prevReplacedJersey,
          liberoReplacedPositionLabel: action.prevReplacedPositionLabel ?? '',
        });
        break;
      }

      case 'fudge': {
        if (action.side === SIDE.US)
          set({ actionHistory: rest, ourScore: Math.max(0, s.ourScore - action.delta), lastFeedItem: null });
        else
          set({ actionHistory: rest, oppScore: Math.max(0, s.oppScore - action.delta), lastFeedItem: null });
        break;
      }
    }

    } finally {
      set({ _undoInFlight: false });
    }
  },

  recordContact: async (contactData) => {
    const s = get();
    const contactFull = {
      match_id:     s.matchId,
      set_id:       s.currentSetId,
      rotation_num: s.rotationNum,
      rally_number: s.rallyCount,
      serve_side:   s.serveSide,
      timestamp:    Date.now(),
      ...contactData,
    };
    let id;
    try {
      id = await db.contacts.add(contactFull);
    } catch (e) {
      useUiStore.getState().showToast('Failed to record contact. Check storage.', 'error');
      return null;
    }

    let newCommittedContacts = [...s.committedContacts, { ...contactFull, id }];

    let assistId        = null;
    let autoSetId       = null;
    let prevAssistResult = null;

    if (contactData.action === ACTION.ATTACK) {
      // Auto-record SET ATT for the back row setter on every attack
      const backRowSetter = s.lineup.find(
        (sl) => sl.positionLabel === 'S' && [1, 5, 6].includes(sl.position)
      );
      if (backRowSetter && backRowSetter.playerId !== contactData.player_id) {
        const isKill = contactData.result === RESULT.KILL;
        const autoSetContact = {
          match_id:     s.matchId,
          set_id:       s.currentSetId,
          rotation_num: s.rotationNum,
          serve_side:   s.serveSide,
          timestamp:    Date.now() + 1,
          player_id:    backRowSetter.playerId,
          action:       ACTION.SET,
          result:       isKill ? RESULT.ASSIST : RESULT.ATTEMPT,
        };
        autoSetId = await db.contacts.add(autoSetContact);
        newCommittedContacts = [...newCommittedContacts, { ...autoSetContact, id: autoSetId }];
      } else if (contactData.result === RESULT.KILL) {
        // No back row setter — back-assign assist to last manual SET contact (O(1) lookup)
        const lsid = s.lastSetContactId;
        if (lsid != null) {
          const lastSetContact = s.committedContacts.find((c) => c.id === lsid);
          if (lastSetContact) {
            assistId = lastSetContact.id;
            prevAssistResult = lastSetContact.result;
            await db.contacts.update(lastSetContact.id, { result: RESULT.ASSIST });
            newCommittedContacts = replaceOneContact(newCommittedContacts, lastSetContact.id, { result: RESULT.ASSIST });
          }
        }
      }
    }

    const prevHistory = get().actionHistory;
    set({
      actionHistory:     [{ type: 'contact', contactId: id, assistId, prevAssistResult, autoSetId, prevRallyPhase: s.rallyPhase }, ...prevHistory],
      committedContacts: newCommittedContacts,
      // Track last SET contact id so assist back-assignment is O(1) instead of O(n)
      ...(contactData.action === ACTION.SET ? { lastSetContactId: id } : {}),
      // Only transition to in_rally when the ball is live:
      //   - a successful serve (IN) puts the ball in play
      //   - a pass follows a live serve
      // An ACE ends the rally immediately — addPoint already set pre_serve and
      // must not be overwritten here or isServer stays false for the next rally.
      ...((contactData.action === ACTION.PASS ||
           (contactData.action === ACTION.SERVE && contactData.result === RESULT.IN))
        ? { rallyPhase: 'in_rally' } : {}),
    });

    const slot = s.lineup.find((p) => p.playerId === contactData.player_id);
    if (slot) {
      const lastName = slot.playerName?.split(' ').pop() ?? 'Player';
      setFeed(set, getStatLabel(contactData.action, contactData.result, lastName));
    }

    if (
      contactData.action === ACTION.SERVE &&
      (contactData.result === RESULT.IN || contactData.result === RESULT.ACE) &&
      s.serveSide === SIDE.US
    ) {
      set({ pendingServeContact: { contactId: id, result: contactData.result } });
    }

    return id;
  },

  // Records an opponent block (BLK solo) without awarding a point.
  // Called after recordContact() for a blocked AE so both contacts share one undo step.
  // aeContactId: the contactId just returned by recordContact — used to upgrade that
  // actionHistory entry from 'contact' to 'blocked_attack' so undo removes both at once.
  recordOppBlock: async (aeContactId) => {
    const s = get();
    const contactFull = {
      match_id:         s.matchId,
      set_id:           s.currentSetId,
      player_id:        null,
      rally_number:     s.rallyCount,
      action:           ACTION.BLOCK,
      result:           RESULT.SOLO,
      opponent_contact: true,
      timestamp:        Date.now(),
    };
    try {
      const blkId = await db.contacts.add(contactFull);
      set((cur) => ({
        committedContacts: [...cur.committedContacts, { ...contactFull, id: blkId }],
        // Upgrade the matching 'contact' entry so undo removes both contacts together
        actionHistory: cur.actionHistory.map((a) =>
          a.type === 'contact' && a.contactId === aeContactId
            ? { ...a, type: 'blocked_attack', blkContactId: blkId }
            : a
        ),
      }));
      setFeed(set, 'Opp Block');
    } catch (err) {
      console.error('[VBStat] recordOppBlock failed:', err);
    }
  },

  // HBLK requires two players to tap — first tap sets pending, second completes both
  tapHblk: async (playerId) => {
    const s = get();
    const { pendingHblk, matchId, currentSetId } = s;

    if (pendingHblk) {
      if (pendingHblk.playerId === playerId) {
        // Same player tapping again — cancel
        set({ pendingHblk: null });
      } else {
        // Partner confirmed — write both block assist contacts
        const now = Date.now();
        const contact1 = {
          match_id:     matchId, set_id: currentSetId,
          player_id:    pendingHblk.playerId,
          action:       ACTION.BLOCK, result: RESULT.BLOCK_ASSIST,
          rally_number: s.rallyCount,
          rotation_num: s.rotationNum,
          serve_side:   s.serveSide,
          timestamp:    now,
        };
        const contact2 = {
          match_id:     matchId, set_id: currentSetId,
          player_id:    playerId,
          action:       ACTION.BLOCK, result: RESULT.BLOCK_ASSIST,
          rally_number: s.rallyCount,
          rotation_num: s.rotationNum,
          serve_side:   s.serveSide,
          timestamp:    now + 1,
        };
        const id1 = await db.contacts.add(contact1);
        const id2 = await db.contacts.add(contact2);
        const newCommittedContacts = [
          ...s.committedContacts,
          { ...contact1, id: id1 },
          { ...contact2, id: id2 },
        ];
        const prevHistory = get().actionHistory;
        set({
          pendingHblk:   null,
          actionHistory: [{ type: 'hblk_contact', contactId1: id1, contactId2: id2 }, ...prevHistory],
          committedContacts: newCommittedContacts,
        });

        const slot1 = s.lineup.find((p) => p.playerId === pendingHblk.playerId);
        const slot2 = s.lineup.find((p) => p.playerId === playerId);
        const n1 = slot1?.playerName.split(' ').pop() ?? '';
        const n2 = slot2?.playerName.split(' ').pop() ?? '';
        setFeed(set, `+1 ${n1} & ${n2} Blk Ast`);

        await get().addPoint(SIDE.US);
      }
    } else {
      set({ pendingHblk: { playerId } });
    }
  },

  substitutePlayer: async (outPlayerId, inPlayer, positionOverride) => {
    const s = get();
    if (s.subsUsed >= s.maxSubsPerSet) return false;
    if (!inPlayer?.id) return false;

    const slotIdx = s.lineup.findIndex((sl) => sl.playerId === outPlayerId);
    if (slotIdx === -1) return false;

    // Prevent placing a player who is already on the court in another slot
    const alreadyOnCourt = s.lineup.some((sl) => sl.playerId === inPlayer.id);
    if (alreadyOnCourt) return false;

    // Note: exhaustedPlayerIds is tracked for display only — no hard block on re-subs.

    const outPlayer             = s.lineup[slotIdx];
    const prevSubsUsed          = s.subsUsed;
    const prevSubPairs          = s.subPairs;
    const prevExhaustedPlayerIds = s.exhaustedPlayerIds;
    const liberoGoingOut        = outPlayerId === s.liberoId;
    const inPositionLabel       = positionOverride ?? inPlayer.position ?? '';

    // "Return sub" = incoming player is returning to a slot they previously occupied
    const isReturnSub = s.subPairs[inPlayer.id] !== undefined && s.subPairs[inPlayer.id] === slotIdx;
    const newSubPairs = { ...s.subPairs, [outPlayerId]: slotIdx, [inPlayer.id]: slotIdx };
    const newExhausted = isReturnSub
      ? [...s.exhaustedPlayerIds, outPlayerId, inPlayer.id]
      : s.exhaustedPlayerIds;

    const subDbId = await db.substitutions.add({
      set_id:            s.currentSetId,
      rally_number:      0,
      player_out:        outPlayerId,
      player_in:         inPlayer.id,
      position:          slotIdx + 1,
      libero_swap:       false,
      in_position_label: inPositionLabel,
      timestamp:         Date.now(),
    });

    set({
      lineup: s.lineup.map((sl, i) =>
        i === slotIdx
          ? { ...sl, playerId: inPlayer.id, playerName: inPlayer.name, jersey: inPlayer.jersey_number, positionLabel: inPositionLabel }
          : sl
      ),
      subsUsed:           s.subsUsed + 1,
      subPairs:           newSubPairs,
      exhaustedPlayerIds: newExhausted,
      ...(liberoGoingOut && { liberoOnCourt: false }),
    });

    pushAction(get, set, {
      type:                    'sub',
      subId:                   subDbId,
      slotIdx:                 slotIdx,
      prevPlayerId:            outPlayer.playerId,
      prevName:                outPlayer.playerName,
      prevJersey:              outPlayer.jersey,
      prevPositionLabel:       outPlayer.positionLabel,
      prevSubsUsed:            prevSubsUsed,
      prevSubPairs:            prevSubPairs,
      prevExhaustedPlayerIds:  prevExhaustedPlayerIds,
      prevLiberoOnCourt:       s.liberoOnCourt,
    });

    return true;
  },

  swapLibero: async (liberoPlayer, explicitTargetIdx) => {
    const s = get();

    // Snapshot state before the swap for undo
    const prevLiberoOnCourt       = s.liberoOnCourt;
    const prevLineup              = s.lineup;
    const prevReplacedId          = s.liberoReplacedPlayerId;
    const prevReplacedName        = s.liberoReplacedName;
    const prevReplacedJersey      = s.liberoReplacedJersey;
    const prevReplacedPositionLabel = s.liberoReplacedPositionLabel;

    if (s.liberoOnCourt) {
      // Swap libero out — restore the player they replaced
      set({
        lineup: s.lineup.map((sl) =>
          sl.playerId === s.liberoId
            ? { ...sl, playerId: s.liberoReplacedPlayerId, playerName: s.liberoReplacedName, jersey: s.liberoReplacedJersey, positionLabel: s.liberoReplacedPositionLabel }
            : sl
        ),
        liberoOnCourt:               false,
        liberoReplacedPlayerId:      null,
        liberoReplacedName:          '',
        liberoReplacedJersey:        '',
        liberoReplacedPositionLabel: '',
      });
    } else {
      // Swap libero in — use explicitly chosen slot or fall back to back-row MB first, then any back-row player
      const backRow = [4, 5, 0];
      const eligible = (i) => s.lineup[i].playerId && s.lineup[i].playerId !== s.liberoId;
      const targetIdx = explicitTargetIdx !== undefined
        ? explicitTargetIdx
        : backRow.find((i) => eligible(i) && s.lineup[i].positionLabel === 'MB')
          ?? backRow.find((i) => eligible(i));
      if (targetIdx === undefined) return;

      const target = s.lineup[targetIdx];
      set({
        lineup: s.lineup.map((sl, i) =>
          i === targetIdx
            ? { ...sl, playerId: liberoPlayer.id, playerName: liberoPlayer.name, jersey: liberoPlayer.jersey_number, positionLabel: 'L' }
            : sl
        ),
        liberoName:                  liberoPlayer.name,
        liberoJersey:                liberoPlayer.jersey_number,
        liberoOnCourt:               true,
        liberoReplacedPlayerId:      target.playerId,
        liberoReplacedName:          target.playerName,
        liberoReplacedJersey:        target.jersey,
        liberoReplacedPositionLabel: target.positionLabel,
      });
    }

    const subDbId = await db.substitutions.add({
      set_id:       s.currentSetId,
      rally_number: 0,
      libero_swap:  true,
      timestamp:    Date.now(),
    });

    pushAction(get, set, {
      type:                    'libero_swap',
      subId:                   subDbId,
      prevLiberoOnCourt:       prevLiberoOnCourt,
      prevLineup:              prevLineup,
      prevReplacedId:          prevReplacedId,
      prevReplacedName:        prevReplacedName,
      prevReplacedJersey:      prevReplacedJersey,
      prevReplacedPositionLabel,
    });
  },

  recordHomeRotError: async () => {
    const s = get();
    const currentRally = s.rallyCount;
    get().addPoint(SIDE.THEM);
    setFeed(set, 'ROT Violation');
    const contactFull = {
      match_id:         s.matchId,
      set_id:           s.currentSetId,
      player_id:        null,
      rally_number:     currentRally,
      rotation_num:     s.rotationNum,
      serve_side:       s.serveSide,
      action:           'error',
      result:           'rotation_error',
      opponent_contact: false,
      timestamp:        Date.now(),
    };
    try {
      const id = await db.contacts.add(contactFull);
      set((cur) => ({
        committedContacts: [...cur.committedContacts, { ...contactFull, id }],
        actionHistory: [{ type: 'opp_contact', contactId: id }, ...cur.actionHistory],
      }));
    } catch (err) {
      console.error('[VBStat] recordHomeRotError contact write failed:', err);
    }
  },

  addOppPoint: async (reason) => {
    const s = get();
    const { action, result, pointSide, feedLabel } = OPP_REASON[reason];
    const contactFull = {
      match_id:         s.matchId,
      set_id:           s.currentSetId,
      player_id:        null,
      rally_number:     s.rallyCount,
      action,
      result,
      opponent_contact: true,
      timestamp:        Date.now(),
    };
    // Score update is independent of the DB write — call it first so the
    // scoreboard always reflects the tap even if the contact write fails.
    get().addPoint(pointSide);
    setFeed(set, feedLabel);
    try {
      const id = await db.contacts.add(contactFull);
      set((cur) => ({
        committedContacts: [...cur.committedContacts, { ...contactFull, id }],
        actionHistory: [{ type: 'opp_contact', contactId: id }, ...cur.actionHistory],
      }));
    } catch (err) {
      console.error('[VBStat] addOppPoint contact write failed:', err);
    }
  },

  useTimeout: async (side) => {
    const s = get();
    if (side === SIDE.US) {
      if (s.ourTimeouts >= NFHS.MAX_TIMEOUTS_PER_SET) return;
      set({ ourTimeouts: s.ourTimeouts + 1 });
    } else {
      if (s.oppTimeouts >= NFHS.MAX_TIMEOUTS_PER_SET) return;
      set({ oppTimeouts: s.oppTimeouts + 1 });
    }
    let timeoutId = null;
    try {
      timeoutId = await db.timeouts.add({
        match_id:     s.matchId,
        set_id:       s.currentSetId,
        rally_number: s.rallyCount,
        our_score:    s.ourScore,
        opp_score:    s.oppScore,
        side,
      });
    } catch (err) {
      console.error('[VBStat] timeouts.add failed:', err);
    }
    pushAction(get, set, { type: 'timeout', side, timeoutId });
  },

  resetCurrentSet: async () => {
    const s = get();
    await db.contacts.where('set_id').equals(s.currentSetId).delete();
    await db.rallies.where('set_id').equals(s.currentSetId).delete();
    await db.substitutions.where('set_id').equals(s.currentSetId).delete();
    set({
      ...makeSetResetState(),
      serveSide:              SIDE.US,
      pendingSetWin:          null,
      liberoOnCourt:          false,
      liberoReplacedPlayerId: null,
      liberoReplacedName:     '',
      liberoReplacedJersey:   '',
      serveReceiveFormations: null,
      plannedSubs:            [],
    });
  },

  endSet: async (winner) => {
    const s = get();
    await db.sets.update(s.currentSetId, {
      status:    SET_STATUS.COMPLETE,
      our_score: s.ourScore,
      opp_score: s.oppScore,
      winner,
    });

    const newSetsUs   = s.ourSetsWon + (winner === SIDE.US   ? 1 : 0);
    const newSetsThem = s.oppSetsWon + (winner === SIDE.THEM ? 1 : 0);
    const nextSetNum  = s.setNumber + 1;

    const newSetId = await db.sets.add({
      match_id:   s.matchId,
      set_number: nextSetNum,
      status:     SET_STATUS.IN_PROGRESS,
      our_score:  0,
      opp_score:  0,
    });

    set({
      ...makeSetResetState(),
      currentSetId:  newSetId,
      setNumber:     nextSetNum,
      ourSetsWon:    newSetsUs,
      oppSetsWon:    newSetsThem,
      pendingSetWin: null,
    });
  },

  confirmServeZone: async (contactId, court_x, court_y, zone) => {
    await db.contacts.update(contactId, { court_x, court_y, zone });
    set(s => {
      const contact = s.committedContacts.find(c => c.id === contactId);
      return {
        pendingServeContact: null,
        serveReticles: [...s.serveReticles, { contactId, result: contact?.result, court_x, court_y, zone }],
        committedContacts: replaceOneContact(s.committedContacts, contactId, { court_x, court_y, zone }),
      };
    });
  },

  dismissServeZoneModal: () => set({ pendingServeContact: null }),

  loadSetFormationData: (setRecord) => {
    set({
      serveReceiveFormations: setRecord?.serve_receive_formations ?? null,
      plannedSubs:            setRecord?.planned_subs            ?? [],
    });
  },

  loadServeReticles: async (setId) => {
    const contacts = await db.contacts
      .where('set_id').equals(setId)
      .filter(c => c.action === 'serve' && c.court_x != null)
      .toArray();
    set({
      serveReticles: contacts.map(c => ({
        contactId: c.id, result: c.result,
        court_x: c.court_x, court_y: c.court_y, zone: c.zone,
      })),
    });
  },

  resetToRotation: async (rotNum, serving) => {
    const s = get();
    if (!s.currentSetId) return;

    const lineupRows = await db.lineups.where('set_id').equals(s.currentSetId).toArray();
    if (!lineupRows.length) return;

    const playerIds = lineupRows.map((r) => r.player_id);
    const players   = await db.players.bulkGet(playerIds);

    // Reconstruct rotation-1 lineup (same shape as LiveMatchPage hydration)
    let lineup = lineupRows
      .map((row, i) => ({
        position:      row.position,
        serveOrder:    row.serve_order ?? row.position,
        playerId:      row.player_id,
        playerName:    players[i]?.name ?? '',
        jersey:        players[i]?.jersey_number ?? '',
        positionLabel: row.position_label || players[i]?.position || '',
      }))
      .sort((a, b) => a.position - b.position);

    // Advance to requested rotation (rotation 1 needs 0 rotations)
    for (let i = 1; i < rotNum; i++) lineup = rotateFwd(lineup);

    set({
      lineup,
      rotationNum:                 rotNum,
      serveSide:                   serving ? SIDE.US : SIDE.THEM,
      rallyPhase:                  'pre_serve',
      pendingHblk:                 null,
      actionHistory:               [],
      liberoOnCourt:               false,
      liberoReplacedPlayerId:      null,
      liberoReplacedName:          '',
      liberoReplacedJersey:        '',
      liberoReplacedPositionLabel: '',
    });
  },

  endMatch: async (winner) => {
    const s = get();
    await db.sets.update(s.currentSetId, {
      status:    SET_STATUS.COMPLETE,
      our_score: s.ourScore,
      opp_score: s.oppScore,
      winner,
    });

    const newSetsUs   = s.ourSetsWon + (winner === SIDE.US   ? 1 : 0);
    const newSetsThem = s.oppSetsWon + (winner === SIDE.THEM ? 1 : 0);

    await db.matches.update(s.matchId, {
      status:       MATCH_STATUS.COMPLETE,
      our_sets_won: newSetsUs,
      opp_sets_won: newSetsThem,
    });

    // Delete any orphan in-progress sets (created by old endSet() calls that were never played)
    await db.sets
      .where('match_id').equals(s.matchId)
      .filter((row) => row.status === SET_STATUS.IN_PROGRESS)
      .delete();

    set({ ourSetsWon: newSetsUs, oppSetsWon: newSetsThem });
  },

  // ── Set Revision ──────────────────────────────────────────────────────────

  // Clear all data for a set and put it back to IN_PROGRESS so it can be re-entered.
  // Match status goes back to IN_PROGRESS until finishRevisedSet is called.
  reviseSet: async (setId) => {
    await db.contacts.where('set_id').equals(setId).delete();
    await db.rallies.where('set_id').equals(setId).delete();
    await db.substitutions.where('set_id').equals(setId).delete();
    await db.lineups.where('set_id').equals(setId).delete();
    const setRow = await db.sets.get(setId);
    await db.sets.update(setId, {
      status:           SET_STATUS.IN_PROGRESS,
      our_score:        0,
      opp_score:        0,
      winner:           null,
      libero_player_id: null,
    });
    if (setRow?.match_id) {
      await db.matches.update(setRow.match_id, { status: MATCH_STATUS.IN_PROGRESS });
    }
  },

  // Permanently delete a set and all its associated data.
  deleteSet: async (setId) => {
    const setRow = await db.sets.get(setId);
    await db.contacts.where('set_id').equals(setId).delete();
    await db.rallies.where('set_id').equals(setId).delete();
    await db.substitutions.where('set_id').equals(setId).delete();
    await db.lineups.where('set_id').equals(setId).delete();
    await db.sets.delete(setId);
    // Recount set wins from remaining sets and restore match to complete if warranted
    if (setRow?.match_id) {
      const remaining = await db.sets.where('match_id').equals(setRow.match_id).toArray();
      const usWins  = remaining.filter(s => s.winner === 'us').length;
      const oppWins = remaining.filter(s => s.winner === 'opp').length;
      const winner  = usWins > oppWins ? 'us' : oppWins > usWins ? 'opp' : null;
      await db.matches.update(setRow.match_id, {
        status: winner ? MATCH_STATUS.COMPLETE : MATCH_STATUS.IN_PROGRESS,
        winner,
      });
    }
  },

  // Finalize a revised set — called by LiveMatchPage when the re-entered set ends.
  // Recounts set wins from DB rather than incrementing to handle any result change.
  finishRevisedSet: async (winner) => {
    const s = get();
    await db.sets.update(s.currentSetId, {
      status:    SET_STATUS.COMPLETE,
      our_score: s.ourScore,
      opp_score: s.oppScore,
      winner,
    });

    const allComplete = await db.sets
      .where('match_id').equals(s.matchId)
      .filter((row) => row.status === SET_STATUS.COMPLETE)
      .toArray();
    const newSetsUs   = allComplete.filter((row) => row.winner === SIDE.US).length;
    const newSetsThem = allComplete.filter((row) => row.winner === SIDE.THEM).length;

    await db.matches.update(s.matchId, {
      status:       MATCH_STATUS.COMPLETE,
      our_sets_won: newSetsUs,
      opp_sets_won: newSetsThem,
    });

    await db.sets
      .where('match_id').equals(s.matchId)
      .filter((row) => row.status === SET_STATUS.IN_PROGRESS)
      .delete();

    set({ ourSetsWon: newSetsUs, oppSetsWon: newSetsThem });
  },
}));
