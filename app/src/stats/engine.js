import {
  getContactsForMatch, getRalliesForMatch, getSetsPlayedCount,
  getContactsForMatches, getMatchesForSeason, getRalliesForMatches,
  getPlayerPositionsForMatches, getBatchSetsPlayedCount, getOppScoredForMatches,
} from './queries';
import { POSITION_MULTIPLIERS } from '../constants';

// ── Internal helpers ────────────────────────────────────────────────────────

const div = (n, d) => (d > 0 ? n / d : null);

// POSITION_MULTIPLIERS imported from constants/index.js

function mkAccum() {
  return {
    // serve — totals
    sa: 0, ace: 0, se: 0, se_ob: 0, se_net: 0, se_foot: 0,
    // serve — by type
    f_sa: 0, f_ace: 0, f_se: 0,   // float
    t_sa: 0, t_ace: 0, t_se: 0,   // topspin
    // pass — result stored as '0' | '1' | '2' | '3'
    pa: 0, p0: 0, p1: 0, p2: 0, p3: 0,
    // attack
    ta: 0, k: 0, ae: 0,
    // set
    ast: 0, bhe: 0,
    // block
    bs: 0, ba: 0, be: 0,
    // dig
    dig: 0, fb_dig: 0, de: 0,
    // freeball
    fbr: 0, fbs: 0, fbe: 0,
  };
}

// count > 1 is used by synthetic box-score contacts to represent aggregate totals
function accumContact(p, { action, result, serve_type, error_type, count = 1 }) {
  const n = count;
  if (action === 'serve') {
    p.sa += n;
    if (result === 'ace')   p.ace += n;
    if (result === 'error') {
      p.se += n;
      if (error_type === 'ob')   p.se_ob   += n;
      if (error_type === 'net')  p.se_net  += n;
      if (error_type === 'foot') p.se_foot += n;
    }
    if (serve_type === 'float') {
      p.f_sa += n;
      if (result === 'ace')   p.f_ace += n;
      if (result === 'error') p.f_se  += n;
    } else if (serve_type === 'topspin') {
      p.t_sa += n;
      if (result === 'ace')   p.t_ace += n;
      if (result === 'error') p.t_se  += n;
    }
  } else if (action === 'pass') {
    p.pa += n;
    if      (result === '0') p.p0 += n;
    else if (result === '1') p.p1 += n;
    else if (result === '2') p.p2 += n;
    else if (result === '3') p.p3 += n;
  } else if (action === 'attack') {
    p.ta += n;
    if (result === 'kill')  p.k  += n;
    if (result === 'error') p.ae += n;
  } else if (action === 'set') {
    if (result === 'assist')              p.ast += n;
    if (result === 'ball_handling_error') p.bhe += n;
  } else if (action === 'block') {
    if (result === 'solo')   p.bs += n;
    if (result === 'assist') p.ba += n;
    if (result === 'error')  p.be += n;
  } else if (action === 'dig') {
    if (result === 'success' || result === 'freeball') p.dig    += n;
    if (result === 'freeball')                          p.fb_dig += n;
    if (result === 'error')                             p.de     += n;
  } else if (action === 'freeball_receive') {
    if (result === 'free_ball_error') p.fbe += n;
    else                              p.fbr += n;
  } else if (action === 'freeball_send') {
    p.fbs += n;
  }
}

// Derive all display-ready stat values from an accumulator + sets played
function deriveStats(p, sp, posLabel = null) {
  const posMult = POSITION_MULTIPLIERS[posLabel] ?? 1.0;
  return {
    // Serving — totals
    sa: p.sa, ace: p.ace, se: p.se, se_ob: p.se_ob, se_net: p.se_net, se_foot: p.se_foot,
    ace_pct:  div(p.ace,    p.sa),
    se_pct:   div(p.se,     p.sa),
    si_pct:   div(p.sa - p.se, p.sa),   // 1st-serve-in %
    sob_pct:  div(p.se_ob,  p.sa),      // OB errors as % of serves attempted
    snet_pct: div(p.se_net, p.sa),      // NET errors as % of serves attempted
    // Serving — float
    f_sa: p.f_sa, f_ace: p.f_ace, f_se: p.f_se,
    f_ace_pct: div(p.f_ace, p.f_sa),
    f_se_pct:  div(p.f_se,  p.f_sa),
    f_si_pct:  div(p.f_sa - p.f_se, p.f_sa),
    // Serving — topspin
    t_sa: p.t_sa, t_ace: p.t_ace, t_se: p.t_se,
    t_ace_pct: div(p.t_ace, p.t_sa),
    t_se_pct:  div(p.t_se,  p.t_sa),
    t_si_pct:  div(p.t_sa - p.t_se, p.t_sa),

    // Passing
    pa: p.pa, p0: p.p0, p1: p.p1, p2: p.p2, p3: p.p3,
    apr:    div(p.p1 + p.p2 * 2 + p.p3 * 3, p.pa),
    pp_pct: div(p.p3, p.pa),           // perfect-pass %

    // Attacking
    ta: p.ta, k: p.k, ae: p.ae,
    hit_pct: div(p.k - p.ae, p.ta),
    k_pct:   div(p.k,  p.ta),
    kps:     div(p.k,  sp),

    // Setting
    ast: p.ast, bhe: p.bhe,
    aps: div(p.ast, sp),

    // Blocking
    bs: p.bs, ba: p.ba, be: p.be,
    bps: div(p.bs + p.ba * 0.5, sp),

    // Defense
    dig: p.dig, fb_dig: p.fb_dig, de: p.de,
    dips: div(p.dig, sp),

    // Freeball
    fbr: p.fbr, fbs: p.fbs, fbe: p.fbe,

    // Volleyball Efficiency Rating (position-adjusted)
    // VER = posMult × (1/sp) × [4K + 4ACE + 3.5BS + 1.75BA + 1.5AST + 1DIG − 2.5AE − 2.5SE − 1.5BHE − 1.5FBE]
    ver: sp > 0
      ? posMult * (1 / sp) * (
          4.0  * p.k   +
          4.0  * p.ace +
          3.5  * p.bs  +
          1.75 * p.ba  +
          1.5  * p.ast +
          1.0  * p.dig -
          2.5  * p.ae  -
          2.5  * p.se  -
          1.5  * p.bhe -
          1.5  * p.fbe
        )
      : null,
    pos_label: posLabel ?? null,
    pos_mult:  posMult,
  };
}

// ── Pure computation functions ──────────────────────────────────────────────

/**
 * Per-player stats from any contacts array.
 * Returns { [playerId]: statRow }
 */
export function computePlayerStats(contacts, setsPlayed = 1, playerPositions = {}) {
  const accums      = {};
  const playerSets  = {}; // { [playerId]: Set<setId> }
  const playerMatches = {}; // { [playerId]: Set<matchId> }

  for (const c of contacts) {
    if (!c.player_id || c.opponent_contact) continue;
    const id = c.player_id;
    (accums[id] ??= mkAccum());
    accumContact(accums[id], c);
    (playerSets[id]    ??= new Set()).add(c.set_id);
    (playerMatches[id] ??= new Set()).add(c.match_id);
  }

  return Object.fromEntries(
    Object.entries(accums).map(([id, acc]) => {
      const row = deriveStats(acc, playerSets[id]?.size ?? setsPlayed, playerPositions[id] ?? null);
      row.sp = playerSets[id]?.size    ?? 0;
      row.mp = playerMatches[id]?.size ?? 0;
      return [id, row];
    })
  );
}

/**
 * Team-aggregate stats from any contacts array.
 * Returns a single statRow summing all players.
 */
export function computeTeamStats(contacts, setsPlayed = 1) {
  const acc = mkAccum();
  for (const c of contacts) {
    if (c.opponent_contact) continue;
    accumContact(acc, c);
  }
  return deriveStats(acc, setsPlayed);
}

/**
 * Opponent display stats for the live run strip.
 * ACE  = our '0' passes (opponent served an ace).
 * SE   = SE button taps (opponent serve errors).
 * K    = K button taps (opponent kills).
 * AE   = AE button taps (opponent attack errors).
 * BLK  = BLK button taps (opponent blocks).
 * ERRS = BHE + NET button taps combined (opponent unforced errors).
 */
export function computeOppDisplayStats(contacts) {
  let ace = 0, se = 0, k = 0, ae = 0, blk = 0, errs = 0;
  for (const c of contacts) {
    if (!c.opponent_contact) {
      // ACE: our own pass logged as '0' (opponent served an unreturnable)
      if (c.action === 'pass' && c.result === '0') ace++;
      continue;
    }
    // opponent_contact === true
    if      (c.action === 'serve'  && c.result === 'error') se++;
    else if (c.action === 'attack' && c.result === 'kill')  k++;
    else if (c.action === 'attack' && c.result === 'error') ae++;
    else if (c.action === 'block'  && c.result === 'solo')  blk++;
    else if (c.action === 'error')                          errs++; // BHE + NET
  }
  return { ace, se, k, ae, blk, errs };
}

/**
 * Rotation & sideout stats from a rallies array.
 * Returns { so_pct, bp_pct, rotations: { 1..6: { so_pct, bp_pct, ... } } }
 */
export function computeRotationStats(rallies) {
  let so_opp = 0, so_win = 0, bp_opp = 0, bp_win = 0;
  const rots = Object.fromEntries(
    Array.from({ length: 6 }, (_, i) => [i + 1, { so_opp: 0, so_win: 0, bp_opp: 0, bp_win: 0 }])
  );

  for (const { serve_side, point_winner, our_rotation } of rallies) {
    const usWon = point_winner === 'us';
    const rot   = rots[our_rotation];
    if (serve_side === 'them') {
      so_opp++; if (usWon) so_win++;
      if (rot) { rot.so_opp++; if (usWon) rot.so_win++; }
    } else {
      bp_opp++; if (usWon) bp_win++;
      if (rot) { rot.bp_opp++; if (usWon) rot.bp_win++; }
    }
  }

  return {
    so_pct: div(so_win, so_opp),
    bp_pct: div(bp_win, bp_opp),
    rotations: Object.fromEntries(
      Object.entries(rots).map(([n, r]) => [n, {
        so_pct: div(r.so_win, r.so_opp),
        bp_pct: div(r.bp_win, r.bp_opp),
        so_opp: r.so_opp, so_win: r.so_win,
        bp_opp: r.bp_opp, bp_win: r.bp_win,
      }])
    ),
  };
}

/**
 * Per-rotation contact stats (K, ACE, SE, AE, PA, P0-P3, APR, HIT%, etc.)
 * Requires contacts to have been stamped with rotation_num at record time.
 * Returns { 1: statRow, 2: statRow, ... 6: statRow }
 */
export function computeRotationContactStats(contacts) {
  const accums = {};
  for (let r = 1; r <= 6; r++) accums[r] = mkAccum();
  for (const c of contacts) {
    if (c.opponent_contact || !c.rotation_num) continue;
    const a = accums[c.rotation_num];
    if (a) accumContact(a, c);
  }
  return Object.fromEntries(
    Object.entries(accums).map(([r, acc]) => [r, deriveStats(acc, 1)])
  );
}

/**
 * In-System vs Out-of-System first-ball offense stats.
 *
 * IS  = serve-receive pass rated 3 → track the first attack outcome after that pass
 * OOS = pass rated 1 or 2 → same
 * Rating 0 (ace against us) is excluded.
 *
 * "First offensive contact" after the pass (by timestamp):
 *   action='attack'                             → TA (K if kill, AE if error)
 *   action='set', result='ball_handling_error'  → TA + AE (BHE / lift)
 * If the ball returns to our side and there are more attacks, they are NOT counted.
 *
 * Stats per IS/OOS slot: ta, k, ae, win, k_pct, hit_pct, win_pct
 *
 * Returns { byRotation: { 1..6: { is: {...}, oos: {...} } }, total: same }
 */

// Build a rally lookup Map keyed by "set_id_rally_number".
// Shared by computeISvsOOS, computeTransitionAttack, computeFreeDigWin, computeFreeballOutcomes
// so the Map is only built once per stats computation rather than 4 separate times.
export function buildRallyMap(rallies) {
  return new Map(rallies.map((r) => [`${r.set_id}_${r.rally_number}`, r]));
}

export function computeISvsOOS(contacts, rallies, rallyMap = buildRallyMap(rallies)) {
  const mkSlot = () => ({ ta: 0, k: 0, ae: 0, win: 0 });
  const byRotation = {};
  for (let r = 1; r <= 6; r++) byRotation[r] = { is: mkSlot(), oos: mkSlot() };
  const total = { is: mkSlot(), oos: mkSlot() };

  // Group our contacts by rally key
  const contactsByRally = new Map();
  for (const c of contacts) {
    if (c.opponent_contact) continue;
    const key = `${c.set_id}_${c.rally_number}`;
    if (!contactsByRally.has(key)) contactsByRally.set(key, []);
    contactsByRally.get(key).push(c);
  }

  for (const [key, rallyContacts] of contactsByRally) {
    const rally = rallyMap.get(key);
    if (!rally) continue;

    // Find the serve-receive pass (rating 1-3; skip 0 = ace against us)
    const pass = rallyContacts
      .filter((c) => c.action === 'pass' && parseInt(c.result, 10) >= 1)
      .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))[0];
    if (!pass) continue;

    const rating = parseInt(pass.result, 10);
    const isIS = rating === 3;

    // Collect all offensive contacts after the pass, sorted earliest-first.
    // We then pick the terminal one: first kill, then first error, then last
    // attempt. This handles multi-swing rallies where an earlier "attempt"
    // precedes the eventual kill rather than locking in a 0-kill result.
    const passTs = pass.timestamp ?? 0;
    const attacks = rallyContacts
      .filter((c) => {
        const ts = c.timestamp ?? 0;
        if (ts <= passTs) return false;
        return (
          c.action === 'attack' ||
          (c.action === 'set' && c.result === 'ball_handling_error')
        );
      })
      .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
    if (!attacks.length) continue;

    const atk =
      attacks.find((c) => c.result === 'kill') ??
      attacks.find((c) => c.result === 'error' || c.result === 'ball_handling_error') ??
      attacks[attacks.length - 1];

    const won  = rally.point_winner === 'us' ? 1 : 0;
    const isK  = atk.result === 'kill';
    const isAE = atk.result === 'error' || atk.result === 'ball_handling_error';

    const bucket   = isIS ? 'is' : 'oos';
    const rotSlot  = byRotation[pass.rotation_num];
    const acc = (s) => { s.ta++; if (isK) s.k++; if (isAE) s.ae++; s.win += won; };
    acc(total[bucket]);
    if (rotSlot) acc(rotSlot[bucket]);
  }

  // Derive percentage fields
  const derive = (s) => ({
    ...s,
    k_pct:   div(s.k, s.ta),
    hit_pct: div(s.k - s.ae, s.ta),
    win_pct: div(s.win, s.ta),
  });
  const deriveGroup = (g) => ({ is: derive(g.is), oos: derive(g.oos) });

  return {
    byRotation: Object.fromEntries(Object.entries(byRotation).map(([r, g]) => [r, deriveGroup(g)])),
    total:      deriveGroup(total),
  };
}

/**
 * Transition / Free Ball first-ball offense stats.
 *
 * For each dig in a rally, look for the FIRST offensive contact after that dig
 * and before the next dig (by timestamp). That one contact is the offensive
 * result of that dig sequence. If the ball comes back later with another dig,
 * that starts a new sequence.
 *
 *   dig result='freeball' → FREE bucket
 *   dig result='success'  → TRANSITION bucket  (freeball dig is FREE only, not both)
 *
 * "First offensive contact":
 *   action='attack'                             → TA (K if kill, AE if error)
 *   action='set', result='ball_handling_error'  → TA + AE (BHE / lift / net)
 *
 * Stats per slot: ta, k, ae, win, k_pct, hit_pct, win_pct
 *
 * Returns {
 *   free:       { total: {...}, byRotation: {1..6: same} },
 *   transition: { total: ..., byRotation: ... }
 * }
 */
export function computeTransitionAttack(contacts, rallies, rallyMap = buildRallyMap(rallies)) {

  // Group our contacts by rally key, sorted by timestamp
  const contactsByRally = new Map();
  for (const c of contacts) {
    if (c.opponent_contact) continue;
    const key = `${c.set_id}_${c.rally_number}`;
    if (!contactsByRally.has(key)) contactsByRally.set(key, []);
    contactsByRally.get(key).push(c);
  }
  for (const arr of contactsByRally.values()) {
    arr.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
  }

  const mkSlot  = () => ({ ta: 0, k: 0, ae: 0, win: 0 });
  const mkGroup = () => ({
    total:      mkSlot(),
    byRotation: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [i + 1, mkSlot()])),
  });
  const free       = mkGroup();
  const transition = mkGroup();

  for (const [key, rallyContacts] of contactsByRally) {
    const rally = rallyMap.get(key);
    if (!rally) continue;
    const won = rally.point_winner === 'us' ? 1 : 0;

    // All digs (success or freeball) sorted by timestamp
    const digs = rallyContacts.filter(
      (c) => c.action === 'dig' && (c.result === 'success' || c.result === 'freeball')
    );
    if (!digs.length) continue;

    for (let i = 0; i < digs.length; i++) {
      const dig    = digs[i];
      const nextDig = digs[i + 1];
      const digTs  = dig.timestamp ?? 0;
      const nextTs = nextDig != null ? (nextDig.timestamp ?? Infinity) : Infinity;

      // Collect all offensive contacts in the dig window, then pick the
      // terminal one: first kill, then first error, then last attempt.
      const attacks = rallyContacts.filter((c) => {
        const ts = c.timestamp ?? 0;
        if (ts <= digTs || ts >= nextTs) return false;
        return (
          c.action === 'attack' ||
          (c.action === 'set' && c.result === 'ball_handling_error')
        );
      });
      if (!attacks.length) continue;

      const atk =
        attacks.find((c) => c.result === 'kill') ??
        attacks.find((c) => c.result === 'error' || c.result === 'ball_handling_error') ??
        attacks[attacks.length - 1];

      const isK  = atk.result === 'kill';
      const isAE = atk.result === 'error' || atk.result === 'ball_handling_error';
      const rot  = dig.rotation_num;
      const group = dig.result === 'freeball' ? free : transition;

      group.total.ta++;
      if (isK)  group.total.k++;
      if (isAE) group.total.ae++;
      group.total.win += won;
      if (rot >= 1 && rot <= 6) {
        group.byRotation[rot].ta++;
        if (isK)  group.byRotation[rot].k++;
        if (isAE) group.byRotation[rot].ae++;
        group.byRotation[rot].win += won;
      }
    }
  }

  const derive = (s) => ({
    ...s,
    hit_pct: div(s.k - s.ae, s.ta),
    k_pct:   div(s.k, s.ta),
    win_pct: div(s.win, s.ta),
  });
  const deriveGroup = (g) => ({
    total:      derive(g.total),
    byRotation: Object.fromEntries(Object.entries(g.byRotation).map(([r, s]) => [r, derive(s)])),
  });

  return { free: deriveGroup(free), transition: deriveGroup(transition) };
}

/**
 * Scoring run breakdown by rotation.
 * A run = 2+ consecutive rallies won by us. Runs reset at set boundaries.
 * "Belongs to" the rotation where the run started.
 *
 * Returns { byRotation: { 1..6: { max_run, avg_run, runs_3plus, runs_5plus, total_runs } }, total: same }
 */
export function computeRunsByRotation(rallies) {
  const sorted = [...rallies].sort((a, b) =>
    a.set_id !== b.set_id ? a.set_id - b.set_id : a.rally_number - b.rally_number
  );

  const mkSlot = () => ({ max_run: 0, runs_3plus: 0, runs_5plus: 0, total_runs: 0, run_pts: 0 });
  const byRotation = {};
  for (let r = 1; r <= 6; r++) byRotation[r] = mkSlot();
  const tot = mkSlot();

  const record = (len, rot) => {
    if (len < 2) return;
    const add = (s) => {
      s.max_run = Math.max(s.max_run, len);
      s.total_runs++; s.run_pts += len;
      if (len >= 3) s.runs_3plus++;
      if (len >= 5) s.runs_5plus++;
    };
    if (rot >= 1 && rot <= 6) add(byRotation[rot]);
    add(tot);
  };

  let len = 0, startRot = null, prevSetId = null;
  for (const rally of sorted) {
    if (rally.set_id !== prevSetId) { record(len, startRot); len = 0; startRot = null; prevSetId = rally.set_id; }
    if (rally.point_winner === 'us') {
      if (len === 0) startRot = rally.our_rotation;
      len++;
    } else { record(len, startRot); len = 0; startRot = null; }
  }
  record(len, startRot);

  const derive = (s) => ({ ...s, avg_run: s.total_runs > 0 ? s.run_pts / s.total_runs : null });
  return {
    byRotation: Object.fromEntries(Object.entries(byRotation).map(([r, s]) => [r, derive(s)])),
    total: derive(tot),
  };
}

/**
 * Free-ball dig win stats.
 * FREE dig = action 'dig', result 'freeball'.
 * Returns { byRotation: { 1..6: { fb_dig, fb_won } }, total: same }
 */
export function computeFreeDigWin(contacts, rallies, rallyMap = buildRallyMap(rallies)) {
  const mkSlot = () => ({ fb_dig: 0, fb_won: 0 });
  const byRotation = {};
  for (let r = 1; r <= 6; r++) byRotation[r] = mkSlot();
  const total = mkSlot();

  for (const c of contacts) {
    if (c.opponent_contact || c.action !== 'dig' || c.result !== 'freeball') continue;
    const rally = rallyMap.get(`${c.set_id}_${c.rally_number}`);
    if (!rally) continue;
    const won = rally.point_winner === 'us' ? 1 : 0;
    const slot = byRotation[c.rotation_num];
    if (slot) { slot.fb_dig++; slot.fb_won += won; }
    total.fb_dig++; total.fb_won += won;
  }

  return { byRotation, total };
}

/**
 * Freeball outcome stats — requires both contacts AND rallies arrays
 * so the caller (match or season) can pass already-fetched data.
 *
 * FBO% = rallies where our freeball_receive → we scored / total freeball_receive contacts
 * FBD% = rallies where we sent freeball → we won the point / total freeball_send contacts
 */
export function computeFreeballOutcomes(contacts, rallies, rallyMap = buildRallyMap(rallies)) {
  let fbr = 0, fbrWin = 0, fbs = 0, fbsWin = 0;
  for (const c of contacts) {
    if (c.opponent_contact) continue;
    const rally = rallyMap.get(`${c.set_id}_${c.rally_number}`);
    if (!rally) continue;
    if (c.action === 'freeball_receive') {
      fbr++;
      if (rally.point_winner === 'us') fbrWin++;
    } else if (c.action === 'freeball_send') {
      fbs++;
      if (rally.point_winner === 'us') fbsWin++;
    }
  }
  return {
    fbr, fbs,
    fbo_pct: div(fbrWin, fbr),
    fbd_pct: div(fbsWin, fbs),
  };
}

/**
 * Point-quality breakdown for a contacts array.
 * Returns earned / given / free detail objects and totals.
 *
 * EARNED  — our team actively scores: ACE, K, SBLK, HBLK
 * GIVEN   — our errors concede a point: SE, AE, P0, Lift, Dbl, Net
 * FREE    — opponent errors give us a point: opp SE, AE, BHE, Net
 */
export function computePointQuality(contacts) {
  const earned = { ace: 0, k: 0, sblk: 0, hblk: 0 };
  const given  = { se: 0, ae: 0, p0: 0, lift: 0, dbl: 0, net: 0, rot: 0 };
  const free   = { se: 0, ae: 0, bhe: 0, net: 0 };

  for (const c of contacts) {
    if (c.opponent_contact) {
      if      (c.action === 'serve'  && c.result === 'error')               free.se++;
      else if (c.action === 'attack' && c.result === 'error')               free.ae++;
      else if (c.action === 'error'  && c.result === 'ball_handling_error') free.bhe++;
      else if (c.action === 'error'  && c.result === 'net')                 free.net++;
    } else {
      if      (c.action === 'serve'  && c.result === 'ace')    earned.ace++;
      else if (c.action === 'attack' && c.result === 'kill')   earned.k++;
      else if (c.action === 'block'  && c.result === 'solo')   earned.sblk++;
      else if (c.action === 'block'  && c.result === 'assist') earned.hblk += 0.5; // 2 contacts per event → each counts 0.5

      if      (c.action === 'serve'  && c.result === 'error')  given.se++;
      else if (c.action === 'attack' && c.result === 'error')  given.ae++;
      else if (c.action === 'pass'   && c.result === '0')      given.p0++;
      else if (c.action === 'error'  && c.result === 'lift')   given.lift++;
      else if (c.action === 'error'  && c.result === 'double') given.dbl++;
      else if (c.action === 'error'  && c.result === 'net')              given.net++;
      else if (c.action === 'error'  && c.result === 'rotation_error')  given.rot++;
    }
  }

  const earnedTotal = earned.ace + earned.k + earned.sblk + earned.hblk;
  const givenTotal  = given.se + given.ae + given.p0 + given.lift + given.dbl + given.net + given.rot;
  const freeTotal   = free.se + free.ae + free.bhe + free.net;
  const scored      = earnedTotal + freeTotal;

  return {
    earned: { ...earned, total: earnedTotal },
    given:  { ...given,  total: givenTotal  },
    free:   { ...free,   total: freeTotal   },
    scored,
    earned_pct: scored > 0 ? earnedTotal / scored : null,
    free_pct:   scored > 0 ? freeTotal   / scored : null,
  };
}

// ── Async convenience (report mode) ────────────────────────────────────────

/**
 * Fetches and computes all stats for a single match.
 * Returns { players, team, rotation, freeball, setsPlayed }
 */
export async function computeMatchStats(matchId) {
  const [contacts, rallies, setsPlayed, playerPositions] = await Promise.all([
    getContactsForMatch(matchId),
    getRalliesForMatch(matchId),
    getSetsPlayedCount(matchId),
    getPlayerPositionsForMatches([matchId]),
  ]);
  const rallyMap = buildRallyMap(rallies);
  return {
    players:          computePlayerStats(contacts, setsPlayed, playerPositions),
    team:             computeTeamStats(contacts, setsPlayed),
    opp:              computeOppDisplayStats(contacts),
    serveZones:       computeServeZoneStats(contacts),
    rotation:         computeRotationStats(rallies),
    freeball:         computeFreeballOutcomes(contacts, rallies, rallyMap),
    isOos:            computeISvsOOS(contacts, rallies, rallyMap),
    transitionAttack: computeTransitionAttack(contacts, rallies, rallyMap),
    freeDigWin:       computeFreeDigWin(contacts, rallies, rallyMap),
    runs:             computeRunsByRotation(rallies),
    pointQuality:     computePointQuality(contacts),
    setsPlayed,
    contacts,
  };
}

/**
 * Fetches and aggregates all stats for an entire season.
 * Optional filters: { conference: 'conference'|'non-con', location: 'home'|'away'|'neutral', matchType: string }
 * Returns { players, team, rotation, freeball, setsPlayed, matchCount, totalMatchCount }
 * or null if no matches exist, or { empty: true, totalMatchCount } if filters exclude all matches.
 */
export async function computeSeasonStats(seasonId, filters = {}) {
  let matches = await getMatchesForSeason(seasonId);
  if (!matches.length) return null;

  const totalMatchCount = matches.length;

  if (filters.matchIds?.length) matches = matches.filter(m => filters.matchIds.includes(m.id));
  if (filters.conference) matches = matches.filter(m => m.conference === filters.conference);
  if (filters.location)   matches = matches.filter(m => m.location   === filters.location);
  if (filters.matchType)  matches = matches.filter(m => m.match_type === filters.matchType);

  if (!matches.length) return { empty: true, totalMatchCount };

  const matchIds = matches.map(m => m.id);
  const [contacts, rallies, setsPerMatch, playerPositions, oppScored] = await Promise.all([
    getContactsForMatches(matchIds),
    getRalliesForMatches(matchIds),
    getBatchSetsPlayedCount(matchIds),
    getPlayerPositionsForMatches(matchIds),
    getOppScoredForMatches(matchIds),
  ]);
  const setsPlayed = Object.values(setsPerMatch).reduce((a, b) => a + b, 0);

  const rallyMap = buildRallyMap(rallies);
  return {
    players:          computePlayerStats(contacts, setsPlayed, playerPositions),
    team:             computeTeamStats(contacts, setsPlayed),
    rotation:         computeRotationStats(rallies),
    freeball:         computeFreeballOutcomes(contacts, rallies, rallyMap),
    isOos:            computeISvsOOS(contacts, rallies, rallyMap),
    transitionAttack: computeTransitionAttack(contacts, rallies, rallyMap),
    freeDigWin:       computeFreeDigWin(contacts, rallies, rallyMap),
    runs:             computeRunsByRotation(rallies),
    pointQuality:     computePointQuality(contacts),
    trends:           computePlayerTrends(matches, contacts, setsPerMatch, playerPositions),
    setsPlayed,
    matchCount:       matchIds.length,
    totalMatchCount,
    oppScored,
    contacts,
  };
}

/**
 * Breaks down per-player stats match-by-match from pre-fetched season data.
 * No extra DB queries — all inputs are already available from computeSeasonStats.
 * Returns { matches: [{id, date, opponentName}], byPlayer: {[pid]: Array<row|null>} }
 * Each byPlayer array is index-aligned to the matches array.
 */
export function computePlayerTrends(matches, contacts, setsPerMatch, playerPositions) {
  const sorted = [...matches].sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });

  const byMatch = {};
  for (const c of contacts) {
    (byMatch[c.match_id] ??= []).push(c);
  }

  // Pass 1: compute per-match stats and collect all player IDs up front.
  // Avoids the O(n²) new Array(i).fill(null) pattern for late-discovered players.
  const allPlayerIds = new Set();
  const statsByMatch = sorted.map((match) => {
    const mc = byMatch[match.id] ?? [];
    const sp = setsPerMatch[match.id] ?? 1;
    const ms = computePlayerStats(mc, sp, playerPositions);
    for (const pid of Object.keys(ms)) allPlayerIds.add(pid);
    return ms;
  });

  // Pass 2: build aligned arrays — one slot per match, null if player absent.
  const byPlayer = {};
  for (const pid of allPlayerIds) byPlayer[pid] = [];
  for (let i = 0; i < sorted.length; i++) {
    const matchId = sorted[i].id;
    const ms = statsByMatch[i];
    for (const pid of allPlayerIds) {
      byPlayer[pid].push(ms[pid] ? { matchId, ...ms[pid] } : null);
    }
  }

  return {
    matches:  sorted.map(m => ({ id: m.id, date: m.date, opponentName: m.opponent_name ?? '' })),
    byPlayer,
  };
}

// ── Per-zone serve stats ──────────────────────────────────────────────────────
export function computeServeZoneStats(contacts) {
  const zones = {};
  for (let z = 1; z <= 6; z++) zones[z] = { sa: 0, ace: 0, se: 0 };
  for (const c of contacts) {
    if (c.action !== 'serve' || c.opponent_contact || !c.zone) continue;
    const z = zones[c.zone];
    if (!z) continue;
    z.sa++;
    if (c.result === 'ace')   z.ace++;
    if (c.result === 'error') z.se++;
  }
  return Object.fromEntries(
    Object.entries(zones).map(([zone, s]) => [Number(zone), {
      sa: s.sa, ace: s.ace, se: s.se,
      ace_pct: s.sa ? Math.round(s.ace / s.sa * 100) : 0,
      si_pct:  s.sa ? Math.round((s.sa - s.se) / s.sa * 100) : 0,
    }])
  );
}

// ── Set-by-Set Trend Chart data ───────────────────────────────────────────────
export function computeSetTrends(contacts, sets) {
  if (!contacts?.length || !sets?.length) return [];
  const setNumById = Object.fromEntries(sets.map(s => [s.id, s.set_number]));
  const bySet = {};
  for (const c of contacts) {
    const sn = setNumById[c.set_id];
    if (!sn) continue;
    if (!bySet[sn]) bySet[sn] = { ta: 0, k: 0, ae: 0, pa: 0, p0: 0, p1: 0, p2: 0, p3: 0, sa: 0, ace: 0, se: 0 };
    const s = bySet[sn];
    if (c.action === 'attack') {
      s.ta++; if (c.result === 'kill') s.k++; if (c.result === 'error') s.ae++;
    } else if (c.action === 'pass') {
      s.pa++;
      if (c.result === '0') s.p0++;
      else if (c.result === '1') s.p1++;
      else if (c.result === '2') s.p2++;
      else if (c.result === '3') s.p3++;
    } else if (c.action === 'serve') {
      s.sa++; if (c.result === 'ace') s.ace++; if (c.result === 'error') s.se++;
    }
  }
  return Object.entries(bySet)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([sn, s]) => ({
      name:  `Set ${sn}`,
      'K%':  s.ta ? Math.round(s.k / s.ta * 100) : 0,
      'HIT%': s.ta ? Math.round((s.k - s.ae) / s.ta * 100) : 0,
      'APR': s.pa ? Math.round(((s.p1 * 1 + s.p2 * 2 + s.p3 * 3) / s.pa) * 100) / 100 : 0,
      'ACE%': s.sa ? Math.round(s.ace / s.sa * 100) : 0,
      'SE%':  s.sa ? Math.round(s.se  / s.sa * 100) : 0,
    }));
}

// ── Rally Length Histogram data ───────────────────────────────────────────────
const RALLY_BUCKETS = [
  { label: '1',    min: 1,  max: 1         },
  { label: '2–3',  min: 2,  max: 3         },
  { label: '4–6',  min: 4,  max: 6         },
  { label: '7–10', min: 7,  max: 10        },
  { label: '11+',  min: 11, max: Infinity  },
];

export function computeRallyHistogram(contacts) {
  if (!contacts?.length) return [];
  const lenByRally = new Map();
  for (const c of contacts) {
    if (c.rally_number == null) continue;
    // Key on set_id+rally_number so rally counts don't bleed across sets
    const key = `${c.set_id}_${c.rally_number}`;
    lenByRally.set(key, (lenByRally.get(key) ?? 0) + 1);
  }
  const counts = RALLY_BUCKETS.map(b => ({ name: b.label, rallies: 0 }));
  for (const len of lenByRally.values()) {
    const idx = RALLY_BUCKETS.findIndex(b => len >= b.min && len <= b.max);
    if (idx >= 0) counts[idx].rallies++;
  }
  const total = counts.reduce((s, c) => s + c.rallies, 0);
  return counts.map(c => ({ ...c, pct: total ? Math.round(c.rallies / total * 100) : 0 }));
}
