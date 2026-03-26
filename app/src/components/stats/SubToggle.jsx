export function SubToggle({ options, value, onChange }) {
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
