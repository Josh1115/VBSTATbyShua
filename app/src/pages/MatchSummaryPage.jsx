import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useUiStore, selectShowToast } from '../store/uiStore';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { computeMatchStats,
         computePlayerStats, computeTeamStats, computeRotationStats, computePointQuality,
         computeServeZoneStats, computeISvsOOS, computeTransitionAttack,
         computePQ, computeSetWinProb, computeMatchWinProb,
         aggregateXKTeamStats } from '../stats/engine';
import { getRalliesForMatch } from '../stats/queries';
import { exportMatchCSV, exportMatchPDF, exportMaxPrepsCSV } from '../stats/export';
import { fmtHitting, fmtPassRating, fmtPct, fmtCount, fmtDate } from '../stats/formatters';
import { ROTATION_COLS, SERVING_COLS, TAB_COLUMNS } from '../stats/columns';
import { PageHeader } from '../components/layout/PageHeader';
import { TabBar } from '../components/ui/Tab';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { StatTable } from '../components/stats/StatTable';
import { ServeReticlePlot, PlayerServePlacementCard } from '../components/stats/ServeReticlePlot';
import { RotationSpotlight } from '../components/stats/RotationSpotlight';
import { PointQualityPanel } from '../components/stats/PointQualityPanel';
import { RotationRadarChart } from '../components/charts/RotationRadarChart';
import { CourtHeatMap } from '../components/charts/CourtHeatMap';
import { RotationBarChart } from '../components/charts/RotationBarChart';
import { SubToggle } from '../components/stats/SubToggle';
import { SetTrendsChart } from '../components/stats/SetTrendsChart';
import { RallyHistogram } from '../components/stats/RallyHistogram';
import { PlayerComparison } from '../components/stats/PlayerComparison';
import { TeamComparison } from '../components/stats/TeamComparison';
import { ReviseSetModal } from '../components/match/ReviseSetModal';
import { BoxScoreEntryModal } from '../components/match/BoxScoreEntryModal';
import { VideoCorrectionsModal } from '../components/match/VideoCorrectionsModal';
import { Modal } from '../components/ui/Modal';
import { FORMAT } from '../constants';
import { getStorageItem, STORAGE_KEYS } from '../utils/storage';
import { useSwipe } from '../hooks/useSwipe';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer,
} from 'recharts';

// Zone layout (server's perspective, top = back row)
//   [1, 6, 5]
//   [2, 3, 4]
const ZONE_ROWS = [[1, 6, 5], [2, 3, 4]];

function ServeZoneGrid({ zones }) {
  const total = Object.values(zones).reduce((s, z) => s + z.sa, 0);
  if (!total) return null;
  return (
    <div className="mt-4">
      <p className="text-xs text-slate-400 mb-2 font-semibold uppercase tracking-wide">Serve Zone Distribution</p>
      <div className="grid grid-rows-2 gap-1">
        {ZONE_ROWS.map((row, ri) => (
          <div key={ri} className="grid grid-cols-3 gap-1">
            {row.map((z) => {
              const s = zones[z];
              const pct = total ? Math.round(s.sa / total * 100) : 0;
              const intensity = Math.min(pct / 40, 1); // saturate at 40%
              return (
                <div
                  key={z}
                  className="rounded-lg p-2 text-center relative overflow-hidden"
                  style={{ background: `rgba(249,115,22,${0.05 + intensity * 0.35})`, border: '1px solid rgba(249,115,22,0.2)' }}
                >
                  <div className="text-[10px] text-slate-400 font-bold">Z{z}</div>
                  <div className="text-base font-black text-white">{s.sa}</div>
                  <div className="text-[9px] text-slate-400">{pct}%</div>
                  {s.ace > 0 && <div className="text-[9px] text-yellow-400">{s.ace} ACE</div>}
                  {s.se  > 0 && <div className="text-[9px] text-red-400">{s.se} ERR</div>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Win Probability Timeline ─────────────────────────────────────────────────

function buildWinProbTimeline(rallies, sets, format) {
  if (!rallies?.length || !sets?.length) return [];
  const { p, q }    = computePQ(rallies);
  const setsToWin   = format === FORMAT.BEST_OF_3 ? 2 : 3;
  const decidingNum = format === FORMAT.BEST_OF_3 ? 3 : 5;
  // Average win prob for a regular future set (both possible serve starts)
  const pFutureSet  = (computeSetWinProb(p, q, 0, 0, 'us', false) +
                       computeSetWinProb(p, q, 0, 0, 'them', false)) / 2;
  // Separate estimate for the deciding set (target 15 vs 25)
  const pDeciderSet = (computeSetWinProb(p, q, 0, 0, 'us', true) +
                       computeSetWinProb(p, q, 0, 0, 'them', true)) / 2;

  const sortedSets  = [...sets].sort((a, b) => a.set_number - b.set_number);
  const rallysBySet = new Map();
  for (const r of rallies) {
    if (!rallysBySet.has(r.set_id)) rallysBySet.set(r.set_id, []);
    rallysBySet.get(r.set_id).push(r);
  }

  const points = [];
  let ourSets = 0, oppSets = 0, x = 0;

  for (const set of sortedSets) {
    const setRallies = (rallysBySet.get(set.id) ?? []).sort((a, b) => a.rally_number - b.rally_number);
    if (!setRallies.length) continue;
    const isDecider = set.set_number === decidingNum;
    let s1 = 0, s2 = 0;

    for (const rally of setRallies) {
      const sp  = computeSetWinProb(p, q, s1, s2, rally.serve_side, isDecider);
      const mp  = computeMatchWinProb(sp, pFutureSet, ourSets, oppSets, setsToWin, pDeciderSet);
      points.push({ x, pct: Math.round(mp * 100), set: set.set_number });
      x++;
      // Guard against malformed point_winner — only count explicit 'us'/'them' values
      if (rally.point_winner === 'us') s1++;
      else if (rally.point_winner === 'them') s2++;
    }
    // Use the set record's authoritative scores and status rather than rally-reconstructed
    // tallies — rally writes are best-effort and can be missing if the DB write failed.
    if (set.status === 'complete') {
      if (set.our_score > set.opp_score) ourSets++;
      else oppSets++;
      // Add a terminal data point once the match result is decided
      if (ourSets >= setsToWin || oppSets >= setsToWin) {
        points.push({ x, pct: ourSets >= setsToWin ? 100 : 0, set: set.set_number });
        break;
      }
    }
  }

  return points;
}

function WinProbChart({ rawRallies, sets, format }) {
  const data = useMemo(
    () => buildWinProbTimeline(rawRallies, sets, format),
    [rawRallies, sets, format]
  );

  if (data.length < 2) {
    return <p className="text-center text-slate-500 text-sm py-8">Not enough rally data</p>;
  }

  // Find set boundaries for reference lines
  const setBoundaries = [];
  let prev = data[0]?.set;
  for (const d of data) {
    if (d.set !== prev) { setBoundaries.push(d.x); prev = d.set; }
  }

  return (
    <div>
      <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-3">Match Win Probability</p>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis dataKey="x" hide />
          <YAxis domain={[0, 100]} ticks={[25, 50, 75]} tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={v => `${v}%`} />
          <ReferenceLine y={50} stroke="#334155" strokeDasharray="4 4" />
          {setBoundaries.map(x => (
            <ReferenceLine key={x} x={x} stroke="#334155" strokeDasharray="2 4" label={{ value: `S${data.find(d => d.x === x)?.set}`, fill: '#475569', fontSize: 9, position: 'insideTopLeft' }} />
          ))}
          <Tooltip
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
            formatter={(val) => [`${val}%`, 'Win Prob']}
            labelFormatter={() => ''}
          />
          <Line
            type="monotone" dataKey="pct" stroke="#f97316" strokeWidth={2} dot={false}
            activeDot={{ r: 3, fill: '#f97316' }}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="flex justify-between text-[10px] text-slate-500 mt-1 px-1">
        <span>Start</span><span>End</span>
      </div>
    </div>
  );
}

const TABS = [
  { value: 'scoring',   label: 'Scoring'   },
  { value: 'trends',    label: 'Trends'    },
  { value: 'serving',   label: 'Serving'   },
  { value: 'passing',   label: 'Passing'   },
  { value: 'attacking', label: 'Attacking' },
  { value: 'blocking',  label: 'Blocking'  },
  { value: 'defense',   label: 'Defense'   },
  { value: 'ver',       label: 'VER'       },
  { value: 'compare',   label: 'Compare'   },
  { value: 'opponent',  label: 'Opp'       },
];
const TAB_VALUES = TABS.map(t => t.value);

// ── Match Notes ──────────────────────────────────────────────────────────────

function MatchNotes({ matchId, initialNotes }) {
  const [notes, setNotes] = useState(initialNotes ?? '');
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  function handleChange(e) {
    const v = e.target.value;
    setNotes(v);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      db.matches.update(matchId, { notes: v });
    }, 600);
  }

  return (
    <div className="px-4 mt-3">
      <label className="block text-xs text-slate-400 mb-1 font-medium">Coach Notes</label>
      <textarea
        value={notes}
        onChange={handleChange}
        placeholder="Add notes about this match…"
        className="w-full bg-surface border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 resize-none focus:outline-none focus:border-primary/60 transition-colors"
        rows={3}
      />
    </div>
  );
}

// ── Score Timeline Chart ─────────────────────────────────────────────────────

function SetScoreChart({ setData, setLabel, teamName, opponentName, maxScore }) {
  return (
    <div>
      <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">{setLabel}</p>
      <ResponsiveContainer width="100%" height={130}>
        <LineChart data={setData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
          <XAxis dataKey="x" hide />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} domain={[0, 25]} ticks={[5, 10, 15, 20, 25]} interval={0} allowDecimals={false} />
          <Tooltip
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
            labelStyle={{ color: '#cbd5e1' }}
            formatter={(val, name) => [val, name === 'us' ? (teamName || 'Us') : (opponentName || 'Opp')]}
            labelFormatter={() => ''}
          />
          <Line type="monotone" dataKey="us"  stroke="#f97316" strokeWidth={2} dot={false} name="us" />
          <Line type="monotone" dataKey="opp" stroke="#94a3b8" strokeWidth={2} dot={false} name="opp" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ScoreTimeline({ rawRallies, sets, teamName, opponentName }) {
  const setCharts = useMemo(() => {
    if (!rawRallies?.length || !sets?.length) return [];
    return [...sets]
      .filter(s => s.status !== 'scheduled')
      .sort((a, b) => a.set_number - b.set_number)
      .map(set => {
        const setRallies = rawRallies
          .filter(r => r.set_id === set.id)
          .sort((a, b) => a.rally_number - b.rally_number);
        if (!setRallies.length) return null;

        const pts = [{ x: 0, us: 0, opp: 0 }];
        let us = 0, opp = 0;
        for (const r of setRallies) {
          if (r.point_winner === 'us') us++;
          else opp++;
          pts.push({ x: pts.length, us, opp });
        }
        const maxScore = Math.max(...pts.map(d => Math.max(d.us, d.opp)), 1);
        return { set, pts, maxScore };
      })
      .filter(Boolean);
  }, [rawRallies, sets]);

  if (!setCharts.length) return <p className="text-slate-500 text-sm text-center py-4">No rally data yet.</p>;

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Score Timeline</p>
      <div className="flex gap-4 mb-1">
        <span className="flex items-center gap-1 text-xs text-slate-400">
          <span className="inline-block w-4 h-0.5 bg-orange-400 rounded" />
          {teamName || 'Us'}
        </span>
        <span className="flex items-center gap-1 text-xs text-slate-400">
          <span className="inline-block w-4 h-0.5 bg-slate-400 rounded" />
          {opponentName || 'Opp'}
        </span>
      </div>
      {setCharts.map(({ set, pts, maxScore }) => (
        <SetScoreChart
          key={set.id}
          setData={pts}
          setLabel={`Set ${set.set_number}`}
          teamName={teamName}
          opponentName={opponentName}
          maxScore={maxScore}
        />
      ))}
    </div>
  );
}

// ── Share Card ───────────────────────────────────────────────────────────────

const ShareCard = ({ cardRef, match, sets, stats, fmtDate }) => {
  if (!match || !stats) return null;
  const won = (match.our_sets_won ?? 0) > (match.opp_sets_won ?? 0);
  const completedSets = (sets ?? []).filter(s => s.status === 'complete');

  return (
    <div
      ref={cardRef}
      style={{
        position: 'absolute', left: '-9999px', top: 0,
        width: 380, background: '#0f172a', borderRadius: 16,
        padding: '20px 24px', fontFamily: 'system-ui, -apple-system, sans-serif',
        color: 'white', overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: '#f97316', textTransform: 'uppercase', marginBottom: 2 }}>
            VBSTAT · Match Result
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.1 }}>
            vs. {match.opponent_name ?? 'Opponent'}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
            {fmtDate(match.date)}{match.location ? ` · ${match.location}` : ''}
          </div>
        </div>
        <div style={{
          fontSize: 32, fontWeight: 900, letterSpacing: '-0.02em',
          color: won ? '#4ade80' : '#f87171', lineHeight: 1,
        }}>
          {won ? 'W' : 'L'} {match.our_sets_won ?? 0}–{match.opp_sets_won ?? 0}
        </div>
      </div>

      {/* Set score chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {completedSets.map(s => {
          const sw = s.our_score > s.opp_score;
          return (
            <div key={s.id} style={{
              background: sw ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)',
              border: `1px solid ${sw ? 'rgba(52,211,153,0.4)' : 'rgba(248,113,113,0.4)'}`,
              borderRadius: 8, padding: '3px 10px', fontSize: 13,
            }}>
              <span style={{ color: sw ? '#4ade80' : '#f87171', fontWeight: 700, marginRight: 4, fontSize: 10 }}>S{s.set_number}</span>
              <span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{s.our_score}–{s.opp_score}</span>
            </div>
          );
        })}
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid #334155', marginBottom: 14 }} />

      {/* Key stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, textAlign: 'center' }}>
        {[
          { label: 'HIT%',  val: fmtHitting(stats.team.hit_pct) },
          { label: 'ACE%',  val: fmtPct(stats.team.ace_pct)     },
          { label: 'APR',   val: fmtPassRating(stats.team.apr)  },
          { label: 'SO%',   val: fmtPct(stats.rotation.so_pct)  },
        ].map(({ label, val }) => (
          <div key={label} style={{ background: '#1e293b', borderRadius: 8, padding: '8px 4px' }}>
            <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#f97316' }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ marginTop: 14, fontSize: 10, color: '#475569', textAlign: 'right' }}>
        Tracked with VBSTAT by SHUA
      </div>
    </div>
  );
};

// ── Scouting auto-populate ───────────────────────────────────────────────────

const TENDENCY_ICONS = {
  serve_target:      '🎯',
  attack_pattern:    '⚡',
  defense_style:     '🛡️',
  rotation_strength: '💪',
  rotation_weakness: '⚠️',
  note:              '📝',
};

function generateScoutingSuggestions(stats) {
  const suggestions = [];
  if (!stats) return suggestions;

  const opp  = stats.opp  ?? {};
  const rots = stats.rotation?.rotations ?? {};

  // Attack output
  if ((opp.k ?? 0) > 0 || (opp.ae ?? 0) > 0) {
    const aeStr = (opp.ae ?? 0) > 0 ? `, ${opp.ae} AE` : '';
    suggestions.push({ type: 'attack_pattern', value: `${opp.k ?? 0} kills${aeStr}` });
  }

  // Block presence
  if ((opp.blk ?? 0) >= 2) {
    suggestions.push({ type: 'defense_style', value: `${opp.blk} solo block${opp.blk !== 1 ? 's' : ''}` });
  }

  // Serving aces / errors
  if ((opp.ace ?? 0) >= 1) {
    const seStr = (opp.se ?? 0) > 0 ? `, ${opp.se} serve err` : '';
    suggestions.push({ type: 'serve_target', value: `${opp.ace} ace${opp.ace !== 1 ? 's' : ''} on us${seStr}` });
  }

  // Rotation strength / weakness (need ≥ 3 serve-receive opportunities)
  const rotRows = Object.entries(rots)
    .map(([n, r]) => ({ n, ...r }))
    .filter(r => (r.so_opp ?? 0) >= 3);

  if (rotRows.length >= 2) {
    const sorted = [...rotRows].sort((a, b) => (a.so_pct ?? 0) - (b.so_pct ?? 0));
    const worst  = sorted[0];
    const best   = sorted[sorted.length - 1];

    if (worst.so_pct != null) {
      const pct = Math.round(worst.so_pct * 100);
      suggestions.push({ type: 'rotation_strength', value: `R${worst.n} held us to ${pct}% SR (${worst.so_win}/${worst.so_opp})` });
    }
    if (best.n !== worst.n && best.so_pct != null) {
      const pct = Math.round(best.so_pct * 100);
      suggestions.push({ type: 'rotation_weakness', value: `R${best.n} — we sideout ${pct}% (${best.so_win}/${best.so_opp})` });
    }
  }

  return suggestions;
}

function ScoutingReviewModal({ oppName, matchId, suggestions, onSave, onSkip }) {
  const [items,  setItems]  = useState(() => suggestions.map((s, i) => ({ ...s, _id: i, checked: true })));
  const [saving, setSaving] = useState(false);

  const toggle    = (id)        => setItems(p => p.map(s => s._id === id ? { ...s, checked: !s.checked } : s));
  const editValue = (id, value) => setItems(p => p.map(s => s._id === id ? { ...s, value } : s));

  const valid = items.filter(s => s.checked && s.value.trim());

  async function handleSave() {
    setSaving(true);
    try { await onSave(valid); } finally { setSaving(false); }
  }

  return (
    <Modal
      title={`Scout: ${oppName}`}
      onClose={onSkip}
      footer={
        <>
          <Button variant="secondary" onClick={onSkip}>Skip</Button>
          <Button onClick={handleSave} disabled={saving || !valid.length}>
            {saving ? 'Saving…' : `Save ${valid.length} note${valid.length !== 1 ? 's' : ''}`}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-400 mb-3">
        Auto-generated from this match. Uncheck or edit before saving.
      </p>
      <div className="space-y-2">
        {items.map(item => (
          <div
            key={item._id}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer select-none transition-opacity ${
              item.checked ? 'bg-surface' : 'bg-slate-900/40 opacity-50'
            }`}
            onClick={() => toggle(item._id)}
          >
            <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
              item.checked ? 'bg-primary border-primary' : 'border-slate-600'
            }`}>
              {item.checked && <span className="text-white text-[10px] font-bold leading-none">✓</span>}
            </div>
            <span className="text-base leading-none">{TENDENCY_ICONS[item.type] ?? '📝'}</span>
            <input
              className="flex-1 bg-transparent text-sm text-white focus:outline-none min-w-0"
              value={item.value}
              onChange={e => { e.stopPropagation(); editValue(item._id, e.target.value); }}
              onClick={e => e.stopPropagation()}
            />
          </div>
        ))}
      </div>
    </Modal>
  );
}

export function MatchSummaryPage() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const id = Number(matchId);

  const [tab, setTab] = useState('scoring');
  const onSwipeLeft  = useCallback(() => setTab(t => { const i = TAB_VALUES.indexOf(t); return i < TAB_VALUES.length - 1 ? TAB_VALUES[i + 1] : t; }), []);
  const onSwipeRight = useCallback(() => setTab(t => { const i = TAB_VALUES.indexOf(t); return i > 0 ? TAB_VALUES[i - 1] : t; }), []);
  const swipeHandlers = useSwipe({ onSwipeLeft, onSwipeRight });
  const [serveView,     setServeView]     = useState('all');
  const [selectedServingPlayerId, setSelectedServingPlayerId] = useState(null);
  const [trendsView,    setTrendsView]    = useState('trends');
  const [passingView,   setPassingView]   = useState('passing');
  const [scoringView,   setScoringView]   = useState('scoring');
  const [stats, setStats] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [rawRallies, setRawRallies] = useState([]);
  const [selectedSetId, setSelectedSetId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statsError, setStatsError] = useState(null);
  const [sharingCard, setSharingCard] = useState(false);
  const shareCardRef    = useRef(null);
  const html2canvasRef  = useRef(null);
  const [reviseModalSet, setReviseModalSet] = useState(null);
  const [boxScoreSet, setBoxScoreSet] = useState(null);
  const [statsVersion, setStatsVersion] = useState(0);
  const [showCorrections, setShowCorrections] = useState(false);
  const [editOpen,      setEditOpen]      = useState(false);
  const [editOpp,       setEditOpp]       = useState('');
  const [editOppAbbr,   setEditOppAbbr]   = useState('');
  const [editOppRecord, setEditOppRecord] = useState('');
  const [editDate,      setEditDate]      = useState('');
  const [editLoc,       setEditLoc]       = useState('home');
  const [editConf,      setEditConf]      = useState('non-con');
  const [editMatchType, setEditMatchType] = useState('reg-season');
  const [editSaving,    setEditSaving]    = useState(false);

  // Scouting auto-populate
  const showToast = useUiStore(selectShowToast);
  const [scoutSuggestions, setScoutSuggestions] = useState([]);
  const [showScoutPrompt,  setShowScoutPrompt]  = useState(false);
  const [showScoutModal,   setShowScoutModal]   = useState(false);

  // Match + sets from Dexie (live)
  const match = useLiveQuery(() => db.matches.get(id), [id]);
  const sets   = useLiveQuery(() => db.sets.where('match_id').equals(id).sortBy('set_number'), [id]);
  const correctionContacts = useLiveQuery(
    () => db.contacts.where('match_id').equals(id).filter((c) => c.source === 'video_correction').toArray(),
    [id]
  );

  // Players keyed by id for name lookup (match → season → team)
  const players = useLiveQuery(async () => {
    if (!match?.season_id) return {};
    const season = await db.seasons.get(match.season_id);
    if (!season?.team_id) return {};
    const list = await db.players.where('team_id').equals(season.team_id).toArray();
    return Object.fromEntries(list.map(p => [p.id, p]));
  }, [match?.season_id]);

  // Preload html2canvas so share-card handler has no cold-start delay
  useEffect(() => { import('html2canvas').then((m) => { html2canvasRef.current = m.default; }); }, []);

  // If match doesn't exist (e.g. PWA restored a stale URL), go home
  useEffect(() => { if (!loading && !match) navigate('/'); }, [loading, match, navigate]);

  // Compute stats once match data is ready (re-runs after a box score save)
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setStatsError(null);
    setSelectedSetId(null);
    Promise.all([computeMatchStats(id), getRalliesForMatch(id)])
      .then(([s, rallies]) => { setStats(s); setContacts(s.contacts); setRawRallies(rallies); })
      .catch((err) => {
        console.error('computeMatchStats failed', err);
        setStatsError(err?.message ?? 'Failed to load stats');
      })
      .finally(() => setLoading(false));
  }, [id, statsVersion]);

  // Trigger scouting prompt once after stats load for complete matches
  useEffect(() => {
    if (!stats || !match || match.status !== 'complete') return;
    if (!match.opponent_id) return;
    if (localStorage.getItem(`vbstat_scout_${id}`)) return;
    const suggestions = generateScoutingSuggestions(stats);
    if (!suggestions.length) return;
    setScoutSuggestions(suggestions);
    setShowScoutPrompt(true);
  }, [stats, match, id]);

  function dismissScoutPrompt() {
    localStorage.setItem(`vbstat_scout_${id}`, '1');
    setShowScoutPrompt(false);
    setShowScoutModal(false);
  }

  async function handleScoutSave(items) {
    const now = new Date().toISOString();
    await Promise.all(
      items.map(item =>
        db.opp_tendencies.add({
          opp_id:     match.opponent_id,
          match_id:   id,
          type:       item.type,
          value:      item.value.trim(),
          created_at: now,
        })
      )
    );
    dismissScoutPrompt();
    showToast(`${items.length} scouting note${items.length !== 1 ? 's' : ''} saved`, 'success');
  }

  const displayStats = useMemo(() => {
    if (!stats) return null;
    if (!selectedSetId) return stats;
    const fc = stats.contacts.filter(c => c.set_id === selectedSetId);
    const fr = rawRallies.filter(r => r.set_id === selectedSetId);
    return {
      ...stats,
      contacts:         fc,
      players:          computePlayerStats(fc, 1),
      team:             computeTeamStats(fc, 1),
      rotation:         computeRotationStats(fr),
      pointQuality:     computePointQuality(fc),
      serveZones:       computeServeZoneStats(fc),
      isOos:            computeISvsOOS(fc, fr),
      transitionAttack: computeTransitionAttack(fc, fr),
    };
  }, [stats, rawRallies, selectedSetId]);

  const playerNames   = useMemo(() => players
    ? Object.fromEntries(Object.entries(players).map(([pid, p]) => [pid, p.name]))
    : {}, [players]);
  const playerJerseys = useMemo(() => players
    ? Object.fromEntries(Object.entries(players).map(([pid, p]) => [pid, p.jersey_number ?? '']))
    : {}, [players]);
  const playerList = useMemo(() => players ? Object.values(players) : [], [players]);

  const oppScored = useMemo(() => {
    if (!sets?.length) return null;
    if (selectedSetId) {
      const s = sets.find((s) => s.id === selectedSetId);
      return s?.opp_score ?? null;
    }
    return sets.filter((s) => s.status === 'complete').reduce((sum, s) => sum + (s.opp_score ?? 0), 0);
  }, [sets, selectedSetId]);

  const correctedPlayerIds = useMemo(
    () => new Set((correctionContacts ?? []).map((c) => c.player_id)),
    [correctionContacts]
  );

  const playerRows = useMemo(() =>
    displayStats
      ? Object.entries(displayStats.players).map(([pid, s]) => ({
          id:   pid,
          name: `${playerNames[pid] ?? `#${pid}`}${correctedPlayerIds.has(Number(pid)) ? ' ✎' : ''}`,
          ...s,
          f_se_pct: s.f_sa > 0 ? s.f_se / s.f_sa : null,
          t_se_pct: s.t_sa > 0 ? s.t_se / s.t_sa : null,
        }))
      : [],
    [displayStats, playerNames, correctedPlayerIds]
  );

  const xkTeam = useMemo(() => aggregateXKTeamStats(playerRows), [playerRows]);

  const statTotals = useMemo(() => {
    if (!playerRows.length) return null;
    const sum = (key) => playerRows.reduce((acc, r) => acc + (r[key] ?? 0), 0);

    const sp = sum('sp'), mp = sum('mp');

    // Serving
    const sa = sum('sa'), ace = sum('ace'), se = sum('se'),
          se_ob = sum('se_ob'), se_net = sum('se_net');
    const f_sa = sum('f_sa'), f_ace = sum('f_ace'), f_se = sum('f_se');
    const t_sa = sum('t_sa'), t_ace = sum('t_ace'), t_se = sum('t_se');

    // Passing & setting
    const pa = sum('pa'), p0 = sum('p0'), p1 = sum('p1'),
          p2 = sum('p2'), p3 = sum('p3');
    const ast = sum('ast'), bhe = sum('bhe');

    // Attacking & blocking
    const ta = sum('ta'), k = sum('k'), ae = sum('ae');
    const bs = sum('bs'), ba = sum('ba'), be = sum('be');

    // Defense
    const dig = sum('dig'), de = sum('de'),
          fbr = sum('fbr'), fbs = sum('fbs'), fbe = sum('fbe');

    return {
      // Serving views
      all: {
        name: 'TOTAL', sp, mp, sa, ace, se, se_ob, se_net,
        ace_pct:  sa > 0 ? ace / sa : null,
        se_pct:   sa > 0 ? se / sa : null,
        si_pct:   sa > 0 ? (sa - se) / sa : null,
        sob_pct:  sa > 0 ? se_ob / sa : null,
        snet_pct: sa > 0 ? se_net / sa : null,
      },
      float: {
        name: 'TOTAL', sp, mp, f_sa, f_ace, f_se,
        f_ace_pct: f_sa > 0 ? f_ace / f_sa : null,
        f_se_pct:  f_sa > 0 ? f_se / f_sa : null,
        f_si_pct:  f_sa > 0 ? (f_sa - f_se) / f_sa : null,
      },
      top: {
        name: 'TOTAL', sp, mp, t_sa, t_ace, t_se,
        t_ace_pct: t_sa > 0 ? t_ace / t_sa : null,
        t_se_pct:  t_sa > 0 ? t_se / t_sa : null,
        t_si_pct:  t_sa > 0 ? (t_sa - t_se) / t_sa : null,
      },
      // Passing views
      passing: {
        name: 'TOTAL', sp, mp, pa, p0, p1, p2, p3,
        apr:    pa > 0 ? (p1 + p2 * 2 + p3 * 3) / pa : null,
        pp_pct: pa > 0 ? p3 / pa : null,
      },
      setting: {
        name: 'TOTAL', sp, mp, ast, bhe,
        aps: sp > 0 ? ast / sp : null,
      },
      // Attacking views
      attacking: {
        name: 'TOTAL', sp, mp, ta, k, ae,
        hit_pct:   ta > 0 ? (k - ae) / ta : null,
        k_pct:     ta > 0 ? k / ta : null,
        kps:       sp > 0 ? k / sp : null,
        pos_label: null, pos_mult: null, ver: null,
      },
      blocking: {
        name: 'TOTAL', sp, mp, bs, ba, be,
        bps: sp > 0 ? (bs + ba * 0.5) / sp : null,
      },
      // Defense view
      defense: {
        name: 'TOTAL', sp, mp, dig, de, fbr, fbs, fbe,
        dips: sp > 0 ? dig / sp : null,
      },
    };
  }, [playerRows]);

  const rotationRows = useMemo(() =>
    displayStats
      ? Object.entries(displayStats.rotation.rotations).map(([n, r]) => ({
          id: n,
          name: `Rotation ${n}`,
          ...r,
        }))
      : [],
    [displayStats]
  );

  const matchMeta = match ? { ...match, sets: sets ?? [] } : {};

  function openEditModal() {
    setEditOpp(match.opponent_name ?? '');
    setEditOppAbbr(match.opponent_abbr ?? '');
    setEditOppRecord(match.opponent_record ?? '');
    setEditDate(match.date ? match.date.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setEditLoc(match.location ?? 'home');
    setEditConf(match.conference ?? 'non-con');
    setEditMatchType(match.match_type ?? 'reg-season');
    setEditOpen(true);
  }

  async function handleEditSave() {
    if (!editOpp.trim()) return;
    setEditSaving(true);
    try {
      await db.matches.update(id, {
        opponent_name:   editOpp.trim(),
        opponent_abbr:   editOppAbbr.trim().toUpperCase() || null,
        opponent_record: editOppRecord.trim() || null,
        date:            editDate ? new Date(editDate + 'T12:00:00').toISOString() : match.date,
        location:        editLoc,
        conference:      editConf,
        match_type:      editMatchType,
      });
      setEditOpen(false);
    } finally {
      setEditSaving(false);
    }
  }

  function handlePDF() {
    if (!stats || !match) return;
    const completedSets = (sets ?? [])
      .filter((s) => s.status !== 'scheduled')
      .sort((a, b) => a.set_number - b.set_number);
    const perSetStats = completedSets.map((s) => {
      const fc = stats.contacts.filter((c) => c.set_id === s.id);
      return { set: s, players: computePlayerStats(fc, 1), team: computeTeamStats(fc, 1) };
    });
    exportMatchPDF(matchMeta, stats.players, stats.team, stats.rotation, playerNames,
      perSetStats, `match-${id}-stats.pdf`);
  }

  function handleCSV() {
    if (!stats) return;
    exportMatchCSV(stats.players, playerNames, `match-${id}-stats.csv`);
  }

  function handleMaxPreps() {
    if (!stats) return;
    const uuid = getStorageItem(STORAGE_KEYS.MAXPREPS_TEAM_ID, '');
    exportMaxPrepsCSV(stats.players, playerNames, playerJerseys, stats.setsPlayed, uuid, `match-${id}-maxpreps.txt`);
  }

  async function handleShareCard() {
    if (!shareCardRef.current || !stats || !match) return;
    setSharingCard(true);
    try {
      const html2canvas = html2canvasRef.current ?? (await import('html2canvas')).default;
      const canvas = await html2canvas(shareCardRef.current, {
        backgroundColor: '#0f172a',
        scale: 2,
        useCORS: true,
        logging: false,
      });
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const filename = `vbstat-vs-${(match.opponent_name ?? 'opponent').replace(/\s+/g, '-').toLowerCase()}.png`;
        if (navigator.share && navigator.canShare?.({ files: [new File([blob], filename, { type: 'image/png' })] })) {
          await navigator.share({ files: [new File([blob], filename, { type: 'image/png' })], title: 'Match Result' });
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = filename; a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
      }, 'image/png');
    } finally {
      setSharingCard(false);
    }
  }

  return (
    <div>
      <PageHeader title="Match Summary" backTo="/" />

      {loading && (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      )}

      {!loading && statsError && (
        <div className="flex flex-col items-center py-16 gap-4 px-4 text-center">
          <p className="text-slate-400 text-sm">Could not load match stats.</p>
          <p className="text-slate-600 text-xs">{statsError}</p>
          <Button variant="secondary" onClick={() => setStatsVersion((v) => v + 1)}>Retry</Button>
        </div>
      )}

      {!loading && !statsError && match && (
        <>
          {/* Match header */}
          <div className="px-4 pt-4 pb-2">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold">vs. {match.opponent_name ?? 'Opponent'}</h2>
              <button
                onClick={openEditModal}
                title="Edit match details"
                className="text-slate-600 hover:text-slate-300 text-sm transition-colors"
              >✎</button>
            </div>
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
                    <div key={s.id} className="flex items-center gap-1">
                      <div className={`rounded-lg px-3 py-1 text-sm border ${won ? 'bg-emerald-900/30 border-emerald-700/50' : 'bg-red-900/30 border-red-800/50'}`}>
                        <span className={`text-xs mr-1 font-semibold ${won ? 'text-emerald-500' : 'text-red-500'}`}>S{s.set_number}</span>
                        <span className={`font-bold font-mono ${won ? 'text-emerald-300' : 'text-red-300'}`}>{s.our_score}–{s.opp_score}</span>
                      </div>
                      <button
                        onClick={() => setReviseModalSet(s)}
                        title="Revise set"
                        className="text-xs text-slate-600 hover:text-slate-300 px-1 transition-colors"
                      >
                        ✎
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Match Notes */}
            <MatchNotes matchId={id} initialNotes={match.notes ?? ''} />

            {/* Export bar */}
            <div className="flex gap-2 mt-3 flex-wrap">
              <Button size="sm" variant="secondary" disabled={!stats} onClick={handlePDF}>
                PDF
              </Button>
              <Button size="sm" variant="secondary" disabled={!stats} onClick={handleCSV}>
                CSV
              </Button>
              <Button size="sm" variant="secondary" disabled={!stats} onClick={handleMaxPreps}>
                MaxPreps
              </Button>
              <Button size="sm" variant="secondary" disabled={!stats || sharingCard} onClick={handleShareCard}>
                {sharingCard ? '…' : '📸 Share Card'}
              </Button>
              <Button size="sm" variant="secondary" disabled={!stats} onClick={() => setShowCorrections(true)}>
                ✎ Correct
              </Button>
            </div>
          </div>

          {/* Set filter picker */}
          {sets && sets.length > 1 && stats && (
            <div className="flex gap-1.5 mx-4 mb-3">
              <button
                onClick={() => setSelectedSetId(null)}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                  !selectedSetId ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                ALL
              </button>
              {sets.filter(s => s.status !== 'scheduled').map(s => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSetId(s.id)}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                    selectedSetId === s.id ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  S{s.set_number}
                </button>
              ))}
            </div>
          )}

          {/* Team totals strip */}
          {displayStats && (
            <div className="mx-4 mb-2 bg-surface rounded-xl p-3 grid grid-cols-4 gap-2 text-center text-sm">
              {[
                { label: 'S%',    val: fmtPct(displayStats.team.si_pct)        },
                { label: 'Aces',  val: fmtCount(displayStats.team.ace)         },
                { label: 'HIT%',  val: fmtHitting(displayStats.team.hit_pct)   },
                { label: 'K%',    val: fmtPct(displayStats.team.k_pct)         },
                { label: 'Kills', val: fmtCount(displayStats.team.k)           },
                { label: 'Blocks', val: (() => { const b = displayStats.team.bs + displayStats.team.ba * 0.5; return b % 1 === 0 ? String(b) : b.toFixed(1); })() },
                { label: 'Digs',  val: fmtCount(displayStats.team.dig)         },
                { label: 'APR',   val: fmtPassRating(displayStats.team.apr)    },
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

          {/* Tab position dots */}
          <div className="flex justify-center gap-1 py-2">
            {TAB_VALUES.map((v) => (
              <button
                key={v}
                onClick={() => setTab(v)}
                className={`rounded-full transition-all duration-200 ${
                  v === tab
                    ? 'w-4 h-1.5 bg-primary'
                    : 'w-1.5 h-1.5 bg-slate-700 hover:bg-slate-500'
                }`}
                aria-label={v}
              />
            ))}
          </div>

          {/* Tab content */}
          <div key={tab} className="p-4 md:p-6 animate-fade-in" {...swipeHandlers}>
            {tab === 'scoring' && displayStats && (
              <div className="space-y-6">
                <SubToggle
                  options={[['scoring', 'SCORING'], ['teamvsopp', 'TEAM VS OPP']]}
                  value={scoringView}
                  onChange={setScoringView}
                />
                {scoringView === 'scoring' && (
                  <>
                    <PointQualityPanel pq={displayStats.pointQuality} oppScored={oppScored} />
                    <ScoreTimeline
                      rawRallies={selectedSetId ? rawRallies.filter(r => r.set_id === selectedSetId) : rawRallies}
                      sets={selectedSetId ? (sets ?? []).filter(s => s.id === selectedSetId) : (sets ?? [])}
                      teamName={match?.team_name}
                      opponentName={match?.opponent_name}
                    />
                    {(xkTeam.xk1 != null || xkTeam.xk2 != null || xkTeam.xk3 != null) && (
                      <div className="bg-surface rounded-xl p-3">
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Attack by Pass Rating</p>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { label: 'xK1%',  val: fmtPct(xkTeam.xk1)       },
                            { label: 'xK2%',  val: fmtPct(xkTeam.xk2)       },
                            { label: 'xK3%',  val: fmtPct(xkTeam.xk3)       },
                            { label: 'xHIT1', val: fmtHitting(xkTeam.xhit1)  },
                            { label: 'xHIT2', val: fmtHitting(xkTeam.xhit2)  },
                            { label: 'xHIT3', val: fmtHitting(xkTeam.xhit3)  },
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
                  </>
                )}
                {scoringView === 'teamvsopp' && displayStats.team && displayStats.opp && (
                  <TeamComparison
                    team={displayStats.team}
                    opp={displayStats.opp}
                    teamName={match?.team_name ?? 'Us'}
                    oppName={match?.opponent_name ?? 'Opponent'}
                  />
                )}
              </div>
            )}

            {tab === 'trends' && (
              <>
                <SubToggle
                  options={[['trends', 'TRENDS'], ['rotation', 'ROTATION'], ['winprob', 'WIN PROB']]}
                  value={trendsView}
                  onChange={setTrendsView}
                />
                {trendsView === 'trends' && (
                  <div className="space-y-8 mt-3">
                    <SetTrendsChart contacts={contacts} sets={sets ?? []} />
                    <div className="border-t border-slate-700/50 pt-6">
                      <RallyHistogram contacts={contacts} />
                    </div>
                  </div>
                )}
                {trendsView === 'winprob' && (
                  <div className="mt-3">
                    <WinProbChart
                      rawRallies={rawRallies}
                      sets={sets ?? []}
                      format={match?.format ?? FORMAT.BEST_OF_5}
                    />
                  </div>
                )}
                {trendsView === 'rotation' && displayStats?.rotation && (
                  <div className="space-y-6 mt-3">
                    <RotationBarChart rotationRows={rotationRows} />
                    <RotationRadarChart rotationStats={displayStats.rotation} />
                    <RotationSpotlight rows={rotationRows} />
                    <StatTable columns={ROTATION_COLS} rows={rotationRows} />
                    <div className="grid grid-cols-2 gap-4 text-sm text-center">
                      <div className="bg-surface rounded-xl p-3">
                        <div className="text-xs text-slate-400">Overall SO%</div>
                        <div className="text-lg font-bold text-primary">{fmtPct(displayStats.rotation.so_pct)}</div>
                      </div>
                      <div className="bg-surface rounded-xl p-3">
                        <div className="text-xs text-slate-400">Overall SP%</div>
                        <div className="text-lg font-bold text-sky-400">{fmtPct(displayStats.rotation.bp_pct)}</div>
                      </div>
                    </div>
                    <CourtHeatMap contacts={contacts} />
                  </div>
                )}
              </>
            )}

            {tab === 'serving' && (
              <>
                <SubToggle
                  options={[['all', 'ALL'], ['float', 'FLOAT'], ['top', 'TOP SPIN']]}
                  value={serveView}
                  onChange={(v) => { setServeView(v); setSelectedServingPlayerId(null); }}
                />
                <StatTable
                  columns={SERVING_COLS[serveView]}
                  rows={playerRows}
                  totalsRow={statTotals?.[serveView]}
                  onRowClick={(row) => setSelectedServingPlayerId(id => String(id) === String(row.id) ? null : row.id)}
                  selectedRowId={selectedServingPlayerId}
                />
                {selectedServingPlayerId && displayStats?.contacts && (() => {
                  const player = playerRows.find(r => String(r.id) === String(selectedServingPlayerId));
                  return player ? (
                    <PlayerServePlacementCard
                      player={player}
                      contacts={displayStats.contacts}
                      playerJerseys={playerJerseys}
                    />
                  ) : null;
                })()}
                {displayStats?.serveZones && (
                  <ServeZoneGrid zones={displayStats.serveZones} />
                )}
                {displayStats?.contacts && (
                  <ServeReticlePlot contacts={displayStats.contacts} serveType={serveView} />
                )}
              </>
            )}

            {tab === 'passing' && (
              <>
                <SubToggle
                  options={[['passing', 'PASSING'], ['setting', 'SETTING']]}
                  value={passingView}
                  onChange={setPassingView}
                />
                <StatTable columns={TAB_COLUMNS[passingView]} rows={playerRows} totalsRow={statTotals?.[passingView]} />
              </>
            )}

            {tab === 'attacking' && (
              <div className="space-y-4">
                <StatTable columns={TAB_COLUMNS['attacking']} rows={playerRows} totalsRow={statTotals?.attacking} />

                {/* Set Distribution by Position */}
                {(() => {
                  const POS_ORDER  = ['OH', 'MB', 'RS'];
                  const POS_LABELS = { OH: 'Outside', MB: 'Middle', RS: 'Right Side' };
                  const groups = {};
                  for (const row of playerRows) {
                    const pos = row.pos_label;
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
                                  {g.ta} TA · {hitting !== null ? fmtHitting(hitting) : '—'}
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

                {/* In System vs Out of System */}
                {displayStats?.isOos && (
                  (displayStats.isOos.total.is.ta > 0 || displayStats.isOos.total.oos.ta > 0)
                ) && (
                  <div className="bg-surface rounded-xl p-3">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">In System vs Out of System</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { label: 'IS ATK',  val: fmtCount(displayStats.isOos.total.is.ta)        },
                        { label: 'IS Win%', val: fmtPct(displayStats.isOos.total.is.win_pct)     },
                        { label: 'IS K%',   val: fmtPct(displayStats.isOos.total.is.k_pct)       },
                        { label: 'IS HIT%', val: fmtHitting(displayStats.isOos.total.is.hit_pct) },
                        { label: 'OOS ATK',  val: fmtCount(displayStats.isOos.total.oos.ta)         },
                        { label: 'OOS Win%', val: fmtPct(displayStats.isOos.total.oos.win_pct)      },
                        { label: 'OOS K%',   val: fmtPct(displayStats.isOos.total.oos.k_pct)        },
                        { label: 'OOS HIT%', val: fmtHitting(displayStats.isOos.total.oos.hit_pct)  },
                      ].map(({ label, val }) => (
                        <div key={label} className="bg-slate-800/60 rounded-lg p-2 text-center">
                          <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">{label}</div>
                          <div className="text-lg font-black text-primary mt-0.5">{val}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Freeball & Transition Attack */}
                {displayStats?.transitionAttack && (
                  (displayStats.transitionAttack.free.total.ta > 0 || displayStats.transitionAttack.transition.total.ta > 0)
                ) && (
                  <div className="bg-surface rounded-xl p-3">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Freeball &amp; Transition Attack</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { label: 'FB ATK',  val: fmtCount(displayStats.transitionAttack.free.total.ta)            },
                        { label: 'FB Win%', val: fmtPct(displayStats.transitionAttack.free.total.win_pct)         },
                        { label: 'FB K%',   val: fmtPct(displayStats.transitionAttack.free.total.k_pct)           },
                        { label: 'FB HIT%', val: fmtHitting(displayStats.transitionAttack.free.total.hit_pct)     },
                        { label: 'TR ATK',  val: fmtCount(displayStats.transitionAttack.transition.total.ta)       },
                        { label: 'TR Win%', val: fmtPct(displayStats.transitionAttack.transition.total.win_pct)   },
                        { label: 'TR K%',   val: fmtPct(displayStats.transitionAttack.transition.total.k_pct)     },
                        { label: 'TR HIT%', val: fmtHitting(displayStats.transitionAttack.transition.total.hit_pct) },
                      ].map(({ label, val }) => (
                        <div key={label} className="bg-slate-800/60 rounded-lg p-2 text-center">
                          <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">{label}</div>
                          <div className="text-lg font-black text-primary mt-0.5">{val}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Kill% by Pass Rating (xK%) */}
                {(() => {
                  const xkRows = playerRows.filter(r => (r.xk1_ta ?? 0) > 0 || (r.xk2_ta ?? 0) > 0 || (r.xk3_ta ?? 0) > 0);
                  if (!xkRows.length) return null;
                  return (
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
                  );
                })()}

                {(() => {
                  const xkRows = playerRows.filter(r => (r.xk1_ta ?? 0) > 0 || (r.xk2_ta ?? 0) > 0 || (r.xk3_ta ?? 0) > 0);
                  if (!xkRows.length) return null;
                  return (
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
                  );
                })()}
              </div>
            )}

            {tab === 'blocking' && (
              <StatTable columns={TAB_COLUMNS['blocking']} rows={playerRows} totalsRow={statTotals?.blocking} />
            )}

            {tab === 'defense' && (
              <StatTable columns={TAB_COLUMNS['defense']} rows={playerRows} totalsRow={statTotals?.defense} />
            )}

            {tab === 'ver' && (
              <StatTable columns={TAB_COLUMNS['ver']} rows={playerRows} totalsRow={statTotals?.ver} />
            )}

            {tab === 'compare' && (
              <PlayerComparison playerRows={playerRows} />
            )}

            {tab === 'opponent' && displayStats?.opp && (
              <div className="space-y-3">
                <p className="text-xs text-slate-400 mb-4">Opponent performance this match</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'ACE',  val: displayStats.opp.ace,  desc: 'Aces vs us'         },
                    { label: 'SE',   val: displayStats.opp.se,   desc: 'Serve errors'        },
                    { label: 'K',    val: displayStats.opp.k,    desc: 'Kills'               },
                    { label: 'AE',   val: displayStats.opp.ae,   desc: 'Attack errors'       },
                    { label: 'BLK',  val: displayStats.opp.blk,  desc: 'Blocked by us'       },
                    { label: 'ERR',  val: displayStats.opp.errs, desc: 'Ball handling errors' },
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

      {/* Off-screen share card — rendered for html2canvas capture */}
      <ShareCard
        cardRef={shareCardRef}
        match={match}
        sets={sets}
        stats={stats}
        fmtDate={fmtDate}
      />

      {editOpen && (
        <Modal
          title="Edit Match Details"
          onClose={() => setEditOpen(false)}
          footer={
            <>
              <button onClick={() => setEditOpen(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                disabled={editSaving || !editOpp.trim()}
                className="px-4 py-2 text-sm font-semibold bg-primary text-white rounded-lg disabled:opacity-50"
              >
                {editSaving ? 'Saving…' : 'Save'}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wide">Date</label>
              <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)}
                className="w-full bg-surface border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wide">Opponent</label>
              <input type="text" value={editOpp} onChange={(e) => setEditOpp(e.target.value)}
                className="w-full bg-surface border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wide">Abbr</label>
                <input type="text" value={editOppAbbr} maxLength={3}
                  onChange={(e) => setEditOppAbbr(e.target.value.toUpperCase())}
                  className="w-full bg-surface border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wide">Record</label>
                <input type="text" value={editOppRecord} placeholder="12-3"
                  onChange={(e) => setEditOppRecord(e.target.value)}
                  className="w-full bg-surface border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wide">Location</label>
              <div className="flex gap-2">
                {['home', 'away', 'neutral'].map((loc) => (
                  <button key={loc} onClick={() => setEditLoc(loc)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold capitalize transition-colors
                      ${editLoc === loc ? 'bg-primary text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                    {loc}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wide">Conference</label>
              <div className="flex gap-2">
                {[['conference', 'Con'], ['non-con', 'Non-Con']].map(([val, label]) => (
                  <button key={val} onClick={() => setEditConf(val)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors
                      ${editConf === val ? 'bg-primary text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wide">Type</label>
              <div className="grid grid-cols-2 gap-2">
                {[['reg-season', 'Reg Season'], ['tourney', 'Tourney'], ['ihsa-playoffs', 'IHSA Playoffs'], ['exhibition', 'Exhibition']].map(([val, label]) => (
                  <button key={val} onClick={() => setEditMatchType(val)}
                    className={`py-2 rounded-lg text-sm font-semibold transition-colors
                      ${editMatchType === val ? 'bg-primary text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {reviseModalSet && (
        <ReviseSetModal
          set={reviseModalSet}
          matchId={id}
          onClose={() => setReviseModalSet(null)}
          onBoxScore={(s) => { setReviseModalSet(null); setBoxScoreSet(s); }}
        />
      )}

      {boxScoreSet && (
        <BoxScoreEntryModal
          set={boxScoreSet}
          matchId={id}
          players={playerList}
          onClose={() => setBoxScoreSet(null)}
          onSaved={() => { setBoxScoreSet(null); setStatsVersion((v) => v + 1); }}
        />
      )}

      {showCorrections && stats && (
        <VideoCorrectionsModal
          matchId={id}
          sets={sets ?? []}
          playerList={playerList}
          displayStats={displayStats}
          onCorrect={() => setStatsVersion((v) => v + 1)}
          onClose={() => setShowCorrections(false)}
        />
      )}

      {/* Scouting auto-populate prompt */}
      {showScoutPrompt && !showScoutModal && match && (
        <div className="fixed bottom-0 left-0 right-0 z-40 animate-slide-up">
          <div className="bg-slate-800 border-t border-slate-700 px-4 py-3 flex items-center gap-3 safe-area-inset-bottom">
            <span className="text-xl shrink-0">📋</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">
                Update scouting for {match.opponent_name}?
              </p>
              <p className="text-xs text-slate-400">
                {scoutSuggestions.length} note{scoutSuggestions.length !== 1 ? 's' : ''} generated from this match
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={dismissScoutPrompt}
                className="text-xs text-slate-400 hover:text-white transition-colors px-2 py-1"
              >
                Skip
              </button>
              <Button size="sm" onClick={() => setShowScoutModal(true)}>Review</Button>
            </div>
          </div>
        </div>
      )}

      {showScoutModal && match && (
        <ScoutingReviewModal
          oppName={match.opponent_name ?? 'Opponent'}
          matchId={id}
          suggestions={scoutSuggestions}
          onSave={handleScoutSave}
          onSkip={dismissScoutPrompt}
        />
      )}
    </div>
  );
}
