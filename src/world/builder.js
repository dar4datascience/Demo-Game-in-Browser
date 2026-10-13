import * as THREE from 'three';
import { basic } from '../engine/post.js';

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

/*
 * Shared level-construction helpers. Colliders are oriented boxes on the XZ plane:
 * { cx, cz, hx, hz, rot } where rot matches the mesh's rotation.y.
 */
export function createBuilder(scene) {
  const colliders = [], occluders = [], powered = [], glow = [];

  const addCollider = (cx, cz, hx, hz, rot = 0) => colliders.push({ cx, cz, hx, hz, rot });
  const addBounds = (minX, maxX, minZ, maxZ) => addCollider((minX + maxX) / 2, (minZ + maxZ) / 2, (maxX - minX) / 2, (maxZ - minZ) / 2);

  function box(w, h, d, mat, x, y, z, { collide = true, occlude = false, tile = 1, parent = scene, ry = 0 } = {}) {
    const geo = new THREE.BoxGeometry(w, h, d);
    if (tile) worldUV(geo, w, h, d, tile);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    parent.add(mesh);
    if (collide) addCollider(x, z, w / 2, d / 2, ry);
    if (occlude) occluders.push(mesh);
    return mesh;
  }

  function plane(w, h, mat, x, y, z, ry = 0, rx = 0, tile = [1, 1], parent = scene) {
    const geo = new THREE.PlaneGeometry(w, h);
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

  // Lights flagged `onGrid` go dark when the power is cut.
  function light(x, y, z, color, intensity, distance, onGrid = true) {
    const l = new THREE.PointLight(color, intensity, distance, 2);
    l.position.set(x, y, z);
    l.userData.base = intensity;
    scene.add(l);
    if (onGrid) powered.push(l);
    return l;
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
    glowMat,
    powered: true,
    setPower(on) {
      powered.forEach((l) => (l.intensity = on ? l.userData.base : 0));
      glow.forEach((m) => m.color.copy(on ? m.userData.on : m.userData.off));
      this.powered = on;
    },
  };
}
