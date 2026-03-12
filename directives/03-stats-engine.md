# Directive 03 — Stats Engine

## Responsibility
Own `app/src/stats/engine.js`, `queries.js`, `formatters.js`, and all components under `app/src/components/stats/`.

## Two Computation Modes

### Live Mode
- Input: Zustand `committedContacts` (contacts written to Dexie) + current partialContacts
- Computed via useMemo selectors in matchStore
- Used by: LiveStatsSidebar during match

### Report Mode
- Input: Full Dexie table scans with player/match/season filters
- Used by: MatchSummaryPage, ReportsPage

## Formula Reference

### Serving
```
SA   = count(action='serve', player)
ACE  = count(action='serve', result='ace', player)
SE   = count(action='serve', result='error', player)
ACE% = ACE / SA
SE%  = SE / SA
1SI% = (SA - SE) / SA
```

### Passing
```
PA   = count(action='pass', player)
P0/P1/P2/P3 = count by result rating
APR  = (0*P0 + 1*P1 + 2*P2 + 3*P3) / PA
PP%  = P3 / PA
```

### Attacking
```
TA     = count(action='attack', player)
K      = count(action='attack', result='kill', player)
AE     = count(action='attack', result='error', player)
HIT%   = (K - AE) / TA
K%     = K / TA
KPS    = K / sets_played
```

### Setting
```
AST  = count(action='set', result='assist', player)   [back-assigned after kill]
BHE  = count(action='set', result='ball_handling_error', player)
APS  = AST / sets_played
```

### Blocking
```
BS   = count(action='block', result='solo', player)
BA   = count(action='block', result='assist', player)
BE   = count(action='block', result='error', player)
BPS  = (BS + BA*0.5) / sets_played
```

### Defense
```
DIG  = count(action='dig', result='success', player)
DE   = count(action='dig', result='error', player)
DiPS = DIG / sets_played
```

### Free Ball
```
FBR  = count(action='freeball_receive', player or team)
FBS  = count(action='freeball_send', team)
FBO% = rallies where freeball_receive then we score / FBR
FBD% = rallies where freeball_send then we defend / FBS
```

### Sideout / Rotation
```
SO_OPP  = rallies where serve_side='them'
SO_WIN  = rallies where serve_side='them' AND point_winner='us'
SO%     = SO_WIN / SO_OPP

BP_OPP  = rallies where serve_side='us'
BP_WIN  = rallies where serve_side='us' AND point_winner='us'
BP%     = BP_WIN / BP_OPP

PPR(n)  = count(rallies where our_rotation=n, point_winner='us')
SO%(n)  = SO% filtered to our_rotation=n
```

## Formatters
- Hitting%: always 3 decimal places with sign: +.312, -.045
- Pass rating: 2 decimal places: 2.34
- Percentages (ace%, dig%): 1 decimal: 18.3%
- Counts: integers, no decimals
- Division by zero: return null, display as "—"

## Unit Tests
Write tests in `app/src/stats/__tests__/engine.test.js` covering:
- Hitting% edge cases (0 attempts, negative result)
- Pass avg with all 0s, all 3s
- Sideout% with no opportunities
- Assist back-assignment logic
