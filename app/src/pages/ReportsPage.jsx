import { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { computeSeasonStats } from '../stats/engine';
import { fmtHitting, fmtPassRating, fmtPct, fmtCount } from '../stats/formatters';
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
  { key: 'name',    label: 'Player'  },
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


const CHIP = 'px-3 py-1 rounded-full text-xs font-semibold transition-colors';
const chipClass = (active) =>
  active ? `${CHIP} bg-primary text-white` : `${CHIP} bg-surface text-slate-400 hover:text-white`;

export function ReportsPage() {
  const [tab, setTab] = useState('team');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
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

  // Players for the selected team
  const players = useLiveQuery(
    () => selectedTeamId
      ? db.players.where('team_id').equals(Number(selectedTeamId)).toArray()
      : Promise.resolve([]),
    [selectedTeamId]
  );
  const playerNames = Object.fromEntries((players ?? []).map(p => [p.id, p.name]));

  // Reset season when team changes
  function handleTeamChange(e) {
    setSelectedTeamId(e.target.value);
    setSelectedSeasonId('');
    setStats(null);
    setContacts([]);
  }

  // Build active filters object (omit empty strings)
  const activeFilters = {};
  if (conference) activeFilters.conference = conference;
  if (location)   activeFilters.location   = location;
  if (matchType)  activeFilters.matchType  = matchType;
  const hasFilters = Object.keys(activeFilters).length > 0;

  // Load season stats when season or filters change
  useEffect(() => {
    if (!selectedSeasonId) return;
    setLoading(true);
    computeSeasonStats(Number(selectedSeasonId), activeFilters)
      .then((s) => { setStats(s); setContacts(s?.contacts ?? []); })
      .finally(() => setLoading(false));
  }, [selectedSeasonId, conference, location, matchType]);

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
          onChange={e => setSelectedSeasonId(e.target.value)}
          disabled={!selectedTeamId}
        >
          <option value="">Select Season</option>
          {(seasons ?? []).map(s => (
            <option key={s.id} value={s.id}>{s.year ?? s.name ?? `Season ${s.id}`}</option>
          ))}
        </select>
      </div>

      {/* Match filters — only shown once a season is selected */}
      {selectedSeasonId && (
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
              onClick={() => { setConference(''); setLocation(''); setMatchType(''); }}
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

                {/* Hitting bar */}
                {hittingBarData.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-2">Player Hitting%</h3>
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
                  <SideoutPieChart so_pct={stats.rotation.bp_pct} label="Break Point" />
                </div>
                <RotationRadarChart rotationStats={stats.rotation} />
                <RotationSpotlight rows={rotationRows} />
                <StatTable columns={ROTATION_COLS} rows={rotationRows} />
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
