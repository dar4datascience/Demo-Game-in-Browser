import * as THREE from 'three';
import { basic } from '../engine/post.js';
import { skyTex } from '../engine/textures.js';

/*
 * Inside-out sky dome: painted violet gradient, stars, clouds and a moon in one canvas texture.
 * Unlit and fog-free, and rendered before everything else, so a showcase shot can tilt up and
 * see a sky instead of the clear colour. `noBatch` keeps it out of the static merge.
 */
export function createSky(scene, { radius = 420 } = {}) {
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 32, 16),
    basic({ map: skyTex(), side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  dome.renderOrder = -10;
  dome.userData.noBatch = true;
  scene.add(dome);
  return { dome };
}
