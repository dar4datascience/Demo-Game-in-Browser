import * as THREE from 'three';
import { basic } from '../engine/post.js';
import { haloTex } from '../engine/textures.js';

// Scale box UVs to world metres so tiling textures keep a consistent density.
function worldUV(geo, w, h, d, s) {
  const uv = geo.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * dims[f][0] * s, uv.getY(k) * dims[f][1] * s);
    }
  }
}

function whiteColors(geo) {
  const n = geo.attributes.position.count;
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  return geo;
}

/*
 * Chamfered box: every edge cut at 45 degrees so shelves, counters and crates stop reading as
 * raw cubes. Indexed (like BoxGeometry) so it merges into the same batch buckets — no extra draw
 * calls. UVs are planar-projected in world metres, so `tile` keeps the 1 repeat == 1 metre
 * contract without worldUV's fixed six-face layout.
 */
export function chamferedBox(w, h, d, c = 0.02, tile = 1, faceUV = false) {
  const he = [w / 2, h / 2, d / 2];
  c = Math.max(0, Math.min(c, Math.min(he[0], he[1], he[2]) * 0.45));
  const pos = [], nor = [], uv = [], idx = [];
  const HINTS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

  const emit = (pts, hint) => {
    // Newell normal decides winding; reversed when it points into the box.
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      nx += (a[1] - b[1]) * (a[2] + b[2]);
      ny += (a[2] - b[2]) * (a[0] + b[0]);
      nz += (a[0] - b[0]) * (a[1] + b[1]);
    }
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    // Reversing the polygon negates its normal, so flip the stored normal too.
    if (nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) {
      pts = pts.slice().reverse();
      nx = -nx; ny = -ny; nz = -nz;
    }
    // Tangent basis for planar UVs (metres, scaled by tile).
    const up = Math.abs(ny) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    let t1 = [
      ny * up[2] - nz * up[1],
      nz * up[0] - nx * up[2],
      nx * up[1] - ny * up[0],
    ];
    const tl = Math.hypot(t1[0], t1[1], t1[2]) || 1;
    t1 = [t1[0] / tl, t1[1] / tl, t1[2] / tl];
    const t2 = [
      ny * t1[2] - nz * t1[1],
      nz * t1[0] - nx * t1[2],
      nx * t1[1] - ny * t1[0],
    ];
    const base = pos.length / 3;
    // faceUV mode stretches each face to 0..1 like BoxGeometry does, so props that mix beveled
    // and plain parts keep one texture density; world mode keeps metre-scaled tiling.
    let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    const proj = pts.map((p) => [
      p[0] * t1[0] + p[1] * t1[1] + p[2] * t1[2],
      p[0] * t2[0] + p[1] * t2[1] + p[2] * t2[2],
    ]);
    if (faceUV) for (const [a, b] of proj) {
      u0 = Math.min(u0, a); u1 = Math.max(u1, a);
      v0 = Math.min(v0, b); v1 = Math.max(v1, b);
    }
    const du = faceUV ? Math.max(1e-6, u1 - u0) : 1, dv = faceUV ? Math.max(1e-6, v1 - v0) : 1;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], [a, b] = proj[i];
      pos.push(p[0], p[1], p[2]);
      nor.push(nx, ny, nz);
      uv.push(faceUV ? (a - u0) / du : a * tile, faceUV ? (b - v0) / dv : b * tile);
    }
    for (let i = 1; i < pts.length - 1; i++) idx.push(base, base + i, base + i + 1);
  };

  // Six flat faces, each inset by the chamfer on all sides.
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3, k = (i + 2) % 3;
    for (const s of [-1, 1]) {
      const pts = [];
      for (const [sj, sk] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const p = [0, 0, 0];
        p[i] = s * he[i]; p[j] = sj * (he[j] - c); p[k] = sk * (he[k] - c);
        pts.push(p);
      }
      emit(pts, HINTS[i * 2 + (s > 0 ? 0 : 1)]);
    }
  }
  // Twelve chamfer quads, one per original edge.
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3, k = (i + 2) % 3;
    for (const si of [-1, 1]) for (const sj of [-1, 1]) {
      const hint = [0, 0, 0];
      hint[i] = si; hint[j] = sj;
      const pts = [];
      for (const sk of [-1, 1]) {
        const p1 = [0, 0, 0], p2 = [0, 0, 0];
        p1[i] = si * he[i]; p1[j] = sj * (he[j] - c); p1[k] = sk * (he[k] - c);
        p2[j] = sj * he[j]; p2[i] = si * (he[i] - c); p2[k] = sk * (he[k] - c);
        pts.push(p1, p2);
      }
      // Order p1(-k), p2(-k), p2(+k), p1(+k) for a clean quad.
      emit([pts[0], pts[1], pts[3], pts[2]], hint);
    }
  }
  // Eight corner triangles where three chamfer planes meet.
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    emit([
      [sx * he[0], sy * (he[1] - c), sz * (he[2] - c)],
      [sx * (he[0] - c), sy * he[1], sz * (he[2] - c)],
      [sx * (he[0] - c), sy * (he[1] - c), sz * he[2]],
    ], [sx, sy, sz]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  geo.setIndex(idx);
  return geo;
}

/*
 * Baked ambient occlusion as a vertex colour: the underside goes darkest, the lower quarter
 * of the sides fade up to full brightness and the top edge picks up a little ceiling-junction
 * shading. Materials opt in with `vertexColors: true`; unlit/basic materials ignore it.
 */
export function bakeAO(geo, { bottom = 0.6, top = 1, joint = 0.75 } = {}) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  geo.computeBoundingBox();
  const minY = geo.boundingBox.min.y, span = Math.max(1e-4, geo.boundingBox.max.y - minY);
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const ny = nor.getY(i);
    const t = (pos.getY(i) - minY) / span;
    let v;
    if (ny < -0.5) v = bottom;
    else if (ny > 0.5) v = top;
    else if (t < 0.25) v = bottom + (t / 0.25) * (1 - bottom);
    else if (t > 0.88) v = joint;
    else v = 1;
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/*
 * Shared level-construction helpers. Colliders are oriented boxes on the XZ plane:
 * { cx, cz, hx, hz, rot } where rot matches the mesh's rotation.y.
 */
export function createBuilder(scene, { poolSize = 8 } = {}) {
  const colliders = [], occluders = [], powered = [], glow = [];
  const lights = []; // every light the level asks for; only the nearest `poolSize` are real
  const pool = [];
  const poolAt = new THREE.Vector3();

  /*
   * Light halos: every registered lamp also gets a camera-facing additive quad sampling one
   * shared radial texture. All quads live in a single mesh (one draw call no matter how many
   * lamps a level registers) and `aLevel` tracks each light's live intensity, so flicker and
   * blackouts dim the glow along with the lamp itself. No extra scene lights are added.
   */
  const halos = [];
  let haloMesh = null, haloLevelAttr = null;
  const HALO_CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
  const haloMaterial = () => new THREE.ShaderMaterial({
    uniforms: { uMap: { value: haloTex() }, uStrength: { value: 0.55 } },
    vertexShader: `
      attribute vec2 aCorner;
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aLevel;
      varying vec3 vColor;
      varying vec2 vUv;
      void main() {
        vColor = aColor * aLevel;
        vUv = aCorner * 0.5 + 0.5;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        mv.xy += aCorner * aSize;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform float uStrength;
      varying vec3 vColor;
      varying vec2 vUv;
      void main() {
        vec4 t = texture2D(uMap, vUv);
        gl_FragColor = vec4(vColor * t.rgb * uStrength, t.a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  function syncHalos() {
    const n = halos.length;
    const pos = new Float32Array(n * 18), corner = new Float32Array(n * 12);
    const col = new Float32Array(n * 18), size = new Float32Array(n * 6), lvl = new Float32Array(n * 6);
    halos.forEach((h, i) => {
      for (let k = 0; k < 6; k++) {
        const v = i * 6 + k;
        pos[v * 3] = h.x; pos[v * 3 + 1] = h.y; pos[v * 3 + 2] = h.z;
        corner[v * 2] = HALO_CORNERS[k][0]; corner[v * 2 + 1] = HALO_CORNERS[k][1];
        col[v * 3] = h.r; col[v * 3 + 1] = h.g; col[v * 3 + 2] = h.b;
        size[v] = h.size;
        lvl[v] = 0;
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    haloLevelAttr = new THREE.BufferAttribute(lvl, 1);
    geo.setAttribute('aLevel', haloLevelAttr);
    if (!haloMesh) {
      haloMesh = new THREE.Mesh(geo, haloMaterial());
      haloMesh.frustumCulled = false;
      scene.add(haloMesh);
    } else {
      haloMesh.geometry.dispose();
      haloMesh.geometry = geo;
    }
  }

  for (let i = 0; i < poolSize; i++) {
    const l = new THREE.PointLight(0xffffff, 0, 10, 2);
    scene.add(l);
    pool.push(l);
  }

  const addCollider = (cx, cz, hx, hz, rot = 0) => {
    const c = { cx, cz, hx, hz, rot };
    colliders.push(c);
    return c;
  };
  const addBounds = (minX, maxX, minZ, maxZ) => addCollider((minX + maxX) / 2, (minZ + maxZ) / 2, (maxX - minX) / 2, (maxZ - minZ) / 2);

  function box(w, h, d, mat, x, y, z, { collide = true, occlude = false, tile = 1, bevel = 0, parent = scene, ry = 0 } = {}) {
    const geo = bevel > 0
      ? bakeAO(chamferedBox(w, h, d, bevel, tile))
      : (() => { const g = bakeAO(new THREE.BoxGeometry(w, h, d)); if (tile) worldUV(g, w, h, d, tile); return g; })();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    parent.add(mesh);
    if (collide) mesh.userData.collider = addCollider(x, z, w / 2, d / 2, ry);
    if (occlude) occluders.push(mesh);
    return mesh;
  }

  function plane(w, h, mat, x, y, z, ry = 0, rx = 0, tile = [1, 1], parent = scene) {
    const geo = new THREE.PlaneGeometry(w, h);
    whiteColors(geo);
    if (tile) {
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * tile[0], uv.getY(i) * h * tile[1]);
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, 0, 'YXZ');
    parent.add(mesh);
    return mesh;
  }

  /*
   * Lights are registered as data and copied into a fixed pool of real PointLights near the player.
   * Keeping the count constant avoids shader recompiles, and 22 lamps never cost 22 lights per
   * fragment. `l.intensity` is still live, so flicker and setPower work on the returned object.
   */
  function light(x, y, z, color, intensity, distance, onGrid = true) {
    const l = new THREE.PointLight(color, intensity, distance, 2);
    l.position.set(x, y, z);
    l.userData.base = intensity;
    lights.push(l);
    if (onGrid) powered.push(l);
    const c = new THREE.Color(color);
    halos.push({
      light: l, x, y, z, r: c.r, g: c.g, b: c.b,
      size: Math.min(2.0, Math.max(0.6, distance * 0.08)),
    });
    syncHalos();
    return l;
  }

  function updateLights(at) {
    if (at) poolAt.set(at.x ?? 0, 0, at.z ?? 0);
    // Keep the nearest `pool.length` lights that are actually in range, without sorting the whole list.
    const chosen = [];
    for (const l of lights) {
      if (l.intensity <= 0) continue;
      const d2 = (l.position.x - poolAt.x) ** 2 + (l.position.z - poolAt.z) ** 2;
      if (d2 > l.distance * l.distance) continue;
      if (chosen.length === pool.length && d2 >= chosen[chosen.length - 1][1]) continue;
      let i = chosen.length;
      while (i > 0 && chosen[i - 1][1] > d2) i--;
      chosen.splice(i, 0, [l, d2]);
      if (chosen.length > pool.length) chosen.pop();
    }
    pool.forEach((p, i) => {
      const l = chosen[i]?.[0];
      if (!l) {
        p.intensity = 0;
        return;
      }
      p.position.copy(l.position);
      p.color.copy(l.color);
      p.distance = l.distance;
      p.intensity = l.intensity;
    });
    if (haloLevelAttr) {
      const arr = haloLevelAttr.array;
      for (let i = 0; i < halos.length; i++) {
        const l = halos[i].light;
        const v = l.intensity > 0 ? Math.min(1, l.intensity / (l.userData.base || 1)) : 0;
        for (let k = 0; k < 6; k++) arr[i * 6 + k] = v;
      }
      haloLevelAttr.needsUpdate = true;
    }
  }

  // Unlit "emissive" material that dims to `off` during blackouts.
  function glowMat(opts, off) {
    const m = basic(opts);
    m.userData.on = m.color.clone();
    m.userData.off = new THREE.Color(off);
    glow.push(m);
    return m;
  }

  return {
    scene,
    colliders,
    occluders,
    addCollider,
    addBounds,
    box,
    plane,
    light,
    lights,
    updateLights,
    glowMat,
    powered: true,
    setPower(on) {
      powered.forEach((l) => (l.intensity = on ? l.userData.base : 0));
      glow.forEach((m) => m.color.copy(on ? m.userData.on : m.userData.off));
      this.powered = on;
      updateLights();
    },
  };
}
