# VBAPPv.2 — Project Overview

## What This Is
A Progressive Web App for recording and analyzing high school volleyball statistics.
Modeled after iStatVball. Solo user, no backend, no auth. Fully offline-first via IndexedDB (Dexie.js).

## Stack
- React 18 + Vite 6
- Dexie 4 (IndexedDB ORM)
- Zustand 5 (live match state)
- Tailwind CSS 3
- vite-plugin-pwa 0.21 (Workbox)
- Recharts 2
- jsPDF 2 + PapaParse 5

## Project Root
~/VBAPPv.2/app/   (Vite project root)

## Key Architecture Decisions
1. All data lives in IndexedDB via Dexie. No API calls, no server.
2. Live match state is Zustand (fast, in-memory). Stat taps write to Dexie immediately (no rally batching).
3. Stats engine reads from Dexie contacts table. Two modes: live (memo selectors) and report (full scan).
4. Live match screen is LANDSCAPE ONLY — use screen orientation lock API on mount.
5. Rotation tracking: S1–S6 labels. S1 = current server (bottom-right tile). Rotates clockwise on sideout.
6. Libero swaps are free (no sub counted). Libero box is a dedicated UI element, not a standard sub.
7. Serve type (FL/TP) and receive type (FL/TP) are per-tile toggles, stored on every serve/receive contact.
8. Assist is back-assigned: set contact.result updated to 'assist' when subsequent attack = kill.

## Live Match Screen Spec

### Layout (landscape)
- **Score header**: our timeouts (○○) | US [sets] SET# [sets] THEM score ──●── score | their timeouts | libero box
- **Court grid**: 2 rows × 3 tiles. Front row top (S4|S3|S2), back row bottom (S5|S6|★S1). S1 = server, bottom-right.
- **Action bar**: [+US] [+THEM] [UNDO] [SUB] [≡]

### Player Tile (16 buttons, identical on all 6)
```
[ATT]  [K]    [ERR]        attack
[DIG]  [BLK]               defense
[FL●]  [TP]                serve type toggle (persistent per tile)
[SATT] [ACE]  [SE]         serve stats (recorded with active serve type)
[FL●]  [TP]                receive type toggle (persistent per tile)
[0]    [1]    [2]   [3]    serve receive rating (recorded with active receive type)
[L]    [DBL]  [NET]        other errors (lift, double, net touch)
```

### Libero Box (top-right of header)
- Shows: jersey #, name, [SUB IN / SUB OUT] button
- Indicator: ◉ green = on court, ○ gray = off court
- Grayed + non-tappable when no eligible back-row middle exists
- **Libero CAN serve (S1) — no position restriction**
- Swap is free (NFHS libero rule)

### Timeouts
- 2 per team per set (NFHS). Shown as ○○ → ✕✕ as used. Tap circle to mark used.
- Resets to ○○ at start of each new set.

### Serve/Receive Type Storage
- serve_type field on contact: 'float' | 'topspin'
- receive_type field on contact: 'float' | 'topspin'
- Tile toggle state lives in Zustand (per playerId), not Dexie

## Orchestrator Behavior
- Always read the relevant directive before starting work on a capability.
- After editing stats formulas, run the stats unit tests in app/src/stats/__tests__/.
- Never touch the Dexie schema version number without a migration plan.
- Phase order is strict: 1 → 2 → 3 → 4 → 5.

## Current Phase
Phase 2 (complete — live match screen built)

## Agent Directives
- 01-db-schema.md      DB schema, migrations, seed data
- 02-rally-flow.md     Court entry UI, RallyFlow state machine
- 03-stats-engine.md   Stats formulas, queries, live display
- 04-reports.md        Charts, heat maps, PDF/CSV export
- 05-pwa-polish.md     PWA, offline, install, backup

## Known Constraints
- iOS Safari: beforeinstallprompt is not supported. Use manual "Add to Home Screen" instructions.
- IndexedDB storage limits: warn user at 80% of estimated quota (navigator.storage.estimate()).
- Tailwind 4 is not yet stable — stay on 3.x.
- jsPDF canvas rendering requires images to be pre-loaded before PDF generation.

## Learnings

### Phase 1
- Dexie schema: contacts index order is `match_id, player_id, action, set_id, rally_id` — match_id first for broadest stat queries
- Removed date-fns; use `Intl.DateTimeFormat` natively (saves ~13KB gzip)
- All enums (positions, statuses, actions, results, NFHS rules) live in `src/constants/index.js`
- uiStore exposes named selectors (selectToast, selectShowToast, etc.) — always use selectors, not inline lambdas
- useActivePlayers() hook available for lineup builder; usePlayers() + useMemo for pages that need both active/inactive
- React.memo applied to all UI primitives (Button, Badge, Spinner, EmptyState)
- All form saves wrapped in try/catch with showToast error feedback
- matchStore uses INITIAL_STATE constant — resetMatch() is a single set(INITIAL_STATE) call

### Phase 2
- PlayerTile: 6-row chord layout — 2 serve rows (FL·ATT/ACE/ERR, TS·ATT/ACE/ERR), attack, defense, pass, errors; all rows/buttons flex-1, zero dead space
- CourtGrid: gap-px bg-slate-700 grid for hairline tile separators; GRID_ORDER=[3,2,1,4,5,0] for FIVB position layout
- ACTION.ERROR ('error') added to constants — used for L/DBL/NET contacts
- matchStore: ourTimeouts/oppTimeouts split; teamId, liberoId, liberoOnCourt, pendingHblk added to INITIAL_STATE
- matchStore.setMatch() signature: (matchId, setId, teamId)
- No serveToggles/receiveToggles in store — serve type encoded in chord buttons (FL or TS + result = one tap)
- rotateFwd/rotateBwd pure helpers shared by rotateForward, rotateBackward, addPoint, undoLast
- HBLK: pendingHblk state; first tap = pending; second different player = both contacts written; same player re-tap = cancel
- ActionBar: ↺/↻ ROT manual rotation + UNDO + SUB(x/12) + ≡; no +US/+THEM buttons
- ScoreHeader: [ourSets][TimeoutDots][−score+][SET# ●][−score+][TimeoutDots][oppSets][LiberoBox]; h-11
- Player badge strip: #{jersey} · {playerName} · S{position} · {positionLabel} · ★
- MatchSetupPage: db.lineups.bulkAdd() for atomic lineup write
- player field: jersey_number (not jersey) — used consistently across store/components
- Libero CAN serve (S1) — no position restriction enforced
- LiveMatchPage hydrates store from Dexie on mount; auto-detects libero by position === 'L'
