import * as THREE from 'three';

const visible = (obj) => {
  for (let o = obj; o; o = o.parent) if (!o.visible) return false;
  return true;
};

// Anything the player is carrying sits in front of the camera; it must not eat the crosshair ray.
const carried = (obj) => {
  for (let o = obj; o; o = o.parent) if (o.userData.held) return true;
  return false;
};

// Interaction targets share one raycast list with walls so nothing is usable through a wall.
export function createInteractions(reach = 2.3) {
  const targets = [];
  const raycaster = new THREE.Raycaster();
  raycaster.far = reach;
  const center = new THREE.Vector2();
  return {
    targets,
    addOccluders(meshes) {
      targets.push(...meshes);
    },
    interact(objects, label, use) {
      const it = { label, use };
      for (const obj of [objects].flat()) {
        obj.traverse((m) => {
          if (!m.isMesh) return;
          m.userData.interact = it;
          targets.push(m);
        });
      }
      return it;
    },
    // What the crosshair is on: { it, label } when an available interaction is in reach, else null.
    pick(camera) {
      camera.updateMatrixWorld();
      raycaster.setFromCamera(center, camera);
      const hit = raycaster.intersectObjects(targets, false).find((h) => visible(h.object) && !carried(h.object));
      const it = hit?.object.userData.interact;
      const label = it?.label();
      return label ? { it, label } : null;
    },
    // Every hit in reach, in order, for debugging (`?debug&colliders`-style inspection).
    debugPick(camera) {
      camera.updateMatrixWorld();
      raycaster.setFromCamera(center, camera);
      return raycaster.intersectObjects(targets, false).map((h) => ({
        distance: +h.distance.toFixed(2),
        object: h.object.type,
        label: h.object.userData.interact?.label?.() ?? null,
        position: h.point.toArray().map((v) => +v.toFixed(2)),
      }));
    },
  };
}
