import { useState, useEffect, useMemo, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { computeTeamStats, computePlayerStats } from '../stats/engine';
import { getContactsForMatches, getBatchSetsPlayedCount } from '../stats/queries';
import { buildPlayerMaps } from '../utils/players';
import { fmtCount, fmtBlocks, fmtDate } from '../stats/formatters';
import { MATCH_STATUS } from '../constants';
import { STORAGE_KEYS, getIntStorage } from '../utils/storage';
import { PageHeader } from '../components/layout/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';

const RECORD_STATS = [
  { key: 'k',   label: 'Kills',   fmt: fmtCount },
  { key: 'ace', label: 'Aces',    fmt: fmtCount },
  { key: 'blk', label: 'Blocks',  fmt: fmtBlocks },
  { key: 'ast', label: 'Assists', fmt: fmtCount },
  { key: 'dig', label: 'Digs',    fmt: fmtCount },
];

const TABS = [
  { value: 'season',     label: 'Season'     },
  { value: 'career',     label: 'Career'     },
  { value: 'match',      label: 'Match'      },
  { value: 'team_match', label: 'Team Match' },
];

const RANK_ICONS = { 1: '🥇', 2: '🥈', 3: '🥉' };

// ── computation ───────────────────────────────────────────────────────────────

function groupByMatch(contacts) {
  const map = new Map();
  for (const c of contacts) {
    if (!map.has(c.match_id)) map.set(c.match_id, []);
    map.get(c.match_id).push(c);
  }
  return map;
}

function getStatValue(stats, key) {
  if (key === 'blk') return (stats.bs ?? 0) + (stats.ba ?? 0) * 0.5 || null;
  return stats[key] ?? null;
}

function mergeAndRank(computed, historical) {
  const all = [
    ...computed.map(r => ({ ...r, historical: false })),
    ...historical.map(r => ({ ...r, historical: true  })),
  ];
  return all
    .filter(e => e.val != null && e.val > 0)
    .sort((a, b) => b.val - a.val)
    .slice(0, 10)
    .map((e, i) => ({ ...e, rank: i + 1 }));
}

async function computeLeaderboards(tab, teamId, currentSeasonId) {
  const players = await db.players.where('team_id').equals(teamId).toArray();
  const { playerNames } = buildPlayerMaps(players);
  const positions = Object.fromEntries(players.map(p => [p.id, p.position]));
  const activePlayerIds = new Set(players.filter(p => p.is_active).map(p => p.id));
  const playerYears = Object.fromEntries(players.filter(p => p.year).map(p => [p.id, p.year]));

  const historicalAll = await db.historical_records
    .where('team_id').equals(teamId)
    .filter(r => r.category === tab)
    .toArray();

  function historicalRows(statKey) {
    return historicalAll
      .filter(r => r.stat === statKey)
      .map(r => ({
        id:                r.id,
        name:              r.player_name ?? '',
        val:               r.value,
        year:              r.season_year ?? '',
        opp:               r.opponent ?? '',
        date:              r.date ?? '',
        class_year:        r.class_year ?? '',
        career_year_start: r.career_year_start ?? null,
        career_year_end:   r.career_year_end   ?? null,
        active:            r.career_year_start != null && !r.career_year_end,
      }));
  }

  const seasons = await db.seasons.where('team_id').equals(teamId).toArray();
  if (!seasons.length) return Object.fromEntries(RECORD_STATS.map(s => [s.key, mergeAndRank([], historicalRows(s.key))]));

  const allMatches = await db.matches
    .where('season_id').anyOf(seasons.map(s => s.id))
    .filter(m => m.status !== MATCH_STATUS.SCHEDULED)
    .toArray();

  if (!allMatches.length) return Object.fromEntries(RECORD_STATS.map(s => [s.key, mergeAndRank([], historicalRows(s.key))]));

  const matchIds = allMatches.map(m => m.id);
  const [contacts, setsMap] = await Promise.all([
    getContactsForMatches(matchIds),
    getBatchSetsPlayedCount(matchIds),
  ]);
  const byMatch = groupByMatch(contacts);

  // season tab — compute stats per season, track year on each row
  if (tab === 'season') {
    const seasonById = Object.fromEntries(seasons.map(s => [s.id, s]));
    const matchesBySeason = {};
    for (const m of allMatches) {
      if (!matchesBySeason[m.season_id]) matchesBySeason[m.season_id] = [];
      matchesBySeason[m.season_id].push(m);
    }

    const seasonRows = []; // { pid, stats, year }
    for (const season of seasons) {
      const sMatches = matchesBySeason[season.id] ?? [];
      if (!sMatches.length) continue;
      const sContacts = sMatches.flatMap(m => byMatch.get(m.id) ?? []);
      const totalSets = Math.max(1, sMatches.reduce((a, m) => a + (setsMap[m.id] ?? 1), 0));
      const stats = computePlayerStats(sContacts, totalSets, positions);
      for (const [pid, s] of Object.entries(stats)) {
        seasonRows.push({ pid, stats: s, year: season.year });
      }
    }

    return Object.fromEntries(
      RECORD_STATS.map(({ key }) => {
        const computed = seasonRows.map(({ pid, stats, year }) => ({
          name:       playerNames[pid] ?? '?',
          val:        getStatValue(stats, key),
          year,
          class_year: playerYears[Number(pid)] ?? '',
          active:     activePlayerIds.has(Number(pid)),
        }));
        return [key, mergeAndRank(computed, historicalRows(key))];
      })
    );
  }

  // career tab — manual entries only, no DB computation
  if (tab === 'career') {
    return Object.fromEntries(
      RECORD_STATS.map(({ key }) => [key, mergeAndRank([], historicalRows(key))])
    );
  }

  // match tab — best single-match individual performance
  if (tab === 'match') {
    const perMatch = allMatches.map(m => ({
      opp:  m.opponent_name ?? 'Unknown',
      date: m.date,
      ps:   computePlayerStats(byMatch.get(m.id) ?? [], setsMap[m.id] || 1, positions),
    }));
    return Object.fromEntries(
      RECORD_STATS.map(({ key }) => {
        const computed = [];
        for (const { opp, date, ps } of perMatch) {
          for (const [pid, s] of Object.entries(ps)) {
            const val = getStatValue(s, key);
            if (val != null) computed.push({ name: playerNames[pid] ?? '?', val, opp, date, class_year: playerYears[Number(pid)] ?? '', active: activePlayerIds.has(Number(pid)) });
          }
        }
        return [key, mergeAndRank(computed, historicalRows(key))];
      })
    );
  }

  // team_match tab — best single-match team performance
  const perMatch = allMatches.map(m => ({
    opp:           m.opponent_name ?? 'Unknown',
    date:          m.date,
    currentSeason: currentSeasonId != null && m.season_id === currentSeasonId,
    ts:            computeTeamStats(byMatch.get(m.id) ?? [], setsMap[m.id] || 1),
  }));
  return Object.fromEntries(
    RECORD_STATS.map(({ key }) => [
      key,
      mergeAndRank(
        perMatch.map(({ opp, date, currentSeason, ts }) => ({ val: getStatValue(ts, key), opp, date, currentSeason })),
        historicalRows(key)
      ),
    ])
  );
}

// ── Add Record Modal ──────────────────────────────────────────────────────────

const CLASS_YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior'];
const CLASS_YEAR_ABBR = { Freshman: 'Fr.', Sophomore: 'So.', Junior: 'Jr.', Senior: 'Sr.' };

const EMPTY_FORM = { player_name: '', value: '', opponent: '', date: '', season_year: '', class_year: '', career_year_start: '', career_year_end: '' };

function AddRecordModal({ teamId, tab, statKey, onClose, recordId, initialData }) {
  const [form, setForm] = useState(initialData ?? EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isIndividual   = tab !== 'team_match';
  const needsOpponent  = tab === 'match' || tab === 'team_match';
  const needsSeason    = tab === 'season';
  const needsClassYear  = isIndividual && (tab === 'season' || tab === 'match');
  const needsCareerYears = tab === 'career';

  function set(field, val) {
    setForm(f => ({ ...f, [field]: val }));
    setError('');
  }

  async function handleSave() {
    const val = parseFloat(form.value);
    if (isNaN(val) || val <= 0)               { setError('Enter a valid value greater than 0.'); return; }
    if (isIndividual && !form.player_name.trim()) { setError('Player name is required.'); return; }
    if (needsOpponent && !form.opponent.trim())   { setError('Opponent is required.'); return; }
    if (needsSeason   && !form.season_year.trim()) { setError('Season year is required.'); return; }

    setSaving(true);
    const fields = {
      team_id:           teamId,
      category:          tab,
      stat:              statKey,
      player_name:       form.player_name.trim() || null,
      value:             val,
      opponent:          form.opponent.trim()    || null,
      date:              form.date               || null,
      season_year:       form.season_year.trim() || null,
      class_year:        form.class_year                       || null,
      career_year_start: form.career_year_start ? Number(form.career_year_start) : null,
      career_year_end:   form.career_year_end   ? Number(form.career_year_end)   : null,
    };
    try {
      if (recordId) {
        await db.historical_records.update(recordId, fields);
      } else {
        await db.historical_records.add(fields);
      }
      onClose();
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-primary';
  const labelCls = 'block text-xs font-semibold text-slate-400 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-2xl p-5 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-100">{recordId ? 'Edit Record' : 'Add Historical Record'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        <div className="space-y-3">
          {isIndividual && (
            <div className={needsClassYear ? 'grid grid-cols-2 gap-2' : ''}>
              <div>
                <label className={labelCls}>Player Name</label>
                <input className={inputCls} placeholder="Jane Smith" value={form.player_name} onChange={e => set('player_name', e.target.value)} />
              </div>
              {needsClassYear && (
                <div>
                  <label className={labelCls}>Class Year</label>
                  <select className={inputCls} value={form.class_year} onChange={e => set('class_year', e.target.value)}>
                    <option value="">— optional —</option>
                    {CLASS_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}

          {needsCareerYears && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Active From</label>
                <input className={inputCls} type="number" placeholder="2019" min="1900" max="2100" value={form.career_year_start} onChange={e => set('career_year_start', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Active To</label>
                <input className={inputCls} type="number" placeholder="2023" min="1900" max="2100" value={form.career_year_end} onChange={e => set('career_year_end', e.target.value)} />
              </div>
            </div>
          )}

          <div>
            <label className={labelCls}>Value</label>
            <input className={inputCls} type="number" step="any" placeholder="e.g. 24" value={form.value} onChange={e => set('value', e.target.value)} />
          </div>

          {needsSeason && (
            <div>
              <label className={labelCls}>Season Year</label>
              <input className={inputCls} placeholder="2023" value={form.season_year} onChange={e => set('season_year', e.target.value)} />
            </div>
          )}

          {needsOpponent && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Opponent</label>
                <input className={inputCls} placeholder="Lincoln High" value={form.opponent} onChange={e => set('opponent', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Date</label>
                <input className={inputCls} type="date" value={form.date} onChange={e => set('date', e.target.value)} />
              </div>
            </div>
          )}
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-bold active:scale-95 disabled:opacity-50"
        >
          {saving ? 'Saving…' : recordId ? 'Save Changes' : 'Save Record'}
        </button>
      </div>
    </div>
  );
}

// ── LeaderboardRow ────────────────────────────────────────────────────────────

function LeaderboardRow({ row, tab, fmt, onEdit, onDelete }) {
  const [swiped, setSwiped] = useState(false);
  const startX = useRef(0);
  const showPlayer = tab !== 'team_match';
  const showRight  = tab === 'match' || tab === 'team_match';

  const bgCls = row.active
    ? 'bg-yellow-950'
    : row.currentSeason
      ? 'bg-yellow-950'
      : 'bg-slate-800';

  const inner = (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 ${bgCls} ${
        row.historical
          ? `transition-transform duration-200 ${swiped ? '-translate-x-32' : 'translate-x-0'}`
          : 'rounded-lg'
      }`}
      onTouchStart={row.historical ? e => { startX.current = e.touches[0].clientX; } : undefined}
      onTouchEnd={row.historical ? e => {
        const delta = e.changedTouches[0].clientX - startX.current;
        if (delta < -40) setSwiped(true);
        else if (delta > 20) setSwiped(false);
      } : undefined}
    >
      <span className="w-6 text-center text-sm shrink-0">
        {RANK_ICONS[row.rank] ?? <span className="text-xs font-bold text-slate-500">{row.rank}</span>}
      </span>

      <span className="flex-1 min-w-0 flex items-center gap-2">
        {showPlayer && (
          <span className="text-sm text-slate-200 truncate min-w-0">
            {row.name}
            {tab === 'season' && row.year && (
              <span className="ml-1.5 text-xs text-slate-500">· {row.year}</span>
            )}
            {row.class_year && (
              <span className="ml-1.5 text-xs text-slate-500">· {CLASS_YEAR_ABBR[row.class_year] ?? row.class_year}</span>
            )}
            {(row.career_year_start || row.career_year_end) && (
              <span className="ml-1.5 text-xs text-slate-500">
                · {row.career_year_start === row.career_year_end
                    ? row.career_year_start
                    : `${row.career_year_start ?? '?'}–${row.career_year_end ?? 'present'}`}
              </span>
            )}
          </span>
        )}
        <span className="font-black tabular-nums text-primary text-base shrink-0">
          {fmt(row.val)}
        </span>
      </span>

      {showRight && (
        <span className="text-right text-xs text-slate-500 shrink-0 leading-tight">
          <span className="block">{row.opp}</span>
          <span className="block">{row.date ? fmtDate(row.date) : ''}</span>
        </span>
      )}
    </div>
  );

  if (!row.historical) return inner;

  const borderCls = row.active
    ? 'border border-yellow-500/20'
    : row.currentSeason
      ? 'border border-yellow-500/20'
      : 'border border-slate-700/50';

  return (
    <div className={`relative overflow-hidden rounded-lg ${borderCls}`}>
      <div className="absolute inset-y-0 right-0 flex">
        <button
          onClick={() => { setSwiped(false); onEdit(row); }}
          className="w-16 flex items-center justify-center bg-blue-600 text-white text-xs font-bold"
        >
          Edit
        </button>
        <button
          onClick={() => { setSwiped(false); onDelete(row.id); }}
          className="w-16 flex items-center justify-center bg-red-600 text-white text-xs font-bold"
        >
          Delete
        </button>
      </div>
      {inner}
    </div>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────

export function RecordsPage() {
  const [orgId,   setOrgId]   = useState(null);
  const [gender,  setGender]  = useState(null);
  const [teamId,  setTeamId]  = useState(null);
  const [tab,     setTab]     = useState('season');
  const [statKey, setStatKey] = useState('k');
  const [boards,     setBoards]     = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [showAdd,    setShowAdd]    = useState(false);
  const [editRow,    setEditRow]    = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const orgs = useLiveQuery(
    () => db.organizations.toArray().then(o => o.sort((a, b) => a.name?.localeCompare(b.name))),
    []
  );
  const orgTeams = useLiveQuery(
    () => orgId ? db.teams.where('org_id').equals(orgId).toArray() : Promise.resolve([]),
    [orgId]
  );
  const historicalCount = useLiveQuery(
    () => teamId ? db.historical_records.where('team_id').equals(teamId).count() : Promise.resolve(0),
    [teamId]
  );

  useEffect(() => {
    if (orgs?.length === 1 && !orgId) setOrgId(orgs[0].id);
  }, [orgs, orgId]);

  const genderTeams = useMemo(() => {
    const varsity = (orgTeams ?? []).filter(t => t.level === 'varsity');
    return {
      F: varsity.filter(t => t.gender === 'F'),
      M: varsity.filter(t => t.gender === 'M'),
    };
  }, [orgTeams]);

  useEffect(() => {
    if (!orgTeams?.length) return;
    const hasF = genderTeams.F.length > 0;
    const hasM = genderTeams.M.length > 0;
    if (hasF && !hasM && gender !== 'F') setGender('F');
    if (hasM && !hasF && gender !== 'M') setGender('M');
  }, [genderTeams, orgTeams?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!gender) { setTeamId(null); return; }
    const matching = genderTeams[gender] ?? [];
    if (matching.length === 1) setTeamId(matching[0].id);
    else if (matching.length === 0) setTeamId(null);
  }, [gender, genderTeams]);

  useEffect(() => {
    setGender(null); setTeamId(null); setBoards(null);
  }, [orgId]);

  useEffect(() => {
    setBoards(null);
  }, [teamId]);

  useEffect(() => {
    if (!teamId) return;
    setLoading(true);
    setBoards(null);
    computeLeaderboards(tab, teamId, getIntStorage(STORAGE_KEYS.DEFAULT_SEASON_ID))
      .then(setBoards)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [tab, teamId, historicalCount, refreshKey]);

  async function handleDelete(id) {
    await db.historical_records.delete(id);
  }

  const statDef   = RECORD_STATS.find(s => s.key === statKey);
  const rows      = boards?.[statKey] ?? [];
  const tabDef    = TABS.find(t => t.value === tab);
  const multiTeam = gender ? (genderTeams[gender]?.length ?? 0) > 1 : false;
  const orgName   = orgs?.find(o => o.id === orgId)?.name ?? '';

  const selectCls = 'w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-primary';

  const GenderPill = ({ value, label }) => {
    const available = (genderTeams[value]?.length ?? 0) > 0;
    return (
      <button
        disabled={!available}
        onClick={() => { setGender(value); setTeamId(null); setBoards(null); }}
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
        title={orgName ? `Records — ${orgName}` : 'Records'}
        action={teamId && (
          <button onClick={() => setShowAdd(true)} className="px-3 py-1 rounded-lg bg-primary text-white text-sm font-bold">
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
          <EmptyState icon="🏆" title="Select a school" description="Choose a school to view records" />
        ) : (
          <>
            <div className="flex bg-slate-800 rounded-xl p-1 gap-1">
              <GenderPill value="F" label="Girls" />
              <GenderPill value="M" label="Boys" />
            </div>

            {multiTeam && (
              <select
                value={teamId ?? ''}
                onChange={e => { setTeamId(Number(e.target.value)); setBoards(null); }}
                className={selectCls}
              >
                <option value="">Select a team…</option>
                {(genderTeams[gender] ?? []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}

            {!teamId ? (
              <EmptyState icon="📋" title={gender ? 'Select a team' : 'Select Girls or Boys'} description="" />
            ) : (
              <>
                <div className="flex bg-slate-800 rounded-xl p-1 gap-1">
                  {TABS.map(t => (
                    <button
                      key={t.value}
                      onClick={() => setTab(t.value)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        tab === t.value ? 'bg-primary text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <div className="flex gap-2 overflow-x-auto pb-1">
                  {RECORD_STATS.map(s => (
                    <button
                      key={s.key}
                      onClick={() => setStatKey(s.key)}
                      className={`shrink-0 px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                        statKey === s.key ? 'bg-primary text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                {loading ? (
                  <div className="flex justify-center py-10"><Spinner /></div>
                ) : rows.length === 0 ? (
                  <EmptyState icon="📋" title="No records yet" description="Add historical records or complete matches to build the leaderboard" />
                ) : (
                  <div className="space-y-1.5">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">
                      Top {rows.length} — {statDef?.label} · {tabDef?.label}
                    </p>
                    {rows.map(row => (
                      <LeaderboardRow
                        key={row.rank}
                        row={row}
                        tab={tab}
                        fmt={statDef?.fmt ?? fmtCount}
                        onEdit={setEditRow}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {showAdd && teamId && (
        <AddRecordModal teamId={teamId} tab={tab} statKey={statKey} onClose={() => setShowAdd(false)} />
      )}

      {editRow && teamId && (
        <AddRecordModal
          teamId={teamId}
          tab={tab}
          statKey={statKey}
          recordId={editRow.id}
          initialData={{
            player_name:       editRow.name ?? '',
            value:             String(editRow.val ?? ''),
            opponent:          editRow.opp  ?? '',
            date:              editRow.date  ?? '',
            season_year:       editRow.year  ?? '',
            class_year:        editRow.class_year ?? '',
            career_year_start: editRow.career_year_start != null ? String(editRow.career_year_start) : '',
            career_year_end:   editRow.career_year_end   != null ? String(editRow.career_year_end)   : '',
          }}
          onClose={() => { setEditRow(null); setRefreshKey(k => k + 1); }}
        />
      )}
    </div>
  );
}
