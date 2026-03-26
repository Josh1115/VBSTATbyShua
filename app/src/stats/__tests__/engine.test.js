import { describe, it, expect } from 'vitest';
import {
  computePlayerStats,
  computeTeamStats,
  computeRotationStats,
  computeFreeballOutcomes,
  computeOppDisplayStats,
  computeRotationContactStats,
  computeISvsOOS,
  computeTransitionAttack,
  computeFreeDigWin,
  computePointQuality,
  computeServeZoneStats,
  computeSetTrends,
  computeRallyHistogram,
  computeRunsByRotation,
} from '../engine';
import {
  fmt,
  fmtHitting,
  fmtPassRating,
  fmtPct,
  fmtCount,
} from '../formatters';

// ── Helpers ──────────────────────────────────────────────────────────────────

const contact = (overrides) => ({
  player_id: 'p1',
  opponent_contact: false,
  rally_id: null,
  ...overrides,
});

const rally = (overrides) => ({
  id: 1,
  serve_side: 'us',
  point_winner: 'us',
  our_rotation: 1,
  ...overrides,
});

// ── computePlayerStats ───────────────────────────────────────────────────────

describe('computePlayerStats', () => {
  it('returns empty object when no contacts', () => {
    expect(computePlayerStats([])).toEqual({});
  });

  it('skips opponent contacts', () => {
    const contacts = [contact({ action: 'attack', result: 'kill', opponent_contact: true })];
    expect(computePlayerStats(contacts)).toEqual({});
  });

  it('skips contacts with no player_id', () => {
    const contacts = [contact({ player_id: null, action: 'serve', result: 'ace' })];
    expect(computePlayerStats(contacts)).toEqual({});
  });

  it('accumulates serve stats correctly', () => {
    const contacts = [
      contact({ action: 'serve', result: 'ace' }),
      contact({ action: 'serve', result: 'error' }),
      contact({ action: 'serve', result: 'in' }),
    ];
    const { p1 } = computePlayerStats(contacts, 1);
    expect(p1.sa).toBe(3);
    expect(p1.ace).toBe(1);
    expect(p1.se).toBe(1);
  });

  it('computes ace_pct and se_pct', () => {
    const contacts = [
      contact({ action: 'serve', result: 'ace' }),
      contact({ action: 'serve', result: 'error' }),
      contact({ action: 'serve', result: 'in' }),
      contact({ action: 'serve', result: 'in' }),
    ];
    const { p1 } = computePlayerStats(contacts, 1);
    expect(p1.ace_pct).toBeCloseTo(0.25);
    expect(p1.se_pct).toBeCloseTo(0.25);
    expect(p1.si_pct).toBeCloseTo(0.75);
  });

  it('accumulates pass stats and computes APR', () => {
    const contacts = [
      contact({ action: 'pass', result: '3' }),
      contact({ action: 'pass', result: '3' }),
      contact({ action: 'pass', result: '2' }),
      contact({ action: 'pass', result: '0' }),
    ];
    const { p1 } = computePlayerStats(contacts, 1);
    expect(p1.pa).toBe(4);
    expect(p1.p3).toBe(2);
    expect(p1.p2).toBe(1);
    expect(p1.p0).toBe(1);
    // APR = (0*1 + 2*1 + 3*2) / 4 = 8/4 = 2.0
    expect(p1.apr).toBeCloseTo(2.0);
    // PP% = 2/4 = 0.5
    expect(p1.pp_pct).toBeCloseTo(0.5);
  });

  it('APR is 0 when all passes are zeros', () => {
    const contacts = [
      contact({ action: 'pass', result: '0' }),
      contact({ action: 'pass', result: '0' }),
    ];
    const { p1 } = computePlayerStats(contacts, 1);
    expect(p1.apr).toBe(0);
  });

  it('APR is 3 when all passes are perfect', () => {
    const contacts = [
      contact({ action: 'pass', result: '3' }),
      contact({ action: 'pass', result: '3' }),
    ];
    const { p1 } = computePlayerStats(contacts, 1);
    expect(p1.apr).toBe(3);
  });

  it('accumulates attack stats and computes hitting%', () => {
    const contacts = [
      contact({ action: 'attack', result: 'kill' }),
      contact({ action: 'attack', result: 'kill' }),
      contact({ action: 'attack', result: 'error' }),
      contact({ action: 'attack', result: 'attempt' }),
    ];
    const { p1 } = computePlayerStats(contacts, 1);
    expect(p1.ta).toBe(4);
    expect(p1.k).toBe(2);
    expect(p1.ae).toBe(1);
    // HIT% = (2-1)/4 = 0.25
    expect(p1.hit_pct).toBeCloseTo(0.25);
  });

  it('hitting% is negative when errors exceed kills', () => {
    const contacts = [
      contact({ action: 'attack', result: 'kill' }),
      contact({ action: 'attack', result: 'error' }),
      contact({ action: 'attack', result: 'error' }),
      contact({ action: 'attack', result: 'error' }),
    ];
    const { p1 } = computePlayerStats(contacts, 1);
    // HIT% = (1-3)/4 = -0.5
    expect(p1.hit_pct).toBeCloseTo(-0.5);
  });

  it('hitting% is null when 0 attempts', () => {
    const contacts = [contact({ action: 'serve', result: 'ace' })];
    const { p1 } = computePlayerStats(contacts, 1);
    expect(p1.hit_pct).toBeNull();
  });

  it('accumulates block stats', () => {
    const contacts = [
      contact({ action: 'block', result: 'solo',   set_id: 1 }),
      contact({ action: 'block', result: 'assist', set_id: 2 }),
      contact({ action: 'block', result: 'error',  set_id: 1 }),
    ];
    const { p1 } = computePlayerStats(contacts, 2);
    expect(p1.bs).toBe(1);
    expect(p1.ba).toBe(1);
    expect(p1.be).toBe(1);
    // BPS = (1 + 1*0.5) / 2 = 0.75
    expect(p1.bps).toBeCloseTo(0.75);
  });

  it('accumulates dig stats', () => {
    const contacts = [
      contact({ action: 'dig', result: 'success', set_id: 1 }),
      contact({ action: 'dig', result: 'success', set_id: 2 }),
      contact({ action: 'dig', result: 'error',   set_id: 1 }),
    ];
    const { p1 } = computePlayerStats(contacts, 2);
    expect(p1.dig).toBe(2);
    expect(p1.de).toBe(1);
    // DiPS = 2/2 = 1.0
    expect(p1.dips).toBeCloseTo(1.0);
  });

  it('accumulates set stats', () => {
    const contacts = [
      contact({ action: 'set', result: 'assist',             set_id: 1 }),
      contact({ action: 'set', result: 'assist',             set_id: 2 }),
      contact({ action: 'set', result: 'ball_handling_error', set_id: 1 }),
    ];
    const { p1 } = computePlayerStats(contacts, 2);
    expect(p1.ast).toBe(2);
    expect(p1.bhe).toBe(1);
    // APS = 2/2 = 1.0
    expect(p1.aps).toBeCloseTo(1.0);
  });

  it('accumulates freeball stats', () => {
    const contacts = [
      contact({ action: 'freeball_receive' }),
      contact({ action: 'freeball_receive' }),
      contact({ action: 'freeball_send' }),
    ];
    const { p1 } = computePlayerStats(contacts, 1);
    expect(p1.fbr).toBe(2);
    expect(p1.fbs).toBe(1);
  });

  it('buckets contacts by player_id', () => {
    const contacts = [
      contact({ player_id: 'p1', action: 'serve', result: 'ace' }),
      contact({ player_id: 'p2', action: 'serve', result: 'error' }),
      contact({ player_id: 'p1', action: 'serve', result: 'in' }),
    ];
    const stats = computePlayerStats(contacts, 1);
    expect(stats.p1.sa).toBe(2);
    expect(stats.p1.ace).toBe(1);
    expect(stats.p2.sa).toBe(1);
    expect(stats.p2.se).toBe(1);
  });
});

// ── computeTeamStats ─────────────────────────────────────────────────────────

describe('computeTeamStats', () => {
  it('aggregates all non-opponent contacts', () => {
    const contacts = [
      contact({ player_id: 'p1', action: 'attack', result: 'kill' }),
      contact({ player_id: 'p2', action: 'attack', result: 'kill' }),
      contact({ player_id: 'p3', action: 'attack', result: 'error', opponent_contact: true }),
    ];
    const stats = computeTeamStats(contacts, 1);
    expect(stats.k).toBe(2);
    expect(stats.ta).toBe(2);
  });
});

// ── computeRotationStats ─────────────────────────────────────────────────────

describe('computeRotationStats', () => {
  it('returns null SO%/BP% when no rallies', () => {
    const stats = computeRotationStats([]);
    expect(stats.so_pct).toBeNull();
    expect(stats.bp_pct).toBeNull();
  });

  it('computes SO% correctly', () => {
    const rallies = [
      rally({ serve_side: 'them', point_winner: 'us',   our_rotation: 1 }),
      rally({ serve_side: 'them', point_winner: 'us',   our_rotation: 1 }),
      rally({ serve_side: 'them', point_winner: 'them', our_rotation: 2 }),
    ];
    const stats = computeRotationStats(rallies);
    // 2 sideout wins out of 3 opportunities
    expect(stats.so_pct).toBeCloseTo(2 / 3);
  });

  it('computes BP% correctly', () => {
    const rallies = [
      rally({ serve_side: 'us', point_winner: 'us',   our_rotation: 1 }),
      rally({ serve_side: 'us', point_winner: 'them', our_rotation: 1 }),
      rally({ serve_side: 'us', point_winner: 'them', our_rotation: 1 }),
    ];
    const stats = computeRotationStats(rallies);
    // 1 BP win out of 3 opportunities
    expect(stats.bp_pct).toBeCloseTo(1 / 3);
  });

  it('returns null rotation SO% when rotation had no sideout opportunities', () => {
    const rallies = [
      rally({ serve_side: 'us', point_winner: 'us', our_rotation: 1 }),
    ];
    const stats = computeRotationStats(rallies);
    expect(stats.rotations[1].so_pct).toBeNull();
    expect(stats.rotations[1].bp_pct).toBeCloseTo(1);
  });

  it('tracks per-rotation stats independently', () => {
    const rallies = [
      rally({ serve_side: 'them', point_winner: 'us',   our_rotation: 1 }),
      rally({ serve_side: 'them', point_winner: 'them', our_rotation: 2 }),
    ];
    const stats = computeRotationStats(rallies);
    expect(stats.rotations[1].so_pct).toBeCloseTo(1);
    expect(stats.rotations[2].so_pct).toBeCloseTo(0);
  });
});

// ── computeFreeballOutcomes ───────────────────────────────────────────────────

describe('computeFreeballOutcomes', () => {
  it('returns null pcts when no freeball contacts', () => {
    const result = computeFreeballOutcomes([], []);
    expect(result.fbo_pct).toBeNull();
    expect(result.fbd_pct).toBeNull();
  });

  it('computes FBO% — freeball receive win rate', () => {
    const rallies = [
      rally({ set_id: 1, rally_number: 1, point_winner: 'us' }),
      rally({ set_id: 1, rally_number: 2, point_winner: 'us' }),
      rally({ set_id: 1, rally_number: 3, point_winner: 'them' }),
    ];
    const contacts = [
      contact({ action: 'freeball_receive', set_id: 1, rally_number: 1 }),
      contact({ action: 'freeball_receive', set_id: 1, rally_number: 2 }),
      contact({ action: 'freeball_receive', set_id: 1, rally_number: 3 }),
    ];
    const result = computeFreeballOutcomes(contacts, rallies);
    expect(result.fbr).toBe(3);
    // 2 wins out of 3 receive rallies
    expect(result.fbo_pct).toBeCloseTo(2 / 3);
  });

  it('computes FBD% — freeball send win rate', () => {
    const rallies = [
      rally({ set_id: 1, rally_number: 10, point_winner: 'us' }),
      rally({ set_id: 1, rally_number: 11, point_winner: 'them' }),
    ];
    const contacts = [
      contact({ action: 'freeball_send', set_id: 1, rally_number: 10 }),
      contact({ action: 'freeball_send', set_id: 1, rally_number: 11 }),
    ];
    const result = computeFreeballOutcomes(contacts, rallies);
    expect(result.fbs).toBe(2);
    expect(result.fbd_pct).toBeCloseTo(0.5);
  });

  it('skips opponent contacts', () => {
    const rallies = [rally({ set_id: 1, rally_number: 1, point_winner: 'us' })];
    const contacts = [
      contact({ action: 'freeball_receive', set_id: 1, rally_number: 1, opponent_contact: true }),
    ];
    const result = computeFreeballOutcomes(contacts, rallies);
    expect(result.fbr).toBe(0);
    expect(result.fbo_pct).toBeNull();
  });

  it('skips contacts with no matching rally', () => {
    const contacts = [
      contact({ action: 'freeball_receive', set_id: 1, rally_number: 999 }),
    ];
    const result = computeFreeballOutcomes(contacts, []);
    // no matching rally in map — not counted
    expect(result.fbr).toBe(0);
  });
});

// ── formatters ───────────────────────────────────────────────────────────────

describe('formatters', () => {
  describe('fmtHitting', () => {
    it('formats positive value with + sign and 3 decimal places', () => {
      expect(fmtHitting(0.312)).toBe('+0.312');
    });

    it('formats negative value with - sign', () => {
      expect(fmtHitting(-0.045)).toBe('-0.045');
    });

    it('formats zero as +0.000', () => {
      expect(fmtHitting(0)).toBe('+0.000');
    });

    it('returns — for null', () => {
      expect(fmtHitting(null)).toBe('—');
    });

    it('returns — for undefined', () => {
      expect(fmtHitting(undefined)).toBe('—');
    });
  });

  describe('fmtPassRating', () => {
    it('formats to 2 decimal places', () => {
      expect(fmtPassRating(2.3456)).toBe('2.35');
    });

    it('returns — for null', () => {
      expect(fmtPassRating(null)).toBe('—');
    });
  });

  describe('fmtPct', () => {
    it('formats as 1-decimal percentage', () => {
      expect(fmtPct(0.183)).toBe('18.3%');
    });

    it('formats 100%', () => {
      expect(fmtPct(1)).toBe('100.0%');
    });

    it('returns — for null', () => {
      expect(fmtPct(null)).toBe('—');
    });
  });

  describe('fmtCount', () => {
    it('rounds and returns string', () => {
      expect(fmtCount(7)).toBe('7');
    });

    it('rounds fractional values', () => {
      expect(fmtCount(7.6)).toBe('8');
    });

    it('returns — for null', () => {
      expect(fmtCount(null)).toBe('—');
    });
  });

  describe('fmt (null-safe wrapper)', () => {
    it('applies fn to defined values', () => {
      expect(fmt(5, v => v * 2)).toBe(10);
    });

    it('returns — for null', () => {
      expect(fmt(null, v => v * 2)).toBe('—');
    });

    it('returns — for undefined', () => {
      expect(fmt(undefined, v => v * 2)).toBe('—');
    });
  });
});

// ── computeOppDisplayStats ────────────────────────────────────────────────────

describe('computeOppDisplayStats', () => {
  it('returns zeroes with empty contacts', () => {
    const result = computeOppDisplayStats([]);
    expect(result).toEqual({ ace: 0, se: 0, k: 0, ae: 0, blk: 0, errs: 0 });
  });

  it('counts opponent serve errors as se', () => {
    const contacts = [
      contact({ opponent_contact: true, action: 'serve', result: 'error' }),
      contact({ opponent_contact: true, action: 'serve', result: 'ace' }), // not counted
    ];
    const result = computeOppDisplayStats(contacts);
    expect(result.se).toBe(1);
  });

  it('counts opponent kills as k', () => {
    const contacts = [
      contact({ opponent_contact: true, action: 'attack', result: 'kill' }),
      contact({ opponent_contact: true, action: 'attack', result: 'kill' }),
    ];
    const result = computeOppDisplayStats(contacts);
    expect(result.k).toBe(2);
  });

  it('counts opponent attack errors as ae', () => {
    const contacts = [
      contact({ opponent_contact: true, action: 'attack', result: 'error' }),
    ];
    const result = computeOppDisplayStats(contacts);
    expect(result.ae).toBe(1);
  });

  it('counts opponent solo blocks as blk', () => {
    const contacts = [
      contact({ opponent_contact: true, action: 'block', result: 'solo' }),
    ];
    const result = computeOppDisplayStats(contacts);
    expect(result.blk).toBe(1);
  });

  it('counts opponent errors (BHE/NET) as errs', () => {
    const contacts = [
      contact({ opponent_contact: true, action: 'error', result: 'ball_handling_error' }),
      contact({ opponent_contact: true, action: 'error', result: 'net' }),
    ];
    const result = computeOppDisplayStats(contacts);
    expect(result.errs).toBe(2);
  });

  it('derives ace from our pass rated 0 (opponent ace)', () => {
    const contacts = [
      contact({ opponent_contact: false, action: 'pass', result: '0' }),
      contact({ opponent_contact: false, action: 'pass', result: '1' }), // not an ace
    ];
    const result = computeOppDisplayStats(contacts);
    expect(result.ace).toBe(1);
  });

  it('ignores our non-opponent contacts for opp stats', () => {
    const contacts = [
      contact({ opponent_contact: false, action: 'attack', result: 'kill' }),
      contact({ opponent_contact: false, action: 'serve', result: 'ace' }),
    ];
    const result = computeOppDisplayStats(contacts);
    expect(result.k).toBe(0);
    expect(result.se).toBe(0);
  });
});

// ── computeRotationContactStats ───────────────────────────────────────────────

describe('computeRotationContactStats', () => {
  it('returns 6 rotation slots even with no contacts', () => {
    const result = computeRotationContactStats([]);
    expect(Object.keys(result)).toHaveLength(6);
    expect(result[1].k).toBe(0);
  });

  it('bins contacts into correct rotation slot', () => {
    const contacts = [
      contact({ rotation_num: 1, action: 'attack', result: 'kill' }),
      contact({ rotation_num: 1, action: 'attack', result: 'kill' }),
      contact({ rotation_num: 2, action: 'attack', result: 'kill' }),
    ];
    const result = computeRotationContactStats(contacts);
    expect(result[1].k).toBe(2);
    expect(result[2].k).toBe(1);
    expect(result[3].k).toBe(0);
  });

  it('skips opponent contacts', () => {
    const contacts = [
      contact({ rotation_num: 1, action: 'attack', result: 'kill', opponent_contact: true }),
    ];
    const result = computeRotationContactStats(contacts);
    expect(result[1].k).toBe(0);
  });

  it('skips contacts with no rotation_num', () => {
    const contacts = [
      contact({ rotation_num: null, action: 'serve', result: 'ace' }),
    ];
    const result = computeRotationContactStats(contacts);
    for (let r = 1; r <= 6; r++) expect(result[r].ace).toBe(0);
  });

  it('computes hitting% within a rotation slot', () => {
    const contacts = [
      contact({ rotation_num: 3, action: 'attack', result: 'kill' }),
      contact({ rotation_num: 3, action: 'attack', result: 'kill' }),
      contact({ rotation_num: 3, action: 'attack', result: 'error' }),
      contact({ rotation_num: 3, action: 'attack', result: 'attempt' }),
    ];
    const result = computeRotationContactStats(contacts);
    // HIT% = (2 - 1) / 4 = 0.25
    expect(result[3].hit_pct).toBeCloseTo(0.25);
  });
});

// ── computeISvsOOS ────────────────────────────────────────────────────────────

describe('computeISvsOOS', () => {
  it('returns empty totals with no contacts', () => {
    const result = computeISvsOOS([], []);
    expect(result.total.is.ta).toBe(0);
    expect(result.total.oos.ta).toBe(0);
  });

  it('classifies pass-3 rally as IS', () => {
    const rallies = [
      rally({ set_id: 1, rally_number: 1, point_winner: 'us', our_rotation: 1 }),
    ];
    const contacts = [
      contact({ set_id: 1, rally_number: 1, action: 'pass',   result: '3', timestamp: 100, rotation_num: 1 }),
      contact({ set_id: 1, rally_number: 1, action: 'attack', result: 'kill', timestamp: 200, rotation_num: 1 }),
    ];
    const result = computeISvsOOS(contacts, rallies);
    expect(result.total.is.ta).toBe(1);
    expect(result.total.is.k).toBe(1);
    expect(result.total.oos.ta).toBe(0);
  });

  it('classifies pass-2 rally as OOS', () => {
    const rallies = [
      rally({ set_id: 1, rally_number: 2, point_winner: 'them', our_rotation: 1 }),
    ];
    const contacts = [
      contact({ set_id: 1, rally_number: 2, action: 'pass',   result: '2', timestamp: 100, rotation_num: 1 }),
      contact({ set_id: 1, rally_number: 2, action: 'attack', result: 'error', timestamp: 200, rotation_num: 1 }),
    ];
    const result = computeISvsOOS(contacts, rallies);
    expect(result.total.oos.ta).toBe(1);
    expect(result.total.oos.ae).toBe(1);
    expect(result.total.is.ta).toBe(0);
  });

  it('excludes pass-0 rallies (ace against us)', () => {
    const rallies = [
      rally({ set_id: 1, rally_number: 3, point_winner: 'them', our_rotation: 1 }),
    ];
    const contacts = [
      contact({ set_id: 1, rally_number: 3, action: 'pass',   result: '0', timestamp: 100, rotation_num: 1 }),
      contact({ set_id: 1, rally_number: 3, action: 'attack', result: 'kill', timestamp: 200, rotation_num: 1 }),
    ];
    const result = computeISvsOOS(contacts, rallies);
    // Rating 0 is excluded from both IS and OOS
    expect(result.total.is.ta).toBe(0);
    expect(result.total.oos.ta).toBe(0);
  });

  it('tracks win_pct correctly', () => {
    const rallies = [
      rally({ set_id: 1, rally_number: 1, point_winner: 'us',   our_rotation: 1 }),
      rally({ set_id: 1, rally_number: 2, point_winner: 'them', our_rotation: 1 }),
    ];
    const contacts = [
      contact({ set_id: 1, rally_number: 1, action: 'pass',   result: '3', timestamp: 100, rotation_num: 1 }),
      contact({ set_id: 1, rally_number: 1, action: 'attack', result: 'kill', timestamp: 200, rotation_num: 1 }),
      contact({ set_id: 1, rally_number: 2, action: 'pass',   result: '3', timestamp: 300, rotation_num: 1 }),
      contact({ set_id: 1, rally_number: 2, action: 'attack', result: 'attempt', timestamp: 400, rotation_num: 1 }),
    ];
    const result = computeISvsOOS(contacts, rallies);
    expect(result.total.is.ta).toBe(2);
    expect(result.total.is.win_pct).toBeCloseTo(0.5);
  });

  it('bins stats per rotation slot', () => {
    const rallies = [
      rally({ set_id: 1, rally_number: 1, point_winner: 'us', our_rotation: 2 }),
    ];
    const contacts = [
      contact({ set_id: 1, rally_number: 1, action: 'pass',   result: '3', timestamp: 100, rotation_num: 2 }),
      contact({ set_id: 1, rally_number: 1, action: 'attack', result: 'kill', timestamp: 200, rotation_num: 2 }),
    ];
    const result = computeISvsOOS(contacts, rallies);
    expect(result.byRotation[2].is.k).toBe(1);
    expect(result.byRotation[1].is.k).toBe(0);
  });
});

// ── computeTransitionAttack ───────────────────────────────────────────────────

describe('computeTransitionAttack', () => {
  it('returns empty buckets with no contacts', () => {
    const result = computeTransitionAttack([], []);
    expect(result.free.total.ta).toBe(0);
    expect(result.transition.total.ta).toBe(0);
  });

  it('classifies dig-success attack as transition', () => {
    const rallies = [
      rally({ set_id: 1, rally_number: 1, point_winner: 'us', our_rotation: 1 }),
    ];
    const contacts = [
      contact({ set_id: 1, rally_number: 1, action: 'dig',    result: 'success',  timestamp: 100, rotation_num: 1 }),
      contact({ set_id: 1, rally_number: 1, action: 'attack', result: 'kill',     timestamp: 200, rotation_num: 1 }),
    ];
    const result = computeTransitionAttack(contacts, rallies);
    expect(result.transition.total.ta).toBe(1);
    expect(result.transition.total.k).toBe(1);
    expect(result.free.total.ta).toBe(0);
  });

  it('classifies dig-freeball attack as free', () => {
    const rallies = [
      rally({ set_id: 1, rally_number: 2, point_winner: 'them', our_rotation: 1 }),
    ];
    const contacts = [
      contact({ set_id: 1, rally_number: 2, action: 'dig',    result: 'freeball', timestamp: 100, rotation_num: 1 }),
      contact({ set_id: 1, rally_number: 2, action: 'attack', result: 'error',    timestamp: 200, rotation_num: 1 }),
    ];
    const result = computeTransitionAttack(contacts, rallies);
    expect(result.free.total.ta).toBe(1);
    expect(result.free.total.ae).toBe(1);
    expect(result.transition.total.ta).toBe(0);
  });

  it('skips opponent contacts', () => {
    const rallies = [rally({ set_id: 1, rally_number: 1, point_winner: 'us', our_rotation: 1 })];
    const contacts = [
      contact({ set_id: 1, rally_number: 1, action: 'dig',    result: 'success', timestamp: 100, rotation_num: 1, opponent_contact: true }),
      contact({ set_id: 1, rally_number: 1, action: 'attack', result: 'kill',    timestamp: 200, rotation_num: 1 }),
    ];
    const result = computeTransitionAttack(contacts, rallies);
    expect(result.transition.total.ta).toBe(0);
  });

  it('computes win_pct for transition bucket', () => {
    const rallies = [
      rally({ set_id: 1, rally_number: 1, point_winner: 'us',   our_rotation: 1 }),
      rally({ set_id: 1, rally_number: 2, point_winner: 'us',   our_rotation: 1 }),
      rally({ set_id: 1, rally_number: 3, point_winner: 'them', our_rotation: 1 }),
    ];
    const contacts = [
      contact({ set_id: 1, rally_number: 1, action: 'dig',    result: 'success', timestamp: 100, rotation_num: 1 }),
      contact({ set_id: 1, rally_number: 1, action: 'attack', result: 'kill',    timestamp: 200, rotation_num: 1 }),
      contact({ set_id: 1, rally_number: 2, action: 'dig',    result: 'success', timestamp: 300, rotation_num: 1 }),
      contact({ set_id: 1, rally_number: 2, action: 'attack', result: 'kill',    timestamp: 400, rotation_num: 1 }),
      contact({ set_id: 1, rally_number: 3, action: 'dig',    result: 'success', timestamp: 500, rotation_num: 1 }),
      contact({ set_id: 1, rally_number: 3, action: 'attack', result: 'attempt', timestamp: 600, rotation_num: 1 }),
    ];
    const result = computeTransitionAttack(contacts, rallies);
    expect(result.transition.total.ta).toBe(3);
    expect(result.transition.total.win_pct).toBeCloseTo(2 / 3);
  });
});

// ── computeFreeDigWin ─────────────────────────────────────────────────────────

describe('computeFreeDigWin', () => {
  it('returns zero totals with no contacts', () => {
    const result = computeFreeDigWin([], []);
    expect(result.total.fb_dig).toBe(0);
    expect(result.total.fb_won).toBe(0);
  });

  it('counts freeball digs and wins', () => {
    const rallies = [
      rally({ set_id: 1, rally_number: 1, point_winner: 'us',   our_rotation: 1 }),
      rally({ set_id: 1, rally_number: 2, point_winner: 'them', our_rotation: 1 }),
      rally({ set_id: 1, rally_number: 3, point_winner: 'us',   our_rotation: 1 }),
    ];
    const contacts = [
      contact({ set_id: 1, rally_number: 1, action: 'dig', result: 'freeball', rotation_num: 1 }),
      contact({ set_id: 1, rally_number: 2, action: 'dig', result: 'freeball', rotation_num: 1 }),
      contact({ set_id: 1, rally_number: 3, action: 'dig', result: 'freeball', rotation_num: 1 }),
    ];
    const result = computeFreeDigWin(contacts, rallies);
    expect(result.total.fb_dig).toBe(3);
    expect(result.total.fb_won).toBe(2);
  });

  it('ignores non-freeball digs', () => {
    const rallies = [rally({ set_id: 1, rally_number: 1, point_winner: 'us', our_rotation: 1 })];
    const contacts = [
      contact({ set_id: 1, rally_number: 1, action: 'dig', result: 'success', rotation_num: 1 }),
    ];
    const result = computeFreeDigWin(contacts, rallies);
    expect(result.total.fb_dig).toBe(0);
  });

  it('ignores opponent contacts', () => {
    const rallies = [rally({ set_id: 1, rally_number: 1, point_winner: 'us', our_rotation: 1 })];
    const contacts = [
      contact({ set_id: 1, rally_number: 1, action: 'dig', result: 'freeball', rotation_num: 1, opponent_contact: true }),
    ];
    const result = computeFreeDigWin(contacts, rallies);
    expect(result.total.fb_dig).toBe(0);
  });

  it('bins correctly into rotation slots', () => {
    const rallies = [
      rally({ set_id: 1, rally_number: 1, point_winner: 'us', our_rotation: 3 }),
      rally({ set_id: 1, rally_number: 2, point_winner: 'us', our_rotation: 5 }),
    ];
    const contacts = [
      contact({ set_id: 1, rally_number: 1, action: 'dig', result: 'freeball', rotation_num: 3 }),
      contact({ set_id: 1, rally_number: 2, action: 'dig', result: 'freeball', rotation_num: 5 }),
    ];
    const result = computeFreeDigWin(contacts, rallies);
    expect(result.byRotation[3].fb_dig).toBe(1);
    expect(result.byRotation[5].fb_dig).toBe(1);
    expect(result.byRotation[1].fb_dig).toBe(0);
  });
});

// ── computePointQuality ───────────────────────────────────────────────────────

describe('computePointQuality', () => {
  it('returns zeroes with no contacts', () => {
    const result = computePointQuality([]);
    expect(result.earned.total).toBe(0);
    expect(result.given.total).toBe(0);
    expect(result.free.total).toBe(0);
    expect(result.scored).toBe(0);
    expect(result.earned_pct).toBeNull();
    expect(result.free_pct).toBeNull();
  });

  it('counts earned points — aces, kills, solo blocks, block assists (0.5 each)', () => {
    const contacts = [
      contact({ action: 'serve',  result: 'ace'    }),
      contact({ action: 'attack', result: 'kill'   }),
      contact({ action: 'block',  result: 'solo'   }),
      contact({ action: 'block',  result: 'assist' }), // 0.5 each — two contacts = 1 point
      contact({ action: 'block',  result: 'assist' }),
    ];
    const result = computePointQuality(contacts);
    expect(result.earned.ace).toBe(1);
    expect(result.earned.k).toBe(1);
    expect(result.earned.sblk).toBe(1);
    expect(result.earned.hblk).toBe(1); // 2 × 0.5
    expect(result.earned.total).toBe(4);
  });

  it('counts given points — serve errors, attack errors, p0 passes, lift/dbl/net errors', () => {
    const contacts = [
      contact({ action: 'serve',  result: 'error'  }),
      contact({ action: 'attack', result: 'error'  }),
      contact({ action: 'pass',   result: '0'      }),
      contact({ action: 'error',  result: 'lift'   }),
      contact({ action: 'error',  result: 'double' }),
      contact({ action: 'error',  result: 'net'    }),
    ];
    const result = computePointQuality(contacts);
    expect(result.given.se).toBe(1);
    expect(result.given.ae).toBe(1);
    expect(result.given.p0).toBe(1);
    expect(result.given.lift).toBe(1);
    expect(result.given.dbl).toBe(1);
    expect(result.given.net).toBe(1);
    expect(result.given.total).toBe(6);
  });

  it('counts free points — opponent errors', () => {
    const contacts = [
      contact({ opponent_contact: true, action: 'serve',  result: 'error'               }),
      contact({ opponent_contact: true, action: 'attack', result: 'error'               }),
      contact({ opponent_contact: true, action: 'error',  result: 'ball_handling_error' }),
      contact({ opponent_contact: true, action: 'error',  result: 'net'                 }),
    ];
    const result = computePointQuality(contacts);
    expect(result.free.se).toBe(1);
    expect(result.free.ae).toBe(1);
    expect(result.free.bhe).toBe(1);
    expect(result.free.net).toBe(1);
    expect(result.free.total).toBe(4);
  });

  it('computes earned_pct and free_pct from scored total', () => {
    const contacts = [
      contact({ action: 'attack', result: 'kill'  }), // earned
      contact({ opponent_contact: true, action: 'serve', result: 'error' }), // free
    ];
    const result = computePointQuality(contacts);
    expect(result.scored).toBe(2);
    expect(result.earned_pct).toBeCloseTo(0.5);
    expect(result.free_pct).toBeCloseTo(0.5);
  });
});

// ── computeServeZoneStats ─────────────────────────────────────────────────────

describe('computeServeZoneStats', () => {
  it('returns 6 zones with zero counts when no contacts', () => {
    const result = computeServeZoneStats([]);
    expect(Object.keys(result)).toHaveLength(6);
    expect(result[1].sa).toBe(0);
  });

  it('buckets serves by zone', () => {
    const contacts = [
      contact({ action: 'serve', result: 'in',    zone: 1 }),
      contact({ action: 'serve', result: 'ace',   zone: 1 }),
      contact({ action: 'serve', result: 'error', zone: 2 }),
      contact({ action: 'serve', result: 'in',    zone: 3 }),
    ];
    const result = computeServeZoneStats(contacts);
    expect(result[1].sa).toBe(2);
    expect(result[1].ace).toBe(1);
    expect(result[2].sa).toBe(1);
    expect(result[2].se).toBe(1);
    expect(result[3].sa).toBe(1);
  });

  it('ignores non-serve contacts', () => {
    const contacts = [contact({ action: 'attack', result: 'kill', zone: 1 })];
    const result = computeServeZoneStats(contacts);
    expect(result[1].sa).toBe(0);
  });

  it('ignores opponent contacts', () => {
    const contacts = [contact({ action: 'serve', result: 'ace', zone: 1, opponent_contact: true })];
    const result = computeServeZoneStats(contacts);
    expect(result[1].sa).toBe(0);
  });

  it('ignores contacts with no zone', () => {
    const contacts = [contact({ action: 'serve', result: 'ace', zone: null })];
    const result = computeServeZoneStats(contacts);
    for (let z = 1; z <= 6; z++) expect(result[z].sa).toBe(0);
  });

  it('computes ace_pct and si_pct as rounded integers', () => {
    // 1 ace out of 4 → 25%, 3 in-bounds out of 4 → 75%
    const contacts = [
      contact({ action: 'serve', result: 'ace',   zone: 4 }),
      contact({ action: 'serve', result: 'in',    zone: 4 }),
      contact({ action: 'serve', result: 'in',    zone: 4 }),
      contact({ action: 'serve', result: 'in',    zone: 4 }),
    ];
    const result = computeServeZoneStats(contacts);
    expect(result[4].ace_pct).toBe(25);
    expect(result[4].si_pct).toBe(100); // no errors → 100% in
  });
});

// ── computeSetTrends ──────────────────────────────────────────────────────────

describe('computeSetTrends', () => {
  it('returns empty array with no contacts', () => {
    expect(computeSetTrends([], [{ id: 1, set_number: 1 }])).toEqual([]);
  });

  it('returns empty array with no sets', () => {
    expect(computeSetTrends([contact({ action: 'attack', result: 'kill', set_id: 1 })], [])).toEqual([]);
  });

  it('produces one entry per set, sorted by set_number', () => {
    const sets = [
      { id: 2, set_number: 2 },
      { id: 1, set_number: 1 },
    ];
    const contacts = [
      contact({ action: 'attack', result: 'kill',  set_id: 1 }),
      contact({ action: 'attack', result: 'error', set_id: 2 }),
    ];
    const result = computeSetTrends(contacts, sets);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Set 1');
    expect(result[1].name).toBe('Set 2');
  });

  it('computes K% correctly', () => {
    const sets = [{ id: 1, set_number: 1 }];
    const contacts = [
      contact({ action: 'attack', result: 'kill',    set_id: 1 }),
      contact({ action: 'attack', result: 'kill',    set_id: 1 }),
      contact({ action: 'attack', result: 'attempt', set_id: 1 }),
      contact({ action: 'attack', result: 'attempt', set_id: 1 }),
    ];
    const result = computeSetTrends(contacts, sets);
    // 2 kills / 4 attempts = 50%
    expect(result[0]['K%']).toBe(50);
  });

  it('computes APR correctly', () => {
    const sets = [{ id: 1, set_number: 1 }];
    const contacts = [
      contact({ action: 'pass', result: '3', set_id: 1 }),
      contact({ action: 'pass', result: '3', set_id: 1 }),
      contact({ action: 'pass', result: '2', set_id: 1 }),
      contact({ action: 'pass', result: '0', set_id: 1 }),
    ];
    const result = computeSetTrends(contacts, sets);
    // APR = (3+3+2+0)/4 = 2.0
    expect(result[0]['APR']).toBe(2.0);
  });
});

// ── computeRallyHistogram ─────────────────────────────────────────────────────

describe('computeRallyHistogram', () => {
  it('returns empty array with no contacts', () => {
    expect(computeRallyHistogram([])).toEqual([]);
  });

  it('returns 5 buckets with contacts', () => {
    const contacts = [contact({ set_id: 1, rally_number: 1, action: 'serve', result: 'ace' })];
    const result = computeRallyHistogram(contacts);
    expect(result).toHaveLength(5);
  });

  it('counts contacts per rally key to determine length', () => {
    // 1 contact in rally 1 → bucket "1"; 3 contacts in rally 2 → bucket "2–3"
    const contacts = [
      contact({ set_id: 1, rally_number: 1, action: 'serve',  result: 'ace'     }),
      contact({ set_id: 1, rally_number: 2, action: 'serve',  result: 'in'      }),
      contact({ set_id: 1, rally_number: 2, action: 'pass',   result: '3'       }),
      contact({ set_id: 1, rally_number: 2, action: 'attack', result: 'kill'    }),
    ];
    const result = computeRallyHistogram(contacts);
    const bucket1 = result.find(b => b.name === '1');
    const bucket23 = result.find(b => b.name === '2–3');
    expect(bucket1.rallies).toBe(1);
    expect(bucket23.rallies).toBe(1);
  });

  it('isolates rally keys per set (no bleed across sets)', () => {
    // rally_number 1 in set 1 and set 2 are separate rallies
    const contacts = [
      contact({ set_id: 1, rally_number: 1, action: 'serve', result: 'ace' }),
      contact({ set_id: 2, rally_number: 1, action: 'serve', result: 'ace' }),
    ];
    const result = computeRallyHistogram(contacts);
    const bucket1 = result.find(b => b.name === '1');
    // Two distinct rally keys → 2 rallies in the "1" bucket
    expect(bucket1.rallies).toBe(2);
  });

  it('computes pct as rounded percentage', () => {
    // 1 rally of length 1, 1 rally of length 2-3 → 50% each
    const contacts = [
      contact({ set_id: 1, rally_number: 1, action: 'serve',  result: 'ace'  }),
      contact({ set_id: 1, rally_number: 2, action: 'serve',  result: 'in'   }),
      contact({ set_id: 1, rally_number: 2, action: 'attack', result: 'kill' }),
    ];
    const result = computeRallyHistogram(contacts);
    const bucket1  = result.find(b => b.name === '1');
    const bucket23 = result.find(b => b.name === '2–3');
    expect(bucket1.pct).toBe(50);
    expect(bucket23.pct).toBe(50);
  });
});

// ── computeRunsByRotation ─────────────────────────────────────────────────────

describe('computeRunsByRotation', () => {
  it('returns zeroes with no rallies', () => {
    const result = computeRunsByRotation([]);
    expect(result.total.max_run).toBe(0);
    expect(result.total.runs_3plus).toBe(0);
    expect(result.total.avg_run).toBeNull();
  });

  it('does not count a run of 1', () => {
    const rallies = [
      rally({ set_id: 1, rally_number: 1, point_winner: 'us',   our_rotation: 1 }),
      rally({ set_id: 1, rally_number: 2, point_winner: 'them', our_rotation: 1 }),
    ];
    const result = computeRunsByRotation(rallies);
    expect(result.total.total_runs).toBe(0);
  });

  it('counts a run of 2', () => {
    const rallies = [
      rally({ set_id: 1, rally_number: 1, point_winner: 'us', our_rotation: 2 }),
      rally({ set_id: 1, rally_number: 2, point_winner: 'us', our_rotation: 2 }),
      rally({ set_id: 1, rally_number: 3, point_winner: 'them', our_rotation: 2 }),
    ];
    const result = computeRunsByRotation(rallies);
    expect(result.total.total_runs).toBe(1);
    expect(result.total.max_run).toBe(2);
    expect(result.total.runs_3plus).toBe(0);
  });

  it('counts a run of 5 in the right rotation bucket', () => {
    const rallies = [
      rally({ set_id: 1, rally_number: 1, point_winner: 'us',   our_rotation: 4 }),
      rally({ set_id: 1, rally_number: 2, point_winner: 'us',   our_rotation: 4 }),
      rally({ set_id: 1, rally_number: 3, point_winner: 'us',   our_rotation: 4 }),
      rally({ set_id: 1, rally_number: 4, point_winner: 'us',   our_rotation: 4 }),
      rally({ set_id: 1, rally_number: 5, point_winner: 'us',   our_rotation: 4 }),
      rally({ set_id: 1, rally_number: 6, point_winner: 'them', our_rotation: 4 }),
    ];
    const result = computeRunsByRotation(rallies);
    expect(result.total.max_run).toBe(5);
    expect(result.total.runs_3plus).toBe(1);
    expect(result.total.runs_5plus).toBe(1);
    expect(result.byRotation[4].max_run).toBe(5);
    expect(result.byRotation[1].max_run).toBe(0);
  });

  it('resets run at set boundary', () => {
    const rallies = [
      rally({ set_id: 1, rally_number: 3, point_winner: 'us', our_rotation: 1 }),
      rally({ set_id: 1, rally_number: 4, point_winner: 'us', our_rotation: 1 }),
      // new set — run should NOT carry over
      rally({ set_id: 2, rally_number: 1, point_winner: 'us', our_rotation: 1 }),
    ];
    const result = computeRunsByRotation(rallies);
    // Set 1 yields a run of 2; set 2 has only 1 consecutive point (not a run)
    expect(result.total.total_runs).toBe(1);
    expect(result.total.max_run).toBe(2);
  });

  it('computes avg_run correctly', () => {
    const rallies = [
      // run of 2 in rotation 1
      rally({ set_id: 1, rally_number: 1, point_winner: 'us',   our_rotation: 1 }),
      rally({ set_id: 1, rally_number: 2, point_winner: 'us',   our_rotation: 1 }),
      rally({ set_id: 1, rally_number: 3, point_winner: 'them', our_rotation: 1 }),
      // run of 4 in rotation 1
      rally({ set_id: 1, rally_number: 4, point_winner: 'us',   our_rotation: 1 }),
      rally({ set_id: 1, rally_number: 5, point_winner: 'us',   our_rotation: 1 }),
      rally({ set_id: 1, rally_number: 6, point_winner: 'us',   our_rotation: 1 }),
      rally({ set_id: 1, rally_number: 7, point_winner: 'us',   our_rotation: 1 }),
    ];
    const result = computeRunsByRotation(rallies);
    // runs of 2 and 4 → avg = (2+4)/2 = 3
    expect(result.total.avg_run).toBeCloseTo(3);
  });
});

// ── VER position multiplier application ───────────────────────────────────────

describe('VER position multipliers', () => {
  const makeKill = (pid) => contact({ player_id: pid, action: 'attack', result: 'kill' });

  it('applies L multiplier (1.20) vs OH multiplier (1.00)', () => {
    const contacts = [makeKill('libero'), makeKill('outside')];
    const positions = { libero: 'L', outside: 'OH' };
    const stats = computePlayerStats(contacts, 1, positions);
    // VER_libero = 1.20 × (1/1) × (4×1) = 4.8
    // VER_outside = 1.00 × (1/1) × (4×1) = 4.0
    expect(stats.libero.ver).toBeCloseTo(4.8);
    expect(stats.outside.ver).toBeCloseTo(4.0);
    expect(stats.libero.pos_mult).toBe(1.20);
    expect(stats.outside.pos_mult).toBe(1.00);
  });

  it('applies S multiplier (0.90)', () => {
    const contacts = [makeKill('setter')];
    const positions = { setter: 'S' };
    const stats = computePlayerStats(contacts, 1, positions);
    // VER = 0.90 × 4 × 1 = 3.6
    expect(stats.setter.ver).toBeCloseTo(3.6);
  });

  it('applies MB multiplier (1.05)', () => {
    const contacts = [makeKill('mb')];
    const positions = { mb: 'MB' };
    const stats = computePlayerStats(contacts, 1, positions);
    // VER = 1.05 × 4 × 1 = 4.2
    expect(stats.mb.ver).toBeCloseTo(4.2);
  });

  it('defaults to 1.0 multiplier for unknown position', () => {
    const contacts = [makeKill('p1')];
    const stats = computePlayerStats(contacts, 1, { p1: 'UNKNOWN' });
    expect(stats.p1.ver).toBeCloseTo(4.0);
    expect(stats.p1.pos_mult).toBe(1.0);
  });

  it('VER is null when player has no sets played (sp=0)', () => {
    // sp is derived from unique set_ids seen in contacts; a contact with
    // set_id=null contributes size=1 to the Set, so test with deriveStats directly
    // by passing a player with no contacts (VER requires sp > 0)
    // computeTeamStats with setsPlayed=0 exercises this path:
    const stats = computeTeamStats([], 0);
    expect(stats.ver).toBeNull();
  });
});
