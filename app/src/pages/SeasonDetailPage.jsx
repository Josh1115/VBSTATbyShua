import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { MATCH_STATUS } from '../constants';
import { fmtDate } from '../stats/formatters';
import { computeMatchStats } from '../stats/engine';
import { exportMaxPrepsCSV } from '../stats/export';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { SwipeableMatchCard } from '../components/ui/SwipeableMatchCard';

async function deleteMatch(matchId) {
  const sets = await db.sets.where('match_id').equals(matchId).toArray();
  const setIds = sets.map((s) => s.id);
  await Promise.all([
    db.contacts.where('match_id').equals(matchId).delete(),
    db.rallies.where('set_id').anyOf(setIds).delete(),
    db.lineups.where('set_id').anyOf(setIds).delete(),
    db.substitutions.where('set_id').anyOf(setIds).delete(),
  ]);
  await db.sets.where('match_id').equals(matchId).delete();
  await db.matches.delete(matchId);
}

export function SeasonDetailPage() {
  const { seasonId } = useParams();
  const navigate = useNavigate();
  const id = Number(seasonId);

  const data = useLiveQuery(async () => {
    const season = await db.seasons.get(id);
    if (!season) return null;
    const team = await db.teams.get(season.team_id);
    const rawMatches = await db.matches.where('season_id').equals(id).reverse().sortBy('date');

    // Join opponent names
    const oppIds = [...new Set(rawMatches.map((m) => m.opponent_id).filter(Boolean))];
    const opps = oppIds.length ? await db.opponents.bulkGet(oppIds) : [];
    const oppMap = Object.fromEntries(opps.filter(Boolean).map((o) => [o.id, o.name]));

    const matches = rawMatches.map((m) => ({
      ...m,
      opponent_name: m.opponent_name ?? oppMap[m.opponent_id] ?? 'Unknown',
    }));

    const players = await db.players.where('team_id').equals(season.team_id).toArray();
    const playerNames   = Object.fromEntries(players.map((p) => [p.id, p.name]));
    const playerJerseys = Object.fromEntries(players.map((p) => [p.id, p.jersey_number ?? '']));

    return { season, team, matches, playerNames, playerJerseys };
  }, [id]);

  // Schedule-game modal state (must be before early return)
  const [confirmDelete, setConfirmDelete] = useState(null);

  const [schedOpen,      setSchedOpen]      = useState(false);
  const [editMatchId,    setEditMatchId]    = useState(null);
  const [schedOpp,       setSchedOpp]       = useState('');
  const [schedOppAbbr,   setSchedOppAbbr]   = useState('');
  const [schedDate,      setSchedDate]      = useState(() => new Date().toISOString().slice(0, 10));
  const [schedLoc,       setSchedLoc]       = useState('home');
  const [schedConf,      setSchedConf]      = useState('non-con');
  const [schedMatchType, setSchedMatchType] = useState('reg-season');
  const [schedSaving,    setSchedSaving]    = useState(false);

  if (!data) return null;
  const { season, team, matches, playerNames, playerJerseys } = data;

  async function handleMaxPreps(e, matchId) {
    e.stopPropagation();
    const stats = await computeMatchStats(matchId);
    exportMaxPrepsCSV(stats.players, playerNames, playerJerseys, stats.setsPlayed, `match-${matchId}-maxpreps.txt`);
  }

  function resetSchedForm() {
    setEditMatchId(null);
    setSchedOpp('');
    setSchedOppAbbr('');
    setSchedDate(new Date().toISOString().slice(0, 10));
    setSchedLoc('home');
    setSchedConf('non-con');
    setSchedMatchType('reg-season');
    setSchedOpen(false);
  }

  function openEditMatch(match) {
    setEditMatchId(match.id);
    setSchedOpp(match.opponent_name ?? '');
    setSchedOppAbbr(match.opponent_abbr ?? '');
    setSchedDate(match.date ? match.date.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setSchedLoc(match.location ?? 'home');
    setSchedConf(match.conference ?? 'non-con');
    setSchedMatchType(match.match_type ?? 'reg-season');
    setSchedOpen(true);
  }

  async function handleScheduleGame() {
    if (!schedOpp.trim()) return;
    setSchedSaving(true);
    try {
      let oppRecord = await db.opponents.where('name').equals(schedOpp.trim()).first();
      if (!oppRecord) {
        const oppId = await db.opponents.add({ name: schedOpp.trim() });
        oppRecord = { id: oppId, name: schedOpp.trim() };
      }
      const fields = {
        opponent_id:   oppRecord.id,
        opponent_name: oppRecord.name,
        opponent_abbr: schedOppAbbr.trim().toUpperCase() || null,
        date:          schedDate ? new Date(schedDate + 'T12:00:00').toISOString() : new Date().toISOString(),
        location:      schedLoc,
        conference:    schedConf,
        match_type:    schedMatchType,
      };
      if (editMatchId) {
        await db.matches.update(editMatchId, fields);
      } else {
        await db.matches.add({ season_id: id, status: MATCH_STATUS.SCHEDULED, ...fields });
      }
      resetSchedForm();
    } finally {
      setSchedSaving(false);
    }
  }

  const wins = matches.filter(
    (m) => m.status === MATCH_STATUS.COMPLETE && (m.our_sets_won ?? 0) > (m.opp_sets_won ?? 0)
  ).length;
  const losses = matches.filter(
    (m) => m.status === MATCH_STATUS.COMPLETE && (m.our_sets_won ?? 0) < (m.opp_sets_won ?? 0)
  ).length;

  return (
    <div>
      <PageHeader title={season.name ?? String(season.year)} backTo="/seasons" />

      <div className="p-4 md:p-6 space-y-4">
        {/* Season info card */}
        <div className="bg-surface rounded-xl px-4 py-3 flex items-center justify-between">
          <div>
            <div className="font-semibold">{team?.name ?? '—'}</div>
            <div className="text-sm text-slate-400">{season.year}</div>
          </div>
          {matches.some((m) => m.status === MATCH_STATUS.COMPLETE) && (
            <div className="text-right">
              <div className="font-mono font-bold text-lg">{wins}–{losses}</div>
              <div className="text-xs text-slate-400">W–L</div>
            </div>
          )}
        </div>

        {/* Matches */}
        <section>
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
              Matches ({matches.length})
            </h2>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setSchedOpen(true)}>+ Schedule</Button>
              <Button size="sm" onClick={() => navigate(`/matches/new?season=${id}`)}>+ Match</Button>
            </div>
          </div>

          {matches.length === 0 ? (
            <EmptyState
              icon="🏐"
              title="No matches yet"
              description="Record the first match for this season"
              action={<Button onClick={() => navigate(`/matches/new?season=${id}`)}>New Match</Button>}
            />
          ) : (
            <div className="space-y-2">
              {matches.map((match) => {
                if (match.status === MATCH_STATUS.SCHEDULED) {
                  return (
                    <SwipeableMatchCard
                      key={match.id}
                      onDeleteConfirm={() => setConfirmDelete(match)}
                    >
                      <div className="w-full bg-surface rounded-xl px-4 py-3 flex items-center justify-between">
                        <div>
                          <div className="font-semibold">{match.opponent_name}</div>
                          <div className="text-xs text-slate-400">{fmtDate(match.date)}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openEditMatch(match)}
                            className="text-xs font-semibold px-2.5 py-1 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => navigate(`/matches/new?season=${id}&match=${match.id}`)}
                            className="text-xs font-semibold px-2.5 py-1 rounded bg-amber-900/40 text-amber-400 hover:bg-amber-900/60 transition-colors"
                          >
                            ▶ Start
                          </button>
                        </div>
                      </div>
                    </SwipeableMatchCard>
                  );
                }
                return (
                  <button
                    key={match.id}
                    onClick={() => navigate(
                      match.status === MATCH_STATUS.COMPLETE
                        ? `/matches/${match.id}/summary`
                        : `/matches/${match.id}/live`
                    )}
                    className="w-full bg-surface rounded-xl px-4 py-3 text-left flex items-center justify-between hover:bg-slate-700 transition-colors"
                  >
                    <div>
                      <div className="font-semibold">{match.opponent_name}</div>
                      <div className="text-xs text-slate-400">{fmtDate(match.date)}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      {match.status === MATCH_STATUS.COMPLETE && (
                        <button
                          onClick={(e) => handleMaxPreps(e, match.id)}
                          className="text-xs font-bold px-2 py-1 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
                        >
                          MaxPreps
                        </button>
                      )}
                      <div className="text-right flex flex-col items-end gap-0.5">
                        <div className="flex items-center gap-1.5">
                          {match.status === MATCH_STATUS.COMPLETE && (() => {
                            const won = (match.our_sets_won ?? 0) > (match.opp_sets_won ?? 0);
                            return (
                              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${won ? 'bg-emerald-900/60 text-emerald-400' : 'bg-red-900/60 text-red-400'}`}>
                                {won ? 'W' : 'L'}
                              </span>
                            );
                          })()}
                          <span className="text-sm font-mono">{match.our_sets_won ?? 0}–{match.opp_sets_won ?? 0}</span>
                        </div>
                        <div className={`text-xs ${match.status === MATCH_STATUS.IN_PROGRESS ? 'text-primary' : 'text-slate-400'}`}>
                          {match.status === MATCH_STATUS.IN_PROGRESS ? 'Live'
                            : match.status === MATCH_STATUS.COMPLETE ? 'Final'
                            : 'Setup'}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete Match?"
          message={`Delete scheduled match vs. ${confirmDelete.opponent_name ?? 'Unknown'}? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            await deleteMatch(confirmDelete.id);
            setConfirmDelete(null);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Schedule Game Modal */}
      {schedOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-bg w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-6 space-y-4 shadow-2xl">
            <h2 className="text-lg font-bold">{editMatchId ? 'Edit Scheduled Game' : 'Schedule Game'}</h2>

            {/* Opponent */}
            <div>
              <label className="block text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wide">Opponent</label>
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={schedOpp}
                  onChange={(e) => setSchedOpp(e.target.value)}
                  placeholder="Opponent team name"
                  className="flex-1 bg-surface border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary placeholder:text-slate-600"
                  autoFocus
                />
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wide leading-none">Abbr</span>
                  <input
                    type="text"
                    value={schedOppAbbr}
                    onChange={(e) => setSchedOppAbbr(e.target.value.toUpperCase().slice(0, 3))}
                    placeholder="OPP"
                    maxLength={3}
                    className="w-[56px] bg-surface border border-slate-600 text-white rounded-lg px-2 py-2 text-sm text-center font-bold uppercase tracking-widest focus:outline-none focus:border-primary placeholder:text-slate-600"
                  />
                </div>
              </div>
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wide">Date</label>
              <input
                type="date"
                value={schedDate}
                onChange={(e) => setSchedDate(e.target.value)}
                className="w-full bg-surface border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              />
            </div>

            {/* Location */}
            <div>
              <label className="block text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wide">Location</label>
              <div className="flex gap-2">
                {['home', 'away', 'neutral'].map((loc) => (
                  <button
                    key={loc}
                    onClick={() => setSchedLoc(loc)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors
                      ${schedLoc === loc
                        ? 'bg-primary text-white border-primary'
                        : 'bg-surface text-slate-300 border-slate-600 hover:border-slate-400'
                      }`}
                  >
                    {loc.charAt(0).toUpperCase() + loc.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Conference */}
            <div>
              <label className="block text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wide">Opponent Type</label>
              <div className="flex gap-2">
                {[['conference', 'Conference'], ['non-con', 'Non-Con']].map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setSchedConf(val)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors
                      ${schedConf === val
                        ? 'bg-primary text-white border-primary'
                        : 'bg-surface text-slate-300 border-slate-600 hover:border-slate-400'
                      }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Match Type */}
            <div>
              <label className="block text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wide">Match Type</label>
              <div className="flex gap-2">
                {[['reg-season', 'Reg Season'], ['tourney', 'Tourney'], ['ihsa-playoffs', 'IHSA Playoffs'], ['exhibition', 'Exhibition']].map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setSchedMatchType(val)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors
                      ${schedMatchType === val
                        ? 'bg-primary text-white border-primary'
                        : 'bg-surface text-slate-300 border-slate-600 hover:border-slate-400'
                      }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button variant="secondary" className="flex-1" onClick={resetSchedForm}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                disabled={!schedOpp.trim() || schedSaving}
                onClick={handleScheduleGame}
              >
                {schedSaving ? 'Saving…' : 'Save Game'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
