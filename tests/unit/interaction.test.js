import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createInteractions } from '../../src/game/interaction.js';

const cube = (z, scene) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshBasicMaterial());
  m.position.set(0, 0, z);
  scene.add(m);
  return m;
};

function setup() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 80);
  scene.add(camera);
  const update = () => scene.updateMatrixWorld(true);
  return { scene, camera, update, interactions: createInteractions(2.3) };
}

describe('interactions', () => {
  it('picks the object under the crosshair within reach', () => {
    const { scene, camera, update, interactions } = setup();
    interactions.interact(cube(-1.5, scene), () => 'Use me', () => {});
    update();
    expect(interactions.pick(camera)?.label).toBe('Use me');
  });

  it('ignores objects beyond reach', () => {
    const { scene, camera, update, interactions } = setup();
    interactions.interact(cube(-4, scene), () => 'Too far', () => {});
    update();
    expect(interactions.pick(camera)).toBe(null);
  });

  it('cannot interact through walls', () => {
    const { scene, camera, update, interactions } = setup();
    interactions.addOccluders([cube(-0.8, scene)]);
    interactions.interact(cube(-1.8, scene), () => 'Behind wall', () => {});
    update();
    expect(interactions.pick(camera)).toBe(null);
  });

  it('skips hidden objects, including ones hidden through a parent', () => {
    const { scene, camera, update, interactions } = setup();
    const group = new THREE.Group();
    scene.add(group);
    const hidden = cube(-1, group);
    interactions.interact(hidden, () => 'Hidden', () => {});
    interactions.interact(cube(-1.8, scene), () => 'Visible', () => {});
    group.visible = false;
    update();
    expect(interactions.pick(camera)?.label).toBe('Visible');
  });

  it('returns null when the interaction has no label right now', () => {
    const { scene, camera, update, interactions } = setup();
    let ready = false;
    interactions.interact(cube(-1.5, scene), () => (ready ? 'Ready' : null), () => {});
    update();
    expect(interactions.pick(camera)).toBe(null);
    ready = true;
    expect(interactions.pick(camera)?.label).toBe('Ready');
  });

  it('registers every mesh inside a group', () => {
    const { scene, camera, update, interactions } = setup();
    const group = new THREE.Group();
    scene.add(group);
    cube(-1.5, group);
    cube(-3, group);
    let used = 0;
    interactions.interact(group, () => 'Truck', () => used++);
    update();
    expect(interactions.targets).toHaveLength(2);
    interactions.pick(camera).it.use();
    expect(used).toBe(1);
  });
});
