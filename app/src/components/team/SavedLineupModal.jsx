import { useState } from 'react';
import { db } from '../../db/schema';
import { useUiStore, selectShowToast } from '../../store/uiStore';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { LineupForm } from '../match/LineupForm';

export function SavedLineupModal({ onClose, teamId, savedLineup, activePlayers }) {
  const [name,          setName]          = useState(savedLineup?.name ?? '');
  const [lineup,        setLineup]        = useState(savedLineup?.serve_order ?? Array(6).fill(''));
  const [slotPositions, setSlotPositions] = useState(savedLineup?.slot_positions ?? Array(6).fill(''));
  const [startZone,     setStartZone]     = useState(savedLineup?.start_zone ?? 1);
  const [liberoId,      setLiberoId]      = useState(savedLineup?.libero_player_id ? String(savedLineup.libero_player_id) : '');
  const showToast = useUiStore(selectShowToast);

  const save = async () => {
    if (!name.trim()) { showToast('Enter a lineup name.', 'error'); return; }
    if (lineup.some((id) => !id)) { showToast('Assign a player to every serve position.', 'error'); return; }
    try {
      const data = {
        team_id:          teamId,
        name:             name.trim(),
        serve_order:      lineup,
        slot_positions:   slotPositions,
        start_zone:       startZone,
        libero_player_id: liberoId ? Number(liberoId) : null,
      };
      if (savedLineup) {
        await db.saved_lineups.update(savedLineup.id, data);
      } else {
        await db.saved_lineups.add(data);
      }
      onClose();
    } catch (err) {
      showToast(`Save failed: ${err.message}`, 'error');
    }
  };

  return (
    <Modal
      title={savedLineup ? 'Edit Lineup' : 'Save Lineup'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-slate-400 mb-1">Lineup Name</label>
          <input
            className="w-full bg-bg border border-slate-600 rounded-lg px-3 py-2 text-white"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Base Rotation, 6-2 Serve Receive"
            autoFocus
          />
        </div>
        <LineupForm
          lineup={lineup}
          setLineup={setLineup}
          slotPositions={slotPositions}
          setSlotPositions={setSlotPositions}
          startZone={startZone}
          setStartZone={setStartZone}
          liberoId={liberoId}
          setLiberoId={setLiberoId}
          players={activePlayers}
        />
      </div>
    </Modal>
  );
}
