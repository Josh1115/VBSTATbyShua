# Directive 01 — DB Schema

## Responsibility
Own the Dexie IndexedDB schema at `app/src/db/schema.js` and all seed/migration logic.

## Schema Tables

```
organizations     ++id, name, type
teams             ++id, org_id, name, gender, level
seasons           ++id, team_id, year, name
players           ++id, team_id, jersey_number, name, position, is_active
opponents         ++id, name, city, state
matches           ++id, season_id, opponent_id, date, status
sets              ++id, match_id, set_number, status
lineups           ++id, set_id, player_id, position_number
substitutions     ++id, set_id, rally_number, player_in_id, player_out_id
rallies           ++id, set_id, rally_number, point_winner, serve_side
contacts          ++id, rally_id, set_id, match_id, player_id, action, result, sequence
```

## Rules
- NEVER change db.version(1) without creating a proper upgrade migration.
- set_id and match_id are denormalized on contacts for fast queries — always populate both.
- court_x, court_y are floats 0.0–1.0; zone is int 1–9, pre-computed on contact write.
- assist result on set contacts is back-assigned after the attack in the same rally resolves as 'kill'.

## Contact Actions and Results

| action | valid results |
|---|---|
| serve | ace, in, error |
| pass | 0, 1, 2, 3 (rating) |
| set | assist, ball_handling_error, error |
| attack | kill, error, attempt, blocked, tip, roll_shot |
| block | solo, assist, error, touch |
| dig | success, error |
| freeball_receive | success, error |
| freeball_send | in, error |
| cover | success |
