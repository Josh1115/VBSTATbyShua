import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useMatchStore } from '../../store/matchStore';
import { useUiStore } from '../../store/uiStore';
import { useShallow } from 'zustand/react/shallow';
import { ACTION, RESULT, SERVE_TYPE, SIDE } from '../../constants';
import { getStorageItem, STORAGE_KEYS } from '../../utils/storage';
import { fmtPlayerName } from '../../stats/formatters';

// ── Module-level style constants — defined once, never re-created on render ──
const JERSEY_SVG_STYLE = { width: '121%', height: '3.025vmin', top: '50%', left: '-10.5%', transform: 'translateY(-50%)' };
const NAME_STYLE       = { fontSize: '3.15vmin', letterSpacing: '0.06em', fontFamily: 'ui-rounded, system-ui, sans-serif' };
const BADGE_POS_STYLE  = { bottom: '36%', left: '50%' };
const DELAY_50         = { animationDelay: '50ms' };
const DELAY_100        = { animationDelay: '100ms' };

// Pre-built pass badge text styles (one per rating) — avoids recreating every render
const PASS_BADGE_STYLES = [
  { background: 'rgba(0,0,0,0.82)', color: '#f87171', fontWeight: 900, fontSize: '2.2vmin', fontFamily: 'ui-rounded, system-ui, sans-serif', letterSpacing: '0.04em', padding: '1px 5px', borderRadius: '5px', boxShadow: '0 0 7px #f8717155', whiteSpace: 'nowrap' },
  { background: 'rgba(0,0,0,0.82)', color: '#fb923c', fontWeight: 900, fontSize: '2.2vmin', fontFamily: 'ui-rounded, system-ui, sans-serif', letterSpacing: '0.04em', padding: '1px 5px', borderRadius: '5px', boxShadow: '0 0 7px #fb923c55', whiteSpace: 'nowrap' },
  { background: 'rgba(0,0,0,0.82)', color: '#facc15', fontWeight: 900, fontSize: '2.2vmin', fontFamily: 'ui-rounded, system-ui, sans-serif', letterSpacing: '0.04em', padding: '1px 5px', borderRadius: '5px', boxShadow: '0 0 7px #facc1555', whiteSpace: 'nowrap' },
];

// Restart a CSS animation on a DOM element without re-rendering.
// RAF avoids forced synchronous reflow (void el.offsetWidth pattern).
function flashEl(el, cls = 'btn-flash') {
  if (!el) return;
  el.classList.remove(cls);
  requestAnimationFrame(() => el.classList.add(cls));
}

// Generic full-fill tap button
const Btn = memo(function Btn({ label, onTap, cls, style }) {
  const ref = useRef(null);
  return (
    <button
      ref={ref}
      style={style}
      onPointerDown={(e) => { e.preventDefault(); onTap?.(); flashEl(ref.current); }}
      className={`flex-1 flex items-center justify-center text-[2.5vmin] font-bold leading-none select-none
        rounded-md active:brightness-75 transition-none ${cls}`}
    >
      {label}
    </button>
  );
});

const PASS_ANIM = ['pass-btn-shake', 'pass-btn-thud', 'pass-btn-pop', 'pass-btn-bounce'];
const PassBtn = memo(function PassBtn({ rating, label, onTap, cls }) {
  const ref = useRef(null);
  return (
    <button
      ref={ref}
      onPointerDown={(e) => { e.preventDefault(); onTap?.(); flashEl(ref.current, PASS_ANIM[rating]); }}
      className={`flex-1 flex items-center justify-center text-[2.5vmin] font-bold leading-none select-none rounded-md transition-none ${cls}`}
    >
      {label}
    </button>
  );
});

// Serve chord button — shows serve-type tag above outcome label in a single tap
const ServeBtn = memo(function ServeBtn({ typeLabel, outcomeLabel, onTap, cls }) {
  const ref = useRef(null);
  return (
    <button
      ref={ref}
      onPointerDown={(e) => { e.preventDefault(); onTap?.(); flashEl(ref.current); }}
      className={`flex-1 flex flex-col items-center justify-center leading-none select-none
        rounded-md active:brightness-75 transition-none gap-px ${cls}`}
    >
      <span className="text-[1.7vmin] opacity-60 font-semibold">{typeLabel}</span>
      <span className="text-[2.5vmin] font-bold">{outcomeLabel}</span>
    </button>
  );
});

const JERSEY_HEX = {
  'black': '#111827',
  'white': '#f8fafc',
  'blue':  '#1d4ed8',
  'gray':  '#94a3b8',
};

export const PlayerTile = memo(function PlayerTile({ slot, position, isServer, heat, stats, zoneHints, isSubIn = false, isDimmed = false }) {
  const {
    recordContact, addPoint, tapHblk, recordOppBlock,
    pendingHblk, serveSide, rallyPhase,
    liberoId, playerNicknames, teamJerseyColor, liberoJerseyColor,
    rallyCount, rotationNum,
  } = useMatchStore(useShallow((s) => ({
    recordContact:     s.recordContact,
    addPoint:          s.addPoint,
    tapHblk:           s.tapHblk,
    recordOppBlock:    s.recordOppBlock,
    pendingHblk:       s.pendingHblk,
    serveSide:         s.serveSide,
    rallyPhase:        s.rallyPhase,
    liberoId:          s.liberoId,
    playerNicknames:   s.playerNicknames,
    teamJerseyColor:   s.teamJerseyColor,
    liberoJerseyColor: s.liberoJerseyColor,
    rallyCount:        s.rallyCount,
    rotationNum:       s.rotationNum,
  })));

  const showToast    = useUiStore((s) => s.showToast);

  const isLibero     = slot?.playerId && slot.playerId === liberoId;
  const jerseyColor  = isLibero ? liberoJerseyColor : teamJerseyColor;
  const jerseyHex    = JERSEY_HEX[jerseyColor] ?? JERSEY_HEX['black'];
  const numberColor  = (jerseyColor === 'gray' || jerseyColor === 'white') ? '#1e293b' : '#f1f5f9';
  const jerseyRef   = useRef(null);
  const [serveType,     setServeType]     = useState(null);
  const [serveRecorded, setServeRecorded] = useState(false);
  const [sePending,     setSePending]     = useState(false);
  const [aePending,     setAePending]     = useState(false);
  const [passRing,      setPassRing]      = useState(null); // null | 0|1|2|3
  const [passBadge,     setPassBadge]     = useState(null); // null | { rating, key }
  const passRingTimer  = useRef(null);
  const passBadgeTimer = useRef(null);

  useEffect(() => () => { clearTimeout(passRingTimer.current); clearTimeout(passBadgeTimer.current); }, []);

  useEffect(() => {
    setServeRecorded(false);
    setServeType(null);
    setSePending(false);
    setAePending(false);
  }, [rallyCount, serveSide]);

  // When UNDO reverses a serve contact, rallyPhase returns to 'pre_serve' but
  // rallyCount and serveSide are unchanged (contacts don't affect them), so the
  // effect above doesn't fire. This effect catches that transition explicitly.
  useEffect(() => {
    if (rallyPhase === 'pre_serve') {
      setServeRecorded(false);
      setServeType(null);
      setSePending(false);
      setAePending(false);
    }
  }, [rallyPhase]);

  const isServing = serveSide === SIDE.US;
  const showServeRow = isServer && isServing && !serveRecorded;

  const flashJersey = () => flashEl(jerseyRef.current, 'jersey-pop');

  const vibrate = (pattern) => navigator.vibrate?.(pattern);

  const tap = (action, result, extra = {}) => {
    flashJersey();
    recordContact({ player_id: slot.playerId, action, result, ...extra })
      .catch((err) => { console.error('[VBStat] tap recordContact failed:', err); showToast(`Recording error: ${err?.message ?? err}`, 'error'); });
  };

  const tapAndScore = async (action, result, extra = {}) => {
    flashJersey();
    if (action === ACTION.ATTACK && result === RESULT.KILL)  vibrate(30);
    else if (action === ACTION.SERVE  && result === RESULT.ACE)  vibrate([18, 25, 45]);
    else if (action === ACTION.BLOCK  && result === RESULT.SOLO) vibrate(45);
    // Read fresh state at tap time (not stale render-time value) so the contact
    // lands in the correct rally bucket even if state changed since last render.
    const currentRally = useMatchStore.getState().rallyCount;
    addPoint(SIDE.US);
    try {
      return await recordContact({ player_id: slot.playerId, action, result, rally_number: currentRally, ...extra });
    } catch (err) {
      console.error('[VBStat] tapAndScore recordContact failed:', err);
      showToast(`Stat not recorded: ${err?.message ?? err}`, 'error');
    }
  };

  const tapAndScoreThem = async (action, result, extra = {}) => {
    flashJersey();
    const currentRally = useMatchStore.getState().rallyCount;
    addPoint(SIDE.THEM);
    try {
      await recordContact({ player_id: slot.playerId, action, result, rally_number: currentRally, ...extra });
    } catch (err) {
      console.error('[VBStat] tapAndScoreThem recordContact failed:', err);
      showToast(`Stat not recorded: ${err?.message ?? err}`, 'error');
    }
  };

  const handleAeBlocked = async () => {
    flashJersey();
    const currentRally = useMatchStore.getState().rallyCount;
    addPoint(SIDE.THEM);
    try {
      const aeId = await recordContact({ player_id: slot.playerId, action: ACTION.ATTACK, result: RESULT.ERROR, error_type: 'blk', rally_number: currentRally });
      recordOppBlock(aeId);
    } catch (err) {
      console.error('[VBStat] handleAeBlocked recordContact failed:', err);
      showToast(`Stat not recorded: ${err?.message ?? err}`, 'error');
    }
  };

  const tapPass = (rating, scoreThem = false) => {
    if (scoreThem) tapAndScoreThem(ACTION.PASS, String(rating));
    else           tap(ACTION.PASS, String(rating));
    clearTimeout(passRingTimer.current);
    setPassRing(rating);
    passRingTimer.current = setTimeout(() => setPassRing(null), 520);
    if (rating < 3) {
      clearTimeout(passBadgeTimer.current);
      setPassBadge({ rating, key: Date.now() });
      passBadgeTimer.current = setTimeout(() => setPassBadge(null), 750);
    }
  };

  // HBLK visual state for this tile
  const hblkState = !pendingHblk
    ? 'normal'
    : pendingHblk.playerId === slot?.playerId
      ? 'mine'      // this player tapped first — waiting for partner
      : 'partner';  // another player tapped — tap here to complete

  if (!slot?.playerId) {
    return (
      <div className="flex flex-col h-full w-full items-center justify-center bg-slate-900/40 border border-slate-800/60">
        <span className="text-slate-600 text-xs font-bold">S{position}</span>
        <span className="text-slate-700 text-[1.2vmin]">empty</span>
      </div>
    );
  }

  const heatVals  = Object.values(heat ?? {}).filter(Boolean);
  let hotCount = 0, coldCount = 0;
  for (const v of heatVals) { if (v === 'hot') hotCount++; else if (v === 'cold') coldCount++; }
  const tileHeat  = hotCount > coldCount ? 'hot' : coldCount > hotCount ? 'cold' : null;

  // Position color for left-border on badge strip
  const POS_BORDER = {
    S:   'rgba(59,130,246,0.75)',
    OH:  'rgba(249,115,22,0.75)',
    MB:  'rgba(34,197,94,0.75)',
    OPP: 'rgba(168,85,247,0.75)',
    L:   'rgba(52,211,153,0.75)',
    DS:  'rgba(148,163,184,0.55)',
  };
  const posBorderColor = POS_BORDER[slot?.positionLabel] ?? null;

  const nameFormat = useMemo(
    () => getStorageItem(STORAGE_KEYS.PLAYER_NAME_FORMAT, 'initial_last'),
    []
  );

  const tileStats = useMemo(() => {
    const s = stats;
    if (!s) return { k: 0, ace: 0, se: 0, dig: 0, blk: 0, ae: 0, apr: null };
    return {
      k: s.k, ace: s.ace, se: s.se, dig: s.dig,
      blk: s.bs + s.ba,
      ae: s.ae,
      apr: s.apr != null ? s.apr.toFixed(1) : null,
    };
  }, [stats]);

  const passRingClass = passRing === 0 ? 'pass-ring-0'
    : passRing === 1 ? 'pass-ring-1'
    : passRing === 2 ? 'pass-ring-2'
    : passRing === 3 ? 'pass-ring-3'
    : '';

  const topZoneStr = useMemo(() => {
    if (!zoneHints) return null;
    const sorted = Object.entries(zoneHints).sort((a, b) => b[1] - a[1]).slice(0, 2);
    if (!sorted.length) return null;
    return sorted.map(([z]) => `Z${z}`).join(' · ');
  }, [zoneHints]);

  const tileBg = isServer ? 'bg-orange-950/30' : 'bg-slate-900';
  const tileBorder = isLibero
    ? 'border-dashed'
    : tileHeat === 'hot'  ? 'border-orange-400/40'
    : tileHeat === 'cold' ? 'border-blue-400/30'
    : 'border-slate-800/60';
  const tileShadow = !isLibero && tileHeat === 'hot'  ? 'shadow-[inset_0_0_12px_rgba(251,146,60,0.08)]'
    : !isLibero && tileHeat === 'cold' ? 'shadow-[inset_0_0_12px_rgba(96,165,250,0.06)]'
    : '';
  // Libero tile overlay — memoized so new object isn't created on every render
  const tileStyle = useMemo(() => isLibero ? {
    backgroundColor: `${jerseyHex}26`,
    borderColor:     `${jerseyHex}80`,
    boxShadow:       `inset 0 0 14px ${jerseyHex}1a`,
  } : undefined, [isLibero, jerseyHex]);

  // Libero "L" badge dot style — memoized for same reason
  const lBadgeStyle  = useMemo(() => ({ width: '2.1vmin', height: '2.1vmin', backgroundColor: jerseyHex }), [jerseyHex]);
  const lNumberStyle = useMemo(() => ({ fontSize: '1.1vmin', color: numberColor }), [numberColor]);

  return (
    <div className={`relative flex flex-col h-full w-full overflow-hidden border
      ${tileBg} ${tileBorder} ${tileShadow} ${passRingClass}`}
      style={tileStyle}>
      {isDimmed && (
        <div className="absolute inset-0 bg-slate-900/55 pointer-events-none z-10 first-contact-overlay" />
      )}
      {/* Libero "L" badge — top-left corner pill */}
      {isLibero && (
        <div className="absolute top-0.5 left-0.5 z-20 flex items-center justify-center rounded-full"
          style={lBadgeStyle}>
          <span className="font-black leading-none" style={lNumberStyle}>L</span>
        </div>
      )}
      {passBadge !== null && (
        <div
          key={passBadge.key}
          className="pass-badge-float absolute z-20"
          style={BADGE_POS_STYLE}
        >
          <div style={PASS_BADGE_STYLES[passBadge.rating]}>
            {['ERROR', '1', '2'][passBadge.rating]}
          </div>
        </div>
      )}

      {/* ── Player badge strip ── */}
      <div
        className="flex-[8_1_0%] min-h-[0.2275vmin] relative flex items-center justify-center px-2 bg-black/40 border-b border-slate-700/50 overflow-hidden"
        style={posBorderColor ? { borderLeft: `2px solid ${posBorderColor}` } : undefined}
      >

        {/* ── Left: jersey icon ── */}
        <div className="absolute left-2 flex items-center gap-1">
          <span className="text-[1.4875vmin] font-bold uppercase whitespace-nowrap leading-none text-slate-200">
            <span className="relative inline-flex items-center px-3">
              <svg
                aria-hidden
                className="pointer-events-none absolute"
                style={JERSEY_SVG_STYLE}
                viewBox="0 0 100 80"
                preserveAspectRatio="xMidYMid meet"
                fill={jerseyHex}
                stroke={jerseyColor === 'black' ? '#ffffff' : jerseyColor === 'white' ? '#94a3b8' : jerseyHex}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.75"
              >
                <path d="M30 4Q50 18 70 4L96 17 86 36H77V77H23V36H14L4 17Z" />
              </svg>
              <span ref={jerseyRef} className="relative" style={{ fontSize: '1.125em', color: numberColor }}>{slot.jersey}</span>
            </span>
          </span>
        </div>

        {/* ── Center: player name ── */}
        <span className={`font-semibold uppercase whitespace-nowrap leading-none text-slate-200${isSubIn ? ' sub-name-enter' : ''}`}>
          <span style={NAME_STYLE}>{fmtPlayerName(slot.playerName, playerNicknames[slot.playerId] ?? '', nameFormat)}</span>
        </span>
        <div className="absolute right-2 flex items-center gap-1">
          {slot.positionLabel && (
            <span className={`text-[1.7vmin] font-bold leading-none ${isServer ? 'text-orange-400' : 'text-slate-500'}`}>
              {slot.positionLabel}
            </span>
          )}
          <span className={`text-[1.7vmin] font-bold leading-none border rounded px-1 py-0.5 ${isServer ? 'text-orange-400 border-orange-500/60' : 'text-slate-500 border-slate-700'}`}>
            S{((rotationNum + (slot.position ?? 1) - 2) % 6) + 1}
          </span>
        </div>
      </div>

      {/* ── Live stats bar ── */}
      {(() => {
        const s = tileStats;
        const h = heat ?? {};
        const chips = [
          { val: s.k,   label: 'K',   cls: 'text-orange-400', heatKey: h.attack },
          { val: s.ace, label: 'ACE', cls: 'text-emerald-400', heatKey: h.serve  },
          { val: s.dig, label: 'DIG', cls: 'text-sky-400',     heatKey: h.dig    },
          ...(s.blk  > 0 ? [{ val: s.blk,  label: 'BLK', cls: 'text-blue-400', heatKey: h.block }] : []),
          ...(s.se   > 0 ? [{ val: s.se,   label: 'SE',  cls: 'text-red-400',  heatKey: s.se > s.ace ? 'cold' : null }] : []),
          ...(s.ae   > 0 ? [{ val: s.ae,   label: 'AE',  cls: 'text-rose-400', heatKey: s.ae > s.k   ? 'cold' : null }] : []),
          ...(s.apr !== null ? [{ val: s.apr, label: 'APR', cls: 'text-teal-400', heatKey: h.pass }] : []),
        ];
        return (
          <div className="flex-[4.5_1_0%] flex items-center justify-center px-2 gap-x-3 bg-black/25 border-b border-slate-700/40 overflow-hidden flex-wrap">
            {chips.map(({ val, label, cls, heatKey }) => (
              <span key={`${label}-${val}`} className={`text-[2.1vmin] font-bold leading-none whitespace-nowrap stat-chip-bump ${cls}`}>
                {val} {label}{heatKey === 'hot' ? ' 🔥' : heatKey === 'cold' ? ' 🧊' : ''}
              </span>
            ))}
          </div>
        );
      })()}

      {/* ── Button rows ── */}
      <div className="flex flex-col flex-none gap-[0.125px]">

        {/* Serve outcome row — FL / TS / ATT / ACE / SE — only visible when this player is serving */}
        {showServeRow && (
          <div className="serve-row-in">
            <div className="px-[7.5%] flex items-center justify-between">
              <span className={`text-[1.3vmin] font-bold uppercase tracking-wide leading-none ${sePending ? 'text-red-300' : 'text-slate-500'}`}>
                {sePending ? 'Serve Error — OB, Net, or Foot?' : 'Serving'}
              </span>
              {!sePending && topZoneStr && (
                <span className="text-[1.2vmin] font-bold text-amber-400/80 leading-none">★ {topZoneStr}</span>
              )}
            </div>
            <div className="flex flex-none h-[3.837vmin] py-0 px-[7.5%] gap-[0.5vmin] border-b border-black/30">
              {sePending ? (
                <>
                  <Btn label="×"
                    onTap={() => setSePending(false)}
                    cls="bg-slate-700 text-slate-300 hover:bg-slate-600" />
                  <Btn label="OB"
                    onTap={() => { tapAndScoreThem(ACTION.SERVE, RESULT.ERROR, { serve_type: serveType, error_type: 'ob' }); setServeRecorded(true); setSePending(false); }}
                    cls="bg-red-900/80 text-red-200 hover:bg-red-800/90 serve-unlock-btn" />
                  <Btn label="NET"
                    onTap={() => { tapAndScoreThem(ACTION.SERVE, RESULT.ERROR, { serve_type: serveType, error_type: 'net' }); setServeRecorded(true); setSePending(false); }}
                    cls="bg-rose-950/80 text-rose-300 hover:bg-rose-900/80 serve-unlock-btn"
                    style={DELAY_50} />
                  <Btn label="FOOT"
                    onTap={() => { tapAndScoreThem(ACTION.SERVE, RESULT.ERROR, { serve_type: serveType, error_type: 'foot' }); setServeRecorded(true); setSePending(false); }}
                    cls="bg-amber-950/80 text-amber-300 hover:bg-amber-900/80 serve-unlock-btn"
                    style={DELAY_100} />
                </>
              ) : (
                <>
                  <Btn label="FLOAT"
                    onTap={() => setServeType(SERVE_TYPE.FLOAT)}
                    cls={serveType === SERVE_TYPE.FLOAT ? 'bg-emerald-700/80 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'} />
                  <Btn label="TOP"
                    onTap={() => setServeType(SERVE_TYPE.TOPSPIN)}
                    cls={serveType === SERVE_TYPE.TOPSPIN ? 'bg-teal-600/80 text-white' : 'bg-violet-900/70 text-violet-400 hover:bg-violet-800/70'} />
                  <Btn key={`att-${!!serveType}`} label="ATT"
                    onTap={serveType ? () => { tap(ACTION.SERVE, RESULT.IN, { serve_type: serveType }); setServeRecorded(true); } : undefined}
                    cls={`${!serveType ? 'bg-slate-800/40 text-slate-700 cursor-not-allowed pointer-events-none'
                      : serveType === SERVE_TYPE.FLOAT ? 'bg-emerald-950/80 text-emerald-300 hover:bg-emerald-900/80'
                      : 'bg-teal-950/80 text-teal-300 hover:bg-teal-900/80'}${serveType ? ' serve-unlock-btn' : ''}`} />
                  <Btn key={`ace-${!!serveType}`} label="ACE"
                    onTap={serveType ? () => { tapAndScore(ACTION.SERVE, RESULT.ACE, { serve_type: serveType }); setServeRecorded(true); } : undefined}
                    cls={`${!serveType ? 'bg-slate-800/40 text-slate-700 cursor-not-allowed pointer-events-none'
                      : serveType === SERVE_TYPE.FLOAT ? 'bg-emerald-700/80 text-white hover:bg-emerald-600/90'
                      : 'bg-teal-600/80 text-white hover:bg-teal-500/90'}${serveType ? ' serve-unlock-btn' : ''}`}
                    style={serveType ? { animationDelay: '50ms' } : undefined} />
                  <Btn key={`se-${!!serveType}`} label="SE"
                    onTap={serveType ? () => setSePending(true) : undefined}
                    cls={`${!serveType ? 'bg-slate-800/40 text-slate-700 cursor-not-allowed pointer-events-none' : 'bg-red-950/80 text-red-300 hover:bg-red-900/80'}${serveType ? ' serve-unlock-btn' : ''}`}
                    style={serveType ? { animationDelay: '100ms' } : undefined} />
                </>
              )}
            </div>
          </div>
        )}

        {/* Row 2 — Attack: ATT K AE (or AE reason sub-panel: OB / NET / BLK) */}
        <div className="px-[7.5%]">
          <span className={`text-[1.3vmin] font-bold uppercase tracking-wide leading-none ${aePending ? 'text-red-300' : 'text-slate-500'}`}>
            {aePending ? 'Attack Error — OB, NET, or Blocked?' : 'Hitting'}
          </span>
        </div>
        <div className="flex flex-none h-[3.837vmin] py-0 px-[7.5%] gap-[0.5vmin] border-b border-black/30">
          {aePending ? (
            <>
              <Btn label="×"
                onTap={() => setAePending(false)}
                cls="bg-slate-700 text-slate-300 hover:bg-slate-600" />
              <Btn label="OB"
                onTap={() => { tapAndScoreThem(ACTION.ATTACK, RESULT.ERROR, { error_type: 'ob' }); setAePending(false); }}
                cls="bg-red-900/80 text-red-200 hover:bg-red-800/90 serve-unlock-btn" />
              <Btn label="NET"
                onTap={() => { tapAndScoreThem(ACTION.ATTACK, RESULT.ERROR, { error_type: 'net' }); setAePending(false); }}
                cls="bg-rose-950/80 text-rose-300 hover:bg-rose-900/80 serve-unlock-btn"
                style={DELAY_50} />
              <Btn label="BLK"
                onTap={() => { handleAeBlocked(); setAePending(false); }}
                cls="bg-blue-900/80 text-blue-200 hover:bg-blue-800/90 serve-unlock-btn"
                style={DELAY_100} />
            </>
          ) : (
            <>
              <Btn label="ATT"
                onTap={() => tap(ACTION.ATTACK, RESULT.ATTEMPT)}
                cls="bg-orange-950/80 text-orange-200 hover:bg-orange-900/80" />
              <Btn label="K"
                onTap={() => tapAndScore(ACTION.ATTACK, RESULT.KILL)}
                cls="bg-orange-600/80 text-white hover:bg-orange-500/90" />
              <Btn label="AE"
                onTap={() => setAePending(true)}
                cls="bg-red-950/80 text-red-300 hover:bg-red-900/80" />
            </>
          )}
        </div>

        {/* Row 3 — Defense: DIG FREE SBLK HBLK */}
        <div className="px-[7.5%]"><span className="text-[1.3vmin] font-bold uppercase tracking-wide text-slate-500 leading-none">Defense</span></div>
        <div className="flex flex-none h-[3.837vmin] py-0 px-[7.5%] gap-[0.5vmin] border-b border-black/30">
          <Btn label="DIG"
            onTap={() => tap(ACTION.DIG, RESULT.SUCCESS)}
            cls="bg-sky-950/80 text-sky-300 hover:bg-sky-900/80" />
          <Btn label="FREE"
            onTap={() => tap(ACTION.DIG, RESULT.FREEBALL)}
            cls="bg-cyan-950/80 text-cyan-300 hover:bg-cyan-900/80" />
          <Btn label="SBLK"
            onTap={() => tapAndScore(ACTION.BLOCK, RESULT.SOLO)}
            cls="bg-blue-950/80 text-blue-300 hover:bg-blue-900/80" />
          <Btn
            label={hblkState === 'mine' ? 'HBLK●' : hblkState === 'partner' ? 'HBLK✓' : 'HBLK'}
            onTap={() => { flashJersey(); vibrate(hblkState === 'partner' ? 45 : 15); tapHblk(slot.playerId); }}
            cls={
              hblkState === 'mine'
                ? 'bg-amber-500 text-white animate-pulse'
                : hblkState === 'partner'
                  ? 'bg-emerald-500 text-white'
                  : 'bg-indigo-950/80 text-indigo-300 hover:bg-indigo-900/80'
            }
          />
        </div>

        {/* Row 4 — Pass ratings: 0 1 2 3 */}
        <div className="px-[7.5%]"><span className="text-[1.3vmin] font-bold uppercase tracking-wide text-slate-500 leading-none">S/R</span></div>
        <div className="flex flex-none h-[3.837vmin] py-0 px-[7.5%] gap-[0.5vmin] border-b border-black/30">
          <PassBtn rating={0} label="0" onTap={() => tapPass(0, true)}  cls="bg-red-950/80 text-red-300" />
          <PassBtn rating={1} label="1" onTap={() => tapPass(1, false)} cls="bg-yellow-950/80 text-yellow-300" />
          <PassBtn rating={2} label="2" onTap={() => tapPass(2, false)} cls="bg-lime-950/80 text-lime-300" />
          <PassBtn rating={3} label="3" onTap={() => tapPass(3, false)} cls="bg-teal-900/80 text-teal-200" />
        </div>

        {/* Row 5 — Penalty errors: L DBL NET BHE (opponent scores) */}
        <div className="px-[7.5%]"><span className="text-[1.3vmin] font-bold uppercase tracking-wide text-slate-500 leading-none">Errors</span></div>
        <div className="flex flex-none h-[3.837vmin] py-0 px-[7.5%] gap-[0.5vmin]">
          <Btn label="L"   onTap={() => tapAndScoreThem(ACTION.ERROR, RESULT.LIFT)}                    cls="bg-rose-950/60 text-rose-300 border border-rose-800/50 hover:bg-rose-900/70" />
          <Btn label="DBL" onTap={() => tapAndScoreThem(ACTION.ERROR, RESULT.DOUBLE)}                  cls="bg-rose-950/60 text-rose-300 border border-rose-800/50 hover:bg-rose-900/70" />
          <Btn label="NET" onTap={() => tapAndScoreThem(ACTION.ERROR, RESULT.NET_TOUCH)}               cls="bg-rose-950/60 text-rose-300 border border-rose-800/50 hover:bg-rose-900/70" />
          <Btn label="BHE" onTap={() => tapAndScoreThem(ACTION.SET,               RESULT.BALL_HANDLING_ERROR)} cls="bg-rose-950/60 text-rose-300 border border-rose-800/50 hover:bg-rose-900/70" />
          <Btn label="FBE" onTap={() => tapAndScoreThem(ACTION.FREEBALL_RECEIVE,  RESULT.FREE_BALL_ERROR)}     cls="bg-rose-950/60 text-rose-300 border border-rose-800/50 hover:bg-rose-900/70" />
        </div>

      </div>
    </div>
  );
});
