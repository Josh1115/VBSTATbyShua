import { fmtHitting } from '../../../stats/formatters';

const pct    = (v) => v != null ? Math.round(v * 100) + '%' : '—';
const dec1   = (v) => v != null ? v.toFixed(1) : '—';
const hitFmt = fmtHitting;
const n      = (v) => v ?? 0;

export function RotationTable({ rotPts, rotContacts }) {
  const ROTATIONS = [1, 2, 3, 4, 5, 6];

  const rows = [
    { label: 'WIN%',  fmt: (r) => pct(rotPts[r]?.win_pct)    },
    { label: 'S/O%',  fmt: (r) => pct(rotPts[r]?.so_pct)     },
    { label: 'SRV%',  fmt: (r) => pct(rotPts[r]?.bp_pct)     },
    { label: 'PTS W', fmt: (r) => n(rotPts[r]?.pts_won)      },
    { label: 'PTS L', fmt: (r) => n(rotPts[r]?.pts_lost)     },
    null, // divider
    { label: 'K',     fmt: (r) => n(rotContacts[r]?.k)       },
    { label: 'ACE',   fmt: (r) => n(rotContacts[r]?.ace)     },
    { label: 'ERR',   fmt: (r) => n(rotContacts[r]?.ae) + n(rotContacts[r]?.se) },
    { label: 'APR',   fmt: (r) => dec1(rotContacts[r]?.apr)  },
    { label: 'HIT%',  fmt: (r) => hitFmt(rotContacts[r]?.hit_pct) },
  ];

  return (
    <div className="px-4 pt-3 pb-4">
      <div className="text-xs font-bold uppercase tracking-widest text-slate-500 text-center mb-2">
        Rotation Analysis
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-center min-w-[320px]">
          <thead>
            <tr>
              <th className="text-left text-[10px] text-slate-600 pr-2 pb-1 uppercase tracking-wide w-12">Stat</th>
              {ROTATIONS.map((r) => (
                <th key={r} className="text-[11px] font-black text-orange-400 pb-1">R{r}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              if (row === null) return (
                <tr key={`div-${i}`}><td colSpan={7} className="py-0.5"><div className="border-t border-slate-800" /></td></tr>
              );
              return (
                <tr key={row.label} className="border-b border-slate-800/50">
                  <td className="text-left text-[10px] text-slate-500 uppercase tracking-wide pr-2 py-1">{row.label}</td>
                  {ROTATIONS.map((r) => {
                    const val = row.fmt(r);
                    const hasData = rotPts[r]?.pts_total > 0 || (rotContacts[r] && (rotContacts[r].k > 0 || rotContacts[r].sa > 0 || rotContacts[r].pa > 0));
                    return (
                      <td
                        key={r}
                        className={`text-[12px] font-bold tabular-nums py-1 ${hasData ? 'text-slate-200' : 'text-slate-700'}`}
                      >
                        {val}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-slate-600 mt-2 text-center">
        S/O% = sideout when receiving · SRV% = point scored when serving
      </p>
    </div>
  );
}
