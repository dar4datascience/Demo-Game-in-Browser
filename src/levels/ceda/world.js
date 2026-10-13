import * as THREE from 'three';
import { lam, basic } from '../../engine/post.js';
import * as T from '../../engine/textures.js';
import { createBuilder } from '../../world/builder.js';
import { makeDiablito, makeTruck, makeStall, sackStack, crate, trashPile, hitbox } from './props.js';

/*
 * Inspired by the "Abarrotes y Víveres — Lado A" floor plan of the Central de Abasto (Iztapalapa, CDMX):
 * three covered walkways ("pasillos") run north–south, crossed by bodega rows A–D whose storefronts
 * face loading docks ("andenes") with diagonal truck bays. Eje 5 Sur borders the north side, Eje 4 Oriente
 * the west, and an open plaza with stalls sits between rows B and C. +z is south.
 */
export const ROWS = { A: -38, B: -21, C: 10, D: 27 }; // z of each row's storefront (south face)
export const UNIT_X = [-25, -21, -17, -13, -9, -5, 5, 9, 13, 17, 21, 25];
export const PASILLOS = [-30, 0, 30];
export const SEGMENTS = [[-27, -3], [3, 27]];
export const EXIT_Z = -52;
const DOCK = 2.5;

export const unitAt = (id) => {
  const [row, n] = id.split('-');
  return { x: UNIT_X[n - 1], z: ROWS[row] };
};

const NAMES = [
  'ABARROTES LA GÜERA', 'DULCERÍA LA ESTRELLA', 'CREMERÍA LUPITA', 'DESECHABLES EL SOL', 'ESPECIAS LA ABUELA',
  'BOTANAS EL CHATO', 'JARCIERÍA LA LUZ', 'ABARROTES SAN JUDAS', 'REFRESCOS EL FLACO', 'PILONCILLO MICHOACÁN',
  'CERILLOS LA PALOMA', 'VELADORAS LA FE', 'SEMILLAS LA CANASTA', 'ABARROTES EL CHINO', 'DULCES TÍPICOS PUEBLA',
  'CAFÉ DE OLLA DON PEPE', 'SERVILLETAS RAMOS', 'ACEITES LA HACIENDA',
];
// Storefronts the level scripts rely on.
const KEY_UNITS = {
  'B-4': { name: 'ABARROTES LA ESPERANZA', open: false, kind: 'sacks' },
  'B-2': { name: 'CHILES SECOS EL MORAL', open: true, kind: 'chiles' },
  'A-8': { name: 'FRIJOL Y ARROZ PÉREZ', open: true, kind: 'sacks' },
  'C-5': { name: 'MOLES DOÑA TERE', open: true, kind: 'chiles' },
  'A-3': { name: 'SEMILLAS DON CHUY', open: true, kind: 'sacks' },
  'C-9': { name: 'GRANOS HNOS. RUIZ', open: true, kind: 'sacks' },
  'B-11': { name: 'AZÚCAR Y HARINA LÓPEZ', open: true, kind: 'boxes' },
};
// Trucks the scripts use: [row, x, color].
const KEY_TRUCKS = { seller: ['B', -9.6, 0xd9d4c7], d1: ['C', -20, 0xb3261e], d2: ['A', 20, 0x2459a8], d3: ['D', -8, 0xe8e2d0] };

export function buildWorld(scene) {
  const b = createBuilder(scene);
  const { box, plane, light, glowMat, addCollider } = b;
  const refs = { units: {}, trucks: {}, counters: {}, pickups: {}, lamps: [] };

  const M = {
    asphalt: lam({ map: T.asphaltTex() }),
    concrete: lam({ map: T.concreteTex() }),
    wall: lam({ map: T.paintedWallTex() }),
    boundary: lam({ map: T.paintedWallTex('#cfc6b0', '#9a3324') }),
    roof: lam({ color: 0x5d5a55 }),
    pillar: lam({ color: 0x9c9585 }),
    metal: lam({ map: T.metalTex() }),
    line: basic({ color: 0xbdbdb5 }),
    hazard: lam({ map: T.hazardTex() }),
    wood: lam({ map: T.woodTex() }),
  };
  const interiors = Object.fromEntries(['sacks', 'boxes', 'chiles'].map((k) => [k, glowMat({ map: T.bodegaInteriorTex(k) }, 0x0d0b09)]));
  const cortinas = ['#8d9298', '#6f8a7c', '#9a8f7c', '#7b8496'].flatMap((c) => [lam({ map: T.cortinaTex(c) }), lam({ map: T.cortinaTex(c, true) })]);

  scene.add(new THREE.AmbientLight(0x2c3350, 0.7), new THREE.HemisphereLight(0x4a5480, 0x2a2420, 1.1));
  plane(100, 110, M.asphalt, 0, 0, -10, 0, -Math.PI / 2);

  // --- Pasillos (covered walkways) ----------------------------------------
  const lampMat = glowMat({ color: 0xffd7a0 }, 0x1d1a16);
  PASILLOS.forEach((px, i) => {
    plane(6, 86, M.concrete, px, 0.01, -7, 0, -Math.PI / 2);
    box(7, 0.35, 86, M.roof, px, 4.6, -7, { collide: false });
    for (let z = -46; z <= 34; z += 8) for (const s of [-1, 1]) box(0.35, 4.45, 0.35, M.pillar, px + s * 3.2, 2.22, z);
    for (const z of [-36, -5, 24]) {
      box(0.5, 0.08, 1.2, lampMat, px, 4.39, z, { collide: false, tile: 0 });
      refs.lamps.push(light(px, 4.1, z, 0xffbf73, 45, 26));
    }
    const sign = lam({ map: T.pasilloSignTex(`PASILLO ${i + 1}`), side: THREE.DoubleSide });
    for (const [row, z] of Object.entries(ROWS)) {
      plane(2.4, 0.45, sign, px, 3.95, z + 2, 0, 0, null);
      const letter = lam({ map: T.letterTex(row), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
      plane(0.6, 0.6, letter, px + 1.6, 3.95, z + 2, 0, 0, null);
    }
  });

  // --- Bodega rows -----------------------------------------------------------
  let nameIdx = 0;
  const reserved = (row, x) => Object.values(KEY_TRUCKS).some(([r, tx]) => r === row && Math.abs(tx - x) < 3.5)
    || Object.keys(KEY_UNITS).some((id) => id[0] === row && Math.abs(unitAt(id).x - x) < 2.6);

  for (const [row, front] of Object.entries(ROWS)) {
    for (const [x0, x1] of SEGMENTS) {
      const cx = (x0 + x1) / 2, w = x1 - x0;
      box(w, 5, 6, M.wall, cx, 2.5, front - 3, { occlude: true });
      box(w + 0.4, 0.3, 6.6, M.roof, cx, 5.15, front - 3, { collide: false });
      box(w, 0.18, DOCK, M.concrete, cx, 0.09, front + DOCK / 2, { collide: false });
      plane(w, 0.18, M.hazard, cx, 0.09, front + DOCK + 0.005, 0, 0, [1, 1 / 0.18]);
      for (let lx = x0 + 1.2; lx < x1; lx += 3.2) {
        plane(0.12, 5.6, M.line, lx, 0.006, front + DOCK + 2.75, 0.45, -Math.PI / 2, null);
        const bay = lx + 1.6;
        if (bay < x1 - 1 && !reserved(row, bay) && T.rand() < 0.35) parkTruck(row, bay, [0xd9d4c7, 0xb3261e, 0x2459a8, 0x3b7d3a, 0xe0a526][Math.floor(T.rand() * 5)], T.rand() < 0.6);
      }
      for (let x = x0; x <= x1; x += 4) box(0.3, 3.5, 0.25, M.pillar, x, 1.75, front + 0.1, { collide: false });
    }
    UNIT_X.forEach((x, i) => makeUnit(`${row}-${i + 1}`, x, front));
  }

  function makeUnit(id, x, front) {
    const key = KEY_UNITS[id];
    const open = key ? key.open : T.rand() < 0.28;
    const kind = key?.kind ?? ['sacks', 'boxes', 'chiles'][Math.floor(T.rand() * 3)];
    const name = key?.name ?? NAMES[nameIdx++ % NAMES.length];
    plane(3.7, 0.8, lam({ map: T.bodegaSignTex(name, id) }), x, 3.85, front + 0.03, 0, 0, null);
    box(3.8, 0.3, 0.35, M.metal, x, 3.2, front + 0.15, { collide: false });
    plane(3.6, 3.0, interiors[kind], x, 1.5, front + 0.02, 0, 0, null);
    const cortina = plane(3.6, 3.0, cortinas[Math.floor(T.rand() * cortinas.length)], x, 1.5, front + 0.06);
    const unit = { id, x, front, name, cortina, roll: open ? 1 : 0, target: open ? 1 : 0 };
    applyRoll(unit);
    refs.units[id] = unit;
    if (open && !key) {
      const props = T.rand() < 0.5 ? sackStack(4) : crate(['#d32f2f', '#7cb342', '#fbc02d'][Math.floor(T.rand() * 3)]);
      props.position.set(x + 1.1, 0.18, front + 0.7);
      scene.add(props);
    }
  }

  // Roll-up shutter: shrink toward its housing as `roll` goes 0 → 1.
  function applyRoll(u) {
    u.cortina.scale.y = Math.max(0.001, 1 - u.roll);
    u.cortina.position.y = 3 - 1.5 * (1 - u.roll);
  }

  function parkTruck(row, x, color, cargo) {
    const truck = makeTruck(color, cargo);
    const z = ROWS[row] + DOCK + 2.9;
    truck.position.set(x, 0, z);
    truck.rotation.y = 0.45;
    scene.add(truck);
    addCollider(x, z, 1.05, 2.75, 0.45);
    return truck;
  }

  for (const [key, [row, x, color]] of Object.entries(KEY_TRUCKS)) refs.trucks[key] = parkTruck(row, x, color, true);

  // Seller's bodega fixtures: counter + scale on the dock, three pallets for stock.
  const sellerX = unitAt('B-4').x, bFront = ROWS.B;
  refs.sellerCounter = box(1.6, 0.95, 0.6, M.wood, sellerX, 0.66, bFront + 1.6);
  refs.scale = [
    box(0.4, 0.12, 0.3, M.metal, sellerX + 0.6, 1.2, bFront + 1.6, { collide: false }),
    box(0.16, 0.12, 0.04, glowMat({ color: 0xe8f0d0 }, 0x222222), sellerX + 0.6, 1.32, bFront + 1.45, { collide: false, tile: 0 }),
  ];
  refs.pallets = [sellerX - 1.8, sellerX + 1.8, sellerX + 3.0].map((x) => ({
    mesh: box(0.9, 0.12, 0.7, M.wood, x, 0.24, bFront + 0.7, { collide: false }),
    x,
    z: bFront + 0.7,
  }));

  // Vendor counters for the consumer's shopping list, sack piles for the diablero's pickups.
  for (const id of ['B-2', 'A-8', 'C-5']) {
    const { x, z } = unitAt(id);
    refs.counters[id] = box(1.8, 0.9, 0.5, M.wood, x, 0.63, z + 1.3);
  }
  for (const id of ['A-3', 'C-9', 'B-11']) {
    const { x, z } = unitAt(id);
    const pile = sackStack(6);
    pile.position.set(x + 0.9, 0.18, z + 0.8);
    scene.add(pile);
    refs.pickups[id] = pile;
  }

  // --- Plaza between rows B and C ---------------------------------------------
  const lonas = ['#e4007c', '#1e6fd9', '#ff7a00', '#2bb673'];
  [[-22, -7, 0.1], [-16, -1.5, -0.2], [-10, -8, 0.05], [-7, 0.5, 0.3], [8, -6.5, -0.1], [13, -0.5, 0.2], [19, -8, 0], [23, -1, -0.25]]
    .forEach(([x, z, ry], i) => {
      const stall = makeStall(lonas[i % lonas.length]);
      stall.position.set(x, 0, z);
      stall.rotation.y = ry;
      scene.add(stall);
      addCollider(x, z, 1.2, 0.6, ry);
    });
  // Mercury pole lamps over the plaza and the truck lanes.
  const poleMat = glowMat({ color: 0xdfe8ff }, 0x1d1d22);
  for (const [x, z] of [[-15, -4], [15, -4], [-15, -30], [15, -30], [-15, 18.5], [15, 18.5], [-15, 35.3], [15, 35.3]]) {
    box(0.2, 6, 0.2, M.metal, x, 3, z);
    box(0.8, 0.15, 0.4, poleMat, x, 6, z, { collide: false, tile: 0 });
    refs.lamps.push(light(x, 5.8, z, 0xd8e4ff, 45, 26));
  }
  const taco = makeStall('#f2c230');
  taco.position.set(5.5, 0, -10.5);
  scene.add(taco);
  addCollider(5.5, -10.5, 1.2, 0.6);
  plane(2.2, 0.5, glowMat({ map: T.signTex('TACOS DE CANASTA', '#f2c230', '#7a1f1f', 128, 24) }, 0x2a2410), 5.5, 2.15, -9.45, 0, 0, null);

  // Ambient clutter: trash piles and parked diablitos.
  for (const [x, z, ry] of [[-34, -20, 0.3], [34, 12, -0.5], [-2, -14, 1], [26, -12, 0.2], [-36, 30, 0.7], [-24, 19, 0.4], [11, 19.5, -0.3]]) {
    const pile = trashPile();
    pile.position.set(x, 0, z);
    pile.rotation.y = ry;
    scene.add(pile);
  }
  for (const [x, z, ry] of [[-6.5, -36.5, 0.3], [16, 11.5, -0.4], [-22, 28.5, 0.2], [24, -19.5, 0.1]]) {
    const d = makeDiablito();
    d.position.set(x, 0.18, z);
    d.rotation.set(-0.35, ry, 0);
    scene.add(d);
  }
  refs.diablito = makeDiablito();
  refs.diablito.position.set(1.8, 0, 31);
  refs.diablito.rotation.set(-0.3, -0.4, 0);
  refs.diablito.add(hitbox(0.6, 1.3, 0.5, 0, 0.65, 0));
  scene.add(refs.diablito);

  // --- Towers, perimeter, Eje 5 Sur ---------------------------------------------
  const tower = lam({ color: 0x9a968c }), dome = lam({ color: 0x8a2e1e, emissive: 0x2a0a05 });
  for (const x of [-30, 30]) {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.2, 8, 12), tower);
    base.position.set(x, 4, -48);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4.3, 1.4, 12), dome);
    cap.position.set(x, 8.7, -48);
    scene.add(base, cap);
    for (let a = 0; a < 6; a++) box(1.2, 0.35, 0.2, lam({ color: 0x1b1d22 }), x + Math.sin(a) * 4.1, 5.5, -48 + Math.cos(a) * 4.1, { collide: false, ry: a });
    addCollider(x, -48, 3.8, 3.8);
  }
  box(35, 3, 0.4, M.boundary, -20.5, 1.5, -51, { occlude: true });
  box(35, 3, 0.4, M.boundary, 20.5, 1.5, -51, { occlude: true });
  box(0.4, 3, 87, M.boundary, -38, 1.5, -7.5, { occlude: true });
  box(0.4, 3, 87, M.boundary, 38, 1.5, -7.5, { occlude: true });
  box(76.4, 3, 0.4, M.boundary, 0, 1.5, 36, { occlude: true });
  for (const x of [-3.3, 3.3]) box(0.6, 4.6, 0.6, M.pillar, x, 2.3, -51);
  plane(7.2, 0.9, glowMat({ map: T.signTex('CENTRAL DE ABASTO · EJE 5 SUR', '#1f4fa3', '#ffffff', 256, 32) }, 0x0e1626), 0, 4.75, -50.7, Math.PI, 0, null);
  plane(9, 0.7, lam({ map: T.signTex('ABARROTES Y VÍVERES · LADO A', '#1f4fa3', '#ffffff', 256, 24) }), 0, 2.4, 35.78, Math.PI, 0, null);
  plane(4, 0.6, lam({ map: T.signTex('EJE 4 OTE. →', '#ffffff', '#1f4fa3', 128, 24) }), -37.78, 2.2, 0, Math.PI / 2, 0, null);

  plane(80, 2.4, M.concrete, 0, 0.004, -52.4, 0, -Math.PI / 2);
  for (let x = -40; x < 40; x += 4) plane(2, 0.15, basic({ color: 0xd8d8d0 }), x, 0.006, -58, 0, -Math.PI / 2, null);
  for (const x of [-12, 12]) {
    box(0.18, 6, 0.18, M.metal, x, 3, -53.2);
    light(x, 5.6, -53.6, 0xffb36b, 30, 24, false);
  }
  b.addBounds(-38, 38, -60, -59.6);
  b.addBounds(-38.4, -37.6, -60, -51);
  b.addBounds(37.6, 38.4, -60, -51);

  // Emergency lights stay on through the blackout.
  light(0, 4, -50, 0xff3020, 6, 14, false);
  light(0, 4.3, -4, 0xff3020, 3, 12, false);

  return Object.assign(b, {
    refs,
    cameras: [],
    fog: [0x07080d, 6, 40],
    update(dt) {
      for (const u of Object.values(refs.units)) {
        if (u.roll === u.target) continue;
        u.roll = THREE.MathUtils.clamp(u.roll + Math.sign(u.target - u.roll) * dt * 0.7, 0, 1);
        applyRoll(u);
      }
      if (this.powered) for (const l of refs.lamps) l.intensity = Math.random() < 0.004 ? 2 : l.userData.base;
    },
  });
}
