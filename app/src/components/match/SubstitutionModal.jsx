import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useMatchStore } from '../../store/matchStore';
import { db } from '../../db/schema';

const POSITION_OPTIONS = ['OH', 'OPP', 'MB', 'S', 'L', 'DS', 'RS'];


export function SubstitutionModal({ onClose }) {
  const lineup              = useMatchStore((s) => s.lineup);
  const teamId              = useMatchStore((s) => s.teamId);
  const liberoId            = useMatchStore((s) => s.liberoId);
  const subsUsed            = useMatchStore((s) => s.subsUsed);
  const maxSubsPerSet        = useMatchStore((s) => s.maxSubsPerSet);
  const subPairs            = useMatchStore((s) => s.subPairs);
  const exhaustedPlayerIds  = useMatchStore((s) => s.exhaustedPlayerIds);
  const substitutePlayer    = useMatchStore((s) => s.substitutePlayer);
  const plannedSubs         = useMatchStore((s) => s.plannedSubs);
  const rotationNum         = useMatchStore((s) => s.rotationNum);

  const [outPlayerId,   setOutPlayerId]   = useState(null);
  const [inPlayerId,    setInPlayerId]    = useState(null);
  const [roleOverride,  setRoleOverride]  = useState('');
  const [error,         setError]         = useState('');

  const roster = useLiveQuery(
    () => teamId ? db.players.where('team_id').equals(teamId).filter((p) => p.is_active).toArray() : [],
    [teamId]
  );

  const onCourtIds = new Set(lineup.map((sl) => sl.playerId).filter(Boolean));
  // Bench = active roster minus on-court players; libero handled separately
  const bench = (roster ?? []).filter((p) => !onCourtIds.has(p.id) && p.id !== liberoId);

  // Planned sub shortcuts for the current rotation
  const applicablePlannedSubs = useMemo(() => {
    if (!plannedSubs?.length || !roster) return [];
    return plannedSubs
      .filter((ps) => ps.rotation === rotationNum)
      .map((ps) => {
        const outSlot = lineup.find((sl) => sl.serveOrder === ps.player_out_so + 1);
        if (!outSlot?.playerId) return null;
        if (exhaustedPlayerIds.includes(outSlot.playerId)) return null;
        const inPlayer = roster.find((p) => p.id === ps.player_in_id);
        if (!inPlayer || onCourtIds.has(inPlayer.id) || inPlayer.id === liberoId) return null;
        if (exhaustedPlayerIds.includes(inPlayer.id)) return null;
        return { outSlot, inPlayer };
      })
      .filter(Boolean);
  }, [plannedSubs, rotationNum, lineup, exhaustedPlayerIds, roster, onCourtIds, liberoId]);

  // Clear bench selection when the court selection changes
  useEffect(() => {
    setInPlayerId(null);
    setRoleOverride('');
  }, [outPlayerId]);

  // Pre-fill role override from incoming player's roster position
  useEffect(() => {
    if (!inPlayerId || !roster) return;
    const p = roster.find((pl) => pl.id === inPlayerId);
    setRoleOverride(p?.position ?? '');
  }, [inPlayerId, roster]);

  const outSlotIdx = outPlayerId ? lineup.findIndex((sl) => sl.playerId === outPlayerId) : -1;
  const subsLeft   = maxSubsPerSet - subsUsed;
  const atMax      = subsLeft <= 0;

  const handleConfirm = async () => {
    if (!outPlayerId || !inPlayerId) return;
    const inPlayer = bench.find((p) => p.id === inPlayerId);
    if (!inPlayer) return;
    const ok = await substitutePlayer(outPlayerId, inPlayer, roleOverride || undefined);
    if (ok) onClose();
    else setError('Substitution failed. Check sub limits.');
  };

  return (
    <Modal
      title="Substitution"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            disabled={!outPlayerId || !inPlayerId || atMax}
            onClick={handleConfirm}
          >
            Confirm Sub
          </Button>
        </>
      }
    >
      <div className="space-y-4">

        {/* ── Planned Sub Shortcuts ── */}
        {applicablePlannedSubs.length > 0 && !atMax && (
          <div>
            <p className="text-xs text-slate-400 mb-1.5 font-semibold uppercase tracking-wide">
              Planned Subs — Rotation {rotationNum}
            </p>
            <div className="space-y-1.5">
              {applicablePlannedSubs.map(({ outSlot, inPlayer }, idx) => (
                <button
                  key={idx}
                  onClick={async () => {
                    const ok = await substitutePlayer(outSlot.playerId, inPlayer, undefined);
                    if (ok) onClose();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-900/30
                    border border-emerald-700 hover:bg-emerald-900/50 text-left transition-colors"
                >
                  <span className="text-emerald-400 font-semibold text-xs shrink-0">OUT</span>
                  <span className="text-white text-xs font-bold flex-1 truncate">
                    #{outSlot.jersey} {outSlot.playerName}
                  </span>
                  <span className="text-slate-400 text-xs shrink-0">→</span>
                  <span className="text-xs font-bold text-emerald-200 truncate">
                    #{inPlayer.jersey_number} {inPlayer.name}
                  </span>
                </button>
              ))}
            </div>
            <hr className="border-slate-700 mt-3" />
          </div>
        )}

        {atMax && (
          <div className="px-3 py-2 rounded-lg bg-red-950 border border-red-700 text-red-300 text-xs font-semibold text-center">
            Substitution limit reached ({maxSubsPerSet}/{maxSubsPerSet})
          </div>
        )}

        {error && (
          <p className="text-red-400 text-xs text-center">{error}</p>
        )}

        {/* ── Player Out ── */}
        <div>
          <p className="text-xs text-slate-400 mb-1.5 font-semibold uppercase tracking-wide">
            Player Out
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {lineup.filter((sl) => sl.playerId).map((sl) => {
              const isExhausted = exhaustedPlayerIds.includes(sl.playerId);
              const isLibero    = sl.playerId === liberoId;
              const disabled    = isLibero || atMax;
              const selected    = outPlayerId === sl.playerId;
              return (
                <button
                  key={sl.playerId}
                  onClick={() => {
                    if (disabled) return;
                    setOutPlayerId(sl.playerId);
                    setInPlayerId(null);
                    setError('');
                  }}
                  disabled={disabled}
                  className={`px-2 py-1.5 rounded text-xs font-bold border transition-colors text-left relative
                    ${selected
                      ? 'bg-primary text-white border-primary'
                      : disabled
                        ? 'bg-slate-800/40 text-slate-600 border-slate-800 cursor-not-allowed'
                        : 'bg-slate-700 text-slate-200 border-slate-600 hover:bg-slate-600'
                    }`}
                >
                  <span className="block text-[1.3vmin] text-slate-400">S{sl.position}</span>
                  #{sl.jersey} {sl.playerName}
                  {isExhausted && (
                    <span className="block text-[10px] text-red-500 font-semibold mt-0.5">Sub used</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Role this set ── */}
        {inPlayerId && (
          <div>
            <p className="text-xs text-slate-400 mb-1.5 font-semibold uppercase tracking-wide">
              Role this set
              <span className="ml-2 text-slate-600 normal-case font-normal">used for VER position multiplier</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {POSITION_OPTIONS.map((pos) => (
                <button
                  key={pos}
                  onClick={() => setRoleOverride(pos)}
                  className={`px-3 py-1 rounded text-xs font-bold border transition-colors
                    ${roleOverride === pos
                      ? 'bg-primary text-white border-primary'
                      : 'bg-slate-700 text-slate-300 border-slate-600 hover:border-slate-400'
                    }`}
                >
                  {pos}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Player In (always visible) ── */}
        <div>
          <p className="text-xs text-slate-400 mb-1.5 font-semibold uppercase tracking-wide">
            Player In
            {!outPlayerId && (
              <span className="ml-2 text-slate-600 normal-case font-normal">← select a player out first</span>
            )}
          </p>

          {bench.length === 0 ? (
            <p className="text-xs text-slate-500">No bench players available.</p>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {bench.map((p) => {
                const isExhausted = exhaustedPlayerIds.includes(p.id);
                const selected    = inPlayerId === p.id;
                // Suggestion ring: this player was previously paired to the outgoing slot
                const isPaired = outSlotIdx !== -1 && subPairs[p.id] === outSlotIdx;
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      if (!outPlayerId) return;
                      setInPlayerId(p.id);
                      setError('');
                    }}
                    disabled={!outPlayerId}
                    className={`px-2 py-1.5 rounded text-xs font-bold border transition-colors text-left relative
                      ${selected
                        ? 'bg-primary text-white border-primary ring-0'
                        : !outPlayerId
                          ? 'bg-slate-700 text-slate-400 border-slate-600'
                          : isPaired
                            ? 'bg-emerald-900/30 text-emerald-100 border-emerald-400 ring-2 ring-emerald-400/50 hover:bg-emerald-900/50'
                            : 'bg-slate-700 text-slate-200 border-slate-600 hover:bg-slate-600'
                      }`}
                  >
                    #{p.jersey_number} {p.name}
                    <span className="block text-[1.3vmin] text-slate-400">{p.position}</span>
                    {isPaired && (
                      <span className="block text-[10px] text-emerald-400 font-semibold mt-0.5">↩ Return</span>
                    )}
                    {isExhausted && !isPaired && (
                      <span className="block text-[10px] text-yellow-500/80 font-semibold mt-0.5">Sub used</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </Modal>
  );
}
