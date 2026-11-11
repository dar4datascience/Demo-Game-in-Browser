import * as THREE from 'three';

/*
 * Seven-shot CDMX showcase matching the reference video (~2.9 s per shot, ~20 s total).
 * Each entry is a short camera move: slow push, pan, tilt or dolly, hard cut, violet fog.
 * `look` is what the camera aims at; both ends are interpolated with a smoothstep so every
 * move eases in and out. `fog` is [colour, near, far] and is swapped per shot; the sky dome
 * and the backlot islands are far enough apart that a shot only ever sees its own set.
 *
 *   1 Ángel de la Independencia   2 Metro (elevated)   3 Abarrotes + taxi
 *   4 Parque (jacaranda)          5 Biblioteca exterior 6 Biblioteca interior
 *   7 Torre Latinoamericana
 */
export const SHOTS = [
  {
    id: 'angel', caption: '3:00 AM', dur: 2.9, fov: 55,
    pos: [[8, 2.0, 27], [10, 6.2, 15]], look: [[1.5, 10.5, 0], [1.5, 13.5, 0]],
    fog: [0x2c2454, 14, 170],
  },
  {
    id: 'metro', caption: 'LÍNEA 7', dur: 2.9, fov: 55,
    pos: [[34, 1.75, -295.5], [20, 1.7, -296.8]], look: [[-28, 2.7, -301.5], [-36, 2.8, -301.5]],
    fog: [0x241e44, 8, 95],
  },
  {
    id: 'abarrotes', caption: 'MERCADO', dur: 2.9, fov: 50,
    pos: [[46, 1.6, 310.5], [44.5, 1.6, 309.5]], look: [[38, 1.9, 300], [37, 1.85, 300]],
    fog: [0x2c2454, 10, 115],
  },
  {
    id: 'park', caption: 'JACARANDAS', dur: 2.9, fov: 50,
    pos: [[-275, 1.3, -70], [-276, 1.45, -71.5]], look: [[-285, 4.5, -92], [-286, 5.5, -95]],
    fog: [0x322a58, 10, 105],
  },
  {
    id: 'biblioteca', caption: 'BIBLIOTECA', dur: 2.9, fov: 55,
    pos: [[-306, 2.0, 190], [-304, 2.8, 192]], look: [[-300, 11, 120], [-299, 13, 120]],
    fog: [0x282050, 14, 140],
  },
  {
    id: 'library', caption: 'FICHA', dur: 2.9, fov: 50,
    pos: [[283.5, 1.55, 164.5], [282.5, 1.5, 163.5]], look: [[279.5, 1.8, 158.5], [279.8, 1.9, 158.8]],
    fog: [0x181426, 3, 26],
  },
  {
    id: 'torre', caption: 'LA TORRE', dur: 2.9, fov: 50,
    pos: [[302, 3, -90], [300, 4.5, -88]], look: [[300, 56, -163], [300, 60, -163]],
    fog: [0x2c2454, 16, 200],
  },
];

const ease = (k) => k * k * (3 - 2 * k);
const lerp = (a, b, k) => a + (b - a) * k;
const lerp3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const scratch = new THREE.Vector3();

// Place the shot camera and fog at progress `k` (0..1).
export function applyShot(cam, scene, shot, k) {
  let x, y, z;
  if (shot.orbit) {
    const { cx, cz, r, a, y: oy } = shot.orbit;
    const angle = lerp(a[0], a[1], k);
    x = cx + Math.cos(angle) * r;
    z = cz + Math.sin(angle) * r;
    y = lerp(oy[0], oy[1], k);
  } else {
    [x, y, z] = lerp3(shot.pos[0], shot.pos[1], k);
  }
  cam.position.set(x, y, z);
  cam.lookAt(scratch.set(...lerp3(shot.look[0], shot.look[1], k)));
  if (cam.fov !== shot.fov) {
    cam.fov = shot.fov;
    cam.updateProjectionMatrix();
  }
  if (scene.fog) {
    const [c, near, far] = shot.fog;
    scene.fog.color.setHex(c);
    scene.fog.near = near;
    scene.fog.far = far;
  }
}

export async function runStory(ctx) {
  const { game, world, hud, sfx, scene, end } = ctx;
  game.inputEnabled = false;
  game.cam = world.shotCam;
  for (const id of ['objective', 'clock', 'crosshair', 'prompt', 'flow']) hud.hide(id);
  sfx.setTension(0.35);

  const list = ctx.shot ? SHOTS.filter((_, i) => i === ctx.shot - 1) : SHOTS;
  game.fadeTo(0, 0.9);
  await game.wait(0.6);

  const taxi = world.refs?.taxi?.taxi;
  for (const [index, shot] of list.entries()) {
    game.fadeTo(1, 0.2);
    await game.wait(0.2);
    applyShot(world.shotCam, scene, shot, 0);
    game.fadeTo(0, 0.35);
    hud.say(shot.caption, Math.min(2.4, shot.dur * 0.6));
    // The Beetle taxi only drives during its own shot; parked off-frame otherwise.
    if (taxi) taxi.userData.on = shot.id === 'abarrotes';
    // Debug/recording hooks: which shot is on screen and how far through it is.
    Object.assign(game.flags, { shot: shot.id, shotIndex: index, shotK: 0 });
    const start = game.time;
    const hook = () => {
      const k = Math.min(1, (game.time - start) / shot.dur);
      game.flags.shotK = k;
      applyShot(world.shotCam, scene, shot, ease(k));
      return k >= 1;
    };
    game.hooks.push(hook);
    await game.wait(shot.dur);
    game.hooks = game.hooks.filter((h) => h !== hook);
    if (taxi) taxi.userData.on = false;
    game.flags.shots = (game.flags.shots ?? 0) + 1;
  }

  game.fadeTo(1, 1.1);
  await game.wait(1.2);
  sfx.silence();
  end('CIUDAD DE MÉXICO', '3:00 AM · No te detengas.');
}
