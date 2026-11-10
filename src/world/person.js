import * as THREE from 'three';
import { lam } from '../engine/post.js';
import { canvasTexture } from '../engine/textures.js';

/*
 * Skinned low-poly humanoid (PS2 mannequin style). One continuous body mesh — torso, arms and
 * legs are welded ring tubes whose vertices blend between neighbouring bones, so shoulders,
 * elbows, hips and knees bend seamlessly. A small THREE.Skeleton (hips/spine/chest/neck/head,
 * upperArm+foreArm, thigh+shin) drives it; the head is a separate mesh parented to the head
 * bone. Everything faces +z, feet rest at y=0 and `body` scales by `height`.
 *
 * Textures come from one shared 512x512 canvas atlas per outfit (diffuse) plus a matching
 * emissive atlas, so a crowd reuses a handful of materials. legs/arms/head stay the contract
 * pivots: legs[i] is the thigh bone, arms[i] the upperArm bone, head the head bone.
 */

// Deterministic per-key PRNG so crowd textures look identical on every load and spawn order
// does not matter (unlike the shared texture seed, which advances with call order).
const hashStr = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
const lcg = (seed) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;

// '#rrggbb' -> '#rrggbb' darkened, so authored tones never clip under hot lamps.
const dim = (color, f) => `#${new THREE.Color(color).multiplyScalar(f).getHexString()}`;

const smooth = (x, a, b) => THREE.MathUtils.smoothstep(x, a, b);

// Recolour a hex to a target linear luminance while keeping its hue (for the emissive atlas).
const lumColor = (hex, target) => {
  const c = new THREE.Color(hex);
  const l = Math.max(1e-4, 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b);
  return `#${c.multiplyScalar(target / l).getHexString()}`;
};

/* ------------------------------------------------------------------ atlas */

// 512x512 atlas cells, [x, y, w, h] in pixels. Every garment/skin region lives in one cell so a
// single material covers the whole body; the face gets the biggest cell because it must read
// at ~6 px on the 360p target.
const CELLS = {
  face: [0, 0, 128, 128],
  skin: [128, 0, 64, 64],
  hair: [192, 0, 128, 128],
  shirt: [0, 128, 128, 128],
  sleeve: [128, 128, 64, 128],
  jeans: [192, 128, 128, 128],
  skirt: [320, 128, 128, 64],
  shoe: [0, 256, 64, 64],
  cap: [64, 256, 64, 64],
  glasses: [128, 256, 48, 32],
};
const ATLAS = 512;

// Local (lu, lv) in [0,1] inside a cell -> atlas UV. lv=1 is the cell's top edge (canvas y=cy).
const cellUV = (name, lu, lv) => {
  const [cx, cy, cw, ch] = CELLS[name];
  const px = cx + lu * cw;
  const py = cy + (1 - lv) * ch;
  return [px / ATLAS, 1 - py / ATLAS];
};

// Soft radial blob helper used by several painters.
const soft = (g, x, y, r, color) => {
  const gr = g.createRadialGradient(x, y, 1, x, y, r);
  gr.addColorStop(0, color);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, r * 2, r * 2);
};

// Painted face, shared by the diffuse and emissive atlases. Painted in 64x64 space and scaled
// into the 128px face cell; `emis` lifts the base skin so sockets/brows/mouth self-illuminate.
function paintFace(g, x, y, w, h, skin, hollow, emis) {
  g.save();
  g.translate(x, y);
  g.scale(w / 64, h / 64);
  const base = emis ? lumColor(skin, 0.45) : skin;
  g.fillStyle = base;
  g.fillRect(0, 0, 64, 64);
  soft(g, 32, 16, 26, 'rgba(255,255,255,0.07)');
  soft(g, 18, 46, 15, 'rgba(120,60,40,0.12)');
  soft(g, 46, 46, 15, 'rgba(120,60,40,0.12)');
  const rnd = lcg(hashStr(`face|${skin}|${hollow}|${emis}`));
  for (const ex of [16, 48]) {
    g.fillStyle = 'rgba(32,17,12,0.95)';
    g.beginPath();
    g.ellipse(ex, 30, hollow ? 11.5 : 10.5, hollow ? 9.5 : 8, 0, 0, Math.PI * 2);
    g.fill();
    if (hollow) {
      g.fillStyle = '#030203';
      g.beginPath();
      g.ellipse(ex, 30.5, 8, 7, 0, 0, Math.PI * 2);
      g.fill();
    } else {
      g.fillStyle = '#ece5d6';
      g.beginPath();
      g.ellipse(ex, 30, 7.2, 6, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#191310';
      g.beginPath();
      g.arc(ex, 31, 3.4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.95)';
      g.fillRect(ex - 2.1, 28.4, 2.3, 2.3);
      g.strokeStyle = 'rgba(52,28,20,0.55)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.ellipse(ex, 31.5, 6.2, 4, 0, 0.15 * Math.PI, 0.85 * Math.PI);
      g.stroke();
    }
    g.strokeStyle = 'rgba(18,12,9,0.97)';
    g.lineWidth = 4.0;
    g.beginPath();
    g.moveTo(ex - (ex < 32 ? 7 : -7), 19.5 + (rnd() - 0.5));
    g.quadraticCurveTo(ex, 17.5 + (rnd() - 0.5), ex + (ex < 32 ? 7 : -7), 20 + (rnd() - 0.5));
    g.stroke();
  }
  const ng = g.createLinearGradient(29, 32, 35, 50);
  ng.addColorStop(0, 'rgba(90,50,35,0.34)');
  ng.addColorStop(1, 'rgba(90,50,35,0)');
  g.fillStyle = ng;
  g.fillRect(28, 32, 8, 18);
  soft(g, 32, 46, 5.5, 'rgba(255,255,255,0.12)');
  g.strokeStyle = hollow ? '#120202' : 'rgba(72,26,22,0.95)';
  g.lineWidth = hollow ? 4.5 : 3.3;
  g.beginPath();
  if (hollow) {
    g.fillStyle = '#070303';
    g.ellipse(32, 51.5, 6, 6.5, 0, 0, Math.PI * 2);
    g.fill();
  } else {
    g.moveTo(24, 50);
    g.quadraticCurveTo(32, 55, 40, 50);
    g.stroke();
  }
  g.restore();
}

// Fabric weave + fold shading shared by the garment cells.
function weave(g, x, y, w, h, color, seedKey, amount = 1) {
  const rnd = lcg(hashStr(seedKey));
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
  for (let yy = 0; yy < h; yy += 3) {
    g.fillStyle = `rgba(0,0,0,${(0.03 + rnd() * 0.04) * amount})`;
    g.fillRect(x, y + yy, w, 1);
  }
  for (let xx = 0; xx < w; xx += 3) {
    g.fillStyle = `rgba(255,255,255,${rnd() * 0.03 * amount})`;
    g.fillRect(x + xx, y, 1, h);
  }
  for (let i = 0; i < 4; i++) {
    const fx = x + rnd() * w, fw = 5 + rnd() * 12;
    const gr = g.createLinearGradient(fx - fw, 0, fx + fw, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(0.5, `rgba(0,0,0,${0.05 + rnd() * 0.06 * amount})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(fx - fw, y, fw * 2, h);
  }
}

function paintShirt(g, x, y, w, h, o) {
  const [cx, cy, cw, ch] = CELLS.shirt;
  weave(g, cx, cy, cw, ch, o.top, `shirt|${o.top}|${o.outfit}`, o.outfit === 'uniform' ? 1.3 : 1);
  // Collar band at the cell top (lv ~0.85-1 maps to the torso's neck end).
  const collar = new THREE.Color(o.top).multiplyScalar(0.72).getStyle();
  g.fillStyle = collar;
  g.fillRect(cx, cy, cw, 14);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  for (let i = 0; i < cw; i += 6) g.fillRect(cx + i, cy + 12, 3, 3);
  // Front of the torso lands at u ~0.5 -> cell x ~64; outfit details live in that zone.
  const fx = cx + cw * 0.5;
  const front = (u0, u1, v0, v1, fill) => {
    g.fillStyle = fill;
    g.fillRect(cx + u0 * cw, cy + (1 - v1) * ch, (u1 - u0) * cw, (v1 - v0) * ch);
  };
  const darker = new THREE.Color(o.top).multiplyScalar(0.6).getStyle();
  switch (o.outfit) {
    case 'hoodie': {
      // Kangaroo pocket low on the belly and two drawstring dots at the collar.
      front(0.40, 0.60, 0.18, 0.38, darker);
      g.fillStyle = 'rgba(0,0,0,0.4)';
      g.fillRect(cx + 0.465 * cw, cy + 4, 4, 16);
      g.fillRect(cx + 0.515 * cw, cy + 4, 4, 16);
      break;
    }
    case 'jacket': {
      // Zip line down the front and two pocket flaps.
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(fx - 2, cy + 12, 4, ch - 30);
      front(0.36, 0.47, 0.30, 0.46, darker);
      front(0.53, 0.64, 0.30, 0.46, darker);
      break;
    }
    case 'apron': {
      // Bib straps + long panel down the belly, in the trouser colour.
      front(0.42, 0.58, 0.68, 0.90, o.bottom);
      front(0.40, 0.60, 0.14, 0.74, o.bottom);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(cx + 0.49 * cw, cy + (1 - 0.74) * ch, cw * 0.02, ch * 0.60);
      break;
    }
    case 'suit': {
      // Shirt V at the collar and a tie down the chest.
      front(0.44, 0.56, 0.66, 0.88, '#ddd8cc');
      front(0.475, 0.525, 0.34, 0.68, '#1c1a20');
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(cx + 0.44 * cw, cy + (1 - 0.88) * ch - 8, cw * 0.12, 4);
      break;
    }
    case 'uniform': {
      // Chest stripe and a pocket square.
      front(0.30, 0.70, 0.62, 0.66, darker);
      front(0.56, 0.66, 0.42, 0.52, darker);
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.fillRect(cx + 0.575 * cw, cy + (1 - 0.52) * ch, cw * 0.04, ch * 0.07);
      break;
    }
    case 'dress': {
      // Sweetheart neckline and a waist seam where the skirt begins.
      g.fillStyle = darker;
      g.beginPath();
      g.moveTo(fx - cw * 0.09, cy + 6);
      g.quadraticCurveTo(fx, cy + ch * 0.16, fx + cw * 0.09, cy + 6);
      g.lineTo(fx + cw * 0.07, cy + 14);
      g.quadraticCurveTo(fx, cy + ch * 0.22, fx - cw * 0.07, cy + 14);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(cx, cy + (1 - 0.72) * ch, cw, 3);
      break;
    }
    default:
      break; // tee: crew collar only
  }
}

function paintSleeve(g, x, y, w, h, o) {
  const [cx, cy, cw, ch] = CELLS.sleeve;
  weave(g, cx, cy, cw, ch, o.top, `sleeve|${o.top}|${o.outfit}`, 0.8);
  // Cuff band near the cell top (wrist end, lv~1).
  g.fillStyle = new THREE.Color(o.top).multiplyScalar(0.7).getStyle();
  g.fillRect(cx, cy, cw, 10);
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.fillRect(cx, cy + 10, cw, 2);
  if (o.outfit === 'dress') {
    // Lace trim: a pale scalloped band at the cuff plus fine vertical lace lines.
    g.fillStyle = 'rgba(250,246,236,0.85)';
    g.fillRect(cx, cy, cw, 6);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < cw; i += 6) {
      g.beginPath();
      g.arc(cx + i + 3, cy + 6, 2.6, 0, Math.PI);
      g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.28)';
    for (let i = 4; i < cw; i += 8) g.fillRect(cx + i, cy + 14, 1.4, ch * 0.4);
  }
}

function paintJeans(g, x, y, w, h, o) {
  const [cx, cy, cw, ch] = CELLS.jeans;
  const rnd = lcg(hashStr(`jeans|${o.bottom}`));
  weave(g, cx, cy, cw, ch, o.bottom, `jeans|${o.bottom}`, 0.7);
  // Worn fade: pale blotches over the thigh/knee area (cell middle).
  for (let i = 0; i < 7; i++) {
    soft(g, cx + rnd() * cw, cy + ch * (0.35 + rnd() * 0.4), 10 + rnd() * 16, 'rgba(255,255,255,0.06)');
  }
  // Seams at u ~0.25 and ~0.75 (inner/outer leg after right-leg mirroring).
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(cx + cw * 0.25 - 1, cy, 2, ch);
  g.fillRect(cx + cw * 0.75 - 1, cy, 2, ch);
  // Hem stitch at the cell top (ankle end).
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.fillRect(cx, cy, cw, 4);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  for (let i = 0; i < cw; i += 5) g.fillRect(cx + i, cy + 4, 2, 3);
}

function paintSkirt(g, x, y, w, h, o) {
  const [cx, cy, cw, ch] = CELLS.skirt;
  weave(g, cx, cy, cw, ch, o.bottom, `skirt|${o.bottom}`, 0.9);
  const rnd = lcg(hashStr(`skirtd|${o.bottom}`));
  // Vertical fold shadows.
  for (let i = 0; i < 7; i++) {
    const fx = cx + rnd() * cw;
    const gr = g.createLinearGradient(fx - 7, 0, fx + 7, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(0.5, 'rgba(0,0,0,0.14)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(fx - 7, cy, 14, ch);
  }
  // Waistband shadow at the cell bottom (lv~0 -> skirt top sits at the waist).
  g.fillStyle = 'rgba(0,0,0,0.20)';
  g.fillRect(cx, cy + ch - 7, cw, 7);
  // Lace hem at the cell top (skirt bottom, lv~1): a pale band with scallops + dots.
  g.fillStyle = 'rgba(244,240,228,0.9)';
  g.fillRect(cx, cy, cw, 9);
  g.fillStyle = 'rgba(0,0,0,0.16)';
  for (let i = 0; i < cw; i += 7) {
    g.beginPath();
    g.arc(cx + i + 3, cy + 9, 3, 0, Math.PI);
    g.fill();
  }
}

function paintShoe(g, x, y, w, h, o) {
  const [cx, cy, cw, ch] = CELLS.shoe;
  void o;
  g.fillStyle = '#241d16';
  g.fillRect(cx, cy, cw, ch);
  // Sole band at the cell bottom (lv~0-0.25) and a lighter toe stripe.
  g.fillStyle = '#14100c';
  g.fillRect(cx, cy + ch * 0.72, cw, ch * 0.28);
  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.fillRect(cx + 4, cy + 6, cw - 8, 3);
}

function paintHair(g, x, y, w, h, o) {
  const [cx, cy, cw, ch] = CELLS.hair;
  const rnd = lcg(hashStr(`hair|${o.hair}`));
  g.fillStyle = o.hair;
  g.fillRect(cx, cy, cw, ch);
  // Strand strokes: wavy vertical lines in slightly lighter/darker shades.
  for (let i = 0; i < cw; i += 4) {
    const sway = rnd() * 6 - 3;
    g.strokeStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
    g.lineWidth = 1 + rnd();
    g.beginPath();
    g.moveTo(cx + i, cy);
    g.bezierCurveTo(cx + i + sway, cy + ch * 0.33, cx + i - sway, cy + ch * 0.66, cx + i + sway * 0.5, cy + ch);
    g.stroke();
  }
  for (let i = 0; i < 10; i++) soft(g, cx + rnd() * cw, cy + rnd() * ch, 8 + rnd() * 14, 'rgba(0,0,0,0.10)');
}

function paintCap(g, x, y, w, h, o) {
  const [cx, cy, cw, ch] = CELLS.cap;
  const base = new THREE.Color(o.hair).multiplyScalar(0.85).getStyle();
  weave(g, cx, cy, cw, ch, base, `cap|${o.hair}`, 0.6);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  for (let i = 0; i < cw; i += 10) g.fillRect(cx + i, cy, 2, ch);
  soft(g, cx + cw / 2, cy + ch / 2, cw * 0.4, 'rgba(255,255,255,0.06)');
}

function paintGlasses(g, x, y, w, h, o) {
  const [cx, cy, cw, ch] = CELLS.glasses;
  void o;
  g.fillStyle = '#0c0d10';
  g.fillRect(cx, cy, cw, ch);
  g.fillStyle = 'rgba(90,110,140,0.35)';
  g.fillRect(cx + 4, cy + 4, cw * 0.4, ch * 0.4);
  g.fillRect(cx + cw * 0.6, cy + 4, cw * 0.36, ch * 0.4);
}

function paintSkin(g, x, y, w, h, o, emis) {
  const [cx, cy, cw, ch] = CELLS.skin;
  const base = emis ? lumColor(o.skin, 0.5) : dim(o.skin, 0.9);
  const rnd = lcg(hashStr(`skin|${o.skin}`));
  g.fillStyle = base;
  g.fillRect(cx, cy, cw, ch);
  for (let i = 0; i < 8; i++) soft(g, cx + rnd() * cw, cy + rnd() * ch, 6 + rnd() * 10, 'rgba(0,0,0,0.05)');
}

const PAINTERS = {
  diffuse: (g, o) => {
    const cell = (name, fn) => { const [x, y, w, h] = CELLS[name]; fn(g, x, y, w, h, o); };
    cell('face', (gg, x, y, w, h) => paintFace(gg, x, y, w, h, o.skin, o.hollow, false));
    cell('skin', (gg, x, y, w, h) => paintSkin(gg, x, y, w, h, o, false));
    cell('hair', (gg, x, y, w, h) => paintHair(gg, x, y, w, h, o));
    cell('shirt', paintShirt);
    cell('sleeve', paintSleeve);
    cell('jeans', paintJeans);
    cell('skirt', paintSkirt);
    cell('shoe', paintShoe);
    cell('cap', paintCap);
    cell('glasses', paintGlasses);
  },
  emis: (g, o) => {
    const flat = (name, hex, target) => {
      const [x, y, w, h] = CELLS[name];
      g.fillStyle = lumColor(hex, target);
      g.fillRect(x, y, w, h);
    };
    const [fx, fy, fw, fh] = CELLS.face;
    paintFace(g, fx, fy, fw, fh, o.skin, o.hollow, true);
    // Emissive floor ~0.08-0.12 luminance: enough to keep NPCs readable in moonlight without
    // flattening the real Lambert shading (ghosts scale it up via `emissive`).
    flat('skin', o.skin, 0.4);
    flat('hair', o.hair, 0.18);
    flat('shirt', o.top, 0.32);
    flat('sleeve', o.top, 0.32);
    flat('jeans', o.bottom, 0.32);
    flat('skirt', o.bottom, 0.32);
    flat('shoe', '#241d16', 0.24);
    flat('cap', o.hair, 0.28);
    flat('glasses', '#000000', 0.04);
  },
};

// Atlas + material caches keyed by the painted option set, so a crowd shares one texture pair
// and one material per look.
const ATLAS_CACHE = new Map();
const MAT_CACHE = new Map();

const atlasKey = (o) => [o.skin, o.top, o.bottom, o.hair, o.outfit, o.hollow].join('|');

function atlasFor(o) {
  const key = atlasKey(o);
  if (ATLAS_CACHE.has(key)) return ATLAS_CACHE.get(key);
  const diffuse = canvasTexture(ATLAS, ATLAS, (g) => PAINTERS.diffuse(g, o));
  const emis = canvasTexture(ATLAS, ATLAS, (g) => PAINTERS.emis(g, o));
  const entry = { diffuse, emis };
  ATLAS_CACHE.set(key, entry);
  return entry;
}

// Cheap cool rim on top of the PS1 vertex snap: a fresnel term so silhouettes pick up a faint
// moonlit edge. Applied to the shared person material only.
const rim = (mat) => {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev(shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `outgoingLight += vec3(0.05, 0.07, 0.12) * pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), 3.0);
       #include <opaque_fragment>`,
    );
  };
  return mat;
};

function materialFor(o) {
  const key = `${atlasKey(o)}|e${o.emissive}`;
  if (!MAT_CACHE.has(key)) {
    const { diffuse, emis } = atlasFor(o);
    // Emissive floor ~0.1 luminance on garments (emis cells are painted at lum ~0.32, ei ~0.3);
    // the `emissive` option scales it up for ghosts. Skin/face emit a little more via their cells.
    const ei = 0.3 + o.emissive * 0.55;
    MAT_CACHE.set(key, rim(lam({
      map: diffuse, emissive: 0xffffff, emissiveMap: emis, emissiveIntensity: ei,
      vertexColors: true, side: THREE.DoubleSide,
    })));
  }
  return MAT_CACHE.get(key);
}

const veilMat = (() => {
  const cache = new Map();
  return (emissive) => {
    const key = `veil|${emissive}`;
    if (!cache.has(key)) {
      cache.set(key, lam({
        color: 0xe9e4d6, emissive: 0xe9e4d6, emissiveIntensity: Math.max(emissive, 0.1),
        vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.32,
        depthWrite: false,
      }));
    }
    return cache.get(key);
  };
})();

/* ------------------------------------------------------------------ rig */

// Bone order is the skinIndex order. Positions are armature-local (body units, height=1).
const BONES = [
  ['hips', null, 0, 0.93, 0],
  ['spine', 'hips', 0, 0.16, 0],
  ['chest', 'spine', 0, 0.20, 0],
  ['neck', 'chest', 0, 0.16, 0],
  ['head', 'neck', 0, 0.10, 0],
  ['uarmL', 'chest', -0.220, 0.14, 0],
  ['uarmR', 'chest', 0.220, 0.14, 0],
  ['farmL', 'uarmL', 0, -0.30, 0],
  ['farmR', 'uarmR', 0, -0.30, 0],
  ['thighL', 'hips', -0.095, -0.01, 0],
  ['thighR', 'hips', 0.095, -0.01, 0],
  ['shinL', 'thighL', 0, -0.40, 0],
  ['shinR', 'thighR', 0, -0.40, 0],
];
const BONE = Object.fromEntries(BONES.map((b, i) => [b[0], i]));

const W = (...pairs) => pairs; // [[bone, w], ...]
const hips = BONE.hips, spine = BONE.spine, chest = BONE.chest, neck = BONE.neck;
const uarmL = BONE.uarmL, uarmR = BONE.uarmR, farmL = BONE.farmL, farmR = BONE.farmR;
const thighL = BONE.thighL, thighR = BONE.thighR, shinL = BONE.shinL, shinR = BONE.shinR;

/* ------------------------------------------------------------- geometry */

// Accumulates one indexed BufferGeometry with position/normal/uv/color/skinIndex/skinWeight.
function newAcc() {
  return { v: [], n: [], uv: [], c: [], si: [], sw: [], idx: [] };
}

function pushVert(acc, x, y, z, u, v, r, g, b, w) {
  acc.v.push(x, y, z);
  acc.uv.push(u, v);
  acc.c.push(r, g, b);
  // Normal filled later by computeVertexNormals; keep a placeholder slot count aligned.
  acc.n.push(0, 0, 0);
  const sw = new Array(4).fill(0);
  const si = new Array(4).fill(0);
  const list = Array.isArray(w) && w.length && Array.isArray(w[0]) ? w : [[0, 1]];
  let sum = 0;
  for (const [bi, wi] of list) sum += wi;
  sum = sum || 1;
  for (let i = 0; i < Math.min(4, list.length); i++) {
    si[i] = list[i][0];
    sw[i] = list[i][1] / sum;
  }
  acc.si.push(...si);
  acc.sw.push(...sw);
}

// Emit a vertical ring tube. rings: [{y, rx, rz, cx, cz, w, cell, mirror}] where w is a static
// weight list or fn(x,y,z,theta,t,ri)->weights, cell is the atlas cell name, mirror flips u.
function emitTube(acc, rings, { segs = 9, colorFor = () => 0.9, capStart = true, capEnd = true } = {}) {
  const base = acc.v.length / 3;
  const rowBase = [];
  for (let i = 0; i < rings.length; i++) {
    const r = rings[i];
    rowBase.push(acc.v.length / 3);
    for (let j = 0; j <= segs; j++) {
      const t = j / segs;
      const th = t * Math.PI * 2;
      const c = Math.cos(th), s = Math.sin(th);
      const x = (r.cx || 0) + r.rx * c;
      const y = r.y;
      const z = (r.cz || 0) + r.rz * s;
      const w = typeof r.w === 'function' ? r.w(x, y, z, th, t, i) : r.w;
      const [u, v] = cellUV(r.cell, r.mirror ? 1 - t : t, i / (rings.length - 1));
      const shade = colorFor(x, y, z, i / (rings.length - 1));
      pushVert(acc, x, y, z, u, v, shade, shade, shade, w);
    }
  }
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rowBase[i], b = rowBase[i + 1];
    for (let j = 0; j < segs; j++) {
      const a0 = a + j, a1 = a + j + 1, b0 = b + j, b1 = b + j + 1;
      acc.idx.push(a0, b0, a1, a1, b0, b1);
    }
  }
  const cap = (row, up) => {
    const r = rings[row];
    const ci = acc.v.length / 3;
    const [cu, cv] = cellUV(r.cell, 0.5, row / (rings.length - 1));
    const shade = colorFor(r.cx || 0, r.y, r.cz || 0, row / (rings.length - 1));
    pushVert(acc, r.cx || 0, r.y, r.cz || 0, cu, cv, shade, shade, shade, r.w);
    const rb = rowBase[row];
    for (let j = 0; j < segs; j++) {
      if (up) acc.idx.push(ci, rb + j, rb + j + 1);
      else acc.idx.push(ci, rb + j + 1, rb + j);
    }
  };
  if (capStart) cap(0, false);
  if (capEnd) cap(rings.length - 1, true);
}

// Emit a primitive (already-indexed BufferGeometry) transformed into the body, with UVs remapped
// into an atlas cell. cell may be a name or fn(x,y,z)->name for per-vertex regions (skull).
function emitPrim(acc, geo, matrix, { cell = 'skin', weight = [[0, 1]], colorFor = () => 0.9, mirrorU = false } = {}) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, uvA = geo.attributes.uv;
  const idx = geo.index;
  const m = new THREE.Matrix4().copy(matrix);
  const nm = new THREE.Matrix3().getNormalMatrix(m);
  const v = new THREE.Vector3(), n = new THREE.Vector3(), nrm = new THREE.Vector3();
  const cellOf = (x, y, z) => (typeof cell === 'function' ? cell(x, y, z) : cell);
  const map = [];
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(m);
    n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
    const ci = cellOf(v.x, v.y, v.z);
    const [cu, cv] = cellUV(ci, uvA ? (mirrorU ? 1 - uvA.getX(i) : uvA.getX(i)) : 0.5, uvA ? uvA.getY(i) : 0.5);
    const shade = colorFor(v.x, v.y, v.z);
    map.push(acc.v.length / 3);
    pushVert(acc, v.x, v.y, v.z, cu, cv, shade, shade, shade, weight);
    acc.n[acc.n.length - 3] = n.x;
    acc.n[acc.n.length - 2] = n.y;
    acc.n[acc.n.length - 1] = n.z;
  }
  if (idx) for (let i = 0; i < idx.count; i++) acc.idx.push(map[idx.getX(i)]);
  else for (let i = 0; i < pos.count; i++) acc.idx.push(map[i]);
  return acc;
}

// A scaled sphere blob helper for hands/shoes/hair masses.
const blob = (sx, sy, sz, ws = 8, hs = 6) => {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.scale(sx, sy, sz);
  return g;
};

const IDENT = new THREE.Matrix4();
const setM = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

/* --------------------------------------------------------- body sections */

// Width multiplier per build; applied to every ring radius (not height).
const BUILD_W = { slim: 0.88, average: 1.0, heavy: 1.12 };

// Figure silhouettes: 'masc' pushes the chest/shoulders out and the hips in, 'femme' the reverse.
// Neutral (unset) keeps the authored average proportions.
const FIGURE = {
  masc: { chest: 1.05, hip: 0.96 },
  femme: { chest: 0.95, hip: 1.04 },
};

// Torso: pelvis -> waist -> chest -> shoulders -> neck. Rings carry garment UVs (shirt cell) and
// spine/chest/neck weights; shoulder-height verts near the arm roots also pick up arm weight.
// Ring indices 0-2 are hip/pelvis, 3-7 chest/shoulders, 8-10 neck.
function torsoRings(bw, fig = {}) {
  const chestF = fig.chest ?? 1, hipF = fig.hip ?? 1;
  const T = (y, rx, rz, w, f = 1) => ({ y, rx: rx * bw * f, rz: rz * bw * (f === 1 ? 1 : f * 0.6 + 0.4), cx: 0, cz: 0, w, cell: 'shirt' });
  return [
    T(0.885, 0.150, 0.100, W([hips, 0.62], [spine, 0.38]), hipF),
    T(0.950, 0.158, 0.106, W([hips, 0.50], [spine, 0.50]), hipF),
    T(1.030, 0.148, 0.100, W([spine, 0.62], [hips, 0.38]), hipF),
    T(1.110, 0.136, 0.094, W([spine, 0.72], [chest, 0.28]), chestF),
    T(1.190, 0.156, 0.106, W([chest, 0.55], [spine, 0.45]), chestF),
    T(1.270, 0.186, 0.116, W([chest, 0.78], [spine, 0.22]), chestF),
    T(1.350, 0.200, 0.120, W([chest, 0.90], [spine, 0.10]), chestF),
    T(1.420, 0.214, 0.118, W([chest, 0.95], [spine, 0.05]), chestF),
    T(1.450, 0.118, 0.090, W([chest, 0.50], [neck, 0.50]), chestF),
    T(1.485, 0.062, 0.052, W([neck, 0.78], [chest, 0.22]), 1),
    T(1.520, 0.048, 0.040, W([neck, 1]), 1),
  ];
}

// One arm: shoulder cap -> elbow -> wrist, one welded tube. cellFor picks sleeve vs bare skin
// per ring (short vs long sleeves); shoulder rings blend into the chest. Upper arm ~0.08 thick
// tapering to a ~0.045 wrist; the tube ends at the wrist and the hand blobs take over below.
function armRings(side, bw, longSleeve) {
  const cx = side * 0.220 * bw;
  const R = (y, rx, rz, w, cell) => ({ y, rx: rx * bw, rz: rz * bw, cx, cz: 0, w, cell, mirror: side > 0 });
  const shortCut = 1.30; // tee/apron sleeves end mid-bicep; forearm stays bare skin
  const cellAt = (y) => (longSleeve || y >= shortCut ? 'sleeve' : 'skin');
  const u = side < 0 ? uarmL : uarmR, f = side < 0 ? farmL : farmR;
  const rows = [
    [1.460, 0.085, 0.078, W([chest, 0.30], [u, 0.70])],
    [1.410, 0.081, 0.074, W([chest, 0.16], [u, 0.84])],
    [1.350, 0.075, 0.068, W([u, 1])],
    [1.290, 0.070, 0.064, W([u, 1])],
    [1.230, 0.066, 0.060, W([u, 0.90], [f, 0.10])],
    [1.170, 0.062, 0.056, W([u, 0.68], [f, 0.32])],
    [1.120, 0.058, 0.053, W([u, 0.50], [f, 0.50])],
    [1.060, 0.054, 0.049, W([u, 0.30], [f, 0.70])],
    [1.000, 0.051, 0.046, W([f, 1])],
    [0.940, 0.048, 0.043, W([f, 1])],
    [0.850, 0.044, 0.040, W([f, 1])],
  ];
  return rows.map(([y, rx, rz, w]) => R(y, rx, rz, w, cellAt(y)));
}

// One leg: hip -> knee -> ankle, one welded tube. Right leg mirrors u so denim seams face in.
function legRings(side, bw, bare) {
  const cx = side * 0.095 * bw;
  const cell = bare ? 'skin' : 'jeans';
  const R = (y, rx, rz, w) => ({ y, rx: rx * bw, rz: rz * bw, cx, cz: 0, w, cell, mirror: side > 0 });
  return [
    R(0.935, 0.100, 0.092, W([side < 0 ? thighL : thighR, 0.52], [hips, 0.48])),
    R(0.885, 0.093, 0.085, W([side < 0 ? thighL : thighR, 0.70], [hips, 0.30])),
    R(0.800, 0.084, 0.076, W([side < 0 ? thighL : thighR, 1])),
    R(0.700, 0.076, 0.068, W([side < 0 ? thighL : thighR, 1])),
    R(0.610, 0.069, 0.062, W([side < 0 ? thighL : thighR, 0.82], [side < 0 ? shinL : shinR, 0.18])),
    R(0.540, 0.064, 0.058, W([side < 0 ? thighL : thighR, 0.62], [side < 0 ? shinL : shinR, 0.38])),
    R(0.500, 0.061, 0.055, W([side < 0 ? thighL : thighR, 0.50], [side < 0 ? shinL : shinR, 0.50])),
    R(0.450, 0.057, 0.051, W([side < 0 ? thighL : thighR, 0.30], [side < 0 ? shinL : shinR, 0.70])),
    R(0.350, 0.052, 0.047, W([side < 0 ? shinL : shinR, 1])),
    R(0.250, 0.048, 0.043, W([side < 0 ? shinL : shinR, 1])),
    R(0.150, 0.045, 0.040, W([side < 0 ? shinL : shinR, 1])),
    R(0.085, 0.042, 0.037, W([side < 0 ? shinL : shinR, 1])),
  ];
}

// Dress skirt: flared rings from waist to a near-floor hem. Per-vertex weights keep the
// waistband on the hips and only pull the sides slightly toward the thighs, so a gown hangs
// as a free cone instead of clinging to the legs.
function skirtRings(bw) {
  const hemK = [0, 0.08, 0.15, 0.22, 0.28, 0.33, 0.38, 0.42, 0.45, 0.48];
  const ys = [
    [1.005, 0.165, 0.112], [0.920, 0.185, 0.122], [0.820, 0.210, 0.132],
    [0.700, 0.238, 0.142], [0.560, 0.262, 0.152], [0.420, 0.282, 0.160],
    [0.320, 0.300, 0.168], [0.220, 0.314, 0.176], [0.140, 0.324, 0.182], [0.070, 0.330, 0.186],
  ];
  return ys.map(([y, rx, rz], i) => ({
    y, rx: rx * bw, rz: rz * bw, cx: 0, cz: 0, cell: 'skirt',
    w: (x, yy, z, th) => {
      const wl = Math.max(0, -Math.cos(th)) * hemK[i];
      const wr = Math.max(0, Math.cos(th)) * hemK[i];
      return W([hips, 1 - wl - wr], [thighL, wl], [thighR, wr]);
    },
  }));
}

// Hands: palm + finger mass + thumb, all weighted to the forearm bone. They hang at
// mid-thigh, just below the wrist end of the arm tube.
function handGeos(side, bw) {
  const sx = side * 0.220 * bw;
  return [
    [blob(0.046, 0.070, 0.048, 8, 6), setM(sx, 0.815, 0.008, 0, 0, 0), 'skin', () => 0.9],
    [blob(0.038, 0.054, 0.032, 7, 5), setM(sx, 0.755, 0.014, 0.15, 0, 0), 'skin', () => 0.82],
    [blob(0.016, 0.037, 0.019, 6, 5), setM(sx - side * 0.036, 0.798, 0.026, 0, 0, side * 0.5), 'skin', () => 0.86],
  ];
}

// Shoes: sole + upper + toe, weighted to the shin bone; sole lands at y=0.
function shoeGeos(side, bw) {
  const sx = side * 0.095 * bw;
  return [
    [blob(0.052, 0.026, 0.105, 8, 5), setM(sx, 0.020, 0.045), 'shoe', () => 0.55],
    [blob(0.049, 0.048, 0.095, 8, 6), setM(sx, 0.062, 0.030, -0.12, 0, 0), 'shoe', () => 0.8],
    [blob(0.046, 0.040, 0.055, 7, 5), setM(sx, 0.052, 0.115, -0.2, 0, 0), 'shoe', () => 0.72],
  ];
}

// Vertex-colour AO helpers per body region.
const AO = {
  torso: (x, y, z) => {
    let v = 0.80 + 0.20 * smooth(y, 0.9, 1.5);
    if (y > 1.12 && y < 1.48 && Math.abs(x) > 0.14 && z < 0.05) v *= 0.82;
    if (y < 1.0) v *= 0.94;
    return v;
  },
  arm: (x, y, z) => 0.86 + 0.14 * smooth(y, 0.75, 1.45) - (z < -0.02 && y > 1.15 && y < 1.45 ? 0.06 : 0),
  leg: (x, y, z) => 0.80 + 0.20 * smooth(y, 0.08, 0.9),
  skin: () => 0.9,
  shoe: () => 0.7,
};

function buildBodyGeo(o, dress) {
  const acc = newAcc();
  const bw = BUILD_W[o.build] || 1;
  const fig = FIGURE[o.figure] || {};
  const longSleeve = ['hoodie', 'jacket', 'suit', 'uniform', 'dress'].includes(o.outfit);
  emitTube(acc, torsoRings(bw, fig), { segs: 10, colorFor: AO.torso });
  for (const s of [-1, 1]) {
    const armBone = s < 0 ? uarmL : uarmR;
    const farmBone = s < 0 ? farmL : farmR;
    const shinBone = s < 0 ? shinL : shinR;
    emitTube(acc, armRings(s, bw, longSleeve), { segs: 8, colorFor: AO.arm });
    emitTube(acc, legRings(s, bw, dress), { segs: 9, colorFor: AO.leg });
    // Deltoid cap bridging torso side and upper arm so the shoulder reads as one mass. Always
    // sleeve cloth — a skin-coloured cap reads as a bright ball sitting on the shoulder line.
    emitPrim(acc, blob(0.072, 0.068, 0.066, 8, 6), setM(s * 0.205 * bw, 1.415, 0), {
      cell: 'sleeve', weight: W([chest, 0.45], [armBone, 0.55]), colorFor: AO.arm,
    });
    for (const [geo, mat, cell, cf] of handGeos(s, bw)) {
      emitPrim(acc, geo, mat, { cell, weight: W([farmBone, 1]), colorFor: cf });
    }
    for (const [geo, mat, cell, cf] of shoeGeos(s, bw)) {
      emitPrim(acc, geo, mat, { cell, weight: W([shinBone, 1]), colorFor: cf });
    }
  }
  if (dress) emitTube(acc, skirtRings(bw), {
    segs: 12,
    // Vertical falloff plus radial pleat stripes so the gown reads as folded cloth, not a tube.
    colorFor: (x, y, z) => {
      const fold = 0.5 + 0.5 * Math.cos(Math.atan2(z, x) * 7);
      return (0.80 + 0.20 * smooth(y, 0.30, 1.0)) * (0.84 + 0.16 * fold);
    },
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(acc.v, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(acc.n, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(acc.uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(acc.c, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(acc.si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(acc.sw, 4));
  geo.setIndex(acc.idx);
  geo.computeVertexNormals();
  return geo;
}

/* ------------------------------------------------------------- head mesh */

// Head-local space: origin ~skull centre, +z face, +y up. The mesh is parented to the head
// bone, so it inherits skull motion (tilt) for free.
function headGeoFor(o, hairStyle) {
  const acc = newAcc();
  const bw = BUILD_W[o.build] || 1;
  const bald = hairStyle === 'bald';
  const skinCell = (x, y, z) => {
    // Front hemisphere -> skin (face patch covers the middle), rest -> hair.
    if (bald) return 'skin';
    const d = new THREE.Vector3(x, y * 0.9, z * 1.1).normalize();
    return d.z > 0.28 ? 'skin' : 'hair';
  };
  // Skull: ellipsoid with jaw taper.
  const skull = new THREE.SphereGeometry(1, 10, 8);
  skull.scale(0.078 * bw, 0.095 * bw, 0.082 * bw);
  {
    const p = skull.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / (0.095 * bw);
      if (y < 0) {
        const t = -y;
        p.setX(i, p.getX(i) * (1 - 0.28 * t));
        p.setZ(i, p.getZ(i) * (1 - 0.22 * t));
      }
    }
    skull.computeVertexNormals();
  }
  skull.translate(0, 0.005, -0.005);
  emitPrim(acc, skull, IDENT, { cell: skinCell, weight: W([BONE.head, 1]), colorFor: (x, y) => 0.95 - 0.08 * Math.max(0, -y / 0.1) });
  // Nose wedge.
  const nose = new THREE.ConeGeometry(0.012, 0.032, 4);
  nose.rotateX(Math.PI / 2);
  nose.scale(1, 1, 0.7);
  nose.computeVertexNormals();
  nose.translate(0, -0.006, 0.080);
  emitPrim(acc, nose, IDENT, { cell: 'skin', weight: W([BONE.head, 1]), colorFor: () => 0.95 });
  // Ears.
  for (const s of [-1, 1]) {
    const ear = blob(0.016, 0.026, 0.012, 6, 5);
    emitPrim(acc, ear, setM(s * 0.077 * bw, -0.004, 0.002), { cell: 'skin', weight: W([BONE.head, 1]), colorFor: () => 0.9 });
  }
  // Neck stub into the torso collar.
  const neckStub = new THREE.CylinderGeometry(0.042, 0.048, 0.10, 8);
  neckStub.translate(0, -0.10, 0.004);
  emitPrim(acc, neckStub, IDENT, { cell: 'skin', weight: W([BONE.neck, 0.7], [BONE.head, 0.3]), colorFor: () => 0.88 });
  // Painted face patch hugging the skull front.
  const face = new THREE.SphereGeometry(1, 10, 8, Math.PI / 2 - 0.63, 1.26, Math.PI / 2 - 1.02, 1.9);
  face.scale(0.0785 * bw, 0.0935 * bw, 0.0815 * bw);
  face.computeVertexNormals();
  face.translate(0, 0.005, -0.005);
  emitPrim(acc, face, IDENT, { cell: 'face', weight: W([BONE.head, 1]), colorFor: () => 1 });
  // Hair volumes.
  const hairW = W([BONE.head, 1]);
  const hairCol = (x, y) => 0.82 + 0.18 * smooth(y, -0.5, 0.1);
  const cap = new THREE.SphereGeometry(1, 10, 6, Math.PI * 1.5 - 2.3, 4.6, 0, 1.5);
  cap.scale(0.083 * bw, 0.092 * bw, 0.089 * bw);
  cap.translate(0, 0.014, -0.009);
  if (hairStyle !== 'bald' && hairStyle !== 'cap') {
    emitPrim(acc, cap.clone(), IDENT, { cell: 'hair', weight: hairW, colorFor: hairCol });
    const back = blob(0.078 * bw, 0.095 * bw, 0.070 * bw, 8, 6);
    emitPrim(acc, back, setM(0, -0.005, -0.031), { cell: 'hair', weight: hairW, colorFor: () => 0.95 });
    if (hairStyle === 'bob' || hairStyle === 'long') {
      const bob = blob(0.080 * bw, 0.105 * bw, 0.072 * bw, 8, 6);
      emitPrim(acc, bob, setM(0, -0.045, -0.028), { cell: 'hair', weight: hairW, colorFor: (x, y) => 0.9 - 0.15 * Math.min(1, (-y - 0.02) / 0.35) });
    }
    if (hairStyle === 'long') {
      const curtain = new THREE.CylinderGeometry(0.090 * bw, 0.118 * bw, 0.58, 10, 3, true, Math.PI - 1.95, 3.9);
      curtain.translate(0, -0.28, -0.022);
      emitPrim(acc, curtain, IDENT, { cell: 'hair', weight: hairW, colorFor: (x, y) => 0.9 - 0.18 * Math.min(1, (-y - 0.05) / 0.5) });
      for (const s of [-1, 1]) {
        const lock = new THREE.CylinderGeometry(0.026 * bw, 0.013 * bw, 0.36, 6);
        lock.rotateZ(s * 0.36);
        lock.translate(s * 0.072 * bw, -0.055, 0.012);
        emitPrim(acc, lock, IDENT, { cell: 'hair', weight: hairW, colorFor: (x, y) => 0.9 - 0.15 * (-y / 0.4) });
      }
    }
    if (hairStyle === 'bun') {
      const knot = blob(0.036 * bw, 0.034 * bw, 0.036 * bw, 7, 5);
      emitPrim(acc, knot, setM(0, 0.098, -0.035), { cell: 'hair', weight: hairW, colorFor: () => 0.9 });
    }
  }
  if (hairStyle === 'cap' || o.cap) {
    // Crown + forward brim.
    const crown = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.45);
    crown.scale(0.086 * bw, 0.062 * bw, 0.090 * bw);
    crown.translate(0, 0.030, -0.006);
    emitPrim(acc, crown, IDENT, { cell: 'cap', weight: hairW, colorFor: () => 0.9 });
    const brim = new THREE.BoxGeometry(0.10 * bw, 0.014, 0.055);
    emitPrim(acc, brim, setM(0, 0.052, 0.088, -0.18, 0, 0), { cell: 'cap', weight: hairW, colorFor: () => 0.85 });
  }
  if (o.glasses) {
    for (const s of [-1, 1]) {
      const lens = new THREE.BoxGeometry(0.034, 0.020, 0.006);
      emitPrim(acc, lens, setM(s * 0.033, 0.012, 0.082), { cell: 'glasses', weight: hairW, colorFor: () => 0.4 });
    }
    const bridge = new THREE.BoxGeometry(0.022, 0.006, 0.006);
    emitPrim(acc, bridge, setM(0, 0.016, 0.084), { cell: 'glasses', weight: hairW, colorFor: () => 0.4 });
  }
  // Uniform ~24% enlargement: the skull reads ~1/7.5 of body height (was a pinhead). Every
  // head-local part — skull, face patch, hair, glasses, neck stub — scales together about the
  // skull centre so nothing falls out of alignment.
  const HS = 1.24;
  for (let i = 0; i < acc.v.length; i += 3) {
    acc.v[i] *= HS;
    acc.v[i + 1] *= HS;
    acc.v[i + 2] *= HS;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(acc.v, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(acc.n, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(acc.uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(acc.c, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(acc.si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(acc.sw, 4));
  geo.setIndex(acc.idx);
  geo.computeVertexNormals();
  return geo;
}

/* ---------------------------------------------------------------- makePerson */

const GEO_CACHE = new Map();
const geoKeyBody = (o, dress) => [o.outfit, o.build, dress ? 1 : 0, o.figure || ''].join('|');
const geoKeyHead = (o, hairStyle) => [hairStyle, o.glasses ? 1 : 0, o.cap || hairStyle === 'cap' ? 1 : 0, o.hollow ? 1 : 0, o.build].join('|');

// Pose presets set bone rest rotations after binding (bind pose stays the standing geometry).
const POSES = {
  stand: {},
  sit: { thighX: -1.32, shinX: 1.32, armX: -0.45, farmX: -0.55, hipsDrop: 0.36 },
  present: { armX: -1.12, farmX: -0.38 },
  hold: { armX: -0.82, farmX: -1.22 },
};

export function makePerson(opts = {}) {
  const o = {
    skin: '#d6a983', top: '#2c3442', bottom: '#22252b', hair: '#1a1612',
    longHair: false, veil: false, dress: false, height: 1, emissive: 0, hollow: false,
    outfit: 'tee', build: 'average', hairStyle: null, glasses: false, cap: false, hat: false, pose: 'stand', figure: null,
    ...opts,
  };
  o.cap = o.cap || !!o.hat;
  const dress = o.dress || o.outfit === 'dress';
  const hairStyle = o.hairStyle ?? (o.longHair ? 'long' : 'short');
  const bw = BUILD_W[o.build] || 1;

  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(o.height);
  root.add(body);
  const armature = new THREE.Group();
  body.add(armature);

  // Bones in fixed order -> skinIndex. Lateral offsets scale with build width.
  const boneObjs = [];
  const byName = {};
  const wide = new Set(['uarmL', 'uarmR', 'thighL', 'thighR']);
  for (const [name, parent, x, y, z] of BONES) {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x * (wide.has(name) ? bw : 1), y, z);
    byName[name] = b;
    boneObjs.push(b);
  }
  for (const [name, parent] of BONES) {
    if (parent) byName[parent].add(byName[name]);
    else armature.add(byName[name]);
  }

  // Shared geometry per look; per-NPC skeleton is cheap (13 bones).
  const bk = geoKeyBody(o, dress);
  if (!GEO_CACHE.has(`b|${bk}`)) GEO_CACHE.set(`b|${bk}`, buildBodyGeo(o, dress));
  const hk = geoKeyHead(o, hairStyle);
  if (!GEO_CACHE.has(`h|${hk}`)) GEO_CACHE.set(`h|${hk}`, headGeoFor(o, hairStyle));
  const bodyGeo = GEO_CACHE.get(`b|${bk}`);
  const headGeo = GEO_CACHE.get(`h|${hk}`);

  const mat = materialFor(o);
  const mesh = new THREE.SkinnedMesh(bodyGeo, mat);
  mesh.name = 'body';
  mesh.userData.noBatch = true;
  body.add(mesh);

  const headBone = byName.head;
  const headMesh = new THREE.Mesh(headGeo, mat);
  headMesh.name = 'head';
  headMesh.userData.noBatch = true;
  headMesh.position.set(0, 0.08, 0);
  headBone.add(headMesh);

  if (o.veil) {
    const veil = new THREE.Mesh(veilGeo(), veilMat(o.emissive));
    veil.userData.noBatch = true;
    veil.position.set(0, 0.08, 0);
    headBone.add(veil);
  }

  // Bind while bones are in the standing pose, then apply the pose offset.
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(boneObjs);
  skeleton.calculateInverses();
  mesh.bind(skeleton);
  skeleton.update();
  mesh.computeBoundingSphere();

  const pose = POSES[o.pose] || POSES.stand;
  const setX = (bone, v) => { bone.rotation.x = v; };
  for (const s of ['L', 'R']) {
    setX(byName[`thigh${s}`], pose.thighX || 0);
    setX(byName[`shin${s}`], pose.shinX || 0);
    setX(byName[`uarm${s}`], pose.armX || 0);
    setX(byName[`farm${s}`], pose.farmX ?? -0.12);
  }
  if (pose.hipsDrop) byName.hips.position.y -= pose.hipsDrop;
  root.updateMatrixWorld(true);

  const rig = {
    bones: byName, skeleton, mesh, headMesh,
    legs: [byName.thighL, byName.thighR],
    arms: [byName.uarmL, byName.uarmR],
    shins: [byName.shinL, byName.shinR],
    forearms: [byName.farmL, byName.farmR],
    chest: byName.chest, neck: byName.neck, spine: byName.spine, hips: byName.hips,
    head: headBone,
    base: {
      leg0: byName.thighL.rotation.x, leg1: byName.thighR.rotation.x,
      shin0: byName.shinL.rotation.x, shin1: byName.shinR.rotation.x,
      arm0: byName.uarmL.rotation.x, arm1: byName.uarmR.rotation.x,
      farm0: byName.farmL.rotation.x, farm1: byName.farmR.rotation.x,
      chest: byName.chest.rotation.x, neck: byName.neck.rotation.x,
      spineZ: byName.spine.rotation.z,
      hipsY: byName.hips.position.y,
    },
  };
  return { root, legs: rig.legs, arms: rig.arms, head: headBone, rig };
}

// Veil: pale flared sheet in front of the face, authored in head-local space.
let VEIL_GEO = null;
function veilGeo() {
  if (VEIL_GEO) return VEIL_GEO;
  const g = new THREE.CylinderGeometry(0.088, 0.108, 0.52, 10, 2, true, -1.0, 2.0);
  g.translate(0, -0.27, 0.014);
  VEIL_GEO = g;
  return g;
}

export class NPC {
  constructor(opts, scene) {
    Object.assign(this, makePerson(opts));
    scene.add(this.root);
    this.path = [];
    this.speed = 1.1;
    this.phase = 0;
    this.swing = 0;
    this.animT = 0;
  }

  get pos() {
    return this.root.position;
  }

  place(x, z) {
    this.root.position.set(x, 0, z);
  }

  face(x, z) {
    this.root.rotation.y = Math.atan2(x - this.pos.x, z - this.pos.z);
  }

  walk(points, speed = 1.1) {
    this.path = points.slice();
    this.speed = speed;
    return new Promise((resolve) => (this.onArrive = resolve));
  }

  update(dt) {
    const p = this.pos;
    if (this.path.length) {
      const [tx, tz] = this.path[0];
      const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz), step = this.speed * dt;
      if (d <= step) {
        p.x = tx;
        p.z = tz;
        this.path.shift();
        if (!this.path.length) {
          const done = this.onArrive;
          this.onArrive = null;
          done?.();
        }
      } else {
        p.x += (dx / d) * step;
        p.z += (dz / d) * step;
        const target = Math.atan2(dx, dz);
        let diff = target - this.root.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        this.root.rotation.y += diff * Math.min(1, dt * 8);
      }
      this.phase += dt * this.speed * 5.5;
      this.swing = Math.min(1, this.swing + dt * 4);
    } else {
      this.swing = Math.max(0, this.swing - dt * 4);
    }
    this.animT += dt;
    const rig = this.rig, B = rig.base;
    const a = Math.sin(this.phase) * 0.55 * this.swing;
    // Legs scissor; knees flex through the swing phase, elbows keep a soft bend.
    rig.legs[0].rotation.x = B.leg0 + a;
    rig.legs[1].rotation.x = B.leg1 - a;
    const k0 = Math.max(0, Math.sin(this.phase + 0.9)) * 0.85 * this.swing;
    const k1 = Math.max(0, Math.sin(this.phase + Math.PI + 0.9)) * 0.85 * this.swing;
    rig.shins[0].rotation.x = B.shin0 + k0;
    rig.shins[1].rotation.x = B.shin1 + k1;
    rig.arms[0].rotation.x = B.arm0 - a * 0.8;
    rig.arms[1].rotation.x = B.arm1 + a * 0.8;
    const e0 = Math.max(0, Math.sin(this.phase + 2.4)) * 0.25 * this.swing;
    const e1 = Math.max(0, Math.sin(this.phase + Math.PI + 2.4)) * 0.25 * this.swing;
    rig.forearms[0].rotation.x = B.farm0 - 0.14 * this.swing - e0;
    rig.forearms[1].rotation.x = B.farm1 - 0.14 * this.swing - e1;
    // Idle breathing, a slow weight sway and a small hip bob while walking; the head bone
    // stays free for story tilts.
    const t = this.animT, br = Math.sin(t * 1.9) * 0.02;
    rig.chest.rotation.x = B.chest + br;
    rig.neck.rotation.x = B.neck + br * 0.5 + Math.sin(t * 0.7) * 0.015;
    rig.spine.rotation.z = B.spineZ + Math.sin(t * 0.55) * 0.02;
    rig.hips.position.y = B.hipsY - Math.abs(Math.sin(this.phase)) * 0.03 * this.swing;
  }
}
