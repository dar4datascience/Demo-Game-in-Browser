import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Player, resolveCircle, circleHits } from '../../src/game/player.js';

const box = (cx, cz, hx, hz, rot = 0) => ({ cx, cz, hx, hz, rot });
const input = (...keys) => ({ keys: new Set(keys), dx: 0, dy: 0 });
const newPlayer = () => new Player(new THREE.PerspectiveCamera());

describe('collision', () => {
  it('pushes a circle out of an axis-aligned box to exactly the radius', () => {
    const p = { x: 1.1, z: 0 };
    resolveCircle(p, [box(0, 0, 1, 1)]);
    expect(p.x).toBeCloseTo(1.3);
    expect(p.z).toBeCloseTo(0);
  });

  it('leaves circles that do not touch untouched', () => {
    const p = { x: 2, z: 2 };
    resolveCircle(p, [box(0, 0, 1, 1)]);
    expect(p).toEqual({ x: 2, z: 2 });
  });

  it('escapes along the shallowest axis when the centre is inside the box', () => {
    const p = { x: 0.1, z: 0.9 };
    resolveCircle(p, [box(0, 0, 1, 1)]);
    expect(p.z).toBeCloseTo(1.3);
    expect(p.x).toBeCloseTo(0.1);
  });

  it('respects rotated (oriented) boxes such as diagonally parked trucks', () => {
    const truck = box(0, 0, 1, 3, Math.PI / 4);
    // Along the truck's long axis (rotated 45°) a point 2m out is inside; perpendicular it is clear.
    const along = { x: Math.sin(Math.PI / 4) * 2, z: Math.cos(Math.PI / 4) * 2 };
    expect(circleHits(along.x, along.z, truck)).toBe(true);
    expect(circleHits(2, -2, truck)).toBe(false);
    resolveCircle(along, [truck]);
    expect(circleHits(along.x, along.z, truck, 0.299)).toBe(false);
  });
});

describe('Player', () => {
  it('spawns at a position and heading', () => {
    const player = newPlayer();
    player.spawn(3, -4, Math.PI);
    expect(player.pos.toArray()).toEqual([3, 0, -4]);
    expect(player.forward().z).toBeCloseTo(1);
  });

  it('walks forward at 2.2 m/s and runs at 3.6 m/s, scaled by speedScale', () => {
    const player = newPlayer();
    player.spawn(0, 0, 0);
    player.update(1, input('KeyW'), [], true);
    expect(player.pos.z).toBeCloseTo(-2.2);
    player.spawn(0, 0, 0);
    player.update(1, input('KeyW', 'ShiftLeft'), [], true);
    expect(player.pos.z).toBeCloseTo(-3.6);
    player.spawn(0, 0, 0);
    player.speedScale = 0.5;
    player.update(1, input('KeyW'), [], true);
    expect(player.pos.z).toBeCloseTo(-1.1);
  });

  it('does not move when input is disabled', () => {
    const player = newPlayer();
    player.update(1, input('KeyW'), [], false);
    expect(player.pos.toArray()).toEqual([4.5, 0, 13]);
  });

  it('is stopped by walls', () => {
    const player = newPlayer();
    player.spawn(0, 0, 0);
    const wall = box(0, -1.1, 5, 0.1);
    for (let i = 0; i < 20; i++) player.update(0.1, input('KeyW'), [wall], true);
    expect(player.pos.z).toBeGreaterThanOrEqual(-1 + 0.3 - 1e-6);
  });

  it('reports how directly it faces a point', () => {
    const player = newPlayer();
    player.spawn(0, 0, 0);
    expect(player.facing({ x: 0, z: -5 })).toBeCloseTo(1);
    expect(player.facing({ x: 0, z: 5 })).toBeCloseTo(-1);
    expect(player.facing({ x: 5, z: 0 })).toBeCloseTo(0);
  });

  it('attaches held items to the camera and replaces them', () => {
    const player = newPlayer();
    const a = new THREE.Mesh(), b = new THREE.Mesh();
    player.hold('box', a);
    expect(a.parent).toBe(player.camera);
    player.hold('bag', b, [0, -1, -1]);
    expect(a.parent).toBe(null);
    expect(player.heldKind).toBe('bag');
    expect(b.position.toArray()).toEqual([0, -1, -1]);
    player.hold(null);
    expect(player.held).toBe(null);
  });
});
