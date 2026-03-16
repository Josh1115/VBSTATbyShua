import { describe, it, expect } from 'vitest';
import {
  computePlayerStats,
  computeTeamStats,
  computeRotationStats,
  computeFreeballOutcomes,
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
      contact({ action: 'block', result: 'solo' }),
      contact({ action: 'block', result: 'assist' }),
      contact({ action: 'block', result: 'error' }),
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
      contact({ action: 'dig', result: 'success' }),
      contact({ action: 'dig', result: 'success' }),
      contact({ action: 'dig', result: 'error' }),
    ];
    const { p1 } = computePlayerStats(contacts, 2);
    expect(p1.dig).toBe(2);
    expect(p1.de).toBe(1);
    // DiPS = 2/2 = 1.0
    expect(p1.dips).toBeCloseTo(1.0);
  });

  it('accumulates set stats', () => {
    const contacts = [
      contact({ action: 'set', result: 'assist' }),
      contact({ action: 'set', result: 'assist' }),
      contact({ action: 'set', result: 'ball_handling_error' }),
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
      rally({ id: 1, point_winner: 'us' }),
      rally({ id: 2, point_winner: 'us' }),
      rally({ id: 3, point_winner: 'them' }),
    ];
    const contacts = [
      contact({ action: 'freeball_receive', rally_id: 1 }),
      contact({ action: 'freeball_receive', rally_id: 2 }),
      contact({ action: 'freeball_receive', rally_id: 3 }),
    ];
    const result = computeFreeballOutcomes(contacts, rallies);
    expect(result.fbr).toBe(3);
    // 2 wins out of 3 receive rallies
    expect(result.fbo_pct).toBeCloseTo(2 / 3);
  });

  it('computes FBD% — freeball send win rate', () => {
    const rallies = [
      rally({ id: 10, point_winner: 'us' }),
      rally({ id: 11, point_winner: 'them' }),
    ];
    const contacts = [
      contact({ action: 'freeball_send', rally_id: 10 }),
      contact({ action: 'freeball_send', rally_id: 11 }),
    ];
    const result = computeFreeballOutcomes(contacts, rallies);
    expect(result.fbs).toBe(2);
    expect(result.fbd_pct).toBeCloseTo(0.5);
  });

  it('skips opponent contacts', () => {
    const rallies = [rally({ id: 1, point_winner: 'us' })];
    const contacts = [
      contact({ action: 'freeball_receive', rally_id: 1, opponent_contact: true }),
    ];
    const result = computeFreeballOutcomes(contacts, rallies);
    expect(result.fbr).toBe(0);
    expect(result.fbo_pct).toBeNull();
  });

  it('skips contacts with no matching rally', () => {
    const contacts = [
      contact({ action: 'freeball_receive', rally_id: 999 }),
    ];
    const result = computeFreeballOutcomes(contacts, []);
    // rally_id 999 not in rallies map — not counted
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
