import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { useMatchStore } from '../../store/matchStore';

// ── Scoring Summary helpers ────────────────────────────────────────────────────

function detectMethod(rallyContacts) {
  for (const c of rallyContacts) {
    if (c.opponent_contact) {
      if (c.action === 'serve'  && c.result === 'ace')                          return { label: 'OPP ACE', us: false };
      if (c.action === 'attack' && c.result === 'kill')                         return { label: 'OPP K',   us: false };
      if (c.action === 'block'  && (c.result === 'solo' || c.result === 'assist')) return { label: 'OPP BLK', us: false };
      if (c.action === 'serve'  && c.result === 'error')                        return { label: 'OPP SE',  us: true,  playerId: c.player_id };
      if (c.action === 'attack' && c.result === 'error')                        return { label: 'OPP AE',  us: true  };
      if (c.action === 'error')                                                  return { label: 'OPP ERR', us: true  };
    } else {
      if (c.action === 'serve'  && c.result === 'ace')    return { label: 'ACE',  us: true,  playerId: c.player_id };
      if (c.action === 'attack' && c.result === 'kill')   return { label: 'K',    us: true,  playerId: c.player_id };
      if (c.action === 'block'  && c.result === 'solo')   return { label: 'SBLK', us: true,  playerId: c.player_id };
      if (c.action === 'block'  && c.result === 'assist') return { label: 'BLK',  us: true,  playerId: c.player_id };
      if (c.action === 'serve'  && c.result === 'error')  return { label: 'SE',   us: false };
      if (c.action === 'attack' && c.result === 'error')  return { label: 'AE',   us: false };
      if (c.action === 'error'  && c.result === 'lift')   return { label: 'LIFT', us: false };
      if (c.action === 'error'  && c.result === 'double') return { label: 'DBL',  us: false };
      if (c.action === 'error'  && c.result === 'net')    return { label: 'NET',  us: false };
    }
  }
  return { label: '—', us: null };
}

// ── Bookkeeper sub-components ─────────────────────────────────────────────────

const ROW_SIZE = 13;

function ScoringPanel({ teamName, timeouts, cellNums, scoredMap, currentScore, subs, subsUsed, maxSubs, showSubs }) {
  const rows = [];
  for (let i = 0; i < cellNums.length; i += ROW_SIZE) {
    rows.push(cellNums.slice(i, i + ROW_SIZE));
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 p-2 gap-1.5">
      {/* Team name + timeout indicators */}
      <div className="flex items-center justify-between shrink-0">
        <span className="font-bold text-sm text-white truncate mr-2">{teamName}</span>
        <div className="flex items-center gap-1 shrink-0">
          {[1, 2].map((n) => (
            <span
              key={n}
              className={`text-[1.1vmin] px-1.5 py-0.5 rounded font-black border tracking-wide
                ${timeouts >= n
                  ? 'bg-amber-500 border-amber-400 text-white'
                  : 'border-slate-700 text-slate-700'
                }`}
            >
              T{n}
            </span>
          ))}
        </div>
      </div>

      {/* Scoring grid */}
      <div className="flex flex-col gap-px flex-1 min-h-0 overflow-hidden">
        {rows.map((row, rowIdx) => (
          <div key={rowIdx} className="flex gap-px flex-1 min-h-0">
            {row.map((num) => {
              const info     = scoredMap[num];
              const scored   = !!info;
              const isNext   = !scored && num === currentScore + 1;
              const onServe  = scored && !info.sideOut;

              return (
                <div
                  key={num}
                  className={`flex-1 flex flex-col items-center justify-center rounded-sm min-w-0 gap-px py-0.5
                    ${scored
                      ? onServe
                        ? 'bg-primary/85'
                        : 'bg-sky-700/70'
                      : isNext
                        ? 'bg-slate-700 ring-1 ring-inset ring-primary/50'
                        : 'bg-slate-800/70'
                    }`}
                >
                  <span className={`text-[1.4vmin] font-black leading-none tabular-nums
                    ${scored ? 'text-white' : isNext ? 'text-slate-400' : 'text-slate-700'}`}
                  >
                    {num}
                  </span>
                  <span className={`text-[0.9vmin] font-bold leading-none tabular-nums
                    ${scored ? 'text-white/70' : 'text-transparent'}`}
                  >
                    {scored
                      ? info.serverJersey != null
                        ? `#${info.serverJersey}`
                        : '◂'
                      : '·'}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Sub log */}
      {showSubs && (
        <div className="shrink-0 border-t border-slate-800 pt-1">
          <div className="text-[1.0vmin] text-slate-500 uppercase tracking-wide font-bold mb-0.5">
            Subs {subsUsed}/{maxSubs}
          </div>
          {subs.length === 0 ? (
            <span className="text-[1.1vmin] text-slate-700">—</span>
          ) : (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              {subs.map((sub, i) => (
                <span key={i} className="text-[1.1vmin] text-slate-300 whitespace-nowrap">
                  #{sub.outJersey} → #{sub.inJersey}
                  {sub.score && <span className="text-slate-600 ml-1">{sub.score}</span>}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ScoringSummaryModal({ onClose }) {
  const currentSetId = useMatchStore((s) => s.currentSetId);
  const setNumber    = useMatchStore((s) => s.setNumber);
  const teamName     = useMatchStore((s) => s.teamName);
  const opponentName = useMatchStore((s) => s.opponentName);
  const lineup       = useMatchStore((s) => s.lineup);

  const rallies = useLiveQuery(
    () => currentSetId ? db.rallies.where('set_id').equals(currentSetId).sortBy('rally_number') : [],
    [currentSetId]
  );

  const contacts = useLiveQuery(
    () => currentSetId ? db.contacts.where('set_id').equals(currentSetId).sortBy('timestamp') : [],
    [currentSetId]
  );

  const playerNames = useMemo(() => {
    const map = {};
    for (const slot of lineup) {
      if (slot?.playerId && slot?.playerName) {
        map[slot.playerId] = slot.playerName.split(' ').pop();
      }
    }
    return map;
  }, [lineup]);

  const rows = useMemo(() => {
    if (!rallies || !contacts) return [];

    let usScore = 0, themScore = 0;
    const rows = rallies.map((rally, idx) => {
      const prevTs = idx === 0 ? 0 : rallies[idx - 1].timestamp;
      const rallyContacts = contacts.filter(
        (c) => c.timestamp > prevTs && c.timestamp <= rally.timestamp
      );
      const method = detectMethod(rallyContacts);
      if (rally.point_winner === 'us') usScore++;
      else                             themScore++;
      return {
        pt:         idx + 1,
        winner:     rally.point_winner,
        usScore,
        themScore,
        serveSide:  rally.serve_side,
        method,
        playerName: method.playerId ? (playerNames[method.playerId] ?? '') : '',
      };
    });

    return rows.map((row, i) => {
      const isRunStart = i === 0 || rows[i - 1].winner !== row.winner;
      let runLen = 0;
      if (isRunStart) { let j = i; while (rows[j]?.winner === row.winner) { runLen++; j++; } }
      const inRun = !isRunStart && rows[i - 1].winner === row.winner;
      return { ...row, isRunStart, runLen, inRun };
    });
  }, [rallies, contacts, playerNames]);

  const usLabel   = teamName     || 'US';
  const themLabel = opponentName || 'THEM';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col">

      {/* Header */}
      <div className="flex-none flex items-center justify-between px-3 py-2 border-b border-slate-700 bg-slate-800">
        <div className="flex items-center gap-1">
          <span className="text-slate-300 text-xs font-black tracking-wide px-3 py-1.5">SCORING</span>
          <span className="text-slate-600 text-xs ml-1">· Set {setNumber}</span>
        </div>
        <button
          onPointerDown={(e) => { e.preventDefault(); onClose(); }}
          className="text-slate-400 hover:text-white text-xl font-bold px-2"
        >
          ✕
        </button>
      </div>

      {/* ── SCORING SUMMARY ── */}
      <>
        {/* Column headers */}
          <div className="flex-none grid grid-cols-[2.5rem_1fr_5rem_1fr] border-b border-slate-700 bg-slate-800/60 px-3 py-1.5">
            <span className="text-[1.3vmin] font-bold text-slate-500 uppercase">#</span>
            <span className="text-[1.3vmin] font-bold text-emerald-500 uppercase">{usLabel}</span>
            <span className="text-[1.3vmin] font-bold text-slate-400 uppercase text-center">SCORE</span>
            <span className="text-[1.3vmin] font-bold text-red-500 uppercase text-right">{themLabel}</span>
          </div>

          {/* Rows */}
          <div className="flex-1 overflow-y-auto">
            {(!rows || rows.length === 0) ? (
              <div className="flex items-center justify-center h-32 text-slate-500 text-sm">
                No points recorded yet.
              </div>
            ) : (
              rows.map((row) => {
                const usWon   = row.winner === 'us';
                const themWon = row.winner === 'them';
                const usServe = row.serveSide === 'us';
                const methodText = row.method.label + (row.playerName ? ` · ${row.playerName}` : '');
                const inRun = (row.isRunStart && row.runLen >= 2) || row.inRun;
                return (
                  <div
                    key={row.pt}
                    className={`grid grid-cols-[2.5rem_1fr_5rem_1fr] items-center px-3 py-1 border-b border-slate-800 text-[1.5vmin]
                      ${usWon ? 'bg-emerald-950/20' : 'bg-red-950/10'}
                      ${inRun ? (usWon ? 'border-l-2 border-emerald-500' : 'border-l-2 border-red-500') : 'border-l-2 border-transparent'}`}
                  >
                    <div className="flex items-center gap-1">
                      <span className="text-slate-600 font-mono text-[1.3vmin]">{row.pt}</span>
                      {row.isRunStart && row.runLen >= 3 && (
                        <span className={`text-[1.1vmin] font-black px-0.5 rounded ${usWon ? 'text-emerald-400' : 'text-red-400'}`}>
                          {row.runLen}×
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {usServe && <span className="text-[1.1vmin] text-slate-500 font-bold">▶</span>}
                      {usWon && <span className="font-bold text-emerald-400">{methodText}</span>}
                    </div>
                    <span className={`text-center font-bold font-mono ${usWon ? 'text-emerald-300' : 'text-red-300'}`}>
                      {row.usScore}–{row.themScore}
                    </span>
                    <div className="flex items-center justify-end gap-1">
                      {themWon && <span className="font-bold text-red-400">{row.method.label}</span>}
                      {!usServe && <span className="text-[1.1vmin] text-slate-500 font-bold">◀</span>}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer summary */}
          {rows.length > 0 && (() => {
            const last       = rows[rows.length - 1];
            const usEarned   = rows.filter((r) => r.winner === 'us'   && r.method.us === true).length;
            const themEarned = rows.filter((r) => r.winner === 'them' && r.method.us === false).length;
            const usFree     = rows.filter((r) => r.winner === 'us'   && r.method.us === null).length;
            const givenAway  = rows.filter((r) => r.winner === 'them' && r.method.us === true).length;
            return (
              <div className="flex-none border-t border-slate-700 bg-slate-800/80 px-4 py-2 grid grid-cols-2 gap-4 text-[1.4vmin]">
                <div className="space-y-0.5">
                  <div className="text-emerald-400 font-bold">{usLabel}: {last.usScore} pts</div>
                  <div className="text-slate-400">Earned: {usEarned} &nbsp;·&nbsp; Free: {usFree} &nbsp;·&nbsp; Given: {givenAway}</div>
                </div>
                <div className="space-y-0.5 text-right">
                  <div className="text-red-400 font-bold">{themLabel}: {last.themScore} pts</div>
                  <div className="text-slate-400">Earned: {themEarned}</div>
                </div>
              </div>
            );
          })()}
      </>

    </div>
  );
}
