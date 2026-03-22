import { useState } from 'react';

const ROTATIONS = [1, 2, 3, 4, 5, 6];

/**
 * PlannedSubsEditor — list of planned substitutions for a saved lineup.
 *
 * Props:
 *   serveOrderIds  — string[6] player IDs in serve order (index 0 = serve_order 1)
 *   players        — Player[] full active roster (for bench + on-court names)
 *   liberoPlayerId — number | null (excluded from both sides)
 *   plannedSubs    — Array<{ rotation, player_out_so, player_in_id }> | null
 *   onChange       — (newPlannedSubs) => void
 */
export function PlannedSubsEditor({ serveOrderIds, players, liberoPlayerId, plannedSubs, onChange }) {
  const [addRotation, setAddRotation] = useState(1);
  const [addOutSo,    setAddOutSo]    = useState('');
  const [addInId,     setAddInId]     = useState('');

  const subs = plannedSubs ?? [];
  const onCourtIds = new Set((serveOrderIds ?? []).map(Number).filter(Boolean));
  const bench = (players ?? []).filter(
    (p) => !onCourtIds.has(p.id) && p.id !== liberoPlayerId
  );

  const getOnCourtPlayer = (soIdx) => {
    const pid = serveOrderIds?.[soIdx];
    return pid ? (players ?? []).find((p) => String(p.id) === String(pid)) : null;
  };

  const handleAdd = () => {
    if (addOutSo === '' || !addInId) return;
    const newSub = {
      rotation:      addRotation,
      player_out_so: Number(addOutSo),
      player_in_id:  Number(addInId),
    };
    onChange([...subs, newSub]);
    setAddOutSo('');
    setAddInId('');
  };

  const handleDelete = (idx) => {
    onChange(subs.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3">
      {/* Existing entries */}
      {subs.length === 0 ? (
        <p className="text-xs text-slate-600 italic">No planned subs yet.</p>
      ) : (
        <div className="space-y-1.5">
          {subs.map((ps, i) => {
            const outPlayer = getOnCourtPlayer(ps.player_out_so);
            const inPlayer  = (players ?? []).find((p) => p.id === ps.player_in_id);
            return (
              <div key={i} className="flex items-center gap-2 bg-slate-800/60 rounded-lg px-3 py-2">
                <span className="text-xs text-slate-400 shrink-0">R{ps.rotation}</span>
                <span className="text-xs font-semibold text-slate-200 flex-1 truncate">
                  {outPlayer ? `#${outPlayer.jersey_number} ${outPlayer.name}` : `SO${ps.player_out_so + 1}`}
                  <span className="text-slate-500 mx-1">→</span>
                  {inPlayer  ? `#${inPlayer.jersey_number} ${inPlayer.name}` : `ID${ps.player_in_id}`}
                </span>
                <button
                  onClick={() => handleDelete(i)}
                  className="text-slate-500 hover:text-red-400 text-xs shrink-0"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add entry */}
      <div className="bg-slate-800/40 rounded-lg px-3 py-2.5 space-y-2">
        <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Add Planned Sub</p>
        <div className="flex gap-2 flex-wrap">
          {/* Rotation picker */}
          <select
            value={addRotation}
            onChange={(e) => setAddRotation(Number(e.target.value))}
            className="bg-surface border border-slate-600 text-white rounded px-2 py-1.5 text-xs focus:outline-none focus:border-primary"
          >
            {ROTATIONS.map((r) => (
              <option key={r} value={r}>Rot {r}</option>
            ))}
          </select>

          {/* Player out (from serve order) */}
          <select
            value={addOutSo}
            onChange={(e) => setAddOutSo(e.target.value)}
            className="flex-1 min-w-0 bg-surface border border-slate-600 text-white rounded px-2 py-1.5 text-xs focus:outline-none focus:border-primary"
          >
            <option value="">— Player Out —</option>
            {(serveOrderIds ?? []).map((pid, i) => {
              const p = (players ?? []).find((pl) => String(pl.id) === String(pid));
              return (
                <option key={i} value={i}>
                  {p ? `#${p.jersey_number} ${p.name}` : `Slot ${i + 1}`}
                </option>
              );
            })}
          </select>

          {/* Player in (from bench) */}
          <select
            value={addInId}
            onChange={(e) => setAddInId(e.target.value)}
            className="flex-1 min-w-0 bg-surface border border-slate-600 text-white rounded px-2 py-1.5 text-xs focus:outline-none focus:border-primary"
          >
            <option value="">— Player In —</option>
            {bench.map((p) => (
              <option key={p.id} value={p.id}>
                #{p.jersey_number} {p.name}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleAdd}
          disabled={addOutSo === '' || !addInId}
          className="w-full py-1.5 rounded text-xs font-semibold bg-primary/80 hover:bg-primary
            disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
        >
          + Add Sub
        </button>
      </div>
    </div>
  );
}
