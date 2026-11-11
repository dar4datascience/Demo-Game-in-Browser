import * as THREE from 'three';
import { lam, basic, phong } from '../../engine/post.js';
import * as T from '../../engine/textures.js';
import { createBuilder } from '../../world/builder.js';
import { batchWorld, localSize } from '../../world/batch.js';
import { makeDiablito, makeTruck, makeStall, sackStack, crate, trashPile, hitbox, makePancarta } from './props.js';
import * as PK from '../../world/propkit.js';

/*
 * Central de Abasto (Iztapalapa) — "Abarrotes y Víveres, Lado A", compressed for walking.
 *
 * Real layout, per the market's own organisation: bodegas are ~5 m wide and face a pedestrian
 * andador on one side and a loading andén on the other. Each andador serves two rows of bodegas,
 * one on each side, and the rows are lettered north to south (A, B, C ... Z). Bodega numbers grow
 * west to east. Five numbered pasillos run north–south and cut through every nave; pasillo 2 is the
 * main artery and the only one with the long bridge between the abarrotes (A–H) and the fruit and
 * vegetable halls (I–Z). The site is bounded by Eje 5 Sur (north, the gate), Eje 6 Sur (south),
 * Eje 5 Oriente (east) and Eje 4 Oriente (west).
 *
 * Compressed scale: bodegas are 7 m deep instead of 20, and the 26 rows sit on a 28 m pitch, so the
 * whole A–Z market is ~144 x 376 m instead of 2.25 km. Numbers are placed exactly like the real
 * ones, so "B-4" still means row B, fourth bodega from the west.
 */
export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
export const NAVES = [];
for (let i = 0; i < LETTERS.length; i += 2) NAVES.push([LETTERS[i], LETTERS[i + 1]]);

export const AISLE = 7; // pedestrian andador between the two rows of a nave
export const DEPTH = 7; // bodega depth (the real ones are 20 m)
export const STREET = 7; // andén street between naves, wide enough for a trailer
export const PITCH = AISLE + DEPTH + STREET + DEPTH; // 28 m, aisle centre to aisle centre
export const PASILLOS = [-52, -26, 0, 26, 52];
export const PASILLO_W = [6, 10, 6, 6, 6]; // pasillo 2 is the wide main artery
export const UNIT_X = [-67.75, -59.25, -44.5, -35.5, -16.5, -7.5, 8, 18, 34, 44, 59.25, 67.75];
export const UNIT_W = [8.5, 8.5, 9, 9, 9, 9, 10, 10, 10, 10, 8.5, 8.5];
export const SEGMENTS = [[-72, -55], [-49, -31], [-21, -3], [3, 23], [29, 49], [55, 72]];
const DOCK = 2.2;

export const ROWS = {}; // letter -> z of the storefront
export const ROW_FACE = {}; // +1 when the storefront faces +z (south), -1 when it faces north
NAVES.forEach(([north, south], i) => {
  ROWS[north] = i * PITCH - AISLE / 2;
  ROWS[south] = i * PITCH + AISLE / 2;
  ROW_FACE[north] = 1;
  ROW_FACE[south] = -1;
});

export const aisleZ = (i) => i * PITCH;
export const streetZ = (i) => (i - 1) * PITCH + PITCH / 2;
export const NORTH_Z = -22; // Eje 5 Sur gate wall
export const SOUTH_Z = 356; // Eje 6 Sur wall
export const EXIT_Z = -23;
export const SPAWN = [-26, -18];
export const BRIDGE = { x: -26, z: streetZ(4), hx: PASILLO_W[1] / 2, hz: STREET / 2 + 1 };

// Open-air spots the Virgen María shrine can appear at during the diablero's ghost fight.
export const SHRINE_SPOTS = [
  [-26, 28], [0, 56], [-52, 84], [52, 112], [26, 140], [0, 196], [-26, 280], [52, 308],
];
// Clear spot for the diablero's fireside beer scene: pasillo 2 where it crosses the C–D andador.
export const FIRE_SPOT = [-26, 56];

export const unitAt = (id) => {
  const [row, n] = id.split('-');
  const i = Number(n) - 1;
  return { x: UNIT_X[i], z: ROWS[row], face: ROW_FACE[row], w: UNIT_W[i] };
};

const NAMES = [
  'ABARROTES LA GÜERA', 'DULCERÍA LA ESTRELLA', 'CREMERÍA LUPITA', 'DESECHABLES EL SOL', 'ESPECIAS LA ABUELA',
  'BOTANAS EL CHATO', 'JARCIERÍA LA LUZ', 'ABARROTES SAN JUDAS', 'REFRESCOS EL FLACO', 'PILONCILLO MICHOACÁN',
  'CERILLOS LA PALOMA', 'VELADORAS LA FE', 'SEMILLAS LA CANASTA', 'ABARROTES EL CHINO', 'DULCES TÍPICOS PUEBLA',
  'CAFÉ DE OLLA DON PEPE', 'SERVILLETAS RAMOS', 'ACEITES LA HACIENDA', 'FRUTOS SECOS LA NAVE', 'ABARROTES EL ROSARIO',
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
const KEY_TRUCKS = { seller: ['B', -35.5, 0xd9d4c7], d1: ['A', -44.5, 0xb3261e], d2: ['C', 44, 0x2459a8], d3: ['B', 59.25, 0xe8e2d0] };
const SIGN_COLORS = [['#f4d03f', '#7a1f1f'], ['#1e6fd9', '#ffffff'], ['#e4007c', '#ffffff'], ['#2bb673', '#ffffff'], ['#ffffff', '#c0392b'], ['#ff7a00', '#1b1b1b']];

export function buildWorld(scene) {
  const b = createBuilder(scene);
  const { box, plane, light, glowMat, addCollider } = b;
  const refs = { units: {}, trucks: {}, counters: {}, pickups: {}, lamps: [], solid: [] };

  const M = {
    asphalt: phong({ map: T.asphaltTex(), shininess: 12, specular: 0x27324e, vertexColors: true }),
    concrete: phong({ map: T.concreteTex(), shininess: 12, specular: 0x27324e, vertexColors: true }),
    wall: lam({ map: T.paintedWallTex(), vertexColors: true }),
    boundary: lam({ map: T.paintedWallTex('#cfc6b0', '#9a3324'), vertexColors: true }),
    roof: lam({ color: 0x5d5a55, vertexColors: true }),
    pillar: lam({ color: 0x9c9585, vertexColors: true }),
    metal: lam({ map: T.metalTex(), vertexColors: true }),
    line: basic({ color: 0xbdbdb5 }),
    hazard: lam({ map: T.hazardTex(), vertexColors: true }),
    wood: PK.kitMats.wood(), // shared with the prop kit so clutter and set merge into one batch
  };
  const interiors = Object.fromEntries(['sacks', 'boxes', 'chiles'].map((k) => [k, glowMat({ map: T.bodegaInteriorTex(k) }, 0x0d0b09)]));
  const cortinas = ['#8d9298', '#6f8a7c', '#9a8f7c', '#7b8496'].flatMap((c) => [lam({ map: T.cortinaTex(c) }), lam({ map: T.cortinaTex(c, true) })]);
  const lampMat = glowMat({ color: 0xffd7a0 }, 0x1d1a16);

  scene.add(new THREE.AmbientLight(0x3a4568, 2.5), new THREE.HemisphereLight(0x5a6490, 0x2a2420, 2.95),
    new THREE.HemisphereLight(0x3a4570, 0x2a2018, 0.55));

  // --- Storefront catalogue and one shared sign atlas ------------------------
  const defs = [];
  for (const row of LETTERS) {
    UNIT_X.forEach((x, i) => {
      const id = `${row}-${i + 1}`;
      const key = KEY_UNITS[id];
      defs.push({
        id, row, x, w: UNIT_W[i], front: ROWS[row], face: ROW_FACE[row],
        open: key ? key.open : T.rand() < 0.3,
        kind: key?.kind ?? ['sacks', 'boxes', 'chiles'][Math.floor(T.rand() * 3)],
        name: key?.name ?? NAMES[Math.floor(T.rand() * NAMES.length)],
        key: !!key,
      });
    });
  }
  const cells = [];
  const cellIndex = new Map();
  for (const d of defs) {
    cellIndex.set(d.id, cells.length);
    const [bg, fg] = SIGN_COLORS[(d.row.charCodeAt(0) + Number(d.id.split('-')[1])) % SIGN_COLORS.length];
    cells.push(T.bodegaSignCell(d.name, d.id, bg, fg));
  }
  PASILLOS.forEach((_, i) => {
    cellIndex.set(`pasillo${i}`, cells.length);
    cells.push(T.signCell(`PASILLO ${i + 1}`, '#1f4fa3', '#ffffff', 13));
  });
  NAVES.forEach(([a, c]) => {
    cellIndex.set(`nave${a}`, cells.length);
    cells.push(T.signCell(`ANDADOR ${a}-${c}`, '#1f4fa3', '#ffffff', 12));
  });
  cellIndex.set('rotulista', cells.length);
  cells.push(T.signCell('ROTULISTA · LOCAL 3', '#f4d03f', '#7a1f1f', 10));
  cellIndex.set('puente', cells.length);
  cells.push(T.signCell('PUENTE · PASILLO 2', '#f2c230', '#1b1b1b', 10));
  const atlas = T.signAtlas(cells);
  const sign = (key, w, h, x, y, z, ry = 0) => {
    const mesh = plane(w, h, atlas.material, x, y, z, ry, 0, null);
    T.setUV(mesh.geometry, atlas.uv(cellIndex.get(key)));
    return mesh;
  };

  // --- Ground, andadores and the numbered pasillos --------------------------
  plane(190, 420, M.asphalt, 0, 0, 166, 0, -Math.PI / 2);
  NAVES.forEach((_, i) => plane(144, AISLE, M.concrete, 0, 0.008, aisleZ(i), 0, -Math.PI / 2));
  PASILLOS.forEach((px, i) => {
    const w = PASILLO_W[i], mid = (NORTH_Z + SOUTH_Z) / 2, len = SOUTH_Z - NORTH_Z;
    plane(w, len, M.concrete, px, 0.01, mid, 0, -Math.PI / 2);
    box(w + 1.2, 0.35, len, M.roof, px, 4.6, mid, { collide: false });
    for (let z = NORTH_Z + 4; z <= SOUTH_Z - 4; z += 12) for (const s of [-1, 1]) box(0.35, 4.45, 0.35, M.pillar, px + s * (w / 2 + 0.4), 2.22, z);
    for (let z = NORTH_Z + 8; z < SOUTH_Z; z += 20) {
      box(0.5, 0.08, 1.2, lampMat, px, 4.39, z, { collide: false, tile: 0 });
      refs.lamps.push(light(px, 4.1, z, 0xffbf73, 55, 30));
    }
    NAVES.forEach(([a], ni) => {
      sign(`pasillo${i}`, 2.4, 0.45, px, 3.95, aisleZ(ni) + 2.2, 0);
      sign(`nave${a}`, 2.2, 0.42, px + 1.9, 3.95, aisleZ(ni) + 2.2, 0);
    });
  });

  // Wall lamps over BOTH faces of every andador — registered lights are pool candidates, so
  // doubling them costs no real lights, just better nearest-8 coverage while walking lanes.
  NAVES.forEach(([north, south]) => {
    for (const row of [north, south]) {
      const front = ROWS[row], face = ROW_FACE[row];
      for (const x of [-60, -36, -12, 12, 36, 60]) {
        box(0.6, 0.1, 0.9, lampMat, x, 4.2, front + face * 0.25, { collide: false, tile: 0 });
        refs.lamps.push(light(x, 4.05, front + face * 0.9, 0xffcf8a, 56, 28));
      }
    }
  });

  // --- Bodega rows (26 lettered rows, A north to Z south) -------------------
  for (const row of LETTERS) {
    const front = ROWS[row], face = ROW_FACE[row];
    const back = front - face * DEPTH;
    for (const [x0, x1] of SEGMENTS) {
      const cx = (x0 + x1) / 2, w = x1 - x0;
      box(w, 5, DEPTH, M.wall, cx, 2.5, front - face * DEPTH / 2, { occlude: true, tile: 0.2 });
      box(w + 0.4, 0.3, DEPTH + 0.6, M.roof, cx, 5.15, front - face * DEPTH / 2, { collide: false });
      // Andén apron and diagonal trailer bays on the back side, facing the street.
      box(w, 0.18, DOCK, M.concrete, cx, 0.09, back - face * DOCK / 2, { collide: false });
      plane(w, 0.18, M.hazard, cx, 0.09, back - face * (DOCK + 0.01), 0, 0, [1, 1 / 0.18]);
      for (let lx = x0 + 1.6; lx < x1; lx += 3.4) {
        plane(0.12, 5.4, M.line, lx, 0.006, back - face * (DOCK + 2.4), 0.45 * face, -Math.PI / 2, null);
      }
      for (let x = x0; x <= x1 + 0.1; x += w / 2) box(0.3, 3.5, 0.25, M.pillar, x, 1.75, front + face * 0.1, { collide: false });
    }
    for (const d of defs.filter((u) => u.row === row)) makeUnit(d);
  }

  function makeUnit(d) {
    const { x, front, face, w } = d;
    const ry = face === 1 ? 0 : Math.PI;
    sign(d.id, w - 0.4, 0.8, x, 3.85, front + face * 0.03, ry);
    box(w - 0.2, 0.3, 0.35, M.metal, x, 3.2, front + face * 0.15, { collide: false });
    plane(w - 0.4, 3.0, interiors[d.kind], x, 1.5, front + face * 0.02, ry, 0, null);
    const unit = { id: d.id, x, front, face, name: d.name, kind: d.kind, roll: d.open ? 1 : 0, target: d.open ? 1 : 0, cortina: null };
    if (!d.open) {
      const cortina = plane(w - 0.4, 3.0, cortinas[(d.row.charCodeAt(0) + Number(d.id.split('-')[1])) % cortinas.length], x, 1.5, front + face * 0.06, ry);
      applyRoll(unit, cortina);
      if (d.key) unit.cortina = cortina;
    }
    refs.units[d.id] = unit;
    if (d.open && !d.key) {
      const stacked = T.rand() < 0.5;
      const props = stacked ? sackStack(4) : crate(['#d32f2f', '#7cb342', '#fbc02d'][Math.floor(T.rand() * 3)]);
      props.position.set(x + 1.1, 0.18, front + face * 0.7);
      props.userData.footprint = { x: stacked ? 1.3 : 0.6, z: stacked ? 0.42 : 0.4 };
      props.userData.collider = addCollider(x + 1.1, front + face * 0.7, stacked ? 0.65 : 0.3, stacked ? 0.21 : 0.2);
      refs.solid.push(props);
      scene.add(props);
    }
  }

  // Roll-up shutter: shrink toward its housing as `roll` goes 0 → 1.
  function applyRoll(u, mesh = u.cortina) {
    if (!mesh) return;
    mesh.scale.y = Math.max(0.001, 1 - u.roll);
    mesh.position.y = 3 - 1.5 * (1 - u.roll);
  }

  // --- Trucks on the andenes ------------------------------------------------
  // Street that serves a row's loading dock: the one behind it.
  function truckStreet(row) {
    const nave = Math.floor(LETTERS.indexOf(row) / 2);
    return streetZ(ROW_FACE[row] === 1 ? nave : nave + 1);
  }

  function place(obj, x, z, ry, hx, hz, key = false) {
    obj.position.x = x;
    obj.position.z = z;
    obj.rotation.y = ry;
    const size = localSize(obj);
    obj.userData.footprint = { x: size.x, z: size.z };
    scene.add(obj);
    obj.userData.collider = addCollider(x, z, hx, hz, ry);
    refs.solid.push(obj);
    if (key) obj.userData.key = true;
    return obj;
  }

  function parkTruck(row, x, color, cargo, { key = false } = {}) {
    return place(makeTruck(color, cargo), x, truckStreet(row), 0.45, 1.1, 2.7, key);
  }

  for (const [key, [row, x, color]] of Object.entries(KEY_TRUCKS)) refs.trucks[key] = parkTruck(row, x, color, true, { key: true });

  // Ambient trucks, kept clear of the scripted bays.
  const reserved = Object.values(KEY_TRUCKS).map(([row, x]) => [truckStreet(row), x]);
  for (let s = 0; s <= 13; s++) {
    for (const x of [-60, -40, -14, 14, 40, 60]) {
      if (reserved.some(([z, rx]) => z === streetZ(s) && Math.abs(rx - x) < 8)) continue;
      if (T.rand() < 0.32) place(makeTruck([0xd9d4c7, 0xb3261e, 0x2459a8, 0x3b7d3a, 0xe0a526][Math.floor(T.rand() * 5)], T.rand() < 0.6), x, streetZ(s), 0.45, 1.1, 2.7);
    }
  }

  // --- Seller's bodega fixtures --------------------------------------------
  const sellerX = unitAt('B-4').x, bFront = ROWS.B, bFace = ROW_FACE.B;
  refs.sellerCounter = box(1.6, 0.95, 0.6, M.wood, sellerX, 0.66, bFront + bFace * 1.6, { bevel: 0.04 });
  refs.sellerLamp = light(sellerX, 2.4, bFront + bFace * 2.2, 0xffd7a0, 10, 7);
  refs.scale = [
    box(0.4, 0.12, 0.3, M.metal, sellerX + 0.6, 1.2, bFront + bFace * 1.6, { collide: false }),
    box(0.16, 0.12, 0.04, glowMat({ color: 0xe8f0d0 }, 0x222222), sellerX + 0.6, 1.32, bFront + bFace * 1.45, { collide: false, tile: 0 }),
  ];
  refs.pallets = [sellerX - 1.8, sellerX + 1.8, sellerX + 3.0].map((x) => ({
    mesh: box(0.9, 0.12, 0.7, M.wood, x, 0.24, bFront + bFace * 0.7, { collide: false }),
    x,
    z: bFront + bFace * 0.7,
  }));

  // Empty frame over the seller's counter where the diablero hangs the pancarta.
  const pancartaDrop = new THREE.Group();
  pancartaDrop.position.set(sellerX, 1.35, bFront + bFace * 1.95);
  pancartaDrop.add(hitbox(1.2, 0.8, 0.4, 0, 0, 0));
  const emptyBoard = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7), basic({ color: 0x222222 }));
  pancartaDrop.add(emptyBoard);
  const frameMat = lam({ color: 0x6b4f36 });
  for (const [w, h, x, y] of [[1.2, 0.08, 0, 0.38], [1.2, 0.08, 0, -0.38], [0.08, 0.78, -0.56, 0], [0.08, 0.78, 0.56, 0]]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), frameMat);
    bar.position.set(x, y, 0.06);
    pancartaDrop.add(bar);
  }
  const pancartaPlaced = makePancarta();
  pancartaPlaced.position.set(0, -0.4, 0.03);
  pancartaPlaced.scale.setScalar(1.3);
  pancartaPlaced.visible = false;
  pancartaDrop.add(pancartaPlaced);
  scene.add(pancartaDrop);
  refs.pancartaDrop = pancartaDrop;
  refs.pancartaPlaced = pancartaPlaced;

  // Rotulista stand: Pasillo 3, local 3, deep in the market so the pancarta run is a real one.
  const rotX = 2.2, rotZ = aisleZ(6);
  refs.rotulista = {};
  refs.rotulista.stand = place(box(0.9, 0.9, 1.8, M.wood, rotX, 0.45, rotZ, { collide: false, bevel: 0.04 }), rotX, rotZ, 0, 0.45, 0.9);
  box(0.95, 0.06, 1.85, M.wood, rotX, 0.93, rotZ, { collide: false, bevel: 0.02 });
  refs.rotulista.sign = sign('rotulista', 1.8, 0.55, rotX - 0.48, 2.1, rotZ, -Math.PI / 2);
  const pickup = new THREE.Group();
  pickup.position.set(rotX - 0.55, 0.6, rotZ);
  pickup.rotation.y = -Math.PI / 2;
  refs.rotulista.pancarta = makePancarta();
  pickup.add(refs.rotulista.pancarta);
  pickup.add(hitbox(0.6, 0.9, 1.3, 0, 0.45, 0));
  scene.add(pickup);
  refs.rotulista.pickup = pickup;

  // Vendor counters for the consumer's shopping list, sack piles for the diablero's pickups.
  for (const id of ['B-2', 'A-8', 'C-5']) {
    const { x, z, face } = unitAt(id);
    refs.counters[id] = box(1.8, 0.9, 0.5, M.wood, x, 0.63, z + face * 1.3, { bevel: 0.04 });
  }
  for (const id of ['A-3', 'C-9', 'B-11']) {
    const { x, z, face } = unitAt(id);
    const pile = sackStack(6);
    pile.position.set(x + 0.9, 0.18, z + face * 0.8);
    // The stack has seams between its columns; an invisible box keeps the prompt easy to hit.
    pile.add(hitbox(1.4, 1.1, 0.7, 0, 0.55, 0));
    pile.userData.footprint = { x: 1.3, z: 0.42 };
    scene.add(pile);
    pile.userData.collider = addCollider(pile.position.x, pile.position.z, 0.65, 0.21);
    refs.solid.push(pile);
    refs.pickups[id] = pile;
  }

  // --- Plaza: market stalls along the main pasillo --------------------------
  const lonas = ['#e4007c', '#1e6fd9', '#ff7a00', '#2bb673'];
  const stallSpots = [[-3, 62, 0.1], [3, 68, -0.2], [-3, 74, 0.05], [3, 80, 0.3], [-3, 86, -0.1], [3, 92, 0.2], [-3, 100, 0], [3, 106, -0.25]];
  stallSpots.forEach(([x, z, ry], i) => {
    const stall = makeStall(lonas[i % lonas.length]);
    // Bottles of agua and refresco on the produce tray.
    for (const [bx, bz, kind] of [[-0.72, -0.18, 0], [-0.18, 0.22, 1], [0.42, -0.12, 0]]) {
      const bt = PK.bottle(kind);
      bt.position.set(bx, 0.82, bz);
      bt.rotation.y = bx * 4 + bz * 2;
      stall.add(bt);
    }
    place(stall, x, z, ry, 1.5, 1.3);
  });
  const taco = makeStall('#f2c230');
  for (const [bx, bz, kind] of [[-0.6, -0.15, 1], [0.1, 0.2, 0], [0.6, -0.1, 0]]) {
    const bt = PK.bottle(kind);
    bt.position.set(bx, 0.82, bz);
    taco.add(bt);
  }
  place(taco, 8, 56, 0, 1.5, 1.3);
  plane(2.2, 0.5, glowMat({ map: T.signTex('TACOS DE CANASTA', '#f2c230', '#7a1f1f', 128, 24) }, 0x2a2410), 8, 2.15, 54.9, Math.PI, 0, null);

  // Mercury pole lamps over the andenes.
  const poleMat = glowMat({ color: 0xdfe8ff }, 0x1d1d22);
  for (let s = 0; s <= 13; s++) {
    for (const x of [-60, 60]) {
      box(0.2, 6, 0.2, M.metal, x, 3, streetZ(s));
      box(0.8, 0.15, 0.4, poleMat, x, 6, streetZ(s), { collide: false, tile: 0 });
      refs.lamps.push(light(x, 5.8, streetZ(s), 0xd8e4ff, 52, 28));
    }
  }

  // Ambient clutter: trash piles and parked diablitos.
  for (const [x, z, ry] of [[-34, -20, 0.3], [34, 20, -0.5], [-2, 40, 1], [26, 66, 0.2], [-36, 120, 0.7], [-24, 176, 0.4], [11, 208, -0.3], [44, 260, 0.1], [-50, 300, 0.5]]) {
    const pile = trashPile();
    place(pile, x, z, ry, 0.6, 0.5);
  }
  for (const [x, z, ry] of [[-6.5, -16, 0.3], [16, 30, -0.4], [-22, 150, 0.2], [24, 214, 0.1], [-48, 244, -0.2], [40, 322, 0.3]]) {
    const d = makeDiablito();
    d.position.set(x, 0.18, z);
    d.rotation.set(-0.35, ry, 0);
    d.userData.footprint = { x: 0.8, z: 0.55 };
    scene.add(d);
    d.userData.collider = addCollider(x, z, 0.35, 0.4, ry);
    refs.solid.push(d);
  }
  refs.diablito = makeDiablito();
  refs.diablito.position.set(SPAWN[0] + 4, 0, SPAWN[1] + 4);
  refs.diablito.rotation.set(-0.3, -0.4, 0);
  refs.diablito.add(hitbox(0.6, 1.3, 0.5, 0, 0.65, 0));
  refs.diablito.userData.footprint = { x: 0.8, z: 0.55 };
  scene.add(refs.diablito);
  refs.diablito.userData.collider = addCollider(SPAWN[0] + 4, SPAWN[1] + 4, 0.35, 0.4, -0.4);
  refs.solid.push(refs.diablito);

  // --- Prop-kit clutter -------------------------------------------------------
  // Spots the clutter must never sit on: the beer fire, the rotulista pickup, every
  // possible shrine, the spawn and the seller's counter lane.
  const keepClear = [FIRE_SPOT, [2.2, aisleZ(6)], SPAWN, [unitAt('B-4').x, ROWS.B + ROW_FACE.B * 2.2]];
  const nearKeep = (x, z, r) => keepClear.some(([kx, kz]) => Math.hypot(x - kx, z - kz) < r)
    || SHRINE_SPOTS.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < r + 1);
  const clutterProp = (make, x, z, ry = 0) => {
    const prop = make();
    prop.position.set(x, 0, z);
    prop.rotation.y = ry;
    const size = localSize(prop);
    scene.add(prop);
    prop.userData.footprint = { x: size.x, z: size.z };
    prop.userData.collider = addCollider(x, z, size.x / 2, size.z / 2, ry);
    refs.solid.push(prop);
    return prop;
  };
  const goods = [
    () => PK.bucket([0x2e6fd9, 0xd94f3d, 0x3b7d3a][Math.floor(T.rand() * 3)]),
    () => PK.box(0.45 + T.rand() * 0.2, 0.28 + T.rand() * 0.15, 0.38 + T.rand() * 0.08),
    () => PK.crateSlats(0.5 + T.rand() * 0.15, 0.38 + T.rand() * 0.08, 0.28 + T.rand() * 0.1),
    () => PK.plasticCrate(0.48 + T.rand() * 0.1, 0.34, 0.3, [0x2e6fd9, 0xd94f3d, 0x3b7d3a][Math.floor(T.rand() * 3)]),
    () => PK.sack(0.42 + T.rand() * 0.15),
  ];
  // Goods piled against the closed shutters (open units already carry a sack stack or crate).
  for (const d of defs) {
    if (d.key || d.open || T.rand() > 0.16) continue;
    const x = d.x + (T.rand() - 0.5) * d.w * 0.45;
    const z = d.front + d.face * 0.5;
    if (nearKeep(x, z, 3.2)) continue;
    clutterProp(goods[Math.floor(T.rand() * goods.length)], x, z, (T.rand() - 0.5) * 0.7);
  }
  // Dock aprons behind the bodegas: stacked crates, tyres, sacks and tarp piles.
  const apronProps = [
    () => { const g = new THREE.Group(); for (const y of [0, 0.325]) { const c = PK.crateSlats(0.55, 0.42, 0.32); c.position.y = y; g.add(c); } return g; },
    () => { const g = new THREE.Group(); for (const [i, y] of [[0, 0], [1, 0.35]]) { const c = PK.plasticCrate(0.5, 0.36, 0.32, [0x2e6fd9, 0xd94f3d][i]); c.position.y = y; g.add(c); } return g; },
    () => { const g = new THREE.Group(); const t = PK.tire(); g.add(t); const t2 = PK.tire(); t2.position.y = 0.16; t2.rotation.y = 0.4; g.add(t2); return g; },
    () => PK.tarpPile(1.2 + T.rand() * 0.4, 0.85, 0.55 + T.rand() * 0.2, [0x4a5f8a, 0x3f6b4f, 0x6b4a3a][Math.floor(T.rand() * 3)]),
    () => { const g = new THREE.Group(); const s = PK.sack(0.55); g.add(s); const s2 = PK.sack(0.5); s2.position.set(0.3, 0, 0.15); s2.rotation.y = 0.5; g.add(s2); return g; },
    () => { const g = new THREE.Group(); const b = PK.box(0.55, 0.36, 0.45, { open: T.rand() < 0.5 }); g.add(b); const b2 = PK.box(0.5, 0.32, 0.42); b2.position.y = 0.36; b2.rotation.y = 0.3; g.add(b2); return g; },
    () => PK.bucket([0x2e6fd9, 0xd94f3d, 0x3b7d3a][Math.floor(T.rand() * 3)]),
  ];
  for (const row of LETTERS) {
    const front = ROWS[row], face = ROW_FACE[row];
    const back = front - face * DEPTH;
    for (const [x0, x1] of SEGMENTS) {
      if (T.rand() > 0.13) continue;
      const x = (x0 + x1) / 2 + (T.rand() - 0.5) * (x1 - x0) * 0.55;
      const z = back - face * (DOCK * 0.55);
      if (nearKeep(x, z, 3.5)) continue;
      clutterProp(apronProps[Math.floor(T.rand() * apronProps.length)], x, z, T.rand() * Math.PI);
    }
  }
  // Chain-link infill on the bridge rails and broken runs along the perimeter walls.
  for (const s of [-1, 1]) {
    const f = PK.fence(BRIDGE.hz * 2 - 0.3, 1.25);
    f.position.set(BRIDGE.x + s * (BRIDGE.hx - 0.06), 0.32, BRIDGE.z);
    f.rotation.y = Math.PI / 2;
    scene.add(f);
  }
  for (let z = -4; z < 352; z += 20) {
    for (const x of [-70.9, 70.9]) {
      if (T.rand() < 0.28) continue;
      const f = PK.fence(4, 2);
      f.position.set(x, 0, z + (T.rand() - 0.5) * 4);
      f.rotation.y = Math.PI / 2;
      scene.add(f);
    }
  }

  // --- Bridge over pasillo 2: the diableros' catapult ----------------------
  const bridge = BRIDGE;
  box(bridge.hx * 2, 0.3, bridge.hz * 2, M.metal, bridge.x, 0.15, bridge.z, { collide: false });
  for (const s of [-1, 1]) {
    const rx = bridge.x + s * bridge.hx;
    box(0.16, 1.15, bridge.hz * 2, M.pillar, rx, 0.85, bridge.z, { collide: false });
    for (let dz = -bridge.hz; dz <= bridge.hz; dz += 2) box(0.2, 1.3, 0.2, M.pillar, rx, 0.95, bridge.z + dz, { collide: false });
    box(0.2, 0.14, bridge.hz * 2, M.hazard, rx, 1.55, bridge.z, { collide: false, tile: 0.3 });
  }
  for (const s of [-1, 1]) {
    plane(bridge.hx * 2, 0.18, M.hazard, bridge.x, 0.31, bridge.z + s * bridge.hz, 0, 0, [1, 1 / 0.18]);
    sign('puente', 2.8, 0.55, bridge.x, 2.7, bridge.z + s * (bridge.hz + 0.2), s === 1 ? 0 : Math.PI);
  }

  // --- Perimeter, Eje 5 Sur gate, Eje 6 Sur --------------------------------
  box(41, 3, 0.4, M.boundary, -51.5, 1.5, NORTH_Z, { occlude: true });
  box(51, 3, 0.4, M.boundary, 46.5, 1.5, NORTH_Z, { occlude: true });
  box(0.4, 3, 378, M.boundary, -72.2, 1.5, 167, { occlude: true });
  box(0.4, 3, 378, M.boundary, 72.2, 1.5, 167, { occlude: true });
  box(144.8, 3, 0.4, M.boundary, 0, 1.5, SOUTH_Z, { occlude: true });
  for (const x of [-31.3, -20.7]) box(0.6, 4.6, 0.6, M.pillar, x, 2.3, NORTH_Z, { bevel: 0.04 });
  plane(9.5, 0.9, glowMat({ map: T.signTex('CENTRAL DE ABASTO · EJE 5 SUR', '#1f4fa3', '#ffffff', 256, 32) }, 0x0e1626), -26, 4.75, NORTH_Z + 0.3, 0, 0, null);
  plane(9, 0.7, lam({ map: T.signTex('ABARROTES Y VÍVERES · LADO A', '#1f4fa3', '#ffffff', 256, 24) }), 0, 2.4, SOUTH_Z - 0.3, Math.PI, 0, null);
  plane(4, 0.6, lam({ map: T.signTex('EJE 4 OTE. →', '#ffffff', '#1f4fa3', 128, 24) }), -72.05, 2.2, 166, Math.PI / 2, 0, null);

  plane(150, 14, M.concrete, -26, 0.004, NORTH_Z - 7.4, 0, -Math.PI / 2);
  for (let x = -40; x < 40; x += 4) plane(2, 0.15, basic({ color: 0xd8d8d0 }), x - 26, 0.006, NORTH_Z - 12.5, 0, -Math.PI / 2, null);
  for (const x of [-42, -10]) {
    box(0.18, 6, 0.18, M.metal, x, 3, NORTH_Z - 5);
    light(x, 5.6, NORTH_Z - 5.4, 0xffb36b, 30, 24, false);
  }
  b.addBounds(-46, -6, NORTH_Z - 14, NORTH_Z - 13.6);
  b.addBounds(-46.4, -46, NORTH_Z - 14, NORTH_Z);
  b.addBounds(-6, -5.6, NORTH_Z - 14, NORTH_Z);

  // Spawn-corridor practicals: a pair of warm bulbs just inside the gate so the first
  // andador reads on arrival instead of dropping into black.
  for (const x of [-36, -16]) {
    box(0.5, 0.1, 0.9, lampMat, x, 3.9, -12, { collide: false, tile: 0 });
    refs.lamps.push(light(x, 3.7, -12, 0xffbf73, 40, 24));
  }

  // Emergency lights stay on through the blackout.
  light(-26, 4, NORTH_Z + 2, 0xff3020, 6, 14, false);
  light(0, 4.3, 56, 0xff3020, 3, 12, false);

  b.updateLights({ x: SPAWN[0], z: SPAWN[1] });
  const batched = batchWorld(scene, refs, { occluders: b.occluders, skip: [refs.solid] });
  b.occluders.length = 0;
  b.occluders.push(...batched.occluders);

  return Object.assign(b, {
    refs,
    cameras: [],
    fog: [0x191540, 9, 60],
    update(dt, movers) {
      for (const u of Object.values(refs.units)) {
        if (u.roll === u.target) continue;
        u.roll = THREE.MathUtils.clamp(u.roll + Math.sign(u.target - u.roll) * dt * 0.7, 0, 1);
        applyRoll(u);
      }
      if (this.powered) for (const l of refs.lamps) l.intensity = Math.random() < 0.004 ? 2 : l.userData.base;
      this.updateLights(movers?.[0]);
    },
  });
}
