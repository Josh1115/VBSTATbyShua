import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { useUiStore, selectShowToast } from '../../store/uiStore';
import { TRACKABLE_STATS } from '../../constants';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

export const RECORD_TYPES = [
  { value: 'individual_match',  label: 'Individual Match'  },
  { value: 'individual_season', label: 'Individual Season' },
  { value: 'team_match',        label: 'Team Match'        },
  { value: 'team_season',       label: 'Team Season'       },
];

export function RecordFormModal({ onClose, teamId, record, type }) {
  const activeType   = record?.type ?? type;
  const isIndividual = activeType === 'individual_match' || activeType === 'individual_season';
  const isMatch      = activeType === 'individual_match' || activeType === 'team_match';
  const isLiveMatch  = activeType === 'individual_match' || activeType === 'team_match';

  // For live-tracked types, stat is a TRACKABLE_STATS key; otherwise free text
  const defaultStat = record?.stat ?? (isLiveMatch ? TRACKABLE_STATS[0].key : '');
  const [stat,        setStat]        = useState(defaultStat);
  const [value,       setValue]       = useState(record?.value        ?? '');
  const [playerName,  setPlayerName]  = useState(record?.player_name  ?? '');
  const [playerId,    setPlayerId]    = useState(record?.player_id     ?? '');
  const [opponent,    setOpponent]    = useState(record?.opponent      ?? '');
  const [date,        setDate]        = useState(record?.date          ?? '');
  const [seasonLabel, setSeasonLabel] = useState(record?.season_label ?? '');
  const [notes,       setNotes]       = useState(record?.notes         ?? '');
  const showToast = useUiStore(selectShowToast);

  const teamPlayers = useLiveQuery(
    () => activeType === 'individual_match'
      ? db.players.where('team_id').equals(teamId).filter((p) => p.is_active).toArray()
      : Promise.resolve([]),
    [teamId, activeType]
  );

  const save = async () => {
    if (!stat || !value.trim()) { showToast('Stat and value are required.', 'error'); return; }
    try {
      const resolvedPlayerId = activeType === 'individual_match' ? (playerId ? Number(playerId) : null) : null;
      let resolvedPlayerName = playerName.trim() || null;
      if (activeType === 'individual_match' && resolvedPlayerId && teamPlayers) {
        const p = teamPlayers.find((pl) => pl.id === resolvedPlayerId);
        if (p) resolvedPlayerName = p.name;
      }
      const data = {
        team_id:      teamId,
        type:         activeType,
        stat:         stat,
        value:        value.trim(),
        player_name:  isIndividual ? resolvedPlayerName : null,
        player_id:    resolvedPlayerId,
        opponent:     isMatch      ? (opponent.trim()    || null) : null,
        date:         date.trim()         || null,
        season_label: seasonLabel.trim()  || null,
        notes:        notes.trim()        || null,
      };
      if (record) {
        await db.records.update(record.id, data);
      } else {
        await db.records.add(data);
      }
      onClose();
    } catch (err) {
      showToast(`Save failed: ${err.message}`, 'error');
    }
  };

  const typeLabel = RECORD_TYPES.find((t) => t.value === activeType)?.label ?? '';

  return (
    <Modal
      title={`${record ? 'Edit' : 'Add'} ${typeLabel} Record`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Stat</label>
            {isLiveMatch ? (
              <select
                className="w-full bg-bg border border-slate-600 rounded-lg px-3 py-2 text-white"
                value={stat}
                onChange={(e) => setStat(e.target.value)}
                autoFocus
              >
                {TRACKABLE_STATS.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            ) : (
              <input
                className="w-full bg-bg border border-slate-600 rounded-lg px-3 py-2 text-white"
                value={stat}
                onChange={(e) => setStat(e.target.value)}
                placeholder="Kills"
                autoFocus
              />
            )}
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Value</label>
            <input
              className="w-full bg-bg border border-slate-600 rounded-lg px-3 py-2 text-white"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="22"
            />
          </div>
        </div>
        {activeType === 'individual_match' && (
          <div>
            <label className="block text-sm text-slate-400 mb-1">Player</label>
            <select
              className="w-full bg-bg border border-slate-600 rounded-lg px-3 py-2 text-white"
              value={playerId}
              onChange={(e) => setPlayerId(e.target.value)}
            >
              <option value="">— Select Player —</option>
              {(teamPlayers ?? []).map((p) => (
                <option key={p.id} value={p.id}>#{p.jersey_number} {p.name}</option>
              ))}
            </select>
          </div>
        )}
        {isIndividual && activeType !== 'individual_match' && (
          <div>
            <label className="block text-sm text-slate-400 mb-1">Player Name</label>
            <input
              className="w-full bg-bg border border-slate-600 rounded-lg px-3 py-2 text-white"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Emma Johnson"
            />
          </div>
        )}
        {isMatch && (
          <div>
            <label className="block text-sm text-slate-400 mb-1">Opponent <span className="text-slate-500">(optional)</span></label>
            <input
              className="w-full bg-bg border border-slate-600 rounded-lg px-3 py-2 text-white"
              value={opponent}
              onChange={(e) => setOpponent(e.target.value)}
              placeholder="Riverside"
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Season <span className="text-slate-500">(optional)</span></label>
            <input
              className="w-full bg-bg border border-slate-600 rounded-lg px-3 py-2 text-white"
              value={seasonLabel}
              onChange={(e) => setSeasonLabel(e.target.value)}
              placeholder="Fall 2025"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Date <span className="text-slate-500">(optional)</span></label>
            <input
              className="w-full bg-bg border border-slate-600 rounded-lg px-3 py-2 text-white"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              placeholder="9/14/25"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Notes <span className="text-slate-500">(optional)</span></label>
          <input
            className="w-full bg-bg border border-slate-600 rounded-lg px-3 py-2 text-white"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Playoff game"
          />
        </div>
      </div>
    </Modal>
  );
}
