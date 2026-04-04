import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSwipe } from '../hooks/useSwipe';
import { buildPlayerMaps } from '../utils/players';
import { useLiveQuery } from 'dexie-react-hooks';
import { getIntStorage, STORAGE_KEYS } from '../utils/storage';
import { db } from '../db/schema';
import { computeSeasonStats, computePQ, computeSetWinProb, aggregateXKTeamStats } from '../stats/engine';
import { fmtHitting, fmtPassRating, fmtPct, fmtCount, fmtVER } from '../stats/formatters';
import { VERBadge } from '../components/stats/VERBadge';
import { ROTATION_COLS, SERVING_COLS, TAB_COLUMNS, ISOOS_COLS, TRANS_COLS, RUN_COLS } from '../stats/columns';
import { PageHeader } from '../components/layout/PageHeader';
import { TabBar } from '../components/ui/Tab';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { StatTable } from '../components/stats/StatTable';
import { ServeReticlePlot, PlayerServePlacementCard } from '../components/stats/ServeReticlePlot';
import { RotationSpotlight } from '../components/stats/RotationSpotlight';
import { PointQualityPanel } from '../components/stats/PointQualityPanel';
import { HittingBarChart } from '../components/charts/HittingBarChart';
import { RotationRadarChart } from '../components/charts/RotationRadarChart';
import { SideoutPieChart } from '../components/charts/SideoutPieChart';
import { CourtHeatMap } from '../components/charts/CourtHeatMap';
import { PlayerTrendsChart } from '../components/charts/PlayerTrendsChart';
import { TeamComparison } from '../components/stats/TeamComparison';

const TABS = [
  { value: 'team',     label: 'Team Stats'        },
  { value: 'players',  label: 'Player Stats'       },
  { value: 'rotation', label: 'Rotation Analysis'  },
  { value: 'trends',   label: 'Trends'             },
  { value: 'heatmap',  label: 'Heat Map'           },
  { value: 'oppo',     label: 'Opp Stats'          },
];
const TAB_VALUES = TABS.map(t => t.value);

const PLAYER_COLS = [
  { key: 'name',      label: 'Player' },
  { key: 'mp',        label: 'MP',    fmt: fmtCount     },
  { key: 'sp',        label: 'SP',    fmt: fmtCount     },
  { key: 'pos_label', label: 'POS',   fmt: (v) => v ?? '—' },
  { key: 'ver',       label: 'VER',   fmt: fmtVER,      render: (v) => <VERBadge ver={v} /> },
  { key: 'sa',      label: 'SA',    fmt: fmtCount     },
  { key: 'si_pct',  label: 'SRV%',  fmt: fmtPct       },
  { key: 'ace',     label: 'ACE',   fmt: fmtCount     },
  { key: 'ace_pct', label: 'ACE%',  fmt: fmtPct       },
  { key: 'pa',      label: 'REC',   fmt: fmtCount     },
  { key: 'apr',     label: 'APR',   fmt: fmtPassRating },
  { key: 'ta',      label: 'TA',    fmt: fmtCount     },
  { key: 'k',       label: 'K',     fmt: fmtCount     },
  { key: 'hit_pct', label: 'HIT%',  fmt: fmtHitting   },
  { key: 'bs',      label: 'BS',    fmt: fmtCount     },
  { key: 'dig',     label: 'DIG',   fmt: fmtCount     },
];

// Each entry uses either `key` (looked up on stats.team) or `get(stats)` for derived/nested values.
const fmtBlocks = (v) => v == null ? '—' : v % 1 === 0 ? String(v) : v.toFixed(1);
const fmtRatio  = (v) => v == null ? '—' : v.toFixed(2);

const TEAM_STAT_SECTIONS = [
  {
    label: 'Serving',
    items: [
      { label: 'Serve %',   key: 'si_pct',  fmt: fmtPct        },
      { label: 'Ace %',     key: 'ace_pct', fmt: fmtPct        },
      { label: 'Serve Att', key: 'sa',      fmt: fmtCount      },
      { label: 'Aces',      key: 'ace',     fmt: fmtCount      },
      { label: 'Net Miss',  key: 'se_net',  fmt: fmtCount      },
      { label: 'OB Miss',   key: 'se_ob',   fmt: fmtCount      },
    ],
  },
  {
    label: 'Attacking',
    items: [
      { label: 'Hit%',      key: 'hit_pct', fmt: fmtHitting    },
      { label: 'K%',        key: 'k_pct',   fmt: fmtPct        },
      { label: 'Atk Att',   key: 'ta',      fmt: fmtCount      },
      { label: 'Kills',     key: 'k',       fmt: fmtCount      },
      { label: 'AE',        key: 'ae',      fmt: fmtCount      },
      { label: 'K:AE',      get: (s) => { const ae = s.team.ae ?? 0; return ae > 0 ? (s.team.k ?? 0) / ae : null; }, fmt: fmtRatio },
    ],
  },
  {
    label: 'Defense',
    items: [
      { label: 'Blocks', get: (s) => { const b = (s.team.bs ?? 0) + (s.team.ba ?? 0) * 0.5; return b; }, fmt: fmtBlocks },
      { label: 'Digs',   key: 'dig',  fmt: fmtCount      },
      { label: 'RECs',   key: 'pa',   fmt: fmtCount      },
      { label: 'APR',    key: 'apr',  fmt: fmtPassRating },
      { label: 'Aced',   key: 'p0',   fmt: fmtCount      },
      { label: 'BHE',    get: (s) => (s.pointQuality?.given?.lift ?? 0) + (s.pointQuality?.given?.dbl ?? 0) + (s.team.bhe ?? 0) + (s.team.fbe ?? 0), fmt: fmtCount },
    ],
  },
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
  const onSwipeLeft  = useCallback(() => setTab(t => { const i = TAB_VALUES.indexOf(t); return i < TAB_VALUES.length - 1 ? TAB_VALUES[i + 1] : t; }), []);
  const onSwipeRight = useCallback(() => setTab(t => { const i = TAB_VALUES.indexOf(t); return i > 0 ? TAB_VALUES[i - 1] : t; }), []);
  const swipeHandlers = useSwipe({ onSwipeLeft, onSwipeRight });
  const [playerStatView,        setPlayerStatView]        = useState('serving');
  const [playerServeView,       setPlayerServeView]       = useState('all');
  const [selectedServingPlayerId, setSelectedServingPlayerId] = useState(null);
  const [selectedTeamId,   setSelectedTeamId]   = useState(() => getIntStorage(STORAGE_KEYS.DEFAULT_TEAM_ID,   null) ?? '');
  const [selectedSeasonId, setSelectedSeasonId] = useState(() => getIntStorage(STORAGE_KEYS.DEFAULT_SEASON_ID, null) ?? '');
  const [selectedMatchIds, setSelectedMatchIds] = useState(null); // null = all matches
  const [conference, setConference] = useState('');
  const [location,   setLocation]   = useState('');
  const [matchTypes, setMatchTypes] = useState([]);
  const [stats, setStats] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAllMatches, setShowAllMatches] = useState(false);
  const statsDebounceRef = useRef(null);

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
  const { playerNames, playerJerseys } = useMemo(() => buildPlayerMaps(players), [players]);

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
  if (showChipFilters && matchTypes.length) activeFilters.matchType = matchTypes;
  const hasFilters = Object.keys(activeFilters).length > 0;

  // Short date label for match chips — "3/15"
  const fmtShortDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  // Load season stats when season, match selection, or chip filters change.
  // Debounced 150ms so rapid filter taps don't fire multiple expensive scans.
  useEffect(() => {
    if (!selectedSeasonId) return;
    clearTimeout(statsDebounceRef.current);
    statsDebounceRef.current = setTimeout(() => {
      setLoading(true);
      computeSeasonStats(Number(selectedSeasonId), activeFilters)
        .then((s) => { setStats(s); setContacts(s?.contacts ?? []); })
        .finally(() => setLoading(false));
    }, 150);
    return () => clearTimeout(statsDebounceRef.current);
  }, [selectedSeasonId, selectedMatchIds, conference, location, matchTypes]); // eslint-disable-line react-hooks/exhaustive-deps

  const playerRows = useMemo(() =>
    stats && !stats.empty
      ? Object.entries(stats.players).map(([pid, s]) => ({
          id: pid,
          name: playerNames[pid] ?? `#${pid}`,
          ...s,
          f_se_pct: s.f_sa > 0 ? s.f_se / s.f_sa : null,
          t_se_pct: s.t_sa > 0 ? s.t_se / s.t_sa : null,
        }))
      : [],
    [stats, playerNames]
  );

  const xkTeam = useMemo(() => aggregateXKTeamStats(playerRows), [playerRows]);

  const playerTotalsRow = useMemo(() => {
    if (!stats?.team) return null;
    const t = stats.team;
    return {
      id:        '__totals__',
      name:      'Totals',
      ...t,
      f_se_pct:  t.f_sa > 0 ? t.f_se / t.f_sa : null,
      t_se_pct:  t.t_sa > 0 ? t.t_se / t.t_sa : null,
      sp:        stats.setsPlayed ?? null,
      mp:        stats.matchCount  ?? null,
      pos_label: null,
      pos_mult:  null,
      ver:       null,
    };
  }, [stats]);

  const hittingBarData = useMemo(() =>
    playerRows.filter(r => r.ta > 0).map(r => ({ name: r.name, hit_pct: r.hit_pct })),
    [playerRows]
  );

  const rotationRows = useMemo(() =>
    stats && !stats.empty
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
      name:        label,
      is_ta:       d.is.ta,
      is_k_pct:    d.is.k_pct,
      is_hit_pct:  d.is.hit_pct,
      is_win_pct:  d.is.win_pct,
      oos_ta:      d.oos.ta,
      oos_k_pct:   d.oos.k_pct,
      oos_hit_pct: d.oos.hit_pct,
      oos_win_pct: d.oos.win_pct,
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
      free_k_pct:    f.k_pct,
      free_hit_pct:  f.hit_pct,
      free_win_pct:  f.win_pct,
      trans_ta:      t.ta,
      trans_k_pct:   t.k_pct,
      trans_hit_pct: t.hit_pct,
      trans_win_pct: t.win_pct,
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
      {selectedSeasonId && (seasonMatches ?? []).length > 0 && (() => {
        const all = seasonMatches ?? [];
        const SHOW = 8;
        const visible = showAllMatches ? all : all.slice(0, SHOW);
        const hasMore = all.length > SHOW;
        return (
          <div className="px-4 pb-2">
            <div className="flex gap-1.5 items-center flex-wrap pb-1">
              <span className="text-[10px] text-slate-500 uppercase tracking-wide shrink-0 mr-1">Match</span>
              <button
                onClick={() => setSelectedMatchIds(null)}
                className={chipClass(!selectedMatchIds?.length) + ' shrink-0'}
              >
                All
              </button>
              {visible.map(m => (
                <button
                  key={m.id}
                  onClick={() => toggleMatch(m.id)}
                  className={chipClass(selectedMatchIds?.includes(m.id)) + ' shrink-0'}
                >
                  {m.opponent_name || 'Opp'}{m.date ? ` · ${fmtShortDate(m.date)}` : ''}
                </button>
              ))}
              {hasMore && (
                <button
                  onClick={() => setShowAllMatches((v) => !v)}
                  className="text-[11px] text-primary font-semibold shrink-0 px-1"
                >
                  {showAllMatches ? 'Show less' : `+${all.length - SHOW} more`}
                </button>
              )}
            </div>
          </div>
        );
      })()}

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
            <span className="text-[10px] text-slate-500 uppercase tracking-wide mr-1">Location</span>
            {[['', 'All'], ['home', 'Home'], ['away', 'Away'], ['neutral', 'Neutral']].map(([val, label]) => (
              <button key={val} onClick={() => setLocation(val)} className={chipClass(location === val)}>{label}</button>
            ))}
          </div>
          <div className="flex gap-1.5 flex-wrap items-center">
            <span className="text-[10px] text-slate-500 uppercase tracking-wide mr-1">Type</span>
            <button onClick={() => setMatchTypes([])} className={chipClass(matchTypes.length === 0)}>All</button>
            {[['reg-season', 'Reg Season'], ['tourney', 'Tourney'], ['ihsa-playoffs', 'Playoffs'], ['exhibition', 'Exhibition']].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setMatchTypes(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val])}
                className={chipClass(matchTypes.includes(val))}
              >{label}</button>
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

          <div className="p-4 md:p-6 space-y-6" {...swipeHandlers}>

            {/* ── Team Stats ──────────────────────────────────────────── */}
            {tab === 'team' && (
              <>
                {/* Stat grid */}
                <div className="space-y-2">
                  {TEAM_STAT_SECTIONS.map(({ label: sectionLabel, items }) => (
                    <div key={sectionLabel}>
                      <SectionHeader>{sectionLabel}</SectionHeader>
                      <div className="grid grid-cols-3 gap-1.5">
                        {items.map(({ label, key, get: getVal, fmt }) => (
                          <div key={label} className="bg-surface rounded-lg px-1 py-1 text-center">
                            <div className="text-[10px] text-slate-400 leading-none">{label}</div>
                            <div className="text-base font-bold text-primary mt-0.5 leading-none">
                              {fmt(key ? stats.team[key] : getVal(stats))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* xK% & xHIT% by Pass Rating */}
                {(xkTeam.xk1 != null || xkTeam.xk2 != null || xkTeam.xk3 != null) && (
                  <div className="bg-surface rounded-xl p-3">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Attack by Pass Rating</p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'xK1%',  val: fmtPct(xkTeam.xk1)      },
                        { label: 'xK2%',  val: fmtPct(xkTeam.xk2)      },
                        { label: 'xK3%',  val: fmtPct(xkTeam.xk3)      },
                        { label: 'xHIT1', val: fmtHitting(xkTeam.xhit1) },
                        { label: 'xHIT2', val: fmtHitting(xkTeam.xhit2) },
                        { label: 'xHIT3', val: fmtHitting(xkTeam.xhit3) },
                      ].map(({ label, val }) => (
                        <div key={label} className="bg-slate-800/60 rounded-lg p-2 text-center">
                          <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">{label}</div>
                          <div className="text-lg font-black text-primary mt-0.5">{val}</div>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      {[
                        { label: 'P1 ATT', val: xkTeam.xk1_ta ?? 0 },
                        { label: 'P2 ATT', val: xkTeam.xk2_ta ?? 0 },
                        { label: 'P3 ATT', val: xkTeam.xk3_ta ?? 0 },
                      ].map(({ label, val }) => (
                        <div key={label} className="text-center">
                          <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">{label}</div>
                          <div className="text-sm font-bold text-slate-400">{val}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Point Quality — mirrors the Scoring tab in Match Summary */}
                {stats.pointQuality && (
                  <PointQualityPanel pq={stats.pointQuality} oppScored={stats.oppScored} />
                )}

                {/* In System vs Out of System */}
                {stats.isOos && (stats.isOos.total.is.ta > 0 || stats.isOos.total.oos.ta > 0) && (
                  <div className="bg-surface rounded-xl p-3 space-y-2">
                    <SectionHeader>In System vs Out of System</SectionHeader>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: 'IS ATK',   val: fmtCount(stats.isOos.total.is.ta)                  },
                        { label: 'IS Win%',  val: fmtPct(stats.isOos.total.is.win_pct)               },
                        { label: 'IS K%',    val: fmtPct(stats.isOos.total.is.k_pct)                 },
                        { label: 'IS HIT%',  val: fmtHitting(stats.isOos.total.is.hit_pct)           },
                        { label: 'OOS ATK',  val: fmtCount(stats.isOos.total.oos.ta)                 },
                        { label: 'OOS Win%', val: fmtPct(stats.isOos.total.oos.win_pct)              },
                        { label: 'OOS K%',   val: fmtPct(stats.isOos.total.oos.k_pct)               },
                        { label: 'OOS HIT%', val: fmtHitting(stats.isOos.total.oos.hit_pct)         },
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
                        { label: 'FB ATK',    val: fmtCount(stats.transitionAttack.free.total.ta)            },
                        { label: 'FB Win%',   val: fmtPct(stats.transitionAttack.free.total.win_pct)         },
                        { label: 'FB K%',     val: fmtPct(stats.transitionAttack.free.total.k_pct)           },
                        { label: 'FB HIT%',   val: fmtHitting(stats.transitionAttack.free.total.hit_pct)     },
                        { label: 'TR ATK',    val: fmtCount(stats.transitionAttack.transition.total.ta)       },
                        { label: 'TR Win%',   val: fmtPct(stats.transitionAttack.transition.total.win_pct)   },
                        { label: 'TR K%',     val: fmtPct(stats.transitionAttack.transition.total.k_pct)     },
                        { label: 'TR HIT%',   val: fmtHitting(stats.transitionAttack.transition.total.hit_pct) },
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

                {/* Win Probability */}
                {stats.rallies?.length > 0 && (() => {
                  const { p, q } = computePQ(stats.rallies);
                  const pct = (v) => Math.round(v * 100);
                  const expectedWin = computeSetWinProb(p, q, 0, 0, 'them', false);
                  const COLOR_P = p >= 0.58 ? 'text-green-400' : p >= 0.50 ? 'text-yellow-400' : 'text-red-400';
                  const COLOR_Q = q >= 0.42 ? 'text-green-400' : q >= 0.35 ? 'text-yellow-400' : 'text-red-400';
                  const COLOR_W = expectedWin >= 0.55 ? 'text-green-400' : expectedWin >= 0.45 ? 'text-yellow-400' : 'text-red-400';
                  return (
                    <div className="bg-surface rounded-xl p-3 space-y-2">
                      <SectionHeader>Win Probability Model</SectionHeader>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-slate-800/60 rounded-lg p-2">
                          <div className="text-[10px] text-slate-400 leading-none mb-1">Sideout%</div>
                          <div className={`text-xl font-black leading-none ${COLOR_P}`}>{pct(p)}%</div>
                          <div className="text-[9px] text-slate-500 mt-0.5">when receiving</div>
                        </div>
                        <div className="bg-slate-800/60 rounded-lg p-2">
                          <div className="text-[10px] text-slate-400 leading-none mb-1">Break%</div>
                          <div className={`text-xl font-black leading-none ${COLOR_Q}`}>{pct(q)}%</div>
                          <div className="text-[9px] text-slate-500 mt-0.5">when serving</div>
                        </div>
                        <div className="bg-slate-800/60 rounded-lg p-2">
                          <div className="text-[10px] text-slate-400 leading-none mb-1">Set Win</div>
                          <div className={`text-xl font-black leading-none ${COLOR_W}`}>{pct(expectedWin)}%</div>
                          <div className="text-[9px] text-slate-500 mt-0.5">at 0–0 serve</div>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-500 text-center pt-1">Based on {stats.rallies.length} recorded rallies</p>
                    </div>
                  );
                })()}

                {/* Team vs Opponents comparison */}
                {stats.opp && (
                  <div>
                    <SectionHeader>Team vs Opponents</SectionHeader>
                    <TeamComparison
                      team={stats.team}
                      opp={stats.opp}
                      teamName={teams?.find(t => t.id === Number(selectedTeamId))?.name ?? 'Us'}
                      oppName="Opponents"
                    />
                  </div>
                )}
              </>
            )}

            {/* ── Player Stats ─────────────────────────────────────────── */}
            {tab === 'players' && (
              <>
                {/* Stat category sub-toggle */}
                <div className="flex gap-1.5 flex-wrap">
                  {[
                    { value: 'serving',   label: 'Serving'   },
                    { value: 'passing',   label: 'Passing'   },
                    { value: 'attacking', label: 'Attacking' },
                    { value: 'blocking',  label: 'Blocking'  },
                    { value: 'defense',   label: 'Defense'   },
                    { value: 'ver',       label: 'VER'       },
                  ].map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setPlayerStatView(value)}
                      className={chipClass(playerStatView === value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Serve type sub-toggle (only when serving is active) */}
                {playerStatView === 'serving' && (
                  <div className="flex gap-1.5 flex-wrap mt-1">
                    {[
                      { value: 'all',   label: 'All'       },
                      { value: 'float', label: 'Float'     },
                      { value: 'top',   label: 'Top Spin'  },
                    ].map(({ value, label }) => (
                      <button
                        key={value}
                        onClick={() => { setPlayerServeView(value); setSelectedServingPlayerId(null); }}
                        className={chipClass(playerServeView === value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Stat table for active view */}
                {playerStatView === 'serving' && (
                  <>
                    <StatTable
                      columns={SERVING_COLS[playerServeView]}
                      rows={playerRows}
                      totalsRow={playerTotalsRow}
                      onRowClick={(row) => setSelectedServingPlayerId(id => String(id) === String(row.id) ? null : row.id)}
                      selectedRowId={selectedServingPlayerId}
                    />
                    {selectedServingPlayerId && contacts.length > 0 && (() => {
                      const player = playerRows.find(r => String(r.id) === String(selectedServingPlayerId));
                      return player ? (
                        <PlayerServePlacementCard
                          player={player}
                          contacts={contacts}
                          playerJerseys={playerJerseys}
                        />
                      ) : null;
                    })()}
                    <ServeReticlePlot contacts={contacts} serveType={playerServeView} />
                  </>
                )}
                {playerStatView === 'passing' && (
                  <StatTable columns={TAB_COLUMNS.passing} rows={playerRows} totalsRow={playerTotalsRow} />
                )}
                {playerStatView === 'attacking' && (
                  <>
                    <StatTable columns={TAB_COLUMNS.attacking} rows={playerRows} totalsRow={playerTotalsRow} />
                    {(() => {
                      const xkRows = playerRows.filter(r => (r.xk1_ta ?? 0) > 0 || (r.xk2_ta ?? 0) > 0 || (r.xk3_ta ?? 0) > 0);
                      if (!xkRows.length) return null;
                      return (
                        <>
                          <div className="bg-surface rounded-xl p-3">
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Kill% by Pass Rating (xK%)</p>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-slate-700">
                                    <th className="px-2 py-1.5 text-left font-semibold text-slate-400">Player</th>
                                    <th className="px-2 py-1.5 text-right font-semibold text-slate-400">xK1%</th>
                                    <th className="px-2 py-1.5 text-right font-semibold text-slate-400">xK2%</th>
                                    <th className="px-2 py-1.5 text-right font-semibold text-slate-400">xK3%</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {xkRows.map((r, i) => (
                                    <tr key={r.id} className={`border-b border-slate-800/60 ${i % 2 !== 0 ? 'bg-slate-900/30' : ''}`}>
                                      <td className="px-2 py-1.5 text-slate-300">{r.name}</td>
                                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-300">{fmtPct(r.xk1)}</td>
                                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-300">{fmtPct(r.xk2)}</td>
                                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-300">{fmtPct(r.xk3)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                          <div className="bg-surface rounded-xl p-3">
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Hit% by Pass Rating (xHIT%)</p>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-slate-700">
                                    <th className="px-2 py-1.5 text-left font-semibold text-slate-400">Player</th>
                                    <th className="px-2 py-1.5 text-right font-semibold text-slate-400">xHIT1</th>
                                    <th className="px-2 py-1.5 text-right font-semibold text-slate-400">xHIT2</th>
                                    <th className="px-2 py-1.5 text-right font-semibold text-slate-400">xHIT3</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {xkRows.map((r, i) => (
                                    <tr key={r.id} className={`border-b border-slate-800/60 ${i % 2 !== 0 ? 'bg-slate-900/30' : ''}`}>
                                      <td className="px-2 py-1.5 text-slate-300">{r.name}</td>
                                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-300">{fmtHitting(r.xhit1)}</td>
                                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-300">{fmtHitting(r.xhit2)}</td>
                                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-300">{fmtHitting(r.xhit3)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </>
                )}
                {playerStatView === 'blocking' && (
                  <StatTable columns={TAB_COLUMNS.blocking} rows={playerRows} totalsRow={playerTotalsRow} />
                )}
                {playerStatView === 'defense' && (
                  <StatTable columns={TAB_COLUMNS.defense} rows={playerRows} totalsRow={playerTotalsRow} />
                )}
                {playerStatView === 'ver' && (
                  <StatTable columns={TAB_COLUMNS.ver} rows={playerRows} totalsRow={playerTotalsRow} />
                )}
              </>
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

            {/* ── Trends ───────────────────────────────────────────────── */}
            {tab === 'trends' && (
              <div className="bg-surface rounded-xl p-4">
                <SectionHeader>Player Trends by Match</SectionHeader>
                {(stats.trends?.matches.length ?? 0) < 2 ? (
                  <p className="text-sm text-slate-500 text-center py-6">
                    Record at least 2 matches to see trends.
                  </p>
                ) : (
                  <PlayerTrendsChart trends={stats.trends} playerNames={playerNames} />
                )}
              </div>
            )}

            {/* ── Heat Map ─────────────────────────────────────────────── */}
            {tab === 'heatmap' && (
              <CourtHeatMap contacts={contacts} />
            )}

            {/* ── Opp Stats ────────────────────────────────────────────── */}
            {tab === 'oppo' && stats?.opp && (
              <div className="space-y-3">
                <p className="text-xs text-slate-400 mb-4">Opponent performance across selected matches</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'ACE',  val: stats.opp.ace,  desc: 'Aces vs us'          },
                    { label: 'SE',   val: stats.opp.se,   desc: 'Serve errors'         },
                    { label: 'K',    val: stats.opp.k,    desc: 'Kills'                },
                    { label: 'AE',   val: stats.opp.ae,   desc: 'Attack errors'        },
                    { label: 'BLK',  val: stats.opp.blk,  desc: 'Blocked by us'        },
                    { label: 'ERR',  val: stats.opp.errs, desc: 'Ball handling errors' },
                  ].map(({ label, val, desc }) => (
                    <div key={label} className="bg-surface rounded-xl p-3 text-center">
                      <div className="text-xs text-slate-400 mb-1">{desc}</div>
                      <div className="text-2xl font-black text-primary">{val}</div>
                      <div className="text-xs font-bold text-slate-300 mt-0.5">{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
