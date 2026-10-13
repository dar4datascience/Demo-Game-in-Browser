import * as THREE from 'three';
import { lam, basic } from '../../engine/post.js';
import * as T from '../../engine/textures.js';
import { createBuilder } from '../../world/builder.js';

const H = 3.2; // ceiling height
const DOOR_X = 4.5, DOOR_Z = 6;

/*
 * Layout (metres, +z points out the front door):
 *   store floor   x -8..8,  z -6..6
 *   staff room    x  3..8,  z -10..-6 (door gap x 4.4..6.1)
 *   parking lot   x -10..10, z 6..15
 */
export function buildWorld(scene) {
  const b = createBuilder(scene);
  const { box, plane, light, glowMat } = b;
  const refs = {};

  const mats = {
    floor: lam({ map: T.floorTex() }),
    wall: lam({ map: T.wallTex() }),
    ceiling: lam({ map: T.ceilingTex() }),
    metal: lam({ map: T.metalTex() }),
    asphalt: lam({ map: T.asphaltTex() }),
    concrete: lam({ map: T.concreteTex() }),
    cardboard: lam({ map: T.cardboardTex() }),
    wood: lam({ map: T.woodTex() }),
    counter: lam({ map: T.counterTex() }),
    dark: lam({ color: 0x1c1d21 }),
    glass: basic({ color: 0x8fb4c8, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }),
  };
  const products = [
    ['#d33', '#fc3', '#fff', '#e70', '#a22'],
    ['#2a6', '#9d4', '#fff', '#36c', '#147'],
    ['#c39', '#f8a', '#fe8', '#639', '#eee'],
  ].map((p) => lam({ map: T.productsTex(p) }));

  scene.add(new THREE.AmbientLight(0x3a4260, 0.9));

  // --- Shell -------------------------------------------------------------
  plane(16, 16, mats.floor, 0, 0, -2, 0, -Math.PI / 2);
  plane(16, 16, mats.ceiling, 0, H, -2, 0, Math.PI / 2);

  const wall = (w, d, x, z) => box(w, H, d, mats.wall, x, H / 2, z, { occlude: true });
  wall(0.2, 12.4, -8.1, 0);
  wall(0.2, 16.4, 8.1, -2);
  wall(12.4, 0.2, -1.8, -6.1);
  wall(1.9, 0.2, 7.05, -6.1);
  box(1.7, H - 2.3, 0.2, mats.wall, 5.25, 2.3 + (H - 2.3) / 2, -6.1, { collide: false, occlude: true });
  wall(0.2, 3.8, 2.9, -8.1);
  wall(5.4, 0.2, 5.5, -10.1);

  // Glass storefront with a gap for the automatic door.
  const front = (x0, x1) => {
    const w = x1 - x0, cx = (x0 + x1) / 2;
    box(w, 0.6, 0.2, mats.wall, cx, 0.3, 6.1, { occlude: true });
    box(w, 0.6, 0.2, mats.wall, cx, H - 0.3, 6.1, { collide: false, occlude: true });
    plane(w, H - 1.2, mats.glass, cx, 0.6 + (H - 1.2) / 2, 6.1, 0, 0, null);
    b.addBounds(x0, x1, 6, 6.2);
    const n = Math.max(1, Math.round(w / 2));
    for (let i = 0; i <= n; i++) box(0.08, H - 1.2, 0.12, mats.metal, x0 + (w * i) / n, 0.6 + (H - 1.2) / 2, 6.1, { collide: false });
  };
  front(-8, 3.5);
  front(5.5, 8);
  box(2, 0.9, 0.2, mats.wall, DOOR_X, H - 0.45, 6.1, { collide: false });

  // Facade + sign above the storefront.
  box(16.4, 1.4, 0.3, mats.wall, 0, H + 0.7, 6.15, { collide: false });
  const signMat = glowMat({ map: T.storeSignTex() }, 0x3a3a3a);
  plane(8, 1.1, signMat, -1.5, H + 0.7, 6.31, 0, 0, null);
  plane(16.4, 0.12, basic({ color: 0x1d8a86 }), 0, H + 0.06, 6.31, 0, 0, null);
  plane(16.4, 0.08, basic({ color: 0xe8792b }), 0, H - 0.04, 6.31, 0, 0, null);

  // Automatic sliding door.
  const doorPanel = (x) => {
    const g = new THREE.Group();
    g.position.set(x, 0, 6.05);
    scene.add(g);
    const opts = { collide: false, parent: g };
    box(1, 0.06, 0.06, mats.metal, 0, 2.27, 0, opts);
    box(1, 0.1, 0.06, mats.metal, 0, 0.05, 0, opts);
    box(0.06, 2.3, 0.06, mats.metal, -0.47, 1.15, 0, opts);
    box(0.06, 2.3, 0.06, mats.metal, 0.47, 1.15, 0, opts);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2.2), mats.glass);
    glass.position.y = 1.15;
    g.add(glass);
    return g;
  };
  refs.door = { panels: [doorPanel(DOOR_X - 0.5), doorPanel(DOOR_X + 0.5)], open: 0, onOpen: null };

  // --- Lighting ----------------------------------------------------------
  const panelMat = glowMat({ color: 0xf2f6ff }, 0x222428);
  for (const x of [-5.5, -2, 1.5, 5]) for (const z of [-3.5, 0, 3.5]) box(0.35, 0.06, 1.6, panelMat, x, H - 0.03, z, { collide: false, tile: 0 });
  for (const [x, z] of [[-4.5, -2.5], [2.5, -2.5], [-4.5, 2.8], [2.5, 2.8]]) light(x, 2.9, z, 0xeef3ff, 16, 14);
  box(0.35, 0.06, 1.4, panelMat, 5.5, H - 0.03, -8, { collide: false, tile: 0 });
  const staffLight = light(5.5, 2.9, -8, 0xfff2dd, 9, 8);

  // --- Store fixtures ----------------------------------------------------
  const fridgeMat = glowMat({ map: T.fridgeTex() }, 0x2a2a2a);
  box(10, 2.3, 0.8, mats.metal, -2.8, 1.15, -5.6);
  plane(10, 2, fridgeMat, -2.8, 1.1, -5.19, 0, 0, [1, 0.5]);

  const shelf = (x, z0, z1, mi) => {
    const len = z1 - z0, zc = (z0 + z1) / 2;
    box(0.7, 1.7, len, mats.metal, x, 0.85, zc);
    box(0.76, 0.05, len + 0.04, mats.metal, x, 1.72, zc, { collide: false });
    for (const s of [-1, 1]) plane(len, 1.5, products[(mi + (s > 0 ? 1 : 0)) % 3], x + s * 0.36, 0.85, zc, (s * Math.PI) / 2, 0, [1, 1 / 1.5]);
  };
  shelf(-1.2, -3.5, 0.5, 0);
  shelf(1.4, -3.5, 0.5, 1);
  shelf(4.0, -3.5, 0.5, 2);

  // Empty shelf sections the player restocks.
  const emptyTex = T.emptyShelfTex();
  refs.slots = [[-1.2, 1, -2.0], [1.4, -1, -0.5], [4.0, 1, -2.6]].map(([x, s, zc], i) => {
    const mesh = plane(1, 1.5, lam({ map: emptyTex }), x + s * 0.37, 0.85, zc, (s * Math.PI) / 2, 0, [1, 1 / 1.5]);
    return {
      mesh,
      done: false,
      fill() {
        this.done = true;
        mesh.material = products[i];
      },
    };
  });

  // Register counter.
  box(6.4, 1.0, 0.8, mats.counter, -4.7, 0.5, 2.8);
  box(6.5, 0.06, 0.9, mats.dark, -4.7, 1.03, 2.8, { collide: false });
  const screenMat = glowMat({ color: 0x7fd1ff }, 0x10161a);
  const screen = box(0.24, 0.15, 0.03, screenMat, -5.3, 1.36, 2.6, { collide: false, tile: 0 });
  screen.rotation.x = -0.35;
  refs.register = [box(0.4, 0.2, 0.36, mats.dark, -5.3, 1.16, 2.72, { collide: false }), screen];
  box(0.7, 0.45, 0.45, glowMat({ color: 0xffa648 }, 0x2a1c10), -2.3, 1.28, 2.8, { collide: false, tile: 0 });
  box(0.4, 1.5, 2.4, products[2], -7.75, 1.25, 1.0, { tile: 1 / 1.5 });
  box(4, 1.0, 0.4, products[1], 0.5, 0.5, 5.6, { tile: 1 / 1.5 });
  box(0.8, 1.1, 6, mats.metal, 7.55, 0.55, -1.5);
  plane(6, 0.9, glowMat({ map: T.productsTex(['#f4e7c9', '#e94', '#6a3', '#fff', '#c33']) }, 0x2a2a2a), 7.13, 0.6, -1.5, -Math.PI / 2, 0, [1, 1 / 1.5]);
  plane(1.2, 0.3, lam({ map: T.signTex('STAFF ONLY', '#ddd', '#222') }), 5.25, 2.55, -5.99, 0, 0, null);

  // --- Staff room --------------------------------------------------------
  refs.timeClock = [
    box(0.15, 0.4, 0.3, mats.metal, 3.08, 1.4, -7.4, { collide: false, tile: 0 }),
    plane(0.22, 0.1, basic({ color: 0x55ee88 }), 3.165, 1.48, -7.4, Math.PI / 2, 0, null),
  ];
  refs.boxes = [
    box(0.6, 0.4, 0.5, mats.cardboard, 7.3, 0.2, -9.4, { tile: 0 }),
    box(0.6, 0.4, 0.5, mats.cardboard, 7.25, 0.6, -9.35, { collide: false, tile: 0 }),
    box(0.6, 0.4, 0.5, mats.cardboard, 7.32, 1.0, -9.42, { collide: false, tile: 0 }),
  ];
  box(2.0, 0.75, 0.7, mats.wood, 5.6, 0.375, -9.6);
  refs.staticScreen = T.staticScreen();
  refs.monitor = [
    box(0.5, 0.42, 0.45, mats.dark, 6.1, 0.96, -9.7, { collide: false }),
    plane(0.4, 0.3, basic({ map: refs.staticScreen.texture }), 6.1, 0.97, -9.47, 0, 0, null),
  ];
  refs.phone = [
    box(0.22, 0.07, 0.26, mats.dark, 5.0, 0.785, -9.6, { collide: false }),
    box(0.06, 0.06, 0.24, mats.dark, 4.92, 0.85, -9.6, { collide: false }),
  ];
  box(0.55, 0.8, 0.55, lam({ color: 0x2d5a8c }), 3.5, 0.4, -9.5);
  refs.trashBag = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), lam({ color: 0x15161a, flatShading: true }));
  refs.trashBag.position.set(3.5, 0.95, -9.5);
  scene.add(refs.trashBag);
  box(0.5, 2.0, 1.6, mats.cardboard, 7.7, 1.0, -7.4, { tile: 0 });
  box(0.12, 0.1, 0.16, mats.dark, 3.1, 3.0, -9.85, { collide: false });

  // --- Outside -----------------------------------------------------------
  plane(40, 2.2, mats.concrete, 0, 0.001, 7.1, 0, -Math.PI / 2);
  plane(44, 30, mats.asphalt, 0, 0, 23, 0, -Math.PI / 2);
  for (const x of [-6, -3, 0, 3, 6]) plane(0.1, 4, basic({ color: 0xbdbdb5 }), x, 0.005, 10.5, 0, -Math.PI / 2, null);
  for (let x = -20; x < 20; x += 3) plane(1.5, 0.12, basic({ color: 0xc9b04a }), x, 0.005, 19, 0, -Math.PI / 2, null);

  box(0.15, 5, 0.15, mats.metal, -4, 2.5, 12);
  box(0.8, 0.12, 0.3, mats.metal, -3.65, 5, 12, { collide: false });
  box(0.4, 0.04, 0.2, basic({ color: 0xffd9a0 }), -3.4, 4.93, 12, { collide: false, tile: 0 });
  light(-3.4, 4.8, 12, 0xffb36b, 30, 20, false);

  box(0.9, 1.9, 0.75, lam({ color: 0xb81d24 }), 9.3, 0.95, 8);
  plane(0.7, 1.2, basic({ map: T.vendingTex() }), 8.84, 1.15, 8, -Math.PI / 2, 0, null);
  light(8.3, 1.4, 8, 0xbfe0ff, 3, 5, false);

  refs.dumpster = box(1.8, 1.2, 1.0, lam({ color: 0x2f5a3a }), -7.5, 0.6, 9.0);
  box(1.9, 0.08, 1.1, lam({ color: 0x223f2a }), -7.5, 1.24, 9.0, { collide: false });

  b.addBounds(-11, -10.5, 6, 16);
  b.addBounds(10.5, 11, 6, 16);
  b.addBounds(-11, 11, 15, 15.5);

  // Security camera that looks back at the staff-room desk.
  const secCam = new THREE.PerspectiveCamera(80, 1, 0.05, 40);
  secCam.position.set(3.25, 2.9, -9.75);
  secCam.lookAt(6, 0.9, -8.2);

  let staticTimer = 0;
  return Object.assign(b, {
    refs,
    secCam,
    cameras: [secCam],
    fog: [0x06070c, 4, 24],
    update(dt, movers) {
      const door = refs.door;
      const near = movers.some((p) => Math.hypot(p.x - DOOR_X, p.z - DOOR_Z) < 2.2);
      if (near && door.open < 0.01) door.onOpen?.();
      door.open = THREE.MathUtils.clamp(door.open + (near ? dt : -dt) * 2, 0, 1);
      door.panels[0].position.x = DOOR_X - 0.5 - door.open * 0.95;
      door.panels[1].position.x = DOOR_X + 0.5 + door.open * 0.95;

      staticTimer -= dt;
      if (staticTimer <= 0) {
        staticTimer = 0.08;
        refs.staticScreen.update();
      }
      if (this.powered) staffLight.intensity = Math.random() < 0.012 ? 1.5 : staffLight.userData.base;
    },
  });
}
