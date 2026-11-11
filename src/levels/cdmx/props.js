import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { lam, basic, phong } from '../../engine/post.js';
import * as T from '../../engine/textures.js';
import { bakeAO } from '../../world/builder.js';
import { NPC } from '../../world/person.js';
import * as PK from '../../world/propkit.js';
import { building, parkedCar, signPlane } from './buildings.js';

const PI = Math.PI;
/*
 * Shared flat materials for repeated dressing — one material per look, not per mesh, so
 * batchWorld folds the whole set into a handful of draw calls.
 */
const BASIC = {
  dark: basic({ color: 0x0a0c18 }),
  curbLine: basic({ color: 0xd9c23a }),
  glass: basic({ color: 0x9fc8e8, transparent: true, opacity: 0.13, depthWrite: false }),
  glowWarm: basic({ color: 0xffd9a0 }),
  glowCool: basic({ color: 0x9a8aff }),
  tail: basic({ color: 0xff2a22 }),
  strip: basic({ color: 0xd8e4ff }),
  stripCore: basic({ color: 0xeaf0ff }),
};
const add = (b, geo, mat, x, y, z, { parent = b.scene, ry = 0, rx = 0, rz = 0 } = {}) => {
  // Solids get baked AO; flat planes stay white so signs, windows and decals are unaffected.
  if (geo.type === 'PlaneGeometry' || geo.type === 'CircleGeometry') {
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
// A group parked at a set origin so set-local coordinates stay readable.
const grp = (b, x, z) => {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  b.scene.add(g);
  return g;
};
const world = (G, x, y, z) => [G.position.x + x, y, G.position.z + z];

// A ground plane with a white vertex-colour fill so vertexColors materials don't render black.
const flat = (w, d, mat, x, y, z, ry = 0) => {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-PI / 2);
  const n = g.attributes.position.count;
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  return m;
};

// A cylinder stretched between two points — lattice members, braces, antenna masts.
const strut = (b, mat, a, c, r, parent, seg = 5) => {
  const A = new THREE.Vector3(...a), C = new THREE.Vector3(...c);
  const dir = C.clone().sub(A);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(r * 0.7, r, len, seg);
  bakeAO(geo);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(A).add(C).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  parent.add(mesh);
  return mesh;
};

// The 'LATINOAMERICANA' band shares one texture+material between the hero tower and the
// park's distant silhouette so they merge into a single draw call.
let towerSignMatShared = null;
const towerSignMat = () => {
  if (!towerSignMatShared) towerSignMatShared = basic({ map: T.towerSignTex() });
  return towerSignMatShared;
};

/*
 * A warm cone of light, faking the volume of a sodium lamp. Additive blending runs before the
 * post pass lifts the image by 1/2.2, so the opacity has to stay very low or the cone reads as
 * a solid tan pyramid.
 */
export const lightCone = (b, x, y, z, color = 0xffb066, h = 4.5, r = 1.4) => {
  const cone = PK.shaftCone(color, h, r, 0.03);
  cone.position.set(x, y - h / 2, z);
  b.scene.add(cone);
  return cone;
};

/*
 * Ground glow decals (light pools, violet sheen under the book). Transparent materials are
 * never merged by batchWorld, so every decal would cost a draw call — instead sets queue
 * specs here and `flushDecals` merges them into one mesh per colour, like wetGround does.
 */
const decalQueue = [];
const queueDecal = (b, color, x, y, z, w, d, opacity = 0.2, ry = 0) => {
  decalQueue.push({ color, x, y, z, w, d, opacity, ry });
};
export const flushDecals = (b) => {
  const byMat = new Map();
  for (const d of decalQueue) {
    const key = `${d.color}|${d.opacity}`;
    if (!byMat.has(key)) {
      byMat.set(key, {
        mat: basic({
          map: T.haloTex(), color: d.color, transparent: true, opacity: d.opacity,
          depthWrite: false, blending: THREE.AdditiveBlending,
        }),
        geos: [],
      });
    }
    const g = new THREE.PlaneGeometry(d.w, d.d);
    g.rotateX(-PI / 2);
    g.rotateY(d.ry);
    g.translate(d.x, d.y, d.z);
    byMat.get(key).geos.push(g);
  }
  decalQueue.length = 0;
  for (const { mat, geos } of byMat.values()) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const m = new THREE.Mesh(merged, mat);
    m.renderOrder = 2;
    b.scene.add(m);
  }
};

/* ------------------------------------------------------------------ */
/* Set 1 — Ángel de la Independencia (plaza at the origin)             */
/* ------------------------------------------------------------------ */

// One gold feather: a curved blade lying in the XY plane, base at the origin, tip at +x.
const featherGeo = (len, wid, bend = 0.25) => {
  const g = new THREE.PlaneGeometry(len, wid, 7, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + len / 2;          // 0..len along the blade
    const t = Math.min(1, Math.max(0, x / len));
    // Clamp the sine: float dust can push it a hair negative and pow(neg, 0.72) is NaN.
    const prof = Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, t * 1.04))), 0.72); // pointed base+tip
    p.setY(i, p.getY(i) * prof);
    p.setZ(i, bend * t * t * len * 0.35);
    p.setX(i, x);
  }
  g.computeVertexNormals();
  return g;
};

// A short run of torus links — the broken chain in the statue's lowered hand.
const chainLinks = (b, mat, x, y, z, parent, n = 6, drop = 0.9) => {
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const link = add(b, new THREE.TorusGeometry(0.055, 0.02, 5, 8), mat,
      x + Math.sin(t * 2.2) * 0.1, y - t * drop, z + Math.cos(t * 1.7) * 0.08,
      { parent, rx: i % 2 ? PI / 2 : 0, ry: i % 2 ? 0.4 : 0.9 });
    link.scale.setScalar(1 - t * 0.15);
  }
};

/*
 * The gilded Victory: robes, two feathered wings, a raised wreath arm and a lowered arm
 * trailing a broken chain. Sculpted from primitives in gold phong so it catches the warm
 * uplights — the reference's hottest, most saturated object in the frame.
 */
export function angelStatue(b, M) {
  const G = grp(b, 0, 0);
  const P = (geo, mat, x, y, z, opts = {}) => add(b, geo, mat, x, y, z, { ...opts, parent: G });
  const gold = M.gold, goldHi = M.goldHi, goldDark = M.goldDark, stone = M.stone;

  // --- Plinth: three steps, then the column with a fluted shaft and capital. ---
  P(new THREE.BoxGeometry(9, 0.7, 9), stone, 0, 0.35, 0);
  P(new THREE.BoxGeometry(7.2, 0.7, 7.2), stone, 0, 1.05, 0);
  P(new THREE.BoxGeometry(5.6, 1.1, 5.6), stone, 0, 2.05, 0);
  // Ornate dark panel/door on the plinth face with a gold frame.
  P(new THREE.BoxGeometry(1.7, 2.3, 0.18), goldDark, 0, 1.9, 2.82);
  P(new THREE.BoxGeometry(2.1, 0.16, 0.2), goldHi, 0, 3.15, 2.83, { collide: false });
  P(new THREE.BoxGeometry(2.1, 0.16, 0.2), goldHi, 0, 0.7, 2.83, { collide: false });
  P(new THREE.BoxGeometry(0.16, 2.6, 0.2), goldHi, -1.05, 1.9, 2.83, { collide: false });
  P(new THREE.BoxGeometry(0.16, 2.6, 0.2), goldHi, 1.05, 1.9, 2.83, { collide: false });
  // Fluted column: cylinder whose radius ripples 14 times around the axis.
  const shaft = new THREE.CylinderGeometry(1.05, 1.25, 5.6, 24, 1);
  {
    const pos = shaft.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const r = Math.hypot(x, z);
      if (r > 0.01) {
        const a = Math.atan2(z, x);
        const k = 1 + 0.07 * Math.cos(a * 14);
        pos.setX(i, x * k);
        pos.setZ(i, z * k);
      }
    }
    shaft.computeVertexNormals();
  }
  P(shaft, stone, 0, 5.1, 0);
  // Capital: stepped mouldings the statue stands on.
  P(new THREE.BoxGeometry(3.4, 0.55, 3.4), stone, 0, 8.05, 0);
  P(new THREE.CylinderGeometry(1.9, 1.5, 0.5, 12), stone, 0, 8.55, 0);
  P(new THREE.BoxGeometry(4.0, 0.4, 4.0), stone, 0, 8.95, 0);

  // --- The figure, feet on a gilded ball at y≈9.4. ---
  const fig = new THREE.Group();
  fig.position.set(0, 9.35, 0);
  G.add(fig);
  const F = (geo, mat, x, y, z, opts = {}) => add(b, geo, mat, x, y, z, { ...opts, parent: fig });

  F(new THREE.SphereGeometry(0.4, 10, 8), goldHi, 0, 0.18, 0.05);          // the ball
  // Robes: lathe skirt flaring to the hem, swept back by the wind.
  const robePts = [
    [0.14, 0.1], [0.34, 0.5], [0.6, 1.5], [0.86, 2.6], [1.02, 3.5], [1.06, 3.9],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const robe = new THREE.LatheGeometry(robePts, 14);
  {
    const pos = robe.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = Math.min(1, Math.max(0, y / 3.9));
      pos.setZ(i, pos.getZ(i) - t * t * 0.75);   // hem trails backward
      pos.setX(i, pos.getX(i) * (1 + t * 0.06));
    }
    robe.computeVertexNormals();
  }
  F(robe, gold, 0, 0.32, 0);
  // Torso, shoulders, neck and head.
  F(new THREE.CylinderGeometry(0.3, 0.42, 1.5, 10), gold, 0, 4.6, 0.05);
  F(new THREE.SphereGeometry(0.52, 10, 8), gold, 0, 5.6, 0.02).scale.set(1.35, 0.72, 0.95);
  F(new THREE.CylinderGeometry(0.13, 0.16, 0.5, 8), gold, 0, 6.15, 0.03);
  const head = F(new THREE.SphereGeometry(0.34, 12, 10), goldHi, 0, 6.62, 0.06);
  head.scale.set(0.9, 1.12, 0.95);
  head.rotation.x = -0.18;                                            // face lifted to the sky
  F(new THREE.TorusGeometry(0.3, 0.045, 6, 14), goldDark, 0, 6.86, 0.05, { rx: PI / 2 - 0.2 }); // laurel circlet
  // Flowing collar behind the neck.
  const collar = F(new THREE.ConeGeometry(0.62, 0.9, 10, 1, true), gold, 0, 6.0, -0.28);
  collar.rotation.x = 0.5;

  // --- Wings: arm bones plus three rows of feathers each, swept up and outward. ---
  const wing = (s) => {
    const W = new THREE.Group();
    W.position.set(s * 0.34, 5.9, -0.12);
    W.rotation.set(-0.12, s * -0.28, s * 0.62);   // up, back, out
    fig.add(W);
    const WP = (geo, mat, x, y, z, opts = {}) => add(b, geo, mat, x, y, z, { ...opts, parent: W });
    // Two arm segments per wing.
    WP(new THREE.BoxGeometry(2.1, 0.22, 0.1), gold, s * 1.05, 0.42, 0, { rz: s * -0.5 });
    WP(new THREE.BoxGeometry(1.7, 0.16, 0.09), gold, s * 1.95, 1.02, -0.02, { rz: s * -0.28 });
    // Feather rows: long primaries on top, shorter secondaries below, covert at the shoulder.
    const rows = [
      { n: 7, len: 2.3, wid: 0.42, base: [1.15, 1.32], spread: 0.9, dy: 0.1 },
      { n: 6, len: 1.75, wid: 0.38, base: [1.35, 0.86], spread: 0.75, dy: -0.06 },
      { n: 5, len: 1.25, wid: 0.34, base: [1.1, 0.45], spread: 0.6, dy: -0.12 },
      { n: 4, len: 0.8, wid: 0.3, base: [0.55, 0.1], spread: 0.5, dy: -0.05 },
    ];
    for (const r of rows) {
      for (let i = 0; i < r.n; i++) {
        const t = r.n === 1 ? 0.5 : i / (r.n - 1);
        const f = WP(featherGeo(r.len * (0.85 + 0.3 * Math.sin(t * PI)), r.wid), goldHi,
          s * (r.base[0] - t * 0.55), r.base[1] + (t - 0.5) * r.spread + r.dy, -0.03,
          { rz: s * -(0.55 - t * 1.15), ry: s * 0.12 });
        f.scale.z = 1;
      }
    }
  };
  wing(-1); wing(1);

  // --- Arms: raised wreath arm (screen upper-right) and lowered chain arm. ---
  // Raised arm: two segments up and out, hand gripping a laurel wreath.
  const armR = new THREE.Group();
  armR.position.set(0.42, 5.75, 0.05);
  armR.rotation.set(0, 0, -0.9);
  fig.add(armR);
  const AR = (geo, mat, x, y, z, opts = {}) => add(b, geo, mat, x, y, z, { ...opts, parent: armR });
  AR(new THREE.CylinderGeometry(0.11, 0.13, 1.15, 8), gold, 0.5, 0.55, 0, { rz: 0.35 });
  const fore = new THREE.Group();
  fore.position.set(1.0, 1.05, 0);
  fore.rotation.z = -0.5;
  armR.add(fore);
  add(b, new THREE.CylinderGeometry(0.09, 0.11, 1.0, 8), gold, 0.42, 0.5, 0, { parent: fore, rz: 0.4 });
  // Wreath: torus + leaf nubs, tilted toward the sky.
  const wreath = new THREE.Group();
  wreath.position.set(0.95, 1.05, 0.1);
  fore.add(wreath);
  add(b, new THREE.TorusGeometry(0.34, 0.06, 6, 14), goldHi, 0, 0, 0, { parent: wreath, rx: 0.5, ry: 0.4 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2;
    add(b, featherGeo(0.34, 0.14, 0.1), goldHi,
      Math.cos(a) * 0.34, Math.sin(a) * 0.34, 0.03,
      { parent: wreath, rz: a - PI / 2, ry: 0.4 });
  }
  add(b, new THREE.SphereGeometry(0.11, 8, 6), goldHi, 0.95, 1.0, 0.05, { parent: fore });

  // Lowered arm trailing the broken chain.
  const armL = new THREE.Group();
  armL.position.set(-0.42, 5.7, 0.02);
  armL.rotation.set(0.25, 0, 0.85);
  fig.add(armL);
  add(b, new THREE.CylinderGeometry(0.11, 0.13, 1.2, 8), gold, -0.5, -0.5, -0.15, { parent: armL, rz: -0.4 });
  const handL = new THREE.Group();
  handL.position.set(-1.0, -1.05, -0.3);
  armL.add(handL);
  add(b, new THREE.SphereGeometry(0.11, 8, 6), goldHi, 0, 0, 0, { parent: handL });
  chainLinks(b, goldDark, 0.05, -0.15, 0.05, handL, 6, 1.0);

  // --- Lighting: hot uplight at the feet, warm crown light, cool back fill. ---
  b.light(0, 2.2, 4.5, 0xffb066, 30, 26);
  b.light(0, 9.5, 3.5, 0xffd9a0, 16, 18);
  b.light(-5, 11, -4, 0x8a76ff, 14, 26);
  b.light(4, 1.6, -5, 0x9a7cff, 10, 22);
  lightCone(b, 0, 3.2, 3.4, 0xffb066, 6, 2.0);
  return { statue: fig };
}

// Glass towers behind the statue: cool curtain-wall grids plus one striped mid slab.
export function angelTowers(b, M) {
  const G = grp(b, 0, 0);
  const P = (geo, mat, x, y, z, opts = {}) => add(b, geo, mat, x, y, z, { ...opts, parent: G });
  const tower = (x, z, w, d, h, tex, ry = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    // Repeat the window texture per ~3m of face so cells stay window-sized.
    const uv = g.attributes.uv;
    const su = Math.max(1, Math.round(w / 9)), sv = Math.max(1, Math.round(h / 22));
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    P(g, basic({ map: tex }), x, h / 2, z, { ry });
    // Dark roof cap.
    P(new THREE.BoxGeometry(w * 0.7, 1.2, d * 0.7), M.dark, x, h + 0.6, z, { ry });
  };
  // Right near tower — tall, cool blue/teal grid.
  tower(24, -38, 17, 17, 74, T.glassTowerTex('#7fd0e8', 9, 24));
  // Mid tower with thin horizontal stripes.
  tower(14, -56, 13, 13, 50, T.stripeTowerTex());
  // Left near tower — warm amber grid.
  tower(-20, -40, 15, 15, 60, T.glassTowerTex('#ffcf9a', 8, 20));
  // Smaller grey blocks scattered behind.
  const darkGlass = basic({ map: T.glassTowerTex('#5a7ab0', 6, 14) });
  for (const [x, z, w, h] of [[-38, -62, 14, 34], [-8, -72, 16, 42], [40, -66, 15, 38], [2, -80, 18, 30], [-52, -40, 12, 28]]) {
    const g = new THREE.BoxGeometry(w, h, w);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 2);
    P(g, darkGlass, x, h / 2, z);
    P(new THREE.BoxGeometry(w * 0.7, 1, w * 0.7), M.dark, x, h + 0.5, z);
  }
  b.light(24, 34, -38, 0x5a7cff, 16, 60);
  b.light(-20, 30, -40, 0xffb060, 14, 55);
  return {};
}

// Cobbled plaza disc with a soft violet glow at the base.
export function angelPlaza(b, M) {
  const G = grp(b, 0, 0);
  const cobble = phong({ map: T.cobbleTex('#5a5470'), shininess: 14, specular: 0x4a3f7a, vertexColors: true });
  const disc = new THREE.CircleGeometry(34, 40);
  disc.rotateX(-PI / 2);
  add(b, disc, cobble, 0, 0.02, 0, { parent: G });
  // Inner paved apron around the plinth.
  const apron = new THREE.CircleGeometry(7.5, 24);
  apron.rotateX(-PI / 2);
  add(b, apron, M.stone, 0, 0.05, 0, { parent: G });
  queueDecal(b, 0x8a6cff, 0, 0.09, 0, 16, 16, 0.16);
  queueDecal(b, 0xffb066, 0, 0.1, 2, 9, 7, 0.14);
  return {};
}

/* ------------------------------------------------------------------ */
/* Set 2 — Metro on an elevated open section                           */
/* ------------------------------------------------------------------ */

// One metro car: rounded orange body, dark under-band, roof vents, lit window band,
// plug doors and bogie hints. Length runs along local X, platform side faces +z.
function metroCar(b, M, G, x0) {
  const P = (geo, mat, x, y, z, opts = {}) => add(b, geo, mat, x0 + x, y, z, { ...opts, parent: G });
  const L = 18.6, W = 2.9;
  // Body: main box + flattened half-cylinder roof for the rounded edge.
  P(new THREE.BoxGeometry(L, 2.35, W), M.orange, 0, 2.35, 0);
  const roof = new THREE.CylinderGeometry(W / 2, W / 2, L, 12, 1, true, 0, PI);
  roof.rotateZ(PI / 2);          // axis -> X (car length), dome up, flat side at y=0
  roof.scale(1, 0.42, 1);
  P(roof, M.orange, 0, 3.5, 0);
  // Dark under-band and roof edge.
  P(new THREE.BoxGeometry(L + 0.1, 0.7, W + 0.12), M.trainDark, 0, 1.25, 0);
  P(new THREE.BoxGeometry(L + 0.15, 0.22, W + 0.15), M.trainDark, 0, 3.62, 0);
  // Louvre vents along the roof edge, both sides.
  for (const s of [-1, 1]) {
    P(new THREE.BoxGeometry(L * 0.8, 0.1, 0.16), BASIC.dark, 0, 3.55, s * (W / 2 - 0.02));
  }
  // Window + door band on both sides: textured planes, one material each.
  const winMat = basic({ map: T.metroWinTex() });
  const doorMat = basic({ map: T.metroDoorTex() });
  for (const s of [-1, 1]) {
    const zf = s * (W / 2 + 0.01);
    let x = -L / 2 + 1.6;
    while (x < L / 2 - 1.4) {
      const isDoor = Math.abs(x % 6.2) < 0.9;
      if (isDoor) {
        P(new THREE.PlaneGeometry(1.5, 1.9), doorMat, x, 2.55, zf, { ry: s > 0 ? 0 : PI });
        x += 2.1;
      } else {
        P(new THREE.PlaneGeometry(1.85, 1.0), winMat, x, 2.7, zf, { ry: s > 0 ? 0 : PI });
        x += 2.7;
      }
    }
  }
  // Bogies: dark boxes and wheel hints under each car.
  for (const bx of [-5.6, 5.6]) {
    P(new THREE.BoxGeometry(3.0, 0.55, 2.4), M.trainDark, bx, 0.72, 0);
    for (const wx of [-1.1, 1.1]) {
      for (const wz of [-0.85, 0.85]) {
        P(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 10), M.tyre, bx + wx, 0.36, wz, { rx: PI / 2 });
      }
    }
  }
  // Gangway bellows at the car ends.
  P(new THREE.BoxGeometry(0.5, 2.0, W - 0.2), M.trainDark, -L / 2 - 0.2, 2.3, 0);
  P(new THREE.BoxGeometry(0.5, 2.0, W - 0.2), M.trainDark, L / 2 + 0.2, 2.3, 0);
  // Headlight on the leading end (+x).
  P(new THREE.SphereGeometry(0.16, 8, 6), BASIC.glowWarm, L / 2 + 0.28, 1.5, 0, { collide: false });
}

export function metroSet(b, M) {
  const G = grp(b, 0, -300);
  const P = (geo, mat, x, y, z, opts = {}) => add(b, geo, mat, x, y, z, { ...opts, parent: G });
  const deckW = 8.5;
  // Track bed (lower) and platform deck, both on the viaduct.
  P(new THREE.BoxGeometry(220, 0.5, 3.6), M.concrete, -20, -1.15, -2.0);
  P(new THREE.BoxGeometry(220, 1.0, deckW), M.concrete, -20, -0.5, 2.2);
  // Platform floor surface (slightly lighter, paved).
  const floorGeo = new THREE.PlaneGeometry(220, deckW - 0.6);
  floorGeo.rotateX(-PI / 2);
  P(floorGeo, M.stationFloor, -20, 0.02, 2.2);
  // Yellow safety line + tactile strip at the platform edge.
  P(new THREE.BoxGeometry(220, 0.05, 0.35), BASIC.curbLine, -20, 0.04, 0.55);
  P(new THREE.BoxGeometry(220, 0.04, 0.5), M.dark, -20, 0.03, 0.95);
  // Parapet wall between platform and track — the foreground element of the shot.
  P(new THREE.BoxGeometry(220, 1.15, 0.28), M.concrete, -20, 0.58, 0.32);
  // Panel seams on the parapet face.
  for (let x = -124; x < 92; x += 6) {
    P(new THREE.BoxGeometry(0.08, 1.1, 0.3), M.dark, x, 0.58, 0.32);
  }
  // Viaduct side girder under the platform edge (the "lower deck" glimpse).
  P(new THREE.BoxGeometry(220, 1.6, 0.5), M.concrete, -20, -1.6, -0.4);
  // Support columns marching into the dark.
  for (let x = -120; x < 90; x += 24) {
    P(new THREE.BoxGeometry(1.4, 6.5, 1.4), M.concrete, x, -4.6, -0.5);
    P(new THREE.BoxGeometry(1.4, 6.5, 1.4), M.concrete, x, -4.6, 3.5);
  }
  // Train: four cars receding toward -x (screen left), dropped onto the track bed.
  const cars = new THREE.Group();
  cars.position.y = -0.92;
  G.add(cars);
  for (const cx of [14, -5, -24, -43]) metroCar(b, M, cars, cx);
  // A second track hint far side + dark tunnel mouth at the far end.
  P(new THREE.BoxGeometry(220, 0.4, 2.6), M.concrete, -20, -1.3, -6.4);
  P(new THREE.BoxGeometry(14, 5.5, 0.8), M.dark, -128, 1.6, -2.5);
  // Platform furniture: a bench and a sign pylon, kept clear of the train sightline.
  P(new THREE.BoxGeometry(3.2, 0.14, 0.7), M.wood, 2, 0.75, 3.6);
  P(new THREE.BoxGeometry(3.2, 0.7, 0.12), M.wood, 2, 1.15, 3.95);
  P(new THREE.BoxGeometry(0.15, 0.75, 0.6), M.metal, 0.6, 0.4, 3.6, { collide: false });
  P(new THREE.BoxGeometry(0.15, 0.75, 0.6), M.metal, 3.4, 0.4, 3.6, { collide: false });
  signPlane(b, 'ANDÉN', '#1f4a7a', '#ffffff', 1.3, 0.65, -2, 3.4, 4.4, { parent: G, collide: false });
  P(new THREE.BoxGeometry(0.06, 3.4, 0.06), M.metal, -2, 1.7, 4.4, { collide: false });

  // Lights: violet platform wash + warm spill on the train side from camera-right.
  const wc = world(G, 0, 0, 0);
  b.light(wc[0] + 6, 4.5, wc[2] + 5, 0x8a76ff, 22, 34);
  b.light(wc[0] - 6, 3.4, wc[2] - 6, 0xffb066, 20, 30);
  b.light(wc[0] + 30, 3.0, wc[2] + 4, 0xffd9a0, 14, 40);
  lightCone(b, wc[0] - 6, 3.2, wc[2] - 5, 0xffb066, 4, 2.2);
  return {};
}

/* ------------------------------------------------------------------ */
/* Set 3 — Abarrotes corner shop + taxi                                 */
/* ------------------------------------------------------------------ */

// Classic VW-beetle taxi: green lower body, white domed cabin, round headlights,
// roof TAXI sign. `drive` animates it across the shopfront during the shot.
export function taxi(b, M) {
  const G = grp(b, 40, 304);
  const P = (geo, mat, x, y, z, opts = {}) => add(b, geo, mat, x, y, z, { ...opts, parent: G });
  // Lower body: green, rounded via a slightly tapered box + fender hints.
  P(new THREE.BoxGeometry(3.7, 0.72, 1.6), M.taxiGreen, 0, 0.62, 0);
  P(new THREE.BoxGeometry(3.7, 0.3, 1.7), M.taxiGreen, 0, 0.38, 0);
  // Cabin: white dome (scaled sphere) + dark window band.
  const cabin = P(new THREE.SphereGeometry(0.95, 12, 10), M.taxiWhite, -0.15, 1.28, 0);
  cabin.scale.set(1.5, 0.72, 0.85);
  P(new THREE.BoxGeometry(1.9, 0.5, 1.52), BASIC.dark, -0.15, 1.32, 0);
  P(new THREE.BoxGeometry(0.5, 0.42, 1.4), BASIC.glass, 0.72, 1.3, 0);   // windshield
  P(new THREE.BoxGeometry(0.4, 0.4, 1.4), BASIC.glass, -1.05, 1.3, 0);  // rear window
  // Bumpers and round headlights.
  P(new THREE.BoxGeometry(0.16, 0.14, 1.5), M.chrome, 1.9, 0.55, 0, { collide: false });
  P(new THREE.BoxGeometry(0.16, 0.14, 1.5), M.chrome, -1.9, 0.55, 0, { collide: false });
  for (const s of [-1, 1]) {
    P(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 10), BASIC.glowWarm, 1.86, 0.72, s * 0.55, { rx: PI / 2, collide: false });
    P(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 8), BASIC.tail, -1.86, 0.72, s * 0.55, { rx: PI / 2, collide: false });
  }
  // Wheels.
  for (const [wx, wz] of [[1.25, 0.8], [1.25, -0.8], [-1.25, 0.8], [-1.25, -0.8]]) {
    P(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10), M.tyre, wx, 0.34, wz, { rx: PI / 2 });
    P(new THREE.CylinderGeometry(0.16, 0.16, 0.26, 8), M.chrome, wx, 0.34, wz, { rx: PI / 2, collide: false });
  }
  // Roof TAXI sign.
  P(new THREE.BoxGeometry(0.7, 0.16, 0.3), basic({ map: T.signTex('TAXI', '#f2c230', '#1a1a1a', 64, 24) }), -0.15, 1.78, 0, { collide: false });
  // Headlight throw: two small additive wedges ahead of the car.
  const beamMat = basic({ color: 0xffe0a0, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending });
  const beams = [0.5, -0.5].map((z) => {
    const cone = P(new THREE.ConeGeometry(0.55, 3.4, 8, 1, true), beamMat, 3.4, 0.75, z, { rz: -PI / 2 });
    cone.userData.noBatch = true;
    return cone;
  });
  // Drive state: story.js flips `on` for the abarrotes shot; update() lerps x across
  // the shopfront. The car faces -x (screen right -> left) with a slight camera-side yaw.
  G.userData.noBatch = true;
  G.userData.beams = beams;
  G.userData.beamMat = beamMat;
  G.userData.on = false;
  G.userData.k = 0;
  G.userData.dur = 2.8;
  G.userData.from = 10;
  G.userData.to = -10;
  G.userData.baseX = 40;
  G.userData.baseZ = 304;
  G.rotation.y = Math.PI + 0.18;
  G.position.x = G.userData.baseX + G.userData.from;
  return { taxi: G };
}

export function abarrotes(b, M) {
  const G = grp(b, 40, 300);
  const P = (geo, mat, x, y, z, opts = {}) => add(b, geo, mat, x, y, z, { ...opts, parent: G });
  const B = (w, h, d, mat, x, y, z, opts = {}) => P(new THREE.BoxGeometry(w, h, d), mat, x, y, z, opts);
  const front = 0; // building front face at local z=0, faces +z toward the street

  // --- White one-storey block. ---
  B(11, 4.6, 6, M.plaster, 0, 2.3, -3);
  B(11.4, 0.5, 6.4, M.plaster, 0, 4.85, -3);          // cornice
  B(11.2, 0.9, 0.4, M.stone, 0, 0.45, 0.1);           // plinth band
  // Painted lettering band on the white wall.
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(9.4, 1.35), basic({ map: T.shopFrontTex() }));
  sign.position.set(0, 3.55, front + 0.02);
  G.add(sign);
  // Blue awning: sloped striped plane + fascia with 'TIENDA DE ABARROTES'.
  const awn = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 1.7), lam({ map: T.awningTex('#1d5aa8', '#e8ddc4'), side: THREE.DoubleSide }));
  awn.position.set(-0.6, 2.85, 1.0);
  awn.rotation.x = -0.62;
  G.add(awn);
  const fascia = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 0.62), basic({ map: T.awningSignTex() }));
  fascia.position.set(-0.6, 3.32, 1.62);
  fascia.rotation.x = -0.28;
  G.add(fascia);
  // Open shopfront: recessed warm interior with stocked shelves.
  B(5.4, 3.0, 0.3, M.dark, -0.4, 1.65, -1.4);          // interior backdrop block
  const inner = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 2.9), lam({ map: T.bodegaInteriorTex('abarrotes') }));
  inner.position.set(-0.4, 1.7, -1.22);
  G.add(inner);
  // Shelf ledges and goods in front of the backdrop.
  const goodsMat = lam({ map: T.productsTex(['#e9c46a', '#e76f51', '#2a9d8f', '#f4f1de', '#b5179e']) });
  for (const [sy, sz] of [[0.75, -0.95], [1.5, -1.05], [2.2, -1.1]]) {
    B(4.9, 0.14, 0.55, M.metal, -0.4, sy, sz);
    const gp = new THREE.Mesh(new THREE.PlaneGeometry(4.9, 0.62), goodsMat);
    gp.position.set(-0.4, sy + 0.36, sz + 0.28);
    G.add(gp);
  }
  // Jambs and header around the opening.
  B(0.5, 3.4, 0.9, M.plaster, -3.35, 1.7, 0.2);
  B(0.5, 3.4, 0.9, M.plaster, 2.55, 1.7, 0.2);
  B(6.4, 0.6, 0.9, M.plaster, -0.4, 3.6, 0.2);
  // Right side: red lower panel + blue panel with a fictional drink sign.
  B(3.4, 1.7, 0.24, M.red, 4.3, 0.85, front + 0.06);
  B(3.4, 1.9, 0.24, M.blue, 4.3, 3.15, front + 0.06);
  signPlane(b, 'NÉCTAR', '#1d5aa8', '#ffffff', 2.6, 0.7, 4.3, 3.15, front + 0.2, { parent: G, collide: false });
  // Left: red/orange payphone on a post with a lit screen.
  cyl(b, 0.06, 0.08, 2.6, 6, M.metal, -4.9, 1.3, 0.8, { parent: G });
  B(0.62, 1.5, 0.5, M.red, -4.9, 1.35, 0.8, { parent: G });
  B(0.4, 0.9, 0.06, M.dark, -4.9, 1.5, 1.07, { parent: G });
  const payScr = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.3), BASIC.glowWarm);
  payScr.position.set(-4.9, 1.62, 1.11);
  G.add(payScr);
  signPlane(b, 'TEL', '#c23a10', '#ffe6b0', 0.5, 0.24, -4.9, 2.15, 1.06, { parent: G, collide: false });
  // Narrow dark side wall at the far left.
  B(0.8, 4.6, 5.5, M.dark, -5.9, 2.3, -2.8);

  // --- Street: sidewalk, red curb, asphalt with a yellow edge line. ---
  G.add(flat(20, 3.4, M.sidewalk, 0, 0.03, 1.9));
  B(20, 0.16, 0.5, M.red, 0, 0.08, 3.6);              // red-painted curb strip
  G.add(flat(20, 6, M.asphalt, 0, 0.01, 6.8));
  for (let x = -9.5; x < 10; x += 2.4) {
    G.add(flat(1.2, 0.14, BASIC.curbLine, x, 0.035, 6.8));
  }
  // A couple of parked cars and clutter along the curb.
  parkedCar(b, 40 - 7.5, 307.5, PI, 0x3a2a4a);
  parkedCar(b, 40 + 8.2, 307.8, PI + 0.06, 0x24404a);
  putClutter(b, M, G);

  // Blocks behind the shop for depth.
  building(b, { x: 40 - 8.5, z: 288, w: 9, d: 8, h: 13, ry: 0, seed: 'abL', shop: { kind: 'shutter', name: 'COPPELIA' }, balconies: true });
  building(b, { x: 40 + 9, z: 289, w: 10, d: 9, h: 17, ry: 0, seed: 'abR', shop: { kind: 'open', name: 'REFACIL' }, balconies: true });
  building(b, { x: 40 + 0.5, z: 284, w: 12, d: 10, h: 24, ry: 0, seed: 'abB', shop: null, balconies: false, roof: true });

  // Lights: warm shop interior + spill, cool street fill.
  b.light(40 - 0.4, 2.6, 300 - 1.0, 0xffc78a, 22, 16);
  b.light(40 - 4.9, 2.6, 300 + 2.5, 0xffb066, 12, 12);
  b.light(40 + 2, 4.5, 300 + 6, 0x8a76ff, 14, 22);
  lightCone(b, 40 - 0.4, 4.6, 300 + 2.5, 0xffb066, 4.5, 2.4);
  return {};
}

// Street clutter around the abarrotes corner — crates, sacks, a folding table.
function putClutter(b, M, G) {
  const put = (prop, x, z, ry = 0, y = 0) => {
    prop.position.set(x, y, z);
    prop.rotation.y = ry;
    G.add(prop);
  };
  for (const [x, z, ry] of [
    [-8.2, 2.2, 0.4], [-7.4, 3.1, -0.2], [7.6, 2.4, 0.1], [8.5, 3.2, 0.5],
    [-3.2, 3.4, 0.9], [5.8, 3.5, -0.3],
  ]) {
    const pick = T.rand();
    const prop = pick < 0.35 ? PK.crateSlats(0.55 + T.rand() * 0.2, 0.42, 0.32)
      : pick < 0.55 ? PK.box(0.5, 0.34, 0.42, { open: T.rand() < 0.5 })
      : pick < 0.75 ? PK.sack(0.5 + T.rand() * 0.15)
      : PK.bucket([0x2e6fd9, 0xd94f3d, 0x3b7d3a][Math.floor(T.rand() * 3)]);
    put(prop, x, z, ry);
  }
  put(PK.table(1.5, 0.7, 0.72), 6.4, 4.6, -0.2);
  for (const [bx, bz] of [[-0.4, -0.1], [0.1, 0.12], [0.5, -0.05]]) {
    const bt = PK.bottle(Math.floor(T.rand() * 2));
    bt.position.set(6.4 + bx, 0.72, 4.6 + bz);
    G.add(bt);
  }
  put(PK.pot(), -8.8, 1.2, 0.3);
  put(PK.cone(), 9.2, 5.4, 0.5);
}

/* ------------------------------------------------------------------ */
/* Set 4 — Alameda-like park                                            */
/* ------------------------------------------------------------------ */

// Wrought-iron park bench: curved top rail, seat slats, ornate side curls.
function ironBench(b, M, G, x, z, ry = 0, mat = null) {
  const m = mat ?? M.metal;
  const P = (geo, mm, px, py, pz, opts = {}) => add(b, geo, mm, px, py, pz, { ...opts, parent: G });
  const bench = new THREE.Group();
  bench.position.set(x, 0, z);
  bench.rotation.y = ry;
  G.add(bench);
  const Q = (geo, mm, px, py, pz, opts = {}) => add(b, geo, mm, px, py, pz, { ...opts, parent: bench });
  // Side frames: two upright panels with a scroll curl on top.
  for (const s of [-1, 1]) {
    Q(new THREE.BoxGeometry(0.09, 0.85, 0.62), m, s * 1.05, 0.55, 0);
    Q(new THREE.TorusGeometry(0.3, 0.045, 6, 10, PI * 1.2), m, s * 1.05, 1.02, -0.25, { rx: 0.3 });
    Q(new THREE.BoxGeometry(0.07, 0.5, 0.07), m, s * 1.05, 0.28, 0.34);
  }
  // Seat slats and back slats.
  for (let i = 0; i < 3; i++) Q(new THREE.BoxGeometry(2.1, 0.05, 0.14), m, 0, 0.52, -0.22 + i * 0.22);
  for (let i = 0; i < 3; i++) Q(new THREE.BoxGeometry(2.1, 0.05, 0.12), m, 0, 0.85 + i * 0.24, -0.34, { rx: -0.18 });
  return bench;
}

// Thin ornate street lamp: pole, curled bracket, warm head.
function parkLamp(b, M, G, x, z) {
  const P = (geo, mat, px, py, pz, opts = {}) => add(b, geo, mat, px, py, pz, { ...opts, parent: G });
  cyl(b, 0.07, 0.11, 5.6, 6, M.metal, x, 2.8, z, { parent: G });
  P(new THREE.SphereGeometry(0.16, 8, 6), BASIC.glowWarm, x, 5.7, z, { collide: false });
  P(new THREE.ConeGeometry(0.3, 0.25, 8), M.metal, x, 5.55, z, { collide: false });
  const lamp = b.light(G.position.x + x, 5.4, G.position.z + z, 0xffb066, 20, 22);
  lightCone(b, G.position.x + x, 5.3, G.position.z + z, 0xffb066, 5, 2.0);
  return lamp;
}

// Distant Torre Latinoamericana silhouette: dark shaft, lit name band, spire + beacon.
function distantTorre(b, M, G, x, z, h = 30) {
  const P = (geo, mat, px, py, pz, opts = {}) => add(b, geo, mat, px, py, pz, { ...opts, parent: G });
  const w = h * 0.16;
  P(new THREE.BoxGeometry(w, h * 0.72, w), M.dark, x, h * 0.36, z);
  P(new THREE.BoxGeometry(w * 0.8, h * 0.16, w * 0.8), M.dark, x, h * 0.8, z);
  // Lit name band near the top.
  const band = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, h * 0.045), towerSignMat());
  band.position.set(x, h * 0.72, z + w / 2 + 0.05);
  G.add(band);
  // Spire + blinking red beacon (own material so the pulse doesn't hit other beacons).
  P(new THREE.CylinderGeometry(0.05, 0.14, h * 0.28, 5), M.metal, x, h * 0.9 + h * 0.14, z, { collide: false });
  const beaconMat = basic({ color: 0xff5040 });
  const beacon = P(new THREE.SphereGeometry(0.22, 8, 6), beaconMat, x, h * 1.06, z, { collide: false });
  beacon.userData.noBatch = true;
  beacon.userData.beaconMat = beaconMat;
  return { beacon };
}

// A dark broadleaf tree: trunk, branch stubs and clustered near-black foliage blobs.
function darkTree(b, M, G, x, z, s = 1, leafMat = null) {
  const lm = leafMat ?? M.leaf;
  cyl(b, 0.28 * s, 0.55 * s, 5.2 * s, 6, M.bark, x, 2.6 * s, z, { parent: G });
  for (const [dx, dz, ry, rz, len] of [
    [1.2, 0.4, 0.5, 0.8, 2.6], [-1.1, -0.3, 2.4, -0.7, 2.4], [0.3, -1.2, 4.0, 0.9, 2.2],
    [-0.4, 1.1, 1.2, -0.9, 2.3], [0.9, -0.9, 3.1, 0.6, 1.9],
  ]) {
    add(b, new THREE.BoxGeometry(0.16 * s, len * s, 0.16 * s), M.bark,
      x + dx * s, (4.4 + len * 0.35) * s, z + dz * s, { parent: G, ry, rz });
  }
  for (const [dx, dy, dz, r] of [
    [0, 5.6, 0, 1.9], [-1.3, 5.1, 0.4, 1.5], [1.4, 5.3, -0.3, 1.6], [0.2, 6.4, 0.5, 1.5],
    [-0.8, 4.6, -0.9, 1.3], [0.9, 4.7, 0.9, 1.4], [0, 4.4, -1.2, 1.2],
  ]) {
    const blob = add(b, new THREE.IcosahedronGeometry(r * s, 0), lm, x + dx * s, dy * s, z + dz * s, { parent: G });
    blob.scale.set(1.25, 0.8, 1.1);
  }
}

export function park(b, M) {
  const G = grp(b, -280, -80);
  const P = (geo, mat, x, y, z, opts = {}) => add(b, geo, mat, x, y, z, { ...opts, parent: G });

  // Ground: dark earth everywhere, a pale moonlit path running into the park.
  G.add(flat(46, 46, M.parkGround, -4, 0.01, -2));
  G.add(flat(34, 3.6, M.path, -8, 0.035, -1, 0.12));
  // Path edge lines.
  for (const s of [-1, 1]) {
    G.add(flat(34, 0.12, M.dark, -8, 0.045, -1 + s * 1.85, 0.12));
  }

  // Jacaranda in full purple bloom, centre-right of the frame.
  const jx = -3, jz = -7;
  cyl(b, 0.3, 0.6, 5.2, 6, M.bark, jx, 2.6, jz, { parent: G });
  for (const [dx, dz, len] of [[-1.4, 0.5, 2.8], [1.3, -0.4, 2.6], [0.4, 1.5, 2.4], [-0.8, -1.4, 2.5]]) {
    add(b, new THREE.BoxGeometry(0.18, len, 0.18), M.bark, jx + dx, 4.6 + len * 0.3, jz + dz, { parent: G, rz: dx * 0.4, ry: dz });
  }
  const bloomMats = [M.jacaranda, M.jacarandaLight, M.jacarandaDeep];
  for (const [dx, dy, dz, r, mi] of [
    [0, 6.2, 0, 2.6, 0], [-2.0, 5.6, 0.6, 2.0, 1], [2.1, 5.8, -0.5, 2.1, 2],
    [0.3, 7.2, 0.4, 1.9, 1], [-1.0, 6.8, -1.0, 1.7, 0], [1.1, 6.9, 0.9, 1.8, 2],
    [-2.6, 6.4, -0.6, 1.5, 1], [2.7, 6.5, 0.7, 1.6, 0], [0.6, 5.2, -1.6, 1.5, 2],
    [-0.6, 5.4, 1.7, 1.5, 1],
  ]) {
    const blob = add(b, new THREE.IcosahedronGeometry(r, 0), bloomMats[mi], jx + dx, dy, jz + dz, { parent: G });
    blob.scale.set(1.35, 0.78, 1.15);
  }

  // Dark silhouette trees: one framing the left edge, one canopy over the right top.
  darkTree(b, M, G, 12.5, 3.5, 1.15);      // left foreground trunk
  darkTree(b, M, G, 6.5, 9.5, 1.0);        // right-top canopy
  darkTree(b, M, G, -14, -2, 0.9);         // mid-left silhouette
  darkTree(b, M, G, -20, 6, 0.8);

  // Distant torre silhouette, centre-left.
  const dt = distantTorre(b, M, G, -24, -16, 30);

  // Street lamps with warm pools.
  const lamp1 = parkLamp(b, M, G, -11, -9);
  const lamp2 = parkLamp(b, M, G, -4, -12);
  // Warm pools on the path under each lamp.
  queueDecal(b, 0xffb066, G.position.x - 11, 0.06, G.position.z - 9, 7, 5, 0.2);
  queueDecal(b, 0xffb066, G.position.x - 4, 0.06, G.position.z - 12, 6, 5, 0.18);

  // Benches: dark iron pair foreground-left, teal-blue one right with a seated silhouette.
  ironBench(b, M, G, 7.5, 4.2, 2.6);
  ironBench(b, M, G, 5.2, 2.4, 2.75);
  const teal = lam({ color: 0x2e6f8a, vertexColors: true });
  ironBench(b, M, G, -0.5, -0.5, 0.5, teal);
  const sitter = new NPC({ top: '#101018', bottom: '#0c0a12', skin: '#1a1418', hair: '#08060c', outfit: 'jacket', pose: 'sit', height: 0.98, figure: 'masc' }, G);
  sitter.place(-0.7, -0.75);
  sitter.face(-6, -4);

  // Moonlight: one cool high light gives the path its lavender sheen.
  b.light(G.position.x - 6, 16, G.position.z - 6, 0x8a9aff, 26, 46);
  b.light(G.position.x - 24, 20, G.position.z - 16, 0x6a5ac8, 14, 50);
  return { lamp: lamp1, sitter, beacon: dt.beacon };
}

/* ------------------------------------------------------------------ */
/* Set 5 — Biblioteca Central exterior                                  */
/* ------------------------------------------------------------------ */

export function biblioteca(b, M) {
  const G = grp(b, -300, 120);
  const P = (geo, mat, x, y, z, opts = {}) => add(b, geo, mat, x, y, z, { ...opts, parent: G });
  const B = (w, h, d, mat, x, y, z, opts = {}) => P(new THREE.BoxGeometry(w, h, d), mat, x, y, z, opts);

  // Mosaic block: dark slab + the big mural plane on the front face.
  B(46, 20, 4.5, M.dark, 0, 10, -2.5);
  const mural = new THREE.Mesh(new THREE.PlaneGeometry(45.4, 19.4), basic({ map: T.bibliotecaMuralTex() }));
  mural.position.set(0, 10.4, -0.22);
  G.add(mural);
  // Smaller box on top-left with its own mosaic pattern.
  B(15, 4.2, 4.5, M.dark, -14.5, 22.1, -2.5);
  const mural2 = new THREE.Mesh(new THREE.PlaneGeometry(14.4, 3.6), basic({ map: T.muralTex('bib-top') }));
  mural2.position.set(-14.5, 22.1, -0.22);
  G.add(mural2);
  // Cantilevered dark ledge partway down, then the glass ground floor.
  B(46.6, 0.9, 5.2, M.dark, 0, 6.4, -2.3);
  // Glass ground floor: lit interior grid behind a faint glass plane.
  const gf = new THREE.Mesh(new THREE.PlaneGeometry(44, 5.6), basic({ map: T.facadeTex(11, 4, '#ffcf9a') }));
  gf.position.set(0, 2.9, -0.18);
  G.add(gf);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(44, 5.6), BASIC.glass);
  glass.position.set(0, 2.9, -0.05);
  G.add(glass);
  // Warm interior wash between the lit-window grid and the glass skin.
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(44, 5.6), basic({ color: 0xffc98a, transparent: true, opacity: 0.2, depthWrite: false }));
  glow.position.set(0, 2.9, -0.12);
  G.add(glow);
  for (let i = 0; i < 6; i++) {
    B(0.8, 5.4, 0.8, M.dark, -18 + i * 7.2, 2.7, -1.2, { collide: false });
  }
  // Pilotis: dark columns in front of the glass.
  for (let i = 0; i < 7; i++) {
    cyl(b, 0.42, 0.5, 6.0, 8, M.stone, -19.8 + i * 6.6, 3.0, 1.6, { parent: G });
  }
  // Plaza ground + a couple of lamps and planters.
  G.add(flat(70, 40, M.concrete, 0, 0.01, 8));
  for (const [lx, lz] of [[-20, 6], [20, 6], [-26, 12], [26, 12]]) {
    cyl(b, 0.08, 0.13, 4.6, 6, M.metal, lx, 2.3, lz, { parent: G });
    add(b, new THREE.SphereGeometry(0.26, 8, 6), BASIC.glowWarm, lx, 4.75, lz, { parent: G, collide: false });
    b.light(G.position.x + lx, 4.5, G.position.z + lz, 0xffb066, 14, 18);
  }
  // Uplights washing the mural from below — the reference's hot base.
  b.light(G.position.x - 12, 1.4, G.position.z + 5, 0xffa050, 26, 30);
  b.light(G.position.x + 12, 1.4, G.position.z + 5, 0xffa050, 26, 30);
  b.light(G.position.x, 1.2, G.position.z + 8, 0xffc080, 20, 26);
  lightCone(b, G.position.x - 12, 1.2, G.position.z + 5, 0xffa050, 5, 2.4);
  lightCone(b, G.position.x + 12, 1.2, G.position.z + 5, 0xffa050, 5, 2.4);
  return {};
}

/* ------------------------------------------------------------------ */
/* Set 6 — Library interior, book pickup                                */
/* ------------------------------------------------------------------ */

export function library(b, M) {
  const G = grp(b, 280, 160);
  const P = (geo, mat, x, y, z, opts = {}) => add(b, geo, mat, x, y, z, { ...opts, parent: G });
  const B = (w, h, d, mat, x, y, z, opts = {}) => P(new THREE.BoxGeometry(w, h, d), mat, x, y, z, opts);

  // Room shell: floor, walls, ceiling — all dark so nothing leaks to other sets.
  G.add(flat(20, 16, M.libFloor, 0, 0, -1));
  B(20, 8, 0.5, M.libWall, 0, 4, -8.2);      // back wall
  B(20, 8, 0.5, M.libWall, 0, 4, 6.2);       // front wall (behind camera)
  B(0.5, 8, 15, M.libWall, -9.8, 4, -1);     // left wall
  B(0.5, 8, 15, M.libWall, 9.8, 4, -1);      // right wall
  B(20, 0.5, 16, M.libWall, 0, 8.2, -1);     // ceiling

  // Back wall: multi-level bookshelf run with the shelf texture.
  const shelfMat = M.shelf;
  for (let i = 0; i < 4; i++) {
    const sx = -7.5 + i * 4.2;
    B(4.0, 6.4, 0.7, M.libFrame, sx, 3.2, -7.7);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 6.2), shelfMat);
    face.position.set(sx, 3.2, -7.33);
    G.add(face);
    // Shelf boards breaking the texture into levels.
    for (const sy of [1.1, 2.3, 3.5, 4.7, 5.9]) B(3.8, 0.08, 0.1, M.libFrame, sx, sy, -7.3, { collide: false });
  }
  // Right wall shelves too.
  for (let i = 0; i < 3; i++) {
    const sz = -5.5 + i * 4.0;
    B(0.7, 5.2, 3.8, M.libFrame, 9.3, 2.6, sz);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 5.0), shelfMat);
    face.position.set(9.33, 2.6, sz);
    face.rotation.y = -PI / 2;
    G.add(face);
  }
  // '920' concrete pillar, left of centre in frame.
  B(1.7, 7.6, 1.7, M.libPillar, -4.6, 3.8, -0.5);
  // Small red label plate at its base (geometry, cheap).
  B(1.0, 0.4, 0.08, M.red, -4.6, 1.1, 0.42, { collide: false });
  // Mezzanine gallery on the left with railings.
  B(5.5, 0.35, 3.2, M.libFrame, -6.8, 4.1, -4.5);
  for (let i = 0; i < 6; i++) {
    P(new THREE.CylinderGeometry(0.035, 0.035, 3.0, 6), M.chrome, -9.2 + i * 0.95, 5.5, -3.0, { collide: false });
  }
  for (const ry of [6.4, 5.6]) {
    P(new THREE.CylinderGeometry(0.04, 0.04, 5.4, 6), M.chrome, -6.8, ry, -3.0, { rx: PI / 2, collide: false });
  }
  // Cold strip lights on the ceiling.
  for (const [sx, sz] of [[-3, -4], [3, -2], [-1, 2], [5, -5]]) {
    B(2.6, 0.06, 0.5, BASIC.strip, sx, 7.9, sz, { collide: false });
    B(2.4, 0.04, 0.4, BASIC.stripCore, sx, 7.86, sz, { collide: false });
  }
  // Foreground dark ledge, bottom-left of frame.
  B(3.4, 1.1, 1.2, M.libFrame, -5.4, 0.55, 4.6);
  B(3.4, 0.9, 0.9, M.libFrame, -5.4, 1.5, 4.8, { collide: false });

  // --- Hero: the floating 'Español' book inside a purple glow. ---
  const bookG = new THREE.Group();
  bookG.userData.noBatch = true;
  bookG.userData.baseY = 1.85;
  bookG.position.set(0.6, 1.85, -0.4);
  G.add(bookG);
  const cover = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.62), M.book);
  cover.position.z = 0.035;
  bookG.add(cover);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.62), M.bookBack);
  back.position.z = -0.035;
  back.rotation.y = PI;
  bookG.add(back);
  // Page block + cover boards.
  const pages = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.56, 0.05), lam({ color: 0xe8e2d2 }));
  bookG.add(pages);
  for (const s of [-1, 1]) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.63, 0.012), M.bookBack);
    board.position.set(s * 0.235, 0, 0);
    board.rotation.y = PI / 2;
    bookG.add(board);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.012, 0.05), lam({ color: 0xf2ecdc }));
  top.position.y = 0.285;
  bookG.add(top);
  // Purple bubble: translucent shell + bright equator ring + inner dark core.
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.85, 16, 12),
    basic({ color: 0x6a40ff, transparent: true, opacity: 0.15, depthWrite: false, side: THREE.DoubleSide }));
  bookG.add(shell);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 10),
    basic({ color: 0x1a0a4a, transparent: true, opacity: 0.3, depthWrite: false }));
  bookG.add(core);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.025, 6, 32),
    basic({ color: 0x9a6aff }));
  ring.rotation.x = PI / 2;
  bookG.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.02, 6, 32),
    basic({ color: 0x6a40ff }));
  ring2.rotation.y = PI / 2;
  bookG.add(ring2);
  // Violet light pool on the floor below.
  queueDecal(b, 0x7a4aff, G.position.x + 0.6, 0.05, G.position.z - 0.4, 4.2, 4.2, 0.3);
  queueDecal(b, 0x5a30c8, G.position.x + 0.6, 0.04, G.position.z - 0.4, 2.2, 2.2, 0.25);
  b.light(G.position.x + 0.6, 2.6, G.position.z - 0.4, 0x8a5aff, 18, 12);
  // Cool ambient practicals for the stacks.
  b.light(G.position.x - 5, 5.5, G.position.z - 5, 0xbfd0ff, 16, 20);
  b.light(G.position.x + 5, 4.5, G.position.z + 2, 0xbfd0ff, 12, 18);

  return { book: bookG };
}

/* ------------------------------------------------------------------ */
/* Set 7 — Torre Latinoamericana top                                    */
/* ------------------------------------------------------------------ */

export function torre(b, M) {
  const G = grp(b, 300, -160);
  const P = (geo, mat, x, y, z, opts = {}) => add(b, geo, mat, x, y, z, { ...opts, parent: G });
  const B = (w, h, d, mat, x, y, z, opts = {}) => P(new THREE.BoxGeometry(w, h, d), mat, x, y, z, opts);
  const shaftMat = basic({ map: T.torreFacadeTex() });

  // Stepped shaft: three tiers sharing the window-stripe texture.
  const tiers = [
    [26, 40, 0], [21, 30, 40], [16, 26, 70],
  ];
  for (const [w, h, y] of tiers) {
    const g = new THREE.BoxGeometry(w, h, w);
    const uv = g.attributes.uv;
    const vScale = h / 96; // keep floors ~3.7m regardless of tier height
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * vScale);
    P(g, shaftMat, 0, y + h / 2, 0);
    // Setback cap in dark metal.
    B(w + 0.6, 0.8, w + 0.6, M.metal, 0, y + h + 0.4, 0, { collide: false });
  }
  // Crown: terrace level + glass penthouse with warm/teal windows on every face.
  B(14, 3.5, 14, M.metal, 0, 98.2, 0);
  const pentMat = basic({ map: T.glassTowerTex('#ffd88a', 6, 3) });
  const pentGeo = new THREE.BoxGeometry(11, 3, 11);
  P(pentGeo, pentMat, 0, 100.8, 0, { collide: false });
  // Lattice spire: four struts converging to the apex + square cross-braces.
  const apex = [0, 131, 0], base = 105;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    strut(b, M.metal, [sx * 1.7, base, sz * 1.7], apex, 0.14, G);
  }
  for (const [t, s] of [[0.25, 1.35], [0.5, 1.0], [0.75, 0.6]]) {
    const y = base + (apex[1] - base) * t, r = s;
    strut(b, M.metal, [-r, y, r], [r, y, r], 0.07, G);
    strut(b, M.metal, [r, y, r], [r, y, -r], 0.07, G);
    strut(b, M.metal, [r, y, -r], [-r, y, -r], 0.07, G);
    strut(b, M.metal, [-r, y, -r], [-r, y, r], 0.07, G);
  }
  // Red beacon at the tip — dedicated material so the pulse stays local.
  const beaconMat = basic({ color: 0xff5040 });
  const beacon = P(new THREE.SphereGeometry(0.5, 10, 8), beaconMat, 0, apex[1] + 0.7, 0, { collide: false });
  beacon.userData.noBatch = true;
  const beaconGlow = P(new THREE.SphereGeometry(1.15, 10, 8),
    basic({ color: 0xff3a3a, transparent: true, opacity: 0.22, depthWrite: false }), 0, apex[1] + 0.7, 0, { collide: false });
  beaconGlow.userData.noBatch = true;

  // Name band wrapping the tier-2 corner (21 m faces at +/-10.5).
  const signMat = towerSignMat();
  const bandF = new THREE.Mesh(new THREE.PlaneGeometry(20, 2.0), signMat);
  bandF.position.set(0, 64, 10.53);
  G.add(bandF);
  const bandR = new THREE.Mesh(new THREE.PlaneGeometry(20, 2.0), signMat);
  bandR.position.set(10.53, 64, 0);
  bandR.rotation.y = PI / 2;
  G.add(bandR);
  // Band housing.
  B(21, 2.4, 0.5, M.metal, 0, 64, 10.35, { collide: false });
  B(0.5, 2.4, 21, M.metal, 10.35, 64, 0, { collide: false });

  // Moon: small warm disc up-right of the crown, facing back toward the tower.
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), basic({ map: T.moonGlowTex(), transparent: true, depthWrite: false, fog: false }));
  moon.position.set(18, 95, -55);
  moon.lookAt(G.position.x + 4, 55, G.position.z);
  G.add(moon);

  // Street level hint + distant grey towers lower-right.
  G.add(flat(60, 60, M.concrete, 0, 0.01, 10));
  const farMat = basic({ map: T.glassTowerTex('#4a5a80', 5, 12) });
  for (const [x, z, w, h] of [[22, -30, 12, 40], [34, -44, 14, 52], [16, -52, 10, 34], [42, -20, 11, 30]]) {
    const g = new THREE.BoxGeometry(w, h, w);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.5, uv.getY(i) * 2);
    P(g, farMat, x, h / 2, z);
  }
  b.light(G.position.x, 4, G.position.z + 12, 0xffb060, 22, 34);
  b.light(G.position.x - 8, 30, G.position.z + 16, 0xffd9a0, 14, 50);
  return { beacon, beaconGlow };
}

/* ------------------------------------------------------------------ */
/* Shared backdrop: block silhouettes ringing each set                 */
/* ------------------------------------------------------------------ */

export function skylineRing(b, M) {
  const dark = lam({ color: 0x120f1c });
  const ring = (cx, cz, r, n, hMin, hMax, seed = 0) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * PI * 2 + seed * 0.7;
      const rr = r + ((i * 37 + seed * 11) % 22);
      const w = 12 + ((i * 7 + seed) % 14), h = hMin + ((i * 11 + seed * 3) % (hMax - hMin));
      slab(b, w, h, w * 0.8, dark, cx + Math.cos(a) * rr, cz + Math.sin(a) * rr);
    }
  };
  ring(0, 0, 150, 18, 16, 46, 1);          // around the Ángel plaza
  ring(0, -300, 130, 14, 14, 40, 2);       // metro horizon
  ring(40, 300, 120, 12, 12, 36, 3);       // abarrotes street
  ring(-280, -80, 140, 14, 14, 44, 4);     // park tree line
  ring(-300, 120, 130, 12, 12, 38, 5);     // biblioteca surroundings
  ring(300, -160, 150, 12, 16, 50, 6);     // torre district
  return {};
}

// Wet-look street dressing for the abarrotes corner: puddles + reflection streaks,
// merged into three draw calls total.
export function wetGround(b) {
  const puddles = [];
  for (const [x, z, rx, rz] of [
    [40 - 6, 306.5, 1.6, 0.9], [40 + 3, 308, 1.3, 0.8], [40 - 1, 309.5, 1.1, 0.7],
    [40 - 9, 308.5, 1.4, 0.8], [40 + 7, 306, 1.2, 0.75],
    [0, 6, 2.0, 1.2], [0, -4, 1.6, 1.0],       // plaza edge
  ]) {
    const g = new THREE.CircleGeometry(1, 14);
    g.rotateX(-PI / 2);
    g.scale(rx, 1, rz);
    g.translate(x, 0.035, z);
    puddles.push(g);
  }
  const puddleMesh = new THREE.Mesh(mergeGeometries(puddles, false), phong({
    map: T.puddleTex(), transparent: true, depthWrite: false,
    shininess: 90, specular: 0x8fa8d8,
  }));
  puddleMesh.renderOrder = 1;
  b.scene.add(puddleMesh);

  const warm = [], cool = [];
  for (const [x, z, len, w] of [[40 - 0.4, 301.5, 4.5, 1.2], [40 - 4.9, 302.5, 3, 0.9]]) warm.push([x, z, len, w]);
  cool.push([0, 5, 4.5, 1.4]);
  const streakMesh = (spots, color) => {
    const geos = spots.map(([x, z, len, w]) => {
      const g = new THREE.PlaneGeometry(w, len);
      g.rotateX(-PI / 2);
      g.translate(x, 0.045, z);
      return g;
    });
    const m = new THREE.Mesh(mergeGeometries(geos, false), basic({
      map: T.streakTex(), color, transparent: true, opacity: 0.14, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    m.renderOrder = 2;
    b.scene.add(m);
    return m;
  };
  streakMesh(warm, 0xffb070);
  streakMesh(cool, 0x9a86ff);
  lightCone(b, 0, 4.6, -3, 0x9a7cff, 5, 2.0);
}
