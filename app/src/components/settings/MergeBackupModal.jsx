import { useState, useRef } from 'react';
import { parseMergePreview, executeMerge } from '../../stats/merge';

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function MatchCard({ label, match, highlight }) {
  const result = match.status === 'complete'
    ? `${match.ourSetsWon}–${match.oppSetsWon}`
    : match.status ?? '—';
  return (
    <div className={`flex-1 rounded-lg p-3 space-y-1 ${highlight ? 'bg-primary/10 border border-primary/30' : 'bg-slate-800 border border-slate-700'}`}>
      <p className={`text-[10px] font-black uppercase tracking-widest ${highlight ? 'text-primary' : 'text-slate-500'}`}>{label}</p>
      <p className="text-sm font-bold text-white truncate">{match.opponentName}</p>
      <p className="text-xs text-slate-400">{fmtDate(match.date)}</p>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-300">{result}</span>
        <span className="text-[10px] text-slate-500">{match.contactCount} contacts</span>
      </div>
    </div>
  );
}

function ConflictRow({ conflict, decision, onChange }) {
  const impMore = conflict.imported.contactCount >= conflict.current.contactCount;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 space-y-3">
      <p className="text-xs font-semibold text-slate-400">
        {conflict.imported.opponentName} · {fmtDate(conflict.imported.date)}
        <span className="ml-2 text-slate-600">Season {conflict.imported.seasonYear}</span>
      </p>
      <div className="flex gap-2">
        <MatchCard label="This Device" match={conflict.current}  highlight={decision === 'keep'} />
        <MatchCard label="Imported"    match={conflict.imported} highlight={decision === 'replace'} />
      </div>
      {impMore && conflict.imported.contactCount > conflict.current.contactCount && (
        <p className="text-[10px] text-amber-400">
          Imported has more contacts ({conflict.imported.contactCount} vs {conflict.current.contactCount})
        </p>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => onChange('keep')}
          className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
            decision === 'keep'
              ? 'bg-slate-600 text-white'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
          }`}
        >
          Keep Current
        </button>
        <button
          onClick={() => onChange('replace')}
          className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
            decision === 'replace'
              ? 'bg-primary text-white'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
          }`}
        >
          Use Imported
        </button>
      </div>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function MergeBackupModal({ onClose, onSuccess }) {
  const fileRef = useRef(null);
  const [phase,     setPhase]     = useState('idle');   // idle | parsing | preview | executing | done
  const [error,     setError]     = useState(null);
  const [preview,   setPreview]   = useState(null);
  const [decisions, setDecisions] = useState({});       // { [importedMatchId]: 'keep' | 'replace' }
  const [result,    setResult]    = useState(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setPhase('parsing');
    setError(null);
    try {
      const prev = await parseMergePreview(file);
      if (!prev.valid) { setError(prev.error); setPhase('idle'); return; }
      // Default every conflict to 'keep'
      const defaultDecisions = {};
      for (const c of prev.conflicts) defaultDecisions[c.importedId] = 'keep';
      setPreview(prev);
      setDecisions(defaultDecisions);
      setPhase('preview');
    } catch (err) {
      setError(err.message ?? 'Failed to parse file.');
      setPhase('idle');
    }
  }

  async function handleExecute() {
    if (!preview) return;
    setPhase('executing');
    try {
      const res = await executeMerge(preview, decisions);
      setResult(res);
      setPhase('done');
    } catch (err) {
      setError(err.message ?? 'Merge failed.');
      setPhase('preview');
    }
  }

  function setDecision(importedId, val) {
    setDecisions(d => ({ ...d, [importedId]: val }));
  }

  const newCount      = preview?.newMatches.length ?? 0;
  const conflictCount = preview?.conflicts.length  ?? 0;
  const replaceCount  = Object.values(decisions).filter(d => d === 'replace').length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 flex-shrink-0">
        <span className="font-bold text-white">Merge from Backup</span>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white text-2xl leading-none"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* ── IDLE ── */}
        {phase === 'idle' && (
          <div className="space-y-4">
            <div className="bg-slate-800 rounded-xl p-4 space-y-2">
              <p className="text-sm font-semibold text-white">How it works</p>
              <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
                <li>New matches from the imported file are added automatically</li>
                <li>Conflicts (same match on both devices) let you choose which version to keep</li>
                <li>Players, seasons, and opponents are merged by name — no duplicates created</li>
                <li>This device's data is never touched unless you choose "Use Imported" for a conflict</li>
              </ul>
            </div>
            {error && (
              <div className="bg-red-900/40 border border-red-700 rounded-xl px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full py-3 rounded-xl bg-primary text-white font-bold text-sm"
            >
              Select Backup File (.json)
            </button>
            <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={handleFile} />
          </div>
        )}

        {/* ── PARSING ── */}
        {phase === 'parsing' && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-400">Analyzing backup file…</p>
          </div>
        )}

        {/* ── PREVIEW ── */}
        {phase === 'preview' && preview && (
          <div className="space-y-5">

            {/* Summary banner */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-emerald-900/30 border border-emerald-700/40 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-emerald-400">{newCount}</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mt-0.5">New Matches</p>
              </div>
              <div className={`border rounded-xl p-3 text-center ${conflictCount > 0 ? 'bg-amber-900/30 border-amber-700/40' : 'bg-slate-800 border-slate-700'}`}>
                <p className={`text-2xl font-black ${conflictCount > 0 ? 'text-amber-400' : 'text-slate-400'}`}>{conflictCount}</p>
                <p className={`text-[10px] font-bold uppercase tracking-wider mt-0.5 ${conflictCount > 0 ? 'text-amber-600' : 'text-slate-600'}`}>Conflicts</p>
              </div>
            </div>

            {newCount === 0 && conflictCount === 0 && (
              <div className="bg-slate-800 rounded-xl p-4 text-center text-sm text-slate-400">
                Nothing new to import — all matches already exist on this device.
              </div>
            )}

            {/* New matches list */}
            {newCount > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-black uppercase tracking-widest text-slate-500">
                  New Matches — will be added
                </p>
                <div className="space-y-1.5">
                  {preview.newMatches.map(m => (
                    <div key={m.id} className="flex items-center gap-3 bg-slate-800 rounded-lg px-3 py-2">
                      <span className="text-emerald-400 text-sm">✓</span>
                      <span className="flex-1 text-sm text-slate-200 truncate">{m.opponentName}</span>
                      <span className="text-xs text-slate-500 shrink-0">{fmtDate(m.date)}</span>
                      <span className="text-xs text-slate-600 shrink-0">{m.contactCount} contacts</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Conflicts */}
            {conflictCount > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-black uppercase tracking-widest text-slate-500">
                  Conflicts — choose which version to keep
                </p>
                {preview.conflicts.map(c => (
                  <ConflictRow
                    key={c.importedId}
                    conflict={c}
                    decision={decisions[c.importedId] ?? 'keep'}
                    onChange={val => setDecision(c.importedId, val)}
                  />
                ))}
              </div>
            )}

            {error && (
              <div className="bg-red-900/40 border border-red-700 rounded-xl px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}
          </div>
        )}

        {/* ── EXECUTING ── */}
        {phase === 'executing' && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-400">Merging data…</p>
          </div>
        )}

        {/* ── DONE ── */}
        {phase === 'done' && result && (
          <div className="space-y-4">
            <div className="flex flex-col items-center py-8 gap-3">
              <span className="text-5xl">✅</span>
              <p className="text-lg font-bold text-white">Merge Complete</p>
            </div>
            <div className="bg-slate-800 rounded-xl p-4 space-y-2">
              {result.matchesAdded > 0 && (
                <p className="text-sm text-slate-300">
                  <span className="font-bold text-emerald-400">{result.matchesAdded}</span> new {result.matchesAdded === 1 ? 'match' : 'matches'} added
                </p>
              )}
              {result.matchesReplaced > 0 && (
                <p className="text-sm text-slate-300">
                  <span className="font-bold text-primary">{result.matchesReplaced}</span> {result.matchesReplaced === 1 ? 'match' : 'matches'} replaced with imported data
                </p>
              )}
              {result.matchesAdded === 0 && result.matchesReplaced === 0 && (
                <p className="text-sm text-slate-400">No changes were made.</p>
              )}
            </div>
            <button
              onClick={() => { onSuccess?.(); onClose(); }}
              className="w-full py-3 rounded-xl bg-primary text-white font-bold text-sm"
            >
              Done
            </button>
          </div>
        )}

      </div>

      {/* Footer action */}
      {phase === 'preview' && (newCount > 0 || replaceCount > 0) && (
        <div className="flex-shrink-0 border-t border-slate-700 p-4">
          <button
            onClick={handleExecute}
            className="w-full py-3 rounded-xl bg-primary text-white font-bold text-sm"
          >
            Merge {newCount + replaceCount} {newCount + replaceCount === 1 ? 'Match' : 'Matches'}
            {replaceCount > 0 && ` (${replaceCount} replaced)`}
          </button>
        </div>
      )}

      {phase === 'preview' && newCount === 0 && replaceCount === 0 && conflictCount > 0 && (
        <div className="flex-shrink-0 border-t border-slate-700 p-4">
          <p className="text-xs text-slate-500 text-center">
            All conflicts set to "Keep Current" — nothing will change.
            Switch any conflict to "Use Imported" to replace it.
          </p>
        </div>
      )}
    </div>
  );
}
