import { useMemo } from 'react';
import { fmtHitting } from '../../../stats/formatters';

const POS_ORDER  = ['OH', 'MB', 'OPP', 'S'];
const POS_LABELS = { OH: 'Outside', MB: 'Middle', OPP: 'Opposite/RS', S: 'Setter' };
const POS_COLORS = {
  OH:  { text: 'text-orange-400' },
  MB:  { text: 'text-indigo-400' },
  OPP: { text: 'text-purple-400' },
  S:   { text: 'text-sky-400'    },
};

function normalizePos(pos) {
  return pos === 'RS' ? 'OPP' : pos;
}

function computeByRotation(contacts, positionMap) {
  const byRot = {};
  for (let r = 1; r <= 6; r++) {
    byRot[r] = {};
    for (const pos of POS_ORDER) byRot[r][pos] = { ta: 0, k: 0, ae: 0 };
  }
  for (const c of contacts) {
    if (c.opponent_contact || c.action !== 'attack') continue;
    const rot = c.rotation_num;
    if (!rot || rot < 1 || rot > 6) continue;
    const rawPos = positionMap[c.player_id] ?? positionMap[Number(c.player_id)];
    const pos = normalizePos(rawPos);
    if (!POS_ORDER.includes(pos)) continue;
    byRot[rot][pos].ta++;
    if (c.result === 'kill')  byRot[rot][pos].k++;
    if (c.result === 'error') byRot[rot][pos].ae++;
  }
  return byRot;
}

export function SetDistByRotationPanel({ contacts, positionMap }) {
  const byRot = useMemo(
    () => computeByRotation(contacts ?? [], positionMap ?? {}),
    [contacts, positionMap]
  );

  const hasData = Object.values(byRot).some(g =>
    POS_ORDER.some(pos => g[pos].ta > 0)
  );
  if (!hasData) return null;

  return (
    <div className="bg-surface rounded-xl p-3">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">
        Set Distribution by Rotation
      </p>
      <div className="space-y-5">
        {Array.from({ length: 6 }, (_, i) => i + 1).map(rot => {
          const group   = byRot[rot];
          const totalTA = POS_ORDER.reduce((s, p) => s + group[p].ta, 0);
          if (totalTA === 0) return null;
          const totalK  = POS_ORDER.reduce((s, p) => s + group[p].k,  0);
          const totalAE = POS_ORDER.reduce((s, p) => s + group[p].ae, 0);
          const rotHit  = fmtHitting((totalK - totalAE) / totalTA);
          const rotKPct = Math.round(totalK / totalTA * 100) + '%';
          const maxTA   = Math.max(...POS_ORDER.map(p => group[p].ta));

          return (
            <div key={rot}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black text-slate-200 bg-slate-700 rounded px-1.5 py-0.5">R{rot}</span>
                <span className="text-[10px] text-slate-400 tabular-nums">
                  <span className="font-bold text-white">{totalTA}</span> TA · <span className="font-bold text-white">{totalK}</span> K · <span className="font-bold text-white">{totalAE}</span> AE · <span className="font-bold text-white">{rotHit}</span> · <span className="font-bold text-white">{rotKPct}</span>
                </span>
              </div>
              <div className="space-y-1.5 pl-1">
                {POS_ORDER.map(pos => {
                  const g = group[pos];
                  if (g.ta === 0) return null;
                  const sharePct = Math.round(g.ta / totalTA * 100);
                  const kW      = (g.k  / g.ta) * 100;
                  const eW      = (g.ae / g.ta) * 100;
                  const inPlayW = Math.max(0, 100 - kW - eW);
                  const barW    = (g.ta / maxTA) * 100;
                  const hitting = (g.k - g.ae) / g.ta;
                  const clr     = POS_COLORS[pos];
                  return (
                    <div key={pos}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className={`text-[10px] font-bold ${clr.text}`}>
                          {POS_LABELS[pos]}
                          <span className="ml-1 text-slate-600 font-normal">{sharePct}%</span>
                        </span>
                        <span className="text-[10px] text-slate-500 tabular-nums">
                          {g.ta} TA · {g.k} K · {g.ae} AE · {fmtHitting(hitting)}
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
                        <div className="h-full flex rounded-full overflow-hidden" style={{ width: `${barW}%` }}>
                          <div className="bg-emerald-500 h-full" style={{ width: `${kW}%` }} />
                          <div className="bg-slate-600 h-full"   style={{ width: `${inPlayW}%` }} />
                          <div className="bg-red-500 h-full"     style={{ width: `${eW}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div className="flex gap-4 pt-1 border-t border-slate-800/50">
          {[['bg-emerald-500', 'Kill'], ['bg-slate-600', 'In Play'], ['bg-red-500', 'Error']].map(([cls, lbl]) => (
            <span key={lbl} className="flex items-center gap-1 text-[10px] text-slate-500">
              <span className={`w-2 h-2 rounded-sm ${cls} inline-block`} />{lbl}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
