import * as THREE from 'three';
import { lam, basic } from '../../engine/post.js';
import * as T from '../../engine/textures.js';
import { bakeAO } from '../../world/builder.js';
import { NPC } from '../../world/person.js';

/*
 * Procedural CDMX architecture kit. `building()` composes a stepped concrete block with a
 * facade texture pair (albedo + emissive windows), roof clutter (tinaco, antenna, rebar,
 * AC units), balconies, and an optional ground-floor shopfront. Everything is plain meshes
 * with baked AO so batchWorld merges the whole city into a handful of draw calls.
 */

const add = (b, geo, mat, x, y, z, { parent = b.scene, ry = 0, rx = 0, rz = 0 } = {}) => {
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
const box = (b, w, h, d, mat, x, y, z, opts = {}) =>
  add(b, new THREE.BoxGeometry(w, h, d), mat, x, y, z, opts);
const cyl = (b, r0, r1, h, seg, mat, x, y, z, opts = {}) =>
  add(b, new THREE.CylinderGeometry(r0, r1, h, seg), mat, x, y, z, opts);

// Deterministic per-seed PRNG for massing decisions.
const prng = (key) => {
  let s = 2166136261;
  for (const ch of key) s = Math.imul(s ^ ch.charCodeAt(0), 16777619) >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
};

// Facades live in two atlas textures (albedo + emissive windows) laid out as a
// 4x4 grid of 256x512 cells with a gutter so mipmaps don't bleed across buildings.
// Every tier picks one of 14 presets by aspect plus a per-seed jitter, and the
// whole city shares ONE lambert material — all facades merge into a single call.
const FACADE_PRESETS = [
  ['#5a5470', 3, 4, 0], ['#6a5a52', 4, 5, 1], ['#4e5a66', 4, 6, 2],
  ['#66584e', 5, 5, 0], ['#575060', 3, 6, 1], ['#6e6258', 4, 7, 2],
  ['#4a5568', 5, 7, 0], ['#705c50', 6, 6, 1], ['#5a5470', 4, 8, 2],
  ['#6a5a52', 6, 8, 0], ['#4e5a66', 3, 5, 1], ['#66584e', 5, 4, 2],
  ['#575060', 6, 5, 0], ['#6e6258', 3, 7, 1],
];
const ATLAS_COLS = 4, ATLAS_CW = 256, ATLAS_CH = 512, ATLAS_GUT = 16;
const atlasTex = (w, h) => {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return { canvas, g: canvas.getContext('2d'), tex };
};
let facadeAtlas = null;
const facadeAtlases = () => {
  if (!facadeAtlas) {
    const W = ATLAS_COLS * ATLAS_CW, H = ATLAS_COLS * ATLAS_CH;
    const alb = atlasTex(W, H), emi = atlasTex(W, H);
    FACADE_PRESETS.forEach(([base, cols, rows, style], i) => {
      const col = i % ATLAS_COLS, row = (i / ATLAS_COLS) | 0;
      // Uniform downscale leaves a gutter on every side so mips never sample a neighbour.
      const dw = ATLAS_CW - ATLAS_GUT * 2, dh = dw * (ATLAS_CH / ATLAS_CW);
      const dx = col * ATLAS_CW + ATLAS_GUT + (ATLAS_CW - ATLAS_GUT * 2 - dw) / 2;
      const dy = row * ATLAS_CH + ATLAS_GUT + (ATLAS_CH - ATLAS_GUT * 2 - dh) / 2;
      alb.g.drawImage(T.buildingTex(base, cols, rows, `p${i}`).image, dx, dy, dw, dh);
      emi.g.drawImage(T.windowsTex(cols, rows, `p${i}s${style}`).image, dx, dy, dw, dh);
    });
    alb.tex.needsUpdate = emi.tex.needsUpdate = true;
    facadeAtlas = { alb, emi };
  }
  return facadeAtlas;
};
let facadeMatShared = null;
const facadeMaterial = () => {
  if (!facadeMatShared) {
    const A = facadeAtlases();
    facadeMatShared = lam({
      map: A.alb.tex, emissive: 0xffffff, emissiveMap: A.emi.tex, emissiveIntensity: 0.9,
      vertexColors: true,
    });
  }
  return facadeMatShared;
};
// UV rect of a preset's drawn region inside the atlas (flipped V, gutter-aware).
const facadeUV = (i) => {
  const col = i % ATLAS_COLS, row = (i / ATLAS_COLS) | 0;
  const dw = ATLAS_CW - ATLAS_GUT * 2, dh = dw * (ATLAS_CH / ATLAS_CW);
  const dx = col * ATLAS_CW + ATLAS_GUT + (ATLAS_CW - ATLAS_GUT * 2 - dw) / 2;
  const dy = row * ATLAS_CH + ATLAS_GUT + (ATLAS_CH - ATLAS_GUT * 2 - dh) / 2;
  const W = ATLAS_COLS * ATLAS_CW, H = ATLAS_COLS * ATLAS_CH;
  return [dx / W, 1 - (dy + dh) / H, (dx + dw) / W, 1 - dy / H];
};
const facadeCell = (w, h, seed, tier) => {
  const wantC = Math.max(2, w / 2.6), wantR = Math.max(2, h / 3.4);
  let best = 0, bestScore = Infinity;
  FACADE_PRESETS.forEach(([, cols, rows], i) => {
    const jit = prng(`fac|${seed}|${tier}|${i}`)() * 0.9;
    const score = Math.abs(cols - wantC) * 1.6 + Math.abs(rows - wantR) + jit;
    if (score < bestScore) { bestScore = score; best = i; }
  });
  return best;
};
// BoxGeometry whose every face samples one facade cell.
const facadeGeo = (w, h, d, cell) => {
  const geo = new THREE.BoxGeometry(w, h, d);
  const [u0, v0, u1, v1] = facadeUV(cell);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  return geo;
};

const KIT = {
  dark: lam({ color: 0x14101c, vertexColors: true }),
  plaster: lam({ map: T.plasterTex('#4c4458', '#241e30'), vertexColors: true }),
  concrete: lam({ map: T.concreteTex(), vertexColors: true }),
  metal: lam({ color: 0x4a4f58, vertexColors: true }),
  rust: lam({ color: 0x6a4a3a, vertexColors: true }),
  wire: lam({ color: 0x0c0c12, vertexColors: true }),
  shutter: lam({ map: T.shutterTex(), vertexColors: true }),
  awningA: lam({ map: T.awningTex('#b3322c', '#e8ddc4'), vertexColors: true, side: THREE.DoubleSide }),
  awningB: lam({ map: T.awningTex('#1f4a7a', '#e8ddc4'), vertexColors: true, side: THREE.DoubleSide }),
  awningC: lam({ map: T.awningTex('#2e6fd9', '#f2e6c8'), vertexColors: true, side: THREE.DoubleSide }),
  glowWarm: lam({ color: 0xffd9a0, emissive: 0xffb060, emissiveIntensity: 0.9, vertexColors: true }),
  stairGlow: basic({ color: 0xffe0b0 }),
};
/*
 * Wall murals share a 4x4 atlas of 256x128 cells in one 1024x512 canvas — a single
 * material for all blank-wall art. Cells are hash-assigned per seed; a collision
 * just means two walls share a mural, which reads fine at night.
 */
const MURAL_COLS = 4, MURAL_CW = 256, MURAL_CH = 128, MURAL_GUT = 8;
const MURAL_CELLS = MURAL_COLS * MURAL_COLS;
let muralAtlas = null;
const muralAtlasTex = () => {
  if (!muralAtlas) {
    muralAtlas = { ...atlasTex(MURAL_COLS * MURAL_CW, MURAL_COLS * MURAL_CH), drawn: new Set() };
  }
  return muralAtlas;
};
const muralCell = (seed) => {
  let h = 0;
  for (const ch of String(seed)) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  return h % MURAL_CELLS;
};
const muralUV = (cell) => {
  const col = cell % MURAL_COLS, row = (cell / MURAL_COLS) | 0;
  const W = MURAL_COLS * MURAL_CW, H = MURAL_COLS * MURAL_CH;
  const dw = MURAL_CW - MURAL_GUT * 2, dh = dw * (MURAL_CH / MURAL_CW);
  const dx = col * MURAL_CW + MURAL_GUT + (MURAL_CW - MURAL_GUT * 2 - dw) / 2;
  const dy = row * MURAL_CH + MURAL_GUT + (MURAL_CH - MURAL_GUT * 2 - dh) / 2;
  return [dx / W, 1 - (dy + dh) / H, (dx + dw) / W, 1 - dy / H];
};
let muralMatShared = null;
const muralMaterial = () => {
  if (!muralMatShared) muralMatShared = basic({ map: muralAtlasTex().tex });
  return muralMatShared;
};
const muralPlane = (b, seed, w, h, x, y, z, opts = {}) => {
  const A = muralAtlasTex();
  const cell = muralCell(seed);
  if (!A.drawn.has(cell)) {
    const col = cell % MURAL_COLS, row = (cell / MURAL_COLS) | 0;
    const dw = MURAL_CW - MURAL_GUT * 2, dh = dw * (MURAL_CH / MURAL_CW);
    const dx = col * MURAL_CW + MURAL_GUT + (MURAL_CW - MURAL_GUT * 2 - dw) / 2;
    const dy = row * MURAL_CH + MURAL_GUT + (MURAL_CH - MURAL_GUT * 2 - dh) / 2;
    A.g.drawImage(T.muralTex(seed).image, dx, dy, dw, dh);
    A.drawn.add(cell);
    A.tex.needsUpdate = true;
  }
  const geo = new THREE.PlaneGeometry(w, h);
  const [u0, v0, u1, v1] = muralUV(cell);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  return add(b, geo, muralMaterial(), x, y, z, opts);
};

/*
 * Signage atlas: every blade sign in the city shares one 2048x256 canvas (64 cells of
 * 256x32) and one basic material, so all signs merge into a single draw call. Each
 * sign plane gets its UVs remapped to its cell.
 */
const SIGN_CELL_W = 256, SIGN_CELL_H = 32, SIGN_COLS = 8;
let signAtlas = null;
const atlas = () => {
  if (!signAtlas) {
    const canvas = document.createElement('canvas');
    canvas.width = SIGN_COLS * SIGN_CELL_W;
    canvas.height = SIGN_COLS * SIGN_CELL_H;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    signAtlas = { g: canvas.getContext('2d'), tex, cells: new Map() };
  }
  return signAtlas;
};
const signCellUV = (name, bg, fg) => {
  const A = atlas();
  const key = `${name}|${bg}|${fg}`;
  let i = A.cells.get(key);
  if (i === undefined) {
    i = A.cells.size;
    const col = i % SIGN_COLS, row = (i / SIGN_COLS) | 0;
    const x = col * SIGN_CELL_W, y = row * SIGN_CELL_H;
    A.g.fillStyle = bg;
    A.g.fillRect(x, y, SIGN_CELL_W, SIGN_CELL_H);
    A.g.fillStyle = fg;
    A.g.font = `bold ${Math.floor(SIGN_CELL_H * 0.55)}px monospace`;
    A.g.textAlign = 'center';
    A.g.textBaseline = 'middle';
    A.g.fillText(name, x + SIGN_CELL_W / 2, y + SIGN_CELL_H / 2 + 1);
    A.cells.set(key, i);
    A.tex.needsUpdate = true;
  }
  const col = i % SIGN_COLS, row = (i / SIGN_COLS) | 0;
  // Canvas rows run top-down; flipped texture V puts row 0 at v≈1.
  return [col / SIGN_COLS, 1 - (row + 1) / SIGN_COLS, (col + 1) / SIGN_COLS, 1 - row / SIGN_COLS];
};
let signAtlasMat = null;
const signMat = () => {
  if (!signAtlasMat) signAtlasMat = basic({ map: atlas().tex });
  return signAtlasMat;
};
export const signPlane = (b, name, bg, fg, w, h, x, y, z, opts = {}) => {
  const geo = new THREE.PlaneGeometry(w, h);
  const [u0, v0, u1, v1] = signCellUV(name, bg, fg);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  return add(b, geo, signMat(), x, y, z, opts);
};

const NAMES = [
  'FONDA EL SOL', 'COPPELIA', 'NOVEDADES LUPITA', 'TIENDA LA ESPERANZA', 'ABARROTES DON CHEPE',
  'FARMACIA CENTRAL', 'REFACIL', 'MISCELÁNEA LA LUZ', 'CARNICERÍA EL TORO', 'PAPELERÍA NORTE',
  'ESTETICA LA FLOR', 'TALLER DON RAMÓN', 'FRUTERÍA LA MILPA', 'BICICLETERÍA EL PEDAL',
];

/* One stepped concrete building. Local +z is the street face. */
export function building(b, {
  x, z, w = 10, d = 10, h = 18, ry = 0, seed = 'b0',
  shop = null, balconies = true, roof = true,
} = {}) {
  const rnd = prng(`bld|${seed}`);
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  b.scene.add(g);
  const P = (geo, mat, px, py, pz, opts = {}) => add(b, geo, mat, px, py, pz, { ...opts, parent: g });
  const B = (bw, bh, bd, mat, px, py, pz, opts = {}) => P(new THREE.BoxGeometry(bw, bh, bd), mat, px, py, pz, opts);
  const C = (r0, r1, ch, seg, mat, px, py, pz, opts = {}) => P(new THREE.CylinderGeometry(r0, r1, ch, seg), mat, px, py, pz, opts);

  // Massing: 2-3 stepped tiers, each smaller than the last.
  const tiers = [];
  let tw = w, td = d, ty = 0, remain = h;
  const nTiers = h > 40 ? 4 : h > 26 ? 3 : h > 13 ? 2 : 1;
  for (let i = 0; i < nTiers; i++) {
    const th = i === nTiers - 1 ? remain : remain * (0.42 + rnd() * 0.18);
    tiers.push({ w: tw, d: td, h: th, y: ty });
    ty += th;
    remain -= th;
    tw *= 0.72 + rnd() * 0.14;
    td *= 0.72 + rnd() * 0.14;
  }
  tiers.forEach((t, i) => {
    P(facadeGeo(t.w, t.h, t.d, facadeCell(t.w, t.h, seed, i)), facadeMaterial(), 0, t.y + t.h / 2, 0);
    // Parapet rim on each tier's roof edge — a lip, not a lid, so roof clutter stays visible.
    const ph = 0.5, pt = 0.18;
    B(t.w + 0.3, ph, pt, KIT.dark, 0, t.y + t.h + ph / 2, t.d / 2 + 0.05, { collide: false });
    B(t.w + 0.3, ph, pt, KIT.dark, 0, t.y + t.h + ph / 2, -t.d / 2 - 0.05, { collide: false });
    B(pt, ph, t.d + 0.3, KIT.dark, t.w / 2 + 0.05, t.y + t.h + ph / 2, 0, { collide: false });
    B(pt, ph, t.d + 0.3, KIT.dark, -t.w / 2 - 0.05, t.y + t.h + ph / 2, 0, { collide: false });
  });

  const top = tiers[tiers.length - 1];
  const roofY = top.y + top.h;

  // Roof clutter: water tank, antenna, rebar stubs — the CDMX rooftop signature.
  if (roof) {
    if (rnd() < 0.7) {
      // Tinaco: cylinder + cone lid on a low stand.
      C(0.85, 0.85, 0.25, 8, KIT.concrete, top.w * 0.22, roofY + 0.12, top.d * 0.2, { collide: false });
      C(0.72, 0.72, 1.0, 8, KIT.metal, top.w * 0.22, roofY + 0.75, top.d * 0.2, { collide: false });
      const lid = new THREE.ConeGeometry(0.74, 0.4, 8);
      P(lid, KIT.metal, top.w * 0.22, roofY + 1.45, top.d * 0.2, { collide: false });
    }
    if (rnd() < 0.55) {
      C(0.05, 0.08, 4.5 + rnd() * 3, 5, KIT.metal, -top.w * 0.3, roofY + 2.4, -top.d * 0.25, { collide: false });
      for (const sy of [0.35, 0.7]) {
        B(1.1, 0.05, 0.05, KIT.metal, -top.w * 0.3, roofY + 4.5 * sy, -top.d * 0.25, { collide: false });
      }
      B(0.05, 0.05, 1.1, KIT.metal, -top.w * 0.3, roofY + 3.6, -top.d * 0.25, { collide: false });
    }
    if (rnd() < 0.45) {
      for (let i = 0; i < 4; i++) {
        C(0.03, 0.03, 1.4 + rnd() * 1.6, 4, KIT.rust,
          (rnd() - 0.5) * top.w * 0.8, roofY + 0.8, (rnd() - 0.5) * top.d * 0.8, { collide: false });
      }
    }
    // Stairwell bulkhead: small lit box on the roof.
    if (rnd() < 0.5) {
      B(2.2, 2.4, 2.2, KIT.plaster, top.w * 0.3, roofY + 1.2, -top.d * 0.3, { collide: false });
      B(0.5, 0.9, 0.06, KIT.stairGlow, top.w * 0.3, roofY + 1.1, -top.d * 0.3 + 1.12, { collide: false });
    }
  }

  // Balconies on the lowest wide tier, front face only.
  if (balconies && tiers.length > 1) {
    const t0 = tiers[0];
    const nBal = Math.min(3, Math.max(1, Math.round(t0.h / 8)));
    for (let i = 0; i < nBal; i++) {
      const by = 3.4 + i * (t0.h - 4) / Math.max(1, nBal - 1 || 1);
      if (by > t0.h - 1.2) continue;
      const bw = Math.min(2.4, t0.w * 0.3);
      const bx = (rnd() - 0.5) * (t0.w - bw - 1);
      B(bw, 0.14, 0.7, KIT.concrete, bx, by, t0.d / 2 + 0.3, { collide: false });
      B(bw, 0.7, 0.06, KIT.metal, bx, by + 0.45, t0.d / 2 + 0.62, { collide: false });
      // AC unit on some balconies.
      if (rnd() < 0.5) B(0.6, 0.5, 0.4, KIT.metal, bx + bw * 0.2, by + 0.45, t0.d / 2 + 0.25, { collide: false });
    }
    // Wall AC units higher up.
    for (let i = 0; i < 2; i++) {
      B(0.7, 0.55, 0.35, KIT.metal, (rnd() - 0.5) * (t0.w - 2), t0.h * (0.5 + rnd() * 0.3), t0.d / 2 + 0.18, { collide: false });
    }
  }

  // Lit stairwell strip climbing one side edge — the "someone's home" detail.
  if (rnd() < 0.6) {
    const stripH = Math.min(roofY, 14);
    B(0.35, stripH, 0.1, KIT.stairGlow, -w / 2 - 0.06, stripH / 2 + 0.5, 0, { collide: false, ry: Math.PI / 2 });
  }

  // Ground floor: darker plinth band so the shop floor reads separate from the flats above.
  B(w + 0.24, 3.3, d + 0.24, KIT.dark, 0, 1.65, 0, { collide: false });

  if (shop) {
    const sw = Math.min(w * 0.86, shop.w || w * 0.8);
    const front = d / 2 + 0.14;
    if (shop.kind === 'open') {
      // Glowing interior with a shelf line — the shop is open for the night.
      B(sw, 2.6, 0.1, KIT.glowWarm, 0, 1.55, front - 0.05, { collide: false });
      B(sw * 0.8, 0.12, 0.3, KIT.metal, 0, 1.0, front - 0.2, { collide: false });
      B(sw * 0.7, 0.12, 0.3, KIT.metal, 0, 1.7, front - 0.25, { collide: false });
    } else {
      // Roller shutter, half or fully down.
      const shH = shop.kind === 'half' ? 1.5 : 2.7;
      B(sw, shH, 0.1, KIT.shutter, 0, 0.25 + shH / 2, front, { collide: false });
      if (shop.kind === 'half') {
        B(sw, 0.5, 0.12, KIT.glowWarm, 0, 2.0, front - 0.04, { collide: false });
      }
    }
    // Awning on most shops.
    if (shop.awning !== false) {
      const am = [KIT.awningA, KIT.awningB, KIT.awningC][Math.floor(rnd() * 3)];
      B(sw + 0.8, 0.1, 1.5, am, 0, 3.15, front + 0.7, { collide: false, rx: -0.32 });
    }
    // Sign band — shares the city-wide atlas material.
    const nm = shop.name || NAMES[Math.floor(rnd() * NAMES.length)];
    signPlane(b, nm, shop.bg || '#1f1a2e', shop.fg || '#ffd9a0',
      Math.min(sw + 0.6, 9), 0.85, 0, 3.9, front + 0.06, { parent: g });
  } else if (rnd() < 0.4) {
    // Blank-wall mural on some residential blocks.
    const mw = Math.min(w * 0.8, 8);
    muralPlane(b, seed, mw, mw * 0.5, 0, 1.9, d / 2 + 0.16, { parent: g });
  }

  return g;
}

/* Utility pole with crossarm; `h` is pole height. */
export function pole(b, x, z, h = 6, ry = 0) {
  cyl(b, 0.08, 0.13, h, 6, KIT.metal, x, h / 2, z);
  box(b, 1.5, 0.09, 0.09, KIT.metal, x, h - 0.5, z, { ry });
  for (const s of [-0.55, 0, 0.55]) {
    cyl(b, 0.035, 0.045, 0.16, 5, KIT.dark, x + s * Math.cos(ry), h - 0.42, z - s * Math.sin(ry), { collide: false });
  }
  return { x, y: h - 0.5, z };
}

/* Sagging wire between two points (pole tops). One merged tube per call. */
export function powerSpan(b, a, c, sag = 1.1) {
  const mid = new THREE.Vector3((a.x + c.x) / 2, Math.min(a.y, c.y) - sag, (a.z + c.z) / 2);
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(a.x, a.y, a.z), mid, new THREE.Vector3(c.x, c.y, c.z));
  const geo = new THREE.TubeGeometry(curve, 10, 0.028, 4);
  // No noBatch: all spans share KIT.wire so batchWorld merges them into one draw call.
  return add(b, geo, KIT.wire, 0, 0, 0);
}

/*
 * Chain-link fence as real thin bars. The alpha-tested texture dissolves into dither noise
 * at distance; geometry stays a readable fence silhouette. Posts, two rails, verticals.
 */
export function meshFence(b, len = 4, h = 1.8) {
  const g = new THREE.Group();
  const P = (geo, mat, px, py, pz, opts = {}) => add(b, geo, mat, px, py, pz, { ...opts, parent: g });
  const nPosts = Math.max(2, Math.round(len / 2.2) + 1);
  for (let i = 0; i < nPosts; i++) {
    const px = -len / 2 + (len * i) / (nPosts - 1);
    P(new THREE.CylinderGeometry(0.03, 0.035, h + 0.08, 5), KIT.metal, px, h / 2 + 0.04, 0, { collide: false });
    P(new THREE.BoxGeometry(0.16, 0.03, 0.16), KIT.dark, px, 0.015, 0, { collide: false });
  }
  for (const ry of [h - 0.04, h * 0.45, 0.12]) {
    P(new THREE.BoxGeometry(len + 0.06, 0.035, 0.035), KIT.metal, 0, ry, 0, { collide: false });
  }
  const nBars = Math.round(len / 0.45);
  for (let i = 0; i <= nBars; i++) {
    const px = -len / 2 + (len * i) / nBars;
    P(new THREE.BoxGeometry(0.014, h - 0.1, 0.014), KIT.metal, px, h / 2 + 0.02, 0, { collide: false });
  }
  return g;
}

/* Curb + sidewalk strip along a road edge. `side` is +1/-1 in z. */
export function curb(b, x0, x1, z, side = 1) {
  // Curb stone and a slightly raised sidewalk band.
  box(b, x1 - x0, 0.14, 0.3, KIT.concrete, (x0 + x1) / 2, 0.07, z + side * 0.15);
  box(b, x1 - x0, 0.1, 2.6, KIT.concrete, (x0 + x1) / 2, 0.05, z + side * 1.75);
}

/* Simple parked-car silhouette with glowing head/tail lamps. */
const CAR_MATS = new Map();
const carMat = (color) => {
  if (!CAR_MATS.has(color)) CAR_MATS.set(color, lam({ color, emissive: 0x0a0a12, vertexColors: true }));
  return CAR_MATS.get(color);
};
const TAIL_LIGHT = basic({ color: 0xff2a22 });
export function parkedCar(b, x, z, ry = 0, color = 0x23222e) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  b.scene.add(g);
  const P = (geo, mat, px, py, pz, opts = {}) => add(b, geo, mat, px, py, pz, { ...opts, parent: g });
  P(new THREE.BoxGeometry(4.4, 0.9, 1.85), carMat(color), 0, 0.72, 0);
  P(new THREE.BoxGeometry(2.3, 0.75, 1.66), KIT.dark, -0.15, 1.5, 0);
  for (const [wx, wz] of [[-1.4, 0.92], [1.4, 0.92], [-1.4, -0.92], [1.4, -0.92]]) {
    P(new THREE.CylinderGeometry(0.4, 0.4, 0.26, 8), KIT.dark, wx, 0.4, wz, { rx: Math.PI / 2 });
  }
  // Headlights (front = +x local) and tail lights.
  P(new THREE.BoxGeometry(0.1, 0.2, 1.5), KIT.glowWarm, 2.22, 0.8, 0, { collide: false });
  P(new THREE.BoxGeometry(0.1, 0.18, 1.4), TAIL_LIGHT, -2.22, 0.82, 0, { collide: false });
  return g;
}

/*
 * Dress the whole backlot: building rings, street rows, power grid, field pitch,
 * metro platform extras, biblioteca forecourt and ground patches. Called once from
 * world.js after the hero sets so batchWorld merges everything together.
 */
export function dressCity(b) {
  // --- Plaza ring: mid-rise blocks ringing the statue, visible in the angel shot. ---
  const ring = [
    [-52, -18, 12, 12, 16], [-58, -38, 14, 12, 24], [-38, -52, 12, 12, 20],
    [-14, -60, 14, 12, 30], [16, -58, 12, 12, 22], [42, -48, 14, 12, 18],
    [58, -26, 12, 12, 26], [60, 2, 12, 12, 15], [-62, 6, 12, 12, 19],
  ];
  ring.forEach(([x, z, w, d, h], i) => {
    const ry = Math.atan2(-x, -z); // face the plaza centre
    building(b, {
      x, z, w, d, h, ry, seed: `ring${i}`,
      shop: i % 3 === 0 ? { kind: 'shutter', name: NAMES[(i * 5) % NAMES.length] } : null,
      balconies: h > 18,
    });
  });

  // --- Road storefronts: two ranks behind the z=30 road, facing the camera. ---
  const fronts = [
    [-46, 23.5, 10, 9, 'open'], [-34, 23.5, 11, 12, 'shutter'], [-21, 23.5, 9, 8, 'half'],
    [-8, 23.5, 12, 15, 'open'], [6, 23.5, 10, 10, 'shutter'], [19, 23.5, 11, 13, 'open'],
    [32, 23.5, 9, 9, 'half'], [44, 23.5, 10, 11, 'shutter'],
  ];
  fronts.forEach(([x, z, w, h, kind], i) => {
    building(b, {
      x, z, w, d: 9, h, ry: Math.PI, seed: `st${i}`,
      shop: { kind, name: NAMES[(i * 3 + 1) % NAMES.length], bg: ['#1f1a2e', '#3a1f2e', '#1f2e3a'][i % 3], fg: '#ffd9a0' },
      balconies: h > 12,
    });
  });
  const backs = [
    [-40, 14, 13, 10, 26], [-24, 14, 12, 10, 34], [-6, 14, 14, 10, 22],
    [10, 14, 12, 10, 30], [28, 14, 13, 10, 24], [44, 14, 11, 10, 18],
  ];
  backs.forEach(([x, z, w, d, h], i) => {
    building(b, { x, z, w, d, h, ry: Math.PI, seed: `bk${i}`, shop: null, balconies: true });
  });

  // --- Power grid along the road and plaza edge. ---
  const poles = [];
  for (let x = -48; x <= 48; x += 16) poles.push(pole(b, x, 20.5, 6.2));
  for (let i = 0; i + 1 < poles.length; i++) {
    powerSpan(b, poles[i], poles[i + 1]);
    powerSpan(b, { x: poles[i].x, y: poles[i].y - 0.35, z: poles[i].z }, { x: poles[i + 1].x, y: poles[i + 1].y - 0.35, z: poles[i + 1].z }, 0.9);
  }
  // Cross-street run toward the plaza.
  const p2 = pole(b, -20, 8, 6.2, 0.4);
  const p3 = pole(b, 12, 2, 6.2, -0.3);
  powerSpan(b, poles[1], p2, 1.3);
  powerSpan(b, p2, p3, 1.5);

  // --- Road dressing: curbs, parked cars, markings. ---
  curb(b, -48, 48, 26.6, -1);
  curb(b, -48, 48, 33.4, 1);
  parkedCar(b, -18, 27.2, 0.06, 0x2a2438);
  parkedCar(b, 12, 32.8, Math.PI - 0.08, 0x33272a);
  parkedCar(b, 30, 27.4, -0.05, 0x24302a);
  // Painted edge lines and a couple of manholes (merged by batchWorld).
  const lineMat = basic({ color: 0x9a927e });
  for (let x = -46; x < 46; x += 4) {
    add(b, new THREE.PlaneGeometry(2.2, 0.14), lineMat, x + 1.1, 0.028, 26.85, { rx: -Math.PI / 2 });
    add(b, new THREE.PlaneGeometry(2.2, 0.14), lineMat, x + 1.1, 0.028, 33.15, { rx: -Math.PI / 2 });
  }
  const manMat = lam({ color: 0x1c1a22, vertexColors: true });
  for (const [x, z] of [[-30, 30], [-4, 31.5], [22, 29.5], [38, 31]]) {
    const mh = new THREE.CylinderGeometry(0.55, 0.55, 0.03, 12);
    add(b, mh, manMat, x, 0.035, z);
  }
  // Dark patch repairs in the cobbles.
  const patchMat = lam({ color: 0x2c2740, vertexColors: true });
  for (const [x, z, s] of [[-36, 24, 3], [-12, 34, 2.4], [18, 25, 2.8], [40, 33, 2], [-52, 12, 3.4], [8, -4, 2.6]]) {
    const pg = new THREE.CircleGeometry(s * 0.5, 10);
    pg.rotateX(-Math.PI / 2);
    pg.scale(1, 1, 0.7);
    pg.translate(x, 0.018, z);
    add(b, pg, patchMat, 0, 0, 0);
  }

  // --- Field: grass pitch, goalposts, floodlights, perimeter buildings. ---
  const FX = -150, FZ = -72;
  const grass = lam({ map: T.grassTex(), vertexColors: true });
  add(b, new THREE.PlaneGeometry(90, 90), grass, FX, 0.012, FZ, { rx: -Math.PI / 2 });
  // Pitch markings: boundary, halfway line, centre circle, penalty boxes.
  const mark = basic({ color: 0xd8d2c0 });
  const stripe = (w, l, x, z, ry = 0) => {
    const m = new THREE.PlaneGeometry(w, l);
    m.rotateX(-Math.PI / 2);
    m.rotateY(ry);
    m.translate(x, 0.03, z);
    add(b, m, mark, 0, 0, 0);
  };
  stripe(90, 0.3, FX, FZ - 44); stripe(90, 0.3, FX, FZ + 44);
  stripe(0.3, 88, FX - 44, FZ); stripe(0.3, 88, FX + 44, FZ);
  stripe(0.3, 88, FX, FZ);
  const circ = new THREE.RingGeometry(6, 6.3, 24);
  circ.rotateX(-Math.PI / 2);
  circ.translate(FX, 0.03, FZ);
  add(b, circ, mark, 0, 0, 0);
  stripe(16, 0.3, FX - 36, FZ - 20); stripe(16, 0.3, FX - 36, FZ + 20);
  stripe(0.3, 40, FX - 36, FZ);
  // Goals at both ends.
  for (const s of [-1, 1]) {
    const gz = FZ + s * 43;
    for (const px of [-3.6, 3.6]) {
      cyl(b, 0.07, 0.07, 2.6, 6, KIT.metal, FX + px, 1.3, gz, { collide: false });
    }
    box(b, 7.6, 0.09, 0.09, KIT.metal, FX, 2.55, gz, { collide: false });
    // Net suggestion: faint plane behind the mouth.
    const net = new THREE.PlaneGeometry(7.2, 2.4);
    net.rotateY(Math.PI / 2);
    add(b, net, basic({ color: 0x9aa4b8, transparent: true, opacity: 0.16, depthWrite: false }), FX + s * 0.8, 1.3, gz, { collide: false });
  }
  // Floodlight pylons at the corners with real lights (pool picks nearest per shot).
  const headMat = b.glowMat({ color: 0xeef2ff }, 0x1a1c26);
  for (const [dx, dz] of [[-38, -38], [38, -38], [-38, 38], [38, 38]]) {
    cyl(b, 0.14, 0.22, 11, 6, KIT.metal, FX + dx, 5.5, FZ + dz, { collide: false });
    box(b, 1.6, 0.9, 0.3, KIT.metal, FX + dx, 11.2, FZ + dz, { collide: false });
    box(b, 1.4, 0.7, 0.1, headMat, FX + dx, 11.2, FZ + dz + 0.2, { collide: false });
    b.light(FX + dx, 10.6, FZ + dz, 0xcfe0ff, 26, 42);
  }
  // Distant blocks beyond the fence so the field doesn't end in fog.
  for (let i = 0; i < 6; i++) {
    const bx = FX - 30 + i * 13, bz = FZ - 62 - (i % 2) * 10;
    building(b, { x: bx, z: bz, w: 12 + (i % 3) * 3, d: 11, h: 16 + (i * 5) % 22, seed: `fd${i}`, shop: null, balconies: false, roof: i % 2 === 0 });
  }

  // --- Biblioteca forecourt: planters, lamp, kiosk, readers. ---
  const BX = -75, BZ = -55;
  for (const [dx, dz] of [[-16, 12], [16, 12], [-20, 4], [20, 4]]) {
    box(b, 2.6, 0.7, 1.1, KIT.concrete, BX + dx, 0.35, BZ + dz + 6);
    const bush = new THREE.IcosahedronGeometry(0.75, 0);
    bush.scale(1.3, 0.7, 0.9);
    add(b, bush, lam({ color: 0x2c4426, vertexColors: true }), BX + dx, 0.95, BZ + dz + 6, { collide: false });
  }
  cyl(b, 0.09, 0.14, 4.6, 6, KIT.metal, BX - 24, 2.3, BZ + 9);
  const bl = new THREE.SphereGeometry(0.3, 8, 6);
  add(b, bl, KIT.glowWarm, BX - 24, 4.8, BZ + 9, { collide: false });
  b.light(BX - 24, 4.6, BZ + 9, 0xffb066, 18, 18);
  // Kiosk: small lit booth with a shutter half-open.
  box(b, 3, 2.6, 2.4, KIT.plaster, BX + 22, 1.3, BZ + 8);
  box(b, 2.4, 1.1, 0.1, KIT.shutter, BX + 22, 1.5, BZ + 9.25, { collide: false });
  box(b, 2.6, 0.7, 0.15, KIT.awningA, BX + 22, 2.4, BZ + 10.1, { collide: false, rx: -0.3 });
  b.light(BX + 22, 2.0, BZ + 8.5, 0xffcf8a, 10, 12);
  // Readers on a bench facing the mural — quiet life at the library steps.
  box(b, 2.8, 0.14, 0.7, KIT.concrete, BX - 8, 0.55, BZ + 10.6, { collide: false });
  box(b, 2.8, 0.55, 0.12, KIT.concrete, BX - 8, 0.92, BZ + 10.95, { collide: false });
  for (const [i, o] of [
    [0, { top: '#3a4a6e', bottom: '#2a3244', skin: '#c9a184', hair: '#1c1816', outfit: 'tee' }],
    [1, { top: '#6e3a4a', bottom: '#3a2a30', skin: '#a87e62', hair: '#0e0c0a', outfit: 'dress', dress: true }],
  ]) {
    const r = new NPC({ ...o, pose: 'sit', height: 0.96 + i * 0.04 }, b.scene);
    r.place(BX - 8.6 + i * 1.3, BZ + 10.3);
    r.face(BX, BZ - 20);
  }

  // --- Metro platform extras: pillars, hanging signs, bench, headlight. ---
  const MX = -115, MZ = 22;
  for (const px of [MX - 7, MX + 7]) {
    cyl(b, 0.28, 0.32, 6.8, 8, KIT.metal, px, 3.4, MZ + 3, { collide: false });
    box(b, 0.9, 0.5, 0.9, KIT.metal, px, 6.9, MZ + 3, { collide: false });
  }
  // Hanging blade signs over the platform (planes facing the arriving camera).
  for (const [sx, nm] of [[MX - 4, 'SALIDA'], [MX + 9, 'MERCADO'], [MX - 11, 'ANDÉN']]) {
    signPlane(b, nm, '#1f4a7a', '#ffffff', 1.4, 0.7, sx, 4.6, MZ + 5, { collide: false });
    box(b, 0.05, 1.2, 0.05, KIT.metal, sx, 5.6, MZ + 5, { collide: false });
  }
  // Second bench + trash can.
  box(b, 2.6, 0.12, 0.65, KIT.concrete, MX - 2, 1.62, MZ - 6, { collide: false });
  box(b, 2.6, 0.6, 0.1, KIT.concrete, MX - 2, 1.95, MZ - 5.68, { collide: false });
  cyl(b, 0.3, 0.26, 0.85, 8, KIT.rust, MX + 14.5, 1.55, MZ - 4, { collide: false });
  // Tactile paving strip beside the yellow line (raised dots, cheap geometry).
  for (let i = 0; i < 40; i++) {
    const dx = MX - 16.5 + i * 0.85;
    cyl(b, 0.06, 0.06, 0.035, 5, KIT.concrete, dx, 1.14, MZ - 7.4, { collide: false });
  }
  // Train headlight: bright lamp + additive throw down the track.
  const hl = new THREE.SphereGeometry(0.22, 8, 6);
  add(b, hl, KIT.glowWarm, MX - 23.5, 1.5, MZ - 8.2, { collide: false });
  b.light(MX - 22, 1.8, MZ - 9, 0xffd9a0, 14, 16);
  const throwMat = basic({ color: 0xffd9a0, transparent: true, opacity: 0.05, depthWrite: false, blending: THREE.AdditiveBlending });
  const throwCone = new THREE.ConeGeometry(2.2, 14, 10, 1, true);
  const tc = add(b, throwCone, throwMat, MX - 27, 1.4, MZ - 8.4, { collide: false, rz: Math.PI / 2 });
  tc.userData.noBatch = true;
  // Destination board glow over the platform.
  signPlane(b, 'CENTRO · LÍNEA 3', '#101820', '#7fd1ff', 5, 0.8, MX - 9, 6.6, MZ + 1, { collide: false });

  // --- Abarrotes: two-storey blocks rising behind the shop row. ---
  for (let i = 0; i < 3; i++) {
    const sx = [-9, 0, 9][i];
    building(b, {
      x: sx, z: 74, w: 8.5, d: 7, h: 12 + i * 3, ry: 0, seed: `ab${i}`,
      shop: null, balconies: true, roof: true,
    });
  }

  // --- Torre roof clutter: antenna farm on the existing stepped tower. ---
  cyl(b, 0.06, 0.1, 7, 5, KIT.metal, 80, 79, -95, { collide: false });
  box(b, 1.6, 0.06, 0.06, KIT.metal, 80, 82.5, -95, { collide: false });
  box(b, 0.06, 0.06, 1.6, KIT.metal, 80, 81.8, -95, { collide: false });
  cyl(b, 0.9, 0.9, 1.1, 8, KIT.metal, 76, 74.5, -92, { collide: false });
  const tlid = new THREE.ConeGeometry(0.95, 0.5, 8);
  add(b, tlid, KIT.metal, 76, 75.6, -92, { collide: false });
}
