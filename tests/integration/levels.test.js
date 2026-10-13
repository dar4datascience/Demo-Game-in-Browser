import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { LEVELS } from '../../src/levels/index.js';
import { EXIT_Z } from '../../src/levels/ceda/world.js';
import { circleHits } from '../../src/game/player.js';
import { reachableCells, nearestDistance, worldPosition } from '../helpers/harness.js';

// Max horizontal distance from a walkable spot to an interactable (interaction reach is 2.3m from the eyes).
const REACH = 2.0;

function build(levelId) {
  const scene = new THREE.Scene();
  const world = LEVELS[levelId].build(scene);
  scene.updateMatrixWorld(true);
  return { scene, world };
}

const validColliders = (colliders) => colliders.every((c) =>
  [c.cx, c.cz, c.hx, c.hz, c.rot].every(Number.isFinite) && c.hx > 0 && c.hz > 0);

describe('NightMart (konbini) level', () => {
  let world, cells;
  const spawn = { x: 4.5, z: 13 };
  beforeAll(() => {
    ({ world } = build('konbini'));
    cells = reachableCells(world.colliders, { minX: -11, maxX: 11, minZ: -11, maxZ: 16 }, spawn);
  });

  it('builds the world contract main.js relies on', () => {
    expect(validColliders(world.colliders)).toBe(true);
    expect(world.occluders.length).toBeGreaterThan(0);
    expect(world.fog).toHaveLength(3);
    expect(world.cameras).toContain(world.secCam);
    expect(typeof world.update).toBe('function');
    expect(world.refs.slots).toHaveLength(3);
  });

  it('does not spawn the player inside a collider', () => {
    expect(world.colliders.some((c) => circleHits(spawn.x, spawn.z, c))).toBe(false);
  });

  it('keeps every interactable reachable on foot from the spawn', () => {
    const R = world.refs;
    const targets = {
      timeClock: R.timeClock[0], boxes: R.boxes[1], phone: R.phone[0], register: R.register[0],
      trashBag: R.trashBag, dumpster: R.dumpster, monitor: R.monitor[0],
      ...Object.fromEntries(R.slots.map((s, i) => [`slot${i}`, s.mesh])),
    };
    for (const [name, obj] of Object.entries(targets)) {
      const p = worldPosition(obj);
      expect(nearestDistance(cells, p.x, p.z), name).toBeLessThanOrEqual(REACH);
    }
  });

  it('toggles store power without touching the parking-lot lamp', () => {
    world.setPower(false);
    const lit = world.scene.children.filter((o) => o.isPointLight && o.intensity > 0);
    expect(lit.length).toBeGreaterThan(0);
    world.setPower(true);
  });
});

describe('Central de Abasto level', () => {
  let world, cells;
  const spawn = { x: 0, z: 33 };
  beforeAll(() => {
    ({ world } = build('ceda'));
    cells = reachableCells(world.colliders, { minX: -40, maxX: 40, minZ: -60, maxZ: 37 }, spawn);
  });

  it('builds 4 rows × 12 bodegas with the storefronts the stories need', () => {
    const units = world.refs.units;
    expect(Object.keys(units)).toHaveLength(48);
    expect(units['B-4'].roll).toBe(0);
    for (const id of ['B-2', 'A-8', 'C-5', 'A-3', 'C-9', 'B-11']) expect(units[id].roll, id).toBe(1);
    expect(Object.keys(world.refs.trucks).sort()).toEqual(['d1', 'd2', 'd3', 'seller']);
    expect(Object.keys(world.refs.counters).sort()).toEqual(['A-8', 'B-2', 'C-5']);
    expect(Object.keys(world.refs.pickups).sort()).toEqual(['A-3', 'B-11', 'C-9']);
    expect(world.refs.pallets).toHaveLength(3);
  });

  it('has valid colliders and does not spawn the player inside one', () => {
    expect(validColliders(world.colliders)).toBe(true);
    expect(world.colliders.some((c) => circleHits(spawn.x, spawn.z, c))).toBe(false);
  });

  it('keeps every mission target reachable on foot from the spawn', () => {
    const R = world.refs;
    const targets = {
      diablito: R.diablito,
      cortinaB4: R.units['B-4'].cortina,
      scale: R.scale[0],
      ...Object.fromEntries(Object.entries(R.trucks).map(([k, v]) => [`truck ${k}`, v])),
      ...Object.fromEntries(Object.entries(R.counters).map(([k, v]) => [`counter ${k}`, v])),
      ...Object.fromEntries(Object.entries(R.pickups).map(([k, v]) => [`pickup ${k}`, v])),
      ...Object.fromEntries(R.pallets.map((p, i) => [`pallet ${i}`, p.mesh])),
    };
    for (const [name, obj] of Object.entries(targets)) {
      const p = worldPosition(obj);
      expect(nearestDistance(cells, p.x, p.z), name).toBeLessThanOrEqual(REACH);
    }
  });

  it('lets the player escape through the Eje 5 Sur gate', () => {
    expect(cells.some(([, z]) => z < EXIT_Z)).toBe(true);
  });

  it('forces travel through the pasillos: rows block direct crossings between lanes', () => {
    // Straight north–south line through the middle of a bodega segment is blocked by buildings.
    const blocked = world.colliders.some((c) => circleHits(-15, -24, c));
    expect(blocked).toBe(true);
  });

  it('rolls a cortina up over time', () => {
    const unit = world.refs.units['B-4'];
    unit.target = 1;
    for (let i = 0; i < 40; i++) world.update(0.1, []);
    expect(unit.roll).toBe(1);
    expect(unit.cortina.scale.y).toBeLessThan(0.01);
  });
});
