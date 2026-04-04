import { computeMilestone } from '../../../hooks/useRecordAlerts';
import { TRACKABLE_STATS } from '../../../constants';

const MILESTONE_BADGE = {
  beat:     { icon: '🏆', cls: 'bg-yellow-500/20 border-yellow-500 text-yellow-300', short: 'RECORD' },
  tie:      { icon: '⚡', cls: 'bg-slate-400/20 border-slate-300 text-slate-200',   short: 'TIED'   },
  one_away: { icon: '🔥', cls: 'bg-orange-500/20 border-orange-400 text-orange-300', short: '1 AWAY' },
  pct90:    { icon: '▲',  cls: 'bg-yellow-600/20 border-yellow-500 text-yellow-400', short: '90%+'   },
  pct80:    { icon: '▲',  cls: 'bg-green-600/20  border-green-500  text-green-400',  short: '80%+'   },
};

function RecordRow({ record, playerStats, teamStats }) {
  const statDef = TRACKABLE_STATS.find((s) => s.key === record.stat);
  if (!statDef) return null;
  const recordVal = parseFloat(record.value);
  if (isNaN(recordVal) || recordVal <= 0) return null;

  const currentVal = record.type === 'team_match'
    ? (teamStats?.[statDef.key] ?? 0)
    : (playerStats?.[record.player_id]?.[statDef.key] ?? 0);

  const milestone = computeMilestone(currentVal, recordVal, statDef.type);
  const badge     = milestone ? MILESTONE_BADGE[milestone] : null;
  const fillPct   = Math.min(currentVal / recordVal, 1);

  const barCls =
    milestone === 'beat'     ? 'bg-yellow-400' :
    milestone === 'tie'      ? 'bg-slate-300'  :
    milestone === 'one_away' ? 'bg-orange-400' :
    milestone === 'pct90'    ? 'bg-yellow-500' :
    milestone === 'pct80'    ? 'bg-green-500'  :
    'bg-slate-600';

  const displayCurr = statDef.type === 'rate' ? Number(currentVal).toFixed(3) : currentVal;
  const displayRec  = statDef.type === 'rate' ? recordVal.toFixed(3) : recordVal;
  const remaining   = statDef.type === 'count' && milestone !== 'beat' && milestone !== 'tie'
    ? Math.ceil(recordVal - currentVal)
    : null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="text-xs text-slate-400 truncate">{statDef.label}</span>
          {badge && (
            <span className={`flex-shrink-0 text-[9px] font-black px-1 py-0.5 rounded border ${badge.cls}`}>
              {badge.icon} {badge.short}
            </span>
          )}
        </div>
        <div className="flex-shrink-0 flex items-baseline gap-1">
          <span className="font-black text-white tabular-nums">{displayCurr}</span>
          <span className="text-slate-500 text-xs">/ {displayRec}</span>
          {remaining !== null && remaining > 0 && (
            <span className="text-slate-600 text-[10px]">−{remaining}</span>
          )}
        </div>
      </div>
      <div className="h-1.5 bg-slate-700/80 rounded-full overflow-hidden">
        <div
          className={`h-full ${barCls} rounded-full transition-all duration-300`}
          style={{ width: `${Math.round(fillPct * 100)}%` }}
        />
      </div>
    </div>
  );
}

export function RecordsProgressPanel({ records, playerStats, teamStats, lineup, roster }) {
  if (!(records ?? []).length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-8">
        <span className="text-3xl">📋</span>
        <p className="text-slate-300 font-semibold text-sm">No records set for this team</p>
        <p className="text-slate-500 text-xs">
          Go to Teams → [Team] → Records to add records. Individual Match and Team Match records show live progress here.
        </p>
      </div>
    );
  }

  // Build player info from roster + current lineup overrides
  const playerInfo = {};
  for (const p of roster ?? []) playerInfo[p.id] = { name: p.name, jersey: p.jersey_number };
  for (const sl of lineup) {
    if (sl.playerId) {
      playerInfo[sl.playerId] = {
        name:   playerInfo[sl.playerId]?.name   ?? sl.playerName,
        jersey: playerInfo[sl.playerId]?.jersey ?? sl.jersey,
      };
    }
  }

  const lineupPlayerIds = new Set(lineup.map((sl) => sl.playerId).filter(Boolean));

  // Separate live-trackable (match) records from season/reference records
  const liveRecords   = (records ?? []).filter((r) => r.type === 'individual_match' || r.type === 'team_match');
  const seasonRecords = (records ?? []).filter((r) => r.type === 'individual_season' || r.type === 'team_season');

  // Group live records: individual by player, team together
  const byPlayer = {};
  const teamMatchRecs = [];
  for (const r of liveRecords) {
    if (r.type === 'team_match') {
      teamMatchRecs.push(r);
    } else {
      const key = String(r.player_id ?? 'unknown');
      if (!byPlayer[key]) byPlayer[key] = [];
      byPlayer[key].push(r);
    }
  }

  // Sort players: on-court first, then bench
  const sortedPlayerIds = Object.keys(byPlayer).sort((a, b) => {
    const aIn = lineupPlayerIds.has(Number(a)) ? 0 : 1;
    const bIn = lineupPlayerIds.has(Number(b)) ? 0 : 1;
    return aIn - bIn;
  });

  return (
    <div className="p-4 space-y-4">

      {/* ── Live-tracked match records ── */}
      {liveRecords.length === 0 && (
        <p className="text-xs text-slate-500 text-center py-2">
          No Individual Match or Team Match records — add them in Teams → Records to see live progress.
        </p>
      )}

      {sortedPlayerIds.map((playerId) => {
        const id   = Number(playerId);
        const info = playerInfo[id];
        const recs = byPlayer[playerId];
        const lastName = info?.name ? info.name.split(' ').pop() : (recs[0]?.player_name ?? 'Player');
        const isOnCourt = lineupPlayerIds.has(id);
        return (
          <div key={playerId} className="bg-slate-800/50 rounded-xl p-3 space-y-3">
            <div className="flex items-center gap-2">
              {info?.jersey && <span className="text-xs font-mono text-slate-500">#{info.jersey}</span>}
              <span className="text-sm font-bold text-white">{lastName}</span>
              {!isOnCourt && <span className="text-[10px] text-slate-600 font-semibold uppercase tracking-wide">bench</span>}
            </div>
            {recs.map((r) => (
              <RecordRow key={r.id} record={r} playerStats={playerStats} teamStats={teamStats} />
            ))}
          </div>
        );
      })}

      {teamMatchRecs.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl p-3 space-y-3">
          <span className="text-sm font-bold text-white">Team</span>
          {teamMatchRecs.map((r) => (
            <RecordRow key={r.id} record={r} playerStats={playerStats} teamStats={teamStats} />
          ))}
        </div>
      )}

      {/* ── Season / reference records ── */}
      {seasonRecords.length > 0 && (
        <>
          <div className="border-t border-slate-700/60 pt-3">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold mb-3">Season Records (reference)</p>
            <div className="space-y-2">
              {seasonRecords.map((r) => {
                const isTeam   = r.type === 'team_season';
                const nameStr  = isTeam
                  ? 'Team'
                  : r.player_name ?? playerInfo[r.player_id]?.name ?? 'Player';
                const lastName = nameStr.split(' ').pop();
                const jersey   = !isTeam ? playerInfo[r.player_id]?.jersey : null;
                return (
                  <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 bg-slate-800/40 rounded-lg">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {jersey && <span className="text-xs font-mono text-slate-500 flex-shrink-0">#{jersey}</span>}
                      <span className="text-sm text-slate-300 font-semibold truncate">{lastName}</span>
                      <span className="text-xs text-slate-500 truncate">{r.stat}</span>
                    </div>
                    <div className="flex-shrink-0 flex items-baseline gap-1">
                      <span className="font-black text-white tabular-nums">{r.value}</span>
                      {r.opponent && <span className="text-[10px] text-slate-600">vs {r.opponent}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
