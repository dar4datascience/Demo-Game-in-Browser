import { describe, it, expect } from 'vitest';
import { mulberry32, randomSeed } from '../../src/game/rng.js';

describe('seeded rng', () => {
  it('repeats the same sequence for the same seed', () => {
    const a = mulberry32(1234);
    const b = mulberry32(1234);
    const seqA = Array.from({ length: 6 }, () => a());
    const seqB = Array.from({ length: 6 }, () => b());
    expect(seqA).toEqual(seqB);
    expect(new Set(seqA).size).toBeGreaterThan(1);
  });

  it('produces a different sequence for a different seed', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it('keeps generated seeds in the unsigned 32-bit range', () => {
    for (let i = 0; i < 100; i++) {
      const seed = randomSeed();
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(2 ** 32);
    }
  });
});
