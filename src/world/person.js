import * as THREE from 'three';
import { lam } from '../engine/post.js';
import { canvasTexture } from '../engine/textures.js';
import { batchStatic } from './batch.js';

/*
 * Organic low-poly humanoid (PS2 mannequin style): tapered lathe torso, ellipsoid head with a
 * painted canvas face, hair as scaled volumes, two-segment limbs with bent forearms. Everything
 * faces +z, feet rest at y=0 and the whole body lives under `body`, which NPC scales by `height`.
 * legs/arms/head stay pivot Groups so walk/sit/jumpscare animation keeps working.
 */

// Deterministic per-key PRNG so crowd textures look identical on every load and spawn order
// does not matter (unlike the shared texture seed, which advances with call order).
const hashStr = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
const lcg = (seed) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;

// '#rrggbb' -> '#rrggbb' darkened, so authored skin tones never clip to white under hot lamps.
const dim = (color, f) => `#${new THREE.Color(color).multiplyScalar(f).getHexString()}`;

// Fabric weave + fold shading for garments, cached per colour.
const clothTex = (() => {
  const cache = new Map();
  return (color) => {
    if (cache.has(color)) return cache.get(color);
    const tex = canvasTexture(64, 64, (g, w, h) => {
      const rnd = lcg(hashStr(`cloth|${color}`));
      g.fillStyle = color;
      g.fillRect(0, 0, w, h);
      // Fine weave.
      for (let y = 0; y < h; y += 3) {
        g.fillStyle = `rgba(0,0,0,${0.03 + rnd() * 0.04})`;
        g.fillRect(0, y, w, 1);
      }
      for (let x = 0; x < w; x += 3) {
        g.fillStyle = `rgba(255,255,255,${rnd() * 0.03})`;
        g.fillRect(x, 0, 1, h);
      }
      // Soft vertical fold shadows and a couple of worn highlights.
      for (let i = 0; i < 5; i++) {
        const x = rnd() * w, wd = 6 + rnd() * 14;
        const gr = g.createLinearGradient(x - wd, 0, x + wd, 0);
        gr.addColorStop(0, 'rgba(0,0,0,0)');
        gr.addColorStop(0.5, `rgba(0,0,0,${0.05 + rnd() * 0.07})`);
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.fillRect(x - wd, 0, wd * 2, h);
      }
      for (let i = 0; i < 3; i++) {
        g.fillStyle = `rgba(255,255,255,${0.03 + rnd() * 0.04})`;
        g.fillRect(rnd() * w, 0, 2 + rnd() * 5, h);
      }
    });
    cache.set(color, tex);
    return tex;
  };
})();

// Painted face on a 64x64 patch. Features are deliberately oversized: the patch lands ~20-30px
// wide on the 360p target, so eyes/brows/mouth must stay readable as dark/light pairs at ~5px.
// `hollow` swaps in black empty sockets and an open mouth for the ghosts.
const faceTex = (() => {
  const cache = new Map();
  return (skin, hollow) => {
    const key = `${skin}|${hollow ? 1 : 0}`;
    if (cache.has(key)) return cache.get(key);
    const tex = canvasTexture(64, 64, (g, w, h) => {
      const rnd = lcg(hashStr(`face|${skin}|${hollow}`));
      const base = skin;
      g.fillStyle = base;
      g.fillRect(0, 0, w, h);
      // Cheek and forehead shading so the patch is not a flat sticker.
      const soft = (x, y, r, color) => {
        const gr = g.createRadialGradient(x, y, 1, x, y, r);
        gr.addColorStop(0, color);
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      };
      soft(32, 16, 26, 'rgba(255,255,255,0.07)');
      soft(18, 46, 15, 'rgba(120,60,40,0.12)');
      soft(46, 46, 15, 'rgba(120,60,40,0.12)');
      // Eyes: heavy dark socket, pale eyeball, dark pupil, one catchlight. Hollow swaps in
      // black voids and an open mouth.
      for (const ex of [16, 48]) {
        // Socket: big soft dark almond.
        g.fillStyle = 'rgba(44,24,17,0.88)';
        g.beginPath();
        g.ellipse(ex, 30, hollow ? 10 : 9, hollow ? 8.5 : 7, 0, 0, Math.PI * 2);
        g.fill();
        if (hollow) {
          g.fillStyle = '#030203';
          g.beginPath();
          g.ellipse(ex, 30.5, 7, 6.5, 0, 0, Math.PI * 2);
          g.fill();
        } else {
          // Eyeball: pale oval with a dark pupil and a single catchlight, slightly lower lid
          // shadow so the eye reads as a ball, not a painted dot.
          g.fillStyle = '#ece5d6';
          g.beginPath();
          g.ellipse(ex, 30, 6.4, 5.4, 0, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#191310';
          g.beginPath();
          g.arc(ex, 31, 3.1, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = 'rgba(255,255,255,0.95)';
          g.fillRect(ex - 1.9, 28.2, 2.1, 2.1);
          // Lower lid line.
          g.strokeStyle = 'rgba(52,28,20,0.55)';
          g.lineWidth = 1.4;
          g.beginPath();
          g.ellipse(ex, 31.5, 5.6, 3.6, 0, 0.15 * Math.PI, 0.85 * Math.PI);
          g.stroke();
        }
        // Brow: short heavy stroke above each eye, slightly angled down toward the nose.
        g.strokeStyle = 'rgba(20,14,10,0.95)';
        g.lineWidth = 3.2;
        g.beginPath();
        g.moveTo(ex - (ex < 32 ? 7 : -7), 19.5 + (rnd() - 0.5));
        g.quadraticCurveTo(ex, 17.5 + (rnd() - 0.5), ex + (ex < 32 ? 7 : -7), 20 + (rnd() - 0.5));
        g.stroke();
      }
      // Nose shadow and tip.
      const ng = g.createLinearGradient(29, 32, 35, 50);
      ng.addColorStop(0, 'rgba(90,50,35,0.34)');
      ng.addColorStop(1, 'rgba(90,50,35,0)');
      g.fillStyle = ng;
      g.fillRect(28, 32, 8, 18);
      soft(32, 46, 5.5, 'rgba(255,255,255,0.12)');
      // Mouth: slightly open, darker and wider for hollow.
      g.strokeStyle = hollow ? '#120202' : 'rgba(72,26,22,0.95)';
      g.lineWidth = hollow ? 4.5 : 2.8;
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
    });
    cache.set(key, tex);
    return tex;
  };
})();

/*
 * Cheap cool rim: a fresnel term injected into the Lambert shader so silhouettes pick up a
 * faint moonlit edge. Applied to the person materials only; faces and the veil stay clean.
 */
const rim = (mat) => {
  const prev = mat.onBeforeCompile; // ps1() vertex snap — must be preserved, not replaced
  mat.onBeforeCompile = (shader, renderer) => {
    prev(shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `outgoingLight += vec3(0.055, 0.075, 0.13) * pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), 3.0);
       #include <opaque_fragment>`,
    );
  };
  return mat;
};

// Shared materials, keyed so a crowd reuses one material per colour/role. The emissive floor
// keeps people readable in the dark; ghosts pass a higher emissive and keep it. The floor is
// applied to emitted luminance, not raw intensity: dark garments would otherwise glow at a
// fraction of the intended level and read as cut-outs under moonlight. Hair is exempt so
// heads stay dark where they should.
const MATS = new Map();
const floor = (emissive) => Math.max(emissive, 0.18);
const emisI = (color, emissive) => {
  const c = new THREE.Color(color);
  const l = Math.max(0.012, 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b);
  return Math.min(6, Math.max(emissive, 0.24 / l));
};
const flatMat = (role, color, emissive, extra = {}) => {
  const key = `${role}|${color}|${emissive}`;
  if (!MATS.has(key)) {
    const ei = role === 'hair' ? floor(emissive) : emisI(color, emissive);
    MATS.set(key, rim(lam({ color, emissive: color, emissiveIntensity: ei, vertexColors: true, ...extra })));
  }
  return MATS.get(key);
};
const clothMat = (color, emissive) => {
  const key = `cloth|${color}|${emissive}`;
  if (!MATS.has(key)) {
    MATS.set(key, rim(lam({
      map: clothTex(color), color: 0xffffff, emissive: color, emissiveIntensity: emisI(color, emissive),
      vertexColors: true,
    })));
  }
  return MATS.get(key);
};
const faceMat = (skin, hollow) => {
  const key = `face|${skin}|${hollow ? 1 : 0}`;
  if (!MATS.has(key)) {
    // Painted face: self-illumination keeps sockets/brows/mouth readable in moonlight.
    MATS.set(key, lam({ map: faceTex(skin, hollow), emissive: 0xffffff, emissiveMap: faceTex(skin, hollow), emissiveIntensity: 0.14 }));
  }
  return MATS.get(key);
};
const veilMat = (emissive) => {
  const key = `veil|${emissive}`;
  if (!MATS.has(key)) {
    MATS.set(key, lam({
      color: 0xe9e4d6, emissive: 0xe9e4d6, emissiveIntensity: floor(emissive),
      vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.5,
      depthWrite: false,
    }));
  }
  return MATS.get(key);
};

// Per-vertex brightness for fake AO: fn(x, y, z, nx, ny, nz) -> multiplier ~0.5-1.
function vshade(geo, fn) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const n = pos.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = THREE.MathUtils.clamp(fn(pos.getX(i), pos.getY(i), pos.getZ(i), nor.getX(i), nor.getY(i), nor.getZ(i)), 0.3, 1.0);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

const mesh = (geo, mat, parent) => {
  const m = new THREE.Mesh(geo, mat);
  parent.add(m);
  return m;
};

// Cylinder hanging from its top (pivot at the joint).
const limbSeg = (rt, rb, len, seg = 8) => {
  const g = new THREE.CylinderGeometry(rt, rb, len, seg);
  g.translate(0, -len / 2, 0);
  return g;
};
const blob = (sx, sy, sz, ws = 8, hs = 6) => {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.scale(sx, sy, sz);
  g.computeVertexNormals();
  return g;
};

/*
 * One shading function per limb over pivot-local y, so the gradient runs continuously through
 * the joints instead of stepping between separately-shaded segments (that step is what read as
 * "ball joints"). Segment radii match at the joints and overlap slightly.
 */
const legShade = (y) => 1.0 - 0.20 * THREE.MathUtils.smoothstep(-y, 0.02, 0.86);
const armShade = (y) => 1.02 - 0.18 * THREE.MathUtils.smoothstep(-y, 0.02, 0.56);

function makeLeg(side, mat, pivot) {
  // pivot-local: y 0 at the hip, negative going down; foot lands at y=-0.87.
  const thigh = vshade(limbSeg(0.086, 0.060, 0.40, 9), (x, y) => legShade(y));
  // Shin starts a touch inside the thigh so the knee reads as one limb, radii matched.
  const shin = vshade(limbSeg(0.062, 0.042, 0.41, 9).translate(0, -0.395, 0), (x, y) => legShade(y));
  const shoe = vshade(blob(0.050, 0.036, 0.095).translate(0, -0.834, 0.018), () => 0.34);
  mesh(thigh, mat, pivot);
  mesh(shin, mat, pivot);
  mesh(shoe, mat, pivot);
  pivot.position.set(side * 0.115, 0.87, 0);
}

function makeArm(side, topMat, skinMat, pivot) {
  // pivot-local: y 0 at the shoulder, negative going down; elbow ~-0.28, wrist ~-0.53.
  const upper = vshade(limbSeg(0.058, 0.047, 0.30, 8), (x, y) => armShade(y));
  // The forearm's top edge is the elbow: rotate about it first, then seat it inside the
  // upper arm's end so the joint is one continuous limb, not two balls with a gap.
  const fore = limbSeg(0.047, 0.033, 0.27, 8);
  fore.rotateX(-0.17); // slight forward bend at the elbow
  fore.translate(0, -0.26, 0);
  vshade(fore, (x, y) => armShade(y));
  // Deltoid cap: a sphere that engulfs the shoulder joint so the upper arm flows out of
  // the torso instead of meeting it at a ball joint.
  const deltoid = vshade(blob(0.070, 0.066, 0.070, 8, 6).translate(0, -0.035, 0), (x, y) => armShade(y) * 1.02);
  mesh(upper, topMat, pivot);
  mesh(fore, topMat, pivot);
  mesh(deltoid, topMat, pivot);
  // Hand blob tucked into the end of the forearm, same shading run.
  const hand = vshade(blob(0.044, 0.058, 0.050, 7, 5).translate(0, -0.535, 0.052), (x, y) => armShade(y) * 0.97);
  mesh(hand, skinMat, pivot);
  pivot.position.set(side * 0.25, 1.44, 0);
}

function makeTorso(topMat, dress, body) {
  // Lathe profile: hip -> belly -> chest -> shoulders -> neck base, then squashed front-back.
  const pts = [
    [0.001, 0.885], [0.135, 0.895], [0.148, 0.98], [0.160, 1.10],
    [0.172, 1.22], [0.181, 1.33], [0.187, 1.395], [0.172, 1.45],
    [0.115, 1.50], [0.05, 1.52], [0.001, 1.53],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const torso = new THREE.LatheGeometry(pts, 10);
  torso.scale(1, 1, 0.72);
  torso.computeVertexNormals();
  vshade(torso, (x, y, z, nx) => {
    let v = 0.84 + 0.16 * THREE.MathUtils.smoothstep(y, 0.95, 1.45); // lighter toward shoulders
    if (y > 1.38 && Math.abs(x) > 0.115) v *= 0.88; // soft underarm shadow, not a band
    if (y < 1.0) v *= 0.92;
    return v;
  });
  mesh(torso, topMat, body);
  if (dress) {
    // Flared skirt from the waist to mid-thigh, same garment material so it merges with the torso.
    // Profile runs bottom->top like the torso so the lathe faces point outward.
    const skirtPts = [
      [0.30, 0.40], [0.285, 0.50], [0.235, 0.70], [0.185, 0.90], [0.16, 1.02],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const skirt = new THREE.LatheGeometry(skirtPts, 10);
    skirt.scale(1, 1, 0.82);
    skirt.computeVertexNormals();
    vshade(skirt, (x, y) => 0.86 + 0.14 * THREE.MathUtils.smoothstep(y, 0.4, 1.0));
    mesh(skirt, topMat, body);
  }
}

function makeHead(skinMat, faceM, hairM, veilM, longHair, veil, head) {
  // Neck first: it hangs below the skull and tucks into the torso collar.
  const neck = limbSeg(0.050, 0.043, 0.11, 8);
  neck.translate(0, -0.115, 0);
  vshade(neck, () => 0.9);
  mesh(neck, skinMat, head);

  // Skull: unit sphere scaled to an egg, jaw pulled in below the cheeks.
  const skull = new THREE.SphereGeometry(1, 10, 8);
  skull.scale(0.076, 0.092, 0.080);
  {
    const pos = skull.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 0.092;
      if (y < 0) {
        const t = -y;
        pos.setX(i, pos.getX(i) * (1 - 0.28 * t));
        pos.setZ(i, pos.getZ(i) * (1 - 0.22 * t));
      }
    }
    skull.computeVertexNormals();
  }
  skull.translate(0, 0.005, -0.005);
  vshade(skull, (x, y) => 1.0 - 0.1 * Math.max(0, -y / 0.10)); // slightly shaded jaw
  mesh(skull, skinMat, head);

  // Nose wedge.
  const nose = new THREE.ConeGeometry(0.012, 0.032, 4);
  nose.rotateX(Math.PI / 2);
  nose.scale(1, 1, 0.7);
  nose.computeVertexNormals();
  nose.translate(0, -0.006, 0.080);
  vshade(nose, () => 0.95);
  mesh(nose, skinMat, head);

  // The painted face stays under the veil: it ghosts through the thin sheet.
  {
    // Face patch: a shallow ellipsoid section hugging the skull front, a hair's breadth proud
    // of the skin so it never z-fights. Sphere UVs already run top->bottom for the texture.
    const face = new THREE.SphereGeometry(1, 10, 8, Math.PI / 2 - 0.63, 1.26, Math.PI / 2 - 1.02, 1.9);
    face.scale(0.0785, 0.0935, 0.0815);
    face.computeVertexNormals();
    face.translate(0, 0.005, -0.005);
    vshade(face, () => 1);
    mesh(face, faceM, head);
  }

  // Hair: crown cap biased to the back, a back mass, and for long hair a curtain plus side locks.
  const cap = new THREE.SphereGeometry(1, 10, 6, Math.PI * 1.5 - 2.3, 4.6, 0, 1.5);
  cap.scale(0.083, 0.092, 0.089);
  cap.translate(0, 0.014, -0.009);
  vshade(cap, (x, y) => 1.0 - 0.12 * Math.max(0, -y / 0.09));
  mesh(cap, hairM, head);
  const back = blob(0.078, 0.095, 0.070, 8, 6);
  back.translate(0, -0.005, -0.031);
  vshade(back, () => 0.95);
  mesh(back, hairM, head);
  if (longHair) {
    // Curtain of hair down the back: open cylinder arc centred on -z, tucked against the
    // shoulders so its hem doesn't float in front of the chest.
    const curtain = new THREE.CylinderGeometry(0.090, 0.118, 0.58, 10, 3, true, Math.PI - 1.95, 3.9);
    curtain.translate(0, -0.28, -0.022);
    vshade(curtain, (x, y) => 0.9 - 0.18 * Math.min(1, (-y - 0.05) / 0.5));
    mesh(curtain, hairM, head);
    for (const s of [-1, 1]) {
      // Side locks: strands from the temples angling down along the neck onto the
      // shoulders. They must stay outside the torso silhouette (|x| > ~0.18 at chest
      // height) or they hide inside it — which is what made them read as stray stripes.
      const lock = limbSeg(0.026, 0.013, 0.36, 6);
      lock.rotateZ(s * 0.36);
      lock.translate(s * 0.072, -0.055, 0.012);
      vshade(lock, (x, y) => 0.9 - 0.15 * (-y / 0.4));
      mesh(lock, hairM, head);
    }
  }
  if (veil) {
    // Pale flared sheet in front of the face, open cylinder arc centred on +z.
    const sheet = new THREE.CylinderGeometry(0.088, 0.108, 0.52, 10, 2, true, -1.0, 2.0);
    sheet.translate(0, -0.27, 0.014);
    vshade(sheet, (x, y) => 0.92 + 0.08 * THREE.MathUtils.smoothstep(y, -0.5, 0.0));
    mesh(sheet, veilM, head);
  }
  head.position.set(0, 1.66, 0);
}

export function makePerson({
  skin = '#d6a983', top = '#2c3442', bottom = '#22252b', hair = '#1a1612',
  longHair = false, veil = false, dress = false, height = 1, emissive = 0, hollow = false,
}) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(height);
  root.add(body);

  // Skin albedo is pulled down a touch everywhere (body + painted face) so pale complexions
  // keep their shading under the store's hot lamps instead of clipping to a white blob.
  const skinTone = dim(skin, 0.88);
  const skinMat = flatMat('skin', skinTone, emissive);
  const topMat = clothMat(top, emissive);
  const bottomMat = clothMat(bottom, emissive);
  const hairMat = flatMat('hair', hair, emissive);
  const legMat = dress ? skinMat : bottomMat;
  const faceM = faceMat(skinTone, hollow);
  const veilM = veil ? veilMat(emissive) : null;

  const legs = [null, null];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    body.add(pivot);
    makeLeg(s, legMat, pivot);
    legs[s < 0 ? 0 : 1] = pivot;
  }
  const arms = [null, null];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    body.add(pivot);
    makeArm(s, topMat, skinMat, pivot);
    arms[s < 0 ? 0 : 1] = pivot;
  }
  makeTorso(topMat, dress, body);
  const head = new THREE.Group();
  body.add(head);
  makeHead(skinMat, faceM, hairMat, veilM, longHair, veil, head);

  // Merge the static geometry of each rigid part: pivots still animate.
  batchStatic(body, new Set([head, ...legs, ...arms]));
  batchStatic(head);
  for (const pivot of [...legs, ...arms]) batchStatic(pivot);
  return { root, legs, arms, head };
}

export class NPC {
  constructor(opts, scene) {
    Object.assign(this, makePerson(opts));
    scene.add(this.root);
    this.path = [];
    this.speed = 1.1;
    this.phase = 0;
    this.swing = 0;
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
    const a = Math.sin(this.phase) * 0.55 * this.swing;
    this.legs[0].rotation.x = a;
    this.legs[1].rotation.x = -a;
    this.arms[0].rotation.x = -a * 0.8;
    this.arms[1].rotation.x = a * 0.8;
  }
}
