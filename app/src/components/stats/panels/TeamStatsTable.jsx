import { fmtHitting, fmtPassRating } from '../../../stats/formatters';

export function TeamStatsTable({ t, opp }) {
  const n = (v) => v ?? 0;
  const rows = [
    { label: 'Kills',   us: n(t.k),                  them: n(opp.k)   },
    { label: 'Aces',    us: n(t.ace),                 them: n(opp.ace) },
    { label: 'Srv Err', us: n(t.se),                  them: n(opp.se)  },
    { label: 'Blocks',  us: n(t.bs) + n(t.ba) * 0.5,  them: n(opp.blk) },
    { label: 'Digs',    us: n(t.dig),                 them: '—'        },
    { label: 'Hit%',    us: fmtHitting(t.hit_pct),    them: '—'        },
    { label: 'APR',     us: fmtPassRating(t.apr),     them: '—'        },
  ];
  return (
    <div className="px-4 pt-3 pb-4">
      <div className="text-xs font-bold uppercase tracking-widest text-slate-500 text-center mb-2">
        Team Stats
      </div>
      <table className="w-full">
        <thead>
          <tr className="text-xs text-slate-600 uppercase tracking-wide">
            <th className="text-right pr-2 pb-1 w-20">US</th>
            <th className="text-center px-4 pb-1" />
            <th className="text-left pl-2 pb-1 w-20">THEM</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ label, us, them }) => (
            <tr key={label} className="border-b border-slate-800">
              <td className="py-1.5 pr-2 text-right text-slate-200 font-bold tabular-nums">{us}</td>
              <td className="py-1.5 px-4 text-center text-xs text-slate-500 uppercase tracking-wide">{label}</td>
              <td className="py-1.5 pl-2 text-left text-slate-400 tabular-nums">{them}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
