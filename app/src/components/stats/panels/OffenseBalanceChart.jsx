import { useMemo, useState } from 'react';
import { fmtHitting } from '../../../stats/formatters';

const POS_CFG = {
  OH:    { label: 'OH',    barCls: 'bg-orange-500', textCls: 'text-orange-400' },
  MB:    { label: 'MB',    barCls: 'bg-indigo-500', textCls: 'text-indigo-400' },
  OPP:   { label: 'OPP',  barCls: 'bg-purple-500', textCls: 'text-purple-400' },
  Other: { label: 'Other', barCls: 'bg-slate-500',  textCls: 'text-slate-400'  },
};
const PRIMARY_POS = ['OH', 'MB', 'OPP'];

function buildPosGroups(playerStats, positionMap) {
  const acc = {};
  for (const key of [...PRIMARY_POS, 'Other']) acc[key] = { ta: 0, k: 0, ae: 0 };
  for (const [playerId, s] of Object.entries(playerStats)) {
    const pos = positionMap[Number(playerId)] ?? positionMap[playerId];
    const grp = PRIMARY_POS.includes(pos) ? pos : 'Other';
    acc[grp].ta += s.ta ?? 0;
    acc[grp].k  += s.k  ?? 0;
    acc[grp].ae += s.ae ?? 0;
  }
  return [...PRIMARY_POS, 'Other']
    .map((pos) => ({ pos, ...acc[pos], hit_pct: acc[pos].ta > 0 ? (acc[pos].k - acc[pos].ae) / acc[pos].ta : null }))
    .filter((g) => g.ta > 0);
}

export function OffenseBalanceChart({ setPlayerStats, matchPlayerStats, positionMap }) {
  const [scope, setScope] = useState('set');
  const playerStats = scope === 'set' ? setPlayerStats : matchPlayerStats;
  const groups = useMemo(() => buildPosGroups(playerStats, positionMap), [playerStats, positionMap]);

  const totalK  = groups.reduce((s, g) => s + g.k,  0);
  const totalTA = groups.reduce((s, g) => s + g.ta, 0);
  const totalAE = groups.reduce((s, g) => s + g.ae, 0);
  const teamHit = totalTA > 0 ? (totalK - totalAE) / totalTA : null;

  return (
    <div className="px-4 pt-3 pb-5">
      {/* Header + toggle */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
          Offense Balance
        </span>
        <div className="flex gap-1">
          {['set', 'match'].map((s) => (
            <button
              key={s}
              onPointerDown={(e) => { e.preventDefault(); setScope(s); }}
              className={`px-2.5 py-0.5 rounded text-[10px] font-bold transition-colors ${
                scope === s ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
              }`}
            >
              {s.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {totalTA === 0 ? (
        <p className="text-xs text-slate-600 text-center py-3">No attack data yet</p>
      ) : (
        <>
          {/* Kill distribution — stacked bar */}
          <div className="mb-4">
            <p className="text-[10px] text-slate-600 mb-1.5 text-center uppercase tracking-wide">Kill Share</p>
            <div className="flex h-6 rounded overflow-hidden gap-px">
              {groups.map((g) => {
                const pct = totalK > 0 ? (g.k / totalK) * 100 : 0;
                if (pct === 0) return null;
                const cfg = POS_CFG[g.pos] ?? POS_CFG.Other;
                return (
                  <div
                    key={g.pos}
                    style={{ width: `${pct}%` }}
                    className={`${cfg.barCls} flex items-center justify-center text-[9px] font-black text-white/90 transition-all`}
                  >
                    {pct >= 11 ? g.pos : ''}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-center gap-4 mt-1.5 flex-wrap">
              {groups.map((g) => {
                const pct = totalK > 0 ? Math.round(g.k / totalK * 100) : 0;
                const cfg = POS_CFG[g.pos] ?? POS_CFG.Other;
                return (
                  <span key={g.pos} className={`text-[10px] font-bold ${cfg.textCls}`}>
                    {g.pos} {pct}% ({g.k}K)
                  </span>
                );
              })}
            </div>
          </div>

          {/* TA share — per-position bars */}
          <div className="mb-4">
            <p className="text-[10px] text-slate-600 mb-1.5 text-center uppercase tracking-wide">Attack Volume (TA)</p>
            <div className="space-y-1.5">
              {groups.map((g) => {
                const pct = totalTA > 0 ? (g.ta / totalTA) * 100 : 0;
                const cfg = POS_CFG[g.pos] ?? POS_CFG.Other;
                return (
                  <div key={g.pos} className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold w-8 text-right ${cfg.textCls}`}>{g.pos}</span>
                    <div className="flex-1 h-3 bg-slate-800 rounded overflow-hidden">
                      <div className={`h-full ${cfg.barCls} rounded transition-all opacity-80`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[10px] text-slate-400 tabular-nums w-16 text-right">{Math.round(pct)}% · {g.ta}ta</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Stats table */}
          <table className="w-full">
            <thead>
              <tr className="text-[10px] text-slate-600 uppercase tracking-wide border-b border-slate-800">
                <th className="text-left pb-1">Pos</th>
                <th className="pb-1">TA</th>
                <th className="pb-1">K</th>
                <th className="pb-1">AE</th>
                <th className="pb-1">HIT%</th>
                <th className="pb-1">K%</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const cfg = POS_CFG[g.pos] ?? POS_CFG.Other;
                const hitStr = fmtHitting(g.hit_pct);
                const kPct = g.ta > 0 ? Math.round(g.k / g.ta * 100) + '%' : '—';
                return (
                  <tr key={g.pos} className="border-b border-slate-800/50">
                    <td className={`text-left text-xs font-bold py-1.5 ${cfg.textCls}`}>{g.pos}</td>
                    <td className="text-center text-xs tabular-nums text-slate-300 py-1.5">{g.ta}</td>
                    <td className="text-center text-xs tabular-nums text-slate-300 py-1.5">{g.k}</td>
                    <td className="text-center text-xs tabular-nums text-slate-300 py-1.5">{g.ae}</td>
                    <td className="text-center text-xs tabular-nums font-bold text-slate-200 py-1.5">{hitStr}</td>
                    <td className="text-center text-xs tabular-nums text-slate-300 py-1.5">{kPct}</td>
                  </tr>
                );
              })}
              <tr className="text-[10px] text-slate-500 uppercase">
                <td className="text-left pt-1.5 font-semibold">TEAM</td>
                <td className="text-center pt-1.5 tabular-nums">{totalTA}</td>
                <td className="text-center pt-1.5 tabular-nums">{totalK}</td>
                <td className="text-center pt-1.5 tabular-nums">{totalAE}</td>
                <td className="text-center pt-1.5 tabular-nums font-bold text-slate-400">
                  {teamHit != null ? (teamHit >= 0 ? '+' : '') + (teamHit * 1000).toFixed(0) : '—'}
                </td>
                <td className="text-center pt-1.5 tabular-nums">
                  {totalTA > 0 ? Math.round(totalK / totalTA * 100) + '%' : '—'}
                </td>
              </tr>
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
