import { calcAPR } from '../../stats/formatters';
import { Modal } from '../ui/Modal';

const SR_RATING_COLOR = { 0: 'bg-red-600', 1: 'bg-orange-500', 2: 'bg-yellow-500', 3: 'bg-emerald-500' };

function SRRatingDistBar({ counts, total }) {
  const max = Math.max(...counts, 1);
  return (
    <div className="mt-3 space-y-1.5">
      {[0, 1, 2, 3].map((r) => {
        const pct = total > 0 ? Math.round((counts[r] / total) * 100) : 0;
        return (
          <div key={r} className="flex items-center gap-2">
            <span className={`w-5 h-5 rounded text-xs font-black text-white flex items-center justify-center flex-shrink-0 ${SR_RATING_COLOR[r]}`}>{r}</span>
            <div className="flex-1 bg-slate-700 rounded-full h-3 overflow-hidden">
              <div
                className={`${SR_RATING_COLOR[r]} h-full rounded-full transition-all duration-500`}
                style={{ width: `${(counts[r] / max) * 100}%` }}
              />
            </div>
            <span className="text-xs text-slate-400 tabular-nums w-20 text-right">{counts[r]} · {pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

function StatBox({ label, value }) {
  return (
    <div className="bg-slate-800 rounded-xl p-2 text-center">
      <div className="text-xl font-black text-primary tabular-nums leading-none">{value}</div>
      <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mt-1">{label}</div>
    </div>
  );
}

function ZoneGrid({ zoneCounts, total }) {
  return (
    <div className="space-y-1">
      {[[4, 3, 2], [5, 6, 1]].map((row, i) => (
        <div key={i} className="grid grid-cols-3 gap-1">
          {row.map((zone) => {
            const count = zoneCounts?.[zone] ?? 0;
            const pct   = total ? Math.round(count / total * 100) : 0;
            return (
              <div key={zone} className="bg-slate-800 rounded-lg p-2 text-center">
                <div className="text-[10px] text-slate-500 font-bold">Z{zone}</div>
                <div className="text-lg font-black tabular-nums">{count}</div>
                <div className="text-[10px] text-slate-400">{pct}%</div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function ServeReceiveDetail({ data }) {
  const { players, overallAPR, totalPasses } = data;
  const allPasses = players.flatMap((p) => p.passes);
  const dist = [0, 1, 2, 3].map((r) => ({ r, count: allPasses.filter((v) => v === r).length }));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <StatBox label="Overall APR" value={overallAPR ?? '—'} />
        <StatBox label="Total Passes" value={totalPasses} />
      </div>
      <div className="grid grid-cols-4 gap-2">
        {dist.map(({ r, count }) => <StatBox key={r} label={`P${r}`} value={count} />)}
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-2">Player Breakdown</p>
        <div className="space-y-2">
          {players.map((p) => {
            const tally = p.passes.reduce((acc, v) => { acc[v] = (acc[v] ?? 0) + 1; return acc; }, {});
            const [p0, p1, p2, p3] = [tally[0] ?? 0, tally[1] ?? 0, tally[2] ?? 0, tally[3] ?? 0];
            return (
              <div key={p.id} className="bg-slate-800 rounded-xl px-3 py-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm">#{p.jersey} {p.name}</span>
                  <span className="text-primary font-black tabular-nums">{p.apr ?? '—'} APR</span>
                </div>
                <div className="text-xs text-slate-400 flex gap-3 flex-wrap">
                  <span>{p.passes.length} passes</span>
                  <span>P0: {p0} · P1: {p1} · P2: {p2} · P3: {p3}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PracticeGameDetail({ data }) {
  const { players, sets } = data;
  const totals = players.reduce(
    (acc, p) => ({
      kills:       acc.kills       + (p.kills       ?? 0),
      errors:      acc.errors      + (p.errors      ?? 0),
      aces:        acc.aces        + (p.aces        ?? 0),
      serveErrors: acc.serveErrors + (p.serveErrors ?? 0),
      digs:        acc.digs        + (p.digs        ?? 0),
      blocks:      acc.blocks      + (p.blocks      ?? 0),
      passes:      acc.passes      + (p.passes?.length ?? 0),
    }),
    { kills: 0, errors: 0, aces: 0, serveErrors: 0, digs: 0, blocks: 0, passes: 0 }
  );
  const allPasses  = players.flatMap((p) => p.passes ?? []);
  const overallAPR = calcAPR(allPasses);
  return (
    <div className="space-y-4">
      {sets.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {sets.map((set, i) => (
            <div key={i} className="bg-slate-800 rounded-xl px-3 py-2 text-center min-w-[56px]">
              <div className="text-[10px] text-slate-500 uppercase font-bold">Set {i + 1}</div>
              <div className="font-black tabular-nums">{set.us}–{set.opp}</div>
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-4 gap-2">
        <StatBox label="K"   value={totals.kills}       />
        <StatBox label="E"   value={totals.errors}      />
        <StatBox label="ACE" value={totals.aces}        />
        <StatBox label="SE"  value={totals.serveErrors} />
        <StatBox label="DIG" value={totals.digs}        />
        <StatBox label="BLK" value={totals.blocks}      />
        <StatBox label="REC" value={totals.passes}      />
        <StatBox label="APR" value={overallAPR ?? '—'}  />
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-2">Player Breakdown</p>
        <div className="space-y-2">
          {players.map((p) => {
            const apr = calcAPR(p.passes ?? []);
            return (
              <div key={p.id} className="bg-slate-800 rounded-xl px-3 py-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm">#{p.jersey} {p.name}</span>
                  {apr && <span className="text-primary font-black tabular-nums">{apr} APR</span>}
                </div>
                <div className="text-xs text-slate-400 flex gap-2 flex-wrap">
                  <span>K: {p.kills ?? 0}</span>
                  <span>E: {p.errors ?? 0}</span>
                  <span>Ace: {p.aces ?? 0}</span>
                  <span>SE: {p.serveErrors ?? 0}</span>
                  <span>Dig: {p.digs ?? 0}</span>
                  <span>Blk: {p.blocks ?? 0}</span>
                  {(p.passes?.length ?? 0) > 0 && <span>REC: {p.passes.length}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ServeTrackerDetail({ data }) {
  if (data.mode === 'team') {
    const { stats } = data;
    const inPct = stats.total ? Math.round(stats.inCount / stats.total * 100) : 0;
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-2">
          <StatBox label="Total" value={stats.total}    />
          <StatBox label="In%"   value={`${inPct}%`}   />
          <StatBox label="Net"   value={stats.netCount} />
          <StatBox label="Out"   value={stats.outCount} />
        </div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Zone Breakdown</p>
        <ZoneGrid zoneCounts={stats.zoneCounts} total={stats.total} />
      </div>
    );
  }
  const totals = data.players.reduce(
    (acc, p) => ({
      total:    acc.total    + p.stats.total,
      inCount:  acc.inCount  + p.stats.inCount,
      netCount: acc.netCount + p.stats.netCount,
      outCount: acc.outCount + p.stats.outCount,
    }),
    { total: 0, inCount: 0, netCount: 0, outCount: 0 }
  );
  const inPct = totals.total ? Math.round(totals.inCount / totals.total * 100) : 0;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2">
        <StatBox label="Total" value={totals.total}    />
        <StatBox label="In%"   value={`${inPct}%`}    />
        <StatBox label="Net"   value={totals.netCount} />
        <StatBox label="Out"   value={totals.outCount} />
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-2">Player Breakdown</p>
        <div className="space-y-2">
          {data.players.map((p) => {
            const pct = p.stats.total ? Math.round(p.stats.inCount / p.stats.total * 100) : 0;
            return (
              <div key={p.id} className="bg-slate-800 rounded-xl px-3 py-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm">#{p.jersey} {p.name}</span>
                  <span className="text-primary font-black tabular-nums">{pct}% in</span>
                </div>
                <div className="text-xs text-slate-400 flex gap-3">
                  <span>{p.stats.total} serves</span>
                  <span>Net: {p.stats.netCount}</span>
                  <span>Out: {p.stats.outCount}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function PracticeSessionDetailModal({ session, onClose }) {
  const { tool_type, label, date, data } = session;
  const dateStr = new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const titles  = { practice_game: 'Practice Game', serve_receive: 'Serve Receive', serve_tracker: 'Serve Tracker' };
  return (
    <Modal title={titles[tool_type] ?? label} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <p className="font-semibold text-sm">{label}</p>
          <p className="text-xs text-slate-500">{dateStr}</p>
        </div>
        {tool_type === 'serve_receive'  && <ServeReceiveDetail  data={data} />}
        {tool_type === 'practice_game'  && <PracticeGameDetail  data={data} />}
        {tool_type === 'serve_tracker'  && <ServeTrackerDetail  data={data} />}
      </div>
    </Modal>
  );
}

export { SRRatingDistBar };
