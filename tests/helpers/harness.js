import * as THREE from 'three';
import { LEVELS } from '../../src/levels/index.js';
import { createGame } from '../../src/game/scheduler.js';
import { Player, circleHits } from '../../src/game/player.js';

const nextMacrotask = () => new Promise((resolve) => setImmediate(resolve));

// Silent stand-in for the WebAudio Sfx: every method is a no-op that returns a no-op (e.g. ring()'s stop fn).
const silentSfx = () => new Proxy({}, { get: () => () => () => {} });

/*
 * Runs a level headlessly (no WebGL, no DOM): real world geometry, real story script, real scheduler,
 * real player/NPC updates. Interactions are captured so tests can trigger them like a player pressing E.
 */
export function createHarness(levelId, character = null, { seed = 1, variant = null, shot = null } = {}) {
  const level = LEVELS[levelId];
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 80);
  scene.add(camera);
  const world = level.build(scene);
  const game = createGame(camera, seed);
  const player = new Player(camera);
  const input = { keys: new Set(), pressed: new Set(), dx: 0, dy: 0, click: false };
  const interactions = [];
  const log = { subtitles: [], objectives: [], used: [], ending: null, flow: undefined };
  const pipe = { u: { uMonitor: { value: 0 }, uFlash: { value: 0 }, uFade: { value: 1 } } };
  const hud = {
    objective(text) {
      if (text && log.objectives.at(-1) !== text) log.objectives.push(text);
      hud.current = text;
    },
    current: '',
    prompt() {},
    async say(text, dur = 3) {
      log.subtitles.push(text);
      await game.wait(dur);
    },
    camera() {},
    ending() {},
    setClockStart() {},
    clock() {},
    qte() {},
    flow(seconds) {
      log.flow = seconds;
    },
    show() {},
    hide() {},
  };
  const ctx = {
    game, world, hud, player, scene, pipe, character, input, variant, shot,
    sfx: silentSfx(),
    interact: (objects, label, use) => interactions.push({ objects: [objects].flat(), label, use }),
    end(title, subtitle) {
      game.ended = true;
      log.ending = { title, subtitle };
    },
  };

  let error = null;
  game.started = true;
  const story = level.story(ctx).catch((e) => (error = e));

  function step(dt = 0.1) {
    game.tick(dt);
    player.update(dt, input, world.colliders, game.inputEnabled);
    game.npcs.forEach((n) => n.update(dt));
    world.update(dt, [player.pos, ...game.npcs.map((n) => n.pos)]);
  }

  // Press a key for one tick, like a player tapping it; used by QTE tests.
  function press(code, dt = 0.1) {
    input.pressed.add(code);
    step(dt);
    input.pressed.clear();
  }

  const available = () => interactions.filter((i) => i.label());

  // Press E on every interaction currently offering a prompt (labels are logged in order).
  function useAvailable(filter = () => true) {
    for (const it of available()) {
      const label = it.label();
      if (!label || !filter(label)) continue;
      log.used.push(label);
      it.use();
    }
  }

  /*
   * Advance game time until `done()` is true. `onStep` runs before every tick (autoplay, teleports, etc.).
   * Yields to the event loop each tick so story continuations run, and rethrows any story error.
   */
  async function run(done, { maxTime = 900, dt = 0.1, onStep = () => {} } = {}) {
    while (!done()) {
      if (error) throw error;
      if (game.time > maxTime) throw new Error(`timed out after ${maxTime}s of game time; objective: "${hud.current}"`);
      onStep();
      step(dt);
      await nextMacrotask();
    }
    if (error) throw error;
  }

  return { scene, camera, world, game, player, hud, pipe, log, interactions, available, useAvailable, run, story, step, press, input, ctx };
}

// Free cells reachable on foot from `start`, on a grid using the player's real collision radius.
// Colliders are bucketed in a coarse grid first: the A–Z market has ~450 of them and a 1 m grid.
export function reachableCells(colliders, { minX, maxX, minZ, maxZ }, start, cell = 1) {
  const nx = Math.ceil((maxX - minX) / cell), nz = Math.ceil((maxZ - minZ) / cell);
  const idx = (i, j) => j * nx + i;
  const pos = (i, j) => [minX + (i + 0.5) * cell, minZ + (j + 0.5) * cell];
  const B = 8;
  const buckets = new Map();
  const bkey = (i, j) => `${i},${j}`;
  for (const c of colliders) {
    const r = Math.hypot(c.hx, c.hz) + 0.5;
    for (let bi = Math.floor((c.cx - r) / B); bi <= Math.floor((c.cx + r) / B); bi++) {
      for (let bj = Math.floor((c.cz - r) / B); bj <= Math.floor((c.cz + r) / B); bj++) {
        const k = bkey(bi, bj);
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(c);
      }
    }
  }
  const free = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const [x, z] = pos(i, j);
      const near = buckets.get(bkey(Math.floor(x / B), Math.floor(z / B))) ?? [];
      free[idx(i, j)] = near.some((c) => circleHits(x, z, c)) ? 0 : 1;
    }
  }
  const si = Math.floor((start.x - minX) / cell), sj = Math.floor((start.z - minZ) / cell);
  const seen = new Uint8Array(nx * nz);
  const out = [];
  if (!free[idx(si, sj)]) return out;
  const queue = [[si, sj]];
  seen[idx(si, sj)] = 1;
  while (queue.length) {
    const [i, j] = queue.pop();
    out.push(pos(i, j));
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= nx || b >= nz || seen[idx(a, b)] || !free[idx(a, b)]) continue;
      seen[idx(a, b)] = 1;
      queue.push([a, b]);
    }
  }
  return out;
}

export const nearestDistance = (cells, x, z) => cells.reduce((best, [cx, cz]) => Math.min(best, Math.hypot(cx - x, cz - z)), Infinity);

export function worldPosition(object) {
  object.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(object);
  return box.isEmpty() ? object.getWorldPosition(new THREE.Vector3()) : box.getCenter(new THREE.Vector3());
}
