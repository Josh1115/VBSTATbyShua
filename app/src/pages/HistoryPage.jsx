import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { PageHeader } from '../components/layout/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtWinPct(wins, games) {
  if (wins == null || !games) return null;
  return (wins / games * 100).toFixed(1) + '%';
}

// ── Add / Edit Modal ──────────────────────────────────────────────────────────

const EMPTY_FORM = {
  year: '', title: '', head_coach: '', tenure_year: '', asst_coach: '',
  games: '', wins: '', losses: '',
  state_rank: '', national_rank: '',
  playoff_seed: '', regional: '', sectional: '', state_finish: '', playoff_result: '',
};

function HistoryModal({ teamId, onClose, editId, initialData }) {
  const [form, setForm] = useState(initialData ?? EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(field, val) { setForm(f => ({ ...f, [field]: val })); setError(''); }

  async function handleSave() {
    if (!form.year.trim()) { setError('Season year is required.'); return; }
    setSaving(true);
    const fields = {
      team_id:        teamId,
      year:           form.year.trim(),
      title:          form.title.trim()          || null,
      head_coach:     form.head_coach.trim()     || null,
      asst_coach:     form.asst_coach.trim()     || null,
      tenure_year:    form.tenure_year  ? Number(form.tenure_year)  : null,
      games:          form.games        ? Number(form.games)        : null,
      wins:           form.wins         ? Number(form.wins)         : null,
      losses:         form.losses       ? Number(form.losses)       : null,
      state_rank:     form.state_rank    ? Number(form.state_rank)    : null,
      national_rank:  form.national_rank ? Number(form.national_rank) : null,
      playoff_seed:   form.playoff_seed.trim()   || null,
      regional:       form.regional.trim()       || null,
      sectional:      form.sectional.trim()      || null,
      state_finish:   form.state_finish.trim()   || null,
      playoff_result: form.playoff_result.trim() || null,
    };
    try {
      if (editId) { await db.season_history.update(editId, fields); }
      else        { await db.season_history.add(fields); }
      onClose();
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const inp = 'w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-primary';
  const lbl = 'block text-xs font-semibold text-slate-400 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-2xl p-5 space-y-4 max-h-[88vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-100">{editId ? 'Edit Season' : 'Add Season'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className={lbl}>Season Year *</label>
            <input className={inp} placeholder="2024-25" value={form.year} onChange={e => set('year', e.target.value)} />
          </div>

          <div>
            <label className={lbl}>Season Title</label>
            <input className={inp} placeholder="Conference Champions" value={form.title} onChange={e => set('title', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={lbl}>Head Coach</label>
              <input className={inp} placeholder="Coach Smith" value={form.head_coach} onChange={e => set('head_coach', e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Tenure Year #</label>
              <input className={inp} type="number" min="1" placeholder="3" value={form.tenure_year} onChange={e => set('tenure_year', e.target.value)} />
            </div>
          </div>

          <div>
            <label className={lbl}>Assistant Coach</label>
            <input className={inp} placeholder="Coach Jones" value={form.asst_coach} onChange={e => set('asst_coach', e.target.value)} />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className={lbl}>Games</label>
              <input className={inp} type="number" min="0" placeholder="32" value={form.games} onChange={e => set('games', e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Wins</label>
              <input className={inp} type="number" min="0" placeholder="24" value={form.wins} onChange={e => set('wins', e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Losses</label>
              <input className={inp} type="number" min="0" placeholder="8" value={form.losses} onChange={e => set('losses', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={lbl}>State Ranking</label>
              <input className={inp} type="number" min="1" placeholder="e.g. 3" value={form.state_rank} onChange={e => set('state_rank', e.target.value)} />
            </div>
            <div>
              <label className={lbl}>National Ranking</label>
              <input className={inp} type="number" min="1" placeholder="e.g. 12" value={form.national_rank} onChange={e => set('national_rank', e.target.value)} />
            </div>
          </div>

          <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold pt-1">Playoffs</p>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={lbl}>Playoff Seed</label>
              <input className={inp} placeholder="#2" value={form.playoff_seed} onChange={e => set('playoff_seed', e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Playoff Finish</label>
              <input className={inp} placeholder="Sectional Finals" value={form.state_finish} onChange={e => set('state_finish', e.target.value)} />
            </div>
          </div>

          <div>
            <label className={lbl}>Playoff Result</label>
            <input className={inp} placeholder="Lost to Lincoln 0-3 in Sectional Finals" value={form.playoff_result} onChange={e => set('playoff_result', e.target.value)} />
          </div>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-bold active:scale-95 disabled:opacity-50"
        >
          {saving ? 'Saving…' : editId ? 'Save Changes' : 'Add Season'}
        </button>
      </div>
    </div>
  );
}

// ── Season Card ───────────────────────────────────────────────────────────────

function SeasonCard({ entry, onEdit, onDelete }) {
  const winPct     = fmtWinPct(entry.wins, entry.games);
  const hasCoach   = entry.head_coach || entry.asst_coach;
  const hasRecord  = entry.wins != null || entry.losses != null;
  const hasPlayoffs = entry.playoff_seed || entry.state_finish || entry.playoff_result;

  return (
    <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700/50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-700/40">
        <div className="flex items-center gap-3">
          <span className="text-base font-black text-white">{entry.year}</span>
          {hasRecord && (
            <span className="text-sm font-bold text-slate-200 tabular-nums">
              {entry.wins ?? '—'}–{entry.losses ?? '—'}
              {winPct && <span className="text-xs text-slate-400 font-semibold ml-1.5">{winPct}</span>}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onEdit(entry)}
            className="text-xs text-primary font-semibold px-2 py-1 rounded-lg hover:bg-slate-600/50 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(entry.id)}
            className="text-xs text-red-400 font-semibold px-2 py-1 rounded-lg hover:bg-slate-600/50 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {entry.title && (
        <div className="px-4 pt-3 pb-0">
          <p className="text-base font-black text-primary tracking-wide">{entry.title}</p>
        </div>
      )}

      <div className="px-4 py-3 space-y-2.5">
        {/* Rankings */}
        {(entry.state_rank != null || entry.national_rank != null) && (
          <div className="flex gap-4">
            {entry.state_rank != null && (
              <span className="text-sm font-bold text-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mr-1.5">State</span>
                #{entry.state_rank}
              </span>
            )}
            {entry.national_rank != null && (
              <span className="text-sm font-bold text-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mr-1.5">National</span>
                #{entry.national_rank}
              </span>
            )}
          </div>
        )}

        {/* Games played */}
        {entry.games != null && (
          <p className="text-xs text-slate-500">{entry.games} games played</p>
        )}

        {/* Coaching */}
        {hasCoach && (
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {entry.head_coach && (
              <span className="text-sm text-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mr-1.5">HC</span>
                {entry.head_coach}
                {entry.tenure_year != null && (
                  <span className="text-xs text-slate-500 ml-1.5">· Year {entry.tenure_year}</span>
                )}
              </span>
            )}
            {entry.asst_coach && (
              <span className="text-sm text-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mr-1.5">AC</span>
                {entry.asst_coach}
              </span>
            )}
          </div>
        )}

        {/* Playoffs */}
        {hasPlayoffs && (
          <div className="pt-2 border-t border-slate-700/60 space-y-1.5">
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {entry.playoff_seed && (
                <span className="text-xs">
                  <span className="text-slate-500 mr-1">Seed</span>
                  <span className="text-slate-200 font-semibold">{entry.playoff_seed}</span>
                </span>
              )}
              {entry.state_finish && (
                <span className="text-xs">
                  <span className="text-slate-500 mr-1">Finish</span>
                  <span className="text-slate-200 font-semibold">{entry.state_finish}</span>
                </span>
              )}
            </div>
            {entry.playoff_result && (
              <p className="text-xs text-slate-400 italic">{entry.playoff_result}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function HistoryPage() {
  const [orgId,   setOrgId]   = useState(null);
  const [gender,  setGender]  = useState(null);
  const [teamId,  setTeamId]  = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editEntry, setEditEntry] = useState(null);

  const orgs = useLiveQuery(
    () => db.organizations.toArray().then(o => o.sort((a, b) => a.name?.localeCompare(b.name))),
    []
  );
  const orgTeams = useLiveQuery(
    () => orgId ? db.teams.where('org_id').equals(orgId).toArray() : Promise.resolve([]),
    [orgId]
  );
  const history = useLiveQuery(
    () => teamId
      ? db.season_history.where('team_id').equals(teamId).toArray()
      : Promise.resolve([]),
    [teamId]
  );

  const genderTeams = useMemo(() => {
    const varsity = (orgTeams ?? []).filter(t => t.level === 'varsity');
    return {
      F: varsity.filter(t => t.gender === 'F'),
      M: varsity.filter(t => t.gender === 'M'),
    };
  }, [orgTeams]);

  // Auto-select when only one option exists
  useMemo(() => {
    if (orgs?.length === 1 && !orgId) setOrgId(orgs[0].id);
  }, [orgs, orgId]);

  useMemo(() => {
    if (!orgTeams?.length) return;
    const hasF = genderTeams.F.length > 0;
    const hasM = genderTeams.M.length > 0;
    if (hasF && !hasM && gender !== 'F') setGender('F');
    if (hasM && !hasF && gender !== 'M') setGender('M');
  }, [genderTeams, orgTeams?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useMemo(() => {
    if (!gender) { setTeamId(null); return; }
    const matching = genderTeams[gender] ?? [];
    if (matching.length === 1) setTeamId(matching[0].id);
    else if (matching.length === 0) setTeamId(null);
  }, [gender, genderTeams]);

  useMemo(() => { setGender(null); setTeamId(null); }, [orgId]);

  const sortedHistory = useMemo(
    () => [...(history ?? [])].sort((a, b) => String(b.year).localeCompare(String(a.year))),
    [history]
  );

  async function handleDelete(id) {
    await db.season_history.delete(id);
  }

  const multiTeam = gender ? (genderTeams[gender]?.length ?? 0) > 1 : false;
  const orgName   = orgs?.find(o => o.id === orgId)?.name ?? '';

  const selectCls = 'w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-primary';

  const GenderPill = ({ value, label }) => {
    const available = (genderTeams[value]?.length ?? 0) > 0;
    return (
      <button
        disabled={!available}
        onClick={() => { setGender(value); setTeamId(null); }}
        className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
          gender === value ? 'bg-primary text-white'
            : available ? 'text-slate-400 hover:text-slate-200'
            : 'text-slate-700 cursor-not-allowed'
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="pb-24">
      <PageHeader
        title={orgName ? `History — ${orgName}` : 'History'}
        action={teamId && (
          <button
            onClick={() => setShowAdd(true)}
            className="px-3 py-1 rounded-lg bg-primary text-white text-sm font-bold"
          >
            + Add
          </button>
        )}
      />

      <div className="p-4 space-y-4">
        {orgs && orgs.length > 1 && (
          <select value={orgId ?? ''} onChange={e => setOrgId(Number(e.target.value))} className={selectCls}>
            <option value="">Select a school…</option>
            {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}

        {!orgId ? (
          <EmptyState icon="📖" title="Select a school" description="Choose a school to view program history" />
        ) : (
          <>
            <div className="flex bg-slate-800 rounded-xl p-1 gap-1">
              <GenderPill value="F" label="Girls" />
              <GenderPill value="M" label="Boys" />
            </div>

            {multiTeam && (
              <select
                value={teamId ?? ''}
                onChange={e => setTeamId(Number(e.target.value))}
                className={selectCls}
              >
                <option value="">Select a team…</option>
                {(genderTeams[gender] ?? []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}

            {!teamId ? (
              <EmptyState icon="📋" title={gender ? 'Select a team' : 'Select Girls or Boys'} description="" />
            ) : sortedHistory.length === 0 ? (
              <EmptyState
                icon="📖"
                title="No seasons recorded"
                description="Tap + Add to start building your program's history"
              />
            ) : (
              <div className="space-y-3">
                {sortedHistory.map(entry => (
                  <SeasonCard
                    key={entry.id}
                    entry={entry}
                    onEdit={setEditEntry}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {showAdd && teamId && (
        <HistoryModal teamId={teamId} onClose={() => setShowAdd(false)} />
      )}

      {editEntry && teamId && (
        <HistoryModal
          teamId={teamId}
          editId={editEntry.id}
          initialData={{
            year:           editEntry.year           ?? '',
            title:          editEntry.title          ?? '',
            state_rank:     editEntry.state_rank     != null ? String(editEntry.state_rank)    : '',
            national_rank:  editEntry.national_rank  != null ? String(editEntry.national_rank) : '',
            head_coach:     editEntry.head_coach     ?? '',
            tenure_year:    editEntry.tenure_year    != null ? String(editEntry.tenure_year) : '',
            asst_coach:     editEntry.asst_coach     ?? '',
            games:          editEntry.games          != null ? String(editEntry.games)   : '',
            wins:           editEntry.wins           != null ? String(editEntry.wins)    : '',
            losses:         editEntry.losses         != null ? String(editEntry.losses)  : '',
            playoff_seed:   editEntry.playoff_seed   ?? '',
            regional:       editEntry.regional       ?? '',
            sectional:      editEntry.sectional      ?? '',
            state_finish:   editEntry.state_finish   ?? '',
            playoff_result: editEntry.playoff_result ?? '',
          }}
          onClose={() => setEditEntry(null)}
        />
      )}
    </div>
  );
}
