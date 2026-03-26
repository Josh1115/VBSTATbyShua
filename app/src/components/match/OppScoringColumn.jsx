import { memo } from 'react';
import { useMatchStore } from '../../store/matchStore';

// pointsUs: true  → opponent error, HOME team scores (green)
// pointsUs: false → opponent scores (red)
const BUTTONS = [
  { reason: 'K',   label: 'K',   pointsUs: false },
  { reason: 'SE',  label: 'SE',  pointsUs: true  },
  { reason: 'AE',  label: 'AE',  pointsUs: true  },
  { reason: 'BHE', label: 'BHE', pointsUs: true  },
  { reason: 'NET', label: 'NET', pointsUs: true  },
  { reason: 'ROT', label: 'ROT', pointsUs: true  },
];

export const OppScoringColumn = memo(function OppScoringColumn() {
  const addOppPoint = useMatchStore((s) => s.addOppPoint);

  return (
    <div className="flex-none flex flex-col w-[4.485vmin] bg-slate-900 border-l-2 border-slate-400">
      {BUTTONS.map(({ reason, label, pointsUs }) => (
        <button
          key={reason}
          onPointerDown={(e) => { e.preventDefault(); addOppPoint(reason); }}
          className={`flex-1 flex items-center justify-center text-[2.25vmin] font-bold transition-colors border-b border-slate-700/60 last:border-b-0 select-none
            ${pointsUs
              ? 'text-emerald-500 hover:text-emerald-300 hover:bg-emerald-900/30 active:bg-emerald-900/60'
              : 'text-red-500 hover:text-red-300 hover:bg-red-900/30 active:bg-red-900/60'
            }`}
        >
          {label.length === 1
            ? label
            : <span className="flex flex-col items-center leading-none gap-[0.15vmin]">
                {label.split('').map((ch, i) => <span key={i}>{ch}</span>)}
              </span>
          }
        </button>
      ))}
    </div>
  );
});
