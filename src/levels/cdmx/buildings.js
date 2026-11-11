import * as THREE from 'three';
import { lam, basic } from '../../engine/post.js';
import * as T from '../../engine/textures.js';
import { bakeAO } from '../../world/builder.js';

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
  /*
   * Per-set context blocks: stepped CDMX mid-rises ringing each hero set far enough away
   * to read as skyline through the shot fog, close enough to stay out of the hero
   * geometry. Everything shares the facade atlas + KIT materials, so the whole pass
   * merges into a handful of draw calls.
   */
  const blocks = [
    // Around the Ángel plaza (hero glass towers live in props.js).
    [-52, -72, 14, 12, 30, 'c1'], [30, -80, 16, 12, 44, 'c2'], [-32, -92, 12, 10, 24, 'c3'],
    [58, -62, 14, 12, 36, 'c4'], [-72, -42, 12, 10, 20, 'c5'], [78, -32, 14, 12, 30, 'c6'],
    [8, -100, 18, 14, 52, 'c7'], [-95, -70, 14, 12, 26, 'c8'],
    // Metro viaduct horizon.
    [-60, -365, 14, 12, 28, 'm1'], [52, -375, 16, 12, 40, 'm2'], [-32, -395, 12, 10, 22, 'm3'],
    [72, -345, 14, 12, 32, 'm4'], [-95, -330, 16, 12, 24, 'm5'],
    // Abarrotes street flanks (the corner shop itself is in props.js).
    [22, 294, 10, 9, 15, 'a1'], [57, 296, 11, 9, 19, 'a2'], [28, 314, 12, 10, 26, 'a3'],
    [52, 315, 10, 9, 14, 'a4'],
    // Park tree-line: low blocks beyond the dark trees.
    [-325, -115, 14, 12, 24, 'p1'], [-248, -125, 16, 12, 32, 'p2'], [-345, -55, 12, 10, 18, 'p3'],
    [-255, -140, 14, 12, 20, 'p4'],
    // Biblioteca surroundings.
    [-345, 95, 14, 12, 28, 'b1'], [-258, 145, 12, 10, 22, 'b2'], [-335, 155, 12, 12, 34, 'b3'],
    [-275, 90, 10, 9, 16, 'b4'],
    // Torre district lower right.
    [345, -205, 16, 12, 42, 't1'], [278, -215, 14, 12, 30, 't2'], [365, -150, 14, 12, 38, 't3'],
    [255, -190, 12, 10, 26, 't4'],
  ];
  blocks.forEach(([x, z, w, d, h, seed], i) => {
    building(b, {
      x, z, w, d, h, ry: 0, seed,
      shop: i % 4 === 0 ? { kind: 'shutter', name: NAMES[(i * 5) % NAMES.length] } : null,
      balconies: h > 20,
      roof: i % 2 === 0,
    });
  });

  // Power poles + sagging spans along the abarrotes street for depth.
  const poles = [];
  for (const x of [30.5, 51.5]) poles.push(pole(b, x, 302.9, 6.4));
  for (let i = 0; i + 1 < poles.length; i++) {
    powerSpan(b, poles[i], poles[i + 1]);
    powerSpan(b, { x: poles[i].x, y: poles[i].y - 0.35, z: poles[i].z }, { x: poles[i + 1].x, y: poles[i + 1].y - 0.35, z: poles[i + 1].z }, 0.9);
  }
}
