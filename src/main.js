import * as THREE from 'three';
import './style.css';
import { Pipeline } from './engine/post.js';
import { Sfx } from './engine/audio.js';
import { createInput } from './engine/input.js';
import { Player } from './game/player.js';
import { createHud } from './game/hud.js';
import { createGame } from './game/scheduler.js';
import { createInteractions } from './game/interaction.js';
import { LEVELS } from './levels/index.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const TIME_SCALE = DEBUG ? Number(params.get('speed') ?? 1) : 1;
const SEED = params.has('seed') ? Number(params.get('seed')) >>> 0 : undefined;
const SHOW_COLLIDERS = params.has('colliders');
const SHOT = params.has('shot') ? Number(params.get('shot')) : null;
const RENDER_H = params.has('renderH') ? Number(params.get('renderH')) : null;

// `?debug&colliders` draws every collision footprint, so a prop that can be walked through stands out.
function drawColliders(world) {
  const verts = [];
  for (const c of world.colliders) {
    const cos = Math.cos(c.rot), sin = Math.sin(c.rot);
    const corners = [[-c.hx, -c.hz], [c.hx, -c.hz], [c.hx, c.hz], [-c.hx, c.hz]]
      .map(([lx, lz]) => [c.cx + lx * cos + lz * sin, c.cz - lx * sin + lz * cos]);
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4];
      verts.push(ax, 0.02, az, bx, 0.02, bz, ax, 2.4, az, bx, 2.4, bz, ax, 0.02, az, ax, 2.4, az);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  scene.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x00ff88 })));
}

const canvas = document.getElementById('game');
const pipe = new Pipeline(canvas);
pipe.renderer.setClearColor(0x06070c);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 80);
scene.add(camera);
let world = null;
pipe.onResize = (aspect) => {
  for (const cam of [camera, ...(world?.cameras ?? [])]) {
    cam.aspect = aspect;
    cam.updateProjectionMatrix();
  }
};
pipe.resize();

const input = createInput(canvas);
const sfx = new Sfx();

const game = createGame(camera, SEED);
const hud = createHud(game);
const player = new Player(camera);
const interactions = createInteractions();
const interact = interactions.interact;

function updateInteraction() {
  const focus = interactions.pick(camera);
  hud.prompt(focus?.label);
  if (focus && (input.pressed.has('KeyE') || input.click)) focus.it.use();
}

function update(dt) {
  game.tick(dt);
  player.update(dt, input, world.colliders, game.inputEnabled, () => sfx.step());
  game.npcs.forEach((n) => n.update(dt));
  world.update(dt, [player.pos, ...game.npcs.map((n) => n.pos)]);
  if (game.inputEnabled) updateInteraction();
  else hud.prompt(null);
  hud.clock(game.time);
  if (game.shake > 0) {
    camera.rotation.x += (Math.random() - 0.5) * 0.08 * game.shake;
    camera.rotation.y += (Math.random() - 0.5) * 0.08 * game.shake;
    game.shake = Math.max(0, game.shake - dt * 0.7);
  }
  const u = pipe.u;
  u.uFlash.value = Math.max(0, u.uFlash.value - dt * 1.5);
  const df = game.fade.target - u.uFade.value;
  u.uFade.value += Math.sign(df) * Math.min(Math.abs(df), game.fade.rate * dt);
}

function start(levelId, character = null, variant = null) {
  if (game.started) return;
  game.started = true;
  game.level = levelId;
  const level = LEVELS[levelId];
  world = level.build(scene);
  if (SHOW_COLLIDERS) drawColliders(world);
  interactions.addOccluders(world.occluders);
  scene.fog = new THREE.Fog(...world.fog);
  pipe.renderer.setClearColor(world.fog[0]);
  pipe.setProfile({ ...world.render, ...(RENDER_H ? { height: RENDER_H } : {}) });
  pipe.resize();
  hud.setClockStart(level.clock);
  sfx.init();
  sfx.startAmbience();
  // Showcases are watched, not played: no pointer lock, no pause gate, no HUD furniture.
  document.getElementById('hud').classList.toggle('cinema', !!level.showcase);
  if (DEBUG) Object.assign(window, { game, player, world, hud, sfx, pipe, scene, interactions });
  level.story({
    game, world, hud, sfx, player, scene, pipe, input, interact, character, variant, shot: SHOT,
    end(title, subtitle) {
      game.ended = true;
      input.unlock();
      hud.ending(title, subtitle);
    },
  });
  if (!level.showcase) input.lock();
  hud.hide('title');
}

// --- Menu ----------------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);
document.querySelectorAll('[data-map]').forEach((el) => el.addEventListener('click', () => {
  if (el.dataset.map === 'ceda') {
    hud.hide('menu-maps');
    hud.show('menu-chars');
  } else start(el.dataset.map);
}));
document.querySelectorAll('[data-char]').forEach((el) => el.addEventListener('click', () => {
  if (el.dataset.char === 'diablero') {
    hud.hide('menu-chars');
    hud.show('menu-variants');
  } else start('ceda', el.dataset.char);
}));
document.querySelectorAll('[data-variant]').forEach((el) => el.addEventListener('click', () => start('ceda', 'diablero', el.dataset.variant)));
$('#menu-back').addEventListener('click', () => {
  hud.hide('menu-chars');
  hud.show('menu-maps');
});
$('#variants-back').addEventListener('click', () => {
  hud.hide('menu-variants');
  hud.show('menu-chars');
});
$('#pause').addEventListener('click', () => {
  input.lock();
  if (DEBUG) hud.hide('pause');
});
$('#end').addEventListener('click', () => location.reload());

input.onLockChange = (locked) => {
  if (!game.started) return;
  hud.hide('title');
  if (locked) hud.hide('pause');
  else if (!game.ended) hud.show('pause');
};

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000) * TIME_SCALE;
  last = now;
  if (game.started && !game.ended && (input.locked || DEBUG || LEVELS[game.level]?.showcase)) update(dt);
  else if (game.ended) game.tick(dt);
  input.consume();
  pipe.render(scene, game.cam, now / 1000);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
