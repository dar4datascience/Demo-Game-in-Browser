import { describe, it, expect } from 'vitest';
import { createGame } from '../../src/game/scheduler.js';

const flush = () => new Promise((r) => setImmediate(r));

describe('game scheduler', () => {
  it('resolves wait() only once enough game time has passed', async () => {
    const game = createGame(null);
    let done = false;
    game.wait(1).then(() => (done = true));
    for (let i = 0; i < 9; i++) game.tick(0.1);
    await flush();
    expect(done).toBe(false);
    game.tick(0.15);
    await flush();
    expect(done).toBe(true);
  });

  it('freezes scripts while paused (no ticks means no progress)', async () => {
    const game = createGame(null);
    let done = false;
    game.wait(0.01).then(() => (done = true));
    await new Promise((r) => setTimeout(r, 30));
    expect(done).toBe(false);
  });

  it('resolves until() when its predicate becomes true and drops the waiter', async () => {
    const game = createGame(null);
    let flag = false, done = false;
    game.until(() => flag).then(() => (done = true));
    game.tick(0.1);
    expect(game.waiters).toHaveLength(1);
    flag = true;
    game.tick(0.1);
    await flush();
    expect(done).toBe(true);
    expect(game.waiters).toHaveLength(0);
  });

  it('runs hooks every tick until they return true', () => {
    const game = createGame(null);
    let calls = 0;
    game.hooks.push((dt) => {
      expect(dt).toBe(0.5);
      return ++calls === 3;
    });
    for (let i = 0; i < 5; i++) game.tick(0.5);
    expect(calls).toBe(3);
    expect(game.hooks).toHaveLength(0);
  });

  it('fadeTo stores a positive rate even for instant fades', () => {
    const game = createGame(null);
    game.fadeTo(1, 0);
    expect(game.fade.target).toBe(1);
    expect(Number.isFinite(game.fade.rate)).toBe(true);
    expect(game.fade.rate).toBeGreaterThan(0);
  });
});
