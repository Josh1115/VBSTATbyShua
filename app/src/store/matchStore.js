import { create } from 'zustand';
import { ACTION, RESULT, SIDE, SET_STATUS, MATCH_STATUS, NFHS } from '../constants';
import { db } from '../db/schema';

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

function checkSetWin(ourScore, oppScore, setNumber) {
  const target = setNumber >= 5 ? NFHS.FIFTH_SET_WIN_SCORE : NFHS.SET_WIN_SCORE;
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
  set({ actionHistory: [entry, ...prev].slice(0, 10) });
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
  rallyCount:            0,
  rotationNum:           1,

  actionHistory:         [],   // array of up to 10 action descriptors, newest first
  pendingHblk:           null, // { playerId } | null — waiting for block assist partner
  lastFeedItem:          null, // { label: string, id: number }
  rallyPhase:            'pre_serve', // 'pre_serve' | 'in_rally'
  currentRun:            { side: null, count: 0 }, // current consecutive-point streak
  pointHistory:          [], // { side: 'us'|'them' }[] — one entry per point this set
  pendingSetWin:         null, // 'us' | 'them' | null — set win detected, awaiting confirmation
  format:                null, // 'best_of_3' | 'best_of_5'
};

export const useMatchStore = create((set, get) => ({
  ...INITIAL_STATE,

  setMatch:   (matchId, setId, teamId, format) => {
    const saved = parseInt(localStorage.getItem('vbstat_max_subs'), 10);
    const maxSubsPerSet = !isNaN(saved) && saved > 0 ? saved : NFHS.MAX_SUBS_PER_SET;
    set({ matchId, currentSetId: setId, teamId, format, maxSubsPerSet });
  },
  resetMatch: () => set(INITIAL_STATE),
  setLineup:  (lineup)   => set({ lineup }),
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

    const rallyId = await db.rallies.add({
      set_id:       s.currentSetId,
      rally_number: rallyCount,
      serve_side:   serveSide,
      point_winner: side,
      our_rotation: rotationNum,
      timestamp:    Date.now(),
    });

    const prevRun  = s.currentRun;
    const newRun   = prevRun.side === side
      ? { side, count: Math.min(25, prevRun.count + 1) }
      : { side, count: 1 };

    if (side === SIDE.US) {
      pushAction(get, set, {
        type:                        'point_us',
        rallyId:                     rallyId,
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
        rallyId:        rallyId,
        prevServeSide:  serveSide,
        prevRallyPhase: s.rallyPhase,
        prevRun,
      });
    }

    const newRotationNum = rotate ? (rotationNum % 6) + 1 : rotationNum;
    let newLineup = rotate ? rotateFwd(lineup) : lineup;

    // Auto libero swap — only on rotations where we have a designated libero
    let liberoOnCourt         = s.liberoOnCourt;
    let liberoReplacedPlayerId      = s.liberoReplacedPlayerId;
    let liberoReplacedName          = s.liberoReplacedName;
    let liberoReplacedJersey        = s.liberoReplacedJersey;
    let liberoReplacedPositionLabel = s.liberoReplacedPositionLabel;

    if (rotate && s.liberoId) {
      if (liberoOnCourt) {
        // Check whether libero rotated into the front row (positions 2, 3, 4)
        const liberoIdx = newLineup.findIndex((sl) => sl.playerId === s.liberoId);
        if (liberoIdx !== -1) {
          const liberoPos = newLineup[liberoIdx].position;
          if (liberoPos >= 2 && liberoPos <= 4) {
            // Auto-swap OUT: replace libero slot with their paired MB
            newLineup = newLineup.map((sl, i) =>
              i === liberoIdx
                ? { ...sl, playerId: liberoReplacedPlayerId, playerName: liberoReplacedName, jersey: liberoReplacedJersey, positionLabel: liberoReplacedPositionLabel }
                : sl
            );
            liberoOnCourt = false;
            // Keep liberoReplaced* pointing to the MB so auto-swap-in can find them
          }
        }
      } else if (liberoReplacedPlayerId && s.liberoName) {
        // Libero on bench — check whether their paired MB rotated into the back row (positions 1, 5, 6)
        const mbIdx = newLineup.findIndex((sl) => sl.playerId === liberoReplacedPlayerId);
        if (mbIdx !== -1) {
          const mbPos = newLineup[mbIdx].position;
          if (mbPos === 1 || mbPos === 5 || mbPos === 6) {
            // Auto-swap IN: libero replaces MB in back row
            newLineup = newLineup.map((sl, i) =>
              i === mbIdx
                ? { ...sl, playerId: s.liberoId, playerName: s.liberoName, jersey: s.liberoJersey, positionLabel: 'L' }
                : sl
            );
            liberoOnCourt = true;
            // liberoReplaced* already points to MB — no change needed
          }
        }
      }
    }

    set({
      rallyPhase:    'pre_serve',
      ourScore,
      oppScore,
      serveSide:     newServeSide,
      lineup:        newLineup,
      rallyCount:    rallyCount + 1,
      rotationNum:   newRotationNum,
      currentRun:    newRun,
      pointHistory:  [...s.pointHistory, { side }],
      liberoOnCourt,
      liberoReplacedPlayerId,
      liberoReplacedName,
      liberoReplacedJersey,
      liberoReplacedPositionLabel,
    });

    const winner = checkSetWin(ourScore, oppScore, setNumber);
    if (winner) set({ pendingSetWin: winner });
  },

  clearPendingSetWin: () => set({ pendingSetWin: null }),

  undoLast: async () => {
    const s = get();
    if (!s.actionHistory.length) return;
    const [action, ...rest] = s.actionHistory;

    switch (action.type) {

      case 'contact': {
        await db.contacts.delete(action.contactId);
        if (action.autoSetId) {
          await db.contacts.delete(action.autoSetId);
        } else if (action.assistId) {
          await db.contacts.update(action.assistId, { result: RESULT.SET });
        }
        set({
          actionHistory:     rest,
          committedContacts: s.committedContacts
            .filter(c => c.id !== action.contactId && c.id !== action.autoSetId)
            .map(c => !action.autoSetId && c.id === action.assistId ? { ...c, result: RESULT.SET } : c),
          lastFeedItem: null,
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

      case 'point_us': {
        if (action.rallyId) await db.rallies.delete(action.rallyId);
        set({
          actionHistory: rest,
          ourScore:      Math.max(0, s.ourScore - 1),
          serveSide:     action.prevServeSide,
          rallyPhase:    action.prevRallyPhase ?? 'pre_serve',
          lineup:        action.prevLineup,
          rotationNum:   action.prevRotation,
          rallyCount:    Math.max(0, s.rallyCount - 1),
          pendingHblk:   null,
          lastFeedItem:  null,
          currentRun:    action.prevRun ?? { side: null, count: 0 },
          pointHistory:  s.pointHistory.slice(0, -1),
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
          actionHistory: rest,
          oppScore:      Math.max(0, s.oppScore - 1),
          serveSide:     action.prevServeSide,
          rallyPhase:    action.prevRallyPhase ?? 'pre_serve',
          rallyCount:    Math.max(0, s.rallyCount - 1),
          pendingHblk:   null,
          lastFeedItem:  null,
          currentRun:    action.prevRun ?? { side: null, count: 0 },
          pointHistory:  s.pointHistory.slice(0, -1),
        });
        break;
      }

      case 'timeout': {
        if (action.side === SIDE.US)
          set({ actionHistory: rest, ourTimeouts: Math.max(0, s.ourTimeouts - 1) });
        else
          set({ actionHistory: rest, oppTimeouts: Math.max(0, s.oppTimeouts - 1) });
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
          actionHistory: rest,
          lineup:        newLineup,
          subsUsed:      action.prevSubsUsed,
          ...(action.prevLiberoOnCourt !== undefined && { liberoOnCourt: action.prevLiberoOnCourt }),
        });
        break;
      }

      case 'libero_swap': {
        await db.substitutions.delete(action.subId);
        set({
          actionHistory:          rest,
          liberoOnCourt:          action.prevLiberoOnCourt,
          lineup:                 action.prevLineup,
          liberoReplacedPlayerId: action.prevReplacedId,
          liberoReplacedName:     action.prevReplacedName,
          liberoReplacedJersey:   action.prevReplacedJersey,
        });
        break;
      }
    }
  },

  recordContact: async (contactData) => {
    const s = get();
    const contactFull = {
      match_id:     s.matchId,
      set_id:       s.currentSetId,
      rotation_num: s.rotationNum,
      serve_side:   s.serveSide,
      timestamp:    Date.now(),
      ...contactData,
    };
    const id = await db.contacts.add(contactFull);

    let newCommittedContacts = [...s.committedContacts, { ...contactFull, id }];

    let assistId   = null;
    let autoSetId  = null;

    if (contactData.action === ACTION.ATTACK) {
      // Auto-record SET ATT for the back row setter on every attack
      const backRowSetter = s.lineup.find(
        (sl) => sl.positionLabel === 'S' && [1, 5, 6].includes(sl.position)
      );
      if (backRowSetter) {
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
        // No back row setter — fall back to back-assigning the last manual SET contact
        const lastSetContact = s.committedContacts
          .findLast((c) => c.set_id === s.currentSetId && c.action === ACTION.SET);
        if (lastSetContact) {
          assistId = lastSetContact.id;
          await db.contacts.update(lastSetContact.id, { result: RESULT.ASSIST });
          newCommittedContacts = newCommittedContacts.map((c) =>
            c.id === lastSetContact.id ? { ...c, result: RESULT.ASSIST } : c
          );
        }
      }
    }

    const prevHistory = get().actionHistory;
    set({
      actionHistory:     [{ type: 'contact', contactId: id, assistId, autoSetId }, ...prevHistory].slice(0, 10),
      committedContacts: newCommittedContacts,
      ...(contactData.action === ACTION.SERVE || contactData.action === ACTION.PASS
        ? { rallyPhase: 'in_rally' } : {}),
    });

    const slot = s.lineup.find((p) => p.playerId === contactData.player_id);
    if (slot) {
      const lastName = slot.playerName.split(' ').pop();
      setFeed(set, getStatLabel(contactData.action, contactData.result, lastName));
    }

    return id;
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
          match_id: matchId, set_id: currentSetId,
          player_id: pendingHblk.playerId,
          action: ACTION.BLOCK, result: RESULT.BLOCK_ASSIST,
          timestamp: now,
        };
        const contact2 = {
          match_id: matchId, set_id: currentSetId,
          player_id: playerId,
          action: ACTION.BLOCK, result: RESULT.BLOCK_ASSIST,
          timestamp: now + 1,
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
          actionHistory: [{ type: 'hblk_contact', contactId1: id1, contactId2: id2 }, ...prevHistory].slice(0, 10),
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

  substitutePlayer: async (outPlayerId, inPlayer) => {
    const s = get();
    if (s.subsUsed >= s.maxSubsPerSet) return false;

    const slotIdx = s.lineup.findIndex((sl) => sl.playerId === outPlayerId);
    if (slotIdx === -1) return false;

    const outPlayer        = s.lineup[slotIdx];
    const prevSubsUsed     = s.subsUsed;
    const liberoGoingOut   = outPlayerId === s.liberoId;

    const subDbId = await db.substitutions.add({
      set_id:       s.currentSetId,
      rally_number: 0,
      player_out:   outPlayerId,
      player_in:    inPlayer.id,
      position:     slotIdx + 1,
      libero_swap:  false,
      timestamp:    Date.now(),
    });

    set({
      lineup: s.lineup.map((sl, i) =>
        i === slotIdx
          ? { ...sl, playerId: inPlayer.id, playerName: inPlayer.name, jersey: inPlayer.jersey_number, positionLabel: inPlayer.position }
          : sl
      ),
      subsUsed: s.subsUsed + 1,
      ...(liberoGoingOut && { liberoOnCourt: false }),
    });

    pushAction(get, set, {
      type:              'sub',
      subId:             subDbId,
      slotIdx:           slotIdx,
      prevPlayerId:      outPlayer.playerId,
      prevName:          outPlayer.playerName,
      prevJersey:        outPlayer.jersey,
      prevPositionLabel: outPlayer.positionLabel,
      prevSubsUsed:      prevSubsUsed,
      prevLiberoOnCourt: s.liberoOnCourt,
    });

    return true;
  },

  swapLibero: async (liberoPlayer, explicitTargetIdx) => {
    const s = get();

    // Snapshot state before the swap for undo
    const prevLiberoOnCourt  = s.liberoOnCourt;
    const prevLineup         = s.lineup;
    const prevReplacedId     = s.liberoReplacedPlayerId;
    const prevReplacedName   = s.liberoReplacedName;
    const prevReplacedJersey = s.liberoReplacedJersey;

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
      type:              'libero_swap',
      subId:             subDbId,
      prevLiberoOnCourt: prevLiberoOnCourt,
      prevLineup:        prevLineup,
      prevReplacedId:    prevReplacedId,
      prevReplacedName:  prevReplacedName,
      prevReplacedJersey: prevReplacedJersey,
    });
  },

  addOppPoint: async (reason) => {
    const s = get();
    const { action, result, pointSide, feedLabel } = OPP_REASON[reason];
    const contactFull = {
      match_id:         s.matchId,
      set_id:           s.currentSetId,
      player_id:        null,
      action,
      result,
      opponent_contact: true,
      timestamp:        Date.now(),
    };
    const id = await db.contacts.add(contactFull);
    set({ committedContacts: [...get().committedContacts, { ...contactFull, id }] });
    setFeed(set, feedLabel);
    await get().addPoint(pointSide);
  },

  useTimeout: (side) => {
    const s = get();
    if (side === SIDE.US) {
      if (s.ourTimeouts >= NFHS.MAX_TIMEOUTS_PER_SET) return;
      set({ ourTimeouts: s.ourTimeouts + 1 });
    } else {
      if (s.oppTimeouts >= NFHS.MAX_TIMEOUTS_PER_SET) return;
      set({ oppTimeouts: s.oppTimeouts + 1 });
    }
    pushAction(get, set, { type: 'timeout', side });
  },

  resetCurrentSet: async () => {
    const s = get();
    await db.contacts.where('set_id').equals(s.currentSetId).delete();
    await db.rallies.where('set_id').equals(s.currentSetId).delete();
    await db.substitutions.where('set_id').equals(s.currentSetId).delete();
    set({
      ourScore:                    0,
      oppScore:                    0,
      serveSide:                   SIDE.US,
      ourTimeouts:                 0,
      oppTimeouts:                 0,
      subsUsed:                    0,
      rallyCount:                  0,
      rotationNum:                 1,
      committedContacts:           [],
      actionHistory:               [],
      pendingHblk:                 null,
      lastFeedItem:                null,
      rallyPhase:                  'pre_serve',
      currentRun:                  { side: null, count: 0 },
      pointHistory:                [],
      pendingSetWin:               null,
      liberoOnCourt:               false,
      liberoReplacedPlayerId:      null,
      liberoReplacedName:          '',
      liberoReplacedJersey:        '',
      liberoReplacedPositionLabel: '',
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
      currentSetId:                newSetId,
      setNumber:                   nextSetNum,
      ourScore:                    0,
      oppScore:                    0,
      ourSetsWon:                  newSetsUs,
      oppSetsWon:                  newSetsThem,
      ourTimeouts:                 0,
      oppTimeouts:                 0,
      subsUsed:                    0,
      rallyCount:                  0,
      rotationNum:                 1,
      committedContacts:           [],
      actionHistory:               [],
      pendingHblk:                 null,
      lastFeedItem:                null,
      rallyPhase:                  'pre_serve',
      currentRun:                  { side: null, count: 0 },
      pointHistory:                [],
      liberoReplacedPositionLabel: '',
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
}));
