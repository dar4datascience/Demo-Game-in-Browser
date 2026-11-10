import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { makePerson, NPC } from '../../src/world/person.js';
import { batchStatic } from '../../src/world/batch.js';

// Skinned humanoid contract + budget tests. Geometry/bones are pure math, so these run
// headlessly; the canvas stub in tests/setup covers the atlas painting.

const GHOST = {
  skin: '#e8e2d2', top: '#f2efe4', bottom: '#2b2f38', hair: '#d8d2c2',
  longHair: true, dress: true, veil: false, height: 1.04, emissive: 0.55, hollow: true,
};
const BRIDE = {
  skin: '#d6a983', top: '#f4f1e8', bottom: '#2a2420', hair: '#2a2420',
  dress: true, veil: true, longHair: true, height: 1,
};
const BEAST = {
  skin: '#5a4632', top: '#3a2f24', bottom: '#2c2620', hair: '#241c14',
  longHair: true, height: 1.7, emissive: 0.1,
};

const meshesOf = (root) => {
  const out = [];
  root.traverse((o) => { if (o.isMesh) out.push(o); });
  return out;
};
const trisOf = (root) => meshesOf(root).reduce((n, m) => {
  const g = m.geometry;
  return n + (g.index ? g.index.count : g.attributes.position.count) / 3;
}, 0);

const bodyMesh = (root) => meshesOf(root).find((m) => m.isSkinnedMesh);

describe('skinned person', () => {
  it('keeps the pivot contract: legs/arms are the thigh/upperArm bones, head is the head bone', () => {
    const { root, legs, arms, head, rig } = makePerson({});
    expect(legs).toHaveLength(2);
    expect(arms).toHaveLength(2);
    expect(legs[0].isBone).toBe(true);
    expect(arms[0].isBone).toBe(true);
    expect(head.isBone).toBe(true);
    expect(head).toBe(rig.head);
    expect(rig.shins).toHaveLength(2);
    expect(rig.forearms).toHaveLength(2);
    expect(root.children.length).toBeGreaterThan(0);
  });

  it('has valid skin weights summing to 1 with in-range bone indices', () => {
    const { root } = makePerson({ outfit: 'jacket', dress: true });
    const mesh = bodyMesh(root);
    expect(mesh).toBeTruthy();
    const geo = mesh.geometry;
    const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
    const boneCount = mesh.skeleton.bones.length;
    expect(boneCount).toBe(13);
    for (let i = 0; i < si.count; i++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        expect(si.getComponent(i, k)).toBeLessThan(boneCount);
        sum += sw.getComponent(i, k);
      }
      expect(sum).toBeCloseTo(1, 3);
    }
  });

  it('stays inside the draw-call and triangle budget', () => {
    for (const opts of [{}, { outfit: 'dress', dress: true, longHair: true, veil: true }, GHOST]) {
      const { root } = makePerson(opts);
      const meshes = meshesOf(root);
      // One skinned body + one head (+ optional veil) -> ~2-3 draw calls per person.
      expect(meshes.length).toBeLessThanOrEqual(10);
      const tris = trisOf(root);
      expect(tris).toBeGreaterThanOrEqual(1200);
      expect(tris).toBeLessThanOrEqual(4000);
    }
  });

  it('stands ~1.75 tall for average build with feet at y=0', () => {
    const { root } = makePerson({ build: 'average' });
    const box = new THREE.Box3().setFromObject(root);
    expect(box.min.y).toBeCloseTo(0, 1);
    const h = box.max.y - box.min.y;
    expect(h).toBeGreaterThan(1.65);
    expect(h).toBeLessThan(1.9);
  });

  it('build variants change body width', () => {
    const width = (build) => {
      const { root } = makePerson({ build });
      const box = new THREE.Box3().setFromObject(root);
      root.removeFromParent();
      return Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
    };
    expect(width('heavy')).toBeGreaterThan(width('slim') * 1.1);
    expect(width('average')).toBeGreaterThan(width('slim'));
    expect(width('heavy')).toBeGreaterThan(width('average'));
  });

  it('pose sit lowers the hips', () => {
    const stand = makePerson({ pose: 'stand' });
    const sit = makePerson({ pose: 'sit' });
    expect(sit.rig.hips.position.y).toBeLessThan(stand.rig.hips.position.y - 0.2);
    expect(sit.legs[0].rotation.x).toBeLessThan(-1);
  });

  it('builds every outfit x build combination without throwing', () => {
    for (const outfit of ['tee', 'hoodie', 'jacket', 'apron', 'suit', 'uniform', 'dress']) {
      for (const build of ['slim', 'average', 'heavy']) {
        const { root, legs, arms, head } = makePerson({ outfit, build });
        expect(legs).toHaveLength(2);
        expect(arms).toHaveLength(2);
        expect(head.isBone).toBe(true);
        expect(bodyMesh(root)).toBeTruthy();
        root.removeFromParent();
      }
    }
  });

  it('supports hairStyle, glasses, hat/cap, figure and pose options', () => {
    for (const opts of [
      { hairStyle: 'bob' }, { hairStyle: 'bun' }, { hairStyle: 'bald' },
      { hairStyle: 'cap' }, { glasses: true }, { cap: true }, { hat: true },
      { figure: 'masc' }, { figure: 'femme' }, { pose: 'present' }, { pose: 'hold' },
    ]) {
      const { root } = makePerson(opts);
      expect(bodyMesh(root)).toBeTruthy();
      root.removeFromParent();
    }
  });

  it('is never merged by batchStatic (skinned meshes keep their attributes)', () => {
    const { root } = makePerson({ outfit: 'jacket', dress: true, veil: true });
    const before = meshesOf(root).length;
    expect(batchStatic(root)).toBe(0);
    const meshes = meshesOf(root);
    expect(meshes.length).toBe(before);
    const mesh = bodyMesh(root);
    expect(mesh.geometry.attributes.skinIndex).toBeTruthy();
    expect(mesh.geometry.attributes.skinWeight).toBeTruthy();
  });

  it('walk animation swings legs and flexes knees and elbows', () => {
    const npc = new NPC({}, new THREE.Scene());
    npc.place(0, 0);
    npc.walk([[0, 3]], 1);
    let maxKnee = 0, maxElbow = 0, maxLeg = 0;
    for (let i = 0; i < 25; i++) {
      npc.update(0.1);
      maxLeg = Math.max(maxLeg, Math.abs(npc.legs[0].rotation.x), Math.abs(npc.legs[1].rotation.x));
      maxKnee = Math.max(maxKnee, Math.abs(npc.rig.shins[0].rotation.x), Math.abs(npc.rig.shins[1].rotation.x));
      maxElbow = Math.max(maxElbow, Math.abs(npc.rig.forearms[0].rotation.x - npc.rig.base.farm0), Math.abs(npc.rig.forearms[1].rotation.x - npc.rig.base.farm1));
    }
    expect(maxLeg).toBeGreaterThan(0.1);
    expect(maxKnee).toBeGreaterThan(0.1);
    expect(maxElbow).toBeGreaterThan(0.05);
  });

  it('idle animation breathes the chest without moving the feet', () => {
    const npc = new NPC({}, new THREE.Scene());
    npc.place(0, 0);
    const c0 = npc.rig.chest.rotation.x;
    for (let i = 0; i < 30; i++) npc.update(0.1);
    expect(npc.rig.chest.rotation.x).not.toBe(c0);
  });

  it('idle weight shift leans the spine and hips without breaking the leg contract', () => {
    const npc = new NPC({}, new THREE.Scene());
    npc.place(0, 0);
    let maxLean = 0, maxHip = 0;
    for (let i = 0; i < 40; i++) {
      npc.update(0.1);
      maxLean = Math.max(maxLean, Math.abs(npc.rig.spine.rotation.x - npc.rig.base.spineX));
      maxHip = Math.max(maxHip, Math.abs(npc.rig.hips.position.x - npc.rig.base.hipsX));
    }
    expect(maxLean).toBeGreaterThan(0.003);
    expect(maxHip).toBeGreaterThan(0.002);
    expect(maxHip).toBeLessThan(0.05);
    expect(npc.legs[0].isBone).toBe(true);
  });

  it('lookAt turns the head toward a target, clamped to ±40° yaw and ±20° pitch', () => {
    const npc = new NPC({}, new THREE.Scene());
    npc.place(0, 0);
    npc.face(0, 5); // face +z
    // Target far to the left -> yaw clamps at -0.7 rad.
    npc.lookAt(new THREE.Vector3(-5, 0, 0), 1.5);
    for (let i = 0; i < 40; i++) npc.update(0.1);
    expect(npc.rig.head.rotation.y).toBeLessThan(-0.6);
    expect(npc.rig.head.rotation.y).toBeGreaterThan(-0.75);
    // Target behind -> same clamp, opposite sign after re-aiming right.
    npc.lookAt(new THREE.Vector3(5, 0, 0), 1.5);
    for (let i = 0; i < 40; i++) npc.update(0.1);
    expect(npc.rig.head.rotation.y).toBeGreaterThan(0.6);
    expect(npc.rig.head.rotation.y).toBeLessThan(0.75);
    // Pitch clamps at ±0.35 even for a target far above (negative x = looking up).
    npc.lookAt(new THREE.Vector3(0.4, 4, 0.2), 0);
    for (let i = 0; i < 40; i++) npc.update(0.1);
    expect(npc.rig.head.rotation.x).toBeGreaterThanOrEqual(-0.36);
    expect(npc.rig.head.rotation.x).toBeLessThan(-0.3);
    // Out of range (>6 m) eases back to the rest pose.
    npc.lookAt(new THREE.Vector3(0, 0, 20), 1.5);
    for (let i = 0; i < 60; i++) npc.update(0.1);
    expect(Math.abs(npc.rig.head.rotation.y)).toBeLessThan(0.05);
    expect(Math.abs(npc.rig.head.rotation.x)).toBeLessThan(0.05);
    // lookAtPlayer accepts an object with .pos and keeps tracking it.
    const player = { pos: new THREE.Vector3(2, 0, 1) };
    npc.lookAtPlayer(player);
    for (let i = 0; i < 40; i++) npc.update(0.1);
    expect(npc.rig.head.rotation.y).toBeGreaterThan(0.2);
    player.pos.set(-2, 0, 1);
    for (let i = 0; i < 60; i++) npc.update(0.1);
    expect(npc.rig.head.rotation.y).toBeLessThan(-0.2);
  });

  it('lookAt leaves story head tilts on rotation.z untouched', () => {
    const npc = new NPC({}, new THREE.Scene());
    npc.place(0, 0);
    npc.face(0, 5);
    npc.head.rotation.z = 0.35;
    npc.lookAtPlayer({ pos: new THREE.Vector3(1, 0, 1) });
    for (let i = 0; i < 30; i++) npc.update(0.1);
    expect(npc.head.rotation.z).toBeCloseTo(0.35, 5);
    expect(Math.abs(npc.rig.head.rotation.y)).toBeGreaterThan(0.05);
  });

  it('builds ghost, bride and beast variants', () => {
    for (const opts of [GHOST, BRIDE, BEAST]) {
      const { root, legs, arms, head } = makePerson(opts);
      const meshes = meshesOf(root);
      expect(meshes.length).toBeLessThanOrEqual(10);
      expect(trisOf(root)).toBeLessThanOrEqual(4000);
      expect(legs).toHaveLength(2);
      expect(head.isBone).toBe(true);
    }
  });

  it('shares geometry and material between NPCs with the same look', () => {
    const a = makePerson({ outfit: 'jacket', build: 'slim' });
    const b = makePerson({ outfit: 'jacket', build: 'slim' });
    const ma = bodyMesh(a.root), mb = bodyMesh(b.root);
    expect(ma.geometry).toBe(mb.geometry);
    expect(ma.material).toBe(mb.material);
    // Different look -> different material (different atlas), same skeleton count.
    const c = makePerson({ outfit: 'tee' });
    expect(bodyMesh(c.root).material).not.toBe(ma.material);
  });
});
