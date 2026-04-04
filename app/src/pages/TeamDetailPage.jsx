import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { useTeam, usePlayers, useSeasons } from '../hooks/useTeamData';
import { useUiStore, selectShowToast } from '../store/uiStore';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { TabBar } from '../components/ui/Tab';
import { RotationFormationEditor } from '../components/match/RotationFormationEditor';
import { PlannedSubsEditor } from '../components/match/PlannedSubsEditor';
import { ROMAN } from '../components/court/CourtZonePicker';
import { SwipeableMatchCard } from '../components/ui/SwipeableMatchCard';
import { PracticeSessionDetailModal, SRRatingDistBar } from '../components/team/PracticeSessionDetailModal';
import { PlayerFormModal } from '../components/team/PlayerFormModal';
import { SeasonFormModal } from '../components/team/SeasonFormModal';
import { RecordFormModal, RECORD_TYPES } from '../components/team/RecordFormModal';
import { SavedLineupModal } from '../components/team/SavedLineupModal';
import { RosterImportModal } from '../components/team/RosterImportModal';

const POS_COLOR = { S: 'blue', OH: 'orange', OPP: 'orange', MB: 'green', L: 'gray', DS: 'gray', RS: 'orange' };

export function TeamDetailPage() {
  const { teamId } = useParams();
  const navigate = useNavigate();
  const id = Number(teamId);
  const team    = useTeam(id);
  const players = usePlayers(id);
  const seasons = useSeasons(id);

  // Memoized splits to avoid O(n) filter on every render
  const activePlayers = useMemo(
    () => (players ?? []).filter((p) => p.is_active).sort((a, b) => Number(a.jersey_number) - Number(b.jersey_number)),
    [players]
  );
  const inactivePlayers = useMemo(
    () => (players ?? []).filter((p) => !p.is_active),
    [players]
  );

  const savedLineups = useLiveQuery(
    () => db.saved_lineups.where('team_id').equals(id).toArray(),
    [id]
  );

  const records = useLiveQuery(
    () => db.records.where('team_id').equals(id).toArray(),
    [id]
  );

  const practiceSessions = useLiveQuery(
    () => db.practice_sessions.where('team_id').equals(id).reverse().toArray(),
    [id]
  );

  const [tab, setTab]             = useState('roster');
  const [selectedSession, setSelectedSession] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [editPlayer, setEditPlayer]           = useState(null);
  const [showSeasonModal, setShowSeasonModal] = useState(false);
  const [editSeason, setEditSeason]           = useState(null);
  const [deletePlayer, setDeletePlayer]       = useState(null);
  const [showLineupModal, setShowLineupModal] = useState(false);
  const [editLineup, setEditLineup]           = useState(null);
  const [deleteLineup, setDeleteLineup]       = useState(null);
  const [expandedLineupId,    setExpandedLineupId]    = useState(null);
  const [expandedLineupTab,   setExpandedLineupTab]   = useState('formations'); // 'formations' | 'subs'
  const [draftFormations,     setDraftFormations]     = useState(null); // { [rotNum]: number[6] | null }
  const [draftPlannedSubs,    setDraftPlannedSubs]    = useState(null); // Array | null
  const [expandedRotation,    setExpandedRotation]    = useState(1);
  const [savingLineupConfig,  setSavingLineupConfig]  = useState(false);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [addRecordType,   setAddRecordType]   = useState(null);
  const [editRecord,      setEditRecord]      = useState(null);
  const [deleteRecord,    setDeleteRecord]    = useState(null);
  const showToast = useUiStore(selectShowToast);

  const removePlayer = async () => {
    try {
      await db.players.update(deletePlayer.id, { is_active: false });
      setDeletePlayer(null);
    } catch (err) {
      showToast(`Remove failed: ${err.message}`, 'error');
    }
  };

  return (
    <div>
      <PageHeader title={team?.name ?? 'Team'} backTo="/teams" />
      {(team?.state || team?.school_year) && (
        <div className="px-4 pb-2 flex gap-2 text-sm text-slate-400">
          {team.state && <span>{team.state}</span>}
          {team.state && team.school_year && <span>·</span>}
          {team.school_year && <span>{team.school_year}</span>}
        </div>
      )}

      <TabBar
        tabs={[
          { value: 'roster',   label: `Roster (${activePlayers.length})` },
          { value: 'lineups',  label: 'Lineups' },
          { value: 'seasons',  label: 'Seasons' },
          { value: 'records',  label: 'Records' },
          { value: 'practice', label: 'Practice' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'roster' && (
        <div className="p-4 md:p-6">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm text-slate-400">{activePlayers.length} active</span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setShowImportModal(true)}>↑ Import</Button>
              <Button size="sm" onClick={() => setShowPlayerModal(true)}>+ Player</Button>
            </div>
          </div>

          {activePlayers.length === 0 ? (
            <EmptyState
              icon="🏐"
              title="No players yet"
              description="Add players to build the roster"
              action={<Button onClick={() => setShowPlayerModal(true)}>Add Player</Button>}
            />
          ) : (
            <div className="space-y-2">
              {activePlayers.map((player) => (
                <SwipeableMatchCard key={player.id} onDeleteConfirm={() => setDeletePlayer(player)}>
                  <div
                    className="bg-surface rounded-xl px-4 py-3 flex items-center gap-3 cursor-pointer active:brightness-110"
                    onClick={() => navigate(`/teams/${teamId}/players/${player.id}`)}
                  >
                    <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center font-mono font-bold text-primary shrink-0">
                      #{player.jersey_number}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">
                        {player.name}
                        {player.is_captain && <span className="ml-1.5 text-xs font-bold text-yellow-400">C</span>}
                      </div>
                      <div className="flex gap-1 flex-wrap items-center">
                        <Badge color={POS_COLOR[player.position] ?? 'gray'}>{player.position}</Badge>
                        {player.secondary_position && (
                          <Badge color={POS_COLOR[player.secondary_position] ?? 'gray'}>{player.secondary_position}</Badge>
                        )}
                        {player.height_ft != null && (
                          <span className="text-xs text-slate-400">{player.height_ft}'{player.height_in != null ? player.height_in : 0}"</span>
                        )}
                        {player.year && <span className="text-xs text-slate-400">{player.year}</span>}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditPlayer(player); }}
                      className="text-slate-400 hover:text-white text-sm shrink-0"
                    >
                      Edit
                    </button>
                  </div>
                </SwipeableMatchCard>
              ))}
            </div>
          )}

          {inactivePlayers.length > 0 && (
            <p className="text-xs text-slate-500 mt-4 text-center">
              {inactivePlayers.length} inactive player{inactivePlayers.length !== 1 ? 's' : ''} hidden
            </p>
          )}
        </div>
      )}

      {tab === 'lineups' && (
        <div className="p-4 md:p-6">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm text-slate-400">{savedLineups?.length ?? 0} saved</span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => navigate(`/teams/${teamId}/optimizer`)}>Optimizer</Button>
              <Button size="sm" onClick={() => setShowLineupModal(true)}>+ Lineup</Button>
            </div>
          </div>

          {(savedLineups ?? []).length === 0 ? (
            <EmptyState
              icon="📋"
              title="No saved lineups"
              description="Save a lineup to quickly load it during match or set setup"
              action={<Button onClick={() => setShowLineupModal(true)}>Save Lineup</Button>}
            />
          ) : (
            <div className="space-y-2">
              {savedLineups.map((sl) => {
                const playerMap = Object.fromEntries(activePlayers.map((p) => [String(p.id), p]));
                const libero = sl.libero_player_id ? playerMap[String(sl.libero_player_id)] : null;
                const isExpanded = expandedLineupId === sl.id;
                const hasFormations = sl.serve_receive_formations && Object.keys(sl.serve_receive_formations).length > 0;
                const hasPlannedSubs = sl.planned_subs && sl.planned_subs.length > 0;

                const openExpand = () => {
                  setExpandedLineupId(sl.id);
                  setExpandedLineupTab('formations');
                  setExpandedRotation(1);
                  setDraftFormations(sl.serve_receive_formations ? { ...sl.serve_receive_formations } : {});
                  setDraftPlannedSubs(sl.planned_subs ? [...sl.planned_subs] : []);
                };

                const handleFormationChange = (rotNum, newFormation) => {
                  setDraftFormations((prev) => {
                    const next = { ...prev };
                    if (newFormation === null) {
                      delete next[rotNum];
                    } else {
                      next[rotNum] = newFormation;
                    }
                    return next;
                  });
                };

                const handleSaveConfig = async () => {
                  setSavingLineupConfig(true);
                  try {
                    const formations = draftFormations && Object.keys(draftFormations).length > 0 ? draftFormations : null;
                    const planned    = draftPlannedSubs && draftPlannedSubs.length > 0 ? draftPlannedSubs : null;
                    await db.saved_lineups.update(sl.id, {
                      serve_receive_formations: formations,
                      planned_subs:             planned,
                    });
                    setExpandedLineupId(null);
                  } finally {
                    setSavingLineupConfig(false);
                  }
                };

                return (
                  <div key={sl.id} className="bg-surface rounded-xl px-4 py-3">
                    {/* Card header */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold truncate">{sl.name}</span>
                        {hasFormations && (
                          <span className="text-[9px] bg-blue-900/50 text-blue-300 border border-blue-700/50 rounded px-1.5 py-0.5 shrink-0">
                            {Object.keys(sl.serve_receive_formations).length} formations
                          </span>
                        )}
                        {hasPlannedSubs && (
                          <span className="text-[9px] bg-emerald-900/50 text-emerald-300 border border-emerald-700/50 rounded px-1.5 py-0.5 shrink-0">
                            {sl.planned_subs.length} subs
                          </span>
                        )}
                      </div>
                      <div className="flex gap-3 shrink-0">
                        <button onClick={() => setEditLineup(sl)} className="text-slate-400 hover:text-white text-sm">Edit</button>
                        <button onClick={() => setDeleteLineup(sl)} className="text-red-400 hover:text-red-300 text-sm">Delete</button>
                        <button
                          onClick={() => isExpanded ? setExpandedLineupId(null) : openExpand()}
                          className="text-slate-400 hover:text-white text-sm"
                        >
                          {isExpanded ? '▲' : '▼'}
                        </button>
                      </div>
                    </div>

                    {/* Serve order rows */}
                    <div className="space-y-0.5">
                      {sl.serve_order.map((pid, i) => {
                        const p = playerMap[pid];
                        return (
                          <div key={i} className="flex items-center gap-2 text-sm">
                            <span className="text-orange-400 font-black w-6 text-right shrink-0">{ROMAN[i]}</span>
                            {p
                              ? <span className="text-slate-200">#{p.jersey_number} {p.name} <span className="text-slate-500">({p.position})</span></span>
                              : <span className="text-slate-600 italic">unassigned</span>
                            }
                          </div>
                        );
                      })}
                      {libero && (
                        <div className="flex items-center gap-2 text-sm mt-1 pt-1 border-t border-slate-700">
                          <span className="text-slate-500 font-semibold w-6 text-right shrink-0">L</span>
                          <span className="text-slate-300">#{libero.jersey_number} {libero.name}</span>
                        </div>
                      )}
                    </div>

                    {/* Expandable section */}
                    {isExpanded && (
                      <div className="mt-4 space-y-3 border-t border-slate-700 pt-3">
                        {/* Sub-tabs */}
                        <div className="flex gap-1">
                          {['formations', 'subs'].map((t) => (
                            <button
                              key={t}
                              onClick={() => setExpandedLineupTab(t)}
                              className={`flex-1 py-1.5 rounded text-xs font-semibold border transition-colors
                                ${expandedLineupTab === t
                                  ? 'bg-primary text-white border-primary'
                                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500'
                                }`}
                            >
                              {t === 'formations' ? 'Serve Rec Formations' : 'Planned Subs'}
                            </button>
                          ))}
                        </div>

                        {expandedLineupTab === 'formations' && (
                          <div className="space-y-3">
                            {/* Rotation tab bar */}
                            <div className="flex gap-1">
                              {[1,2,3,4,5,6].map((r) => {
                                const hasFmt = draftFormations && draftFormations[r];
                                return (
                                  <button
                                    key={r}
                                    onClick={() => setExpandedRotation(r)}
                                    className={`flex-1 py-1 rounded text-xs font-bold border relative transition-colors
                                      ${expandedRotation === r
                                        ? 'bg-slate-600 text-white border-slate-500'
                                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500'
                                      }`}
                                  >
                                    {r}
                                    {hasFmt && (
                                      <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-blue-400" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                            <p className="text-[10px] text-slate-500">
                              Drag players to set serve receive positions for Rotation {expandedRotation}.
                            </p>
                            <RotationFormationEditor
                              key={`${sl.id}-${expandedRotation}`}
                              rotationNum={expandedRotation}
                              serveOrderIds={sl.serve_order.map(String)}
                              players={activePlayers}
                              formation={draftFormations?.[expandedRotation] ?? null}
                              onChange={handleFormationChange}
                            />
                          </div>
                        )}

                        {expandedLineupTab === 'subs' && (
                          <PlannedSubsEditor
                            serveOrderIds={sl.serve_order.map(String)}
                            players={activePlayers}
                            liberoPlayerId={sl.libero_player_id ?? null}
                            plannedSubs={draftPlannedSubs}
                            onChange={setDraftPlannedSubs}
                          />
                        )}

                        {/* Save / Cancel */}
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => setExpandedLineupId(null)}
                            className="flex-1 py-2 rounded text-xs text-slate-400 border border-slate-700 hover:border-slate-500"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveConfig}
                            disabled={savingLineupConfig}
                            className="flex-1 py-2 rounded text-xs font-semibold bg-primary text-white disabled:opacity-50"
                          >
                            {savingLineupConfig ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'seasons' && (
        <div className="p-4 md:p-6">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm text-slate-400">{seasons?.length ?? 0} seasons</span>
            <Button size="sm" onClick={() => setShowSeasonModal(true)}>+ Season</Button>
          </div>

          {seasons?.length === 0 ? (
            <EmptyState
              icon="📅"
              title="No seasons yet"
              description="Add a season to organize your matches"
              action={<Button onClick={() => setShowSeasonModal(true)}>Add Season</Button>}
            />
          ) : (
            <div className="space-y-2">
              {seasons?.map((season) => (
                <div key={season.id} className="bg-surface rounded-xl flex items-center hover:bg-slate-700 transition-colors">
                  <button
                    onClick={() => navigate(`/seasons/${season.id}`)}
                    className="flex-1 px-4 py-3 text-left flex items-center justify-between"
                  >
                    <div>
                      <div className="font-semibold capitalize">{season.name}</div>
                      <div className="text-sm text-slate-400">{season.year}</div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setEditSeason(season)}
                    className="px-3 py-3 text-slate-500 hover:text-slate-300 transition-colors"
                    title="Edit season"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'records' && (
        <div className="p-4 md:p-6 space-y-6">
          {RECORD_TYPES.map(({ value: type, label }) => {
            const typeRecords = (records ?? []).filter((r) => r.type === type);
            return (
              <section key={type}>
                <div className="flex justify-between items-center mb-2">
                  <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">{label}</h2>
                  <Button size="sm" onClick={() => { setAddRecordType(type); setShowRecordModal(true); }}>+ Record</Button>
                </div>
                {typeRecords.length === 0 ? (
                  <p className="text-sm text-slate-600 text-center py-3 bg-surface rounded-xl">No records yet</p>
                ) : (
                  <div className="space-y-2">
                    {typeRecords.map((rec) => (
                      <div key={rec.id} className="bg-surface rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="font-black text-primary text-xl tabular-nums">{rec.value}</span>
                            <span className="font-semibold text-white">{rec.stat}</span>
                          </div>
                          <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5 text-xs text-slate-400">
                            {rec.player_name  && <span>{rec.player_name}</span>}
                            {rec.opponent     && <span>vs. {rec.opponent}</span>}
                            {rec.season_label && <span>{rec.season_label}</span>}
                            {rec.date         && <span>{rec.date}</span>}
                            {rec.notes        && <span className="text-slate-500 italic">{rec.notes}</span>}
                          </div>
                        </div>
                        <div className="flex gap-3 shrink-0">
                          <button onClick={() => setEditRecord(rec)} className="text-slate-400 hover:text-white text-sm">Edit</button>
                          <button onClick={() => setDeleteRecord(rec)} className="text-red-400 hover:text-red-300 text-sm">Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {tab === 'practice' && (
        <div className="p-4 md:p-6 space-y-6">
          {practiceSessions?.length === 0 ? (
            <EmptyState
              icon="🏟️"
              title="No practice sessions yet"
              description="Start a Practice Game, Serve Receive, or Serve Tracker session and save it to see history here"
            />
          ) : (
            <>
              {['practice_game', 'serve_receive', 'serve_tracker'].map((toolType) => {
                const sessions = (practiceSessions ?? []).filter((s) => s.tool_type === toolType);
                if (sessions.length === 0) return null;
                const titles = { practice_game: 'Practice Games', serve_receive: 'Serve Receive', serve_tracker: 'Serve Tracker' };
                const srSummary = toolType === 'serve_receive' ? (() => {
                  const totalPasses = sessions.reduce((s, sess) => s + (sess.data?.totalPasses ?? 0), 0);
                  const sumRatings  = sessions.reduce((s, sess) => {
                    const passes = (sess.data?.players ?? []).flatMap((p) => p.passes ?? []);
                    return s + passes.reduce((a, b) => a + b, 0);
                  }, 0);
                  const apr = totalPasses ? (sumRatings / totalPasses).toFixed(2) : '—';
                  const ratingCounts = [0, 1, 2, 3].map((r) =>
                    sessions.reduce((s, sess) =>
                      s + (sess.data?.players ?? []).flatMap((p) => p.passes ?? []).filter((v) => v === r).length, 0)
                  );
                  const playerMap = {};
                  for (const sess of sessions) {
                    for (const p of sess.data?.players ?? []) {
                      if (!playerMap[p.id]) playerMap[p.id] = { id: p.id, name: p.name, jersey: p.jersey, passes: [] };
                      playerMap[p.id].passes.push(...(p.passes ?? []));
                    }
                  }
                  const topPassers = Object.values(playerMap)
                    .filter((p) => p.passes.length >= 10)
                    .map((p) => ({ ...p, apr: p.passes.reduce((a, b) => a + b, 0) / p.passes.length }))
                    .sort((a, b) => b.apr - a.apr)
                    .slice(0, 5);
                  return { totalPasses, apr, ratingCounts, topPassers };
                })() : null;

                return (
                  <section key={toolType}>
                    <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-2">{titles[toolType]}</h2>
                    {srSummary && (
                      <div className="px-4 py-3 bg-slate-800/60 rounded-xl mb-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-slate-400 uppercase tracking-wide font-semibold">All Sessions</span>
                          <span className="text-sm text-slate-200 font-semibold tabular-nums">
                            {srSummary.apr} APR · {srSummary.totalPasses} reps
                          </span>
                        </div>
                        {srSummary.totalPasses > 0 && <SRRatingDistBar counts={srSummary.ratingCounts} total={srSummary.totalPasses} />}
                        {srSummary.topPassers.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-slate-700">
                            <div className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold mb-1.5">Top Passers</div>
                            {srSummary.topPassers.map((p, i) => (
                              <div key={p.id} className="flex items-center gap-2 py-1">
                                <span className="text-[10px] text-slate-600 w-3 tabular-nums">{i + 1}</span>
                                <span className="text-xs text-slate-400 font-mono w-8">#{p.jersey}</span>
                                <span className="text-sm font-semibold flex-1 truncate">{p.name.split(' ').length > 1 ? `${p.name[0]}. ${p.name.split(' ').pop()}` : p.name}</span>
                                <span className="text-xs text-slate-500 tabular-nums">{p.passes.length} reps</span>
                                <span className="text-sm font-black font-mono text-primary tabular-nums w-10 text-right">{p.apr.toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="space-y-2">
                      {sessions.map((s) => (
                        <div key={s.id} className="bg-surface rounded-xl px-4 py-3 cursor-pointer hover:bg-slate-700 active:scale-[0.98] transition-[transform,background-color] duration-75" onClick={() => setSelectedSession(s)}>
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-semibold text-sm truncate">{s.label}</span>
                            <span className="text-xs text-slate-500 flex-shrink-0">
                              {new Date(s.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 mt-1">
                            {toolType === 'practice_game' && (() => {
                              const { sets, players } = s.data;
                              const setStr = sets.map((st) => `${st.us}-${st.opp}`).join('  ');
                              const totalKills  = players?.reduce((a, p) => a + (p.kills  ?? 0), 0) ?? 0;
                              const totalErrors = players?.reduce((a, p) => a + (p.errors ?? 0), 0) ?? 0;
                              const totalDigs   = players?.reduce((a, p) => a + (p.digs   ?? 0), 0) ?? 0;
                              return <span>{setStr && <span className="mr-2">{setStr}</span>}K: {totalKills}  E: {totalErrors}  Digs: {totalDigs}</span>;
                            })()}
                            {toolType === 'serve_receive' && (() => {
                              const { overallAPR, totalPasses } = s.data;
                              return <span>{overallAPR} APR · {totalPasses} passes</span>;
                            })()}
                            {toolType === 'serve_tracker' && (() => {
                              const d = s.data;
                              const total   = d.mode === 'team' ? d.stats.total : d.players?.reduce((a, p) => a + p.stats.total, 0) ?? 0;
                              const inCount = d.mode === 'team' ? d.stats.inCount : d.players?.reduce((a, p) => a + p.stats.inCount, 0) ?? 0;
                              const pct     = total ? Math.round(inCount / total * 100) : 0;
                              return <span>{total} serves · {pct}% in</span>;
                            })()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
            </>
          )}
        </div>
      )}

      {selectedSession && (
        <PracticeSessionDetailModal session={selectedSession} onClose={() => setSelectedSession(null)} />
      )}

      {showImportModal && (
        <RosterImportModal teamId={id} onClose={() => setShowImportModal(false)} />
      )}

      {(showPlayerModal || editPlayer) && (
        <PlayerFormModal
          teamId={id}
          player={editPlayer}
          onClose={() => { setShowPlayerModal(false); setEditPlayer(null); }}
        />
      )}

      {(showSeasonModal || editSeason) && (
        <SeasonFormModal
          teamId={id}
          season={editSeason ?? undefined}
          onClose={() => { setShowSeasonModal(false); setEditSeason(null); }}
        />
      )}

      {(showLineupModal || editLineup) && (
        <SavedLineupModal
          teamId={id}
          savedLineup={editLineup}
          activePlayers={activePlayers}
          onClose={() => { setShowLineupModal(false); setEditLineup(null); }}
        />
      )}

      {deleteLineup && (
        <ConfirmDialog
          title="Delete Lineup"
          message={`Delete "${deleteLineup.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={async () => { await db.saved_lineups.delete(deleteLineup.id); setDeleteLineup(null); }}
          onCancel={() => setDeleteLineup(null)}
        />
      )}

      {deletePlayer && (
        <ConfirmDialog
          title="Remove Player"
          message={`Remove ${deletePlayer.name} from the active roster?`}
          confirmLabel="Remove"
          danger
          onConfirm={removePlayer}
          onCancel={() => setDeletePlayer(null)}
        />
      )}

      {(showRecordModal || editRecord) && (
        <RecordFormModal
          teamId={id}
          record={editRecord}
          type={addRecordType}
          onClose={() => { setShowRecordModal(false); setAddRecordType(null); setEditRecord(null); }}
        />
      )}

      {deleteRecord && (
        <ConfirmDialog
          title="Delete Record"
          message={`Delete this ${deleteRecord.stat} record? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={async () => { await db.records.delete(deleteRecord.id); setDeleteRecord(null); }}
          onCancel={() => setDeleteRecord(null)}
        />
      )}
    </div>
  );
}
