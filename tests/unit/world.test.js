import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createBuilder } from '../../src/world/builder.js';
import { NPC } from '../../src/world/person.js';
import { formatClock } from '../../src/game/hud.js';
import { rand, canvasTexture } from '../../src/engine/textures.js';
import { ROWS, UNIT_X, PASILLOS, SEGMENTS, unitAt } from '../../src/levels/ceda/world.js';

describe('level builder', () => {
  it('adds oriented colliders matching box size and rotation', () => {
    const b = createBuilder(new THREE.Scene());
    b.box(2, 1, 4, new THREE.MeshBasicMaterial(), 5, 0.5, -3, { ry: 0.45 });
    expect(b.colliders[0]).toEqual({ cx: 5, cz: -3, hx: 1, hz: 2, rot: 0.45 });
  });

  it('only registers occluders and colliders when asked', () => {
    const b = createBuilder(new THREE.Scene());
    b.box(1, 1, 1, new THREE.MeshBasicMaterial(), 0, 0, 0, { collide: false, occlude: true });
    expect(b.colliders).toHaveLength(0);
    expect(b.occluders).toHaveLength(1);
  });

  it('converts bounds to a centred box', () => {
    const b = createBuilder(new THREE.Scene());
    b.addBounds(-2, 4, 1, 2);
    expect(b.colliders[0]).toEqual({ cx: 1, cz: 1.5, hx: 3, hz: 0.5, rot: 0 });
  });

  it('cuts grid lights and glow materials on blackout, leaving off-grid lights on', () => {
    const b = createBuilder(new THREE.Scene());
    const grid = b.light(0, 3, 0, 0xffffff, 10, 5);
    const street = b.light(0, 3, 0, 0xffffff, 7, 5, false);
    const glow = b.glowMat({ color: 0xffffff }, 0x111111);
    b.setPower(false);
    expect(grid.intensity).toBe(0);
    expect(street.intensity).toBe(7);
    expect(glow.color.getHex()).toBe(0x111111);
    expect(b.powered).toBe(false);
    b.setPower(true);
    expect(grid.intensity).toBe(10);
    expect(glow.color.getHex()).toBe(0xffffff);
  });
});

describe('NPC', () => {
  it('walks a path at its speed and resolves on arrival', async () => {
    const npc = new NPC({}, new THREE.Scene());
    npc.place(0, 0);
    let arrived = false;
    npc.walk([[0, 2], [2, 2]], 1).then(() => (arrived = true));
    for (let i = 0; i < 30; i++) npc.update(0.1);
    await new Promise((r) => setImmediate(r));
    expect(arrived).toBe(false);
    for (let i = 0; i < 15; i++) npc.update(0.1);
    await new Promise((r) => setImmediate(r));
    expect(arrived).toBe(true);
    expect(npc.pos.x).toBeCloseTo(2);
    expect(npc.pos.z).toBeCloseTo(2);
  });

  it('faces a target point', () => {
    const npc = new NPC({}, new THREE.Scene());
    npc.place(0, 0);
    npc.face(1, 0);
    expect(npc.root.rotation.y).toBeCloseTo(Math.PI / 2);
  });
});

describe('HUD clock', () => {
  it('formats 12-hour time with one game minute per 6 seconds', () => {
    expect(formatClock(23 * 60 + 40, 0)).toBe('11:40 PM');
    expect(formatClock(4 * 60 + 10, 60)).toBe('4:20 AM');
    expect(formatClock(23 * 60 + 59, 6)).toBe('12:00 AM');
    expect(formatClock(11 * 60 + 59, 6)).toBe('12:00 PM');
  });
});

describe('procedural textures', () => {
  it('rand() stays in [0, 1)', () => {
    for (let i = 0; i < 1000; i++) {
      const r = rand();
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
    }
  });

  it('builds pixel-art textures: nearest filtering, sRGB, repeat wrapping', () => {
    const t = canvasTexture(8, 8, () => {});
    expect(t.magFilter).toBe(THREE.NearestFilter);
    expect(t.minFilter).toBe(THREE.NearestFilter);
    expect(t.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(t.wrapS).toBe(THREE.RepeatWrapping);
  });
});

describe('Central de Abasto layout', () => {
  it('maps bodega ids to storefront positions', () => {
    expect(unitAt('B-4')).toEqual({ x: UNIT_X[3], z: ROWS.B });
    expect(unitAt('D-12')).toEqual({ x: 25, z: ROWS.D });
  });

  it('keeps every bodega unit inside a building segment, clear of the pasillos', () => {
    for (const x of UNIT_X) {
      expect(SEGMENTS.some(([a, b]) => x - 2 >= a && x + 2 <= b)).toBe(true);
      for (const px of PASILLOS) expect(Math.abs(x - px)).toBeGreaterThanOrEqual(3 + 2);
    }
  });

  it('orders rows north to south with room for docks and truck bays between them', () => {
    const fronts = Object.values(ROWS);
    for (let i = 1; i < fronts.length; i++) expect(fronts[i] - 6 - fronts[i - 1]).toBeGreaterThanOrEqual(8);
  });
});
