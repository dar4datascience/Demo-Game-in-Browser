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

const canvas = document.getElementById('game');
const pipe = new Pipeline(canvas);
pipe.renderer.setClearColor(0x06070c);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 80);
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

const game = createGame(camera);
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

function start(levelId, character = null) {
  if (game.started) return;
  game.started = true;
  const level = LEVELS[levelId];
  world = level.build(scene);
  interactions.addOccluders(world.occluders);
  scene.fog = new THREE.Fog(...world.fog);
  pipe.renderer.setClearColor(world.fog[0]);
  pipe.resize();
  hud.setClockStart(level.clock);
  sfx.init();
  sfx.startAmbience();
  if (DEBUG) Object.assign(window, { game, player, world, hud });
  level.story({
    game, world, hud, sfx, player, scene, pipe, interact, character,
    end(title, subtitle) {
      game.ended = true;
      input.unlock();
      hud.ending(title, subtitle);
    },
  });
  input.lock();
  if (DEBUG) hud.hide('title');
}

// --- Menu ----------------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);
document.querySelectorAll('[data-map]').forEach((el) => el.addEventListener('click', () => {
  if (el.dataset.map === 'ceda') {
    hud.hide('menu-maps');
    hud.show('menu-chars');
  } else start(el.dataset.map);
}));
document.querySelectorAll('[data-char]').forEach((el) => el.addEventListener('click', () => start('ceda', el.dataset.char)));
$('#menu-back').addEventListener('click', () => {
  hud.hide('menu-chars');
  hud.show('menu-maps');
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
  if (game.started && !game.ended && (input.locked || DEBUG)) update(dt);
  else if (game.ended) game.tick(dt);
  input.consume();
  pipe.render(scene, game.cam, now / 1000);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
