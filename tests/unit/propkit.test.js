import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import * as PK from '../../src/world/propkit.js';

// Every builder in the kit, with the variants the levels actually place.
const BUILDERS = [
  ['bucket', () => PK.bucket()],
  ['bucket red', () => PK.bucket(0xd94f3d)],
  ['pot', () => PK.pot()],
  ['bottle', () => PK.bottle(0)],
  ['bottleB', () => PK.bottle(1)],
  ['bottleCrate', () => PK.bottleCrate()],
  ['stool', () => PK.stool()],
  ['tire', () => PK.tire()],
  ['box', () => PK.box()],
  ['box open', () => PK.box(0.6, 0.4, 0.5, { open: true })],
  ['sack', () => PK.sack()],
  ['crateSlats', () => PK.crateSlats()],
  ['crateSlats tinted', () => PK.crateSlats(0.7, 0.5, 0.4, 0xc8a878)],
  ['fence', () => PK.fence()],
  ['plasticCrate', () => PK.plasticCrate()],
  ['table', () => PK.table()],
  ['tarpPile', () => PK.tarpPile()],
  ['cone', () => PK.cone()],
];

const stats = (root) => {
  let meshes = 0, tris = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    const g = o.geometry;
    tris += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
  });
  return { meshes, tris };
};

describe('prop kit', () => {
  it('builds every prop headlessly with finite geometry', () => {
    for (const [name, make] of BUILDERS) {
      const g = make();
      expect(g.isGroup || g.isObject3D, name).toBeTruthy();
      let meshes = 0;
      g.traverse((o) => {
        if (!o.isMesh) return;
        meshes++;
        const pos = o.geometry.attributes.position;
        expect(pos.count, `${name} verts`).toBeGreaterThan(0);
        for (let i = 0; i < pos.count; i++) {
          expect(Number.isFinite(pos.getX(i)), `${name} x`).toBe(true);
          expect(Number.isFinite(pos.getY(i)), `${name} y`).toBe(true);
          expect(Number.isFinite(pos.getZ(i)), `${name} z`).toBe(true);
        }
        // Every solid carries AO vertex colours for the shared vertexColors materials.
        if (o.material.vertexColors) {
          expect(o.geometry.attributes.color, `${name} colour attr`).toBeDefined();
        }
      });
      expect(meshes, name).toBeGreaterThan(0);
    }
  });

  it('keeps props inside sane size and triangle budgets', () => {
    for (const [name, make] of BUILDERS) {
      const g = make();
      const box = new THREE.Box3().setFromObject(g);
      const size = box.getSize(new THREE.Vector3());
      const { tris } = stats(g);
      expect(size.y, `${name} height`).toBeLessThan(2.2);
      expect(size.x, `${name} width`).toBeLessThan(5);
      expect(tris, `${name} tris`).toBeLessThan(1200);
    }
    // The heaviest single prop still stays well under a person.
    expect(stats(PK.bottleCrate()).tris).toBeLessThan(1500);
  });

  it('sits every prop on the ground plane', () => {
    for (const [name, make] of BUILDERS) {
      const g = make();
      const box = new THREE.Box3().setFromObject(g);
      expect(box.min.y, `${name} min.y`).toBeGreaterThan(-0.02);
      expect(box.min.y, `${name} min.y`).toBeLessThan(0.06);
    }
  });

  it('shares materials across instances so batches stay cheap', () => {
    const a = PK.bucket(), b = PK.bucket(0x2e6fd9), c = PK.bucket(0xd94f3d);
    const mats = new Set();
    for (const root of [a, b, c]) root.traverse((o) => o.isMesh && mats.add(o.material));
    // Two colour variants of the same prop share the tint material; the red one shares it too.
    expect(mats.size).toBeLessThanOrEqual(1);
    const f1 = PK.fence(), f2 = PK.fence(6, 2);
    const fm = new Set();
    f1.traverse((o) => o.isMesh && fm.add(o.material));
    f2.traverse((o) => o.isMesh && fm.add(o.material));
    expect(fm.size).toBe(2); // chain-link + shared tint
  });
});
