import { useState, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import Papa from 'papaparse';
import { db } from '../db/schema';
import { useTeam, usePlayers, useSeasons } from '../hooks/useTeamData';
import { useUiStore, selectShowToast } from '../store/uiStore';
import { POSITION_KEYS, POSITIONS, TRACKABLE_STATS } from '../constants';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { TabBar } from '../components/ui/Tab';
import { LineupForm } from '../components/match/LineupForm';
import { ROMAN } from '../components/court/CourtZonePicker';

const POS_COLOR = { S: 'blue', OH: 'orange', OPP: 'orange', MB: 'green', L: 'gray', DS: 'gray', RS: 'orange' };

function PlayerFormModal({ onClose, teamId, player }) {
  const [name, setName]       = useState(player?.name ?? '');
  const [jersey, setJersey]   = useState(player?.jersey_number ?? '');
  const [position, setPosition] = useState(player?.position ?? 'OH');
  const [secondaryPosition, setSecondaryPosition] = useState(player?.secondary_position ?? '');
  const [isCaptain, setIsCaptain] = useState(player?.is_captain ?? false);
  const [year, setYear] = useState(player?.year ?? '');
  const [heightFt, setHeightFt] = useState(player?.height_ft != null ? String(player.height_ft) : '');
  const [heightIn, setHeightIn] = useState(player?.height_in != null ? String(player.height_in) : '');
  const showToast = useUiStore(selectShowToast);

  const save = async () => {
    if (!name.trim()) return;
    try {
      const hFt = heightFt !== '' ? Number(heightFt) : null;
      const hIn = heightIn !== '' ? Number(heightIn) : null;
      if (player) {
        await db.players.update(player.id, { name: name.trim(), jersey_number: jersey.trim(), position, secondary_position: secondaryPosition || null, is_captain: isCaptain, year: year || null, height_ft: hFt, height_in: hIn });
      } else {
        await db.players.add({ team_id: teamId, name: name.trim(), jersey_number: jersey.trim(), position, secondary_position: secondaryPosition || null, is_captain: isCaptain, year: year || null, height_ft: hFt, height_in: hIn, is_active: true });
      }
      onClose();
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
          <Button onClick={save}>Save</Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="block text-sm text-slate-400 mb-1">Name</label>
          <input
            className="w-full bg-bg border border-slate-600 rounded-lg px-3 py-2 text-white"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Emma Johnson"
            autoFocus
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

function SeasonFormModal({ onClose, teamId, season }) {
  const [name, setName] = useState(season?.name ?? '');
  const [year, setYear] = useState(season?.year ?? new Date().getFullYear());
  const showToast = useUiStore(selectShowToast);

  const save = async () => {
    if (!name.trim()) return;
    try {
      if (season) {
        await db.seasons.update(season.id, { name: name.trim(), year: Number(year) });
      } else {
        await db.seasons.add({ team_id: teamId, name: name.trim(), year: Number(year) });
      }
      onClose();
    } catch (err) {
      showToast(`Save failed: ${err.message}`, 'error');
    }
  };

  return (
    <Modal
      title={season ? 'Edit Season' : 'New Season'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="block text-sm text-slate-400 mb-1">Season Name</label>
          <input
            className="w-full bg-bg border border-slate-600 rounded-lg px-3 py-2 text-white"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Fall 2025"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Year</label>
          <input
            type="number"
            className="w-full bg-bg border border-slate-600 rounded-lg px-3 py-2 text-white"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}

const RECORD_TYPES = [
  { value: 'individual_match',  label: 'Individual Match'  },
  { value: 'individual_season', label: 'Individual Season' },
  { value: 'team_match',        label: 'Team Match'        },
  { value: 'team_season',       label: 'Team Season'       },
];

function RecordFormModal({ onClose, teamId, record, type }) {
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
      // Resolve player_name from player picker if individual_match
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

function SavedLineupModal({ onClose, teamId, savedLineup, activePlayers }) {
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

// ── Roster Import ─────────────────────────────────────────────────────────────

const TEMPLATE_CSV = `Name,Jersey,Position,Year
Emma Johnson,11,OH,Junior
Sara Smith,7,S,Senior
Mia Lee,3,MB,
Jordan Park,1,L,Freshman
`;

function normalizeHeader(raw) {
  const k = raw.toLowerCase().replace(/[\s_\-#.,()]/g, '');
  if (['name', 'player', 'playername', 'fullname'].includes(k)) return 'name';
  if (['jersey', 'jerseynumber', 'jerseynb', 'number', 'num', 'no'].includes(k) || k === '#') return 'jersey';
  if (['position', 'pos', 'role'].includes(k)) return 'position';
  if (['year', 'grade', 'class'].includes(k)) return 'year';
  return null;
}

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'roster-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function RosterImportModal({ onClose, teamId }) {
  const [step,      setStep]      = useState('upload'); // 'upload' | 'preview'
  const [rows,      setRows]      = useState([]);
  const [parseErrs, setParseErrs] = useState([]);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);
  const showToast = useUiStore(selectShowToast);

  function handleFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result.trim();
      // Auto-detect delimiter: prefer tab if first line has tabs, else comma
      const firstLine = text.split('\n')[0] ?? '';
      const delimiter = firstLine.includes('\t') && !firstLine.includes(',') ? '\t' : ',';

      const result = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        delimiter,
        transformHeader: (h) => h.trim(),
        transform: (v) => (typeof v === 'string' ? v.trim() : v),
      });

      if (!result.data.length) {
        setParseErrs(['No data rows found. Make sure the file has a header row and at least one player.']);
        return;
      }

      // Map raw headers → known fields
      const headerMap = {};
      for (const h of (result.meta.fields ?? [])) {
        const norm = normalizeHeader(h);
        if (norm) headerMap[h] = norm;
      }

      if (!Object.values(headerMap).includes('name')) {
        setParseErrs([
          'Could not find a "Name" column. Make sure the first row is a header row (Name, Jersey, Position). Download the template for the exact format.',
        ]);
        return;
      }

      const parsed = [];
      const errs   = [];
      result.data.forEach((row, i) => {
        const m = {};
        for (const [orig, field] of Object.entries(headerMap)) {
          m[field] = row[orig] ?? '';
        }
        if (!m.name) { errs.push(`Row ${i + 2}: missing name — skipped`); return; }

        const rawPos = (m.position ?? '').toUpperCase();
        const pos    = POSITION_KEYS.includes(rawPos) ? rawPos : 'OH';
        parsed.push({
          name:            m.name,
          jersey_number:   m.jersey ?? '',
          position:        pos,
          posWarn:         !!m.position && !POSITION_KEYS.includes(rawPos),
          year:            m.year ?? '',
          _row:            i + 2,
        });
      });

      setParseErrs(errs);
      setRows(parsed);
      if (parsed.length) setStep('preview');
    };
    reader.readAsText(file);
  }

  async function doImport() {
    setImporting(true);
    try {
      await db.players.bulkAdd(
        rows.map((r) => ({
          team_id:      teamId,
          name:         r.name,
          jersey_number: r.jersey_number,
          position:     r.position,
          year:         r.year || null,
          is_active:    true,
          is_captain:   false,
        }))
      );
      showToast(`Imported ${rows.length} player${rows.length !== 1 ? 's' : ''}`, 'success');
      onClose();
    } catch (err) {
      showToast(`Import failed: ${err.message}`, 'error');
    } finally {
      setImporting(false);
    }
  }

  const POS_CHIP = { S: 'text-blue-300 bg-blue-950/60', OH: 'text-orange-300 bg-orange-950/60', MB: 'text-green-300 bg-green-950/60', OPP: 'text-purple-300 bg-purple-950/60', L: 'text-emerald-300 bg-emerald-950/60', DS: 'text-slate-300 bg-slate-700', RS: 'text-orange-300 bg-orange-950/60' };

  return (
    <Modal
      title="Import Roster"
      onClose={onClose}
      footer={
        step === 'preview' ? (
          <>
            <Button variant="secondary" onClick={() => { setStep('upload'); setRows([]); setParseErrs([]); }}>Back</Button>
            <Button onClick={doImport} disabled={importing || !rows.length}>
              {importing ? 'Importing…' : `Import ${rows.length} Player${rows.length !== 1 ? 's' : ''}`}
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        )
      }
    >
      {step === 'upload' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Upload a <strong className="text-white">CSV</strong> or <strong className="text-white">TXT</strong> file with one player per row.
            The first row must be a header row.
          </p>

          {/* Template download */}
          <div className="flex items-center justify-between bg-slate-800 rounded-lg px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-white">Download Template</div>
              <div className="text-xs text-slate-400">Pre-formatted CSV with correct headers</div>
            </div>
            <Button size="sm" variant="ghost" onClick={downloadTemplate}>↓ CSV</Button>
          </div>

          {/* Drop zone */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
            className="border-2 border-dashed border-slate-600 rounded-xl py-10 text-center cursor-pointer
              hover:border-primary hover:bg-primary/5 transition-colors select-none"
          >
            <div className="text-4xl mb-2">📂</div>
            <div className="text-sm font-semibold text-white mb-1">Tap to choose file</div>
            <div className="text-xs text-slate-500">CSV or TXT · comma or tab separated</div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>

          {/* Format hint */}
          <div className="bg-slate-900 rounded-lg px-4 py-3 font-mono text-xs text-slate-400 space-y-0.5">
            <div className="text-slate-500 mb-1">Required columns (header row):</div>
            <div className="text-slate-300">Name, Jersey, Position</div>
            <div className="text-slate-500 mt-1">Optional:</div>
            <div>Year — Freshman / Sophomore / Junior / Senior</div>
            <div>Positions — OH OPP MB S L DS RS</div>
          </div>

          {parseErrs.length > 0 && (
            <div className="space-y-1">
              {parseErrs.map((e, i) => (
                <div key={i} className="text-sm text-red-400 flex gap-2"><span>⚠</span><span>{e}</span></div>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">
            Ready to import <span className="font-bold text-white">{rows.length}</span> player{rows.length !== 1 ? 's' : ''}.
            Review below, then tap Import.
          </p>

          {parseErrs.length > 0 && (
            <div className="bg-yellow-950/30 border border-yellow-800/40 rounded-lg px-3 py-2 space-y-0.5">
              {parseErrs.map((e, i) => (
                <div key={i} className="text-xs text-yellow-400">⚠ {e}</div>
              ))}
            </div>
          )}

          <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
            {rows.map((r, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 ${r.posWarn ? 'bg-yellow-950/20 border border-yellow-800/30' : 'bg-surface'}`}
              >
                <span className="text-slate-500 font-mono text-xs w-6 text-right shrink-0">
                  {r.jersey_number || '—'}
                </span>
                <span className="flex-1 font-medium text-sm truncate">{r.name}</span>
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${POS_CHIP[r.position] ?? 'bg-slate-700 text-slate-300'}`}>
                  {r.position}
                  {r.posWarn && ' *'}
                </span>
                {r.year && <span className="text-xs text-slate-500 shrink-0">{r.year}</span>}
              </div>
            ))}
          </div>

          {rows.some((r) => r.posWarn) && (
            <p className="text-xs text-yellow-500">* Position not recognized — defaulted to OH. Edit after import if needed.</p>
          )}
        </div>
      )}
    </Modal>
  );
}

export function TeamDetailPage() {
  const { teamId } = useParams();
  const navigate = useNavigate();
  const id = Number(teamId);
  const team    = useTeam(id);
  const players = usePlayers(id);
  const seasons = useSeasons(id);

  // Memoized splits to avoid O(n) filter on every render
  const activePlayers = useMemo(
    () => (players ?? []).filter((p) => p.is_active).sort((a, b) => Number(a.jersey_number) - Number(b.jersey_number)),
    [players]
  );
  const inactivePlayers = useMemo(
    () => (players ?? []).filter((p) => !p.is_active),
    [players]
  );

  const savedLineups = useLiveQuery(
    () => db.saved_lineups.where('team_id').equals(id).toArray(),
    [id]
  );

  const records = useLiveQuery(
    () => db.records.where('team_id').equals(id).toArray(),
    [id]
  );

  const [tab, setTab]             = useState('roster');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [editPlayer, setEditPlayer]           = useState(null);
  const [showSeasonModal, setShowSeasonModal] = useState(false);
  const [editSeason, setEditSeason]           = useState(null);
  const [deletePlayer, setDeletePlayer]       = useState(null);
  const [showLineupModal, setShowLineupModal] = useState(false);
  const [editLineup, setEditLineup]           = useState(null);
  const [deleteLineup, setDeleteLineup]       = useState(null);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [addRecordType,   setAddRecordType]   = useState(null);
  const [editRecord,      setEditRecord]      = useState(null);
  const [deleteRecord,    setDeleteRecord]    = useState(null);
  const showToast = useUiStore(selectShowToast);

  const removePlayer = async () => {
    try {
      await db.players.update(deletePlayer.id, { is_active: false });
      setDeletePlayer(null);
    } catch (err) {
      showToast(`Remove failed: ${err.message}`, 'error');
    }
  };

  return (
    <div>
      <PageHeader title={team?.name ?? 'Team'} backTo="/teams" />
      {(team?.state || team?.school_year) && (
        <div className="px-4 pb-2 flex gap-2 text-sm text-slate-400">
          {team.state && <span>{team.state}</span>}
          {team.state && team.school_year && <span>·</span>}
          {team.school_year && <span>{team.school_year}</span>}
        </div>
      )}

      <TabBar
        tabs={[
          { value: 'roster',  label: `Roster (${activePlayers.length})` },
          { value: 'lineups', label: 'Lineups' },
          { value: 'seasons', label: 'Seasons' },
          { value: 'records', label: 'Records' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'roster' && (
        <div className="p-4 md:p-6">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm text-slate-400">{activePlayers.length} active</span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setShowImportModal(true)}>↑ Import</Button>
              <Button size="sm" onClick={() => setShowPlayerModal(true)}>+ Player</Button>
            </div>
          </div>

          {activePlayers.length === 0 ? (
            <EmptyState
              icon="🏐"
              title="No players yet"
              description="Add players to build the roster"
              action={<Button onClick={() => setShowPlayerModal(true)}>Add Player</Button>}
            />
          ) : (
            <div className="space-y-2">
              {activePlayers.map((player) => (
                <div key={player.id} className="bg-surface rounded-xl px-4 py-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center font-mono font-bold text-primary shrink-0">
                    #{player.jersey_number}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">
                      {player.name}
                      {player.is_captain && <span className="ml-1.5 text-xs font-bold text-yellow-400">C</span>}
                    </div>
                    <div className="flex gap-1 flex-wrap items-center">
                      <Badge color={POS_COLOR[player.position] ?? 'gray'}>{player.position}</Badge>
                      {player.secondary_position && (
                        <Badge color={POS_COLOR[player.secondary_position] ?? 'gray'}>{player.secondary_position}</Badge>
                      )}
                      {player.height_ft != null && (
                        <span className="text-xs text-slate-400">{player.height_ft}'{player.height_in != null ? player.height_in : 0}"</span>
                      )}
                      {player.year && <span className="text-xs text-slate-400">{player.year}</span>}
                    </div>
                  </div>
                  <div className="flex gap-3 shrink-0">
                    <button onClick={() => setEditPlayer(player)} className="text-slate-400 hover:text-white text-sm">Edit</button>
                    <button onClick={() => setDeletePlayer(player)} className="text-red-400 hover:text-red-300 text-sm">Remove</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {inactivePlayers.length > 0 && (
            <p className="text-xs text-slate-500 mt-4 text-center">
              {inactivePlayers.length} inactive player{inactivePlayers.length !== 1 ? 's' : ''} hidden
            </p>
          )}
        </div>
      )}

      {tab === 'lineups' && (
        <div className="p-4 md:p-6">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm text-slate-400">{savedLineups?.length ?? 0} saved</span>
            <Button size="sm" onClick={() => setShowLineupModal(true)}>+ Lineup</Button>
          </div>

          {(savedLineups ?? []).length === 0 ? (
            <EmptyState
              icon="📋"
              title="No saved lineups"
              description="Save a lineup to quickly load it during match or set setup"
              action={<Button onClick={() => setShowLineupModal(true)}>Save Lineup</Button>}
            />
          ) : (
            <div className="space-y-2">
              {savedLineups.map((sl) => {
                const playerMap = Object.fromEntries(activePlayers.map((p) => [String(p.id), p]));
                const libero = sl.libero_player_id ? playerMap[String(sl.libero_player_id)] : null;
                return (
                  <div key={sl.id} className="bg-surface rounded-xl px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold">{sl.name}</span>
                      <div className="flex gap-3">
                        <button onClick={() => setEditLineup(sl)} className="text-slate-400 hover:text-white text-sm">Edit</button>
                        <button onClick={() => setDeleteLineup(sl)} className="text-red-400 hover:text-red-300 text-sm">Delete</button>
                      </div>
                    </div>
                    <div className="space-y-0.5">
                      {sl.serve_order.map((pid, i) => {
                        const p = playerMap[pid];
                        return (
                          <div key={i} className="flex items-center gap-2 text-sm">
                            <span className="text-orange-400 font-black w-6 text-right shrink-0">{ROMAN[i]}</span>
                            {p
                              ? <span className="text-slate-200">#{p.jersey_number} {p.name} <span className="text-slate-500">({p.position})</span></span>
                              : <span className="text-slate-600 italic">unassigned</span>
                            }
                          </div>
                        );
                      })}
                      {libero && (
                        <div className="flex items-center gap-2 text-sm mt-1 pt-1 border-t border-slate-700">
                          <span className="text-slate-500 font-semibold w-6 text-right shrink-0">L</span>
                          <span className="text-slate-300">#{libero.jersey_number} {libero.name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'seasons' && (
        <div className="p-4 md:p-6">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm text-slate-400">{seasons?.length ?? 0} seasons</span>
            <Button size="sm" onClick={() => setShowSeasonModal(true)}>+ Season</Button>
          </div>

          {seasons?.length === 0 ? (
            <EmptyState
              icon="📅"
              title="No seasons yet"
              description="Add a season to organize your matches"
              action={<Button onClick={() => setShowSeasonModal(true)}>Add Season</Button>}
            />
          ) : (
            <div className="space-y-2">
              {seasons?.map((season) => (
                <div key={season.id} className="bg-surface rounded-xl flex items-center hover:bg-slate-700 transition-colors">
                  <button
                    onClick={() => navigate(`/seasons/${season.id}`)}
                    className="flex-1 px-4 py-3 text-left flex items-center justify-between"
                  >
                    <div>
                      <div className="font-semibold">{season.name}</div>
                      <div className="text-sm text-slate-400">{season.year}</div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setEditSeason(season)}
                    className="px-3 py-3 text-slate-500 hover:text-slate-300 transition-colors"
                    title="Edit season"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'records' && (
        <div className="p-4 md:p-6 space-y-6">
          {RECORD_TYPES.map(({ value: type, label }) => {
            const typeRecords = (records ?? []).filter((r) => r.type === type);
            return (
              <section key={type}>
                <div className="flex justify-between items-center mb-2">
                  <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">{label}</h2>
                  <Button size="sm" onClick={() => { setAddRecordType(type); setShowRecordModal(true); }}>+ Record</Button>
                </div>
                {typeRecords.length === 0 ? (
                  <p className="text-sm text-slate-600 text-center py-3 bg-surface rounded-xl">No records yet</p>
                ) : (
                  <div className="space-y-2">
                    {typeRecords.map((rec) => (
                      <div key={rec.id} className="bg-surface rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="font-black text-primary text-xl tabular-nums">{rec.value}</span>
                            <span className="font-semibold text-white">{rec.stat}</span>
                          </div>
                          <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5 text-xs text-slate-400">
                            {rec.player_name  && <span>{rec.player_name}</span>}
                            {rec.opponent     && <span>vs. {rec.opponent}</span>}
                            {rec.season_label && <span>{rec.season_label}</span>}
                            {rec.date         && <span>{rec.date}</span>}
                            {rec.notes        && <span className="text-slate-500 italic">{rec.notes}</span>}
                          </div>
                        </div>
                        <div className="flex gap-3 shrink-0">
                          <button onClick={() => setEditRecord(rec)} className="text-slate-400 hover:text-white text-sm">Edit</button>
                          <button onClick={() => setDeleteRecord(rec)} className="text-red-400 hover:text-red-300 text-sm">Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {showImportModal && (
        <RosterImportModal teamId={id} onClose={() => setShowImportModal(false)} />
      )}

      {(showPlayerModal || editPlayer) && (
        <PlayerFormModal
          teamId={id}
          player={editPlayer}
          onClose={() => { setShowPlayerModal(false); setEditPlayer(null); }}
        />
      )}

      {(showSeasonModal || editSeason) && (
        <SeasonFormModal
          teamId={id}
          season={editSeason ?? undefined}
          onClose={() => { setShowSeasonModal(false); setEditSeason(null); }}
        />
      )}

      {(showLineupModal || editLineup) && (
        <SavedLineupModal
          teamId={id}
          savedLineup={editLineup}
          activePlayers={activePlayers}
          onClose={() => { setShowLineupModal(false); setEditLineup(null); }}
        />
      )}

      {deleteLineup && (
        <ConfirmDialog
          title="Delete Lineup"
          message={`Delete "${deleteLineup.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={async () => { await db.saved_lineups.delete(deleteLineup.id); setDeleteLineup(null); }}
          onCancel={() => setDeleteLineup(null)}
        />
      )}

      {deletePlayer && (
        <ConfirmDialog
          title="Remove Player"
          message={`Remove ${deletePlayer.name} from the active roster?`}
          confirmLabel="Remove"
          danger
          onConfirm={removePlayer}
          onCancel={() => setDeletePlayer(null)}
        />
      )}

      {(showRecordModal || editRecord) && (
        <RecordFormModal
          teamId={id}
          record={editRecord}
          type={addRecordType}
          onClose={() => { setShowRecordModal(false); setAddRecordType(null); setEditRecord(null); }}
        />
      )}

      {deleteRecord && (
        <ConfirmDialog
          title="Delete Record"
          message={`Delete this ${deleteRecord.stat} record? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={async () => { await db.records.delete(deleteRecord.id); setDeleteRecord(null); }}
          onCancel={() => setDeleteRecord(null)}
        />
      )}
    </div>
  );
}
