# VBAPPv.2 Memory

## Daily Logs

### 2026-02-24
- Project created: VBAPPv.2
- Stack decided: React 18 + Vite 6 + Dexie 4 + Zustand 5 + Tailwind 3 + PWA
- Modeled after iStatVball — full stat parity (80+ stats), court-based RallyFlow entry, high school NFHS rules
- Solo user, offline-first, no backend, no auth APIs
- 5-phase build plan approved: Foundation → Match Flow → Stats Engine → Reports → PWA Polish
- Phase 1 complete + optimized; ready for Phase 2

### Phase 1 Optimization Pass
- Schema indexes reordered: contacts → `match_id, player_id, action, set_id, rally_id`; matches → `status, date, season_id`; players/teams/seasons indexes tightened
- Removed date-fns (unused); replaced with native Intl.DateTimeFormat
- Created `src/constants/index.js`: all enums, NFHS rules, coordToZone helper
- uiStore: added named selectors (selectToast, selectModal, selectShowToast, etc.)
- React.memo applied to Button, Badge, Spinner, EmptyState
- NavBar: collapsed duplicate slice/map into single loop with FAB slot
- HomePage: single useLiveQuery instead of two; JS-filters in-memory (50% fewer subscriptions)
- TeamDetailPage: useMemo for active/inactive player splits
- All form saves: try/catch + showToast error feedback
- seeds.js: removed undeclared fields (abbreviation, city, state, age_group)
- matchStore: extracted INITIAL_STATE constant; DRY reset
- Drawer: removed unused `side` prop
- Build size: 377 modules → 74 modules (3x reduction in module count); JS bundle 424KB → 405KB gzip

### Phase 2 UI Design Session — 2026-02-24

**Live Match Screen — Final Spec (DO NOT BUILD WITHOUT THIS)**

Platform: Landscape-only during live match (screen locks on navigate)

Score Header (full width):
- Left: our timeout circles (○○ → ✕✕ as used)
- Center: US [sets] | SET # | [sets] THEM — current score — serve dot (●)
- Right: their timeout circles + Libero box (small, top-right)
  - Libero box: name, jersey, [SUB IN/OUT] button, ◉ ON / ○ OFF indicator
  - Libero swap is free (no sub counted), grays out when no eligible back-row middle

Court Grid (2 rows × 3 tiles):
- Front row (top):    S4 | S3 | S2   (left → right)
- Back row (bottom):  S5 | S6 | ★S1  (left → right, S1 = server, bottom-right)
- ★ star highlights current server tile (orange border glow)
- Auto-rotation on sideout: S labels shift clockwise, ★ follows S1

Player Tile — 16 buttons, IDENTICAL on all 6 tiles:
  Row 1 (attack):       [ATT]  [K]   [ERR]
  Row 2 (defense):      [DIG]  [BLK]
  Row 3 (serve toggle): [FL●]  [TP]          ← persistent per-tile toggle
  Row 4 (serve):        [SATT] [ACE] [SE]    ← records with active serve type
  Row 5 (recv toggle):  [FL●]  [TP]          ← persistent per-tile toggle
  Row 6 (receive):      [0]    [1]   [2]  [3] ← records with active receive type
  Row 7 (errors):       [L]    [DBL] [NET]

Action Bar (bottom):
  [+US]  [+THEM]  [UNDO]  [SUB]  [≡]
  - +US / +THEM: quick point, no stat required, still auto-rotates
  - UNDO: removes last stat entry
  - SUB: opens sub modal (counts against 12-sub limit)
  - ≡: menu (end set, end match, live stats log)

Timeout rules (NFHS): 2 per team per set, reset each set
Libero rules (NFHS): free swaps, cannot serve/attack/block
Serve types: FL = float, TP = topspin — stored on every serve and receive contact
Libero rule update: libero CAN serve (S1) — no position restriction

### Phase 2 Implementation — 2026-02-24

**Files built:**
- `src/store/matchStore.js` — full rewrite with all actions (addPoint, undoLast, recordContact, substitutePlayer, swapLibero, useTimeout, endSet, tapHblk, adjustScore, rotateForward, rotateBackward)
- `src/constants/index.js` — added ACTION.ERROR = 'error'
- `src/components/court/PlayerTile.jsx` — 6 rows (2 serve chord rows + attack + defense + pass + errors); all rows/buttons flex-1; onPointerDown for zero tap delay
- `src/components/court/CourtGrid.jsx` — 3×2 grid; GRID_ORDER=[3,2,1,4,5,0]; gap-px hairline separators
- `src/components/match/ScoreHeader.jsx` — h-11; [ourSetsWon] [TimeoutDots] [−score+] [SET# ●] [−score+] [TimeoutDots] [oppSetsWon] [LiberoBox]
- `src/components/match/LiberoBox.jsx` — ◉/○ indicator, IN/OUT button, canSwap checks S5/S6 availability
- `src/components/match/ActionBar.jsx` — ↺ROT, ↻ROT, UNDO (yellow when available), SUB (x/12), ≡
- `src/components/match/SubstitutionModal.jsx` — uses useLiveQuery for bench players, two-step pick (out → in)
- `src/components/match/MenuDrawer.jsx` — End Set, End Match buttons
- `src/pages/LiveMatchPage.jsx` — landscape lock, Dexie hydration on mount, auto-detects libero by position === 'L'
- `src/pages/MatchSetupPage.jsx` — season picker + opponent input + format toggle + 6-slot lineup builder

**Key decisions:**
- Serve type stored as chord buttons (2×3 grid per tile: FL·ATT/ACE/ERR + TS·ATT/ACE/ERR) — no per-tile toggle state needed
- serveToggles/receiveToggles removed from matchStore entirely (dead state after chord redesign)
- HBLK pending mechanic: pendingHblk:{playerId} in store; 3 visual states (normal/mine/partner); same-player re-tap cancels
- Manual rotation buttons in ActionBar; +US/+THEM removed; score nudge (−/+) added under each score in ScoreHeader
- rotateFwd/rotateBwd pure helpers extracted — shared by rotateForward, rotateBackward, addPoint, undoLast
- matchStore.setMatch() signature: (matchId, setId, teamId)
- Player badge strip: #{jersey} · {playerName} · S{position} · {positionLabel} · ★ (dot separators)
- MatchSetupPage: db.lineups.bulkAdd() (atomic) instead of 6 sequential awaits
- Build: 83 modules, 430KB gzip — clean

**Phase 2 Optimization Pass:**
- matchStore: removed dead serveToggles/receiveToggles state+actions; extracted rotateFwd/rotateBwd helpers; merged swapLibero double-set into one; simplified adjustScore key computation
- PlayerTile: removed unreachable `slot?.playerId` guards after empty-slot early return; simplified tap to arrow fn
- SubstitutionModal: removed dead `showToast` stub; fixed `title={\`Substitution\`}` → `title="Substitution"`
- MatchSetupPage: 6 sequential `await db.lineups.add()` → single `db.lineups.bulkAdd()`

### 2026-02-26 — Phase 3: Stats Engine Complete

- Installed vitest v4; added `test` / `test:watch` scripts to package.json; configured vite.config.js test block
- `engine.js`: added `computeFreeballOutcomes(contacts, rallies)` — computes FBO%/FBD% by joining contact rally_id to rally map; added `computeSeasonStats(seasonId)` — aggregates contacts/rallies across all season matches; updated `computeMatchStats` to include freeball outcomes
- `queries.js`: added `getRalliesForMatches(matchIds)` — two-hop query (match_ids → set_ids → rallies) for season-level stats
- `formatters.js`: already complete; no changes needed
- Tests: 43 unit tests written in `src/stats/__tests__/engine.test.js`, all passing — covers accumulation, hitting%/pass avg/SO% edge cases, freeball outcomes, per-rotation stats, all formatters
- Phase 3 fully complete; ready for Phase 4 (MatchSummaryPage, ReportsPage, Recharts, CourtHeatMap, PDF/CSV export)

### 2026-02-26 — Phase 4: Reports & Analytics Complete

**New files:**
- `src/stats/export.js` — `exportMatchCSV` (PapaParse) + `exportMatchPDF` (jsPDF + autoTable, 3 pages: match header/team totals, player stats, rotation analysis)
- `src/components/stats/StatTable.jsx` — reusable sortable table; click header to sort asc/desc
- `src/components/charts/HittingBarChart.jsx` — Recharts BarChart; green/yellow/red color by threshold
- `src/components/charts/RotationRadarChart.jsx` — Recharts RadarChart; SO%/BP% per rotation as dual series
- `src/components/charts/SideoutPieChart.jsx` — Recharts PieChart; win/loss donut
- `src/components/charts/TrendLineChart.jsx` — Recharts LineChart; stat over time, multi-series
- `src/components/charts/CourtHeatMap.jsx` — SVG 3×2 zone grid, log-scale orange opacity, toggle: attack kills/errors, serve aces/errors, digs

**Modified:**
- `src/pages/MatchSummaryPage.jsx` — full build: match header, set scores strip, team totals, 6-tab StatTable (Serving/Passing/Attacking/Blocking/Defense/Rotation), RadarChart + CourtHeatMap on Rotation tab, PDF/CSV export buttons
- `src/pages/ReportsPage.jsx` — full build: team/season filter dropdowns, 4-tab layout (Team Stats grid + HittingBarChart, Player Stats StatTable, Rotation Analysis with SideoutPieChart + RadarChart + table, Heat Map CourtHeatMap), computeSeasonStats integration

**Build:** Clean ✓ — 981 modules, 409KB gzip (chunk size warning expected — Recharts + jsPDF, no CDN)
**Phase 5 next:** PWA service worker, install prompt, backup/restore, storage quota warning

### 2026-02-26 — Phase 5: PWA Polish Complete

**New files:**
- `src/stats/backup.js` — `exportBackup()` (full JSON download) + `importBackup(file)` (validate version, clear all tables in reverse order, bulkAdd preserving IDs)
- `public/icons/icon-192.png`, `icon-512.png`, `apple-touch-icon.png` — generated with Python struct+zlib (solid orange + volleyball circle)

**Modified:**
- `src/pages/SettingsPage.jsx` — added install banner (Android promptInstall + iOS step-by-step), import backup button (file input → ConfirmDialog → importBackup), storage usage display, storage warning banner (>80%), wired backup.js replacing inline backup logic
- `vite.config.js` — navigateFallback → offline.html, runtimeCaching: CacheFirst app-shell-v1 (JS/CSS/HTML, 30d) + assets-v1 (PNG/SVG/fonts, 30d), maskable icon added to manifest

**Build:** Clean ✓ — 983 modules, 410KB gzip, precache 17 entries (was 11), sw.js + workbox generated
**Tests:** 43/43 passing

**ALL 5 PHASES COMPLETE. App is fully built.**
- Phase 1: Foundation (DB, constants, stores, base pages) ✅
- Phase 2: Live Match Screen (PlayerTile chords, court grid, matchStore) ✅
- Phase 3: Stats Engine (engine.js, queries.js, formatters.js, 43 tests) ✅
- Phase 4: Reports & Analytics (charts, StatTable, MatchSummaryPage, ReportsPage, PDF/CSV) ✅
- Phase 5: PWA Polish (icons, SW caching, install prompt, backup/import, storage warning) ✅

### 2026-02-26 — UI Adjustments (post Phase 5)

**PlayerTile (`src/components/court/PlayerTile.jsx`):**
- Player badge strip: height 17px → 51px; restructured to column layout with jersey/position row on top, player name centered below (18px info, 22px name)
- Button rows: added `p-[3px] gap-[3px]` to all rows for "button moat" spacing; removed edge borders; added `rounded-md`; text doubled (10px → 20px for Btn, 8/10px → 16/20px for ServeBtn)
- Score-wiring: FL ACE, TS ACE, K, SBLK now call `tapAndScore` (recordContact + addPoint SIDE.US)
- Added `SIDE` import; added `addPoint` selector; added `tapAndScore` async helper

**matchStore (`src/store/matchStore.js`):**
- HBLK: after partner confirmation writes both block assist contacts, now also calls `get().addPoint(SIDE.US)`

**ScoreHeader (`src/components/match/ScoreHeader.jsx`):**
- Height: h-11 (44px) → h-[66px] (1.5×)
- All elements scaled 1.5×: score text-xl → text-[2rem], nudge buttons 20×16px → 30×24px (text 10px → 15px), timeout dots 12px → 18px, set label/US/THEM labels 9px → 13px
- Scores pulled toward center with flex spacers
- Home team name displayed left of home score, away team name right of away score

**LiveMatchPage (`src/pages/LiveMatchPage.jsx`):**
- Added `teamName` + `opponentName` state; loaded from `db.teams` and `match.opponent_name` in `init()`; passed as props to ScoreHeader

### 2026-03-03 — Post-Phase-5 Feature Additions

**New files (since Feb 26 log):**
- `src/components/match/TimeoutOverlay.jsx` — full-screen timeout modal (shows score, set, teams, countdown)
- `src/components/match/LiberoPickerModal.jsx` — picker to assign libero from roster mid-match
- `src/components/match/LiberoSwapModal.jsx` — picker for which back-row player libero swaps with
- `src/components/match/LineupForm.jsx` — shared lineup builder UI (serve order dropdowns, libero picker, CourtZonePicker)
- `src/components/court/CourtZonePicker.jsx` — 3×2 SVG court zone picker, serveOrderToZone() helper
- `src/components/stats/PointQualityPanel.jsx` — earned/given/free points breakdown panel
- `src/components/stats/LiveStatsModal.jsx` — full-screen stat modal (7 tabs: POINTS/SERVING/PASSING/ATTACKING/BLOCKING/DEFENSE/VER); SERVING tab has ALL/FLOAT/TOP sub-toggle
- `src/components/match/OppScoringColumn.jsx` — narrow right column on court grid for quick opponent stat entry (K/BLK/SE/AE/BHE/NET), calls addOppPoint()
- `src/pages/SetLineupPage.jsx` — between-set lineup editor; loads all sets for match, pre-populates from existing lineup rows, saves and navigates to live
- `src/pages/SeasonsPage.jsx` — season list page (browse by team/season)
- `src/pages/SeasonDetailPage.jsx` — season detail with match list

**Modified files:**
- `matchStore.js`: added addOppPoint() action using OPP_REASON map; added format field to INITIAL_STATE; added clearPendingSetWin(); added resetCurrentSet(); pendingSetWin logic in addPoint(); added getStatLabel() + setFeed() feed system; auto-libero swap on rotation; teamJerseyColor/liberoJerseyColor in store
- `ScoreHeader.jsx`: complete redesign — RunStrip with live team stats + run detection + flame pulse; score hold-3s nudge popup; libero box moved left at ~15% position
- `CourtGrid.jsx`: added computeHeat() per-player heat map; getBaseDisplayOrder() and getServeReceiveDisplayOrder() for smart tile arrangement during rally vs serve receive
- `PlayerTile.jsx`: jersey SVG rendering with teamJerseyColor/liberoJerseyColor from store; live stats bar (K/ACE/DIG/BLK/SE/AE/APR chips with heat icons); serve toggle (FLOAT/TOP SERVE) replacing chord buttons; SE/AE/pass-0 call tapAndScoreThem; tapAndScoreThem helper added; bug fix: initial serveType state changed 'FL' → SERVE_TYPE.FLOAT
- `ActionBar.jsx`: hold-to-rotate (450ms hold+progress bar) for ROT BACK/ROT FWD; undoLabel derived from lastFeedItem; canSwapLibero check; HOME button added
- `LiveMatchPage.jsx`: OppScoringColumn added; LiberoPickerModal + LiberoSwapModal wired; pendingSetWin ConfirmDialog (end set or end match); portrait guard overlay; teamName/opponentName loaded with abbreviation support; screenH via window.innerHeight
- `MatchSetupPage.jsx`: jersey color picker (black/blue/white/neon-green) for team + libero; opponent abbreviation field; conference/location/matchType fields; saved lineup load; opponent upsert to db.opponents
- `TeamsPage.jsx`: full org+team management with OrgFormModal + TeamFormModal; abbreviation field on teams
- `TeamDetailPage.jsx`: 3-tab layout (Roster/Lineups/Seasons); SavedLineupModal with LineupForm; saved_lineups CRUD; player fields: secondary_position, is_captain, year, height_ft/height_in; ConfirmDialog on delete
- `engine.js`: added computeOppDisplayStats() (for RunStrip), computePointQuality() (for LiveStatsModal)
- `hooks/useMatchStats.js`: new hook wrapping computePlayerStats/computeTeamStats/computeOppDisplayStats/computePointQuality from committed contacts
- `hooks/useTeamData.js`: added useTeam(), useMatches(); useOrganizations() added for TeamsPage
- `db/schema.js`: version 2 adds saved_lineups table (++id, team_id)
- `router.jsx`: added /seasons, /seasons/:seasonId, /matches/:matchId/set-lineup routes

**Key decisions:**
- OppScoringColumn: narrow right column (w-[30px]) adjacent to court grid; 6 buttons for K/BLK/SE/AE/BHE/NET; green = opponent error (we score), red = opponent scores
- addOppPoint: records opponent_contact=true contact + calls addPoint(); enables RunStrip opp stat display
- CourtGrid rearranges tiles during in_rally (base position order) vs serve receive (setter-dependent layout)
- Heat map: 5 categories (attack/serve/pass/dig/block) computed once per render in CourtGrid, passed to each PlayerTile
- LiveMatchPage pendingSetWin: ConfirmDialog with "end set" vs "end match" auto-detection based on setsNeeded
- Auto-libero swap: triggers on rotation with liberoId set; front-row → swap OUT, back-row → swap IN
- Portrait guard: fixed overlay shows rotate instruction (Safari on iPad ignores orientation lock)

### 2026-03-03 — Bug Fix

- `PlayerTile.jsx`: Initial serveType state was `'FL'` but `SERVE_TYPE.FLOAT = 'float'`. Neither toggle button appeared active and serve buttons showed wrong color on first render. Fixed: `useState('FL')` → `useState(SERVE_TYPE.FLOAT)`.

### 2026-03-06 — Animation Pass

**Serve receive → base position slide**: Already fully implemented (FLIP animation in CourtGrid `useLayoutEffect`). Fires when `rallyPhase` changes to `in_rally` (serve tap) → cells reorder → FLIP slides tiles to new positions.

**Sub ghost animation** (`index.css`):
- Added `sub-ghost-exit` keyframes (opacity + translateY up, 680ms) — outgoing player name drifts away
- Added `sub-name-enter` keyframes (scale + translateY up from below, 380ms spring) — incoming player name pops in
- Both classes already referenced in CourtGrid/PlayerTile; just needed the CSS

**Timeout pip pop** (`ScoreHeader.jsx`):
- Replaced `TimeoutBox` single button design with two individual pip circles (○ ○ → × ×)
- Each pip uses `key={i}-${isUsed}` trick — React remounts element on transition, triggering `timeout-pip-pop`
- Added `timeout-pip-pop` keyframes (scale 1→1.75→0.9→1, 360ms spring) to CSS

**Score sparkline** (`ScoreHeader.jsx`):
- Added `ScoreSparkline` component — SVG polyline of score differential (last 24 points)
- `pointHistory` from matchStore drives it; `diffs` computed as cumulative +1/-1
- Auto-scales to maxAbs, color = orange (us leading) / red (them leading) / slate (tied)
- Placed below "Set N" label in center block
- Added `pointHistory` Zustand selector to `ScoreHeader`

**Build:** Clean ✓ — 432KB gzip

### 2026-03-13 — 8 New Volleyball Animations

**index.css** — 8 new keyframes added: `jersey-pop`, `equalize-flash`, `tied-label-in`, `net-flash`, `pass-ripple`, `libero-ghost-exit`, `ball-arc-x/y/fade`, `tile-rotate-right/left/up/down`

**PlayerTile.jsx:**
- `flashEl()` made generic (accepts `cls` param, defaults `btn-flash`)
- `jerseyRef` added to jersey number span — `jersey-pop` fires on every contact record
- Pass ripple: `rippleKey`/`rippleColor` state; radial circle expands from tile on 0/1/2/3 tap (red/orange/yellow/green)

**ScoreHeader.jsx:**
- `EmberCanvas` component: rAF particle system inside RunStrip, activates at 5+ run, intensity scales with count
- Equalize flash: `isTied` effect fires `tiedFlashKey` when newly tied at 20+; white flash overlay + "TIED" micro-label

**CourtGrid.jsx:**
- `ACTION`/`RESULT` imported from constants
- Single `committedContacts` watcher dispatches: ball arc (ACE/KILL) + net flash (BLOCK/NET)
- Ball arc: `BallArc` component — split translateX/Y parabola, `fixed` positioning, 680ms, clears via timer
- Net flash: absolute orange gradient line at 50% height of grid, 480ms fade
- Libero ghost: `liberoGhosts` Set tracks which grid indices had libero swap; emerald tint + blur vs standard white ghost
- Rotation carousel: `ROTATION_NUDGE` array maps each cell to `tile-rotate-right/left/up/down`; replaces `tile-rotating` border-only flash with combined nudge + border keyframe

**Build:** Clean ✓ — 451KB gzip

### 2026-03-13 — Animation Wrap-Up

- Reviewed all animation code from 2026-03-06 pass — confirmed fully implemented in codebase
- Fixed `Confetti.jsx`: hardcoded "LAKE ZURICH WINS" → dynamic `{teamName || 'HOME'}<br />WINS`; added `teamName` prop
- Wired `teamName` state from `LiveMatchPage` into `<Confetti>` call
- **Build:** Clean ✓ — 451KB gzip (size increase is from additional modules added since Mar 6, not regression)

### 2026-03-17 — Practice Tools Persistence + Records Live Tracking

**Schema:**
- Added Dexie schema version 6: `practice_sessions` table (`++id, team_id, tool_type, date`) — additive only, no migration

**ServeTrackerPage (`src/pages/tools/ServeTrackerPage.jsx`):**
- SetupView: queries last 10 `serve_tracker` sessions via `useLiveQuery`; renders Recent Sessions list; passes `teamId` through `onStart`
- TeamSessionView + IndividualSessionView: added Save button (disabled when `stats.total === 0`); `handleSave()` persists session to `practice_sessions`; shows toast on success
- Session state shape: `{ mode, label?, players?, teamId }`

**ServeReceivePage (`src/pages/tools/ServeReceivePage.jsx`):**
- SetupView: queries last 10 `serve_receive` sessions; renders Recent Sessions list
- SessionView: Save button (disabled when `totalPasses === 0`); `handleSave()` serializes all player stats + APR

**PracticeGamePage (`src/pages/tools/PracticeGamePage.jsx`) — new file:**
- SetupView: team picker, opponent text input, player multi-select, Recent Sessions history (W/L + set scores)
- GameView: score header with `ourScore`/`oppScore`/`sets[]`; player tabs; action grid (Kill/Error/Ace/SE/Dig/Block/Pass 0-3); point side effects (Kill/Ace/Block = us, Error/SE = opp); undo stack (clears on End Set); per-player stat grid
- Saves to `practice_sessions` with `tool_type: 'practice_game'`; label format: `"vs Blue Team (W 2-1)"`

**Router + ToolsPage:**
- Added `/tools/practice-game` route pointing to `PracticeGamePage`
- Added Practice Game card to `ToolsPage` TOOLS array

**TeamDetailPage (`src/pages/TeamDetailPage.jsx`):**
- Added 5th "Practice" tab; queries all `practice_sessions` for team via `useLiveQuery`
- Sessions grouped by `tool_type` (practice_game / serve_receive / serve_tracker); each row shows date, label, tool-specific summary stat

**Records live tracking fix:**
- `useRecordAlerts.js`: exported `computeMilestone` so it can be imported in LiveStatsModal
- `LiveMatchPage.jsx`:
  - Removed type filter from records fetch (now fetches all record types for team)
  - Added `allMatchContacts` useLiveQuery: `db.contacts.where('match_id').equals(matchId).toArray()`
  - Added `matchPlayerStats` + `matchTeamStats` via `useMemo` using `computePlayerStats`/`computeTeamStats` (full match scope, not set-scoped); fixes the `committedContacts` reset-on-endSet bug
  - Passes `records` prop to `<LiveStatsModal>`
- `LiveStatsModal.jsx`:
  - Replaced `RecordAlertPanel` with new `RecordsProgressPanel` component
  - `RecordRow`: per-record progress bar with milestone badge (🏆 RECORD / ⚡ TIED / 🔥 1 AWAY / ▲ 90%+ / ▲ 80%+), current/record values, `−N` remaining count
  - `RecordsProgressPanel`: handles all 4 record types — `individual_match`/`team_match` get progress bars (grouped by player, on-court first); `individual_season`/`team_season` shown as static reference section (free-text stat can't map to TRACKABLE_STATS keys)
  - Empty state points user to Teams → Records when no records set

**Key bug fixed:** `committedContacts` resets to `[]` on every `endSet()`, making `useMatchStats()` set-scoped only. Fixed by querying `db.contacts` directly by `match_id` for full-match record tracking.

### 2026-03-19 — Serve Zone Integration & Test Fix

**Review of uncommitted work (8 files, ~386 lines delta):**
- `matchStore.js`: Added `pendingServeContact`, `serveReticles`, `confirmServeZone`, `dismissServeZoneModal`, `loadServeReticles` — full serve zone tracking pipeline
- `LiveMatchPage.jsx`: Imports and mounts `ServeZoneModal`; loads `serveReticles` on init; `priorContacts` + `allMatchContacts` merge for cross-set record tracking
- `LiveStatsModal.jsx`: Added `ServeZoneStatsPanel` (zone heatmap + table in SERVING tab), `OffenseBalanceChart` (stacked kill-share bar + TA bars + stats table, set/match scope toggle), `ISvsOOSTable` (IS/OOS/FREE dig/transition attack per rotation), full-match scope stats via `useLiveQuery`
- `CourtGrid.jsx`: Added `KillBurst`, `KillFirework`, `KillBadge`, `AceCelebration`, `BlockHands`, `PerfectPassBadge` particle/celebration components
- `engine.js`: Added `computeISvsOOS`, `computeFreeDigWin`, `computeTransitionAttack`, `computeRunsByRotation`, `computeFreeballOutcomes`, `computePointQuality`
- `PlayerTile.jsx`: Serve row with FLOAT/TOP type selector + unlock mechanic; SE → OB/NET secondary picker; pass ring + ripple animations; heat-icon chips in live stats bar
- `queries.js`: Complete — no new changes vs prior session
- `uiStore.js`: No net changes
- `ServeZoneModal.jsx` (new): SVG court tap-to-zone, 6-zone FIVB grid, pending/confirmed reticle overlays, SKIP/CONFIRM buttons

**Test fix:**
- `computeFreeballOutcomes` tests used `rally_id`/`id` join but engine uses `set_id + rally_number`
- Updated 4 test cases to provide `set_id` + `rally_number` on contacts/rallies — 43/43 passing

**Build:** Clean ✓ — 1011 modules, 476KB gzip

### 2026-03-19 (continued)

**IS/OOS full redefinition:**
- Rewrote `computeISvsOOS` in `engine.js` — new definition: per rally, find the first offensive contact after the serve-receive pass (by timestamp). IS = pass rated 3, OOS = pass rated 1 or 2. First offensive contact = `action='attack'` or `action='set'` with `result='ball_handling_error'` (BHE/lift). Stats tracked: TA / K / AE / K% / HIT% / WIN% (where WIN% = rally wins / attacks in bucket). Ball-comes-back attacks are excluded because only the FIRST offensive contact per rally is counted. Return shape changed from `{is_pa, is_won, oos_pa, oos_won}` to `{is: {ta,k,ae,win,k_pct,hit_pct,win_pct}, oos: same}` per slot.
- Updated `LiveStatsModal.jsx`: `EMPTY_ISVSOOS` updated to new shape; `ISvsOOSTable` rows now show IS ATK / IS K% / IS HIT% / IS WIN% + OOS ATK / OOS K% / OOS HIT% / OOS WIN%.
- Updated `ReportsPage.jsx`: `ISOOS_COLS` now 9 columns (Rot + 4 IS + 4 OOS); `isOosRows` useMemo updated; IS/OOS summary box now shows 8 stats (IS ATK/Win%/K%/HIT% + OOS same).
- All 43 tests passing ✓

## Weekly Summaries

## Monthly Summaries
