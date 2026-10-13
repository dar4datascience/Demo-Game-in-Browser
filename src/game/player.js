import * as THREE from 'three';

const EYE = 1.6, RADIUS = 0.3, SENS = 0.0022;

export class Player {
  constructor(camera) {
    this.camera = camera;
    camera.rotation.order = 'YXZ';
    this.pos = new THREE.Vector3(4.5, 0, 13);
    this.yaw = 0;
    this.pitch = 0;
    this.stride = 0;
    this.bob = 0;
    this.held = null;
    this.heldKind = null;
  }

  forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  facing(p) {
    return new THREE.Vector3(p.x - this.pos.x, 0, p.z - this.pos.z).normalize().dot(this.forward());
  }

  hold(kind, mesh = null) {
    if (this.held) this.camera.remove(this.held);
    this.heldKind = kind;
    this.held = mesh;
    if (!mesh) return;
    mesh.position.set(0.32, -0.32, -0.65);
    mesh.rotation.set(0.1, -0.3, 0);
    this.camera.add(mesh);
  }

  update(dt, input, colliders, enabled, onStep) {
    let moved = 0;
    if (enabled) {
      this.yaw -= input.dx * SENS;
      this.pitch = THREE.MathUtils.clamp(this.pitch - input.dy * SENS, -1.45, 1.45);
      const k = input.keys;
      const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
      const s = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
      if (f || s) {
        const speed = (k.has('ShiftLeft') || k.has('ShiftRight') ? 3.6 : 2.2) * dt;
        const fwd = this.forward();
        const len = Math.hypot(f, s);
        const mx = ((fwd.x * f - fwd.z * s) / len) * speed;
        const mz = ((fwd.z * f + fwd.x * s) / len) * speed;
        const before = this.pos.clone();
        this.pos.x += mx;
        this.resolve(colliders);
        this.pos.z += mz;
        this.resolve(colliders);
        moved = before.distanceTo(this.pos);
      }
    }
    if (moved > 0) {
      this.bob += moved * 5.5;
      this.stride += moved;
      if (this.stride > 0.8) {
        this.stride = 0;
        onStep?.();
      }
    }
    this.camera.position.set(this.pos.x, EYE + Math.sin(this.bob) * 0.035, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  // Push the player's circle out of any overlapping axis-aligned box.
  resolve(colliders) {
    const p = this.pos;
    for (const c of colliders) {
      const nx = THREE.MathUtils.clamp(p.x, c.minX, c.maxX);
      const nz = THREE.MathUtils.clamp(p.z, c.minZ, c.maxZ);
      const dx = p.x - nx, dz = p.z - nz, d = Math.hypot(dx, dz);
      if (d >= RADIUS) continue;
      if (d > 1e-6) {
        p.x += (dx / d) * (RADIUS - d);
        p.z += (dz / d) * (RADIUS - d);
      } else {
        const pushes = [
          [c.minX - RADIUS - p.x, 0], [c.maxX + RADIUS - p.x, 0],
          [0, c.minZ - RADIUS - p.z], [0, c.maxZ + RADIUS - p.z],
        ].sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
        p.x += pushes[0][0];
        p.z += pushes[0][1];
      }
    }
  }
}
