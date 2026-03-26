import { useState } from 'react';
import { db } from '../../db/schema';
import { useMatchStore } from '../../store/matchStore';
import { useUiStore, selectShowToast } from '../../store/uiStore';
import { SIDE, SET_STATUS, MATCH_STATUS } from '../../constants';

const STAT_FIELDS = [
  { key: 'sa',  label: 'SA'  },
  { key: 'ace', label: 'ACE' },
  { key: 'se',  label: 'SE'  },
  { key: 'rec', label: 'REC' },
  { key: 'ta',  label: 'TA'  },
  { key: 'k',   label: 'K'   },
  { key: 'ae',  label: 'AE'  },
  { key: 'ast', label: 'AST' },
  { key: 'bhe', label: 'BHE' },
  { key: 'fbe', label: 'FBE' },
  { key: 'bs',  label: 'BS'  },
  { key: 'ba',  label: 'BA'  },
  { key: 'be',  label: 'BE'  },
  { key: 'dig', label: 'DIG' },
  { key: 'de',  label: 'DE'  },
];

const mkEmpty = () => Object.fromEntries(STAT_FIELDS.map(({ key }) => [key, '']));

function buildContacts(matchId, setId, playerId, fields) {
  const n = (k) => Math.max(0, parseInt(fields[k], 10) || 0);
  const contacts = [];

  // Serve: split into in-play, ace, error to avoid double-counting SA
  const ace = n('ace'), se = n('se'), sa = n('sa');
  const saInPlay = Math.max(0, sa - ace - se);
  if (saInPlay > 0) contacts.push({ action: 'serve', result: 'in',    count: saInPlay });
  if (ace    > 0)   contacts.push({ action: 'serve', result: 'ace',   count: ace });
  if (se     > 0)   contacts.push({ action: 'serve', result: 'error', count: se });

  // Pass / Receive — stored as P3 (perfect pass) for APR purposes
  const rec = n('rec');
  if (rec > 0) contacts.push({ action: 'pass', result: '3', count: rec });

  // Attack: split into kill, error, in-play
  const k = n('k'), ae = n('ae'), ta = n('ta');
  const taInPlay = Math.max(0, ta - k - ae);
  if (k      > 0) contacts.push({ action: 'attack', result: 'kill',  count: k });
  if (ae     > 0) contacts.push({ action: 'attack', result: 'error', count: ae });
  if (taInPlay > 0) contacts.push({ action: 'attack', result: 'in_play', count: taInPlay });

  // Set
  const ast = n('ast'), bhe = n('bhe'), fbe = n('fbe');
  if (ast > 0) contacts.push({ action: 'set',               result: 'assist',              count: ast });
  if (bhe > 0) contacts.push({ action: 'set',               result: 'ball_handling_error', count: bhe });
  if (fbe > 0) contacts.push({ action: 'freeball_receive',  result: 'free_ball_error',     count: fbe });

  // Block
  const bs = n('bs'), ba = n('ba'), be = n('be');
  if (bs > 0) contacts.push({ action: 'block', result: 'solo',   count: bs });
  if (ba > 0) contacts.push({ action: 'block', result: 'assist', count: ba });
  if (be > 0) contacts.push({ action: 'block', result: 'error',  count: be });

  // Dig / Defense
  const dig = n('dig'), de = n('de');
  if (dig > 0) contacts.push({ action: 'dig', result: 'success', count: dig });
  if (de  > 0) contacts.push({ action: 'dig', result: 'error',   count: de  });

  return contacts.map((c) => ({
    match_id:     matchId,
    set_id:       setId,
    player_id:    playerId,
    rotation_num: 0,
    rally_number: 0,
    opponent_contact: false,
    synthetic:    true,
    timestamp:    Date.now(),
    ...c,
  }));
}

export function BoxScoreEntryModal({ set, matchId, players, onClose, onSaved }) {
  const reviseSet  = useMatchStore((s) => s.reviseSet);
  const showToast  = useUiStore(selectShowToast);

  // Step: 'select' → pick players; 'stats' → enter stats
  const [step, setStep] = useState('select');
  const [selected, setSelected] = useState(new Set());
  const [stats, setStats]   = useState({});   // { [playerId]: { sa, ace, ... } }
  const [ourScore,  setOurScore]  = useState('');
  const [oppScore,  setOppScore]  = useState('');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const togglePlayer = (id) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleNext = () => {
    if (selected.size === 0) { setError('Select at least one player.'); return; }
    const initial = {};
    for (const id of selected) initial[id] = mkEmpty();
    setStats(initial);
    setError('');
    setStep('stats');
  };

  const setStat = (playerId, key, val) => {
    setStats((prev) => ({
      ...prev,
      [playerId]: { ...prev[playerId], [key]: val },
    }));
  };

  const handleSave = async () => {
    const us  = parseInt(ourScore, 10);
    const opp = parseInt(oppScore, 10);
    if (isNaN(us) || isNaN(opp) || us < 0 || opp < 0) {
      setError('Enter a valid set score.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      // Clear existing data and reset set to IN_PROGRESS first
      await reviseSet(set.id);

      // Write minimal lineup rows for participating players
      const playerList = (players ?? []).filter((p) => selected.has(p.id));
      await db.lineups.bulkAdd(
        playerList.map((p, i) => ({
          set_id:         set.id,
          player_id:      p.id,
          position:       i + 1,
          serve_order:    i + 1,
          position_label: p.position ?? '',
        }))
      );

      // Write synthetic contacts for each player
      const allContacts = [];
      for (const p of playerList) {
        allContacts.push(...buildContacts(matchId, set.id, p.id, stats[p.id] ?? mkEmpty()));
      }
      if (allContacts.length > 0) await db.contacts.bulkAdd(allContacts);

      // Finalize the set
      const winner = us > opp ? SIDE.US : SIDE.THEM;
      await db.sets.update(set.id, {
        status:    SET_STATUS.COMPLETE,
        our_score: us,
        opp_score: opp,
        winner,
      });

      // Recount and finalize the match
      const allComplete = await db.sets
        .where('match_id').equals(matchId)
        .filter((row) => row.status === SET_STATUS.COMPLETE)
        .toArray();
      const newSetsUs   = allComplete.filter((row) => row.winner === SIDE.US).length;
      const newSetsThem = allComplete.filter((row) => row.winner === SIDE.THEM).length;
      await db.matches.update(matchId, {
        status:       MATCH_STATUS.COMPLETE,
        our_sets_won: newSetsUs,
        opp_sets_won: newSetsThem,
      });
      // Remove any orphan in-progress sets
      await db.sets
        .where('match_id').equals(matchId)
        .filter((row) => row.status === SET_STATUS.IN_PROGRESS)
        .delete();

      onSaved();
    } catch (e) {
      showToast('Failed to save. Try again.', 'error');
      setError('Failed to save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-surface rounded-2xl w-full max-w-2xl my-4">

        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Box Score — Set {set.set_number}</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {step === 'select' ? 'Select players who participated in this set' : 'Enter stat totals per player'}
            </p>
          </div>
          {step === 'stats' && (
            <button onClick={() => setStep('select')} className="text-xs text-slate-400 hover:text-white underline">
              ← Players
            </button>
          )}
        </div>

        <div className="p-5 space-y-4">

          {/* Step 1: player selection */}
          {step === 'select' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                {(players ?? []).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => togglePlayer(p.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors text-left ${
                      selected.has(p.id)
                        ? 'bg-primary/20 border-primary text-white'
                        : 'bg-bg border-slate-700 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded flex items-center justify-center text-xs font-bold border ${
                      selected.has(p.id) ? 'bg-primary border-primary text-white' : 'border-slate-600'
                    }`}>
                      {selected.has(p.id) ? '✓' : ''}
                    </span>
                    <span className="font-semibold">#{p.jersey_number}</span>
                    <span className="truncate">{p.name}</span>
                  </button>
                ))}
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button
                onClick={handleNext}
                className="w-full py-3 bg-primary text-white font-bold rounded-xl text-sm"
              >
                Next — Enter Stats
              </button>
            </>
          )}

          {/* Step 2: per-player stat table */}
          {step === 'stats' && (
            <>
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500">
                      <th className="text-left px-2 py-1 font-semibold">Player</th>
                      {STAT_FIELDS.map(({ key, label }) => (
                        <th key={key} className="px-1 py-1 font-semibold text-center w-10">{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/40">
                    {(players ?? []).filter((p) => selected.has(p.id)).map((p) => (
                      <tr key={p.id}>
                        <td className="px-2 py-1.5 text-slate-200 font-medium whitespace-nowrap">
                          #{p.jersey_number} {p.name}
                        </td>
                        {STAT_FIELDS.map(({ key }) => (
                          <td key={key} className="px-1 py-1">
                            <input
                              type="number"
                              min="0"
                              value={stats[p.id]?.[key] ?? ''}
                              onChange={(e) => setStat(p.id, key, e.target.value)}
                              className="w-9 bg-bg border border-slate-700 rounded text-center text-white text-xs py-1 focus:outline-none focus:border-primary"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Set score */}
              <div className="flex items-center gap-3 pt-2 border-t border-slate-700">
                <span className="text-sm font-semibold text-slate-300">Set Score</span>
                <input
                  type="number" min="0"
                  value={ourScore}
                  onChange={(e) => setOurScore(e.target.value)}
                  placeholder="Us"
                  className="w-16 bg-bg border border-slate-600 rounded-lg px-2 py-1.5 text-white text-sm text-center focus:outline-none focus:border-primary"
                />
                <span className="text-slate-500 font-bold">–</span>
                <input
                  type="number" min="0"
                  value={oppScore}
                  onChange={(e) => setOppScore(e.target.value)}
                  placeholder="Them"
                  className="w-16 bg-bg border border-slate-600 rounded-lg px-2 py-1.5 text-white text-sm text-center focus:outline-none focus:border-primary"
                />
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <button
                disabled={saving}
                onClick={handleSave}
                className="w-full py-3 bg-primary hover:brightness-110 text-white font-bold rounded-xl text-sm disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save Box Score'}
              </button>
            </>
          )}
        </div>

        <div className="px-5 pb-4">
          <button onClick={onClose} className="w-full py-2 text-sm text-slate-500 hover:text-slate-300">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
