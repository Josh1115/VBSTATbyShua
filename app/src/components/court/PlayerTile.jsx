import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useMatchStore } from '../../store/matchStore';
import { ACTION, RESULT, SERVE_TYPE, SIDE } from '../../constants';

// Restart a CSS animation on a DOM element without re-rendering
function flashEl(el, cls = 'btn-flash') {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
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

function computePlayerStats(contacts, playerId, setId) {
  let k = 0, ace = 0, se = 0, dig = 0, blk = 0, ae = 0, pasSum = 0, pasN = 0;
  for (const c of contacts) {
    if (c.player_id !== playerId || c.set_id !== setId || c.opponent_contact) continue;
    const { action, result } = c;
    if (action === 'attack') {
      if (result === 'kill')  k++;
      if (result === 'error') ae++;
    } else if (action === 'serve') {
      if (result === 'ace')   ace++;
      if (result === 'error') se++;
    } else if (action === 'dig'   && (result === 'success' || result === 'freeball')) dig++;
    else if (action === 'block'   && (result === 'solo' || result === 'assist')) blk++;
    else if (action === 'pass') {
      const v = Number(result);
      if (!isNaN(v)) { pasSum += v; pasN++; }
    }
  }
  const apr = pasN > 0 ? (pasSum / pasN).toFixed(1) : null;
  return { k, ace, se, dig, blk, ae, apr, pasN };
}

const JERSEY_HEX = {
  'black': '#111827',
  'white': '#f8fafc',
  'blue':  '#1d4ed8',
  'gray':  '#94a3b8',
};

const fmtName = (name) => {
  if (!name) return '';
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0];
  return `${parts[0][0]}. ${parts[parts.length - 1]}`;
};

export const PlayerTile = memo(function PlayerTile({ slot, position, isServer, heat, isSubIn = false, isDimmed = false }) {
  const recordContact     = useMatchStore((s) => s.recordContact);
  const addPoint          = useMatchStore((s) => s.addPoint);
  const tapHblk           = useMatchStore((s) => s.tapHblk);
  const pendingHblk       = useMatchStore((s) => s.pendingHblk);
  const serveSide         = useMatchStore((s) => s.serveSide);
  const committedContacts = useMatchStore((s) => s.committedContacts);
  const currentSetId      = useMatchStore((s) => s.currentSetId);
  const liberoId            = useMatchStore((s) => s.liberoId);
  const teamJerseyColor     = useMatchStore((s) => s.teamJerseyColor);
  const liberoJerseyColor   = useMatchStore((s) => s.liberoJerseyColor);
  const rallyCount          = useMatchStore((s) => s.rallyCount);
  const rotationNum         = useMatchStore((s) => s.rotationNum);

  const isLibero     = slot?.playerId && slot.playerId === liberoId;
  const jerseyColor  = isLibero ? liberoJerseyColor : teamJerseyColor;
  const jerseyHex    = JERSEY_HEX[jerseyColor] ?? JERSEY_HEX['black'];
  const numberColor  = (jerseyColor === 'gray' || jerseyColor === 'white') ? '#1e293b' : '#f1f5f9';
  const jerseyRef   = useRef(null);
  const [serveType,     setServeType]     = useState(null);
  const [serveRecorded, setServeRecorded] = useState(false);
  const [passRing,      setPassRing]      = useState(null); // null | 0|1|2|3
  const [rippleKey,     setRippleKey]     = useState(0);
  const [rippleColor,   setRippleColor]   = useState(null);
  const passRingTimer = useRef(null);

  useEffect(() => {
    setServeRecorded(false);
    setServeType(null);
  }, [rallyCount]);

  const isServing = serveSide === SIDE.US;
  const showServeRow = isServer && isServing && !serveRecorded;

  const flashJersey = () => flashEl(jerseyRef.current, 'jersey-pop');

  const vibrate = (pattern) => navigator.vibrate?.(pattern);

  const tap = (action, result, extra = {}) => {
    flashJersey();
    return recordContact({ player_id: slot.playerId, action, result, ...extra });
  };

  const tapAndScore = async (action, result, extra = {}) => {
    flashJersey();
    if (action === ACTION.ATTACK && result === RESULT.KILL)  vibrate(30);
    else if (action === ACTION.SERVE  && result === RESULT.ACE)  vibrate([18, 25, 45]);
    else if (action === ACTION.BLOCK  && result === RESULT.SOLO) vibrate(45);
    await recordContact({ player_id: slot.playerId, action, result, ...extra });
    await addPoint(SIDE.US);
  };

  const tapAndScoreThem = async (action, result, extra = {}) => {
    flashJersey();
    await recordContact({ player_id: slot.playerId, action, result, ...extra });
    await addPoint(SIDE.THEM);
  };

  const RIPPLE_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e'];
  const tapPass = (rating, scoreThem = false) => {
    if (scoreThem) tapAndScoreThem(ACTION.PASS, String(rating));
    else           tap(ACTION.PASS, String(rating));
    clearTimeout(passRingTimer.current);
    setPassRing(rating);
    passRingTimer.current = setTimeout(() => setPassRing(null), 520);
    setRippleColor(RIPPLE_COLORS[rating]);
    setRippleKey((k) => k + 1);
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

  const tileStats = useMemo(
    () => computePlayerStats(committedContacts, slot.playerId, currentSetId),
    [committedContacts, slot.playerId, currentSetId]
  );

  const passRingClass = passRing === 0 ? 'pass-ring-0'
    : passRing === 1 ? 'pass-ring-1'
    : passRing === 2 ? 'pass-ring-2'
    : passRing === 3 ? 'pass-ring-3'
    : '';

  const tileBg = isServer ? 'bg-orange-950/30' : 'bg-slate-900';
  const tileBorder = isLibero
    ? 'border-dashed'
    : tileHeat === 'hot'  ? 'border-orange-400/40'
    : tileHeat === 'cold' ? 'border-blue-400/30'
    : 'border-slate-800/60';
  const tileShadow = !isLibero && tileHeat === 'hot'  ? 'shadow-[inset_0_0_12px_rgba(251,146,60,0.08)]'
    : !isLibero && tileHeat === 'cold' ? 'shadow-[inset_0_0_12px_rgba(96,165,250,0.06)]'
    : '';
  // Libero tile overlay — derived from the jersey color chosen at setup
  const tileStyle = isLibero ? {
    backgroundColor: `${jerseyHex}26`,
    borderColor:     `${jerseyHex}80`,
    boxShadow:       `inset 0 0 14px ${jerseyHex}1a`,
  } : undefined;

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
          style={{ width: '2.1vmin', height: '2.1vmin', backgroundColor: jerseyHex }}>
          <span className="font-black leading-none" style={{ fontSize: '1.1vmin', color: numberColor }}>L</span>
        </div>
      )}
      {rippleColor && (
        <div
          key={rippleKey}
          className="pass-ripple absolute inset-0 pointer-events-none z-[5]"
          style={{ background: rippleColor }}
        />
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
                style={{ width: '121%', height: '3.025vmin', top: '50%', left: '-10.5%', transform: 'translateY(-50%)' }}
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
          <span style={{ fontSize: '3.15vmin', letterSpacing: '0.06em', fontFamily: 'ui-rounded, system-ui, sans-serif' }}>{fmtName(slot.playerName)}</span>
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
            <div className="px-[7.5%]"><span className="text-[1.3vmin] font-bold uppercase tracking-wide text-slate-500 leading-none">Serving</span></div>
            <div className="flex flex-none h-[3.837vmin] py-0 px-[7.5%] gap-[0.5vmin] border-b border-black/30">
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
                onTap={serveType ? () => { tapAndScoreThem(ACTION.SERVE, RESULT.ERROR, { serve_type: serveType }); setServeRecorded(true); } : undefined}
                cls={`${!serveType ? 'bg-slate-800/40 text-slate-700 cursor-not-allowed pointer-events-none' : 'bg-red-950/80 text-red-300 hover:bg-red-900/80'}${serveType ? ' serve-unlock-btn' : ''}`}
                style={serveType ? { animationDelay: '100ms' } : undefined} />
            </div>
          </div>
        )}

        {/* Row 2 — Attack: ATT K AE */}
        <div className="px-[7.5%]"><span className="text-[1.3vmin] font-bold uppercase tracking-wide text-slate-500 leading-none">Hitting</span></div>
        <div className="flex flex-none h-[3.837vmin] py-0 px-[7.5%] gap-[0.5vmin] border-b border-black/30">
          <Btn label="ATT"
            onTap={() => tap(ACTION.ATTACK, RESULT.ATTEMPT)}
            cls="bg-orange-950/80 text-orange-200 hover:bg-orange-900/80" />
          <Btn label="K"
            onTap={() => tapAndScore(ACTION.ATTACK, RESULT.KILL)}
            cls="bg-orange-600/80 text-white hover:bg-orange-500/90" />
          <Btn label="AE"
            onTap={() => tapAndScoreThem(ACTION.ATTACK, RESULT.ERROR)}
            cls="bg-red-950/80 text-red-300 hover:bg-red-900/80" />
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
          <Btn label="0" onTap={() => tapPass(0, true)}  cls="bg-red-950/80 text-red-300 hover:bg-red-900/80" />
          <Btn label="1" onTap={() => tapPass(1, false)} cls="bg-yellow-950/80 text-yellow-300 hover:bg-yellow-900/80" />
          <Btn label="2" onTap={() => tapPass(2, false)} cls="bg-lime-950/80 text-lime-300 hover:bg-lime-900/80" />
          <Btn label="3" onTap={() => tapPass(3, false)} cls="bg-teal-900/80 text-teal-200 hover:bg-teal-800/90" />
        </div>

        {/* Row 5 — Penalty errors: L DBL NET (opponent scores) */}
        <div className="px-[7.5%]"><span className="text-[1.3vmin] font-bold uppercase tracking-wide text-slate-500 leading-none">Errors</span></div>
        <div className="flex flex-none h-[3.837vmin] py-0 px-[7.5%] gap-[0.5vmin]">
          <Btn label="L"   onTap={() => tapAndScoreThem(ACTION.ERROR, RESULT.LIFT)}      cls="bg-rose-950/60 text-rose-300 border border-rose-800/50 hover:bg-rose-900/70" />
          <Btn label="DBL" onTap={() => tapAndScoreThem(ACTION.ERROR, RESULT.DOUBLE)}    cls="bg-rose-950/60 text-rose-300 border border-rose-800/50 hover:bg-rose-900/70" />
          <Btn label="NET" onTap={() => tapAndScoreThem(ACTION.ERROR, RESULT.NET_TOUCH)} cls="bg-rose-950/60 text-rose-300 border border-rose-800/50 hover:bg-rose-900/70" />
        </div>

      </div>
    </div>
  );
});
