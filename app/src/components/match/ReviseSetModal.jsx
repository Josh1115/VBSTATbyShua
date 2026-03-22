import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMatchStore } from '../../store/matchStore';
import { Button } from '../ui/Button';

export function ReviseSetModal({ set, matchId, onClose, onBoxScore }) {
  const navigate  = useNavigate();
  const reviseSet = useMatchStore((s) => s.reviseSet);
  const [clearing, setClearing] = useState(false);

  const handleLiveEntry = async () => {
    setClearing(true);
    try {
      await reviseSet(set.id);
      navigate(`/matches/${matchId}/set-lineup?revise=1&setId=${set.id}`);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl w-full max-w-sm p-5 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-white">Revise Set {set.set_number}</h2>
          <p className="text-sm text-slate-400 mt-1">
            Current score: {set.our_score}–{set.opp_score}. All stats for this set will be
            cleared and you will re-enter the lineup.
          </p>
        </div>

        <div className="space-y-3">
          <button
            disabled={clearing}
            onClick={handleLiveEntry}
            className="w-full py-3 px-4 bg-primary hover:brightness-110 text-white font-bold rounded-xl text-sm tracking-wide disabled:opacity-50"
          >
            {clearing ? 'Clearing…' : 'Live Entry'}
            <span className="block text-xs font-normal text-orange-200/70 mt-0.5">
              Use the full court interface to re-enter stats
            </span>
          </button>

          <button
            disabled={clearing}
            onClick={() => onBoxScore(set)}
            className="w-full py-3 px-4 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl text-sm tracking-wide disabled:opacity-50"
          >
            Manual Box Score
            <span className="block text-xs font-normal text-slate-400 mt-0.5">
              Enter per-player stat totals and set score directly
            </span>
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2 text-sm text-slate-500 hover:text-slate-300"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
