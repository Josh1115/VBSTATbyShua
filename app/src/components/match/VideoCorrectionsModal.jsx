import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../../db/schema';

const CORRECTION_FIELDS = [
  // Attack — K and AE each also increment ta via engine accumulator
  { key: 'k',   label: 'K (+TA)',      action: 'attack',           result: 'kill'               },
  { key: 'ae',  label: 'AE (+TA)',     action: 'attack',           result: 'error'              },
  { key: 'ta',  label: 'TA (in-play)', action: 'attack',           result: 'in_play'            },
  // Serve — ACE and SE each also increment sa
  { key: 'ace', label: 'ACE (+SA)',    action: 'serve',            result: 'ace'                },
  { key: 'se',  label: 'SE (+SA)',     action: 'serve',            result: 'error'              },
  { key: 'sa',  label: 'SA (in-play)', action: 'serve',            result: 'in'                 },
  // Pass — each also increments pa
  { key: 'p3',  label: 'P3 (+PA)',     action: 'pass',             result: '3'                  },
  { key: 'p2',  label: 'P2 (+PA)',     action: 'pass',             result: '2'                  },
  { key: 'p1',  label: 'P1 (+PA)',     action: 'pass',             result: '1'                  },
  { key: 'p0',  label: 'P0 (+PA)',     action: 'pass',             result: '0'                  },
  // Defense
  { key: 'dig', label: 'DIG',          action: 'dig',              result: 'success'            },
  { key: 'de',  label: 'DE',           action: 'dig',              result: 'error'              },
  // Block
  { key: 'bs',  label: 'BS',           action: 'block',            result: 'solo'               },
  { key: 'ba',  label: 'BA',           action: 'block',            result: 'assist'             },
  { key: 'be',  label: 'BE',           action: 'block',            result: 'error'              },
  // Set
  { key: 'ast', label: 'AST',          action: 'set',              result: 'assist'             },
  { key: 'bhe', label: 'BHE',          action: 'set',              result: 'ball_handling_error'},
  { key: 'fbe', label: 'FBE',          action: 'freeball_receive', result: 'free_ball_error'    },
];

const GROUPS = [
  { label: 'Attack',  keys: ['k', 'ae', 'ta'] },
  { label: 'Serve',   keys: ['ace', 'se', 'sa'] },
  { label: 'Pass',    keys: ['p3', 'p2', 'p1', 'p0'] },
  { label: 'Defense', keys: ['dig', 'de'] },
  { label: 'Block',   keys: ['bs', 'ba', 'be'] },
  { label: 'Set',     keys: ['ast', 'bhe', 'fbe'] },
];

const FIELD_MAP = Object.fromEntries(CORRECTION_FIELDS.map((f) => [f.key, f]));

// ta displayed as in-play only (k and ae each auto-increment ta in engine)
function displayValue(key, ps) {
  if (!ps) return 0;
  if (key === 'ta') return Math.max(0, (ps.ta ?? 0) - (ps.k ?? 0) - (ps.ae ?? 0));
  if (key === 'sa') return Math.max(0, (ps.sa ?? 0) - (ps.ace ?? 0) - (ps.se ?? 0));
  return ps[key] ?? 0;
}

async function applyCorrection(matchId, firstSetId, playerId, field, delta) {
  await db.contacts.add({
    match_id:         matchId,
    set_id:           firstSetId,
    player_id:        playerId,
    action:           field.action,
    result:           field.result,
    count:            delta,
    rotation_num:     0,
    rally_number:     0,
    opponent_contact: false,
    synthetic:        true,
    source:           'video_correction',
    timestamp:        Date.now(),
  });
}

export function VideoCorrectionsModal({ matchId, sets, playerList, displayStats, onCorrect, onClose }) {
  const firstSetId = sets[0]?.id ?? null;

  const [selectedPlayerId, setSelectedPlayerId] = useState(() => playerList[0]?.id ?? null);

  const allCorrections = useLiveQuery(
    () => db.contacts.where('match_id').equals(matchId).filter((c) => c.source === 'video_correction').toArray(),
    [matchId]
  );

  const playerCorrections = (allCorrections ?? []).filter((c) => c.player_id === selectedPlayerId);

  const ps = displayStats?.players?.[selectedPlayerId] ?? null;

  async function handleStep(field, delta) {
    if (!selectedPlayerId || firstSetId == null) return;
    await applyCorrection(matchId, firstSetId, selectedPlayerId, field, delta);
    onCorrect();
  }

  async function handleDelete(correctionId) {
    await db.contacts.delete(correctionId);
    onCorrect();
  }

  const selectedPlayer = playerList.find((p) => p.id === selectedPlayerId);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-surface rounded-2xl w-full max-w-lg my-4">

        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Video Corrections</h2>
            <p className="text-xs text-slate-400 mt-0.5">Adjust individual stat counts from tagged footage</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-5">

          {/* Player picker */}
          <select
            value={selectedPlayerId ?? ''}
            onChange={(e) => setSelectedPlayerId(Number(e.target.value))}
            className="w-full bg-slate-700 rounded-lg px-3 py-2.5 text-sm text-white border border-slate-600 focus:outline-none focus:border-primary"
          >
            {playerList.map((p) => (
              <option key={p.id} value={p.id}>#{p.jersey_number} {p.name}</option>
            ))}
          </select>

          {/* Stat steppers */}
          {GROUPS.map((group) => (
            <div key={group.label}>
              <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-2">{group.label}</p>
              <div className="grid grid-cols-3 gap-2">
                {group.keys.map((key) => {
                  const field = FIELD_MAP[key];
                  const val   = displayValue(key, ps);
                  return (
                    <div key={key} className="bg-slate-800 rounded-xl p-2 flex flex-col items-center gap-1">
                      <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide leading-none">
                        {field.label}
                      </span>
                      <span className="text-lg font-black tabular-nums text-white">{val}</span>
                      <div className="flex gap-1 w-full">
                        <button
                          disabled={val <= 0}
                          onClick={() => handleStep(field, -1)}
                          className="flex-1 py-1 rounded-lg bg-slate-700 text-white font-bold text-sm disabled:opacity-30 active:brightness-75"
                        >
                          −
                        </button>
                        <button
                          onClick={() => handleStep(field, +1)}
                          className="flex-1 py-1 rounded-lg bg-primary text-white font-bold text-sm active:brightness-75"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Existing corrections for this player */}
          {playerCorrections.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-2">
                Corrections for #{selectedPlayer?.jersey_number} {selectedPlayer?.name}
              </p>
              <div className="space-y-1">
                {playerCorrections.map((c) => (
                  <div key={c.id} className="flex items-center justify-between bg-slate-800 rounded-lg px-3 py-2">
                    <span className="text-xs text-slate-300 font-mono">
                      {c.action} · {c.result} · {c.count > 0 ? `+${c.count}` : c.count}
                    </span>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="text-xs text-red-400 hover:text-red-300 font-semibold ml-4"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        <div className="px-5 pb-5">
          <button onClick={onClose} className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-xl text-sm transition-colors">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
