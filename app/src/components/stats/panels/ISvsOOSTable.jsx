import { fmtHitting } from '../../../stats/formatters';

// Stable empty fallbacks — hoisted to avoid recreation on every render
const _emptyISSlot  = () => ({ ta:0, k:0, ae:0, win:0, k_pct:null, hit_pct:null, win_pct:null });
const _emptyISGroup = () => ({ is: _emptyISSlot(), oos: _emptyISSlot() });
export const EMPTY_ISVSOOS = { byRotation: Object.fromEntries(Array.from({length:6},(_,i)=>[i+1,_emptyISGroup()])), total: _emptyISGroup() };
export const EMPTY_FREEDIG  = { byRotation: Object.fromEntries(Array.from({length:6},(_,i)=>[i+1,{fb_dig:0,fb_won:0}])), total: {fb_dig:0,fb_won:0} };
const _emptyAtkSlot  = () => ({ ta:0, k:0, ae:0, win:0, hit_pct:null, k_pct:null, win_pct:null });
const _emptyAtkGroup = () => ({ total: _emptyAtkSlot(), byRotation: Object.fromEntries(Array.from({length:6},(_,i)=>[i+1,_emptyAtkSlot()])) });
export const EMPTY_TRANSATK = { free: _emptyAtkGroup(), transition: _emptyAtkGroup() };

export function ISvsOOSTable({ data, freeDigData, transAtkData }) {
  const ROTATIONS = [1, 2, 3, 4, 5, 6];
  const pctFmt = (won, pa) => pa > 0 ? Math.round(won / pa * 100) + '%' : '—';
  const cntFmt = (v) => v > 0 ? v : '—';
  const effFmt = fmtHitting;
  const n = (v) => v ?? 0;

  const rows = [
    {
      label:     'IS ATK',
      labelCls:  'text-emerald-700',
      fmt:       (r) => cntFmt(n(data.byRotation[r]?.is?.ta)),
      total:     ()  => cntFmt(n(data.total.is?.ta)),
    },
    {
      label:     'IS K%',
      labelCls:  'text-emerald-700',
      fmt:       (r) => pctFmt(data.byRotation[r]?.is?.k ?? 0, data.byRotation[r]?.is?.ta ?? 0),
      total:     ()  => pctFmt(data.total.is?.k, data.total.is?.ta),
    },
    {
      label:     'IS HIT%',
      labelCls:  'text-emerald-700',
      fmt:       (r) => effFmt(data.byRotation[r]?.is?.hit_pct),
      total:     ()  => effFmt(data.total.is?.hit_pct),
    },
    {
      label:     'IS WIN%',
      labelCls:  'text-emerald-700',
      fmt:       (r) => pctFmt(data.byRotation[r]?.is?.win ?? 0, data.byRotation[r]?.is?.ta ?? 0),
      total:     ()  => pctFmt(data.total.is?.win, data.total.is?.ta),
    },
    null,
    {
      label:     'OOS ATK',
      labelCls:  'text-amber-700',
      fmt:       (r) => cntFmt(n(data.byRotation[r]?.oos?.ta)),
      total:     ()  => cntFmt(n(data.total.oos?.ta)),
    },
    {
      label:     'OOS K%',
      labelCls:  'text-amber-700',
      fmt:       (r) => pctFmt(data.byRotation[r]?.oos?.k ?? 0, data.byRotation[r]?.oos?.ta ?? 0),
      total:     ()  => pctFmt(data.total.oos?.k, data.total.oos?.ta),
    },
    {
      label:     'OOS HIT%',
      labelCls:  'text-amber-700',
      fmt:       (r) => effFmt(data.byRotation[r]?.oos?.hit_pct),
      total:     ()  => effFmt(data.total.oos?.hit_pct),
    },
    {
      label:     'OOS WIN%',
      labelCls:  'text-amber-700',
      fmt:       (r) => pctFmt(data.byRotation[r]?.oos?.win ?? 0, data.byRotation[r]?.oos?.ta ?? 0),
      total:     ()  => pctFmt(data.total.oos?.win, data.total.oos?.ta),
    },
    null,
    {
      label:     'FREE Dig',
      labelCls:  'text-cyan-700',
      fmt:       (r) => cntFmt(n(freeDigData.byRotation[r]?.fb_dig)),
      total:     ()  => cntFmt(n(freeDigData.total.fb_dig)),
    },
    {
      label:     'FREEWIN%',
      labelCls:  'text-cyan-700',
      fmt:       (r) => pctFmt(freeDigData.byRotation[r]?.fb_won ?? 0, freeDigData.byRotation[r]?.fb_dig ?? 0),
      total:     ()  => pctFmt(freeDigData.total.fb_won, freeDigData.total.fb_dig),
    },
    null,
    {
      label:     'FREE ATK',
      labelCls:  'text-cyan-600',
      fmt:       (r) => cntFmt(n(transAtkData.free.byRotation[r]?.ta)),
      total:     ()  => cntFmt(n(transAtkData.free.total.ta)),
    },
    {
      label:     'FREE K%',
      labelCls:  'text-cyan-600',
      fmt:       (r) => pctFmt(transAtkData.free.byRotation[r]?.k ?? 0, transAtkData.free.byRotation[r]?.ta ?? 0),
      total:     ()  => pctFmt(transAtkData.free.total.k, transAtkData.free.total.ta),
    },
    {
      label:     'FREE HIT%',
      labelCls:  'text-cyan-600',
      fmt:       (r) => effFmt(transAtkData.free.byRotation[r]?.hit_pct),
      total:     ()  => effFmt(transAtkData.free.total.hit_pct),
    },
    {
      label:     'FREE WIN%',
      labelCls:  'text-cyan-600',
      fmt:       (r) => pctFmt(transAtkData.free.byRotation[r]?.win ?? 0, transAtkData.free.byRotation[r]?.ta ?? 0),
      total:     ()  => pctFmt(transAtkData.free.total.win, transAtkData.free.total.ta),
    },
    null,
    {
      label:     'TRANS ATK',
      labelCls:  'text-violet-600',
      fmt:       (r) => cntFmt(n(transAtkData.transition.byRotation[r]?.ta)),
      total:     ()  => cntFmt(n(transAtkData.transition.total.ta)),
    },
    {
      label:     'TRANS K%',
      labelCls:  'text-violet-600',
      fmt:       (r) => pctFmt(transAtkData.transition.byRotation[r]?.k ?? 0, transAtkData.transition.byRotation[r]?.ta ?? 0),
      total:     ()  => pctFmt(transAtkData.transition.total.k, transAtkData.transition.total.ta),
    },
    {
      label:     'TRANS HIT%',
      labelCls:  'text-violet-600',
      fmt:       (r) => effFmt(transAtkData.transition.byRotation[r]?.hit_pct),
      total:     ()  => effFmt(transAtkData.transition.total.hit_pct),
    },
    {
      label:     'TRANS WIN%',
      labelCls:  'text-violet-600',
      fmt:       (r) => pctFmt(transAtkData.transition.byRotation[r]?.win ?? 0, transAtkData.transition.byRotation[r]?.ta ?? 0),
      total:     ()  => pctFmt(transAtkData.transition.total.win, transAtkData.transition.total.ta),
    },
  ];

  return (
    <div className="px-4 pt-3 pb-4">
      <div className="text-xs font-bold uppercase tracking-widest text-slate-500 text-center mb-2">
        In-System / Out-of-System
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-center min-w-[340px]">
          <thead>
            <tr>
              <th className="text-left text-[10px] text-slate-600 pr-2 pb-1 uppercase tracking-wide w-14">Stat</th>
              {ROTATIONS.map((r) => (
                <th key={r} className="text-[11px] font-black text-orange-400 pb-1">R{r}</th>
              ))}
              <th className="text-[11px] font-black text-slate-400 pb-1">TOT</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              if (row === null) return (
                <tr key={`div-${i}`}><td colSpan={8} className="py-0.5"><div className="border-t border-slate-800" /></td></tr>
              );
              return (
                <tr key={row.label} className="border-b border-slate-800/50">
                  <td className={`text-left text-[10px] uppercase tracking-wide pr-2 py-1 font-semibold ${row.labelCls}`}>
                    {row.label}
                  </td>
                  {ROTATIONS.map((r) => {
                    const val = row.fmt(r);
                    return (
                      <td key={r} className={`text-[12px] font-bold tabular-nums py-1 ${val !== '—' ? 'text-slate-200' : 'text-slate-700'}`}>
                        {val}
                      </td>
                    );
                  })}
                  <td className="text-[12px] font-bold tabular-nums py-1 text-slate-300">
                    {row.total()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-slate-600 mt-2 text-center">
        IS/OOS = serve rec pass rating · FREE = freeball dig · TRANS = any dig
      </p>
    </div>
  );
}
