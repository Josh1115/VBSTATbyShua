import {
  getContactsForMatch, getRalliesForMatch, getSetsPlayedCount,
  getContactsForMatches, getMatchesForSeason, getRalliesForMatches,
  getPlayerPositionsForMatches,
} from './queries';

// ── Internal helpers ────────────────────────────────────────────────────────

const div = (n, d) => (d > 0 ? n / d : null);

// Position multipliers for VER — exported so callers can apply them post-hoc
export const POSITION_MULTIPLIERS = {
  OH:  1.00,
  OPP: 1.00,
  MB:  1.05,
  S:   0.90,
  L:   1.20,
  DS:  1.15,
};

function mkAccum() {
  return {
    // serve — totals
    sa: 0, ace: 0, se: 0, se_ob: 0, se_net: 0,
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
    fbr: 0, fbs: 0,
  };
}

function accumContact(p, { action, result, serve_type, error_type }) {
  if (action === 'serve') {
    p.sa++;
    if (result === 'ace')   p.ace++;
    if (result === 'error') {
      p.se++;
      if (error_type === 'ob')  p.se_ob++;
      if (error_type === 'net') p.se_net++;
    }
    if (serve_type === 'float') {
      p.f_sa++;
      if (result === 'ace')   p.f_ace++;
      if (result === 'error') p.f_se++;
    } else if (serve_type === 'topspin') {
      p.t_sa++;
      if (result === 'ace')   p.t_ace++;
      if (result === 'error') p.t_se++;
    }
  } else if (action === 'pass') {
    p.pa++;
    if      (result === '0') p.p0++;
    else if (result === '1') p.p1++;
    else if (result === '2') p.p2++;
    else if (result === '3') p.p3++;
  } else if (action === 'attack') {
    p.ta++;
    if (result === 'kill')  p.k++;
    if (result === 'error') p.ae++;
  } else if (action === 'set') {
    if (result === 'assist')              p.ast++;
    if (result === 'ball_handling_error') p.bhe++;
  } else if (action === 'block') {
    if (result === 'solo')   p.bs++;
    if (result === 'assist') p.ba++;
    if (result === 'error')  p.be++;
  } else if (action === 'dig') {
    if (result === 'success' || result === 'freeball') p.dig++;
    if (result === 'freeball') p.fb_dig++;
    if (result === 'error')    p.de++;
  } else if (action === 'freeball_receive') {
    p.fbr++;
  } else if (action === 'freeball_send') {
    p.fbs++;
  }
}

// Derive all display-ready stat values from an accumulator + sets played
function deriveStats(p, sp, posLabel = null) {
  const posMult = POSITION_MULTIPLIERS[posLabel] ?? 1.0;
  return {
    // Serving — totals
    sa: p.sa, ace: p.ace, se: p.se, se_ob: p.se_ob, se_net: p.se_net,
    ace_pct:  div(p.ace,    p.sa),
    se_pct:   div(p.se,     p.sa),
    si_pct:   div(p.sa - p.se, p.sa),   // 1st-serve-in %
    sob_pct:  div(p.se_ob,  p.sa),      // OB errors as % of serves attempted
    snet_pct: div(p.se_net, p.sa),      // NET errors as % of serves attempted
    // Serving — float
    f_sa: p.f_sa, f_ace: p.f_ace, f_se: p.f_se,
    f_ace_pct: div(p.f_ace, p.f_sa),
    f_si_pct:  div(p.f_sa - p.f_se, p.f_sa),
    // Serving — topspin
    t_sa: p.t_sa, t_ace: p.t_ace, t_se: p.t_se,
    t_ace_pct: div(p.t_ace, p.t_sa),
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
    fbr: p.fbr, fbs: p.fbs,

    // Volleyball Efficiency Rating (position-adjusted)
    // VER = posMult × (1/sp) × [4K + 4ACE + 3.5BS + 1.75BA + 1.5AST + 1DIG − 2.5AE − 2.5SE − 1.5BHE]
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
          1.5  * p.bhe
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
      const row = deriveStats(acc, setsPlayed, playerPositions[id] ?? null);
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
 * In-System vs Out-of-System pass outcome stats.
 *
 * In-System  (IS)  = pass rated 3 → how often did we win the point
 * Out-of-System (OOS) = pass rated 1 or 2 → how often did we win the point
 * Rating 0 (ace against us) is excluded.
 *
 * Returns { byRotation: { 1..6: { is_pa, is_won, oos_pa, oos_won } }, total: same }
 */
export function computeISvsOOS(contacts, rallies) {
  const rallyMap = new Map(rallies.map((r) => [r.id, r]));
  const mkSlot = () => ({ is_pa: 0, is_won: 0, oos_pa: 0, oos_won: 0 });
  const byRotation = {};
  for (let r = 1; r <= 6; r++) byRotation[r] = mkSlot();
  const total = mkSlot();

  for (const c of contacts) {
    if (c.opponent_contact || c.action !== 'pass') continue;
    const rating = parseInt(c.result, 10);
    if (rating === 0 || isNaN(rating)) continue; // ace — skip

    const rally = rallyMap.get(c.rally_id);
    if (!rally) continue;
    const won = rally.point_winner === 'us' ? 1 : 0;
    const slot = byRotation[c.rotation_num];
    const isIS = rating === 3;

    if (isIS) {
      if (slot) { slot.is_pa++; slot.is_won += won; }
      total.is_pa++; total.is_won += won;
    } else {
      if (slot) { slot.oos_pa++; slot.oos_won += won; }
      total.oos_pa++; total.oos_won += won;
    }
  }

  return { byRotation, total };
}

/**
 * Transition attack stats — hitting efficiency of attacks in rallies
 * where we had a dig (transition) or specifically a freeball dig (free).
 *
 * Groups our contacts by rally_id, flags rallies with digs/freeDigs,
 * then accumulates attacks from those rallies.
 *
 * Returns {
 *   free:       { total: {ta,k,ae,hit_pct,k_pct}, byRotation: {1..6: same} },
 *   transition: { total: ..., byRotation: ... }
 * }
 */
export function computeTransitionAttack(contacts) {
  const byRally = new Map();
  for (const c of contacts) {
    if (c.opponent_contact) continue;
    if (!byRally.has(c.rally_id)) {
      byRally.set(c.rally_id, { digs: 0, freeDigs: 0, attacks: [], rotation: null });
    }
    const r = byRally.get(c.rally_id);
    if (c.action === 'dig') {
      if (c.result === 'success' || c.result === 'freeball') r.digs++;
      if (c.result === 'freeball') r.freeDigs++;
    } else if (c.action === 'attack') {
      r.attacks.push(c);
    }
    if (r.rotation === null && c.rotation_num) r.rotation = c.rotation_num;
  }

  const mkSlot  = () => ({ ta: 0, k: 0, ae: 0 });
  const mkGroup = () => ({
    total:      mkSlot(),
    byRotation: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [i + 1, mkSlot()])),
  });
  const free       = mkGroup();
  const transition = mkGroup();

  for (const [, rally] of byRally) {
    if (!rally.attacks.length) continue;
    const rot = rally.rotation;
    for (const atk of rally.attacks) {
      const k  = atk.result === 'kill'  ? 1 : 0;
      const ae = atk.result === 'error' ? 1 : 0;
      const add = (group) => {
        group.total.ta++; group.total.k += k; group.total.ae += ae;
        if (rot >= 1 && rot <= 6) {
          group.byRotation[rot].ta++;
          group.byRotation[rot].k  += k;
          group.byRotation[rot].ae += ae;
        }
      };
      if (rally.freeDigs > 0) add(free);
      if (rally.digs     > 0) add(transition);
    }
  }

  const derive = (s) => ({
    ...s,
    hit_pct: s.ta > 0 ? (s.k - s.ae) / s.ta : null,
    k_pct:   s.ta > 0 ?  s.k          / s.ta : null,
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
export function computeFreeDigWin(contacts, rallies) {
  const rallyMap = new Map(rallies.map((r) => [r.id, r]));
  const mkSlot = () => ({ fb_dig: 0, fb_won: 0 });
  const byRotation = {};
  for (let r = 1; r <= 6; r++) byRotation[r] = mkSlot();
  const total = mkSlot();

  for (const c of contacts) {
    if (c.opponent_contact || c.action !== 'dig' || c.result !== 'freeball') continue;
    const rally = rallyMap.get(c.rally_id);
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
export function computeFreeballOutcomes(contacts, rallies) {
  const rallyMap = new Map(rallies.map(r => [r.id, r]));
  let fbr = 0, fbrWin = 0, fbs = 0, fbsWin = 0;
  for (const c of contacts) {
    if (c.opponent_contact) continue;
    const rally = rallyMap.get(c.rally_id);
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
  const given  = { se: 0, ae: 0, p0: 0, lift: 0, dbl: 0, net: 0 };
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
      else if (c.action === 'error'  && c.result === 'net')    given.net++;
    }
  }

  const earnedTotal = earned.ace + earned.k + earned.sblk + earned.hblk;
  const givenTotal  = given.se + given.ae + given.p0 + given.lift + given.dbl + given.net;
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
  return {
    players:          computePlayerStats(contacts, setsPlayed, playerPositions),
    team:             computeTeamStats(contacts, setsPlayed),
    rotation:         computeRotationStats(rallies),
    freeball:         computeFreeballOutcomes(contacts, rallies),
    isOos:            computeISvsOOS(contacts, rallies),
    transitionAttack: computeTransitionAttack(contacts),
    freeDigWin:       computeFreeDigWin(contacts, rallies),
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
  const [contacts, rallies, perMatchSets, playerPositions] = await Promise.all([
    getContactsForMatches(matchIds),
    getRalliesForMatches(matchIds),
    Promise.all(matchIds.map(getSetsPlayedCount)),
    getPlayerPositionsForMatches(matchIds),
  ]);
  const setsPlayed = perMatchSets.reduce((a, b) => a + b, 0);

  return {
    players:          computePlayerStats(contacts, setsPlayed, playerPositions),
    team:             computeTeamStats(contacts, setsPlayed),
    rotation:         computeRotationStats(rallies),
    freeball:         computeFreeballOutcomes(contacts, rallies),
    isOos:            computeISvsOOS(contacts, rallies),
    transitionAttack: computeTransitionAttack(contacts),
    freeDigWin:       computeFreeDigWin(contacts, rallies),
    runs:             computeRunsByRotation(rallies),
    setsPlayed,
    matchCount:       matchIds.length,
    totalMatchCount,
    contacts,
  };
}
