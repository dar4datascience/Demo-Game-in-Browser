import * as THREE from 'three';
import { lam, basic } from '../../engine/post.js';
import * as T from '../../engine/textures.js';
import { bakeAO } from '../../world/builder.js';
import { NPC } from '../../world/person.js';

const PI = Math.PI;
const add = (b, geo, mat, x, y, z, { parent = b.scene, ry = 0, rx = 0, rz = 0 } = {}) => {
  // Solids get baked AO; flat planes stay white so signs and floors are unaffected.
  if (geo.type === 'PlaneGeometry') {
    const n = geo.attributes.position.count;
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  } else {
    bakeAO(geo);
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  parent.add(mesh);
  return mesh;
};
const slab = (b, w, h, d, mat, x, z, opts = {}) =>
  add(b, new THREE.BoxGeometry(w, h, d), mat, x, h / 2, z, opts);
const cyl = (b, r0, r1, h, seg, mat, x, y, z, opts = {}) =>
  add(b, new THREE.CylinderGeometry(r0, r1, h, seg), mat, x, y, z, opts);

/*
 * A warm cone of light, faking the volume of a sodium lamp. Additive blending runs before the
 * post pass lifts the image by 1/2.2, so the opacity has to stay very low or the cone reads as
 * a solid tan pyramid (a linear 0.1 becomes ~0.4 on screen).
 */
export const lightCone = (b, x, y, z, color = 0xffb066, h = 4.5, r = 1.4) => {
  const mat = basic({
    color, transparent: true, opacity: 0.035, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const cone = add(b, new THREE.ConeGeometry(r, h, 8, 1, true), mat, x, y - h / 2, z);
  cone.userData.noBatch = true;
  return cone;
};

// --- Plaza and the winged statue -------------------------------------------
export function plaza(b, M) {
  const stone = M.stone;
  slab(b, 14, 0.35, 14, stone, 0, 0);
  slab(b, 10, 0.35, 10, stone, 0, 0).position.y = 0.7;
  slab(b, 6, 0.35, 6, stone, 0, 0).position.y = 1.05;
  slab(b, 4.4, 3.4, 4.4, stone, 0, 0).position.y = 2.9;
  slab(b, 3.2, 5.2, 3.2, stone, 0, 0).position.y = 7.2;
  slab(b, 3.8, 0.6, 3.8, stone, 0, 0).position.y = 10.1;

  const gold = M.gold;
  const figure = new THREE.Group();
  figure.position.set(0, 10.4, 0);
  b.scene.add(figure);
  cyl(b, 0.5, 1.05, 2.4, 6, gold, 0, 1.2, 0, { parent: figure });
  add(b, new THREE.BoxGeometry(0.95, 1.5, 0.7), gold, 0, 3.1, 0, { parent: figure });
  add(b, new THREE.IcosahedronGeometry(0.36, 0), gold, 0, 4.1, 0, { parent: figure });
  // Wings: flat wedges angled back, the silhouette that reads from the street.
  for (const s of [-1, 1]) {
    add(b, new THREE.BoxGeometry(2.5, 0.16, 1.1), gold, s * 1.45, 3.6, -0.25, {
      parent: figure, rz: s * 0.42, ry: s * -0.22,
    });
    add(b, new THREE.BoxGeometry(1.1, 0.14, 0.8), gold, s * 2.3, 4.15, -0.35, {
      parent: figure, rz: s * 0.75,
    });
  }
  add(b, new THREE.BoxGeometry(0.22, 1.4, 0.22), gold, 0, 4.2, 0.4, { parent: figure, rz: 0.5 });

  b.light(0, 4, 3, 0xffc070, 26, 22);
  b.light(0, 4, -3, 0x9a7cff, 14, 18);
  b.light(0, 13, 2, 0xffd08a, 20, 16);
  b.light(0, 1.6, 4, 0xffc070, 16, 12);
  lightCone(b, 0, 3.4, 2.6, 0xffb066, 5, 1.6);
  return { statue: figure };
}

// --- Glass towers behind the plaza -----------------------------------------
export function skyline(b, M) {
  const towers = [
    [-26, -58, 18, 18, 62, '#9fd0ff'],
    [4, -74, 15, 15, 84, '#bfe0ff'],
    [32, -56, 20, 20, 48, '#9fd0ff'],
    [-58, -86, 22, 22, 70, '#8fc4ff'],
    [62, -110, 24, 24, 58, '#a8d4ff'],
  ];
  for (const [x, z, w, d, h, tint] of towers) {
    const mat = basic({ map: T.facadeTex(5 + (h % 3), Math.round(h / 3), tint) });
    slab(b, w, h, d, mat, x, z);
    // Rooftop beacon so the silhouette has a red dot.
    add(b, new THREE.BoxGeometry(0.4, 0.4, 0.4), basic({ color: 0xff3a3a }), x, h + 0.3, z);
  }
  b.light(0, 12, -40, 0x5a7cff, 20, 60);
}

export function torre(b, M) {
  const base = M.stone;
  const levels = [
    [24, 12, 0], [22, 12, 20], [19, 11, 36], [15, 10, 50], [11, 9, 60],
  ];
  for (const [w, h, y] of levels) {
    const mat = basic({ map: T.facadeTex(4, Math.round(h / 2.4), '#ffcf9a') });
    const m = slab(b, w, h, w, mat, 80, -95);
    m.position.y = y + h / 2;
  }
  cyl(b, 0.25, 0.7, 14, 6, base, 80, 76, -95);
  add(b, new THREE.BoxGeometry(0.18, 8, 0.18), basic({ color: 0xff5a5a }), 80, 86, -95);
  const sign = basic({ map: T.signTex('TORRE CENTRAL', '#141018', '#ffd9a0', 256, 32) });
  add(b, new THREE.PlaneGeometry(20, 2.4), sign, 80, 22, -95 + 12.05);
  b.light(80, 18, -80, 0xffb060, 18, 40);
}

// --- Mosaic library block ---------------------------------------------------
export function biblioteca(b, M) {
  slab(b, 46, 16, 22, M.stone, -75, -55);
  const mosaic = basic({ map: T.mosaicTex() });
  add(b, new THREE.PlaneGeometry(44, 14), mosaic, -75, 8.4, -55 + 11.05);
  // Dark plinth and columns so the mural floats over a base.
  slab(b, 46, 2.4, 22.6, lam({ color: 0x241e2c, vertexColors: true }), -75, -55).position.y = 1.2;
  for (let i = 0; i < 7; i++) {
    cyl(b, 0.5, 0.6, 2.6, 6, M.stone, -95 + i * 6.6, 1.3, -55 + 11.6);
  }
  b.light(-75, 6, -40, 0xffa860, 30, 40);
  b.light(-88, 10, -48, 0xff7a3a, 18, 28);
}

// --- Park with jacaranda ----------------------------------------------------
export function park(b, M) {
  const trunk = M.bark;
  cyl(b, 0.32, 0.62, 5.4, 6, trunk, 45, 2.7, 10);
  for (const [dx, dz, dy, s] of [
    [-1.5, 0.3, 5.6, 1.7], [1.4, -0.6, 6.0, 1.6], [0.2, 1.4, 5.3, 1.5],
    [0.5, -1.3, 6.5, 1.4], [-0.6, -0.2, 7.0, 1.3], [1.9, 0.9, 5.1, 1.2],
  ]) {
    const blob = add(b, new THREE.IcosahedronGeometry(s, 0), M.jacaranda, 45 + dx, dy, 10 + dz);
    blob.scale.set(1.3, 0.72, 1.1);
    blob.rotation.y = dx;
  }
  for (const [x, z] of [[41.5, 10], [48.5, 10], [45, 6.5]]) {
    cyl(b, 0.26, 0.38, 3.4, 6, trunk, x, 1.7, z);
  }
  // Bench
  slab(b, 2.4, 0.12, 0.7, M.wood, 41, 8.2).position.y = 0.5;
  slab(b, 2.4, 0.6, 0.1, M.wood, 41, 8.55).position.y = 0.85;
  for (const x of [40, 42]) slab(b, 0.12, 0.5, 0.6, M.metal, x, 8.2).position.y = 0.25;
  // Lamp
  cyl(b, 0.09, 0.14, 4.4, 6, M.metal, 49, 2.2, 7);
  add(b, new THREE.SphereGeometry(0.32, 8, 6), b.glowMat({ color: 0xffc98a }, 0x2a2014), 49, 4.6, 7);
  const lamp = b.light(49, 4.4, 7, 0xffb066, 22, 20);
  lightCone(b, 49, 4.3, 7, 0xffb066, 5, 2.6);
  return { lamp };
}

// --- Cobbled road, car and onlookers ---------------------------------------
export function road(b, M) {
  const line = basic({ color: 0xd9d2c4 });
  for (let x = -44; x < 44; x += 6) {
    add(b, new THREE.PlaneGeometry(3.4, 0.22), line, x + 1.7, 0.02, 30, { rx: -PI / 2 });
  }
  // Car
  const car = new THREE.Group();
  car.position.set(-8, 0, 30);
  b.scene.add(car);
  add(b, new THREE.BoxGeometry(4.6, 0.95, 1.9), M.car, 0, 0.75, 0, { parent: car });
  add(b, new THREE.BoxGeometry(2.4, 0.8, 1.72), M.carGlass, -0.2, 1.55, 0, { parent: car });
  for (const [x, z] of [[-1.5, 0.95], [1.5, 0.95], [-1.5, -0.95], [1.5, -0.95]]) {
    add(b, new THREE.CylinderGeometry(0.42, 0.42, 0.28, 10), M.tyre, x, 0.42, z, { parent: car, rx: PI / 2 });
  }
  add(b, new THREE.BoxGeometry(0.12, 0.22, 1.6), basic({ color: 0xff2a1a }), 2.32, 0.85, 0, { parent: car });
  // Headlight cones: the yellow wedges that dominate the reference frame.
  // Narrow at the lamp, wide 7 m ahead: apex on the car's nose, base out front.
  const beam = basic({
    color: 0xffd27a, transparent: true, opacity: 0.06, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const beams = [0.55, -0.55].map((z) => {
    const cone = add(b, new THREE.ConeGeometry(1.1, 7, 10, 1, true), beam, 2.3 + 3.5, 0.75, z, { parent: car, rz: PI / 2 });
    cone.userData.noBatch = true;
    return cone;
  });
  b.light(-8, 0.9, 30, 0xffd08a, 18, 12);

  // Silhouettes on the pavement.
  const one = new NPC({ top: '#241f2e', bottom: '#181420', skin: '#8a6a58', hair: '#0e0b12', outfit: 'jacket', figure: 'masc' }, b.scene);
  one.place(14, 33);
  one.face(-20, 30);
  const two = new NPC({ top: '#2a2438', bottom: '#1a1622', skin: '#7a5c4c', hair: '#0c0a10', height: 0.94, outfit: 'tee', figure: 'masc' }, b.scene);
  two.place(17, 31.5);
  two.face(20, 36);

  for (let x = -40; x <= 40; x += 16) {
    cyl(b, 0.08, 0.12, 5.6, 6, M.metal, x, 2.8, 24);
    add(b, new THREE.BoxGeometry(0.5, 0.18, 0.5), M.metal, x, 5.6, 24);
    add(b, new THREE.BoxGeometry(0.42, 0.06, 0.42), b.glowMat({ color: 0xffc07a }, 0x2a1c10), x, 5.5, 24);
    b.light(x, 5.3, 24, 0xffa860, 24, 18);
    lightCone(b, x, 5.2, 24, 0xffa860, 5.2, 2.2);
  }
  return { car, beams, beamMat: beam };
}

// --- Metro station and train ------------------------------------------------
export function metroStation(b, M) {
  const X = -115, Z = 22;
  slab(b, 34, 1.1, 22, M.stationFloor, X, Z);
  // Back wall with tiles and the orange band.
  slab(b, 34, 7, 0.6, M.stationWall, X, Z - 11.4).position.y = 4.6;
  add(b, new THREE.BoxGeometry(34, 0.7, 0.66), basic({ color: 0xd9822b }), X, 5.4, Z - 11.05);
  const sign = basic({ map: T.signTex('ESTACIÓN SUR', '#1b1b1b', '#ffd9a0', 256, 32) });
  add(b, new THREE.PlaneGeometry(8, 1.1), sign, X + 6, 6.2, Z - 11.02);
  const map = basic({ map: T.signTex('MAPA', '#e8e2d2', '#1a1a1a', 64, 48) });
  add(b, new THREE.PlaneGeometry(2.4, 3.2), map, X + 11, 3.4, Z - 11.02);
  add(b, new THREE.PlaneGeometry(2.4, 3.4), basic({ map: T.signTex('NO CRUZAR', '#c0392b', '#ffffff', 64, 64) }), X - 2, 3.4, Z - 11.02);
  // Canopy and the two columns that frame (not block) the shot.
  slab(b, 34, 0.35, 16, M.metal, X, Z + 3).position.y = 7.2;
  for (const x of [X - 14, X + 14]) cyl(b, 0.3, 0.34, 7.2, 8, M.metal, x, 3.6, Z + 3);
  // Platform edge warning strip.
  add(b, new THREE.BoxGeometry(34, 0.06, 0.9), basic({ color: 0xe0b83a }), X, 1.13, Z - 8.6);
  // Bench and a vending machine for scale.
  slab(b, 3, 0.12, 0.7, M.wood, X + 5, Z - 6).position.y = 1.65;
  slab(b, 3, 0.7, 0.12, M.wood, X + 5, Z - 5.7).position.y = 2.0;
  slab(b, 1, 1.9, 0.8, M.metal, X + 12, Z - 5).position.y = 2.05;
  add(b, new THREE.PlaneGeometry(0.8, 1.4), basic({ color: 0x9fd0ff }), X + 12, 2.4, Z - 4.55);

  // Train stopped at the left of the frame: orange body, warm windows.
  const train = new THREE.Group();
  train.position.set(X - 9, 0, Z - 8.8);
  b.scene.add(train);
  for (let i = 0; i < 3; i++) {
    add(b, new THREE.BoxGeometry(9, 3.2, 3), M.metroBody, i * 9.2 - 9.2, 2.5, 0, { parent: train });
    for (let w = 0; w < 3; w++) {
      add(b, new THREE.PlaneGeometry(1.8, 1.2), basic({ color: 0xffc37a }), i * 9.2 - 12 + w * 2.8, 2.9, 1.52, { parent: train });
    }
    add(b, new THREE.BoxGeometry(9.2, 0.35, 3.1), basic({ color: 0xd9822b }), i * 9.2 - 9.2, 3.95, 0, { parent: train });
  }
  for (let i = 0; i < 6; i++) cyl(b, 0.3, 0.3, 0.24, 10, M.tyre, X - 17 + i * 5.2, 0.45, Z - 7.2, { rx: PI / 2 });

  b.light(X, 6.4, Z - 4, 0xffd9a0, 30, 26);
  b.light(X - 10, 4, Z - 10, 0xffb066, 18, 20);
  return { train };
}

export function metroCar(b, M) {
  const X = 0, Z = -150;
  const shell = new THREE.Group();
  shell.position.set(X, 0, Z);
  b.scene.add(shell);
  // BackSide box: one mesh gives a closed interior with a floor, ceiling and four walls.
  add(b, new THREE.BoxGeometry(3.2, 2.8, 24), M.metroInner, 0, 1.4, 0, { parent: shell });
  for (const s of [-1, 1]) {
    // Bench runs
    slab(b, 0.62, 0.16, 18, M.metroSeat, s * 1.28, 0, { parent: shell }).position.y = 0.55;
    add(b, new THREE.BoxGeometry(0.14, 0.9, 18), M.metroSeat, s * 1.58, 0.95, 0, { parent: shell });
    // Window band
    add(b, new THREE.PlaneGeometry(20, 0.8), basic({ color: 0x0a0c18 }), s * 1.59, 1.85, 0, { parent: shell, ry: s * PI / 2 });
    for (let i = 0; i < 7; i++) {
      cyl(b, 0.035, 0.035, 2.4, 6, M.chrome, s * 0.95, 1.5, -9 + i * 3);
      add(b, new THREE.BoxGeometry(0.05, 0.9, 0.05), M.chrome, s * 0.95, 2.3, -9 + i * 3, { parent: shell });
    }
    // Strap rail
    cyl(b, 0.03, 0.03, 20, 6, M.chrome, s * 0.55, 2.35, 0, { parent: shell, rx: PI / 2 });
  }
  // Concrete floor over the shell's streaky default UVs.
  add(b, new THREE.PlaneGeometry(3, 23.6), M.stationFloor, 0, 0.02, 0, { parent: shell, rx: -PI / 2 });
  for (let i = 0; i < 5; i++) {
    add(b, new THREE.BoxGeometry(0.7, 0.05, 1.3), basic({ color: 0x9a8a68 }), 0, 2.75, -9.6 + i * 4.8, { parent: shell });
    b.light(X, 2.5, Z - 9.6 + i * 4.8, 0xffe0b0, 12, 8, false);
  }
  return { shell };
}

// --- Abarrotes row ----------------------------------------------------------
const SHOPS = [
  { x: -9, name: 'ABARROTES LA LUNA', bg: '#2b3f6e', fg: '#ffe6b0', kind: 'abarrotes', tint: 0xffc78a },
  { x: 0, name: 'VINOS EL COMETA', bg: '#5a1f28', fg: '#ffd9a0', kind: 'vinos', tint: 0xffb070 },
  { x: 9, name: 'TORTILLERÍA MELA', bg: '#1f4a3a', fg: '#f2f0d8', kind: 'tortilla', tint: 0xffe0a0 },
];

export function abarrotes(b, M) {
  const Z = 85;
  for (const s of SHOPS) {
    slab(b, 8, 4.2, 6, M.plaster, s.x, Z - 2.5);
    // Open front: interior backdrop and shelves, all lit.
    add(b, new THREE.PlaneGeometry(7.2, 3.4), lam({ map: T.bodegaInteriorTex(s.kind) }), s.x, 1.8, Z - 5.4);
    for (let i = 0; i < 3; i++) {
      add(b, new THREE.BoxGeometry(6.4, 0.16, 0.5), M.metal, s.x, 0.7 + i * 0.75, Z - 4.9 - i * 0.35);
    }
    add(b, new THREE.PlaneGeometry(6.4, 2.2), lam({ map: T.productsTex(['#e9c46a', '#e76f51', '#2a9d8f', '#f4f1de', '#b5179e']) }),
      s.x, 1.6, Z - 5.36);
    // Sign band above the shutter.
    add(b, new THREE.PlaneGeometry(7.6, 1.1), basic({ map: T.signTex(s.name, s.bg, s.fg, 256, 32) }), s.x, 4.2, Z + 0.51);
    add(b, new THREE.BoxGeometry(8, 0.5, 0.5), M.plaster, s.x, 0.25, Z + 0.3);
    b.light(s.x, 2.2, Z - 3.4, s.tint, 22, 16);
    lightCone(b, s.x, 4.0, Z + 1.6, s.tint, 4.2, 2.6);
  }
  return {};
}

export function bride(b, M) {
  const X = -40, Z = 85;
  // Open-front shop: back wall, jambs and roof leave a window for the camera to look into.
  slab(b, 10, 4.6, 0.5, M.plaster, X, Z - 3.4);
  for (const s of [-1, 1]) slab(b, 0.5, 4.6, 3.4, M.plaster, X + s * 5, Z - 1.7);
  slab(b, 10.6, 0.5, 4, M.plaster, X, Z - 1.7).position.y = 4.4;
  add(b, new THREE.PlaneGeometry(9.4, 4.2), lam({ color: 0x4a3f52 }), X, 2.2, Z - 3.14);
  // Sign band over the opening.
  add(b, new THREE.BoxGeometry(10.6, 0.8, 0.5), basic({ color: 0x3a2a3e }), X, 4.9, Z - 0.1);
  add(b, new THREE.PlaneGeometry(7.4, 0.8), basic({ map: T.cursiveSignTex('La Novia') }), X, 4.9, Z + 0.16);
  // Window glass and the mannequin behind it.
  add(b, new THREE.PlaneGeometry(9, 4), basic({ color: 0xbfe0ff, transparent: true, opacity: 0.1, depthWrite: false }), X, 2.3, Z + 0.02);
  slab(b, 1.4, 0.5, 1.4, M.stone, X, Z - 1.6);
  const doll = new NPC({ top: '#f4f0e6', bottom: '#efe9da', skin: '#e6ded0', hair: '#2a2420', dress: true, veil: true, outfit: 'dress', hairStyle: 'long', build: 'slim', figure: 'femme', height: 1.02 }, b.scene);
  doll.place(X, Z - 1.6);
  doll.face(X, Z + 4);
  doll.root.position.y = 0.5;
  b.light(X, 2.6, Z - 1.4, 0xffe6c8, 18, 10);
  b.light(X, 3.4, Z + 2, 0xb090ff, 12, 12);
  // Warm key on the gown itself so the white dress reads against the purple neon.
  b.light(X, 1.7, Z + 0.6, 0xffe9d2, 14, 8);
  return { doll };
}

export function field(b, M) {
  const X = -150, Z = -72;
  // The road the camera travels: dark asphalt with a faded centre line, running into the fog.
  add(b, new THREE.PlaneGeometry(9, 70), M.asphalt, X, 0.02, Z + 10, { rx: -PI / 2 });
  for (let z = Z - 18; z < Z + 40; z += 4) {
    add(b, new THREE.PlaneGeometry(0.18, 2.2), basic({ color: 0x8a8478 }), X, 0.035, z, { rx: -PI / 2 });
  }
  // Bare tree: trunk plus crooked branches leaning up and out.
  cyl(b, 0.3, 0.8, 7, 5, M.bark, X, 3.5, Z);
  for (const [ry, rz, len] of [[0.4, 0.9, 3.4], [2.4, -0.8, 3.0], [4.2, 1.1, 2.6], [1.3, 1.35, 2.4], [5.4, -1.0, 2.2]]) {
    add(b, new THREE.BoxGeometry(0.18, len, 0.18), M.bark, X + Math.sin(ry) * len * 0.45, 5.4 + len * 0.4, Z + Math.cos(ry) * len * 0.45, { ry, rz });
  }
  for (const [dx, dz, y, len] of [[1.4, 0.6, 6.6, 1.8], [-1.2, -0.8, 6.2, 1.6]]) {
    add(b, new THREE.BoxGeometry(0.1, len, 0.1), M.bark, X + dx, y, Z + dz, { rz: dx * 0.5 });
  }
  // Something tall and thin, standing at the road's edge with the tree behind it.
  const beast = new NPC({ top: '#0e0b12', bottom: '#0a0810', skin: '#241e2c', hair: '#08060c', height: 1.7, longHair: true }, b.scene);
  beast.place(X + 2.4, Z + 3);
  beast.face(X - 1, Z + 10);
  add(b, new THREE.BoxGeometry(0.45, 0.35, 0.3), M.bark, X + 2.4, 0.6, Z + 4);
  b.light(X + 1, 2.6, Z + 11, 0x8a76c0, 16, 30);
  b.light(X - 2, 3.6, Z - 4, 0x5a4a90, 9, 24);
  return { beast };
}

// Distant city silhouettes so the horizon never shows a hard ground/sky seam.
export function skylineRing(b, M) {
  const dark = lam({ color: 0x120f1c });
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + 0.1;
    const r = 130 + (i % 3) * 14;
    const w = 12 + (i % 5) * 5, h = 18 + ((i * 7) % 38);
    slab(b, w, h, w, dark, Math.cos(a) * r, Math.sin(a) * r);
  }
}

// Fence posts and low walls that frame the field shot.
export function fence(b, M) {
  for (let i = 0; i < 9; i++) {
    add(b, new THREE.BoxGeometry(0.1, 1.2, 0.1), M.metal, -176 + i * 4, 0.6, -52);
  }
  add(b, new THREE.BoxGeometry(32, 0.08, 0.08), M.metal, -160, 1.1, -52);
}
