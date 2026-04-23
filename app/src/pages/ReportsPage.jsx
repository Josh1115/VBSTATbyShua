import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { PassDistributionChart } from '../components/charts/PassDistributionChart';
import { RotationRadarChart } from '../components/charts/RotationRadarChart';
import { SideoutPieChart } from '../components/charts/SideoutPieChart';
import { CourtHeatMap } from '../components/charts/CourtHeatMap';
import { PlayerTrendsChart } from '../components/charts/PlayerTrendsChart';
import { TeamComparison } from '../components/stats/TeamComparison';
import { SetDistByRotationPanel } from '../components/stats/panels/SetDistByRotationPanel';

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
      { label: 'Serve %',   key: 'si_pct',  fmt: fmtPct,        isRate: true },
      { label: 'Ace %',     key: 'ace_pct', fmt: fmtPct,        isRate: true },
      { label: 'Serve Att', key: 'sa',      fmt: fmtCount      },
      { label: 'Aces',      key: 'ace',     fmt: fmtCount      },
      { label: 'Net Miss',  key: 'se_net',  fmt: fmtCount      },
      { label: 'OB Miss',   key: 'se_ob',   fmt: fmtCount      },
    ],
  },
  {
    label: 'Attacking',
    items: [
      { label: 'Hit%',      key: 'hit_pct', fmt: fmtHitting,    isRate: true },
      { label: 'K%',        key: 'k_pct',   fmt: fmtPct,        isRate: true },
      { label: 'Atk Att',   key: 'ta',      fmt: fmtCount      },
      { label: 'Kills',     key: 'k',       fmt: fmtCount      },
      { label: 'AE',        key: 'ae',      fmt: fmtCount      },
      { label: 'K:AE',      get: (s) => { const ae = s.team.ae ?? 0; return ae > 0 ? (s.team.k ?? 0) / ae : null; }, fmt: fmtRatio, isRate: true },
    ],
  },
  {
    label: 'Defense',
    items: [
      { label: 'Blocks', get: (s) => { const b = (s.team.bs ?? 0) + (s.team.ba ?? 0) * 0.5; return b; }, fmt: fmtBlocks },
      { label: 'Digs',   key: 'dig',  fmt: fmtCount      },
      { label: 'RECs',   key: 'pa',   fmt: fmtCount      },
      { label: 'APR',    key: 'apr',  fmt: fmtPassRating, isRate: true },
      { label: 'Aced',   key: 'p0',   fmt: fmtCount      },
      { label: 'BHE',    get: (s) => (s.pointQuality?.given?.lift ?? 0) + (s.pointQuality?.given?.dbl ?? 0) + (s.team.bhe ?? 0) + (s.team.fbe ?? 0), fmt: fmtCount },
    ],
  },
];

const fmtAvg1 = (v) => v == null ? '—' : v.toFixed(1);

function getTeamStatDisplay(item, stats, view) {
  const raw = item.key ? stats.team[item.key] : item.get(stats);
  if (item.isRate || view === 'totals') return item.fmt(raw);
  const divisor = view === 'per_set' ? (stats.setsPlayed || 1) : (stats.matchCount || 1);
  const avg = raw != null ? raw / divisor : null;
  return item.fmt === fmtCount ? fmtAvg1(avg) : item.fmt(avg);
}

// Sortable table for rotation breakdowns — total row always pinned at bottom
function MiniTable({ cols, rows }) {
  const [sortKey, setSortKey] = useState(cols[1]?.key ?? cols[0].key);
  const [desc,    setDesc]    = useState(true);

  if (!rows.length) return null;

  const dataRows  = rows.filter(r => !r.isTotal);
  const totalRows = rows.filter(r =>  r.isTotal);

  const sorted = [...dataRows].sort((a, b) => {
    if (sortKey === 'name') {
      return desc
        ? (b.name ?? '').localeCompare(a.name ?? '')
        : (a.name ?? '').localeCompare(b.name ?? '');
    }
    const av = a[sortKey] ?? -Infinity;
    const bv = b[sortKey] ?? -Infinity;
    return desc ? bv - av : av - bv;
  });

  function handleSort(key) {
    if (sortKey === key) setDesc(d => !d);
    else { setSortKey(key); setDesc(true); }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-700">
            {cols.map((c) => (
              <th
                key={c.key}
                onClick={() => handleSort(c.key)}
                className={`px-2 py-1.5 font-semibold whitespace-nowrap cursor-pointer select-none ${
                  c.key === 'name' ? 'text-left' : 'text-right'
                } ${sortKey === c.key ? 'text-primary' : 'text-slate-400'}`}
              >
                {c.label}
                {sortKey === c.key && (
                  <span className="ml-0.5 text-[10px]">{desc ? '↓' : '↑'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={row.rot} className={`border-b border-slate-800/60 ${i % 2 !== 0 ? 'bg-slate-900/30' : ''}`}>
              {cols.map((c) => (
                <td
                  key={c.key}
                  className={`px-2 py-1.5 tabular-nums text-slate-300 ${c.key === 'name' ? 'text-left' : 'text-right'}`}
                >
                  {c.fmt ? c.fmt(row[c.key]) : (row[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
          {totalRows.map(row => (
            <tr key={row.rot} className="border-t border-slate-600 font-semibold text-white">
              {cols.map((c) => (
                <td
                  key={c.key}
                  className={`px-2 py-1.5 tabular-nums ${c.key === 'name' ? 'text-left' : 'text-right'}`}
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

function XPassRatingTable({ title, rows, cols }) {
  const [sortKey, setSortKey] = useState(null);
  const [desc,    setDesc]    = useState(true);

  function handleSort(key) {
    if (sortKey === key) setDesc(d => !d);
    else { setSortKey(key); setDesc(true); }
  }

  const sorted = sortKey
    ? [...rows].sort((a, b) => {
        if (sortKey === 'name') {
          return desc
            ? (b.name ?? '').localeCompare(a.name ?? '')
            : (a.name ?? '').localeCompare(b.name ?? '');
        }
        const av = a[sortKey] ?? -Infinity;
        const bv = b[sortKey] ?? -Infinity;
        return desc ? bv - av : av - bv;
      })
    : rows;

  return (
    <div className="bg-surface rounded-xl p-3">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">{title}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-700">
              <th
                onClick={() => handleSort('name')}
                className={`px-2 py-1.5 text-left font-semibold cursor-pointer select-none whitespace-nowrap ${sortKey === 'name' ? 'text-primary' : 'text-slate-400'}`}
              >
                Player{sortKey === 'name' && <span className="ml-0.5 text-[10px]">{desc ? '↓' : '↑'}</span>}
              </th>
              {cols.map(c => (
                <th
                  key={c.key}
                  onClick={() => handleSort(c.key)}
                  className={`px-2 py-1.5 text-right font-semibold cursor-pointer select-none whitespace-nowrap ${sortKey === c.key ? 'text-primary' : 'text-slate-400'}`}
                >
                  {c.label}{sortKey === c.key && <span className="ml-0.5 text-[10px]">{desc ? '↓' : '↑'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={r.id} className={`border-b border-slate-800/60 ${i % 2 !== 0 ? 'bg-slate-900/30' : ''}`}>
                <td className="px-2 py-1.5 text-slate-300">{r.name}</td>
                {cols.map(c => (
                  <td key={c.key} className="px-2 py-1.5 text-right tabular-nums text-slate-300">
                    {c.fmt(r[c.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
  const navigate = useNavigate();
  const [tab, setTab] = useState('team');
  const onSwipeLeft  = useCallback(() => setTab(t => { const i = TAB_VALUES.indexOf(t); return i < TAB_VALUES.length - 1 ? TAB_VALUES[i + 1] : t; }), []);
  const onSwipeRight = useCallback(() => setTab(t => { const i = TAB_VALUES.indexOf(t); return i > 0 ? TAB_VALUES[i - 1] : t; }), []);
  const swipeHandlers = useSwipe({ onSwipeLeft, onSwipeRight });
  const [teamView,              setTeamView]              = useState('totals');
  const [playerStatView,        setPlayerStatView]        = useState('serving');
  const [playerServeView,       setPlayerServeView]       = useState('all');
  const [selectedServingPlayerId, setSelectedServingPlayerId] = useState(null);
  const [selectedTeamId,   setSelectedTeamId]   = useState(() => getIntStorage(STORAGE_KEYS.DEFAULT_TEAM_ID,   null) ?? '');
  const [selectedSeasonId, setSelectedSeasonId] = useState(() => getIntStorage(STORAGE_KEYS.DEFAULT_SEASON_ID, null) ?? '');
  const [selectedMatchIds, setSelectedMatchIds] = useState(null); // null = all matches
  const [conference, setConference] = useState('');
  const [location,   setLocation]   = useState('');
  const [matchTypes, setMatchTypes] = useState([]);
  const [result,     setResult]     = useState('');
  const [stats, setStats] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAllMatches, setShowAllMatches] = useState(false);
  const [prodSort, setProdSort] = useState({ key: 'ptPct', dir: 'desc' });
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
  const positionMap = useMemo(() => players
    ? Object.fromEntries((Array.isArray(players) ? players : Object.values(players)).map(p => [p.id, p.position]))
    : {}, [players]);

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

  // When specific matches are selected OR L5 is active, conference/site/type chips are hidden
  const showChipFilters = !selectedMatchIds?.length && result !== 'l5';

  // Build active filters object. L5 and individual match selection are mutually exclusive
  // with the conf/location/type chip filters — they use matchIds only.
  const activeFilters = {};
  if (selectedMatchIds?.length) {
    activeFilters.matchIds = selectedMatchIds;
  } else if (result === 'l5') {
    const last5 = (seasonMatches ?? [])
      .filter((m) => m.status !== 'scheduled')
      .slice(-5)
      .map((m) => m.id);
    if (last5.length) activeFilters.matchIds = last5;
  } else {
    if (conference) activeFilters.conference = conference;
    if (location)   activeFilters.location   = location;
    if (matchTypes.length) activeFilters.matchType = matchTypes;
    if (result)     activeFilters.result     = result;
  }
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
  }, [selectedSeasonId, selectedMatchIds, conference, location, matchTypes, result, seasonMatches]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handlePlayerClick = useCallback((row) => {
    if (!selectedTeamId || !selectedSeasonId || row.id === '__totals__') return;
    navigate(`/teams/${selectedTeamId}/players/${row.id}?season=${selectedSeasonId}`);
  }, [navigate, selectedTeamId, selectedSeasonId]);

  const xkTeam = useMemo(() => aggregateXKTeamStats(playerRows), [playerRows]);

  const teamViewDivisor = useMemo(() => {
    if (!stats || teamView === 'totals') return 1;
    return teamView === 'per_set' ? (stats.setsPlayed || 1) : (stats.matchCount || 1);
  }, [stats, teamView]);

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

  const rotationRows = useMemo(() => {
    if (!stats || stats.empty) return [];
    const rows = Object.entries(stats.rotation.rotations).map(([n, r]) => ({
      id: n,
      name: `R${n}`,
      ...r,
    }));
    // Mark the single lowest SO% and lowest SP% rows for yellow highlighting
    const withSo = rows.filter(r => r.so_pct != null);
    if (withSo.length) {
      const minSo = Math.min(...withSo.map(r => r.so_pct));
      rows.forEach(r => { r._minSo = r.so_pct === minSo; });
    }
    const withBp = rows.filter(r => r.bp_pct != null);
    if (withBp.length) {
      const minBp = Math.min(...withBp.map(r => r.bp_pct));
      rows.forEach(r => { r._minBp = r.bp_pct === minBp; });
    }
    return rows;
  }, [stats]);

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

      {/* Conf / site / type chip filters — hidden when specific matches or L5 selected */}
      {selectedSeasonId && (
        <div className="px-4 pb-3 space-y-2">
          {showChipFilters && (
            <>
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
            </>
          )}
          {!selectedMatchIds?.length && (
            <div className="flex gap-1.5 flex-wrap items-center">
              <span className="text-[10px] text-slate-500 uppercase tracking-wide mr-1">Result</span>
              {[['', 'All'], ['win', 'Win'], ['loss', 'Loss'], ['l5', 'L5']].map(([val, label]) => (
                <button key={val} onClick={() => setResult(val)} className={chipClass(result === val)}>{label}</button>
              ))}
            </div>
          )}
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
              onClick={() => { setConference(''); setLocation(''); setMatchTypes([]); setResult(''); setSelectedMatchIds(null); }}
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
          <div className="mx-4 mb-1 bg-surface rounded-xl p-3 grid grid-cols-2 gap-2 text-center text-sm">
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
          </div>

          <TabBar tabs={TABS} active={tab} onChange={setTab} />

          <div className="p-4 md:p-6 space-y-6" {...swipeHandlers}>

            {/* ── Team Stats ──────────────────────────────────────────── */}
            {tab === 'team' && (
              <>
                {/* View toggle */}
                <div className="flex gap-2">
                  {[
                    { value: 'totals',    label: 'Totals'      },
                    { value: 'per_set',   label: 'Avg / Set'   },
                    { value: 'per_match', label: 'Avg / Match' },
                  ].map(({ value, label }) => (
                    <button key={value} onClick={() => setTeamView(value)} className={chipClass(teamView === value)}>
                      {label}
                    </button>
                  ))}
                </div>

                {/* Stat grid */}
                <div className="space-y-2">
                  {TEAM_STAT_SECTIONS.map(({ label: sectionLabel, items }) => (
                    <div key={sectionLabel}>
                      <SectionHeader>{sectionLabel}</SectionHeader>
                      <div className="grid grid-cols-3 gap-1.5">
                        {items.map((item) => (
                          <div key={item.label} className="bg-surface rounded-lg px-1 py-1 text-center">
                            <div className="text-[10px] text-slate-400 leading-none">{item.label}</div>
                            <div className="text-base font-bold text-primary mt-0.5 leading-none">
                              {getTeamStatDisplay(item, stats, teamView)}
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
                          <div className="text-sm font-bold text-slate-400">
                            {teamViewDivisor === 1 ? val : (val / teamViewDivisor).toFixed(1)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Point Quality — mirrors the Scoring tab in Match Summary */}
                {stats.pointQuality && (
                  <PointQualityPanel
                    pq={stats.pointQuality}
                    oppScored={stats.oppScored}
                    divisor={teamView === 'totals' ? 1 : (stats.setsPlayed || 1)}
                  />
                )}

                {/* In System vs Out of System */}
                {stats.isOos && (stats.isOos.total.is.ta > 0 || stats.isOos.total.oos.ta > 0) && (
                  <div className="bg-surface rounded-xl p-3 space-y-2">
                    <SectionHeader>In System vs Out of System</SectionHeader>
                    <div className="grid grid-cols-2 gap-3">
                      {(() => {
                        const d = teamViewDivisor;
                        const sc = (v) => d === 1 ? fmtCount(v) : v != null ? (v / d).toFixed(1) : '—';
                        return [
                          { label: 'IS ATK',   val: sc(stats.isOos.total.is.ta)                  },
                          { label: 'IS Win%',  val: fmtPct(stats.isOos.total.is.win_pct)               },
                          { label: 'IS K%',    val: fmtPct(stats.isOos.total.is.k_pct)                 },
                          { label: 'IS HIT%',  val: fmtHitting(stats.isOos.total.is.hit_pct)           },
                          { label: 'OOS ATK',  val: sc(stats.isOos.total.oos.ta)                 },
                          { label: 'OOS Win%', val: fmtPct(stats.isOos.total.oos.win_pct)              },
                          { label: 'OOS K%',   val: fmtPct(stats.isOos.total.oos.k_pct)               },
                          { label: 'OOS HIT%', val: fmtHitting(stats.isOos.total.oos.hit_pct)         },
                        ];
                      })().map(({ label, val }) => (
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
                      {(() => {
                        const d = teamViewDivisor;
                        const sc = (v) => d === 1 ? fmtCount(v) : v != null ? (v / d).toFixed(1) : '—';
                        return [
                          { label: 'FB ATK',    val: sc(stats.transitionAttack.free.total.ta)            },
                          { label: 'FB Win%',   val: fmtPct(stats.transitionAttack.free.total.win_pct)         },
                          { label: 'FB K%',     val: fmtPct(stats.transitionAttack.free.total.k_pct)           },
                          { label: 'FB HIT%',   val: fmtHitting(stats.transitionAttack.free.total.hit_pct)     },
                          { label: 'TR ATK',    val: sc(stats.transitionAttack.transition.total.ta)       },
                          { label: 'TR Win%',   val: fmtPct(stats.transitionAttack.transition.total.win_pct)   },
                          { label: 'TR K%',     val: fmtPct(stats.transitionAttack.transition.total.k_pct)     },
                          { label: 'TR HIT%',   val: fmtHitting(stats.transitionAttack.transition.total.hit_pct) },
                        ];
                      })().map(({ label, val }) => (
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

                {/* Offensive Production */}
                {playerRows.length > 0 && stats.ourScored > 0 && (() => {
                  const teamPts = stats.ourScored ?? 0;
                  const oppPts  = stats.oppScored  ?? 0;
                  const toggleSort = (key) => setProdSort(s =>
                    s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }
                  );
                  const sortArrow = (key) => prodSort.key === key ? (prodSort.dir === 'desc' ? ' ↓' : ' ↑') : '';
                  const rows = playerRows
                    .filter(r => (r.sp ?? 0) > 0)
                    .map(r => {
                      const pPts   = (r.k ?? 0) + (r.ace ?? 0) + (r.bs ?? 0) + (r.ba ?? 0);
                      const pFault = (r.se ?? 0) + (r.ae ?? 0) + (r.net ?? 0) + (r.lift ?? 0)
                                   + (r.bhe ?? 0) + (r.fbe ?? 0) + (r.p0 ?? 0);
                      return {
                        id: r.id, name: r.name,
                        pPts, pFault,
                        ptPct:    teamPts > 0 ? (pPts   / teamPts) * 100 : null,
                        faultPct: oppPts  > 0 ? (pFault / oppPts)  * 100 : null,
                      };
                    })
                    .sort((a, b) => {
                      const { key, dir } = prodSort;
                      const mul = dir === 'desc' ? -1 : 1;
                      if (key === 'name') return mul * a.name.localeCompare(b.name);
                      return mul * ((a[key] ?? -1) - (b[key] ?? -1));
                    });
                  const hdrCls = (key) =>
                    `cursor-pointer select-none transition-colors ${prodSort.key === key ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`;
                  return (
                    <div className="bg-surface rounded-xl p-3 space-y-2">
                      <SectionHeader>Offensive Production</SectionHeader>
                      <div className="flex items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-wide mb-0.5">
                        <button className={`flex-1 text-left ${hdrCls('name')}`} onClick={() => toggleSort('name')}>
                          Player{sortArrow('name')}
                        </button>
                        <div className="grid grid-cols-2 gap-2 shrink-0 w-[180px]">
                          <button className={`text-right ${hdrCls('ptPct')}`} onClick={() => toggleSort('ptPct')}>
                            % Team Pts{sortArrow('ptPct')}
                          </button>
                          <button className={`text-right ${hdrCls('faultPct')}`} onClick={() => toggleSort('faultPct')}>
                            % Opp Pts{sortArrow('faultPct')}
                          </button>
                        </div>
                      </div>
                      {rows.map(r => (
                        <div key={r.id} className="flex items-center gap-2 px-1">
                          <span className="flex-1 text-xs text-slate-300 truncate">{r.name}</span>
                          <div className="grid grid-cols-2 gap-2 shrink-0 w-[180px]">
                            <div className="text-right">
                              <span className="text-xs font-bold text-emerald-400">
                                {r.ptPct != null ? r.ptPct.toFixed(1) + '%' : '—'}
                              </span>
                              <span className="text-[10px] text-slate-500 ml-1 tabular-nums">
                                {r.pPts}/{teamPts}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-xs font-bold text-red-400">
                                {r.faultPct != null ? r.faultPct.toFixed(1) + '%' : '—'}
                              </span>
                              <span className="text-[10px] text-slate-500 ml-1 tabular-nums">
                                {r.pFault}/{oppPts}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                      <p className="text-[10px] text-slate-600 text-center pt-1">
                        Team Pts: K+ACE+BLK &nbsp;·&nbsp; Opp Pts: SE+AE+NET+L+BHE+FBE+P0
                      </p>
                    </div>
                  );
                })()}

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

                {/* Timeout Effectiveness — always shown; falls back to zeros when no TO data in selection */}
                {(() => {
                  const EMPTY = { count: 0, win3: 0, total3: 0, win_pct: null };
                  const te = stats.timeoutEffect ?? { us: EMPTY, them: EMPTY };
                  const noData = te.us.count === 0 && te.them.count === 0;
                  return (
                    <div className="bg-surface rounded-xl p-3 space-y-2">
                      <SectionHeader>Timeout Effectiveness</SectionHeader>
                      <p className="text-[11px] text-slate-500 -mt-1 mb-2">Win % in the 3 rallies immediately following each timeout</p>
                      {noData ? (
                        <p className="text-xs text-slate-500 text-center py-2">No timeout data in selected matches</p>
                      ) : (
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { label: 'Our Timeouts', d: te.us   },
                            { label: 'Opp Timeouts', d: te.them },
                          ].map(({ label, d }) => {
                            const pct   = d.win_pct != null ? Math.round(d.win_pct * 100) : null;
                            const color = pct == null ? 'text-slate-400'
                              : pct >= 55 ? 'text-emerald-400'
                              : pct >= 40 ? 'text-yellow-400'
                              : 'text-red-400';
                            return (
                              <div key={label} className="bg-slate-800/60 rounded-lg p-3 text-center">
                                <div className="text-[11px] text-slate-400 mb-1">{label}</div>
                                <div className={`text-2xl font-black ${color}`}>
                                  {pct != null ? `${pct}%` : '—'}
                                </div>
                                <div className="text-[10px] text-slate-500 mt-1">
                                  {d.win3}/{d.total3} pts · {d.count} TO{d.count !== 1 ? 's' : ''}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
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
                      divisor={teamViewDivisor}
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
                    { value: 'setting',   label: 'Setting'   },
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
                      onNameClick={handlePlayerClick}
                      showGlossary
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
                  <>
                    <StatTable columns={TAB_COLUMNS.passing} rows={playerRows} totalsRow={playerTotalsRow} onNameClick={handlePlayerClick} />
                    <PassDistributionChart totals={playerTotalsRow} />
                  </>
                )}
                {playerStatView === 'attacking' && (
                  <>
                    <StatTable columns={TAB_COLUMNS.attacking} rows={playerRows} totalsRow={playerTotalsRow} onNameClick={handlePlayerClick} />
                    {(() => {
                      const POS_ORDER  = ['OH', 'MB', 'OPP', 'S'];
                      const POS_LABELS = { OH: 'Outside', MB: 'Middle', OPP: 'Opposite/RS', S: 'Setter' };
                      const normalizePos = (pos) => pos === 'RS' ? 'OPP' : pos;
                      const groups = {};
                      for (const row of playerRows) {
                        const pos = normalizePos(row.pos_label);
                        if (!POS_ORDER.includes(pos)) continue;
                        groups[pos] ??= { ta: 0, k: 0, ae: 0 };
                        groups[pos].ta += row.ta ?? 0;
                        groups[pos].k  += row.k  ?? 0;
                        groups[pos].ae += row.ae ?? 0;
                      }
                      const totalTA = POS_ORDER.reduce((s, p) => s + (groups[p]?.ta ?? 0), 0);
                      if (totalTA === 0) return null;
                      const maxTA = Math.max(...POS_ORDER.map(p => groups[p]?.ta ?? 0));
                      return (
                        <div className="bg-surface rounded-xl p-3">
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Set Distribution</p>
                          <div className="space-y-3">
                            {POS_ORDER.map(pos => {
                              const g = groups[pos];
                              if (!g || g.ta === 0) return null;
                              const sharePct = Math.round(g.ta / totalTA * 100);
                              const kW      = g.ta > 0 ? (g.k  / g.ta) * 100 : 0;
                              const eW      = g.ta > 0 ? (g.ae / g.ta) * 100 : 0;
                              const inPlayW = Math.max(0, 100 - kW - eW);
                              const barW    = (g.ta / maxTA) * 100;
                              const hitting = g.ta > 0 ? (g.k - g.ae) / g.ta : null;
                              return (
                                <div key={pos}>
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-semibold text-slate-300">
                                      {POS_LABELS[pos]}
                                      <span className="ml-1.5 text-slate-500 font-normal">{sharePct}%</span>
                                    </span>
                                    <span className="text-xs text-slate-400 tabular-nums">
                                      {g.ta} TA · {g.k} K · {g.ae} AE · {hitting !== null ? fmtHitting(hitting) : '—'}
                                    </span>
                                  </div>
                                  <div className="w-full bg-slate-800 rounded-full h-4 overflow-hidden">
                                    <div className="h-full flex rounded-full overflow-hidden" style={{ width: `${barW}%` }}>
                                      <div className="bg-emerald-500 h-full" style={{ width: `${kW}%` }} />
                                      <div className="bg-slate-600 h-full"   style={{ width: `${inPlayW}%` }} />
                                      <div className="bg-red-500 h-full"     style={{ width: `${eW}%` }} />
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                            <div className="flex gap-4 pt-1">
                              {[['bg-emerald-500','Kill'],['bg-slate-600','In Play'],['bg-red-500','Error']].map(([cls,lbl]) => (
                                <span key={lbl} className="flex items-center gap-1 text-[10px] text-slate-500">
                                  <span className={`w-2 h-2 rounded-sm ${cls} inline-block`} />{lbl}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                    {(() => {
                      const xkRows = playerRows.filter(r => (r.xk1_ta ?? 0) > 0 || (r.xk2_ta ?? 0) > 0 || (r.xk3_ta ?? 0) > 0);
                      if (!xkRows.length) return null;
                      return (
                        <>
                          <XPassRatingTable
                            title="Kill% by Pass Rating (xK%)"
                            rows={xkRows}
                            cols={[
                              { key: 'xk1', label: 'xK1%',  fmt: fmtPct     },
                              { key: 'xk2', label: 'xK2%',  fmt: fmtPct     },
                              { key: 'xk3', label: 'xK3%',  fmt: fmtPct     },
                            ]}
                          />
                          <XPassRatingTable
                            title="Hit% by Pass Rating (xHIT%)"
                            rows={xkRows}
                            cols={[
                              { key: 'xhit1', label: 'xHIT1', fmt: fmtHitting },
                              { key: 'xhit2', label: 'xHIT2', fmt: fmtHitting },
                              { key: 'xhit3', label: 'xHIT3', fmt: fmtHitting },
                            ]}
                          />
                        </>
                      );
                    })()}
                  </>
                )}
                {playerStatView === 'setting' && (
                  <StatTable columns={TAB_COLUMNS.setting} rows={playerRows} totalsRow={playerTotalsRow} onNameClick={handlePlayerClick} />
                )}
                {playerStatView === 'blocking' && (
                  <StatTable columns={TAB_COLUMNS.blocking} rows={playerRows} totalsRow={playerTotalsRow} onNameClick={handlePlayerClick} />
                )}
                {playerStatView === 'defense' && (
                  <StatTable columns={TAB_COLUMNS.defense} rows={playerRows} totalsRow={playerTotalsRow} onNameClick={handlePlayerClick} />
                )}
                {playerStatView === 'ver' && (
                  <StatTable columns={TAB_COLUMNS.ver} rows={playerRows} totalsRow={playerTotalsRow} onNameClick={handlePlayerClick} showGlossary />
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

                {(() => {
                  const POS_ORDER  = ['OH', 'MB', 'OPP', 'S'];
                  const POS_LABELS = { OH: 'Outside', MB: 'Middle', OPP: 'Opposite/RS', S: 'Setter' };
                  const normalizePos = (pos) => pos === 'RS' ? 'OPP' : pos;
                  const groups = {};
                  for (const c of contacts) {
                    if (c.opponent_contact || c.action !== 'attack') continue;
                    const rawPos = positionMap[c.player_id] ?? positionMap[Number(c.player_id)];
                    const pos = normalizePos(rawPos);
                    if (!POS_ORDER.includes(pos)) continue;
                    groups[pos] ??= { ta: 0, k: 0, ae: 0 };
                    groups[pos].ta++;
                    if (c.result === 'kill')  groups[pos].k++;
                    if (c.result === 'error') groups[pos].ae++;
                  }
                  const totalTA = POS_ORDER.reduce((s, p) => s + (groups[p]?.ta ?? 0), 0);
                  if (totalTA === 0) return null;
                  const maxTA = Math.max(...POS_ORDER.map(p => groups[p]?.ta ?? 0));
                  return (
                    <div className="bg-surface rounded-xl p-3">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Set Distribution by Position</p>
                      <div className="space-y-3">
                        {POS_ORDER.map(pos => {
                          const g = groups[pos];
                          if (!g || g.ta === 0) return null;
                          const sharePct = Math.round(g.ta / totalTA * 100);
                          const kW      = g.ta > 0 ? (g.k  / g.ta) * 100 : 0;
                          const eW      = g.ta > 0 ? (g.ae / g.ta) * 100 : 0;
                          const inPlayW = Math.max(0, 100 - kW - eW);
                          const barW    = (g.ta / maxTA) * 100;
                          const hitting = g.ta > 0 ? (g.k - g.ae) / g.ta : null;
                          return (
                            <div key={pos}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-semibold text-slate-300">
                                  {POS_LABELS[pos]}
                                  <span className="ml-1.5 text-slate-500 font-normal">{sharePct}%</span>
                                </span>
                                <span className="text-xs text-slate-400 tabular-nums">
                                  {g.ta} TA · {g.k} K · {g.ae} AE · {hitting !== null ? fmtHitting(hitting) : '—'}
                                </span>
                              </div>
                              <div className="w-full bg-slate-800 rounded-full h-4 overflow-hidden">
                                <div className="h-full flex rounded-full overflow-hidden" style={{ width: `${barW}%` }}>
                                  <div className="bg-emerald-500 h-full" style={{ width: `${kW}%` }} />
                                  <div className="bg-slate-600 h-full"   style={{ width: `${inPlayW}%` }} />
                                  <div className="bg-red-500 h-full"     style={{ width: `${eW}%` }} />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        <div className="flex gap-4 pt-1">
                          {[['bg-emerald-500','Kill'],['bg-slate-600','In Play'],['bg-red-500','Error']].map(([cls,lbl]) => (
                            <span key={lbl} className="flex items-center gap-1 text-[10px] text-slate-500">
                              <span className={`w-2 h-2 rounded-sm ${cls} inline-block`} />{lbl}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <SetDistByRotationPanel contacts={contacts} positionMap={positionMap} />
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
