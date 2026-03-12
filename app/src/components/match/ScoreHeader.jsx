import { memo, useEffect, useRef, useState } from 'react';
import { useMatchStore } from '../../store/matchStore';
import { useMatchStats } from '../../hooks/useMatchStats';
import { SIDE } from '../../constants';
import { LiberoBox } from './LiberoBox';

const HOLD_MS = 3000;

function RunStrip({ teamStats: t, oppStats: o, currentRun, teamName, opponentName }) {
  const n    = (v) => v ?? 0;
  const pct  = (v) => v != null ? Math.round(v * 100) + '%' : '—';
  const dec1 = (v) => v != null ? v.toFixed(1) : '—';
  const STATS = [
    ['S%', pct(t.si_pct)],
    ['ACE',  n(t.ace)],
    ['SE',   n(t.se)],
    ['K',    n(t.k)],
    ['AE',   n(t.ae)],
    ['BLK',  n(t.bs) + n(t.ba) * 0.5],
    ['APR',  dec1(t.apr)],
  ];
  const OPP_STATS = o ? [
    ['ACE',  n(o.ace)],
    ['SE',   n(o.se)],
    ['K',    n(o.k)],
    ['AE',   n(o.ae)],
    ['BLK',  n(o.blk)],
    ['ERRS', n(o.errs)],
  ] : [];
  const runPulseStyle = currentRun.count >= 3 ? {
    '--run-glow': currentRun.side === 'us' ? 'rgba(249,115,22,0.45)' : 'rgba(239,68,68,0.45)',
    animationName: 'run-intensity-pulse',
    animationDuration: currentRun.count >= 7 ? '0.45s' : currentRun.count >= 5 ? '0.9s' : '2s',
    animationTimingFunction: 'ease-in-out',
    animationIterationCount: 'infinite',
  } : {};

  return (
    <div
      className={`h-[3.1vmin] relative flex items-center select-none
        ${currentRun.count >= 3
          ? currentRun.side === 'us' ? 'bg-orange-950/70' : 'bg-red-950/70'
          : 'bg-black/30'
        }`}
      style={runPulseStyle}
    >
      <div className="flex items-center gap-2 pl-2 text-[1.7vmin] leading-none">
        {STATS.map(([lbl, val]) => (
          <span key={lbl} className="flex items-baseline gap-[0.25vmin]">
            <span className="text-slate-500 font-medium">{lbl}</span>
            <span className="text-slate-300 font-bold">{val}</span>
          </span>
        ))}
      </div>
      {currentRun.count >= 3 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className={`text-[15px] font-bold tracking-wide ${currentRun.side === 'us' ? 'text-orange-400' : 'text-red-400'} ${currentRun.count >= 6 ? 'flame-pulse-intense' : 'flame-pulse'}`}>
            🔥 {currentRun.side === 'us' ? (teamName || 'HOME') : (opponentName || 'AWAY')} {currentRun.count} RUN
          </span>
        </div>
      )}
      {OPP_STATS.length > 0 && (
        <div className="ml-auto flex items-center gap-2 pr-2 text-[1.7vmin] leading-none">
          {OPP_STATS.map(([lbl, val]) => (
            <span key={lbl} className="flex items-baseline gap-[0.25vmin]">
              <span className="text-red-500 font-medium">{lbl}</span>
              <span className="text-red-300 font-bold">{val}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Score sparkline — shows set score differential as a dual-color polyline
// Segments above zero → orange, segments below zero → red, at zero → slate
function ScoreSparkline({ pointHistory }) {
  const pts = pointHistory.slice(-24);
  if (pts.length < 3) return <div style={{ width: 60, height: 12 }} />;
  const diffs = [0];
  for (const p of pts) diffs.push(diffs[diffs.length - 1] + (p.side === 'us' ? 1 : -1));
  const maxAbs = Math.max(1, ...diffs.map(Math.abs));
  const W = 60, H = 12, m = 1.5;
  const cx = (i) => m + (i / (diffs.length - 1)) * (W - 2 * m);
  const cy = (d) => H / 2 - (d / maxAbs) * (H / 2 - m);
  const segColor = (d1, d2) => {
    const mid = (d1 + d2) / 2;
    return mid > 0 ? '#f97316' : mid < 0 ? '#ef4444' : '#64748b';
  };
  const lastDiff = diffs[diffs.length - 1];
  const dotColor = lastDiff > 0 ? '#f97316' : lastDiff < 0 ? '#ef4444' : '#64748b';
  return (
    <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
      <line x1={m} y1={H / 2} x2={W - m} y2={H / 2} stroke="#334155" strokeWidth={0.5} strokeDasharray="1.5,1.5" />
      {diffs.slice(0, -1).map((d, i) => (
        <line
          key={i}
          x1={cx(i).toFixed(1)} y1={cy(d).toFixed(1)}
          x2={cx(i + 1).toFixed(1)} y2={cy(diffs[i + 1]).toFixed(1)}
          stroke={segColor(d, diffs[i + 1])}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      <circle cx={cx(diffs.length - 1)} cy={cy(lastDiff)} r={1.8} fill={dotColor} />
    </svg>
  );
}

// Two pip circles — each pops when consumed
const TimeoutBox = memo(function TimeoutBox({ used, onTap }) {
  const exhausted = used >= 2;
  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); if (!exhausted) onTap(); }}
      className={`flex gap-[0.6vmin] items-center px-[0.5vmin] py-[0.5vmin] rounded select-none
        ${!exhausted ? 'hover:bg-slate-700/50 active:brightness-75' : 'cursor-default'}`}
    >
      {[0, 1].map((i) => {
        const isUsed = i < used;
        return (
          <span
            key={`${i}-${isUsed}`}
            className={`inline-flex items-center justify-center rounded-full border-2
              w-[2.2vmin] h-[2.2vmin] text-[1.2vmin] font-black leading-none
              ${isUsed
                ? 'border-red-600 text-red-500 bg-red-950/30 timeout-pip-pop'
                : 'border-slate-400 bg-slate-500/50 text-transparent'
              }`}
          >
            {isUsed ? '×' : ''}
          </span>
        );
      })}
    </button>
  );
});

const NudgeBtn = memo(function NudgeBtn({ label, onTap }) {
  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); onTap(); }}
      className="w-12 h-10 flex items-center justify-center text-[18px] font-bold leading-none
        bg-slate-700 hover:bg-slate-600 text-slate-200 rounded border border-slate-500
        active:brightness-75 select-none"
    >
      {label}
    </button>
  );
});

export const ScoreHeader = memo(function ScoreHeader({ liberoPlayer, teamName, opponentName, onTimeoutCalled, onAssignLibero }) {
  const ourScore      = useMatchStore((s) => s.ourScore);
  const oppScore      = useMatchStore((s) => s.oppScore);
  const ourSetsWon    = useMatchStore((s) => s.ourSetsWon);
  const oppSetsWon    = useMatchStore((s) => s.oppSetsWon);
  const setNumber     = useMatchStore((s) => s.setNumber);
  const serveSide     = useMatchStore((s) => s.serveSide);
  const ourTimeouts   = useMatchStore((s) => s.ourTimeouts);
  const oppTimeouts   = useMatchStore((s) => s.oppTimeouts);
  const useTimeout    = useMatchStore((s) => s.useTimeout);
  const subsUsed      = useMatchStore((s) => s.subsUsed);
  const maxSubsPerSet = useMatchStore((s) => s.maxSubsPerSet);
  const adjustScore   = useMatchStore((s) => s.adjustScore);
  const currentRun    = useMatchStore((s) => s.currentRun);
  const lastFeedItem  = useMatchStore((s) => s.lastFeedItem);
  const pointHistory  = useMatchStore((s) => s.pointHistory);

  const { teamStats, oppStats } = useMatchStats();

  const [nudgeOpen,       setNudgeOpen]       = useState(null); // null | 'us' | 'them'
  const [timeoutConfirm,  setTimeoutConfirm]  = useState(null); // null | 'us' | 'them'
  const [usHolding,       setUsHolding]       = useState(false);
  const [themHolding,     setThemHolding]     = useState(false);
  const [subWarnOpen,     setSubWarnOpen]     = useState(false);
  const [subWarnCount,    setSubWarnCount]    = useState(0); // subs remaining when warning fired
  const weServe = serveSide === SIDE.US;

  const [serveVersion,    setServeVersion]    = useState(0);
  const subWarn2Fired  = useRef(false);
  const subWarn1Fired  = useRef(false);
  const usTimer        = useRef(null);
  const themTimer      = useRef(null);
  const prevWeServeRef = useRef(weServe);

  useEffect(() => {
    if (prevWeServeRef.current !== weServe) {
      prevWeServeRef.current = weServe;
      setServeVersion((v) => v + 1);
    }
  }, [weServe]);

  // Fire warning at 2 subs left, then again at 1 sub left
  useEffect(() => {
    const subsLeft = maxSubsPerSet - subsUsed;
    if (subsLeft === 2 && !subWarn2Fired.current) {
      subWarn2Fired.current = true;
      setSubWarnCount(2);
      setSubWarnOpen(true);
    }
    if (subsLeft === 1 && !subWarn1Fired.current) {
      subWarn1Fired.current = true;
      setSubWarnCount(1);
      setSubWarnOpen(true);
    }
    // Reset if subs are rolled back (e.g. new set)
    if (subsLeft > 2) subWarn2Fired.current = false;
    if (subsLeft > 1) subWarn1Fired.current = false;
  }, [subsUsed, maxSubsPerSet]);

  function onScoreDown(side, e) {
    e.preventDefault();
    if (side === 'us') {
      setUsHolding(true);
      usTimer.current = setTimeout(() => { setUsHolding(false); setNudgeOpen('us'); }, HOLD_MS);
    } else {
      setThemHolding(true);
      themTimer.current = setTimeout(() => { setThemHolding(false); setNudgeOpen('them'); }, HOLD_MS);
    }
  }

  function onScoreUp(side) {
    if (side === 'us') { clearTimeout(usTimer.current); setUsHolding(false); }
    else               { clearTimeout(themTimer.current); setThemHolding(false); }
  }

  const nudgeSide = nudgeOpen === 'us' ? SIDE.US : SIDE.THEM;
  const nudgeLabel = nudgeOpen === 'us' ? (teamName || 'HOME') : (opponentName || 'AWAY');

  return (
    // Outer wrapper — always flex-none, total height = 66px header + 24px run strip
    <div className="flex-none flex flex-col">

      {/* ── Main header row ── */}
      <div className="relative flex items-center h-[5.85vmin] bg-surface border-b border-slate-700 text-white overflow-hidden px-2 gap-1">

        {/* ── Far left: US sets won + our timeouts + sub counter ── */}
        <div className="flex items-center gap-1 shrink-0">
          <div className="flex flex-col items-center w-9">
            <span className="text-[3.1vmin] font-black text-orange-400 leading-none">{ourSetsWon}</span>
          </div>
          <TimeoutBox used={ourTimeouts} onTap={() => setTimeoutConfirm('us')} />
          {(() => {
            const subsLeft  = maxSubsPerSet - subsUsed;
            const isMaxed   = subsLeft <= 0;
            const isRed     = !isMaxed  && subsUsed >= 14;
            const isYellow  = !isRed    && !isMaxed && subsUsed >= 10;
            const colorKey  = isMaxed ? 'maxed' : isRed ? `red-${subsUsed}` : isYellow ? `yellow-${subsUsed}` : 'ok';
            const numClass  = isMaxed  ? 'text-red-400 sub-maxed-blink'
                            : isRed    ? 'text-red-400 sub-warn-pulse'
                            : isYellow ? 'text-yellow-400'
                            : 'text-slate-300';
            const lblClass  = isMaxed  ? 'text-red-600'
                            : isRed    ? 'text-red-600'
                            : isYellow ? 'text-yellow-600'
                            : 'text-slate-500';
            return (
              <div className="flex flex-col items-center shrink-0 ml-1">
                <span key={colorKey} className={`text-[2.1vmin] font-bold leading-none ${numClass}`}>
                  {subsUsed}/{maxSubsPerSet}
                </span>
                <span className={`text-[1.7vmin] leading-none ${lblClass}`}>SUB</span>
              </div>
            );
          })()}
        </div>

        {/* ── Libero box — sits between sub tracker and center score block ── */}
        <LiberoBox liberoPlayer={liberoPlayer} onAssignLibero={onAssignLibero} />

        {/* ── Left spacer ── */}
        <div className="flex-1" />

        {/* ── Center: absolutely centered score block ── */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
          {/* home team name — always a 3-letter abbreviation */}
          <span className="text-[2.9vmin] text-slate-100 font-bold uppercase tracking-widest leading-none">
            {teamName || 'HOM'}
          </span>

          {/* US score — hold 3s to open nudge */}
          <div
            onPointerDown={(e) => onScoreDown('us', e)}
            onPointerUp={() => onScoreUp('us')}
            onPointerLeave={() => onScoreUp('us')}
            className={`cursor-pointer select-none transition-opacity overflow-hidden leading-none ${usHolding ? 'opacity-40' : ''}`}
            title="Hold 3s to adjust score"
          >
            <span key={`us-${ourScore}`} className="block text-[4.2vmin] font-black tabular-nums leading-none score-pop">
              {String(ourScore).padStart(2, '0')}
            </span>
          </div>

          {weServe
            ? <span key={`srv-l-${serveVersion}`} className="text-xl leading-none serve-pulse animate-serve-from-right">🏐</span>
            : <span className="text-xl leading-none opacity-0">🏐</span>}

          {/* set number + sparkline */}
          <div className="flex flex-col items-center px-2 gap-[1px]">
            <span className="text-[1.6vmin] font-black text-slate-500 leading-none uppercase tracking-wide whitespace-nowrap">Set {setNumber}</span>
            <ScoreSparkline pointHistory={pointHistory} />
          </div>

          {!weServe
            ? <span key={`srv-r-${serveVersion}`} className="text-xl leading-none serve-pulse animate-serve-from-left">🏐</span>
            : <span className="text-xl leading-none opacity-0">🏐</span>}

          {/* THEM score — hold 3s to open nudge */}
          <div
            onPointerDown={(e) => onScoreDown('them', e)}
            onPointerUp={() => onScoreUp('them')}
            onPointerLeave={() => onScoreUp('them')}
            className={`cursor-pointer select-none transition-opacity overflow-hidden leading-none ${themHolding ? 'opacity-40' : ''}`}
            title="Hold 3s to adjust score"
          >
            <span key={`them-${oppScore}`} className="block text-[4.2vmin] font-black tabular-nums leading-none score-pop">
              {String(oppScore).padStart(2, '0')}
            </span>
          </div>

          {/* away team name — always a 3-letter abbreviation */}
          <span className="text-[2.9vmin] text-slate-300 font-bold uppercase tracking-widest leading-none">
            {opponentName || 'AWY'}
          </span>
        </div>

        {/* ── Right spacer / last action feed ── */}
        <div className="flex-1 flex items-center justify-end overflow-hidden">
          {lastFeedItem && (
            <div
              key={lastFeedItem.id}
              className="animate-feed-in px-3 py-0.5 rounded-full bg-slate-700/80 border border-slate-500/60
                text-white font-bold text-[1.6vmin] shadow pointer-events-none whitespace-nowrap"
            >
              {lastFeedItem.label}
            </div>
          )}
        </div>

        {/* ── Far right: their timeouts + THEM sets won ── */}
        <div className="flex items-center gap-1 shrink-0">
          <TimeoutBox used={oppTimeouts} onTap={() => setTimeoutConfirm('them')} />
          <div className="flex flex-col items-center w-9">
            <span className="text-[3.1vmin] font-black text-slate-300 leading-none">{oppSetsWon}</span>
          </div>
        </div>

      </div>

      {/* ── Run strip — always h-6, team stats left, run badge centered ── */}
      <RunStrip
        teamStats={teamStats}
        oppStats={oppStats}
        currentRun={currentRun}
        teamName={teamName}
        opponentName={opponentName}
      />


      {/* ── Timeout confirmation popup ── */}
      {timeoutConfirm && (
        <>
          <div
            className="fixed inset-0 z-40"
            onPointerDown={(e) => { e.preventDefault(); setTimeoutConfirm(null); }}
          />
          <div
            className="fixed top-[11.7vmin] left-1/2 -translate-x-1/2 z-50"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="animate-nudge-pop flex flex-col items-center gap-3 bg-slate-800 border border-slate-600 rounded-xl px-6 py-4 shadow-2xl">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-400">
                Call Timeout — {timeoutConfirm === 'us' ? (teamName || 'HOME') : (opponentName || 'AWAY')}
              </span>
              <div className="flex gap-3">
                <button
                  onPointerDown={(e) => { e.preventDefault(); setTimeoutConfirm(null); }}
                  className="px-4 py-2 rounded-lg text-sm font-bold bg-slate-700 border border-slate-500 text-slate-300 hover:bg-slate-600 select-none"
                >
                  Cancel
                </button>
                <button
                  onPointerDown={(e) => {
                    e.preventDefault();
                    useTimeout(timeoutConfirm === 'us' ? SIDE.US : SIDE.THEM);
                    onTimeoutCalled?.();
                    setTimeoutConfirm(null);
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-bold bg-primary border border-primary text-white hover:brightness-110 select-none"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Sub limit warning ── */}
      {subWarnOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onPointerDown={(e) => { e.preventDefault(); setSubWarnOpen(false); }}
          />
          <div
            className="fixed top-[11.7vmin] left-1/2 -translate-x-1/2 z-50"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="animate-nudge-pop flex flex-col items-center gap-3 bg-red-950 border border-red-700 rounded-xl px-6 py-4 shadow-2xl">
              <span className="text-sm font-black uppercase tracking-wide text-red-300">⚠ Sub Warning</span>
              <span className="text-xs text-red-200 text-center">
                {subWarnCount === 1
                  ? <><span className="font-bold text-white">Last substitution</span> remaining this set.</>
                  : <>Only <span className="font-bold text-white">{subWarnCount}</span> substitutions remaining this set.</>
                }
              </span>
              <button
                onPointerDown={(e) => { e.preventDefault(); setSubWarnOpen(false); }}
                className="px-5 py-1.5 rounded-lg text-sm font-bold bg-red-800 border border-red-600 text-white hover:bg-red-700 select-none"
              >
                Got it
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Score nudge popup (fixed, appears below run strip) ── */}
      {nudgeOpen && (
        <>
          {/* Transparent backdrop — tap anywhere to dismiss */}
          <div
            className="fixed inset-0 z-40"
            onPointerDown={(e) => { e.preventDefault(); setNudgeOpen(null); }}
          />
          {/* Popup panel — outer div handles fixed position, inner div animates */}
          <div
            className="fixed top-[11.7vmin] left-1/2 -translate-x-1/2 z-50"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="animate-nudge-pop flex flex-col items-center gap-2 bg-slate-800 border border-slate-600 rounded-xl px-6 py-3 shadow-2xl">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-400">
                Adjust {nudgeLabel}
              </span>
              <div className="flex gap-3">
                <NudgeBtn label="−" onTap={() => adjustScore(nudgeSide, -1)} />
                <NudgeBtn label="+" onTap={() => adjustScore(nudgeSide,  1)} />
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  );
});
