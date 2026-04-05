import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { db } from '../db/schema';
import { computePlayerStats, computePlayerTrends } from '../stats/engine';
import {
  getContactsForMatches,
  getBatchSetsPlayedCount,
  getPlayerPositionsForMatches,
} from '../stats/queries';
import { TAB_COLUMNS, SERVING_COLS } from '../stats/columns';
import { fmtCount, fmtHitting, fmtPassRating, fmtPct, fmtVER } from '../stats/formatters';
import { PageHeader } from '../components/layout/PageHeader';
import { TabBar } from '../components/ui/Tab';
import { StatTable } from '../components/stats/StatTable';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { Badge } from '../components/ui/Badge';

const POS_COLOR = { S: 'blue', OH: 'orange', OPP: 'orange', MB: 'green', L: 'gray', DS: 'gray', RS: 'orange' };

// ── Report Card ──────────────────────────────────────────────────────────────

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function gradeScore(score) {
  if (score >= 85) return { letter: 'A', color: 'text-emerald-400' };
  if (score >= 70) return { letter: 'B', color: 'text-blue-400'    };
  if (score >= 50) return { letter: 'C', color: 'text-yellow-400'  };
  if (score >= 30) return { letter: 'D', color: 'text-orange-400'  };
  return                  { letter: 'F', color: 'text-red-400'     };
}

function PlayerReportCard({ row }) {
  const tiles = [
    row.sa > 0 && {
      label: 'Serving',
      display: fmtPct(row.ace_pct),
      sub: 'ACE%',
      score: clamp(((row.ace_pct ?? 0) / 0.12) * 100, 0, 100),
      radar: clamp(((row.ace_pct ?? 0) / 0.12) * 100, 0, 100),
    },
    row.pa > 0 && {
      label: 'Passing',
      display: fmtPassRating(row.apr),
      sub: 'APR',
      score: clamp(((row.apr ?? 0) / 2.5) * 100, 0, 100),
      radar: clamp(((row.apr ?? 0) / 2.5) * 100, 0, 100),
    },
    row.ta > 0 && {
      label: 'Attacking',
      display: fmtHitting(row.hit_pct),
      sub: 'HIT%',
      score: clamp((((row.hit_pct ?? -0.1) + 0.1) / 0.45) * 100, 0, 100),
      radar: clamp((((row.hit_pct ?? -0.1) + 0.1) / 0.45) * 100, 0, 100),
    },
    row.dig > 0 && {
      label: 'Defense',
      display: fmtCount(row.dips != null ? +row.dips.toFixed(1) : null),
      sub: 'DIG/Set',
      score: clamp(((row.dips ?? 0) / 4) * 100, 0, 100),
      radar: clamp(((row.dips ?? 0) / 4) * 100, 0, 100),
    },
    (row.bs > 0 || row.ba > 0) && {
      label: 'Blocking',
      display: fmtCount(row.bps != null ? +row.bps.toFixed(2) : null),
      sub: 'BLK/Set',
      score: clamp(((row.bps ?? 0) / 1.5) * 100, 0, 100),
      radar: clamp(((row.bps ?? 0) / 1.5) * 100, 0, 100),
    },
    row.ast > 0 && {
      label: 'Setting',
      display: fmtCount(row.aps != null ? +row.aps.toFixed(1) : null),
      sub: 'AST/Set',
      score: clamp(((row.aps ?? 0) / 10) * 100, 0, 100),
      radar: clamp(((row.aps ?? 0) / 10) * 100, 0, 100),
    },
  ].filter(Boolean);

  const verColor = row.ver == null ? 'text-slate-400'
    : row.ver >= 6   ? 'text-emerald-400'
    : row.ver >= 2   ? 'text-blue-400'
    : row.ver >= -1  ? 'text-yellow-400'
    : 'text-red-400';

  const radarData = tiles.map(t => ({ dim: t.label, score: Math.round(t.radar) }));

  return (
    <div className="p-4 space-y-4">
      {/* VER hero */}
      <div className="bg-surface rounded-xl p-4 text-center">
        <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">Volleyball Efficiency Rating</div>
        <div className={`text-5xl font-black ${verColor}`}>
          {row.ver != null ? fmtVER(row.ver) : '—'}
        </div>
        <div className="text-xs text-slate-500 mt-1">{row.sp ?? 0} sets played · {row.mp ?? 0} matches</div>
      </div>

      {/* Stat tiles */}
      {tiles.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {tiles.map((t) => {
            const { letter, color } = gradeScore(t.score);
            return (
              <div key={t.label} className="bg-surface rounded-xl p-3 flex items-center gap-3">
                <div className={`text-3xl font-black w-10 text-center shrink-0 ${color}`}>{letter}</div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{t.label}</div>
                  <div className="text-xs text-slate-400">{t.display} <span className="text-slate-500">{t.sub}</span></div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Radar chart */}
      {radarData.length >= 3 && (
        <div className="bg-surface rounded-xl p-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Skill Profile</p>
          <ResponsiveContainer width="100%" height={240}>
            <RadarChart data={radarData} margin={{ top: 8, right: 28, left: 28, bottom: 8 }}>
              <PolarGrid stroke="#1e293b" />
              <PolarAngleAxis dataKey="dim" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
              <Radar dataKey="score" stroke="#f97316" fill="#f97316" fillOpacity={0.25} dot={{ r: 3, fill: '#f97316' }} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                formatter={(v) => [`${v}/100`]}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

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
          { value: 'season',      label: 'Season Stats' },
          { value: 'bygame',      label: 'By Game'       },
          { value: 'report_card', label: 'Report Card'   },
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
      ) : mainTab === 'report_card' ? (
        !stats?.playerRow ? (
          <EmptyState title="No stats yet" description="Record a match to see the report card." />
        ) : (
          <PlayerReportCard row={stats.playerRow} />
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
