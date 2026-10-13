import * as THREE from 'three';
import { lam } from '../engine/post.js';

// Low-poly box humanoid facing +z.
function makePerson({
  skin = '#d6a983', top = '#2c3442', bottom = '#22252b', hair = '#1a1612',
  longHair = false, veil = false, dress = false, height = 1, emissive = 0, hollow = false,
}) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(height);
  root.add(body);
  const mat = (c) => lam({ color: c, emissive: c, emissiveIntensity: emissive });
  const part = (w, h, d, c, x, y, z, parent = body) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const limb = (x, y, w, len, c) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    body.add(pivot);
    part(w, len, w, c, 0, -len / 2, 0, pivot);
    return pivot;
  };

  const legs = [limb(-0.11, 0.85, 0.16, 0.85, dress ? skin : bottom), limb(0.11, 0.85, 0.16, 0.85, dress ? skin : bottom)];
  if (dress) part(0.5, 0.7, 0.34, top, 0, 0.62, 0);
  part(0.46, 0.62, 0.26, top, 0, 1.16, 0);
  const arms = [limb(-0.3, 1.44, 0.12, 0.62, top), limb(0.3, 1.44, 0.12, 0.62, top)];
  arms.forEach((a) => part(0.11, 0.1, 0.11, skin, 0, -0.66, 0, a));
  part(0.12, 0.08, 0.12, skin, 0, 1.5, 0);

  const head = new THREE.Group();
  head.position.set(0, 1.66, 0);
  body.add(head);
  part(0.26, 0.3, 0.26, skin, 0, 0, 0, head);
  part(0.28, 0.08, 0.28, hair, 0, 0.15, 0, head);
  if (longHair) {
    part(0.3, 0.8, 0.08, hair, 0, -0.24, -0.14, head);
    part(0.05, 0.62, 0.28, hair, -0.15, -0.16, 0, head);
    part(0.05, 0.62, 0.28, hair, 0.15, -0.16, 0, head);
    if (veil) part(0.26, 0.55, 0.04, hair, 0, -0.1, 0.15, head);
    else part(0.07, 0.5, 0.03, hair, -0.1, -0.12, 0.14, head);
  } else {
    part(0.28, 0.18, 0.06, hair, 0, 0.05, -0.12, head);
  }
  if (!veil) {
    const [w, h] = hollow ? [0.06, 0.05] : [0.045, 0.025];
    for (const x of [-0.06, 0.06]) part(w, h, 0.01, '#000', x, 0.02, 0.131, head);
    if (hollow) part(0.05, 0.08, 0.01, '#000', 0.01, -0.08, 0.131, head);
  }
  return { root, legs, arms, head };
}

export class NPC {
  constructor(opts, scene) {
    Object.assign(this, makePerson(opts));
    scene.add(this.root);
    this.path = [];
    this.speed = 1.1;
    this.phase = 0;
    this.swing = 0;
  }

  get pos() {
    return this.root.position;
  }

  place(x, z) {
    this.root.position.set(x, 0, z);
  }

  face(x, z) {
    this.root.rotation.y = Math.atan2(x - this.pos.x, z - this.pos.z);
  }

  walk(points, speed = 1.1) {
    this.path = points.slice();
    this.speed = speed;
    return new Promise((resolve) => (this.onArrive = resolve));
  }

  update(dt) {
    const p = this.pos;
    if (this.path.length) {
      const [tx, tz] = this.path[0];
      const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz), step = this.speed * dt;
      if (d <= step) {
        p.x = tx;
        p.z = tz;
        this.path.shift();
        if (!this.path.length) {
          const done = this.onArrive;
          this.onArrive = null;
          done?.();
        }
      } else {
        p.x += (dx / d) * step;
        p.z += (dz / d) * step;
        const target = Math.atan2(dx, dz);
        let diff = target - this.root.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        this.root.rotation.y += diff * Math.min(1, dt * 8);
      }
      this.phase += dt * this.speed * 5.5;
      this.swing = Math.min(1, this.swing + dt * 4);
    } else {
      this.swing = Math.max(0, this.swing - dt * 4);
    }
    const a = Math.sin(this.phase) * 0.55 * this.swing;
    this.legs[0].rotation.x = a;
    this.legs[1].rotation.x = -a;
    this.arms[0].rotation.x = -a * 0.8;
    this.arms[1].rotation.x = a * 0.8;
  }
}
