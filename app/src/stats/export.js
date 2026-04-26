import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Papa from 'papaparse';
import { fmtHitting, fmtPassRating, fmtPct, fmtCount, fmtRate, fmtDate } from './formatters';

// ── Helpers ──────────────────────────────────────────────────────────────────

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function playerRows(playerStats, playerNames) {
  return Object.entries(playerStats).map(([id, s]) => ({ id, name: playerNames[id] ?? `#${id}`, ...s }));
}

// ── CSV Export ────────────────────────────────────────────────────────────────

export function exportMatchCSV(playerStats, playerNames, filename = 'match-stats.csv') {
  const rows = playerRows(playerStats, playerNames).map(({ name, ...s }) => ({
    Player:   name,
    // Serving
    SA: s.sa,  ACE: s.ace,  SE: s.se,
    'ACE%': fmtPct(s.ace_pct),  'SE%': fmtPct(s.se_pct),  'S%': fmtPct(s.si_pct),
    // Passing
    PA: s.pa,  P0: s.p0,  P1: s.p1,  P2: s.p2,  P3: s.p3,
    APR: fmtPassRating(s.apr),  '3OPT%': fmtPct(s.pp_pct),
    // Attacking
    TA: s.ta,  K: s.k,  AE: s.ae,
    'HIT%': fmtHitting(s.hit_pct),  'K%': fmtPct(s.k_pct),  KPS: fmtRate(s.kps),
    // Setting
    AST: s.ast,  BHE: s.bhe,  APS: fmtRate(s.aps),
    // Blocking
    BS: s.bs,  BA: s.ba,  BE: s.be,  BPS: fmtRate(s.bps),
    // Defense
    DIG: s.dig,  DE: s.de,  DiPS: fmtRate(s.dips),
  }));

  // Prepend UTF-8 BOM so Excel opens non-ASCII names correctly
  const csv = '\uFEFF' + Papa.unparse(rows);
  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), filename);
}

// ── MaxPreps TXT Export ───────────────────────────────────────────────────────
// Pipe-delimited format required by MaxPreps volleyball stat import.
// Line 1: team UUID, Line 2: headers, Lines 3+: player data.

const MAXPREPS_HEADERS = [
  'Jersey', 'MatchGamesPlayed', 'TotalServes', 'ServingAces', 'ServingErrors',
  'ServingPoints', 'AttacksAttempts', 'AttacksKills', 'AttacksErrors',
  'ServingReceivedSuccess', 'ServingReceivedErrors', 'BlocksSolo', 'BlocksAssists',
  'BlocksErrors', 'BallHandlingAttempt', 'Assists', 'AssistsErrors', 'Digs', 'DigsErrors',
];

export function exportMaxPrepsCSV(playerStats, playerNames, playerJerseys, setsPlayed, teamUUID = '', filename = 'maxpreps-stats.txt') {
  const n = (v) => v ?? 0;
  const dataRows = playerRows(playerStats, playerNames).map(({ id, ...s }) => [
    playerJerseys[id] ?? '',
    setsPlayed,
    n(s.sa),
    n(s.ace),
    n(s.se),
    n(s.ace),                        // ServingPoints = aces (direct serving points)
    n(s.ta),
    n(s.k),
    n(s.ae),
    Math.max(0, n(s.pa) - n(s.p0)), // ServingReceivedSuccess = passes minus errors
    n(s.p0),
    n(s.bs),
    n(s.ba),
    n(s.be),
    n(s.ast) + n(s.bhe),            // BallHandlingAttempt = assists + ball handling errors
    n(s.ast),
    n(s.bhe),
    n(s.dig),
    n(s.de),
  ].join('|'));

  const lines = [];
  if (teamUUID) lines.push(teamUUID);
  lines.push(MAXPREPS_HEADERS.join('|'));
  lines.push(...dataRows);

  triggerDownload(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8;' }), filename);
}

// ── PDF Export ────────────────────────────────────────────────────────────────

const DARK = [15, 23, 42];       // slate-900
const SURFACE = [30, 41, 59];    // slate-800
const PRIMARY = [249, 115, 22];  // orange-500
const WHITE = [255, 255, 255];
const MUTED = [148, 163, 184];   // slate-400

function addPageHeader(doc, title, subtitle) {
  doc.setFillColor(...DARK);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 30, 'F');
  doc.setTextColor(...PRIMARY);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 14, 13);
  doc.setTextColor(...MUTED);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(subtitle, 14, 22);
}

export function exportMatchPDF(matchMeta, playerStats, teamStats, rotationStats, playerNames, perSetStats = [], filename = 'match-stats.pdf') {
  // Use A4 for non-US locales, letter for US
  const pdfFormat = (navigator.language ?? '').startsWith('en-US') ? 'letter' : 'a4';
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: pdfFormat });
  const title = `vs. ${matchMeta.opponent_name ?? 'Opponent'}`;
  const subtitle = fmtDate(matchMeta.date);

  // ── Page 1: Match header + team totals ──────────────────────────────────────
  addPageHeader(doc, title, subtitle);

  // Set scores
  if (matchMeta.sets?.length) {
    let y = 36;
    doc.setTextColor(...WHITE);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Set Scores', 14, y);
    y += 6;
    matchMeta.sets.forEach((s, i) => {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...MUTED);
      doc.text(`Set ${i + 1}`, 14, y);
      doc.setTextColor(...WHITE);
      doc.text(`${s.our_score ?? 0} – ${s.opp_score ?? 0}`, 40, y);
      y += 5;
    });
  }

  // Team totals table
  autoTable(doc, {
    startY: 70,
    head: [['Category', 'SA', 'ACE', 'ACE%', 'K', 'HIT%', 'AST', 'BS', 'DIG']],
    body: [[
      'Team',
      fmtCount(teamStats.sa),
      fmtCount(teamStats.ace),
      fmtPct(teamStats.ace_pct),
      fmtCount(teamStats.k),
      fmtHitting(teamStats.hit_pct),
      fmtCount(teamStats.ast),
      fmtCount(teamStats.bs),
      fmtCount(teamStats.dig),
    ]],
    styles: { fillColor: SURFACE, textColor: WHITE, fontSize: 9 },
    headStyles: { fillColor: PRIMARY, textColor: WHITE, fontStyle: 'bold' },
    theme: 'grid',
  });

  // ── Page 2: Player stats ─────────────────────────────────────────────────────
  doc.addPage();
  addPageHeader(doc, 'Player Statistics', title);

  const rows = playerRows(playerStats, playerNames);

  autoTable(doc, {
    startY: 35,
    head: [['Player', 'SA', 'ACE', 'ACE%', 'REC', 'APR', 'ATT', 'K', 'HIT%', 'BS', 'BA', 'DIG']],
    body: rows.map(r => [
      r.name,
      fmtCount(r.sa),
      fmtCount(r.ace),
      fmtPct(r.ace_pct),
      fmtCount(r.pa),
      fmtPassRating(r.apr),
      fmtCount(r.ta),
      fmtCount(r.k),
      fmtHitting(r.hit_pct),
      fmtCount(r.bs),
      fmtCount(r.ba),
      fmtCount(r.dig),
    ]),
    styles: { fillColor: SURFACE, textColor: WHITE, fontSize: 8 },
    headStyles: { fillColor: PRIMARY, textColor: WHITE, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: DARK },
    theme: 'grid',
  });

  // ── Pages 3+: Per-set player stats ──────────────────────────────────────────
  for (const { set, players, team } of perSetStats) {
    doc.addPage();
    const setScore = `${set.our_score ?? 0} – ${set.opp_score ?? 0}`;
    addPageHeader(doc, `Set ${set.set_number} Statistics`, `${title}  ·  ${setScore}`);

    // Set team totals
    autoTable(doc, {
      startY: 35,
      head: [['', 'SA', 'ACE', 'ACE%', 'K', 'HIT%', 'AST', 'BS', 'DIG']],
      body: [[
        'Team',
        fmtCount(team.sa),
        fmtCount(team.ace),
        fmtPct(team.ace_pct),
        fmtCount(team.k),
        fmtHitting(team.hit_pct),
        fmtCount(team.ast),
        fmtCount(team.bs),
        fmtCount(team.dig),
      ]],
      styles: { fillColor: SURFACE, textColor: WHITE, fontSize: 9 },
      headStyles: { fillColor: [60, 80, 100], textColor: WHITE, fontStyle: 'bold' },
      theme: 'grid',
    });

    // Per-set player rows
    const setRows = playerRows(players, playerNames);
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 6,
      head: [['Player', 'SA', 'ACE', 'ACE%', 'REC', 'APR', 'ATT', 'K', 'HIT%', 'BS', 'BA', 'DIG']],
      body: setRows.map((r) => [
        r.name,
        fmtCount(r.sa),
        fmtCount(r.ace),
        fmtPct(r.ace_pct),
        fmtCount(r.pa),
        fmtPassRating(r.apr),
        fmtCount(r.ta),
        fmtCount(r.k),
        fmtHitting(r.hit_pct),
        fmtCount(r.bs),
        fmtCount(r.ba),
        fmtCount(r.dig),
      ]),
      styles: { fillColor: SURFACE, textColor: WHITE, fontSize: 8 },
      headStyles: { fillColor: PRIMARY, textColor: WHITE, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: DARK },
      theme: 'grid',
    });
  }

  // ── Rotation analysis ────────────────────────────────────────────────────────
  doc.addPage();
  addPageHeader(doc, 'Rotation Analysis', title);

  const rotBody = Object.entries(rotationStats.rotations).map(([n, r]) => [
    `Rotation ${n}`,
    fmtPct(r.so_pct),
    `${r.so_win}/${r.so_opp}`,
    fmtPct(r.bp_pct),
    `${r.bp_win}/${r.bp_opp}`,
  ]);

  autoTable(doc, {
    startY: 35,
    head: [['Rotation', 'SO%', 'SO W/L', 'SP%', 'SP W/L']],
    body: [
      ...rotBody,
      ['Overall', fmtPct(rotationStats.so_pct), '', fmtPct(rotationStats.bp_pct), ''],
    ],
    styles: { fillColor: SURFACE, textColor: WHITE, fontSize: 9 },
    headStyles: { fillColor: PRIMARY, textColor: WHITE, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: DARK },
    theme: 'grid',
  });

  doc.save(filename);
}
