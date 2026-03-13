import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useMatchStore } from '../../store/matchStore';
import { ACTION, RESULT } from '../../constants';
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
  // Pass: hot = APR ≥ 2.3, cold = APR ≤ 1.25, min 3 passes
  let pass = null;
  if (a.pasN >= 3) {
    const apr = a.pasSum / a.pasN;
    if (apr >= 2.3)       pass = 'hot';
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

// #4 Kill / Ace burst — 8 particles radiate from contact point
function KillBurst({ x, y, isAce }) {
  const color = isAce ? '#f59e0b' : '#f97316';
  return (
    <div className="fixed pointer-events-none z-[998]" style={{ left: x, top: y }}>
      {Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const dist  = 38 + (i % 2) * 18;
        return (
          <div
            key={i}
            className="kill-burst-dot"
            style={{
              '--dx': `${Math.cos(angle) * dist}px`,
              '--dy': `${Math.sin(angle) * dist}px`,
              background: color,
              animationDelay: `${i * 16}ms`,
            }}
          />
        );
      })}
    </div>
  );
}

export const CourtGrid = memo(function CourtGrid() {
  const lineup            = useMatchStore((s) => s.lineup);
  const committedContacts = useMatchStore((s) => s.committedContacts);
  const currentSetId      = useMatchStore((s) => s.currentSetId);
  const rallyPhase        = useMatchStore((s) => s.rallyPhase);
  const serveSide         = useMatchStore((s) => s.serveSide);
  const rotationNum       = useMatchStore((s) => s.rotationNum);
  const liberoId          = useMatchStore((s) => s.liberoId);

  const inRally        = rallyPhase === 'in_rally';
  const inServeReceive = serveSide === 'them' && !inRally;

  // #1 Ball arc
  const [ballArc,       setBallArc]       = useState(null); // { key, x, y } | null
  // #4 Kill/ace burst
  const [killBurst,     setKillBurst]     = useState(null); // { key, x, y, isAce } | null
  // #2 Net flash
  const [netFlash,      setNetFlash]      = useState(0);
  // #7 Libero ghosts — grid indices where the outgoing player was the libero
  const [liberoGhosts,  setLiberoGhosts]  = useState(new Set());
  // #7 Rotation ghosts — pre-rotation cell snapshot for ghost fade-out during sweep
  const [rotationGhosts, setRotationGhosts] = useState(null);
  // #12 Court draw-in — one-shot on mount
  const [showCourtDraw, setShowCourtDraw] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShowCourtDraw(false), 1500);
    return () => clearTimeout(t);
  }, []);

  // Combined contact watcher — fires on new non-opponent contacts
  const prevContactsLenRef = useRef(0);
  const arcTimerRef = useRef(null);
  useEffect(() => {
    const len = committedContacts.length;
    if (len <= prevContactsLenRef.current) return;
    prevContactsLenRef.current = len;
    const c = committedContacts[len - 1];
    if (!c || c.opponent_contact) return;

    // #1 Ball arc + #4 Kill/Ace burst on ACE or KILL
    if ((c.action === ACTION.SERVE  && c.result === RESULT.ACE) ||
        (c.action === ACTION.ATTACK && c.result === RESULT.KILL)) {
      const el = playerRefs.current[c.player_id];
      if (el) {
        const r   = el.getBoundingClientRect();
        const x   = r.left + r.width  * 0.5;
        const y   = r.top  + r.height * 0.5;
        const key = c.id ?? len;
        const isAce = c.action === ACTION.SERVE;
        setBallArc({ key, x, y });
        setKillBurst({ key, x, y, isAce });
        clearTimeout(arcTimerRef.current);
        arcTimerRef.current = setTimeout(() => { setBallArc(null); setKillBurst(null); }, 750);
      }
    }

    // #2 Net flash on BLOCK solo/assist or NET_TOUCH error
    if ((c.action === ACTION.BLOCK && (c.result === RESULT.SOLO || c.result === RESULT.ASSIST)) ||
        (c.action === ACTION.ERROR && c.result === RESULT.NET_TOUCH)) {
      setNetFlash((k) => k + 1);
    }
  }, [committedContacts]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rotation flash + #7 ghost — sweep clockwise, ghost previous jerseys fading out
  const [rotating, setRotating] = useState(false);
  const prevRotNumRef = useRef(rotationNum);
  useEffect(() => {
    if (prevRotNumRef.current !== rotationNum) {
      // Snapshot pre-rotation cells for ghost overlay (prevCellsRef still holds old cells here)
      setRotationGhosts(prevCellsRef.current ? [...prevCellsRef.current] : null);
      prevRotNumRef.current = rotationNum;
      setRotating(true);
      const t = setTimeout(() => { setRotating(false); setRotationGhosts(null); }, 600);
      return () => clearTimeout(t);
    }
  }, [rotationNum]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sub flash + sub ghost — detect which tile changed player without a rotation
  const [subFlashIds, setSubFlashIds] = useState(new Set());
  const [subGhosts,   setSubGhosts]   = useState({}); // { [gridIdx]: outgoingLastName }
  const prevCellsRef   = useRef(null);
  const prevRotForSub  = useRef(rotationNum);
  const subTimersRef   = useRef([]);

  const cells = useMemo(() =>
    inRally
      ? getBaseDisplayOrder(lineup)
      : inServeReceive
        ? getServeReceiveDisplayOrder(lineup)
        : GRID_ORDER.map((i) => lineup[i]),
    [lineup, inRally, inServeReceive]
  );

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
        setSubFlashIds(newIds);
        setSubGhosts(newGhosts);
        if (newLiberoIdxs.size > 0) setLiberoGhosts(newLiberoIdxs);
        subTimersRef.current.forEach(clearTimeout);
        subTimersRef.current = [
          setTimeout(() => setSubFlashIds(new Set()), 1100),
          setTimeout(() => setSubGhosts({}), 750),
          setTimeout(() => setLiberoGhosts(new Set()), 650),
        ];
      }
    }
    prevCellsRef.current = cells;
    prevRotForSub.current = rotationNum;
    return () => subTimersRef.current.forEach(clearTimeout);
  }, [cells, rotationNum, liberoId]); // eslint-disable-line react-hooks/exhaustive-deps

  // FLIP slide — animate tiles to new positions when display mode changes
  const playerRefs   = useRef({}); // { [playerId]: HTMLElement }
  const prevRectsRef = useRef({}); // { [playerId]: DOMRect }
  const prevModeRef  = useRef({ inRally, inServeReceive });

  useLayoutEffect(() => {
    const prevMode    = prevModeRef.current;
    const modeChanged = prevMode.inRally !== inRally || prevMode.inServeReceive !== inServeReceive;
    prevModeRef.current = { inRally, inServeReceive };

    if (modeChanged) {
      cells.forEach((slot) => {
        if (!slot?.playerId) return;
        const el       = playerRefs.current[slot.playerId];
        const prevRect = prevRectsRef.current[slot.playerId];
        if (!el || !prevRect) return;
        const newRect = el.getBoundingClientRect();
        const dx = prevRect.left - newRect.left;
        const dy = prevRect.top  - newRect.top;
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
          el.style.transition = 'none';
          el.style.transform  = `translate(${dx}px,${dy}px)`;
          void el.offsetWidth;
          el.style.transition = 'transform 220ms ease-out';
          el.style.transform  = '';
        }
      });
    }

    // Capture current natural rects for next transition
    cells.forEach((slot) => {
      if (!slot?.playerId) return;
      const el = playerRefs.current[slot.playerId];
      if (el) prevRectsRef.current[slot.playerId] = el.getBoundingClientRect();
    });
  // playerRefs and prevRectsRef are mutable refs — safe to read in layout effect
  // without listing as deps; [cells] is the only trigger we need
  }, [cells]); // eslint-disable-line react-hooks/exhaustive-deps

  // Single O(n) pass for all 6 players — avoids 6 separate contact scans per render
  const heatMap = useMemo(() => {
    const playerIds = cells.filter((slot) => slot?.playerId).map((slot) => slot.playerId);
    return computeAllHeat(committedContacts, playerIds, currentSetId);
  }, [cells, committedContacts, currentSetId]);

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
          const isSubFlash = subFlashIds.has(slot?.playerId);
          // #3 directional nudge replaces border-only tile-rotating
          const cellClass  = rotating
            ? `relative tile-rotate-${ROTATION_NUDGE[gridIdx]}`
            : isSubFlash ? 'relative tile-sub-flash' : 'relative';
          const cellStyle  = rotating ? { animationDelay: `${ROTATION_DELAYS[gridIdx]}ms` } : undefined;
          return (
            <div
              key={slot?.position ?? gridIdx}
              className={`${cellClass} overflow-hidden`}
              style={cellStyle}
              ref={(el) => { if (el && slot?.playerId) playerRefs.current[slot.playerId] = el; }}
            >
              <PlayerTile
                slot={slot}
                position={position}
                isServer={isServer}
                heat={heat}
                isSubIn={subFlashIds.has(slot?.playerId)}
                isDimmed={inServeReceive && gridIdx < 3}
              />
              {/* Sub swap slide — outgoing name falls down-and-blurs (#9) */}
              {subGhosts[gridIdx] && (
                <div className={`absolute top-0 inset-x-0 h-[42%] pointer-events-none flex items-center justify-center ${liberoGhosts.has(gridIdx) ? 'libero-ghost-exit' : 'sub-ghost-exit'}`}>
                  <span
                    className={`font-bold uppercase tracking-wider ${liberoGhosts.has(gridIdx) ? 'text-emerald-400/70' : 'text-white/55'}`}
                    style={{ fontSize: '3.15vmin', letterSpacing: '0.18em' }}
                  >
                    {subGhosts[gridIdx]}
                  </span>
                </div>
              )}
              {/* Libero swap trail — emerald shimmer sweep (#8) */}
              {liberoGhosts.has(gridIdx) && (
                <div className="libero-swap-trail absolute inset-0 pointer-events-none z-[15]" />
              )}
              {/* Rotation ghost — previous jersey expands/blurs out during sweep (#7) */}
              {rotationGhosts?.[gridIdx]?.jersey !== undefined && rotating && (
                <div className="rotation-ghost-exit absolute inset-0 pointer-events-none z-[12] flex items-center justify-center">
                  <span className="font-black text-white/20" style={{ fontSize: '7vmin' }}>
                    {rotationGhosts[gridIdx].jersey}
                  </span>
                </div>
              )}
            </div>
          );
        })}

        {/* #2 Net flash line — sits at the boundary between front and back rows */}
        {netFlash > 0 && (
          <div
            key={netFlash}
            className="net-flash-line absolute left-0 right-0 pointer-events-none z-20"
            style={{
              top: 'calc(50% - 2px)',
              height: '4px',
              background: 'linear-gradient(to right, transparent 0%, #f97316 15%, #fff8 50%, #f97316 85%, transparent 100%)',
              boxShadow: '0 0 10px 3px rgba(249,115,22,0.55)',
            }}
          />
        )}

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
      {ballArc && (
        <BallArc
          key={ballArc.key}
          startX={ballArc.x}
          startY={ballArc.y}
        />
      )}

      {/* #4 Kill/Ace burst — particles radiate from contact point */}
      {killBurst && (
        <KillBurst
          key={killBurst.key}
          x={killBurst.x}
          y={killBurst.y}
          isAce={killBurst.isAce}
        />
      )}
    </>
  );
});
