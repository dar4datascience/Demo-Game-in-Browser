import * as THREE from 'three';
import { lam, basic } from '../engine/post.js';
import { bakeAO, chamferedBox } from './builder.js';
import * as T from '../engine/textures.js';

/*
 * Shared market prop kit: low-poly organic clutter built from tapered cylinders, lathes and
 * chamfered boxes with painted canvas textures and baked AO. Solids get a `color` attribute
 * (AO multiplied by an optional tint) so every variant merges into the level's static batch;
 * materials are cached module-wide so identical props cost one draw call per level.
 */

const cache = new Map();
const mat = (key, make) => {
  let m = cache.get(key);
  if (!m) cache.set(key, (m = make()));
  return m;
};
const VC = { vertexColors: true };

// Materials the levels may also adopt (e.g. CEDA's wood counters) so prop and set merge together.
export const kitMats = {
  wood: () => mat('wood', () => lam({ map: T.woodTex(), ...VC })),
  cardboard: () => mat('cardboard', () => lam({ map: T.cardboardTex(), ...VC })),
  burlap: () => mat('burlap', () => lam({ map: T.sackTex(), ...VC })),
  tint: () => mat('tint', () => lam({ ...VC })), // white base; vertex colour carries the paint
  tarp: () => mat('tarp', () => lam({ map: T.lonaTex('#c9c2b4'), side: THREE.DoubleSide, ...VC })),
  chainlink: () => mat('chainlink', () => basic({ map: T.chainlinkTex(), alphaTest: 0.45, side: THREE.DoubleSide })),
  bottleA: () => mat('bottleA', () => lam({ map: T.bottleTex('#2e6fd9', '#f4f1de', 'AGUA'), ...VC })),
  bottleB: () => mat('bottleB', () => lam({ map: T.bottleTex('#c0392b', '#f4f1de', 'REFRESCO'), ...VC })),
};

// Bake AO into the colour attribute, then multiply by a paint tint (white = texture colour).
const paint = (geo, hex = 0xffffff) => {
  bakeAO(geo);
  if (hex !== 0xffffff) {
    const c = new THREE.Color(hex);
    const col = geo.attributes.color;
    for (let i = 0; i < col.count; i++) {
      col.setXYZ(i, col.getX(i) * c.r, col.getY(i) * c.g, col.getZ(i) * c.b);
    }
  }
  return geo;
};

const put = (parent, geo, material, x = 0, y = 0, z = 0, o = {}) => {
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, y, z);
  if (o.rx) mesh.rotation.x = o.rx;
  if (o.ry) mesh.rotation.y = o.ry;
  if (o.rz) mesh.rotation.z = o.rz;
  parent.add(mesh);
  return mesh;
};

const lathe = (profile, seg = 10) =>
  new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);

// --- Props --------------------------------------------------------------------

// Plastic bucket with a wire handle. ~0.36 m tall, ~0.37 m across the handle.
export function bucket(color = 0x2e6fd9, h = 0.34) {
  const g = new THREE.Group();
  const p = kitMats.tint();
  const rT = 0.165, rB = 0.135;
  put(g, paint(new THREE.CylinderGeometry(rT, rB, h, 10), color), p, 0, h / 2, 0);
  put(g, paint(new THREE.CylinderGeometry(rT + 0.008, rT + 0.008, 0.025, 10), color), p, 0, h + 0.006, 0);
  put(g, paint(new THREE.CylinderGeometry(rB - 0.025, rB - 0.025, 0.015, 10), 0x14161a), p, 0, h - 0.035, 0);
  put(g, paint(new THREE.TorusGeometry(0.185, 0.013, 5, 12, Math.PI), color), p, 0, h + 0.012, 0);
  return g;
}

// Clay flower pot, bulbous belly with a rolled rim. ~0.43 m tall.
export function pot(color = 0xa8552e) {
  const g = new THREE.Group();
  put(g, paint(lathe([[0.001, 0], [0.13, 0.01], [0.185, 0.07], [0.215, 0.18], [0.205, 0.30], [0.16, 0.385], [0.145, 0.41], [0.165, 0.43]]), color), kitMats.tint());
  return g;
}

// PET bottle ~0.30 m: `kind` 0 = water label, 1 = soft-drink label.
export function bottle(kind = 0) {
  const g = new THREE.Group();
  put(g, paint(lathe([[0.001, 0], [0.03, 0.004], [0.038, 0.02], [0.041, 0.09], [0.039, 0.17], [0.031, 0.225], [0.017, 0.245], [0.014, 0.265], [0.016, 0.275]], 6)), kind ? kitMats.bottleB() : kitMats.bottleA());
  put(g, paint(new THREE.CylinderGeometry(0.0165, 0.0165, 0.03, 8), 0xd8d0b8), kitMats.tint(), 0, 0.288, 0);
  return g;
}

// Open plastic crate of mixed bottles, ~0.55 x 0.38 m.
export function bottleCrate() {
  const g = new THREE.Group();
  const p = kitMats.tint(), blue = 0x2e6fd9;
  put(g, paint(new THREE.BoxGeometry(0.55, 0.03, 0.38), blue), p, 0, 0.015, 0);
  const wall = 0.024, wh = 0.26;
  put(g, paint(new THREE.BoxGeometry(0.55, wh, wall), blue), p, 0, 0.03 + wh / 2, 0.178);
  put(g, paint(new THREE.BoxGeometry(0.55, wh, wall), blue), p, 0, 0.03 + wh / 2, -0.178);
  put(g, paint(new THREE.BoxGeometry(wall, wh, 0.36), blue), p, 0.263, 0.03 + wh / 2, 0);
  put(g, paint(new THREE.BoxGeometry(wall, wh, 0.36), blue), p, -0.263, 0.03 + wh / 2, 0);
  for (let i = 0; i < 6; i++) {
    const bt = bottle(i % 2);
    bt.position.set(-0.14 + (i % 3) * 0.14, 0.03, -0.095 + Math.floor(i / 3) * 0.19);
    g.add(bt);
  }
  return g;
}

// Round wooden stool, ~0.45 m.
export function stool(h = 0.45) {
  const g = new THREE.Group();
  const wood = kitMats.wood(), metal = kitMats.tint();
  put(g, paint(new THREE.CylinderGeometry(0.19, 0.17, h * 0.07, 10), 0x8a6238), wood, 0, h - 0.02, 0);
  for (const [x, z] of [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]]) {
    put(g, paint(new THREE.CylinderGeometry(0.02, 0.024, h - 0.06, 6), 0x3a3f46), metal, x, (h - 0.06) / 2, z);
  }
  put(g, paint(new THREE.BoxGeometry(0.3, 0.025, 0.025), 0x3a3f46), metal, 0, 0.18, 0.13);
  put(g, paint(new THREE.BoxGeometry(0.3, 0.025, 0.025), 0x3a3f46), metal, 0, 0.18, -0.13);
  return g;
}

// Car tyre lying flat, ~0.67 m across.
export function tire() {
  const g = new THREE.Group();
  const t = kitMats.tint();
  const torus = new THREE.TorusGeometry(0.25, 0.085, 6, 10);
  torus.rotateX(Math.PI / 2);
  put(g, paint(torus, 0x14161a), t, 0, 0.085, 0);
  put(g, paint(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 8), 0x2a2e34), t, 0, 0.172, 0);
  return g;
}

// Taped cardboard box ~0.5 x 0.4 m; `open` leaves the top flaps ajar.
export function box(w = 0.5, h = 0.34, d = 0.42, { open = false, tint: tc = 0xffffff } = {}) {
  const g = new THREE.Group();
  const card = kitMats.cardboard(), tape = kitMats.tint();
  put(g, paint(chamferedBox(w, h, d, 0.02, 1, true), tc), card, 0, h / 2, 0);
  put(g, paint(new THREE.BoxGeometry(w * 0.92, 0.006, 0.07), 0xcbb489), tape, 0, h + 0.002, 0);
  put(g, paint(new THREE.BoxGeometry(0.07, 0.006, d * 0.5), 0xcbb489), tape, 0, h + 0.004, 0);
  if (open) {
    put(g, paint(new THREE.BoxGeometry(w * 0.46, 0.008, d * 0.44), tc), card, -w * 0.23, h + 0.02, 0, { rz: 0.45 });
    put(g, paint(new THREE.BoxGeometry(w * 0.46, 0.008, d * 0.44), tc), card, w * 0.23, h + 0.02, 0, { rz: -0.45 });
  }
  return g;
}

// Burlap costal tied at the neck, ~0.63 m.
export function sack(h = 0.6) {
  const g = new THREE.Group();
  const b = kitMats.burlap();
  const k = h / 0.63;
  put(g, paint(lathe([[0.001, 0], [0.2, 0.02], [0.27, 0.1], [0.3, 0.26], [0.27, 0.44], [0.18, 0.53], [0.115, 0.565], [0.1, 0.6], [0.125, 0.63]].map(([r, y]) => [r, y * k]), 8)), b);
  put(g, paint(new THREE.TorusGeometry(0.105, 0.02, 4, 8), 0x6b5232), b, 0, 0.6 * k, 0, { rx: Math.PI / 2 });
  put(g, paint(new THREE.SphereGeometry(0.05, 5, 4), 0x6b5232), b, 0, 0.63 * k, 0);
  return g;
}

// Slatted wooden produce crate, ~0.6 x 0.45 m. `tint` recolours the wood via vertex colour.
export function crateSlats(w = 0.6, d = 0.45, h = 0.35, tint = 0xffffff) {
  const g = new THREE.Group();
  const wood = kitMats.wood(), th = tint;
  for (const [x, z] of [[-w / 2 + 0.025, -d / 2 + 0.025], [w / 2 - 0.025, -d / 2 + 0.025], [-w / 2 + 0.025, d / 2 - 0.025], [w / 2 - 0.025, d / 2 - 0.025]]) {
    put(g, paint(new THREE.BoxGeometry(0.05, h, 0.05), th), wood, x, h / 2, z);
  }
  for (let i = 0; i < 3; i++) {
    put(g, paint(new THREE.BoxGeometry(w - 0.04, 0.028, d - 0.04), th), wood, 0, 0.03 + i * ((h - 0.08) / 2), 0);
  }
  for (const s of [-1, 1]) {
    for (const y of [0.09, h * 0.55, h - 0.07]) {
      put(g, paint(new THREE.BoxGeometry(w - 0.05, 0.045, 0.02), th), wood, 0, y, s * (d / 2 - 0.012));
      put(g, paint(new THREE.BoxGeometry(0.02, 0.045, d - 0.09), th), wood, s * (w / 2 - 0.012), y, 0);
    }
  }
  for (const [sx, sz, ww, dd] of [[0, -d / 2 + 0.025, w, 0.05], [0, d / 2 - 0.025, w, 0.05], [-w / 2 + 0.025, 0, 0.05, d - 0.1], [w / 2 - 0.025, 0, 0.05, d - 0.1]]) {
    put(g, paint(new THREE.BoxGeometry(ww, 0.04, dd), th), wood, sx, h - 0.02, sz);
  }
  return g;
}

// Chain-link fence panel ~4 x 2 m: alpha-tested mesh on a metal frame. No collider —
// levels place it as a visual boundary.
export function fence(len = 4, h = 2.0) {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(len, h);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (len / 0.28), uv.getY(i) * (h / 0.28));
  const link = new THREE.Mesh(geo, kitMats.chainlink());
  link.position.y = h / 2;
  g.add(link);
  const metal = kitMats.tint(), post = 0x4a4f55;
  for (const x of [-len / 2, len / 2]) {
    put(g, paint(new THREE.CylinderGeometry(0.028, 0.034, h + 0.06, 6), post), metal, x, h / 2 + 0.03, 0);
    put(g, paint(new THREE.BoxGeometry(0.16, 0.03, 0.16), post), metal, x, 0.015, 0);
  }
  put(g, paint(new THREE.BoxGeometry(len + 0.08, 0.035, 0.035), post), metal, 0, h + 0.02, 0);
  return g;
}

// Open plastic crate ~0.55 x 0.4 m with a centre groove on the long walls.
export function plasticCrate(w = 0.55, d = 0.4, h = 0.34, color = 0x2e6fd9) {
  const g = new THREE.Group();
  const p = kitMats.tint(), wall = 0.024;
  put(g, paint(new THREE.BoxGeometry(w, 0.03, d), color), p, 0, 0.015, 0);
  const wh = h - 0.06;
  put(g, paint(new THREE.BoxGeometry(w, wh, wall), color), p, 0, 0.03 + wh / 2, d / 2 - wall / 2);
  put(g, paint(new THREE.BoxGeometry(w, wh, wall), color), p, 0, 0.03 + wh / 2, -d / 2 + wall / 2);
  put(g, paint(new THREE.BoxGeometry(wall, wh, d - wall * 2), color), p, w / 2 - wall / 2, 0.03 + wh / 2, 0);
  put(g, paint(new THREE.BoxGeometry(wall, wh, d - wall * 2), color), p, -w / 2 + wall / 2, 0.03 + wh / 2, 0);
  for (const s of [-1, 1]) {
    put(g, paint(new THREE.BoxGeometry(w, 0.035, wall + 0.008), color), p, 0, h - 0.02, s * (d / 2 - wall / 2));
    put(g, paint(new THREE.BoxGeometry(w - 0.08, 0.022, wall + 0.01), color * 0.72), p, 0, 0.03 + wh * 0.55, s * (d / 2 - wall / 2 + 0.001));
  }
  return g;
}

// Folding market table ~1.7 x 0.75 m: plank top, metal legs.
export function table(w = 1.7, d = 0.75, h = 0.74) {
  const g = new THREE.Group();
  const wood = kitMats.wood(), metal = kitMats.tint();
  put(g, paint(new THREE.BoxGeometry(w, 0.045, d), 0x8a6238), wood, 0, h - 0.025, 0);
  put(g, paint(new THREE.BoxGeometry(w - 0.15, 0.07, d - 0.15), 0x5b4026), wood, 0, h - 0.085, 0);
  for (const [x, z] of [[-w / 2 + 0.09, -d / 2 + 0.09], [w / 2 - 0.09, -d / 2 + 0.09], [-w / 2 + 0.09, d / 2 - 0.09], [w / 2 - 0.09, d / 2 - 0.09]]) {
    put(g, paint(new THREE.BoxGeometry(0.05, h - 0.12, 0.05), 0x3a3f46), metal, x, (h - 0.12) / 2, z);
  }
  put(g, paint(new THREE.BoxGeometry(w - 0.2, 0.03, 0.03), 0x3a3f46), metal, 0, 0.22, 0);
  return g;
}

// Tarp-covered pile ~1.3 x 0.9 m: dark mound under a draped neutral tarp, tinted by `color`.
export function tarpPile(w = 1.3, d = 0.9, h = 0.6, color = 0x4a5f8a) {
  const g = new THREE.Group();
  const tarp = kitMats.tarp(), tint = kitMats.tint();
  put(g, paint(new THREE.CylinderGeometry(w * 0.4, w * 0.44, h * 0.22, 10), 0x2a2620), tint, 0, h * 0.11, 0);
  const mound = new THREE.SphereGeometry(0.5, 8, 5, 0, Math.PI * 2, 0, 1.7);
  mound.scale(w * 0.62, h * 0.9, d * 0.62);
  put(g, paint(mound, 0x35302a), tint, 0, h * 0.2, 0);
  const cover = new THREE.SphereGeometry(0.52, 9, 5, 0, Math.PI * 2, 0.12, 1.78);
  cover.scale(w * 0.68, h * 1.02, d * 0.68);
  put(g, paint(cover, color), tarp, 0, h * 0.34, 0);
  put(g, paint(new THREE.BoxGeometry(w * 0.5, 0.05, d * 0.4), color), tarp, w * 0.18, 0.03, -d * 0.12, { ry: 0.3 });
  return g;
}

// --- Volumetric light shafts ---------------------------------------------------
// One tiny shader shared by every lamp cone: the silhouette feathers out with view angle
// (no hard triangle rim) and alpha fades from the lamp apex toward the floor, so cones read
// as haze rather than geometry. Cached per colour/height/opacity; all variants share a program.
const shaftMats = new Map();
export const shaftMat = (color, h, opacity = 0.045) => {
  const key = `${color}|${Math.round(h * 10)}|${opacity}`;
  let m = shaftMats.get(key);
  if (!m) {
    m = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uH: { value: h },
        uOpacity: { value: opacity },
      },
      vertexShader: /* glsl */ `
        varying vec3 vN;
        varying vec3 vV;
        varying float vY;
        void main() {
          vY = position.y;
          vN = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uH;
        uniform float uOpacity;
        varying vec3 vN;
        varying vec3 vV;
        varying float vY;
        void main() {
          float face = pow(abs(dot(normalize(vN), normalize(vV))), 1.7);
          float vert = smoothstep(-uH * 0.5, uH * 0.5, vY);
          float a = uOpacity * face * (0.3 + 0.7 * vert);
          if (a < 0.003) discard;
          gl_FragColor = vec4(uColor, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    shaftMats.set(key, m);
  }
  return m;
};

// Open cone, h tall, r at the base, apex at +h/2 — place the apex at the lamp.
export function shaftCone(color, h, r, opacity) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 10, 1, true), shaftMat(color, h, opacity));
  m.userData.noBatch = true;
  return m;
}

// Traffic cone ~0.65 m: chamfered base, tapered body, white band.
export function cone() {
  const g = new THREE.Group();
  const p = kitMats.tint();
  put(g, paint(chamferedBox(0.38, 0.05, 0.38, 0.02, 1, true), 0xe8622a), p, 0, 0.025, 0);
  put(g, paint(new THREE.CylinderGeometry(0.16, 0.045, 0.55, 10), 0xe8622a), p, 0, 0.32, 0);
  put(g, paint(new THREE.CylinderGeometry(0.105, 0.135, 0.11, 10), 0xf2ede2), p, 0, 0.42, 0);
  put(g, paint(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 8), 0xe8622a), p, 0, 0.62, 0);
  return g;
}
