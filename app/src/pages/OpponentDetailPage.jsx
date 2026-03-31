import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { MATCH_STATUS } from '../constants';
import { PageHeader } from '../components/layout/PageHeader';
import { TabBar } from '../components/ui/Tab';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Spinner } from '../components/ui/Spinner';

// ── Tendency types ───────────────────────────────────────────────────────────
const TENDENCY_TYPES = [
  { type: 'serve_target',    label: 'Serve Target',     icon: '🎯', placeholder: 'e.g. Short zones 1 & 6' },
  { type: 'attack_pattern',  label: 'Attack Pattern',   icon: '⚡', placeholder: 'e.g. Heavy outside, quick middle' },
  { type: 'defense_style',   label: 'Defense Style',    icon: '🛡️', placeholder: 'e.g. Rotational, perimeter' },
  { type: 'rotation_strength', label: 'Strong Rotation', icon: '💪', placeholder: 'e.g. Rotation 2 — ace server' },
  { type: 'rotation_weakness', label: 'Weak Rotation',  icon: '⚠️', placeholder: 'e.g. Rotation 5 — weak passer' },
  { type: 'key_player',      label: 'Key Player',       icon: '⭐', placeholder: 'e.g. #12 — jump float to zone 1' },
  { type: 'note',            label: 'Other Note',       icon: '📝', placeholder: 'General observation…' },
];

// ── History tab ──────────────────────────────────────────────────────────────
function HistoryTab({ oppId, oppName }) {
  const navigate = useNavigate();

  // Matches linked by opponent_id (new) OR opponent_name (legacy, pre-scouting).
  // Must union both since old matches only have opponent_name.
  const matches = useLiveQuery(async () => {
    const nameLower = (oppName ?? '').toLowerCase();
    const all = await db.matches.toArray();
    return all
      .filter(m => m.opponent_id === oppId || (m.opponent_name ?? '').toLowerCase() === nameLower)
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  }, [oppId, oppName]);

  if (!matches) return <div className="flex justify-center p-8"><Spinner /></div>;

  if (matches.length === 0) {
    return (
      <EmptyState
        icon="📅"
        title="No matches recorded"
        description="Matches against this opponent will appear here automatically after setup."
      />
    );
  }

  const complete = matches.filter(m => m.status === MATCH_STATUS.COMPLETE);
  const wins   = complete.filter(m => (m.our_sets_won ?? 0) > (m.opp_sets_won ?? 0)).length;
  const losses = complete.filter(m => (m.opp_sets_won ?? 0) > (m.our_sets_won ?? 0)).length;

  return (
    <div className="p-4 space-y-3">
      {complete.length > 0 && (
        <div className="text-center py-2">
          <span className="text-2xl font-bold text-white">{wins}–{losses}</span>
          <span className="text-sm text-slate-400 ml-2">all-time</span>
        </div>
      )}
      {matches.map(m => {
        const dateStr = m.date
          ? new Date(m.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
          : 'Date unknown';
        const isComplete = m.status === MATCH_STATUS.COMPLETE;
        const won = isComplete && (m.our_sets_won ?? 0) > (m.opp_sets_won ?? 0);
        const lost = isComplete && (m.opp_sets_won ?? 0) > (m.our_sets_won ?? 0);
        const resultColor = won ? 'text-emerald-400' : lost ? 'text-red-400' : 'text-slate-400';
        const resultLabel = won ? 'W' : lost ? 'L' : isComplete ? '?' : '…';
        const setScore = isComplete ? `${m.our_sets_won ?? 0}–${m.opp_sets_won ?? 0}` : null;
        return (
          <button
            key={m.id}
            onClick={() => navigate(`/matches/${m.id}/summary`)}
            className="w-full bg-surface rounded-xl px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-700 active:scale-[0.98] transition-[transform,background-color] duration-75"
          >
            <span className={`text-lg font-bold w-6 shrink-0 ${resultColor}`}>{resultLabel}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-white font-semibold">{dateStr}</div>
              {setScore && <div className="text-xs text-slate-400">Sets {setScore}</div>}
              {m.location && <div className="text-xs text-slate-500">{m.location}</div>}
            </div>
            <span className="text-slate-600">›</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Tendencies tab ───────────────────────────────────────────────────────────
function TendenciesTab({ oppId }) {
  const [addType, setAddType]     = useState(null);
  const [addValue, setAddValue]   = useState('');
  const [saving, setSaving]       = useState(false);
  const [deleting, setDeleting]   = useState(null);

  const tendencies = useLiveQuery(
    () => db.opp_tendencies.where('opp_id').equals(oppId).toArray(),
    [oppId]
  );

  async function handleAdd() {
    const value = addValue.trim();
    if (!value || !addType) return;
    setSaving(true);
    try {
      await db.opp_tendencies.add({ opp_id: oppId, match_id: null, type: addType, value, created_at: new Date().toISOString() });
      setAddValue('');
      setAddType(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    setDeleting(id);
    try { await db.opp_tendencies.delete(id); } finally { setDeleting(null); }
  }

  // Group by type
  const grouped = useMemo(() => {
    const g = {};
    for (const t of tendencies ?? []) {
      (g[t.type] ??= []).push(t);
    }
    return g;
  }, [tendencies]);

  const placeholder = TENDENCY_TYPES.find(t => t.type === addType)?.placeholder ?? 'Add detail…';

  return (
    <div className="p-4 space-y-4">
      {/* Add tendency */}
      <div className="bg-surface rounded-xl p-3 space-y-2">
        <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Add Tendency</p>
        <div className="grid grid-cols-2 gap-1.5">
          {TENDENCY_TYPES.map(t => (
            <button
              key={t.type}
              onClick={() => setAddType(prev => prev === t.type ? null : t.type)}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors
                ${addType === t.type ? 'bg-primary/20 text-primary border border-primary/40' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
            >
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>
        {addType && (
          <div className="flex gap-2">
            <input
              autoFocus
              className="flex-1 px-3 py-2 rounded-lg bg-bg border border-slate-600 text-white text-sm placeholder:text-slate-500"
              placeholder={placeholder}
              value={addValue}
              onChange={e => setAddValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
            />
            <Button size="sm" onClick={handleAdd} disabled={saving || !addValue.trim()}>Add</Button>
          </div>
        )}
      </div>

      {/* Existing tendencies grouped by type */}
      {!tendencies ? (
        <div className="flex justify-center p-4"><Spinner /></div>
      ) : (tendencies.length === 0 && !addType) ? (
        <EmptyState icon="🔭" title="No tendencies yet" description="Tap a category above to add your first scouting note." />
      ) : (
        TENDENCY_TYPES
          .filter(t => grouped[t.type]?.length)
          .map(t => (
            <div key={t.type}>
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-1.5 flex items-center gap-1">
                <span>{t.icon}</span> {t.label}
              </p>
              <div className="space-y-1.5">
                {grouped[t.type].map(item => (
                  <div key={item.id} className="bg-surface rounded-lg px-3 py-2 flex items-start gap-2">
                    <p className="flex-1 text-sm text-slate-200">{item.value}</p>
                    <button
                      onClick={() => handleDelete(item.id)}
                      disabled={deleting === item.id}
                      className="text-slate-600 hover:text-red-400 transition-colors text-lg leading-none shrink-0 mt-0.5"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))
      )}
    </div>
  );
}

// ── Notes tab ────────────────────────────────────────────────────────────────
function NotesTab({ opp }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(opp?.notes ?? '');
  const [saving, setSaving]   = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await db.opponents.update(opp.id, { notes: draft });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4">
      {editing ? (
        <div className="space-y-2">
          <textarea
            autoFocus
            rows={10}
            className="w-full px-3 py-2 rounded-xl bg-surface border border-slate-600 text-white text-sm placeholder:text-slate-500 resize-none"
            placeholder="Pre/post-game notes, tendencies, staff observations…"
            value={draft}
            onChange={e => setDraft(e.target.value)}
          />
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving}>Save</Button>
            <Button variant="ghost" onClick={() => { setEditing(false); setDraft(opp?.notes ?? ''); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div>
          {opp?.notes ? (
            <div
              className="bg-surface rounded-xl px-4 py-3 text-sm text-slate-200 whitespace-pre-wrap cursor-pointer hover:bg-slate-700 transition-colors"
              onClick={() => setEditing(true)}
            >
              {opp.notes}
            </div>
          ) : (
            <EmptyState
              icon="📝"
              title="No notes yet"
              description="Add pre-game prep, post-game observations, or coaching notes."
              action={<Button onClick={() => setEditing(true)}>Add Notes</Button>}
            />
          )}
          {opp?.notes && (
            <button
              onClick={() => setEditing(true)}
              className="mt-2 text-sm text-slate-400 hover:text-white transition-colors"
            >
              Edit notes
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export function OpponentDetailPage() {
  const { oppId } = useParams();
  const oid = Number(oppId);
  const [tab, setTab] = useState('history');

  const opp = useLiveQuery(() => db.opponents.get(oid), [oid]);

  if (!opp) {
    return <div className="flex items-center justify-center h-48"><Spinner /></div>;
  }

  return (
    <div>
      <PageHeader title={opp.name} backTo="/opponents" />

      <TabBar
        tabs={[
          { value: 'history',    label: 'History'    },
          { value: 'tendencies', label: 'Tendencies' },
          { value: 'notes',      label: 'Notes'      },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'history'    && <HistoryTab    oppId={oid} oppName={opp.name} />}
      {tab === 'tendencies' && <TendenciesTab oppId={oid} />}
      {tab === 'notes'      && <NotesTab      opp={opp}   />}
    </div>
  );
}
