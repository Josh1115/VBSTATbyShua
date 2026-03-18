import { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { computeSeasonStats } from '../stats/engine';
import { fmtHitting, fmtPassRating, fmtPct, fmtCount, fmtVER } from '../stats/formatters';
import { ROTATION_COLS } from '../stats/columns';
import { PageHeader } from '../components/layout/PageHeader';
import { TabBar } from '../components/ui/Tab';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { StatTable } from '../components/stats/StatTable';
import { RotationSpotlight } from '../components/stats/RotationSpotlight';
import { HittingBarChart } from '../components/charts/HittingBarChart';
import { RotationRadarChart } from '../components/charts/RotationRadarChart';
import { SideoutPieChart } from '../components/charts/SideoutPieChart';
import { CourtHeatMap } from '../components/charts/CourtHeatMap';

const TABS = [
  { value: 'team',     label: 'Team Stats'        },
  { value: 'players',  label: 'Player Stats'       },
  { value: 'rotation', label: 'Rotation Analysis'  },
  { value: 'heatmap',  label: 'Heat Map'           },
];

const PLAYER_COLS = [
  { key: 'name',      label: 'Player' },
  { key: 'mp',        label: 'MP',    fmt: fmtCount     },
  { key: 'sp',        label: 'SP',    fmt: fmtCount     },
  { key: 'pos_label', label: 'POS',   fmt: (v) => v ?? '—' },
  { key: 'pos_mult',  label: '×',     fmt: (v) => v != null ? `×${v.toFixed(2)}` : '—' },
  { key: 'ver',       label: 'VER',   fmt: fmtVER       },
  { key: 'sa',      label: 'SA',    fmt: fmtCount     },
  { key: 'ace',     label: 'ACE',   fmt: fmtCount     },
  { key: 'ace_pct', label: 'ACE%',  fmt: fmtPct       },
  { key: 'pa',      label: 'PA',    fmt: fmtCount     },
  { key: 'apr',     label: 'APR',   fmt: fmtPassRating },
  { key: 'ta',      label: 'TA',    fmt: fmtCount     },
  { key: 'k',       label: 'K',     fmt: fmtCount     },
  { key: 'hit_pct', label: 'HIT%',  fmt: fmtHitting   },
  { key: 'bs',      label: 'BS',    fmt: fmtCount     },
  { key: 'dig',     label: 'DIG',   fmt: fmtCount     },
];

const TEAM_STATS = [
  { label: 'Hitting%',  key: 'hit_pct',  fmt: fmtHitting    },
  { label: 'ACE%',      key: 'ace_pct',  fmt: fmtPct        },
  { label: 'Serves',    key: 'sa',       fmt: fmtCount      },
  { label: 'Kills',     key: 'k',        fmt: fmtCount      },
  { label: 'Assists',   key: 'ast',      fmt: fmtCount      },
  { label: 'Pass Avg',  key: 'apr',      fmt: fmtPassRating },
  { label: 'Digs',      key: 'dig',      fmt: fmtCount      },
  { label: 'Blocks',    key: 'bs',       fmt: fmtCount      },
];

// IS/OOS per-rotation table columns
const ISOOS_COLS = [
  { key: 'name',        label: 'Rot'     },
  { key: 'is_pa',       label: 'IS',      fmt: fmtCount },
  { key: 'is_win_pct',  label: 'IS Win%', fmt: fmtPct   },
  { key: 'oos_pa',      label: 'OOS',     fmt: fmtCount },
  { key: 'oos_win_pct', label: 'OOS Win%',fmt: fmtPct   },
];

// Transition/free-ball per-rotation table columns
const TRANS_COLS = [
  { key: 'name',          label: 'Rot'       },
  { key: 'free_ta',       label: 'FB ATK',   fmt: fmtCount   },
  { key: 'free_hit_pct',  label: 'FB HIT%',  fmt: fmtHitting },
  { key: 'free_k_pct',    label: 'FB K%',    fmt: fmtPct     },
  { key: 'trans_ta',      label: 'TR ATK',   fmt: fmtCount   },
  { key: 'trans_hit_pct', label: 'TR HIT%',  fmt: fmtHitting },
  { key: 'trans_k_pct',   label: 'TR K%',    fmt: fmtPct     },
];

const fmtAvg = (val) => val == null ? '—' : val.toFixed(1);

// Run breakdown per-rotation table columns
const RUN_COLS = [
  { key: 'name',      label: 'Rot'     },
  { key: 'max_run',   label: 'Best',   fmt: fmtCount },
  { key: 'avg_run',   label: 'Avg',    fmt: fmtAvg   },
  { key: 'runs_3plus',label: '3+',     fmt: fmtCount },
  { key: 'runs_5plus',label: '5+',     fmt: fmtCount },
];

// Simple fixed-order (non-sortable) table for rotation breakdowns
function MiniTable({ cols, rows }) {
  if (!rows.length) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-700">
            {cols.map((c) => (
              <th
                key={c.key}
                className={`px-2 py-1.5 font-semibold text-slate-400 whitespace-nowrap ${c.key === 'name' ? 'text-left' : 'text-right'}`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.rot}
              className={`border-b ${row.isTotal ? 'border-t border-slate-600 font-semibold text-white' : 'border-slate-800/60 ' + (i % 2 === 0 ? '' : 'bg-slate-900/30')}`}
            >
              {cols.map((c) => (
                <td
                  key={c.key}
                  className={`px-2 py-1.5 tabular-nums ${c.key === 'name' ? 'text-left text-slate-300' : 'text-right text-slate-300'}`}
                >
                  {c.fmt ? c.fmt(row[c.key]) : (row[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionHeader({ children }) {
  return <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-2">{children}</h3>;
}

const CHIP = 'px-3 py-1 rounded-full text-xs font-semibold transition-colors';
const chipClass = (active) =>
  active ? `${CHIP} bg-primary text-white` : `${CHIP} bg-surface text-slate-400 hover:text-white`;

export function ReportsPage() {
  const [tab, setTab] = useState('team');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const [selectedMatchIds, setSelectedMatchIds] = useState(null); // null = all matches
  const [conference, setConference] = useState('');
  const [location,   setLocation]   = useState('');
  const [matchType,  setMatchType]  = useState('');
  const [stats, setStats] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);

  // Filter data
  const teams   = useLiveQuery(() => db.teams.toArray(), []);
  const seasons = useLiveQuery(
    () => selectedTeamId
      ? db.seasons.where('team_id').equals(Number(selectedTeamId)).toArray()
      : Promise.resolve([]),
    [selectedTeamId]
  );

  // Matches for the selected season (for the match picker)
  const seasonMatches = useLiveQuery(
    () => selectedSeasonId
      ? db.matches.where('season_id').equals(Number(selectedSeasonId)).sortBy('date')
      : Promise.resolve([]),
    [selectedSeasonId]
  );

  // Players for the selected team
  const players = useLiveQuery(
    () => selectedTeamId
      ? db.players.where('team_id').equals(Number(selectedTeamId)).toArray()
      : Promise.resolve([]),
    [selectedTeamId]
  );
  const playerNames = Object.fromEntries((players ?? []).map(p => [p.id, p.name]));

  // Reset everything when team changes
  function handleTeamChange(e) {
    setSelectedTeamId(e.target.value);
    setSelectedSeasonId('');
    setSelectedMatchIds(null);
    setStats(null);
    setContacts([]);
  }

  // Reset match selection when season changes
  function handleSeasonChange(e) {
    setSelectedSeasonId(e.target.value);
    setSelectedMatchIds(null);
    setStats(null);
    setContacts([]);
  }

  // Toggle an individual match on/off; deselecting the last one goes back to "All"
  function toggleMatch(id) {
    setSelectedMatchIds(prev => {
      const current = prev ?? [];
      const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id];
      return next.length === 0 ? null : next;
    });
  }

  // When specific matches are selected, conference/site/type chips are hidden
  const showChipFilters = !selectedMatchIds?.length;

  // Build active filters object
  const activeFilters = {};
  if (selectedMatchIds?.length) activeFilters.matchIds = selectedMatchIds;
  if (showChipFilters && conference) activeFilters.conference = conference;
  if (showChipFilters && location)   activeFilters.location   = location;
  if (showChipFilters && matchType)  activeFilters.matchType  = matchType;
  const hasFilters = Object.keys(activeFilters).length > 0;

  // Short date label for match chips — "3/15"
  const fmtShortDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  // Load season stats when season, match selection, or chip filters change
  useEffect(() => {
    if (!selectedSeasonId) return;
    setLoading(true);
    computeSeasonStats(Number(selectedSeasonId), activeFilters)
      .then((s) => { setStats(s); setContacts(s?.contacts ?? []); })
      .finally(() => setLoading(false));
  }, [selectedSeasonId, selectedMatchIds, conference, location, matchType]);

  const playerRows = useMemo(() =>
    stats
      ? Object.entries(stats.players).map(([pid, s]) => ({
          id: pid,
          name: playerNames[pid] ?? `#${pid}`,
          ...s,
        }))
      : [],
    [stats, playerNames]
  );

  const hittingBarData = useMemo(() =>
    playerRows.filter(r => r.ta > 0).map(r => ({ name: r.name, hit_pct: r.hit_pct })),
    [playerRows]
  );

  const rotationRows = useMemo(() =>
    stats
      ? Object.entries(stats.rotation.rotations).map(([n, r]) => ({
          id: n,
          name: `R${n}`,
          ...r,
        }))
      : [],
    [stats]
  );

  // IS/OOS rows for per-rotation MiniTable
  const isOosRows = useMemo(() => {
    if (!stats?.isOos) return [];
    const { byRotation, total } = stats.isOos;
    const toRow = (rot, label, d) => ({
      rot,
      name: label,
      is_pa:       d.is_pa,
      is_win_pct:  d.is_pa  > 0 ? d.is_won  / d.is_pa  : null,
      oos_pa:      d.oos_pa,
      oos_win_pct: d.oos_pa > 0 ? d.oos_won / d.oos_pa : null,
    });
    return [
      ...Object.entries(byRotation).map(([r, d]) => toRow(r, `R${r}`, d)),
      { ...toRow('total', 'Total', total), isTotal: true },
    ];
  }, [stats]);

  // Transition / free-ball rows for per-rotation MiniTable
  const transRows = useMemo(() => {
    if (!stats?.transitionAttack) return [];
    const { free, transition } = stats.transitionAttack;
    const toRow = (rot, label, f, t) => ({
      rot,
      name:          label,
      free_ta:       f.ta,
      free_hit_pct:  f.hit_pct,
      free_k_pct:    f.k_pct,
      trans_ta:      t.ta,
      trans_hit_pct: t.hit_pct,
      trans_k_pct:   t.k_pct,
    });
    const rows = [];
    for (let r = 1; r <= 6; r++) {
      rows.push(toRow(String(r), `R${r}`, free.byRotation[r], transition.byRotation[r]));
    }
    rows.push({ ...toRow('total', 'Total', free.total, transition.total), isTotal: true });
    return rows;
  }, [stats]);

  // Scoring run rows for per-rotation MiniTable
  const runRows = useMemo(() => {
    if (!stats?.runs) return [];
    const { byRotation, total } = stats.runs;
    const toRow = (rot, label, d) => ({
      rot,
      name:       label,
      max_run:    d.max_run   > 0 ? d.max_run   : null,
      avg_run:    d.avg_run,
      runs_3plus: d.runs_3plus,
      runs_5plus: d.runs_5plus,
    });
    return [
      ...Object.entries(byRotation).map(([r, d]) => toRow(r, `R${r}`, d)),
      { ...toRow('total', 'Total', total), isTotal: true },
    ];
  }, [stats]);

  const selectClass = 'bg-surface border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary';

  return (
    <div>
      <PageHeader title="Reports" />

      {/* Filters */}
      <div className="px-4 pt-4 pb-2 flex gap-3 flex-wrap">
        <select className={selectClass} value={selectedTeamId} onChange={handleTeamChange}>
          <option value="">Select Team</option>
          {(teams ?? []).map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

        <select
          className={selectClass}
          value={selectedSeasonId}
          onChange={handleSeasonChange}
          disabled={!selectedTeamId}
        >
          <option value="">Select Season</option>
          {(seasons ?? []).map(s => (
            <option key={s.id} value={s.id}>{s.year ?? s.name ?? `Season ${s.id}`}</option>
          ))}
        </select>
      </div>

      {/* Match picker — individual match chips, shown once a season is selected */}
      {selectedSeasonId && (seasonMatches ?? []).length > 0 && (
        <div className="px-4 pb-2">
          <div className="flex gap-1.5 items-center overflow-x-auto pb-1 no-scrollbar">
            <span className="text-[10px] text-slate-500 uppercase tracking-wide shrink-0 mr-1">Match</span>
            <button
              onClick={() => setSelectedMatchIds(null)}
              className={chipClass(!selectedMatchIds?.length) + ' shrink-0'}
            >
              All
            </button>
            {(seasonMatches ?? []).map(m => (
              <button
                key={m.id}
                onClick={() => toggleMatch(m.id)}
                className={chipClass(selectedMatchIds?.includes(m.id)) + ' shrink-0'}
              >
                {m.opponent_name || 'Opp'}{m.date ? ` · ${fmtShortDate(m.date)}` : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Conf / site / type chip filters — hidden when specific matches are selected */}
      {selectedSeasonId && showChipFilters && (
        <div className="px-4 pb-3 space-y-2">
          <div className="flex gap-1.5 flex-wrap items-center">
            <span className="text-[10px] text-slate-500 uppercase tracking-wide mr-1">Conf</span>
            {[['', 'All'], ['conference', 'Conference'], ['non-con', 'Non-Con']].map(([val, label]) => (
              <button key={val} onClick={() => setConference(val)} className={chipClass(conference === val)}>{label}</button>
            ))}
          </div>
          <div className="flex gap-1.5 flex-wrap items-center">
            <span className="text-[10px] text-slate-500 uppercase tracking-wide mr-1">Site</span>
            {[['', 'All'], ['home', 'Home'], ['away', 'Away'], ['neutral', 'Neutral']].map(([val, label]) => (
              <button key={val} onClick={() => setLocation(val)} className={chipClass(location === val)}>{label}</button>
            ))}
          </div>
          <div className="flex gap-1.5 flex-wrap items-center">
            <span className="text-[10px] text-slate-500 uppercase tracking-wide mr-1">Type</span>
            {[['', 'All'], ['reg-season', 'Reg Season'], ['tourney', 'Tourney'], ['ihsa-playoffs', 'Playoffs'], ['exhibition', 'Exhibition']].map(([val, label]) => (
              <button key={val} onClick={() => setMatchType(val)} className={chipClass(matchType === val)}>{label}</button>
            ))}
          </div>
        </div>
      )}

      {/* No selection state */}
      {!selectedSeasonId && !loading && (
        <EmptyState icon="📊" title="Select a team and season" description="Choose filters above to view analytics" />
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      )}

      {/* No matches in season */}
      {!loading && selectedSeasonId && stats === null && (
        <EmptyState icon="📋" title="No matches found" description="Record matches to see season analytics" />
      )}

      {/* Filters excluded all matches */}
      {!loading && stats?.empty && (
        <EmptyState
          icon="🔍"
          title="No matches for this filter"
          description={`${stats.totalMatchCount} match${stats.totalMatchCount !== 1 ? 'es' : ''} in this season — none match the current filters`}
          action={
            <button
              onClick={() => { setConference(''); setLocation(''); setMatchType(''); setSelectedMatchIds(null); }}
              className="mt-1 text-primary text-sm underline underline-offset-2"
            >
              Clear filters
            </button>
          }
        />
      )}

      {/* Stats loaded */}
      {!loading && stats && !stats.empty && (
        <>
          {/* Summary strip */}
          <div className="mx-4 mb-1 bg-surface rounded-xl p-3 grid grid-cols-4 gap-2 text-center text-sm">
            <div>
              <div className="text-xs text-slate-400">Matches</div>
              <div className="font-bold text-primary">
                {hasFilters && stats.totalMatchCount > stats.matchCount
                  ? <>{stats.matchCount}<span className="text-slate-500 font-normal text-[10px]">/{stats.totalMatchCount}</span></>
                  : stats.matchCount}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Sets</div>
              <div className="font-bold">{stats.setsPlayed}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">SO%</div>
              <div className="font-bold text-primary">{fmtPct(stats.rotation.so_pct)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">HIT%</div>
              <div className="font-bold">{fmtHitting(stats.team.hit_pct)}</div>
            </div>
          </div>

          <TabBar tabs={TABS} active={tab} onChange={setTab} />

          <div className="p-4 md:p-6 space-y-6">

            {/* ── Team Stats ──────────────────────────────────────────── */}
            {tab === 'team' && (
              <>
                {/* Stat grid */}
                <div className="grid grid-cols-2 gap-3">
                  {TEAM_STATS.map(({ label, key, fmt }) => (
                    <div key={key} className="bg-surface rounded-xl p-3">
                      <div className="text-xs text-slate-400">{label}</div>
                      <div className="text-xl font-bold text-primary mt-0.5">{fmt(stats.team[key])}</div>
                    </div>
                  ))}
                </div>

                {/* In System vs Out of System */}
                {stats.isOos && (stats.isOos.total.is_pa > 0 || stats.isOos.total.oos_pa > 0) && (
                  <div className="bg-surface rounded-xl p-3 space-y-2">
                    <SectionHeader>In System vs Out of System</SectionHeader>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: 'IS Passes',  val: fmtCount(stats.isOos.total.is_pa)  },
                        { label: 'IS Win%',    val: fmtPct(stats.isOos.total.is_pa  > 0 ? stats.isOos.total.is_won  / stats.isOos.total.is_pa  : null) },
                        { label: 'OOS Passes', val: fmtCount(stats.isOos.total.oos_pa) },
                        { label: 'OOS Win%',   val: fmtPct(stats.isOos.total.oos_pa > 0 ? stats.isOos.total.oos_won / stats.isOos.total.oos_pa : null) },
                      ].map(({ label, val }) => (
                        <div key={label}>
                          <div className="text-xs text-slate-400">{label}</div>
                          <div className="text-lg font-bold text-primary">{val}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Transition & Free Ball Offense */}
                {stats.transitionAttack && (stats.transitionAttack.free.total.ta > 0 || stats.transitionAttack.transition.total.ta > 0) && (
                  <div className="bg-surface rounded-xl p-3 space-y-2">
                    <SectionHeader>Transition &amp; Free Ball Offense</SectionHeader>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: 'FB Attacks',  val: fmtCount(stats.transitionAttack.free.total.ta)       },
                        { label: 'FB Hit%',     val: fmtHitting(stats.transitionAttack.free.total.hit_pct) },
                        { label: 'Trans Attacks',val: fmtCount(stats.transitionAttack.transition.total.ta)       },
                        { label: 'Trans Hit%',  val: fmtHitting(stats.transitionAttack.transition.total.hit_pct) },
                      ].map(({ label, val }) => (
                        <div key={label}>
                          <div className="text-xs text-slate-400">{label}</div>
                          <div className="text-lg font-bold text-primary">{val}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Hitting bar */}
                {hittingBarData.length > 0 && (
                  <div>
                    <SectionHeader>Player Hitting%</SectionHeader>
                    <HittingBarChart data={hittingBarData} />
                  </div>
                )}
              </>
            )}

            {/* ── Player Stats ─────────────────────────────────────────── */}
            {tab === 'players' && (
              <StatTable columns={PLAYER_COLS} rows={playerRows} />
            )}

            {/* ── Rotation Analysis ────────────────────────────────────── */}
            {tab === 'rotation' && (
              <>
                <div className="grid grid-cols-2 gap-4 text-center">
                  <SideoutPieChart so_pct={stats.rotation.so_pct} label="Sideout" />
                  <SideoutPieChart so_pct={stats.rotation.bp_pct} label="Serving Point" />
                </div>
                <RotationRadarChart rotationStats={stats.rotation} />
                <RotationSpotlight rows={rotationRows} />
                <StatTable columns={ROTATION_COLS} rows={rotationRows} />

                {/* IS vs OOS by Rotation */}
                {isOosRows.length > 0 && (
                  <div className="bg-surface rounded-xl p-3">
                    <SectionHeader>In System vs Out of System by Rotation</SectionHeader>
                    <MiniTable cols={ISOOS_COLS} rows={isOosRows} />
                  </div>
                )}

                {/* Transition & Free Ball by Rotation */}
                {transRows.length > 0 && (
                  <div className="bg-surface rounded-xl p-3">
                    <SectionHeader>Transition &amp; Free Ball Offense by Rotation</SectionHeader>
                    <MiniTable cols={TRANS_COLS} rows={transRows} />
                  </div>
                )}

                {/* Scoring Runs by Rotation */}
                {runRows.length > 0 && (
                  <div className="bg-surface rounded-xl p-3">
                    <SectionHeader>Scoring Runs by Rotation</SectionHeader>
                    <p className="text-xs text-slate-500 mb-2">Runs of 2+ consecutive points, grouped by the rotation where the run started.</p>
                    <MiniTable cols={RUN_COLS} rows={runRows} />
                  </div>
                )}
              </>
            )}

            {/* ── Heat Map ─────────────────────────────────────────────── */}
            {tab === 'heatmap' && (
              <CourtHeatMap contacts={contacts} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
