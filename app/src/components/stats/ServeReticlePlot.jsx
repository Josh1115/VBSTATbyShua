import { useState } from 'react';
import { fmtPct } from '../../stats/formatters';

const RETICLE_ZONE_GRID = [[1, 6, 5], [2, 3, 4]];
const RW = 912, RH = 608;

// Normalize 'top' → 'topspin' so both the chip filter value ('top') and
// the stored DB value ('topspin') are handled correctly.
function normalizeServeType(st) {
  return st === 'top' ? 'topspin' : st;
}

function SubToggle({ options, value, onChange }) {
  return (
    <div className="flex gap-1 mb-3">
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`flex-1 py-1.5 rounded text-xs font-bold transition-colors ${
            value === v ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Individual player serve placement card.
 * player: a playerRow ({ id, name, sa, ace, si_pct, ... })
 * contacts: raw contact array (already filtered to the relevant scope)
 * playerJerseys: { [playerId]: jerseyNumber }
 */
export function PlayerServePlacementCard({ player, contacts, playerJerseys }) {
  const [serveType, setServeType] = useState('all');

  const jersey = playerJerseys?.[player.id] ?? '';
  const pid    = Number(player.id);
  const type   = normalizeServeType(serveType);

  const serves = contacts.filter(c =>
    c.action === 'serve' && !c.opponent_contact &&
    c.player_id === pid && c.court_x != null &&
    (type === 'all' || c.serve_type === type)
  );

  const zoneCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  for (const c of serves) if (c.zone) zoneCounts[c.zone]++;

  return (
    <div className="mt-3 bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="font-bold text-white text-sm">
            {jersey ? `#${jersey} ` : ''}{player.name}
          </span>
          <span className="text-xs text-slate-400">
            {player.sa ?? 0} SA · {player.ace ?? 0} ACE · {fmtPct(player.si_pct)} SI%
          </span>
        </div>
        <SubToggle
          options={[['all', 'ALL'], ['float', 'FLOAT'], ['topspin', 'TOP SPIN']]}
          value={serveType}
          onChange={setServeType}
        />
      </div>

      {/* Court */}
      {serves.length === 0 ? (
        <p className="text-xs text-slate-500 text-center py-5">
          No serve placement data for this filter
        </p>
      ) : (
        <div className="px-3 pb-3">
          <div className="rounded-lg overflow-hidden" style={{ aspectRatio: `${RW} / ${RH}` }}>
            <svg viewBox={`0 0 ${RW} ${RH}`} style={{ width: '100%', height: '100%', display: 'block' }}>
              <rect width={RW} height={RH} fill="#0f172a" />

              {/* Zone cells with count overlay */}
              {RETICLE_ZONE_GRID.map((row, ri) =>
                row.map((zone, ci) => {
                  const x  = ci * (RW / 3);
                  const y  = ri * (RH / 2);
                  const ct = zoneCounts[zone] ?? 0;
                  return (
                    <g key={zone}>
                      <rect x={x} y={y} width={RW / 3} height={RH / 2}
                        fill="transparent" stroke="#334155" strokeWidth={1} />
                      <text x={x + RW / 6} y={y + RH / 4}
                        textAnchor="middle" dominantBaseline="middle"
                        fill="rgba(148,163,184,0.2)" fontSize={22} fontWeight="bold"
                      >{zone}</text>
                      {ct > 0 && (
                        <text x={x + RW / 3 - 10} y={y + 18}
                          textAnchor="end" dominantBaseline="middle"
                          fill="rgba(148,163,184,0.5)" fontSize={13} fontWeight="bold"
                        >×{ct}</text>
                      )}
                    </g>
                  );
                })
              )}

              {/* Net */}
              <line x1={0} y1={RH - 2} x2={RW} y2={RH - 2} stroke="#f97316" strokeWidth={3} />
              <text x={RW / 2} y={RH - 14} textAnchor="middle" dominantBaseline="middle"
                fill="#f97316" fontSize={18} fontWeight="bold" letterSpacing={4} opacity={0.75}
              >NET</text>

              {/* Reticles */}
              {serves.map((c) =>
                c.result === 'ace' ? (
                  <text key={c.id} x={c.court_x * RW} y={c.court_y * RH}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={16} fill="#f59e0b"
                  >★</text>
                ) : (
                  <circle key={c.id} cx={c.court_x * RW} cy={c.court_y * RH}
                    r={7} fill="rgba(52,211,153,0.2)" stroke="#34d399" strokeWidth={2}
                  />
                )
              )}
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Team-level serve placement court.
 * contacts: raw contact array
 * serveType: 'all' | 'float' | 'top' | 'topspin'
 */
export function ServeReticlePlot({ contacts, serveType }) {
  const type = normalizeServeType(serveType);

  const serves = contacts.filter(c =>
    c.action === 'serve' && !c.opponent_contact && c.court_x != null &&
    (type === 'all' || c.serve_type === type)
  );
  if (!serves.length) return null;

  const zoneCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  for (const c of serves) if (c.zone) zoneCounts[c.zone]++;

  const aces = serves.filter(c => c.result === 'ace').length;
  const ins  = serves.filter(c => c.result !== 'ace').length;

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Serve Placement</p>
        <div className="flex gap-3 text-xs text-slate-400">
          {aces > 0 && <span className="text-yellow-400 font-bold">★ {aces} ace{aces !== 1 ? 's' : ''}</span>}
          {ins > 0  && <span className="text-emerald-400 font-bold">○ {ins} in-play</span>}
        </div>
      </div>
      <div className="rounded-lg overflow-hidden" style={{ aspectRatio: `${RW} / ${RH}` }}>
        <svg viewBox={`0 0 ${RW} ${RH}`} style={{ width: '100%', height: '100%', display: 'block' }}>
          <rect width={RW} height={RH} fill="#0f172a" />

          {/* Zone cells with count overlay */}
          {RETICLE_ZONE_GRID.map((row, ri) =>
            row.map((zone, ci) => {
              const x  = ci * (RW / 3);
              const y  = ri * (RH / 2);
              const ct = zoneCounts[zone] ?? 0;
              return (
                <g key={zone}>
                  <rect x={x} y={y} width={RW / 3} height={RH / 2}
                    fill="transparent" stroke="#334155" strokeWidth={1} />
                  <text x={x + RW / 6} y={y + RH / 4}
                    textAnchor="middle" dominantBaseline="middle"
                    fill="rgba(148,163,184,0.25)" fontSize={22} fontWeight="bold"
                  >{zone}</text>
                  {ct > 0 && (
                    <text x={x + RW / 3 - 10} y={y + 18}
                      textAnchor="end" dominantBaseline="middle"
                      fill="rgba(148,163,184,0.5)" fontSize={13} fontWeight="bold"
                    >×{ct}</text>
                  )}
                </g>
              );
            })
          )}

          {/* Net line */}
          <line x1={0} y1={RH - 2} x2={RW} y2={RH - 2} stroke="#f97316" strokeWidth={3} />
          <text x={RW / 2} y={RH - 14} textAnchor="middle" dominantBaseline="middle"
            fill="#f97316" fontSize={18} fontWeight="bold" letterSpacing={4} opacity={0.75}
          >NET</text>

          {/* Reticles */}
          {serves.map((c) =>
            c.result === 'ace' ? (
              <text key={c.id} x={c.court_x * RW} y={c.court_y * RH}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={16} fill="#f59e0b"
              >★</text>
            ) : (
              <circle key={c.id} cx={c.court_x * RW} cy={c.court_y * RH}
                r={7} fill="rgba(52,211,153,0.2)" stroke="#34d399" strokeWidth={2}
              />
            )
          )}
        </svg>
      </div>
    </div>
  );
}
