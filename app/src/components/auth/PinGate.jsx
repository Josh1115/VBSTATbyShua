import { useState } from 'react';

const SESSION_KEY = 'vbstat_authed';

export function PinGate({ children }) {
  const [authed, setAuthed] = useState(() => {
    try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch { return false; }
  });
  const [pin,     setPin]     = useState('');
  const [invalid, setInvalid] = useState(false);

  if (authed) return children;

  function handleChange(e) {
    const val = e.target.value;
    if (!/^\d*$/.test(val) || val.length > 6) return;
    setPin(val);
    setInvalid(false);
    if (val.length === 6) {
      if (val === '111590') {
        try { sessionStorage.setItem(SESSION_KEY, '1'); } catch {}
        setAuthed(true);
      } else {
        setInvalid(true);
        setTimeout(() => { setPin(''); setInvalid(false); }, 1000);
      }
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6">
      <div className="flex flex-col items-center gap-6 w-full max-w-xs">
        <h1 className="text-2xl font-bold text-white tracking-wide">VBSTAT</h1>

        <input
          type="password"
          inputMode="numeric"
          pattern="\d*"
          maxLength={6}
          value={pin}
          onChange={handleChange}
          autoFocus
          placeholder="······"
          className={`w-40 text-center text-3xl tracking-[0.5em] bg-slate-800 border-2 rounded-xl px-4 py-3 text-white focus:outline-none transition-colors ${
            invalid ? 'border-red-500' : 'border-slate-600 focus:border-primary'
          }`}
        />

        {invalid && (
          <p className="text-red-400 text-sm font-semibold">Invalid</p>
        )}
      </div>
    </div>
  );
}
