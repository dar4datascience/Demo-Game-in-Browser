import * as THREE from 'three';

/*
 * Shot list for the CDMX showcase. Each entry is a short camera move framed like the reference
 * clips: slow dolly, pan or orbit, hard cut, violet fog. `look` is what the camera aims at; both
 * ends are interpolated with a smoothstep so every move eases in and out.
 *
 * `fog` is [colour, near, far] and is swapped per shot; the sky dome and the backlot islands are
 * far enough apart that a shot only ever sees its own set.
 */
export const SHOTS = [
  {
    id: 'angel', caption: '3:00 AM', dur: 5.5, fov: 55,
    pos: [[0, 2.2, 26], [0, 6.6, 15]], look: [[0, 9, 0], [0, 10.6, 0]],
    fog: [0x2a2140, 12, 150],
  },
  {
    id: 'road', caption: 'AVENIDA', dur: 4.5, fov: 52,
    pos: [[-28, 1.35, 34.5], [-2, 1.4, 32.8]], look: [[-18, 1.4, 30], [10, 1.5, 30]],
    fog: [0x1c1730, 8, 90],
  },
  {
    id: 'metro', caption: 'LÍNEA 7', dur: 4.5, fov: 55,
    pos: [[-115, 2.0, 27], [-115, 1.85, 18.5]], look: [[-115, 3.3, 11], [-115, 3.1, 11]],
    fog: [0x1a1626, 6, 70],
  },
  {
    id: 'metro-car', caption: 'ÚLTIMO TREN', dur: 4.5, fov: 55,
    pos: [[0, 1.55, -139], [0, 1.5, -152]], look: [[0, 1.4, -162], [0, 1.3, -162]],
    fog: [0x0c0a14, 2, 40],
  },
  {
    id: 'abarrotes', caption: 'MERCADO', dur: 4.5, fov: 50,
    pos: [[0, 1.7, 97], [2, 1.7, 94]], look: [[-14, 1.6, 85], [14, 1.6, 85]],
    fog: [0x2a2140, 8, 90],
  },
  {
    id: 'park', caption: 'JACARANDAS', dur: 4.5, fov: 50,
    orbit: { cx: 45, cz: 10, r: 13, a: [3.5, 5.9], y: [2.4, 3.2] }, look: [[45, 3.6, 10], [45, 4.2, 10]],
    fog: [0x2e2448, 8, 80],
  },
  {
    id: 'biblioteca', caption: 'BIBLIOTECA', dur: 4.5, fov: 55,
    pos: [[-90, 1.8, -16], [-82, 3.4, -24]], look: [[-76, 7.5, -50], [-73, 8, -50]],
    fog: [0x241c38, 12, 120],
  },
  {
    id: 'torre', caption: 'LA TORRE', dur: 5, fov: 60,
    pos: [[80, 2.2, -35], [80, 3.2, -40]], look: [[80, 18, -95], [80, 62, -95]],
    fog: [0x2a2140, 14, 180],
  },
  {
    id: 'bride', caption: 'LA NOVIA', dur: 4.5, fov: 50,
    pos: [[-40, 1.55, 95], [-40, 1.5, 88.5]], look: [[-40, 2.0, 83], [-40, 1.9, 83]],
    fog: [0x241c38, 6, 60],
  },
  {
    id: 'field', caption: 'CARRETERA', dur: 5.5, fov: 55,
    pos: [[-150, 2.7, -26], [-150, 2.2, -48]], look: [[-150, 1.6, -66], [-148, 1.6, -68]],
    fog: [0x3a2f55, 3, 42],
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

  for (const [index, shot] of list.entries()) {
    game.fadeTo(1, 0.2);
    await game.wait(0.2);
    applyShot(world.shotCam, scene, shot, 0);
    game.fadeTo(0, 0.35);
    hud.say(shot.caption, Math.min(2.4, shot.dur * 0.6));
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
    game.flags.shots = (game.flags.shots ?? 0) + 1;
  }

  game.fadeTo(1, 1.1);
  await game.wait(1.2);
  sfx.silence();
  end('CIUDAD DE MÉXICO', '3:00 AM · No te detengas.');
}
