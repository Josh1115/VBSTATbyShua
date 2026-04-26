/**
 * Stat abbreviation glossary — keyed by the `key` field from columns.jsx.
 * Each entry: { abbr, full, def }
 * Used by StatGlossaryDrawer to show definitions for columns in a given table.
 */
export const STAT_GLOSSARY = {
  // ── General ──────────────────────────────────────────────────────────────
  sp:           { abbr: 'SP',       full: 'Sets Played',                def: 'Total sets this player appeared in.' },
  mp:           { abbr: 'MP',       full: 'Matches Played',             def: 'Total matches this player appeared in.' },

  // ── Serving (all / float / topspin) ──────────────────────────────────────
  sa:           { abbr: 'SA',       full: 'Serve Attempts',             def: 'Total serves attempted.' },
  ace:          { abbr: 'ACE',      full: 'Aces',                       def: 'Serves that score a point directly, untouched by the opponent.' },
  se:           { abbr: 'SE',       full: 'Serve Errors',               def: 'Total serves resulting in a point for the opponent.' },
  se_ob:        { abbr: 'SOB',      full: 'Serve Out of Bounds',        def: 'Serve errors landing outside the court.' },
  se_net:       { abbr: 'SNET',     full: 'Serve into Net',             def: 'Serve errors that contact the net.' },
  se_foot:      { abbr: 'FOOT',     full: 'Footfault',                  def: 'Service error: server stepped on or over the end line.' },
  ace_pct:      { abbr: 'ACE%',     full: 'Ace Percentage',             def: 'ACE ÷ SA.' },
  se_pct:       { abbr: 'SE%',      full: 'Serve Error %',              def: 'SE ÷ SA.' },
  si_pct:       { abbr: 'S%',       full: 'Serve In %',                 def: '(SA − SE) ÷ SA. Rate of serves that land in bounds.' },
  sob_pct:      { abbr: 'SOB%',     full: 'Out-of-Bounds Serve %',      def: 'SOB ÷ SA.' },
  snet_pct:     { abbr: 'SNET%',    full: 'Net Serve %',                def: 'SNET ÷ SA.' },

  f_sa:         { abbr: 'SA',       full: 'Float Serve Attempts',       def: 'Total float (knuckleball) serves attempted.' },
  f_ace:        { abbr: 'ACE',      full: 'Float Aces',                 def: 'Aces on float serves.' },
  f_se:         { abbr: 'SE',       full: 'Float Serve Errors',         def: 'Errors on float serves.' },
  f_ace_pct:    { abbr: 'ACE%',     full: 'Float Ace %',                def: 'ACE ÷ SA on float serves.' },
  f_se_pct:     { abbr: 'SE%',      full: 'Float SE %',                 def: 'SE ÷ SA on float serves.' },
  f_si_pct:     { abbr: 'S%',       full: 'Float Serve In %',           def: '(SA − SE) ÷ SA on float serves.' },

  t_sa:         { abbr: 'SA',       full: 'Topspin Serve Attempts',     def: 'Total topspin (jump) serves attempted.' },
  t_ace:        { abbr: 'ACE',      full: 'Topspin Aces',               def: 'Aces on topspin serves.' },
  t_se:         { abbr: 'SE',       full: 'Topspin Serve Errors',       def: 'Errors on topspin serves.' },
  t_ace_pct:    { abbr: 'ACE%',     full: 'Topspin Ace %',              def: 'ACE ÷ SA on topspin serves.' },
  t_se_pct:     { abbr: 'SE%',      full: 'Topspin SE %',               def: 'SE ÷ SA on topspin serves.' },
  t_si_pct:     { abbr: 'S%',       full: 'Topspin Serve In %',         def: '(SA − SE) ÷ SA on topspin serves.' },

  // ── Passing ───────────────────────────────────────────────────────────────
  pa:           { abbr: 'REC',      full: 'Serve Receptions',           def: 'Total serve-receive contacts.' },
  p0:           { abbr: 'P0',       full: 'Pass Rating 0',              def: 'Ace against — ball was not playable.' },
  p1:           { abbr: 'P1',       full: 'Pass Rating 1',              def: 'Out-of-system pass — significantly limits offensive options.' },
  p2:           { abbr: 'P2',       full: 'Pass Rating 2',              def: 'In-system pass — setter has limited attack options.' },
  p3:           { abbr: 'P3',       full: 'Pass Rating 3 (Perfect)',    def: 'Perfect pass — setter has the full offense available.' },
  apr:          { abbr: 'APR',      full: 'Average Pass Rating',        def: '(0·P0 + 1·P1 + 2·P2 + 3·P3) ÷ REC. Scale: 0–3.\n\nRating scale:\n  3 — Perfect: setter has full offense\n  2 — In system: limited attack options\n  1 — Out of system: severely limits offense\n  0 — Ace against: ball was not playable\n\nAPR feeds into VER. Each pass is scored relative to the neutral value of 2.0:\n  P3 = +1 per pass · P2 = 0 (neutral) · P1 = −1 per pass · P0 = −2 per pass' },
  pp_pct:       { abbr: '3OPT%',   full: 'Perfect Pass %',             def: 'P3 ÷ REC. Rate of passes rated "perfect".' },

  // ── Attacking ─────────────────────────────────────────────────────────────
  ta:           { abbr: 'ATT',      full: 'Total Attacks',              def: 'Total attack attempts (kills + errors + in-play attempts).' },
  k:            { abbr: 'K',        full: 'Kills',                      def: 'Attacks that score a point directly.' },
  ae:           { abbr: 'AE',       full: 'Attack Errors',              def: 'Attacks that result in a point for the opponent (out, blocked).' },
  hit_pct:      { abbr: 'HIT%',     full: 'Hitting Percentage',         def: '(K − AE) ÷ TA. Ranges −1.000 to 1.000. The primary attacking efficiency stat.' },
  k_pct:        { abbr: 'K%',       full: 'Kill Percentage',            def: 'K ÷ TA. Kill rate, ignoring errors.' },
  kps:          { abbr: 'KPS',      full: 'Kills Per Set',              def: 'K ÷ SP.' },

  // ── VER ───────────────────────────────────────────────────────────────────
  ver:          { abbr: 'VER',      full: 'Volleyball Efficiency Rating', def: 'Position-adjusted composite efficiency rating per set.\n\nFormula:\nVER = Multiplier × (1 ÷ SP) × [\n  +4.00 × K\n  +4.00 × ACE\n  +3.50 × BS\n  +1.75 × BA\n  +1.50 × AST\n  +1.25 × DIG\n  +(P1 + 2·P2 + 3·P3 − 2·REC)   ← APR component\n  −2.50 × AE\n  −2.50 × SE\n  −1.50 × BHE\n  −1.50 × FBE\n  −1.50 × L\n  −1.50 × NET\n]\n\nAPR Component: (P1 + 2·P2 + 3·P3 − 2·REC)\n  Scores each pass relative to a neutral APR of 2.0:\n  P3 = +1 per pass (perfect)\n  P2 =  0 per pass (neutral)\n  P1 = −1 per pass (out of system)\n  P0 = −2 per pass (ace against)\n  Zero when the player has no pass attempts.\n\nPosition Multipliers:\n  OH  1.00 (baseline)\n  OPP 1.00 (baseline)\n  RS  1.00 (baseline)\n  MB  1.05 (fewer block/attack opps per set)\n  S   0.90 (assists weighted lower than kills)\n  DS  1.15 (high-demand serve-receive / dig role)\n  L   1.20 (hardest serve-receive + dig load, no attacks)\n\nGrades:\n  ELITE+  ≥ 28\n  ELITE   ≥ 22\n  GOOD    ≥ 15\n  AVG     ≥ 10\n  LOW     ≥  5\n  BENCH   ≥  0\n  NEG      < 0\n\nHigher is better. A VER of 0 means the player broke even.' },

  // ── Blocking ──────────────────────────────────────────────────────────────
  bs:           { abbr: 'BS',       full: 'Block Solos',                def: 'Blocks where only one player contacts the ball.' },
  ba:           { abbr: 'BA',       full: 'Block Assists',              def: 'Blocks where 2+ players contact the ball.' },
  be:           { abbr: 'BE',       full: 'Block Errors',               def: 'Blocking attempts that give a point to the opponent.' },
  bps:          { abbr: 'BPS',      full: 'Blocks Per Set',             def: '(BS + 0.5·BA) ÷ SP.' },

  // ── Setting ───────────────────────────────────────────────────────────────
  ast:          { abbr: 'AST',      full: 'Assists',                    def: 'Sets immediately followed by a kill (back-assigned).' },
  set_att:      { abbr: 'ATT',      full: 'Set Attempts',               def: 'Total setting contacts.' },
  bhe:          { abbr: 'BHE',      full: 'Ball Handling Error',        def: 'Double contact, lift, or carry on a setting attempt.' },
  lift:         { abbr: 'L',        full: 'Lifts',                      def: 'Contact where the ball is visibly lifted or carried. Counts against VER at −1.5.' },
  dbl:          { abbr: 'DBL',      full: 'Doubles',                    def: 'Illegal double-contact setting error.' },
  net:          { abbr: 'NET',      full: 'Net Violations',             def: 'Contacts where the player touches the net during play. Counts against VER at −1.5.' },
  aps:          { abbr: 'APS',      full: 'Assists Per Set',            def: 'AST ÷ SP.' },

  // ── Defense ───────────────────────────────────────────────────────────────
  dig:          { abbr: 'DIG',      full: 'Digs',                       def: 'Successful defensive contacts keeping the ball in play.' },
  de:           { abbr: 'DE',       full: 'Dig Errors',                 def: 'Defensive contacts resulting in a dead ball or opponent point.' },
  dips:         { abbr: 'DiPS',     full: 'Digs Per Set',               def: 'DIG ÷ SP.' },
  fbr:          { abbr: 'FBR',      full: 'Freeball Receives',          def: 'Controlled passes of an opponent freeball.' },
  fbs:          { abbr: 'FBS',      full: 'Freeball Sends',             def: 'Balls sent over as a freeball after a dig.' },
  fbe:          { abbr: 'FBE',      full: 'Freeball Errors',            def: 'Errors committed on freeball contacts.' },

  // ── Rotation (SO% / SP%) ─────────────────────────────────────────────────
  so_pct:       { abbr: 'SO%',      full: 'Sideout %',                  def: 'Win rate when receiving serve. SO Win ÷ SO Opp.' },
  so_opp:       { abbr: 'SO Opp',   full: 'Sideout Opportunities',      def: 'Total rallies where your team received serve.' },
  so_win:       { abbr: 'SO Win',   full: 'Sideout Wins',               def: 'Rallies where you received serve and won the point.' },
  bp_pct:       { abbr: 'SP%',      full: 'Serve Point %',              def: 'Win rate when serving. SP Win ÷ SP Opp.' },
  bp_opp:       { abbr: 'SP Opp',   full: 'Serve Point Opportunities',  def: 'Total rallies where your team served.' },
  bp_win:       { abbr: 'SP Win',   full: 'Serve Point Wins',           def: 'Rallies where you served and won the point.' },

  // ── IS / OOS ─────────────────────────────────────────────────────────────
  is_ta:        { abbr: 'IS',       full: 'In-System Attacks',          def: 'Attack attempts following a perfect pass (P3).' },
  is_k_pct:     { abbr: 'IS K%',    full: 'In-System Kill %',           def: 'K ÷ TA on in-system attacks.' },
  is_hit_pct:   { abbr: 'IS HIT%',  full: 'In-System Hitting %',        def: '(K − AE) ÷ TA on in-system attacks.' },
  is_win_pct:   { abbr: 'IS Win%',  full: 'In-System Win %',            def: 'Win rate on rallies containing an in-system attack.' },
  oos_ta:       { abbr: 'OOS',      full: 'Out-of-System Attacks',      def: 'Attack attempts following a below-perfect pass (P1 or P2).' },
  oos_k_pct:    { abbr: 'OOS K%',   full: 'OOS Kill %',                 def: 'K ÷ TA on out-of-system attacks.' },
  oos_hit_pct:  { abbr: 'OOS HIT%', full: 'OOS Hitting %',              def: '(K − AE) ÷ TA on OOS attacks.' },
  oos_win_pct:  { abbr: 'OOS Win%', full: 'OOS Win %',                  def: 'Win rate on rallies containing an OOS attack.' },

  // ── Transition / Freeball offense ────────────────────────────────────────
  free_ta:      { abbr: 'FB ATK',   full: 'Freeball Attack Attempts',   def: 'Attacks after receiving an opponent freeball.' },
  free_k_pct:   { abbr: 'FB K%',    full: 'Freeball Kill %',            def: 'K ÷ TA on freeball offense.' },
  free_hit_pct: { abbr: 'FB HIT%',  full: 'Freeball Hitting %',         def: '(K − AE) ÷ TA on freeball offense.' },
  free_win_pct: { abbr: 'FB Win%',  full: 'Freeball Win %',             def: 'Win rate on rallies containing a freeball attack.' },
  trans_ta:     { abbr: 'TR ATK',   full: 'Transition Attack Attempts', def: 'Attacks after a successful dig (transition offense).' },
  trans_k_pct:  { abbr: 'TR K%',    full: 'Transition Kill %',          def: 'K ÷ TA in transition.' },
  trans_hit_pct:{ abbr: 'TR HIT%',  full: 'Transition Hitting %',       def: '(K − AE) ÷ TA in transition.' },
  trans_win_pct:{ abbr: 'TR Win%',  full: 'Transition Win %',           def: 'Win rate on rallies containing a transition attack.' },

  // ── Run streaks ───────────────────────────────────────────────────────────
  max_run:      { abbr: 'Best',     full: 'Best Run',                   def: 'Longest consecutive scoring run from this rotation.' },
  avg_run:      { abbr: 'Avg',      full: 'Average Run',                def: 'Average length of scoring runs from this rotation.' },
  runs_3plus:   { abbr: '3+',       full: 'Runs of 3+',                 def: 'Number of times your team scored 3 or more consecutive points from this rotation.' },
  runs_5plus:   { abbr: '5+',       full: 'Runs of 5+',                 def: 'Number of times your team scored 5 or more consecutive points from this rotation.' },
};
