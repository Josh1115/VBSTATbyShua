import { useState, useEffect, useMemo } from 'react';
import { getStorageItem, getIntStorage, STORAGE_KEYS } from '../utils/storage';
import { useUiStore, selectShowToast } from '../store/uiStore';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { useMatchStore } from '../store/matchStore';
import { MATCH_STATUS, SET_STATUS, FORMAT, SIDE } from '../constants';
import { serveOrderToZone } from '../components/court/CourtZonePicker';
import { LineupForm } from '../components/match/LineupForm';

export function MatchSetupPage() {
  const navigate   = useNavigate();
  const showToast  = useUiStore(selectShowToast);
  const resetMatch = useMatchStore((s) => s.resetMatch);
  const [searchParams] = useSearchParams();

  const scheduledMatchId = searchParams.get('match') ? Number(searchParams.get('match')) : null;

  const [seasonId,  setSeasonId]  = useState(searchParams.get('season') ?? '');
  const [opponent,           setOpponent]           = useState('');
  const [opponentAbbr,       setOpponentAbbr]       = useState('');
  const [opponentRecord,     setOpponentRecord]     = useState('');
  const [opponentMaxprepsRank, setOpponentMaxprepsRank] = useState('');
  const [conference,    setConference]    = useState('non-con');
  const [location,      setLocation]      = useState('home');
  const [matchType,     setMatchType]     = useState('reg-season');
  const [format,    setFormat]    = useState(() => {
    const saved = getStorageItem(STORAGE_KEYS.DEFAULT_FORMAT);
    return saved === FORMAT.BEST_OF_5 ? FORMAT.BEST_OF_5 : FORMAT.BEST_OF_3;
  });
  const [lastSetScore, setLastSetScore] = useState(() => getIntStorage(STORAGE_KEYS.LAST_SET_SCORE, 15));
  // lineup[i] = playerId for serve order i+1 (I=0 … VI=5)
  const [lineup,         setLineupState]    = useState(Array(6).fill(''));
  // slotPositions[i] = position label override for serve slot i (e.g. 'OH', 'MB')
  const [slotPositions,  setSlotPositions]  = useState(Array(6).fill(''));
  // startZone = court zone (1-6) where Player I starts; default 1 = back right
  const [startZone, setStartZone]  = useState(1);
  // liberoId = player designated as libero (optional)
  const [liberoId,  setLiberoId]   = useState('');
  const [servingSide, setServingSide] = useState(SIDE.US);
  const [teamJerseyColor,   setTeamJerseyColor]   = useState('black');
  const [liberoJerseyColor, setLiberoJerseyColor] = useState('black');
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState('');
  const [loadPickerOpen, setLoadPickerOpen] = useState(false);

  // Load all seasons with their team + org name for the picker
  const seasons = useLiveQuery(async () => {
    const allSeasons = await db.seasons.toArray();
    const teams      = await db.teams.bulkGet(allSeasons.map((s) => s.team_id));
    return allSeasons.map((s, i) => ({ ...s, teamName: teams[i]?.name ?? '?' }));
  }, []);

  const selectedSeason = (seasons ?? []).find((s) => s.id === Number(seasonId));

  const selectedTeam = useLiveQuery(
    () => selectedSeason?.team_id ? db.teams.get(selectedSeason.team_id) : Promise.resolve(null),
    [selectedSeason?.team_id]
  );

  const players = useLiveQuery(
    () => selectedSeason
      ? db.players.where('team_id').equals(selectedSeason.team_id).filter((p) => p.is_active).toArray()
      : [],
    [selectedSeason?.team_id]
  );

  const savedLineups = useLiveQuery(
    () => selectedSeason
      ? db.saved_lineups.where('team_id').equals(selectedSeason.team_id).toArray()
      : [],
    [selectedSeason?.team_id]
  );

  const scheduledMatch = useLiveQuery(
    () => scheduledMatchId ? db.matches.get(scheduledMatchId) : Promise.resolve(null),
    [scheduledMatchId]
  );

  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    if (scheduledMatch && !prefilled) {
      setOpponent(scheduledMatch.opponent_name ?? '');
      setOpponentAbbr(scheduledMatch.opponent_abbr ?? '');
      setConference(scheduledMatch.conference ?? 'non-con');
      setLocation(scheduledMatch.location ?? 'home');
      setMatchType(scheduledMatch.match_type ?? 'reg-season');
      setPrefilled(true);
    }
  }, [scheduledMatch, prefilled]);

  // When the selected team changes, reset jersey colors to first available if current pick isn't in the team's palette
  useEffect(() => {
    if (!selectedTeam) return;
    const toIds = (v) => Array.isArray(v) ? v : (v ? [v] : []);
    const teamIds   = toIds(selectedTeam.team_jersey_color);
    const liberoIds = toIds(selectedTeam.libero_jersey_color);
    if (teamIds.length   && !teamIds.includes(teamJerseyColor))     setTeamJerseyColor(teamIds[0]);
    if (liberoIds.length && !liberoIds.includes(liberoJerseyColor)) setLiberoJerseyColor(liberoIds[0]);
  }, [selectedTeam]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyLoadedLineup = (sl) => {
    setLineupState(sl.serve_order.map(String));
    setStartZone(sl.start_zone ?? 1);
    setLiberoId(sl.libero_player_id ? String(sl.libero_player_id) : '');
    setSlotPositions(sl.slot_positions ?? Array(6).fill(''));
    setLoadPickerOpen(false);
  };

  const handleStart = async () => {
    setError('');
    if (!seasonId) { setError('Select a season.'); return; }
    if (!opponent.trim()) { setError('Enter opponent name.'); return; }
    if (lineup.some((id) => !id)) { setError('Assign a player to every position.'); return; }
    if (new Set(lineup).size !== lineup.length) { setError('Each player can only appear once in the lineup.'); return; }

    setSaving(true);
    try {
      resetMatch();
      useMatchStore.setState({ serveSide: servingSide, teamJerseyColor, liberoJerseyColor });

      // Upsert opponent
      let oppRecord = await db.opponents.where('name').equals(opponent.trim()).first();
      if (!oppRecord) {
        const oppId = await db.opponents.add({ name: opponent.trim() });
        oppRecord = { id: oppId, name: opponent.trim() };
      }

      // Create or update match
      let effectiveMatchId;
      if (scheduledMatchId) {
        await db.matches.update(scheduledMatchId, {
          opponent_id:           oppRecord.id,
          opponent_name:         oppRecord.name,
          opponent_abbr:         opponentAbbr.trim().toUpperCase() || null,
          opponent_record:       opponentRecord.trim() || null,
          opponent_maxpreps_rank: opponentMaxprepsRank !== '' ? parseInt(opponentMaxprepsRank, 10) : null,
          status:                MATCH_STATUS.IN_PROGRESS,
          format,
          last_set_score:        lastSetScore,
          location,
          conference,
          match_type:            matchType,
          date:                  new Date().toISOString(),
        });
        effectiveMatchId = scheduledMatchId;
      } else {
        effectiveMatchId = await db.matches.add({
          season_id:             Number(seasonId),
          opponent_id:           oppRecord.id,
          opponent_name:         oppRecord.name,
          opponent_abbr:         opponentAbbr.trim().toUpperCase() || null,
          opponent_record:       opponentRecord.trim() || null,
          opponent_maxpreps_rank: opponentMaxprepsRank !== '' ? parseInt(opponentMaxprepsRank, 10) : null,
          status:                MATCH_STATUS.IN_PROGRESS,
          format,
          last_set_score:        lastSetScore,
          location,
          conference,
          match_type:            matchType,
          date:                  new Date().toISOString(),
        });
      }

      // Create first set
      const setId = await db.sets.add({
        match_id:         effectiveMatchId,
        set_number:       1,
        status:           SET_STATUS.IN_PROGRESS,
        our_score:        0,
        opp_score:        0,
        libero_player_id: liberoId ? Number(liberoId) : null,
      });

      // Write lineup rows: position = court zone based on where Player I starts
      await db.lineups.bulkAdd(
        lineup.map((playerId, i) => ({
          set_id:         setId,
          player_id:      Number(playerId),
          position:       serveOrderToZone(i, startZone),  // court zone 1-6
          serve_order:    i + 1,                           // serve order 1-6 (I=1 … VI=6)
          position_label: slotPositions[i] || '',
        }))
      );

      navigate(`/matches/${effectiveMatchId}/live`);
    } catch (e) {
      showToast('Failed to create match. Try again.', 'error');
      setError('Failed to create match. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pb-8">
      <PageHeader title="New Match" backTo="/" />

      <div className="p-4 md:p-6 space-y-5 max-w-lg mx-auto">

        {/* Season picker */}
        <div>
          <label className="block text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wide">
            Season / Team
          </label>
          <select
            value={seasonId}
            onChange={(e) => { setSeasonId(e.target.value); setLineupState(Array(6).fill('')); setSlotPositions(Array(6).fill('')); setLiberoId(''); }}
            className="w-full bg-surface border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
          >
            <option value="">Select season…</option>
            {(seasons ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.teamName} — {s.name ?? s.year}
              </option>
            ))}
          </select>
        </div>

        {/* Opponent */}
        <div>
          <label className="block text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wide">
            Opponent
          </label>
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={opponent}
              onChange={(e) => setOpponent(e.target.value)}
              placeholder="Opponent team name"
              className="flex-1 bg-surface border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary placeholder:text-slate-600"
            />
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] text-slate-500 uppercase tracking-wide leading-none">Abbr</span>
              <input
                type="text"
                value={opponentAbbr}
                onChange={(e) => setOpponentAbbr(e.target.value.toUpperCase().slice(0, 3))}
                placeholder="OPP"
                maxLength={3}
                className="w-[56px] bg-surface border border-slate-600 text-white rounded-lg px-2 py-2 text-sm text-center font-bold uppercase tracking-widest focus:outline-none focus:border-primary placeholder:text-slate-600"
              />
            </div>
          </div>
        </div>

        {/* Opponent record + MaxPreps rank */}
        <div className="flex gap-2">
          <div className="flex-1 min-w-0">
            <label className="block text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wide">
              Record <span className="normal-case font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={opponentRecord}
              onChange={(e) => setOpponentRecord(e.target.value)}
              placeholder="e.g. 12-3"
              className="w-full bg-surface border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary placeholder:text-slate-600"
            />
          </div>
          <div className="flex-1 min-w-0">
            <label className="block text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wide">
              MaxPreps Rank <span className="normal-case font-normal">(opt)</span>
            </label>
            <input
              type="number"
              min={1}
              value={opponentMaxprepsRank}
              onChange={(e) => setOpponentMaxprepsRank(e.target.value)}
              placeholder="e.g. 42"
              className="w-full bg-surface border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary placeholder:text-slate-600"
            />
          </div>
        </div>

        {/* Conference */}
        <div>
          <label className="block text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wide">
            Opponent Type
          </label>
          <div className="flex gap-2">
            {[['conference', 'Conference'], ['non-con', 'Non-Con']].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setConference(val)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors
                  ${conference === val
                    ? 'bg-primary text-white border-primary'
                    : 'bg-surface text-slate-300 border-slate-600 hover:border-slate-400'
                  }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Location */}
        <div>
          <label className="block text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wide">
            Location
          </label>
          <div className="flex gap-2">
            {['home', 'away', 'neutral'].map((loc) => (
              <button
                key={loc}
                onClick={() => setLocation(loc)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors
                  ${location === loc
                    ? 'bg-primary text-white border-primary'
                    : 'bg-surface text-slate-300 border-slate-600 hover:border-slate-400'
                  }`}
              >
                {loc.charAt(0).toUpperCase() + loc.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Match Type */}
        <div>
          <label className="block text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wide">
            Match Type
          </label>
          <div className="flex gap-2">
            {[['reg-season', 'Reg Season'], ['tourney', 'Tourney'], ['ihsa-playoffs', 'IHSA Playoffs'], ['exhibition', 'Exhibition']].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setMatchType(val)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors
                  ${matchType === val
                    ? 'bg-primary text-white border-primary'
                    : 'bg-surface text-slate-300 border-slate-600 hover:border-slate-400'
                  }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Serve / Serve-Rec */}
        <div>
          <label className="block text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wide">
            Set 1 Start
          </label>
          <div className="flex gap-2">
            {[SIDE.US, SIDE.THEM].map((side) => (
              <button
                key={side}
                onClick={() => setServingSide(side)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors
                  ${servingSide === side
                    ? 'bg-primary text-white border-primary'
                    : 'bg-surface text-slate-300 border-slate-600 hover:border-slate-400'
                  }`}
              >
                {side === SIDE.US ? 'Serving' : 'Serve Rec'}
              </button>
            ))}
          </div>
        </div>

        {/* Jersey colors — options filtered to team's saved palette, fallback to all */}
        {(() => {
          const ALL_COLORS = [
            { id: 'black',  label: 'Black',  bg: '#111827', border: '#374151' },
            { id: 'white',  label: 'White',  bg: '#f8fafc', border: '#94a3b8' },
            { id: 'gray',   label: 'Gray',   bg: '#94a3b8', border: '#64748b' },
            { id: 'red',    label: 'Red',    bg: '#dc2626', border: '#ef4444' },
            { id: 'orange', label: 'Orange', bg: '#ea580c', border: '#f97316' },
            { id: 'yellow', label: 'Yellow', bg: '#ca8a04', border: '#eab308' },
            { id: 'green',  label: 'Green',  bg: '#16a34a', border: '#22c55e' },
            { id: 'blue',   label: 'Blue',   bg: '#1d4ed8', border: '#3b82f6' },
            { id: 'purple', label: 'Purple', bg: '#7c3aed', border: '#a855f7' },
            { id: 'pink',   label: 'Pink',   bg: '#db2777', border: '#ec4899' },
          ];
          const toIds = (v) => Array.isArray(v) ? v : (v ? [v] : []);
          const teamIds   = toIds(selectedTeam?.team_jersey_color);
          const liberoIds = toIds(selectedTeam?.libero_jersey_color);
          const teamColors   = teamIds.length   ? ALL_COLORS.filter(c => teamIds.includes(c.id))   : ALL_COLORS;
          const liberoColors = liberoIds.length ? ALL_COLORS.filter(c => liberoIds.includes(c.id)) : ALL_COLORS;
          const Picker = ({ label, value, onChange, colors }) => (
            <div>
              <label className="block text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wide">{label}</label>
              <div className="flex flex-wrap gap-2">
                {colors.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onChange(c.id)}
                    className="flex flex-col items-center gap-1 py-2 px-3 rounded-lg border transition-colors"
                    style={{
                      borderColor: value === c.id ? 'var(--color-primary)' : c.border,
                      boxShadow:   value === c.id ? '0 0 0 2px var(--color-primary)' : 'none',
                    }}
                  >
                    <span className="w-6 h-6 rounded-full block" style={{ background: c.bg, border: `1px solid ${c.border}` }} />
                    <span className="text-[11px] text-slate-400 leading-none">{c.label}</span>
                  </button>
                ))}
              </div>
            </div>
          );
          return (
            <>
              <Picker label="Team Jersey Color"  value={teamJerseyColor}   onChange={setTeamJerseyColor}   colors={teamColors} />
              <Picker label="Libero Jersey Color" value={liberoJerseyColor} onChange={setLiberoJerseyColor} colors={liberoColors} />
            </>
          );
        })()}

        {/* Load saved lineup */}
        {selectedSeason && (savedLineups ?? []).length > 0 && (
          <div>
            <label className="block text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wide">
              Saved Lineups
            </label>
            {loadPickerOpen ? (
              <div className="space-y-2">
                {savedLineups.map((sl) => (
                  <button
                    key={sl.id}
                    onClick={() => applyLoadedLineup(sl)}
                    className="w-full text-left bg-surface border border-slate-600 hover:border-primary rounded-lg px-4 py-3 transition-colors"
                  >
                    <span className="font-semibold text-white">{sl.name}</span>
                    <span className="block text-xs text-slate-400 mt-0.5">
                      {sl.serve_order.map((pid) => {
                        const p = (players ?? []).find((pl) => String(pl.id) === String(pid));
                        return p ? `#${p.jersey_number} ${p.name}` : '?';
                      }).join(' · ')}
                    </span>
                  </button>
                ))}
                <button
                  onClick={() => setLoadPickerOpen(false)}
                  className="w-full py-2 text-sm text-slate-500 hover:text-slate-300"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setLoadPickerOpen(true)}
                className="w-full py-2 rounded-lg text-sm font-semibold border border-slate-600 text-slate-300 hover:border-slate-400 bg-surface transition-colors"
              >
                Load Saved Lineup
              </button>
            )}
          </div>
        )}

        {/* Lineup builder */}
        {selectedSeason && (players ?? []).length > 0 && (
          <LineupForm
            lineup={lineup}
            setLineup={setLineupState}
            slotPositions={slotPositions}
            setSlotPositions={setSlotPositions}
            startZone={startZone}
            setStartZone={setStartZone}
            liberoId={liberoId}
            setLiberoId={setLiberoId}
            players={players}
          />
        )}

        {/* Error */}
        {error && <p className="text-red-400 text-sm">{error}</p>}

        {/* Start */}
        <Button
          size="lg"
          className="w-full"
          disabled={saving}
          onClick={handleStart}
        >
          {saving ? 'Creating…' : 'Start Match'}
        </Button>
      </div>
    </div>
  );
}
