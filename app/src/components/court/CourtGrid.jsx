import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useMatchStore } from '../../store/matchStore';
import { useShallow } from 'zustand/react/shallow';
import { ACTION, RESULT } from '../../constants';
import { computePlayerStats } from '../../stats/engine';
import { PlayerTile } from './PlayerTile';

// Render order maps the 2×3 visual grid to lineup indices.
// Lineup index = position - 1 (S1=0, S2=1, S3=2, S4=3, S5=4, S6=5)
//
// Visual layout (facing net from bench):
//   Front row (top):    S4 | S3 | S2   → indices 3, 2, 1
//   Back row (bottom):  S5 | S6 | S1   → indices 4, 5, 0
const GRID_ORDER = [3, 2, 1, 4, 5, 0];

// Returns heat object for one accumulator.
function deriveHeat(a) {
  // Attack: hot = kill% ≥ 40%, cold = hit% ≤ 0%, min 3 attempts
  let attack = null;
  if (a.atkTA >= 3) {
    if (a.atkK / a.atkTA >= 0.40)              attack = 'hot';
    else if ((a.atkK - a.atkAE) / a.atkTA <= 0) attack = 'cold';
  }
  // Serve: hot = ace% ≥ 15%, cold = error% ≥ 35%, min 3 serves
  let serve = null;
  if (a.srvTA >= 3) {
    if (a.srvAce / a.srvTA >= 0.15)      serve = 'hot';
    else if (a.srvErr / a.srvTA >= 0.35) serve = 'cold';
  }
  // Pass: hot = APR ≥ 2.0, cold = APR ≤ 1.25, min 3 passes
  let pass = null;
  if (a.pasN >= 3) {
    const apr = a.pasSum / a.pasN;
    if (apr >= 2.0)       pass = 'hot';
    else if (apr <= 1.25) pass = 'cold';
  }
  // Dig: hot = success rate ≥ 75%, cold = ≤ 40%, min 3 digs
  let dig = null;
  const digTotal = a.digOk + a.digErr;
  if (digTotal >= 3) {
    const rate = a.digOk / digTotal;
    if (rate >= 0.75)      dig = 'hot';
    else if (rate <= 0.40) dig = 'cold';
  }
  // Block: hot = ≥2 solos/assists, cold = ≥2 errors
  let block = null;
  if (a.blkPos >= 2)      block = 'hot';
  else if (a.blkErr >= 2) block = 'cold';
  return { attack, serve, pass, dig, block };
}

// Single O(n) pass over contacts — accumulates stats for all playerIds simultaneously.
function computeAllHeat(contacts, playerIds, setId) {
  const accums = {};
  for (const id of playerIds) {
    accums[id] = { atkK: 0, atkTA: 0, atkAE: 0, srvAce: 0, srvErr: 0, srvTA: 0, pasSum: 0, pasN: 0, digOk: 0, digErr: 0, blkPos: 0, blkErr: 0 };
  }
  for (const c of contacts) {
    const a = accums[c.player_id];
    if (!a || c.set_id !== setId || c.opponent_contact) continue;
    const { action, result } = c;
    if (action === 'attack') {
      a.atkTA++;
      if (result === 'kill')  a.atkK++;
      if (result === 'error') a.atkAE++;
    } else if (action === 'serve') {
      a.srvTA++;
      if (result === 'ace')   a.srvAce++;
      if (result === 'error') a.srvErr++;
    } else if (action === 'pass') {
      const v = Number(result);
      if (!isNaN(v)) { a.pasSum += v; a.pasN++; }
    } else if (action === 'dig') {
      if (result === 'success' || result === 'freeball') a.digOk++;
      if (result === 'error') a.digErr++;
    } else if (action === 'block') {
      if (result === 'solo' || result === 'assist') a.blkPos++;
      if (result === 'error') a.blkErr++;
    }
  }
  return Object.fromEntries(playerIds.map((id) => [id, deriveHeat(accums[id])]));
}

// Returns 6 slot objects ordered for base/system positions:
//   front row (cells 0-2): OH | MB | OPP/S
//   back row  (cells 3-5): MB/L | OH (pipe) | S/OPP
// frontRow = lineup[1,2,3] (positions 2,3,4); backRow = lineup[0,4,5] (positions 1,5,6)
function getBaseDisplayOrder(lineup) {
  const frontRow = [lineup[1], lineup[2], lineup[3]];
  const backRow  = [lineup[0], lineup[4], lineup[5]];

  function sortRow(row, picks) {
    const result = [null, null, null];
    const used   = new Set();
    picks.forEach((labels, cell) => {
      const idx = row.findIndex((s, i) => !used.has(i) && labels.includes(s?.positionLabel));
      if (idx !== -1) { result[cell] = row[idx]; used.add(idx); }
    });
    const leftover = row.filter((_, i) => !used.has(i));
    let li = 0;
    for (let i = 0; i < 3; i++) {
      if (result[i] === null && li < leftover.length) result[i] = leftover[li++];
    }
    return result;
  }

  const frontSorted = sortRow(frontRow, [['OH'], ['MB'], ['OPP', 'S']]);
  const backSorted  = sortRow(backRow,  [['MB', 'L'], ['OH'], ['S', 'OPP']]);
  return [...frontSorted, ...backSorted];
}

// Returns 6 slot objects rearranged for serve receive positioning (back-row setter rotations only).
function getServeReceiveDisplayOrder(lineup) {
  const setter = lineup.find(s => s?.positionLabel === 'S');
  if (!setter) return GRID_ORDER.map(i => lineup[i]);

  const sp = setter.position;
  if (sp === 1) return [lineup[3], lineup[2], lineup[0], lineup[4], lineup[5], lineup[1]];
  if (sp === 6) return [lineup[2], lineup[1], lineup[5], lineup[3], lineup[4], lineup[0]];
  if (sp === 5) return [lineup[4], lineup[2], lineup[1], lineup[3], lineup[5], lineup[0]];
  if (sp === 3) return [lineup[1], lineup[2], lineup[4], lineup[3], lineup[5], lineup[0]];
  return GRID_ORDER.map(i => lineup[i]);
}

// Clockwise stagger from server position (pos1=gridIdx5 → pos2=2 → pos3=1 → pos4=0 → pos5=3 → pos6=4)
const ROTATION_DELAYS = [165, 110, 55, 220, 275, 0];

// Directional nudge per grid cell on rotation — matches the clockwise movement each player makes
// Cell 0(top-left)=right, Cell 1(top-mid)=right, Cell 2(top-right)=down
// Cell 3(bot-left)=up,    Cell 4(bot-mid)=left,   Cell 5(bot-right)=left
const ROTATION_NUDGE = ['right', 'right', 'down', 'up', 'left', 'left'];

// #1 Ball arc — parabolic arc for ACE / KILL contacts
function BallArc({ startX, startY }) {
  const dx   = (window.innerWidth  - startX) * 0.88;
  const peak = Math.round(window.innerHeight * 0.22);
  const land = Math.round(window.innerHeight * 0.08);
  return (
    <div
      className="fixed pointer-events-none z-[999]"
      style={{ left: startX, top: startY, '--arc-dx': `${dx}px`, '--arc-peak': `-${peak}px`, '--arc-land': `${land}px` }}
    >
      <div style={{ animation: 'ball-arc-x 680ms linear forwards' }}>
        <div style={{ animation: 'ball-arc-y 680ms cubic-bezier(0.22,0,0.68,1) forwards' }}>
          <span style={{ fontSize: '3.2vmin', display: 'block', animation: 'ball-arc-fade 680ms ease-in forwards' }}>🏐</span>
        </div>
      </div>
    </div>
  );
}

// #4 Kill burst — volleyball emojis scatter from contact point
function KillBurst({ x, y }) {
  return (
    <div className="fixed pointer-events-none z-[998]" style={{ left: x, top: y }}>
      {Array.from({ length: 4 }, (_, i) => {
        const angle = (i / 4) * Math.PI * 2 + Math.PI / 8;
        const dist  = 30 + i * 14;
        return (
          <div
            key={i}
            className="kill-burst-emoji"
            style={{
              '--dx': `${Math.cos(angle) * dist}px`,
              '--dy': `${Math.sin(angle) * dist}px`,
              fontSize: `${11 + i * 2}px`,
              animationDelay: `${i * 35}ms`,
            }}
          >🏐</div>
        );
      })}
    </div>
  );
}

// K-button firework — orange/gold dot particles radiate from the K button area
const FIREWORK_COLORS = ['#f97316', '#fb923c', '#fbbf24', '#ef4444', '#fde047', '#f59e0b', '#fdba74', '#fca5a5'];
function KillFirework({ x, y }) {
  const count = 12;
  return (
    <div className="fixed pointer-events-none z-[999]" style={{ left: x, top: y }}>
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2;
        const dist  = 22 + (i % 4) * 12;
        const size  = 4 + (i % 3);
        return (
          <div
            key={i}
            className="kill-burst-dot"
            style={{
              '--dx': `${Math.cos(angle) * dist}px`,
              '--dy': `${Math.sin(angle) * dist}px`,
              background: FIREWORK_COLORS[i % FIREWORK_COLORS.length],
              width: size, height: size,
              marginLeft: -size / 2, marginTop: -size / 2,
              animationDelay: `${i * 20}ms`,
            }}
          />
        );
      })}
    </div>
  );
}

// "KILL" badge — rises from K button like DIME does for a perfect pass
function KillBadge({ x, y }) {
  return (
    <div className="kill-badge-pop fixed pointer-events-none z-[998]" style={{ left: x, top: y }}>
      <div style={{
        position: 'absolute', left: '-16px', top: '-8px',
        background: '#c2410c', color: '#fff',
        fontWeight: 900, fontSize: '13px',
        padding: '2px 7px', borderRadius: '5px',
        boxShadow: '0 0 10px rgba(234,88,12,0.65)',
        whiteSpace: 'nowrap', letterSpacing: '0.06em',
      }}>KILL</div>
    </div>
  );
}

// Ace celebration — gold ring pulse + "ACE" text zoom-fade + volleyball scatter
function AceCelebration({ x, y }) {
  return (
    <div className="fixed pointer-events-none z-[998]" style={{ left: x, top: y }}>
      <div
        className="ace-ring absolute"
        style={{
          width: '64px', height: '64px',
          border: '3px solid #f59e0b',
          boxShadow: '0 0 14px #f59e0b, 0 0 32px rgba(245,158,11,0.35)',
          left: '-32px', top: '-32px',
        }}
      />
      <div
        className="ace-text absolute"
        style={{
          left: '-22px', top: '-16px',
          fontFamily: "'Orbitron', system-ui, sans-serif",
          fontSize: '17px', fontWeight: 900,
          color: '#fbbf24',
          textShadow: '0 0 10px #f59e0b, 0 0 22px rgba(245,158,11,0.55)',
          letterSpacing: '0.08em', whiteSpace: 'nowrap',
        }}
      >ACE</div>
      {Array.from({ length: 3 }, (_, i) => {
        const angle = (i / 3) * Math.PI * 2 - Math.PI / 6;
        const dist  = 28 + i * 10;
        return (
          <div
            key={i}
            className="kill-burst-emoji"
            style={{
              '--dx': `${Math.cos(angle) * dist}px`,
              '--dy': `${Math.sin(angle) * dist}px`,
              fontSize: '11px',
              animationDelay: `${i * 45}ms`,
            }}
          >🏐</div>
        );
      })}
    </div>
  );
}

// Block hands — two hands rise over the net on a block
function BlockHands({ blockKey }) {
  return (
    <div
      key={blockKey}
      className="block-hands absolute pointer-events-none z-[25]"
      style={{ top: 'calc(50% - 3.2vmin)', left: '50%', transform: 'translateX(-50%)', fontSize: '3vmin', letterSpacing: '0.5vmin' }}
      aria-hidden="true"
    >🤚🤚</div>
  );
}

// Perfect pass badge — "3!" pops above the tile
function PerfectPassBadge({ x, y }) {
  return (
    <div className="perfect-pass-pop fixed pointer-events-none z-[998]" style={{ left: x, top: y }}>
      <div style={{
        position: 'absolute', left: '-14px', top: '-8px',
        background: '#15803d', color: '#fff',
        fontWeight: 900, fontSize: '13px',
        padding: '2px 6px', borderRadius: '5px',
        boxShadow: '0 0 8px rgba(34,197,94,0.5)',
        whiteSpace: 'nowrap', letterSpacing: '0.04em',
      }}>DIME</div>
    </div>
  );
}

export const CourtGrid = memo(function CourtGrid({ aceZoneHints = {} }) {
  const {
    lineup, committedContacts, currentSetId, rallyPhase, serveSide,
    rotationNum, liberoId, serveReceiveFormations,
  } = useMatchStore(useShallow((s) => ({
    lineup:                 s.lineup,
    committedContacts:      s.committedContacts,
    currentSetId:           s.currentSetId,
    rallyPhase:             s.rallyPhase,
    serveSide:              s.serveSide,
    rotationNum:            s.rotationNum,
    liberoId:               s.liberoId,
    serveReceiveFormations: s.serveReceiveFormations,
  })));

  const inRally        = rallyPhase === 'in_rally';
  const inServeReceive = serveSide === 'them' && !inRally;

  // Contact animations (kill/ace/pass/net/block overlays)
  const [anim, setAnim] = useState({
    ballArc: null, killBurst: null, killFirework: null, killBadge: null,
    aceCeleb: null, perfectPassBadge: null, netFlash: 0, blockHandsKey: 0,
  });
  // Substitution overlay state
  const [sub, setSub] = useState({ flashIds: new Set(), ghosts: {}, liberoGhosts: new Set() });
  // Rotation overlay state
  const [rot, setRot] = useState({ rotating: false, ghosts: null });
  // #12 Court draw-in — one-shot on mount
  const [showCourtDraw, setShowCourtDraw] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShowCourtDraw(false), 1500);
    return () => clearTimeout(t);
  }, []);

  // Combined contact watcher — fires on new non-opponent contacts
  const prevContactsLenRef = useRef(0);
  const arcTimerRef  = useRef(null);
  const aceTimerRef  = useRef(null);
  const passTimerRef = useRef(null);
  useEffect(() => {
    const len = committedContacts.length;
    if (len < prevContactsLenRef.current) prevContactsLenRef.current = 0; // reset on new set
    if (len <= prevContactsLenRef.current) return;
    const prevLen = prevContactsLenRef.current;
    prevContactsLenRef.current = len;
    // A kill auto-adds a SET contact in the same batch — scan all new contacts
    // and use the non-set one as the trigger (fall back to last if all are sets)
    const newContacts = committedContacts.slice(prevLen).filter((nc) => !nc.opponent_contact);
    if (newContacts.length === 0) return;
    const c = newContacts.find((nc) => nc.action !== ACTION.SET) ?? newContacts[newContacts.length - 1];

    // #1 Ball arc + #4 Kill/Ace burst on ACE or KILL
    const isAce  = c.action === ACTION.SERVE  && c.result === RESULT.ACE;
    const isKill = c.action === ACTION.ATTACK && c.result === RESULT.KILL;
    if (isAce || isKill) {
      const el = playerRefs.current[c.player_id];
      if (el) {
        const r   = el.getBoundingClientRect();
        const x   = r.left + r.width  * 0.5;
        const y   = r.top  + r.height * 0.5;
        const key = c.id ?? len;
        if (isKill) {
          const kBtnY = r.top + r.height * 0.60;
          setAnim((s) => ({ ...s, ballArc: { key, x, y }, killBurst: { key, x, y }, killFirework: { key, x, y: kBtnY }, killBadge: { key, x, y: kBtnY } }));
          clearTimeout(arcTimerRef.current);
          arcTimerRef.current = setTimeout(() => setAnim((s) => ({ ...s, ballArc: null, killBurst: null, killFirework: null, killBadge: null })), 920);
        }
        if (isAce) {
          setAnim((s) => ({ ...s, ballArc: { key, x, y }, aceCeleb: { key, x, y } }));
          clearTimeout(aceTimerRef.current);
          aceTimerRef.current = setTimeout(() => setAnim((s) => ({ ...s, ballArc: null, aceCeleb: null })), 820);
        }
      }
    }

    // Perfect pass badge on rating 3
    if (c.action === ACTION.PASS && c.result === '3') {
      const el = playerRefs.current[c.player_id];
      if (el) {
        const r = el.getBoundingClientRect();
        clearTimeout(passTimerRef.current);
        setAnim((s) => ({ ...s, perfectPassBadge: { key: c.id ?? len, x: r.left + r.width * 0.5, y: r.top + r.height * 0.35 } }));
        passTimerRef.current = setTimeout(() => setAnim((s) => ({ ...s, perfectPassBadge: null })), 920);
      }
    }

    // #2 Net flash + block hands on BLOCK solo/assist or NET_TOUCH error
    const isBlock    = c.action === ACTION.BLOCK && (c.result === RESULT.SOLO || c.result === RESULT.ASSIST);
    const isNetTouch = c.action === ACTION.ERROR && c.result === RESULT.NET_TOUCH;
    if (isBlock || isNetTouch) {
      setAnim((s) => ({ ...s, netFlash: s.netFlash + 1, ...(isBlock && { blockHandsKey: s.blockHandsKey + 1 }) }));
    }
  // Refs (playerRefs, arcTimerRef, etc.) and stable setState setters are intentionally
  // omitted from deps — refs are always fresh via .current, setState is stable by design.
    return () => {
      clearTimeout(arcTimerRef.current);
      clearTimeout(aceTimerRef.current);
      clearTimeout(passTimerRef.current);
    };
  }, [committedContacts]);

  // Rotation flash + #7 ghost — sweep clockwise, ghost previous jerseys fading out
  const prevRotNumRef    = useRef(rotationNum);
  const prevServeSideRef = useRef(serveSide);
  useEffect(() => {
    if (prevRotNumRef.current !== rotationNum) {
      const isSideout = prevServeSideRef.current !== 'us' && serveSide === 'us';
      prevRotNumRef.current    = rotationNum;
      prevServeSideRef.current = serveSide;
      setRot({ rotating: true, isSideout, ghosts: prevCellsRef.current ? [...prevCellsRef.current] : null });
      const t = setTimeout(() => setRot({ rotating: false, isSideout: false, ghosts: null }), 600);
      return () => clearTimeout(t);
    }
  // prevRotNumRef, prevServeSideRef, prevCellsRef are refs; setRot is stable setState.
  }, [rotationNum, serveSide]);

  // Sub flash + sub ghost — detect which tile changed player without a rotation
  const prevCellsRef   = useRef(null);
  const prevRotForSub  = useRef(rotationNum);
  const subTimersRef   = useRef([]);

  const cells = useMemo(() => {
    if (inRally) return getBaseDisplayOrder(lineup);
    if (inServeReceive) {
      const custom = serveReceiveFormations?.[rotationNum];
      if (custom) {
        const byServeOrder = {};
        lineup.forEach((sl) => { byServeOrder[sl.serveOrder - 1] = sl; });
        return custom.map((soIdx) => byServeOrder[soIdx] ?? null);
      }
      return getServeReceiveDisplayOrder(lineup);
    }
    return GRID_ORDER.map((i) => lineup[i]);
  }, [lineup, inRally, inServeReceive, serveReceiveFormations, rotationNum]);

  // Sub flash + ghost — runs after cells is computed
  useEffect(() => {
    const prev = prevCellsRef.current;
    if (prev && prevRotForSub.current === rotationNum) {
      const newIds        = new Set();
      const newGhosts     = {};
      const newLiberoIdxs = new Set();
      cells.forEach((cell, i) => {
        if (cell?.playerId && prev[i]?.playerId && cell.playerId !== prev[i].playerId) {
          newIds.add(cell.playerId);
          newGhosts[i] = prev[i].playerName?.split(' ').pop() ?? '';
          // #7 — mark as libero ghost if either the outgoing or incoming player is the libero
          if (liberoId && (prev[i].playerId === liberoId || cell.playerId === liberoId)) {
            newLiberoIdxs.add(i);
          }
        }
      });
      if (newIds.size > 0) {
        setSub({ flashIds: newIds, ghosts: newGhosts, liberoGhosts: newLiberoIdxs });
        subTimersRef.current.forEach(clearTimeout);
        subTimersRef.current = [
          setTimeout(() => setSub((s) => ({ ...s, flashIds: new Set() })), 1100),
          setTimeout(() => setSub((s) => ({ ...s, ghosts: {} })), 750),
          setTimeout(() => setSub((s) => ({ ...s, liberoGhosts: new Set() })), 650),
        ];
      }
    }
    prevCellsRef.current = cells;
    prevRotForSub.current = rotationNum;
    return () => subTimersRef.current.forEach(clearTimeout);
  // prevCellsRef, prevRotForSub, subTimersRef are refs; setState setters are stable.
  }, [cells, rotationNum, liberoId]);

  // FLIP slide — animate tiles to new positions when display mode changes
  const playerRefs   = useRef({}); // { [playerId]: HTMLElement }
  const prevRectsRef = useRef({}); // { [playerId]: DOMRect }
  const prevModeRef  = useRef({ inRally, inServeReceive });

  useLayoutEffect(() => {
    const prevMode    = prevModeRef.current;
    const modeChanged = prevMode.inRally !== inRally || prevMode.inServeReceive !== inServeReceive;
    prevModeRef.current = { inRally, inServeReceive };

    if (modeChanged) {
      // FLIP: batch all reads before any writes to avoid per-element layout thrash.
      // Pass 1 — read all new rects in one sweep (no layout forced here)
      const newRects = {};
      cells.forEach((slot) => {
        if (!slot?.playerId) return;
        const el = playerRefs.current[slot.playerId];
        if (el) newRects[slot.playerId] = el.getBoundingClientRect();
      });

      // Pass 2 — write all transforms at once (reads already done)
      let anyMoved = false;
      cells.forEach((slot) => {
        if (!slot?.playerId) return;
        const el       = playerRefs.current[slot.playerId];
        const prevRect = prevRectsRef.current[slot.playerId];
        const newRect  = newRects[slot.playerId];
        if (!el || !prevRect || !newRect) return;
        const dx = prevRect.left - newRect.left;
        const dy = prevRect.top  - newRect.top;
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
          el.style.transition = 'none';
          el.style.transform  = `translate(${dx}px,${dy}px)`;
          anyMoved = true;
        }
      });

      // Single reflow to flush all transform writes at once (instead of one per tile)
      if (anyMoved) {
        const firstId = cells.find((s) => s?.playerId)?.playerId;
        void playerRefs.current[firstId]?.offsetWidth;
      }

      // Pass 3 — release all transforms to animate
      cells.forEach((slot) => {
        if (!slot?.playerId) return;
        const el = playerRefs.current[slot.playerId];
        if (!el) return;
        el.style.transition = 'transform 220ms ease-out';
        el.style.transform  = '';
      });
    }

    // Capture current natural rects for next transition
    cells.forEach((slot) => {
      if (!slot?.playerId) return;
      const el = playerRefs.current[slot.playerId];
      if (el) prevRectsRef.current[slot.playerId] = el.getBoundingClientRect();
    });
  // playerRefs, prevRectsRef, prevModeRef are mutable refs — safe to read in layout effect
  // without listing as deps; inRally/inServeReceive changes always produce a new cells array.
  }, [cells, inRally, inServeReceive]);

  // Single O(n) pass for all 6 players — avoids 6 separate contact scans per render
  const heatMap = useMemo(() => {
    const playerIds = cells.filter((slot) => slot?.playerId).map((slot) => slot.playerId);
    return computeAllHeat(committedContacts, playerIds, currentSetId);
  }, [cells, committedContacts, currentSetId]);

  // Single computePlayerStats call for all active players — replaces 6 per-tile filters.
  const statsMap = useMemo(() => {
    const playerIds = new Set(cells.filter((slot) => slot?.playerId).map((slot) => slot.playerId));
    if (!playerIds.size) return {};
    const relevant = committedContacts.filter((c) => c.set_id === currentSetId && !c.opponent_contact && playerIds.has(c.player_id));
    return computePlayerStats(relevant, 1);
  }, [cells, committedContacts, currentSetId]);

  // Per-player serve map for ace zone hints — reacts to every new contact.
  // Once a player has any serve in the current set, match data supersedes season data.
  const matchServeMap = useMemo(() => {
    const map = {};
    for (const c of committedContacts) {
      if (c.action !== 'serve' || c.opponent_contact) continue;
      if (!map[c.player_id]) map[c.player_id] = { hasServes: false, aceZones: {} };
      map[c.player_id].hasServes = true;
      if (c.result === 'ace' && c.zone != null) {
        map[c.player_id].aceZones[c.zone] = (map[c.player_id].aceZones[c.zone] ?? 0) + 1;
      }
    }
    return map;
  }, [committedContacts]);

  return (
    <>
      {/* gap-px with bg-slate-700 creates hairline dividers between tiles */}
      <div className="relative grid grid-cols-3 grid-rows-2 flex-1 min-h-0 w-full gap-px bg-slate-700">
        {cells.map((slot, gridIdx) => {
          const position   = slot?.position ?? (inRally ? gridIdx + 1 : GRID_ORDER[gridIdx] + 1);
          const isServer   = !inRally && !inServeReceive && slot?.position === 1;
          const heat       = slot?.playerId
            ? (heatMap[slot.playerId] ?? { attack: null, serve: null, pass: null, dig: null })
            : { attack: null, serve: null, pass: null, dig: null };
          const isSubFlash = sub.flashIds.has(slot?.playerId);
          // #3 directional nudge — green for sideout, orange for manual rotation
          const nudgeSuffix = rot.isSideout ? '-so' : '';
          const cellClass  = rot.rotating
            ? `relative tile-rotate-${ROTATION_NUDGE[gridIdx]}${nudgeSuffix}`
            : isSubFlash ? 'relative tile-sub-flash' : 'relative';
          const cellStyle  = rot.rotating ? { animationDelay: `${ROTATION_DELAYS[gridIdx]}ms` } : undefined;
          return (
            <div
              key={slot?.playerId ?? `empty-${gridIdx}`}
              className={`${cellClass} overflow-hidden`}
              style={cellStyle}
              ref={(el) => { if (el && slot?.playerId) playerRefs.current[slot.playerId] = el; }}
            >
              <PlayerTile
                slot={slot}
                position={position}
                isServer={isServer}
                heat={heat}
                stats={slot?.playerId ? statsMap[slot.playerId] : undefined}
                zoneHints={slot?.playerId
                  ? (matchServeMap[slot.playerId]?.hasServes
                      ? matchServeMap[slot.playerId].aceZones
                      : aceZoneHints[slot.playerId])
                  : undefined}
                isSubIn={sub.flashIds.has(slot?.playerId)}
                isDimmed={inServeReceive && gridIdx < 3}
              />
              {/* Sub swap slide — outgoing name falls down-and-blurs (#9) */}
              {sub.ghosts[gridIdx] && (
                <div className={`absolute top-0 inset-x-0 h-[42%] pointer-events-none flex items-center justify-center ${sub.liberoGhosts.has(gridIdx) ? 'libero-ghost-exit' : 'sub-ghost-exit'}`}>
                  <span
                    className={`font-bold uppercase tracking-wider ${sub.liberoGhosts.has(gridIdx) ? 'text-emerald-400/70' : 'text-white/55'}`}
                    style={{ fontSize: '3.15vmin', letterSpacing: '0.18em' }}
                  >
                    {sub.ghosts[gridIdx]}
                  </span>
                </div>
              )}
              {/* Libero swap trail — emerald shimmer sweep (#8) */}
              {sub.liberoGhosts.has(gridIdx) && (
                <div className="libero-swap-trail absolute inset-0 pointer-events-none z-[15]" />
              )}
              {/* Rotation ghost — previous jersey expands/blurs out during sweep (#7) */}
              {rot.ghosts?.[gridIdx]?.jersey !== undefined && rot.rotating && (
                <div className="rotation-ghost-exit absolute inset-0 pointer-events-none z-[12] flex items-center justify-center">
                  <span className="font-black text-white/20" style={{ fontSize: '7vmin' }}>
                    {rot.ghosts[gridIdx].jersey}
                  </span>
                </div>
              )}
            </div>
          );
        })}

        {/* #2 Net flash line — sits at the boundary between front and back rows */}
        {anim.netFlash > 0 && (
          <div
            key={anim.netFlash}
            className="net-flash-line absolute left-0 right-0 pointer-events-none z-20"
            style={{
              top: 'calc(50% - 2px)',
              height: '4px',
              background: 'linear-gradient(to right, transparent 0%, #f97316 15%, #fff8 50%, #f97316 85%, transparent 100%)',
              boxShadow: '0 0 10px 3px rgba(249,115,22,0.55)',
            }}
          />
        )}

        {/* Block hands — rise above the net on a block */}
        {anim.blockHandsKey > 0 && <BlockHands blockKey={anim.blockHandsKey} />}

        {/* #12 Court lines draw-in — one-shot SVG on mount */}
        {showCourtDraw && (
          <svg
            className="court-draw-overlay absolute inset-0 w-full h-full pointer-events-none z-30"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {/* Center horizontal — net boundary */}
            <line x1="0%" y1="50%" x2="100%" y2="50%"
              stroke="#f97316" strokeWidth="2.5" opacity="0.65"
              className="court-line-h"
              style={{ animationDelay: '80ms' }}
            />
            {/* Left vertical divider */}
            <line x1="33.33%" y1="0%" x2="33.33%" y2="100%"
              stroke="#f97316" strokeWidth="1" opacity="0.35"
              className="court-line-v"
              style={{ animationDelay: '260ms' }}
            />
            {/* Right vertical divider */}
            <line x1="66.66%" y1="0%" x2="66.66%" y2="100%"
              stroke="#f97316" strokeWidth="1" opacity="0.35"
              className="court-line-v"
              style={{ animationDelay: '380ms' }}
            />
          </svg>
        )}
      </div>

      {/* #1 Ball arc — fixed overlay, outside grid so it flies across the full viewport */}
      {anim.ballArc && (
        <BallArc key={anim.ballArc.key} startX={anim.ballArc.x} startY={anim.ballArc.y} />
      )}

      {/* #4 Kill burst — volleyball emojis scatter */}
      {anim.killBurst && (
        <KillBurst key={anim.killBurst.key} x={anim.killBurst.x} y={anim.killBurst.y} />
      )}

      {/* Kill firework — colored dots from K button area */}
      {anim.killFirework && (
        <KillFirework key={anim.killFirework.key} x={anim.killFirework.x} y={anim.killFirework.y} />
      )}

      {/* Kill badge — "KILL" rises from K button like DIME */}
      {anim.killBadge && (
        <KillBadge key={anim.killBadge.key} x={anim.killBadge.x} y={anim.killBadge.y} />
      )}

      {/* Ace celebration — gold ring + ACE text */}
      {anim.aceCeleb && (
        <AceCelebration key={anim.aceCeleb.key} x={anim.aceCeleb.x} y={anim.aceCeleb.y} />
      )}

      {/* Perfect pass badge — "3!" pops above tile */}
      {anim.perfectPassBadge && (
        <PerfectPassBadge key={anim.perfectPassBadge.key} x={anim.perfectPassBadge.x} y={anim.perfectPassBadge.y} />
      )}
    </>
  );
});
