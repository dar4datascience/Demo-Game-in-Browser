import { describe, it, expect } from 'vitest';
import {
  LOFI_BPM, CUMBIA_BPM, LOFI_CHORDS, LOFI_BASS,
  CUMBIA_BASS, CUMBIA_LEAD, CUMBIA_KICK, CUMBIA_CLAP, CUMBIA_GUIRO, CUMBIA_SHAKER, CUMBIA_STAB, CUMBIA_CHORDS,
  midiToFreq, stepSeconds,
} from '../../src/engine/music.js';

describe('procedural music patterns', () => {
  it('converts MIDI notes to the expected frequencies', () => {
    expect(midiToFreq(69)).toBeCloseTo(440);
    expect(midiToFreq(57)).toBeCloseTo(220);
    expect(midiToFreq(81)).toBeCloseTo(880);
  });

  it('keeps lofi slow and cumbia mid-tempo', () => {
    expect(LOFI_BPM).toBe(68);
    expect(CUMBIA_BPM).toBe(92);
    expect(stepSeconds(68, 2)).toBeCloseTo(60 / 68 / 2);
    expect(stepSeconds(92, 4)).toBeCloseTo(60 / 92 / 4);
  });

  it('defines a four-bar lofi progression with a bass root per bar', () => {
    expect(LOFI_CHORDS).toHaveLength(4);
    expect(LOFI_CHORDS.every((chord) => chord.length === 5)).toBe(true);
    expect(LOFI_BASS).toHaveLength(4);
    for (const chord of LOFI_CHORDS) {
      for (const note of chord) {
        expect(midiToFreq(note)).toBeGreaterThan(20);
        expect(midiToFreq(note)).toBeLessThan(2000);
      }
    }
  });

  it('defines four bars of cumbia bass and lead', () => {
    expect(CUMBIA_BASS).toHaveLength(32);
    expect(CUMBIA_LEAD).toHaveLength(32);
    for (const note of [...CUMBIA_BASS, ...CUMBIA_LEAD]) {
      expect(midiToFreq(note)).toBeGreaterThan(20);
      expect(midiToFreq(note)).toBeLessThan(2000);
    }
  });

  it('keeps every drum step inside one 16-step bar', () => {
    for (const step of [...CUMBIA_KICK, ...CUMBIA_CLAP, ...CUMBIA_GUIRO, ...CUMBIA_SHAKER, ...CUMBIA_STAB]) {
      expect(step).toBeGreaterThanOrEqual(0);
      expect(step).toBeLessThan(16);
    }
    expect(CUMBIA_GUIRO.every((step) => step % 2 === 0)).toBe(true);
    expect(CUMBIA_SHAKER.every((step) => step % 2 === 1)).toBe(true);
    expect(CUMBIA_KICK).toContain(0);
    expect(CUMBIA_CLAP).toEqual([4, 12]);
  });

  it('adds a four-bar chord bed over the cumbia progression', () => {
    expect(CUMBIA_CHORDS).toHaveLength(4);
    expect(CUMBIA_CHORDS.every((chord) => chord.length === 3)).toBe(true);
  });
});
