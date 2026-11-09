import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/*
 * Static geometry batching. The market is built from thousands of small boxes and planes, which
 * would otherwise be one draw call each. Meshes are merged by material, baking their transforms
 * relative to the parent into the geometry.
 *
 * Meshes that must keep their identity (animated shutters, interactables, held items) are listed in
 * `keep`; a kept object also protects its whole subtree. `userData.noBatch` does the same for a
 * single subtree. Transparent materials (hitboxes, glass, flames) are never merged.
 */

const ATTRS = new Set(['position', 'normal', 'uv', 'color']);

// Recursively collect every Object3D referenced from `refs` (plain objects and arrays included).
// Values in `skip` (e.g. a registry array used only by tests) are not walked.
export function collectRefs(refs, skip = new Set()) {
  const out = new Set();
  const seen = new Set();
  const walk = (v, depth) => {
    if (!v || typeof v !== 'object' || seen.has(v) || depth > 10 || skip.has(v)) return;
    seen.add(v);
    if (v.isObject3D) {
      out.add(v);
      return;
    }
    if (v.isTexture || v.isMaterial || v.isBufferGeometry || typeof v === 'function') return;
    if (Array.isArray(v)) v.forEach((x) => walk(x, depth + 1));
    else for (const k of Object.keys(v)) walk(v[k], depth + 1);
  };
  walk(refs, 0);
  return out;
}

// Size of an object's geometry in its own local frame (its own rotation and position removed).
export function localSize(obj) {
  obj.updateWorldMatrix(true, true);
  const inv = obj.matrixWorld.clone().invert();
  const box = new THREE.Box3();
  const m = new THREE.Matrix4();
  obj.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    o.geometry.computeBoundingBox();
    m.multiplyMatrices(inv, o.matrixWorld);
    box.union(o.geometry.boundingBox.clone().applyMatrix4(m));
  });
  return box.getSize(new THREE.Vector3());
}

const protectedIn = (mesh, root, keep) => {
  for (let p = mesh; p && p !== root; p = p.parent) if (keep.has(p) || p.userData.noBatch) return true;
  return false;
};

// Merge an explicit list of meshes by material into `parent`. Returns the merged meshes.
export function mergeMeshes(meshes, parent) {
  parent.updateWorldMatrix(true, true);
  const inv = parent.matrixWorld.clone().invert();
  const buckets = new Map();
  const rel = new THREE.Matrix4();
  for (const o of meshes) {
    if (!o.isMesh || o.isInstancedMesh || !o.material) continue;
    const key = `${o.material.uuid}|${o.geometry.index ? 'i' : 'n'}`;
    let bucket = buckets.get(key);
    if (!bucket) buckets.set(key, (bucket = { mat: o.material, geoms: [] }));
    const geo = o.geometry.clone();
    for (const name of Object.keys(geo.attributes)) if (!ATTRS.has(name)) geo.deleteAttribute(name);
    geo.applyMatrix4(rel.multiplyMatrices(inv, o.matrixWorld));
    bucket.geoms.push(geo);
  }
  const out = [];
  for (const { mat, geoms } of buckets.values()) {
    // mergeGeometries needs identical attribute sets: colour only survives on
    // vertexColors materials, everything else is stripped back to white/none.
    const wantColor = !!mat.vertexColors;
    for (const geo of geoms) {
      const has = !!geo.attributes.color;
      if (wantColor && !has) {
        const n = geo.attributes.position.count;
        geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
      } else if (!wantColor && has) {
        geo.deleteAttribute('color');
      }
    }
    const merged = geoms.length === 1 ? geoms[0] : mergeGeometries(geoms, false);
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, mat);
    mesh.userData.batched = true;
    parent.add(mesh);
    out.push(mesh);
  }
  for (const o of meshes) o.removeFromParent();
  return out;
}

// Merge the plain meshes under `root` by material. Returns the number of meshes removed.
export function batchStatic(root, keep = new Set()) {
  const victims = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o === root) return;
    const mat = o.material;
    if (!mat || mat.transparent || mat.opacity < 1) return;
    if (protectedIn(o, root, keep)) return;
    victims.push(o);
  });
  if (victims.length < 2) return 0;
  mergeMeshes(victims, root);
  return victims.length;
}

/*
 * Batch a whole level: every referenced group is merged internally (so it keeps its own transform,
 * visibility and interaction targets), occluders are merged into a handful of raycast blockers,
 * then everything left in the scene is merged globally.
 */
export function batchWorld(scene, refs, { occluders = [], skip = [] } = {}) {
  const keep = collectRefs(refs, new Set(skip));
  const occ = occluders.length ? mergeMeshes(occluders, scene) : [];
  for (const o of occ) keep.add(o);
  const roots = [...keep].filter((o) => o.isGroup && o.parent);
  for (const root of roots) {
    let nested = false;
    for (let p = root.parent; p && p !== scene; p = p.parent) if (keep.has(p)) nested = true;
    if (!nested) batchStatic(root, keep);
  }
  batchStatic(scene, keep);
  return { occluders: occ };
}
