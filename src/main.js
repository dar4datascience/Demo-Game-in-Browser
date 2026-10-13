import * as THREE from 'three';
import './style.css';
import { Pipeline } from './engine/post.js';
import { Sfx } from './engine/audio.js';
import { createInput } from './engine/input.js';
import { buildWorld } from './world/store.js';
import { Player } from './game/player.js';
import { createHud } from './game/hud.js';
import { runStory } from './game/story.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const TIME_SCALE = DEBUG ? Number(params.get('speed') ?? 1) : 1;

const canvas = document.getElementById('game');
const pipe = new Pipeline(canvas);
pipe.renderer.setClearColor(0x06070c);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x06070c, 4, 24);
const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 60);
scene.add(camera);
const world = buildWorld(scene);
pipe.onResize = (aspect) => {
  for (const cam of [camera, world.secCam]) {
    cam.aspect = aspect;
    cam.updateProjectionMatrix();
  }
};
pipe.resize();

const input = createInput(canvas);
const sfx = new Sfx();
world.refs.door.onOpen = () => sfx.chime();

// Game-time scheduler: story steps await these, so pausing freezes the script.
const game = {
  time: 0,
  waiters: [],
  flags: {},
  npcs: [],
  cam: camera,
  inputEnabled: true,
  shake: 0,
  fade: { target: 1, rate: 1 },
  started: false,
  ended: false,
  until(pred) {
    return new Promise((resolve) => this.waiters.push({ pred, resolve }));
  },
  wait(seconds) {
    const t = this.time + seconds;
    return this.until(() => this.time >= t);
  },
  fadeTo(target, seconds) {
    this.fade = { target, rate: 1 / Math.max(seconds, 0.001) };
  },
  tick(dt) {
    this.time += dt;
    this.waiters = this.waiters.filter((w) => !(w.pred() && (w.resolve(), true)));
  },
};
const hud = createHud(game);
const player = new Player(camera);

// Interaction targets share one raycast list with walls so nothing is usable through a wall.
const targets = [...world.occluders];
const interact = (objects, label, use) => {
  const it = { label, use };
  for (const obj of [objects].flat()) {
    obj.userData.interact = it;
    targets.push(obj);
  }
};
const raycaster = new THREE.Raycaster();
raycaster.far = 2.3;
const center = new THREE.Vector2();

function updateInteraction() {
  raycaster.setFromCamera(center, camera);
  const hit = raycaster.intersectObjects(targets, false).find((h) => h.object.visible);
  const it = hit?.object.userData.interact;
  const label = it?.label();
  hud.prompt(label);
  if (label && (input.pressed.has('KeyE') || input.click)) it.use();
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

function start() {
  if (game.started) return;
  game.started = true;
  sfx.init();
  sfx.startAmbience();
  runStory({
    game, world, hud, sfx, player, scene, pipe, interact,
    end() {
      game.ended = true;
      input.unlock();
      hud.show('end');
    },
  });
}

input.onLockChange = (locked) => {
  hud.hide('title');
  if (locked) hud.hide('pause');
  else if (game.started && !game.ended) hud.show('pause');
};
for (const id of ['title', 'pause']) {
  document.getElementById(id).addEventListener('click', () => {
    start();
    input.lock();
    if (DEBUG) hud.hide(id);
  });
}
document.getElementById('end').addEventListener('click', () => location.reload());

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000) * TIME_SCALE;
  last = now;
  if (game.started && !game.ended && (input.locked || DEBUG)) update(dt);
  else if (game.ended) game.tick(dt);
  if (!game.started) player.update(0, input, world.colliders, false);
  input.consume();
  pipe.render(scene, game.cam, now / 1000);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (DEBUG) Object.assign(window, { game, player, world, hud });
