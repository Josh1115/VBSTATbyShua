import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { computeMatchStats } from '../stats/engine';
import { exportMatchCSV, exportMatchPDF, exportMaxPrepsCSV } from '../stats/export';
import { fmtHitting, fmtPassRating, fmtPct, fmtCount, fmtDate, fmtVER } from '../stats/formatters';
import { POSITION_MULTIPLIERS } from '../stats/engine';
import { ROTATION_COLS } from '../stats/columns';
import { PageHeader } from '../components/layout/PageHeader';
import { TabBar } from '../components/ui/Tab';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { StatTable } from '../components/stats/StatTable';
import { RotationSpotlight } from '../components/stats/RotationSpotlight';
import { PointQualityPanel } from '../components/stats/PointQualityPanel';
import { RotationRadarChart } from '../components/charts/RotationRadarChart';
import { CourtHeatMap } from '../components/charts/CourtHeatMap';

const TABS = [
  { value: 'points',    label: 'Points'    },
  { value: 'serving',   label: 'Serving'   },
  { value: 'passing',   label: 'Passing'   },
  { value: 'attacking', label: 'Attacking' },
  { value: 'blocking',  label: 'Blocking'  },
  { value: 'defense',   label: 'Defense'   },
  { value: 'setting',   label: 'Setting'   },
  { value: 'rotation',  label: 'Rotation'  },
];

const SERVING_COLS = {
  all: [
    { key: 'name',    label: 'Player' },
    { key: 'sa',      label: 'SA',    fmt: fmtCount },
    { key: 'ace',     label: 'ACE',   fmt: fmtCount },
    { key: 'se',      label: 'SE',    fmt: fmtCount },
    { key: 'ace_pct', label: 'ACE%',  fmt: fmtPct   },
    { key: 'se_pct',  label: 'SE%',   fmt: fmtPct   },
    { key: 'si_pct',  label: 'S%',  fmt: fmtPct   },
  ],
  float: [
    { key: 'name',      label: 'Player' },
    { key: 'f_sa',      label: 'SA',    fmt: fmtCount },
    { key: 'f_ace',     label: 'ACE',   fmt: fmtCount },
    { key: 'f_se',      label: 'SE',    fmt: fmtCount },
    { key: 'f_ace_pct', label: 'ACE%',  fmt: fmtPct   },
    { key: 'f_si_pct',  label: 'S%',  fmt: fmtPct   },
  ],
  top: [
    { key: 'name',      label: 'Player' },
    { key: 't_sa',      label: 'SA',    fmt: fmtCount },
    { key: 't_ace',     label: 'ACE',   fmt: fmtCount },
    { key: 't_se',      label: 'SE',    fmt: fmtCount },
    { key: 't_ace_pct', label: 'ACE%',  fmt: fmtPct   },
    { key: 't_si_pct',  label: 'S%',  fmt: fmtPct   },
  ],
};

const TAB_COLUMNS = {
  serving: SERVING_COLS.all,
  passing: [
    { key: 'name',    label: 'Player' },
    { key: 'pa',      label: 'PA',    fmt: fmtCount     },
    { key: 'p0',      label: 'P0',    fmt: fmtCount     },
    { key: 'p1',      label: 'P1',    fmt: fmtCount     },
    { key: 'p2',      label: 'P2',    fmt: fmtCount     },
    { key: 'p3',      label: 'P3',    fmt: fmtCount     },
    { key: 'apr',     label: 'APR',   fmt: fmtPassRating },
    { key: 'pp_pct',  label: 'PP%',   fmt: fmtPct       },
  ],
  attacking: [
    { key: 'name',    label: 'Player' },
    { key: 'ta',      label: 'TA',    fmt: fmtCount   },
    { key: 'k',       label: 'K',     fmt: fmtCount   },
    { key: 'ae',      label: 'AE',    fmt: fmtCount   },
    { key: 'hit_pct', label: 'HIT%',  fmt: fmtHitting },
    { key: 'k_pct',   label: 'K%',    fmt: fmtPct     },
    { key: 'kps',     label: 'KPS',   fmt: (v) => fmtCount(v != null ? +v.toFixed(2) : null) },
    { key: 'ver',     label: 'VER',   fmt: fmtVER     },
  ],
  blocking: [
    { key: 'name',  label: 'Player' },
    { key: 'bs',    label: 'BS',    fmt: fmtCount },
    { key: 'ba',    label: 'BA',    fmt: fmtCount },
    { key: 'be',    label: 'BE',    fmt: fmtCount },
    { key: 'bps',   label: 'BPS',   fmt: (v) => fmtCount(v != null ? +v.toFixed(2) : null) },
  ],
  defense: [
    { key: 'name',  label: 'Player' },
    { key: 'dig',   label: 'DIG',   fmt: fmtCount },
    { key: 'de',    label: 'DE',    fmt: fmtCount },
    { key: 'dips',  label: 'DiPS',  fmt: (v) => fmtCount(v != null ? +v.toFixed(2) : null) },
    { key: 'fbr',   label: 'FBR',   fmt: fmtCount },
    { key: 'fbs',   label: 'FBS',   fmt: fmtCount },
  ],
  setting: [
    { key: 'name',  label: 'Player' },
    { key: 'ast',   label: 'AST',   fmt: fmtCount },
    { key: 'bhe',   label: 'BHE',   fmt: fmtCount },
    { key: 'aps',   label: 'APS',   fmt: fmtPassRating },
  ],
};


export function MatchSummaryPage() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const id = Number(matchId);

  const [tab, setTab] = useState('points');
  const [serveView, setServeView] = useState('all');
  const [stats, setStats] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Match + sets from Dexie (live)
  const match = useLiveQuery(() => db.matches.get(id), [id]);
  const sets   = useLiveQuery(() => db.sets.where('match_id').equals(id).sortBy('set_number'), [id]);

  // Players keyed by id for name lookup (match → season → team)
  const players = useLiveQuery(async () => {
    if (!match?.season_id) return {};
    const season = await db.seasons.get(match.season_id);
    if (!season?.team_id) return {};
    const list = await db.players.where('team_id').equals(season.team_id).toArray();
    return Object.fromEntries(list.map(p => [p.id, p]));
  }, [match?.season_id]);

  // Compute stats once match data is ready
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    computeMatchStats(id)
      .then((s) => { setStats(s); setContacts(s.contacts); })
      .finally(() => setLoading(false));
  }, [id]);

  const playerNames   = players
    ? Object.fromEntries(Object.entries(players).map(([pid, p]) => [pid, p.name]))
    : {};
  const playerJerseys = players
    ? Object.fromEntries(Object.entries(players).map(([pid, p]) => [pid, p.jersey_number ?? '']))
    : {};

  const playerRows = useMemo(() =>
    stats
      ? Object.entries(stats.players).map(([pid, s]) => {
          const posLabel = players?.[pid]?.position ?? null;
          const posMult  = POSITION_MULTIPLIERS[posLabel] ?? 1.0;
          return {
            id:   pid,
            name: playerNames[pid] ?? `#${pid}`,
            ...s,
            ver:  s.ver != null ? s.ver * posMult : null,
          };
        })
      : [],
    [stats, players, playerNames]
  );

  const rotationRows = useMemo(() =>
    stats
      ? Object.entries(stats.rotation.rotations).map(([n, r]) => ({
          id: n,
          name: `Rotation ${n}`,
          ...r,
        }))
      : [],
    [stats]
  );

  const matchMeta = match ? { ...match, sets: sets ?? [] } : {};

  function handlePDF() {
    if (!stats || !match) return;
    exportMatchPDF(matchMeta, stats.players, stats.team, stats.rotation, playerNames,
      `match-${id}-stats.pdf`);
  }

  function handleCSV() {
    if (!stats) return;
    exportMatchCSV(stats.players, playerNames, `match-${id}-stats.csv`);
  }

  function handleMaxPreps() {
    if (!stats) return;
    exportMaxPrepsCSV(stats.players, playerNames, playerJerseys, stats.setsPlayed, `match-${id}-maxpreps.txt`);
  }

  return (
    <div>
      <PageHeader title="Match Summary" backTo="/" />

      {loading && (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      )}

      {!loading && match && (
        <>
          {/* Match header */}
          <div className="px-4 pt-4 pb-2">
            <h2 className="text-xl font-bold">vs. {match.opponent_name ?? 'Opponent'}</h2>
            {match.status === 'complete' && (() => {
              const won = (match.our_sets_won ?? 0) > (match.opp_sets_won ?? 0);
              return (
                <div className={`text-2xl font-black tracking-tight mt-0.5 ${won ? 'text-emerald-400' : 'text-red-400'}`}>
                  {won ? 'W' : 'L'} {match.our_sets_won ?? 0}–{match.opp_sets_won ?? 0}
                </div>
              );
            })()}
            <p className="text-sm text-slate-400">
              {fmtDate(match.date)}
              {match.location && (
                <span className="ml-2 capitalize text-slate-500">· {match.location}</span>
              )}
              {match.conference && (
                <span className="ml-2 text-slate-500">· {match.conference === 'conference' ? 'Conference' : 'Non-Con'}</span>
              )}
              {match.match_type && (
                <span className="ml-2 text-slate-500">· {{ 'reg-season': 'Reg Season', 'tourney': 'Tourney', 'ihsa-playoffs': 'IHSA Playoffs', 'exhibition': 'Exhibition' }[match.match_type]}</span>
              )}
            </p>

            {/* Set scores */}
            {sets && sets.length > 0 && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {sets.filter(s => s.status === 'complete').map((s) => {
                  const won = s.our_score > s.opp_score;
                  return (
                    <div key={s.id} className={`rounded-lg px-3 py-1 text-sm border ${won ? 'bg-emerald-900/30 border-emerald-700/50' : 'bg-red-900/30 border-red-800/50'}`}>
                      <span className={`text-xs mr-1 font-semibold ${won ? 'text-emerald-500' : 'text-red-500'}`}>S{s.set_number}</span>
                      <span className={`font-bold font-mono ${won ? 'text-emerald-300' : 'text-red-300'}`}>{s.our_score}–{s.opp_score}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Export bar */}
            <div className="flex gap-2 mt-3">
              <Button size="sm" variant="secondary" disabled={!stats} onClick={handlePDF}>
                Download PDF
              </Button>
              <Button size="sm" variant="secondary" disabled={!stats} onClick={handleCSV}>
                Download CSV
              </Button>
              <Button size="sm" variant="secondary" disabled={!stats} onClick={handleMaxPreps}>
                MaxPreps
              </Button>
            </div>
          </div>

          {/* Team totals strip */}
          {stats && (
            <div className="mx-4 mb-2 bg-surface rounded-xl p-3 grid grid-cols-4 gap-2 text-center text-sm">
              {[
                { label: 'HIT%',  val: fmtHitting(stats.team.hit_pct) },
                { label: 'ACE%',  val: fmtPct(stats.team.ace_pct)     },
                { label: 'APR',   val: fmtPassRating(stats.team.apr)  },
                { label: 'SO%',   val: fmtPct(stats.rotation.so_pct)  },
              ].map(({ label, val }) => (
                <div key={label}>
                  <div className="text-xs text-slate-400">{label}</div>
                  <div className="font-bold text-primary">{val}</div>
                </div>
              ))}
            </div>
          )}

          {/* Tab bar */}
          <TabBar tabs={TABS} active={tab} onChange={setTab} />

          {/* Tab content */}
          <div className="p-4 md:p-6">
            {tab === 'points' && stats && (
              <PointQualityPanel pq={stats.pointQuality} />
            )}

            {tab === 'serving' && (
              <>
                <div className="flex gap-1 mb-3">
                  {[['all', 'ALL'], ['float', 'FLOAT'], ['top', 'TOP SPIN']].map(([v, label]) => (
                    <button
                      key={v}
                      onClick={() => setServeView(v)}
                      className={`flex-1 py-1.5 rounded text-xs font-bold transition-colors ${
                        serveView === v
                          ? 'bg-slate-600 text-white'
                          : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <StatTable columns={SERVING_COLS[serveView]} rows={playerRows} />
              </>
            )}

            {TAB_COLUMNS[tab] && (
              <StatTable
                columns={TAB_COLUMNS[tab]}
                rows={playerRows}
              />
            )}

            {tab === 'rotation' && stats?.rotation && (
              <div className="space-y-6">
                <RotationRadarChart rotationStats={stats.rotation} />
                <RotationSpotlight rows={rotationRows} />
                <StatTable columns={ROTATION_COLS} rows={rotationRows} />
                <div className="grid grid-cols-2 gap-4 text-sm text-center">
                  <div className="bg-surface rounded-xl p-3">
                    <div className="text-xs text-slate-400">Overall SO%</div>
                    <div className="text-lg font-bold text-primary">{fmtPct(stats.rotation.so_pct)}</div>
                  </div>
                  <div className="bg-surface rounded-xl p-3">
                    <div className="text-xs text-slate-400">Overall BP%</div>
                    <div className="text-lg font-bold text-sky-400">{fmtPct(stats.rotation.bp_pct)}</div>
                  </div>
                </div>
                <CourtHeatMap contacts={contacts} />
              </div>
            )}

            <div className="pt-6">
              <Button size="lg" className="w-full" onClick={() => navigate('/')}>
                Done
              </Button>
            </div>
          </div>
        </>
      )}

      {!loading && !match && (
        <div className="p-4 text-slate-400">Match not found.</div>
      )}
    </div>
  );
}
