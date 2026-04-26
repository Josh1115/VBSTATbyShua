import { useState } from 'react';

const SESSION_KEY = 'vbstat_authed';

function isAuthed() {
  try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch { return false; }
}

function checkCredentials(user, pass) {
  return (
    user.trim().toLowerCase() === import.meta.env.VITE_APP_USER.toLowerCase() &&
    pass.trim().toLowerCase() === import.meta.env.VITE_APP_PASS.toLowerCase()
  );
}

export function LoginGate({ children }) {
  const [authed,  setAuthed]  = useState(isAuthed);
  const [user,    setUser]    = useState('');
  const [pass,    setPass]    = useState('');
  const [error,   setError]   = useState('');

  if (authed) return children;

  function handleSubmit(e) {
    e.preventDefault();
    if (checkCredentials(user, pass)) {
      try { sessionStorage.setItem(SESSION_KEY, '1'); } catch {}
      setAuthed(true);
    } else {
      setError('Incorrect username or password.');
      setPass('');
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-white text-center mb-1 tracking-wide">VBSTAT</h1>
        <p className="text-slate-500 text-sm text-center mb-8">Enter your credentials to continue</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Username</label>
            <input
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
              value={user}
              onChange={(e) => { setUser(e.target.value); setError(''); }}
              className="bg-slate-800 border border-slate-700 rounded px-3 py-2.5 text-white text-sm focus:outline-none focus:border-primary"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Password</label>
            <input
              type="password"
              autoComplete="current-password"
              value={pass}
              onChange={(e) => { setPass(e.target.value); setError(''); }}
              className="bg-slate-800 border border-slate-700 rounded px-3 py-2.5 text-white text-sm focus:outline-none focus:border-primary"
            />
          </div>

          {error && (
            <p className="text-red-400 text-xs text-center">{error}</p>
          )}

          <button
            type="submit"
            className="mt-1 bg-primary hover:brightness-110 text-white font-bold py-2.5 rounded text-sm transition-all"
          >
            Unlock
          </button>
        </form>
      </div>
    </div>
  );
}
