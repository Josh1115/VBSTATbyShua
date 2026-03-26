import { useState } from 'react';
import { fmtCount, fmtPct, fmtHitting, fmtPassRating } from '../../stats/formatters';

const COMPARE_STATS = [
  { key: 'k',       label: 'Kills',      fmt: fmtCount     },
  { key: 'ta',      label: 'Attacks',    fmt: fmtCount     },
  { key: 'k_pct',   label: 'K%',         fmt: fmtPct       },
  { key: 'hit_pct', label: 'HIT%',       fmt: fmtHitting   },
  { key: 'sa',      label: 'Serves',     fmt: fmtCount     },
  { key: 'ace',     label: 'Aces',       fmt: fmtCount     },
  { key: 'ace_pct', label: 'ACE%',       fmt: fmtPct       },
  { key: 'pa',      label: 'Passes',     fmt: fmtCount     },
  { key: 'apr',     label: 'APR',        fmt: fmtPassRating },
  { key: 'p3',      label: 'P3s',        fmt: fmtCount     },
  { key: 'dig',     label: 'Digs',       fmt: fmtCount     },
  { key: 'bs',      label: 'Solo Blks',  fmt: fmtCount     },
  { key: 'ba',      label: 'Blk Asst',   fmt: fmtCount     },
  { key: 'ast',     label: 'Assists',    fmt: fmtCount     },
];

const POS_COLORS = { S: '#60a5fa', OH: '#fb923c', MB: '#4ade80', OPP: '#c084fc', L: '#34d399', DS: '#94a3b8' };

export function PlayerComparison({ playerRows }) {
  const ids = playerRows.map(r => String(r.id));
  const [p1Id, setP1Id] = useState(ids[0] ?? '');
  const [p2Id, setP2Id] = useState(ids[1] ?? '');

  const p1 = playerRows.find(r => String(r.id) === p1Id);
  const p2 = playerRows.find(r => String(r.id) === p2Id);

  function PlayerSelect({ value, onChange }) {
    return (
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="flex-1 bg-surface border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/60"
      >
        {playerRows.map(r => (
          <option key={r.id} value={String(r.id)}>{r.name}</option>
        ))}
      </select>
    );
  }

  function StatBar({ v1, v2 }) {
    const max = Math.max(v1 ?? 0, v2 ?? 0);
    if (!max) return null;
    const pct1 = max ? Math.round((v1 ?? 0) / max * 100) : 0;
    const pct2 = max ? Math.round((v2 ?? 0) / max * 100) : 0;
    return (
      <div className="flex gap-0.5 h-1 rounded-full overflow-hidden bg-slate-800 my-1">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct1}%` }} />
        <div className="flex-1" />
        <div className="h-full rounded-full bg-rose-400 transition-all" style={{ width: `${pct2}%` }} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <PlayerSelect value={p1Id} onChange={setP1Id} />
        <span className="self-center text-slate-500 font-bold text-sm">vs</span>
        <PlayerSelect value={p2Id} onChange={setP2Id} />
      </div>

      {p1 && p2 && (
        <>
          <div className="flex gap-2">
            {[p1, p2].map((p, i) => (
              <div key={p.id} className={`flex-1 rounded-xl p-3 text-center ${i === 0 ? 'bg-primary/15 border border-primary/30' : 'bg-rose-400/10 border border-rose-400/30'}`}>
                <div className="font-bold text-sm">{p.name}</div>
                {p.position && (
                  <div className="text-xs mt-0.5 font-semibold" style={{ color: POS_COLORS[p.position] ?? '#94a3b8' }}>
                    {p.position}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="bg-surface rounded-xl overflow-hidden">
            {COMPARE_STATS.map(({ key, label, fmt }) => {
              const v1 = p1[key];
              const v2 = p2[key];
              if (v1 == null && v2 == null) return null;
              const f1 = fmt ? fmt(v1) : (v1 ?? '—');
              const f2 = fmt ? fmt(v2) : (v2 ?? '—');
              if (f1 === '—' && f2 === '—') return null;
              const n1 = v1 ?? 0;
              const n2 = v2 ?? 0;
              const better1 = n1 > n2;
              const better2 = n2 > n1;
              return (
                <div key={key} className="px-3 py-2 border-b border-slate-700/50 last:border-0">
                  <div className="flex items-center">
                    <span className={`w-16 text-right text-sm font-bold tabular-nums ${better1 ? 'text-primary' : 'text-slate-300'}`}>{f1}</span>
                    <span className="flex-1 text-center text-xs text-slate-400 px-2">{label}</span>
                    <span className={`w-16 text-left text-sm font-bold tabular-nums ${better2 ? 'text-rose-400' : 'text-slate-300'}`}>{f2}</span>
                  </div>
                  <StatBar v1={n1} v2={n2} />
                </div>
              );
            })}
          </div>
        </>
      )}

      {playerRows.length < 2 && (
        <p className="text-slate-500 text-sm text-center py-6">Need at least 2 players with stats to compare.</p>
      )}
    </div>
  );
}
