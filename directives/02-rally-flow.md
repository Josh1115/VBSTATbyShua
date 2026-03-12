# Directive 02 — Live Match UI

## Responsibility
Own `app/src/pages/LiveMatchPage.jsx`, `app/src/store/matchStore.js`,
and all components under `app/src/components/match/`.

## Screen Orientation
Lock to landscape on mount:
```js
screen.orientation.lock('landscape').catch(() => {});
// Unlock on unmount
```

## Layout Structure
```
┌─────────────── ScoreHeader ───────────────────────────────┬──────────────┐
│  ○○  US [1]   SET 2   [1] THEM   21 ──●── 18   ✕○        │  LiberoBox   │
├───────────────────────────────────────────────────────────┴──────────────┤
│                         CourtGrid                                         │
│   ┌──── S4 ────┐   ┌──── S3 ────┐   ┌──── S2 ────┐   ← front row (top) │
│   │ PlayerTile │   │ PlayerTile │   │ PlayerTile │                       │
│   └────────────┘   └────────────┘   └────────────┘                       │
│   ┌──── S5 ────┐   ┌──── S6 ────┐   ┌──★─S1─────┐   ← back row (bottom)│
│   │ PlayerTile │   │ PlayerTile │   │ PlayerTile │                       │
│   └────────────┘   └────────────┘   └────────────┘                       │
├───────────────────────────────────────────────────────────────────────────┤
│                  ActionBar: [+US] [+THEM] [UNDO] [SUB] [≡]               │
└───────────────────────────────────────────────────────────────────────────┘
```

## Court Position Layout
Standard FIVB rotation (viewed from our bench, facing net):
- Front row (top):    S4 (left) | S3 (middle) | S2 (right)
- Back row (bottom):  S5 (left) | S6 (middle) | S1 (right) ← S1 = server

S label = serving order position. S1 is always the current server.
On sideout (we earn serve): all players rotate clockwise, S1 shifts to next player.
★ star/glow border highlights S1 tile.

## PlayerTile — 16 Buttons (identical on all 6 tiles)
```
Row 1 (attack):        [ATT]  [K]    [ERR]
Row 2 (defense):       [DIG]  [BLK]
Row 3 (serve toggle):  [FL]   [TP]          ← FL=float, TP=topspin. Persistent toggle.
Row 4 (serve):         [SATT] [ACE]  [SE]   ← serve attempt/ace/error + active serve type
Row 5 (recv toggle):   [FL]   [TP]          ← Persistent toggle for receive type
Row 6 (receive):       [0]    [1]    [2]  [3]  ← pass rating + active receive type
Row 7 (errors):        [L]    [DBL]  [NET]
```

Active toggle state: filled/highlighted button. Default: FL active for both.
Toggle state stored in Zustand per playerId (not Dexie).

## What Each Button Records
All stats write a contact row to Dexie immediately on tap (no batching).

| Button | action | result | extra fields |
|--------|--------|--------|--------------|
| ATT    | attack | attempt | — |
| K      | attack | kill    | — |
| ERR    | attack | error   | — |
| DIG    | dig    | success | — |
| BLK    | block  | solo    | — |
| SATT   | serve  | in      | serve_type: FL or TP |
| ACE    | serve  | ace     | serve_type: FL or TP |
| SE     | serve  | error   | serve_type: FL or TP |
| 0–3    | pass   | 0/1/2/3 | receive_type: FL or TP |
| L      | error  | lift    | — |
| DBL    | error  | double  | — |
| NET    | error  | net     | — |

Each contact written: { match_id, set_id, player_id, action, result, serve_type?, receive_type?, timestamp }
No rally_id in Phase 2 — rally grouping is a Phase 3 concern.

## ScoreHeader Component
Props: ourScore, oppScore, ourSetsWon, oppSetsWon, setNumber, serveSide, ourTimeouts, oppTimeouts
- ourTimeouts / oppTimeouts: number 0–2. Display as circles: 0=○○, 1=✕○, 2=✕✕
- Tap our timeout circle → increment ourTimeouts (max 2), write to Dexie match record
- ● serve dot shown on our side when serveSide='us'

## LiberoBox Component
Props: libero (player object), isOnCourt, onSwap, canSwap
- isOnCourt: true = ◉ green border + "SUB OUT" button
- isOnCourt: false = ○ gray border + "SUB IN" button
- canSwap: false (no back-row middle available) = button disabled + grayed
- onSwap: swaps libero in/out in Zustand lineup, writes substitution to Dexie (libero_swap: true)

## ActionBar Component
- [+US]: point to us, no stat. Advances score. If we were receiving → now serving (no rotation). If we were serving → maintain serve (no rotation).
- [+THEM]: point to them, no stat. If they were receiving → they now serve (our rotation advances). If they were serving → maintain their serve.
- [UNDO]: delete last contact from Dexie for this set, revert score if it was a +US/+THEM
- [SUB]: open SubstitutionModal — player in/out, position selector, increments subsUsed
- [≡]: open menu drawer (end set, end match, view play log)

## Rotation Logic (auto)
Trigger rotation when: serveSide changes from 'them' to 'us' (we win a rally while receiving).
Rotation = shift lineup clockwise: position at index i moves to index (i+1)%6.
New S1 = player who was in S2, etc.
DO NOT rotate when: we score while already serving (just increment score).

## Set Management
- Set ends when: score >= 25 (or 15 for set 5) AND winning margin >= 2
- On set end: write set record to Dexie (status:'complete', winner), create next set record
- Timeouts reset to 0 for each new set
- Lineup carries over unless user makes changes before next set

## NFHS Rules Enforced
- Max 12 regular subs per set (libero swaps are free/unlimited)
- Max 2 timeouts per set per team
- Sets 1–4: win at 25 (by 2). Set 5: win at 15 (by 2)
- Libero cannot appear in server position (S1) — warn if attempted
