import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { computePlayerStats, computePlayerTrends } from '../stats/engine';
import {
  getContactsForMatches,
  getBatchSetsPlayedCount,
  getPlayerPositionsForMatches,
} from '../stats/queries';
import { TAB_COLUMNS, SERVING_COLS } from '../stats/columns';
import { fmtCount, fmtHitting, fmtPassRating, fmtVER } from '../stats/formatters';
import { PageHeader } from '../components/layout/PageHeader';
import { TabBar } from '../components/ui/Tab';
import { StatTable } from '../components/stats/StatTable';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { Badge } from '../components/ui/Badge';

const POS_COLOR = { S: 'blue', OH: 'orange', OPP: 'orange', MB: 'green', L: 'gray', DS: 'gray', RS: 'orange' };

const CHIP = 'px-3 py-1 rounded-full text-xs font-semibold transition-colors';
const chipClass = (active) =>
  active
    ? `${CHIP} bg-primary text-white`
    : `${CHIP} bg-surface text-slate-400 hover:text-white`;

const STAT_TABS = [
  { value: 'serving',   label: 'Serving'   },
  { value: 'passing',   label: 'Passing'   },
  { value: 'attacking', label: 'Attacking' },
  { value: 'blocking',  label: 'Blocking'  },
  { value: 'defense',   label: 'Defense'   },
  { value: 'ver',       label: 'VER'       },
];

const BY_GAME_COLS = [
  { key: 'date',    label: 'Date'  },
  { key: 'opp',    label: 'Opp'   },
  { key: 'sp',     label: 'SP',   fmt: fmtCount     },
  { key: 'k',      label: 'K',    fmt: fmtCount     },
  { key: 'ace',    label: 'ACE',  fmt: fmtCount     },
  { key: 'dig',    label: 'DIG',  fmt: fmtCount     },
  { key: 'hit_pct',label: 'HIT%', fmt: fmtHitting   },
  { key: 'apr',    label: 'APR',  fmt: fmtPassRating },
  { key: 'ver',    label: 'VER',  fmt: fmtVER       },
];

// Strip the 'name' column — player identity is already in the page header
function withoutNameCol(cols) {
  return cols.filter((c) => c.key !== 'name');
}

export function PlayerStatsPage() {
  const { teamId, playerId } = useParams();
  const pid = Number(playerId);
  const tid = Number(teamId);

  const [mainTab,   setMainTab]   = useState('season');
  const [statTab,   setStatTab]   = useState('serving');
  const [serveView, setServeView] = useState('all');
  const [loading,   setLoading]   = useState(false);
  const [stats,     setStats]     = useState(null); // { playerRow, trends, matches }

  const player = useLiveQuery(() => db.players.get(pid), [pid]);

  const seasons = useLiveQuery(
    () => db.seasons.where('team_id').equals(tid).toArray(),
    [tid]
  );

  const season = useMemo(() => {
    if (!seasons?.length) return null;
    return [...seasons].sort((a, b) => b.id - a.id)[0];
  }, [seasons]);

  const matches = useLiveQuery(
    () =>
      season
        ? db.matches.where('season_id').equals(season.id).sortBy('date')
        : Promise.resolve([]),
    [season?.id]
  );

  useEffect(() => {
    if (!matches?.length) {
      setStats(null);
      return;
    }
    setLoading(true);
    const matchIds = matches.map((m) => m.id);
    Promise.all([
      getContactsForMatches(matchIds),
      getBatchSetsPlayedCount(matchIds),
      getPlayerPositionsForMatches(matchIds),
    ])
      .then(([contacts, setsPerMatch, playerPositions]) => {
        const allStats  = computePlayerStats(contacts, 1, playerPositions);
        const playerRow = allStats[pid] ?? null;
        const trends    = computePlayerTrends(matches, contacts, setsPerMatch, playerPositions);
        setStats({ playerRow, trends });
      })
      .finally(() => setLoading(false));
  }, [matches, pid]); // eslint-disable-line react-hooks/exhaustive-deps -- intentional: recompute only when source data or player changes, not on internal setter references

  // Single-row array for StatTable
  const statRow = useMemo(() => {
    if (!stats?.playerRow || !player) return [];
    return [{ id: String(pid), name: player.name, ...stats.playerRow }];
  }, [stats, player, pid]);

  // Per-match rows for By Game tab
  const byGameRows = useMemo(() => {
    if (!stats?.trends) return [];
    const trendRows = stats.trends.byPlayer[pid];
    if (!trendRows) return [];
    return stats.trends.matches.map((m, i) => {
      const row = trendRows[i];
      const d   = m.date ? new Date(m.date) : null;
      const dateStr = d ? `${d.getMonth() + 1}/${d.getDate()}` : '—';
      const opp     = m.opponentName || '—';
      if (!row) return { _key: m.id, date: dateStr, opp, sp: null, k: null, ace: null, dig: null, hit_pct: null, apr: null, ver: null };
      return { _key: m.id, date: dateStr, opp, ...row };
    });
  }, [stats, pid]);

  const servingCols = useMemo(
    () => withoutNameCol(SERVING_COLS[serveView] ?? SERVING_COLS.all),
    [serveView]
  );

  const currentCols = useMemo(
    () => (statTab === 'serving' ? servingCols : withoutNameCol(TAB_COLUMNS[statTab] ?? [])),
    [statTab, servingCols]
  );

  if (!player) {
    return (
      <div className="flex items-center justify-center h-48">
        <Spinner />
      </div>
    );
  }

  const headerTitle = (
    <span>
      <span className="font-mono text-primary mr-2">#{player.jersey_number}</span>
      {player.name}
    </span>
  );

  return (
    <div>
      <PageHeader
        title={headerTitle}
        backTo={`/teams/${teamId}`}
        action={<Badge color={POS_COLOR[player.position] ?? 'gray'}>{player.position}</Badge>}
      />

      <TabBar
        tabs={[
          { value: 'season', label: 'Season Stats' },
          { value: 'bygame', label: 'By Game'       },
        ]}
        active={mainTab}
        onChange={setMainTab}
      />

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Spinner />
        </div>
      ) : mainTab === 'season' ? (
        !stats?.playerRow ? (
          <EmptyState title="No stats yet" description="Record a match to see stats here." />
        ) : (
          <div>
            <TabBar tabs={STAT_TABS} active={statTab} onChange={setStatTab} />

            {statTab === 'serving' && (
              <div className="flex gap-2 px-4 py-2 border-b border-slate-800">
                {[['all', 'All'], ['float', 'Float'], ['top', 'Topspin']].map(([v, label]) => (
                  <button key={v} onClick={() => setServeView(v)} className={chipClass(serveView === v)}>
                    {label}
                  </button>
                ))}
              </div>
            )}

            <div className="px-2 py-3">
              <StatTable columns={currentCols} rows={statRow} />
            </div>
          </div>
        )
      ) : (
        // By Game tab
        byGameRows.length === 0 ? (
          <EmptyState title="No matches" description="No matches recorded this season." />
        ) : (
          <div className="overflow-x-auto py-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  {BY_GAME_COLS.map((c) => (
                    <th
                      key={c.key}
                      className={`px-2 py-2 font-semibold text-slate-400 whitespace-nowrap ${
                        c.key === 'date' || c.key === 'opp' ? 'text-left' : 'text-right'
                      }`}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byGameRows.map((row, i) => (
                  <tr
                    key={row._key}
                    className={`border-b border-slate-800 ${i % 2 === 0 ? '' : 'bg-slate-900/40'}`}
                  >
                    {BY_GAME_COLS.map((c) => {
                      const v     = row[c.key];
                      const isLeft = c.key === 'date' || c.key === 'opp';
                      return (
                        <td
                          key={c.key}
                          className={`px-2 py-2 tabular-nums text-slate-300 ${isLeft ? 'text-left' : 'text-right'}`}
                        >
                          {v == null ? '—' : c.fmt ? c.fmt(v) : v}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
