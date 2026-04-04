import { useState, useRef } from 'react';
import { db } from '../../db/schema';
import { useUiStore, selectShowToast } from '../../store/uiStore';
import { POSITION_KEYS, POSITIONS } from '../../constants';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

export function PlayerFormModal({ onClose, teamId, player }) {
  const [name, setName]       = useState(player?.name ?? '');
  const [nickname, setNickname] = useState(player?.nickname ?? '');
  const [jersey, setJersey]   = useState(player?.jersey_number ?? '');
  const [position, setPosition] = useState(player?.position ?? 'OH');
  const [secondaryPosition, setSecondaryPosition] = useState(player?.secondary_position ?? '');
  const [isCaptain, setIsCaptain] = useState(player?.is_captain ?? false);
  const [year, setYear] = useState(player?.year ?? '');
  const [heightFt, setHeightFt] = useState(player?.height_ft != null ? String(player.height_ft) : '');
  const [heightIn, setHeightIn] = useState(player?.height_in != null ? String(player.height_in) : '');
  const showToast = useUiStore(selectShowToast);
  const nameRef = useRef(null);

  const buildData = () => {
    const hFt = heightFt !== '' ? Number(heightFt) : null;
    const hIn = heightIn !== '' ? Number(heightIn) : null;
    return { name: name.trim(), nickname: nickname.trim() || null, jersey_number: jersey.trim(), position, secondary_position: secondaryPosition || null, is_captain: isCaptain, year: year || null, height_ft: hFt, height_in: hIn };
  };

  const save = async () => {
    if (!name.trim()) return;
    try {
      const data = buildData();
      if (player) {
        await db.players.update(player.id, data);
      } else {
        await db.players.add({ team_id: teamId, ...data, is_active: true });
      }
      onClose();
    } catch (err) {
      showToast(`Save failed: ${err.message}`, 'error');
    }
  };

  const saveAndAddAnother = async () => {
    if (!name.trim()) return;
    try {
      const data = buildData();
      await db.players.add({ team_id: teamId, ...data, is_active: true });
      setName('');
      setNickname('');
      setJersey('');
      setIsCaptain(false);
      setTimeout(() => nameRef.current?.focus(), 0);
    } catch (err) {
      showToast(`Save failed: ${err.message}`, 'error');
    }
  };

  return (
    <Modal
      title={player ? 'Edit Player' : 'Add Player'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          {!player && (
            <Button variant="secondary" onClick={saveAndAddAnother}>Save &amp; Add Another</Button>
          )}
          <Button onClick={save}>Save</Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="block text-sm text-slate-400 mb-1">Name</label>
          <input
            ref={nameRef}
            className="w-full bg-bg border border-slate-600 rounded-lg px-3 py-2 text-white"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Emma Johnson"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Nickname <span className="text-slate-500">(optional)</span></label>
          <input
            className="w-full bg-bg border border-slate-600 rounded-lg px-3 py-2 text-white"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Em"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Jersey #</label>
            <input
              className="w-full bg-bg border border-slate-600 rounded-lg px-3 py-2 text-white"
              value={jersey}
              onChange={(e) => setJersey(e.target.value)}
              placeholder="11"
              maxLength={3}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Position</label>
            <select
              className="w-full bg-bg border border-slate-600 rounded-lg px-3 py-2 text-white"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
            >
              {POSITION_KEYS.map((p) => (
                <option key={p} value={p}>{p} — {POSITIONS[p]}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Secondary Position <span className="text-slate-500">(optional)</span></label>
          <select
            className="w-full bg-bg border border-slate-600 rounded-lg px-3 py-2 text-white"
            value={secondaryPosition}
            onChange={(e) => setSecondaryPosition(e.target.value)}
          >
            <option value="">— None —</option>
            {POSITION_KEYS.filter((p) => p !== position).map((p) => (
              <option key={p} value={p}>{p} — {POSITIONS[p]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Year <span className="text-slate-500">(optional)</span></label>
          <select
            className="w-full bg-bg border border-slate-600 rounded-lg px-3 py-2 text-white"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          >
            <option value="">— None —</option>
            <option value="Freshman">Freshman</option>
            <option value="Sophomore">Sophomore</option>
            <option value="Junior">Junior</option>
            <option value="Senior">Senior</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Height <span className="text-slate-500">(optional)</span></label>
          <div className="flex gap-2 items-center">
            <input
              type="number"
              className="w-20 bg-bg border border-slate-600 rounded-lg px-3 py-2 text-white"
              value={heightFt}
              onChange={(e) => setHeightFt(e.target.value)}
              placeholder="5"
              min={4}
              max={8}
            />
            <span className="text-slate-400">ft</span>
            <input
              type="number"
              className="w-20 bg-bg border border-slate-600 rounded-lg px-3 py-2 text-white"
              value={heightIn}
              onChange={(e) => setHeightIn(e.target.value)}
              placeholder="10"
              min={0}
              max={11}
            />
            <span className="text-slate-400">in</span>
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="w-4 h-4 rounded accent-primary"
            checked={isCaptain}
            onChange={(e) => setIsCaptain(e.target.checked)}
          />
          <span className="text-sm text-slate-300">Captain</span>
        </label>
      </div>
    </Modal>
  );
}
