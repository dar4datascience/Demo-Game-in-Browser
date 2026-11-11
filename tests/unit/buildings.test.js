import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createBuilder } from '../../src/world/builder.js';
import { batchWorld } from '../../src/world/batch.js';
import * as BD from '../../src/levels/cdmx/buildings.js';

const finite = (root) => {
  let ok = true, meshes = 0, tris = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    const g = o.geometry;
    tris += g.index ? g.index.count / 3 : (g.attributes.position?.count || 0) / 3;
    const p = g.attributes.position;
    if (!p) { ok = false; return; }
    for (let i = 0; i < p.count; i++) {
      if (!Number.isFinite(p.getX(i)) || !Number.isFinite(p.getY(i)) || !Number.isFinite(p.getZ(i))) ok = false;
    }
  });
  return { ok, meshes, tris };
};

describe('cdmx building kit', () => {
  it('building() composes variants headlessly with finite geometry', () => {
    const scene = new THREE.Scene();
    const b = createBuilder(scene);
    const variants = [
      { x: 0, z: 0, w: 10, d: 9, h: 9, seed: 't1', shop: { kind: 'open', name: 'TEST' } },
      { x: 20, z: 0, w: 12, d: 10, h: 22, seed: 't2', shop: { kind: 'shutter' }, balconies: true },
      { x: 40, z: 0, w: 14, d: 12, h: 55, seed: 't3', shop: null, balconies: false },
      { x: 60, z: 0, w: 8, d: 8, h: 7, seed: 't4', shop: { kind: 'half' } },
    ];
    for (const v of variants) {
      const g = BD.building(b, v);
      expect(g.isGroup, v.seed).toBeTruthy();
      const s = finite(g);
      expect(s.ok, `${v.seed} finite`).toBe(true);
      expect(s.meshes, `${v.seed} meshes`).toBeGreaterThan(3);
      expect(s.tris, `${v.seed} tris`).toBeLessThan(4000);
    }
  });

  it('pole/powerSpan/curb/parkedCar/meshFence build finite geometry', () => {
    const scene = new THREE.Scene();
    const b = createBuilder(scene);
    BD.pole(b, 0, 0);
    const a = BD.pole(b, 10, 0), c = BD.pole(b, 20, 4);
    BD.powerSpan(b, a, c);
    BD.curb(b, 0, 30, 10);
    BD.parkedCar(b, 5, 5, 0.3);
    const f = BD.meshFence(b, 8, 1.8);
    b.scene.add(f);
    const s = finite(scene);
    expect(s.ok).toBe(true);
    expect(s.meshes).toBeGreaterThan(10);
  });

  it('dressCity batches the whole dressing pass under budget', () => {
    const scene = new THREE.Scene();
    const b = createBuilder(scene, { poolSize: 8 });
    BD.dressCity(b);
    batchWorld(scene, {}, { occluders: b.occluders });
    const s = finite(scene);
    expect(s.ok).toBe(true);
    // The dressing pass must stay a small slice of the frame budget: merged batches,
    // not one mesh per window. Generous ceiling — the real gate is the CDMX profile.
    expect(s.meshes).toBeLessThan(400);
    expect(s.tris).toBeLessThan(120000);
  });
});
