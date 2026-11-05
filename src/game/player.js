import * as THREE from 'three';

const EYE = 1.6, RADIUS = 0.3, SENS = 0.0022;
const WALK = 4.2, RUN = 6.8;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const scratch = new THREE.Vector3();
const before = new THREE.Vector3();

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
    this.speedScale = 1;
    // Phone flashlight, switched on by level scripts during blackouts.
    this.flashlight = new THREE.SpotLight(0xfff1dc, 0, 30, 0.5, 0.55, 1.6);
    this.flashlight.position.set(0.15, -0.15, 0);
    this.flashlight.target.position.set(0, -0.1, -1);
    camera.add(this.flashlight, this.flashlight.target);
  }

  spawn(x, z, yaw) {
    this.pos.set(x, 0, z);
    this.yaw = yaw;
    this.pitch = 0;
  }

  forward() {
    return scratch.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  facing(p) {
    return new THREE.Vector3(p.x - this.pos.x, 0, p.z - this.pos.z).normalize().dot(this.forward());
  }

  hold(kind, mesh = null, pos = [0.32, -0.32, -0.65], rot = [0.1, -0.3, 0]) {
    if (this.held) {
      this.held.userData.held = false;
      this.camera.remove(this.held);
    }
    this.heldKind = kind;
    this.held = mesh;
    if (!mesh) return;
    mesh.userData.held = true;
    mesh.position.set(...pos);
    mesh.rotation.set(...rot);
    this.camera.add(mesh);
  }

  update(dt, input, colliders, enabled, onStep) {
    let moved = 0;
    if (enabled) {
      this.yaw -= input.dx * SENS;
      this.pitch = clamp(this.pitch - input.dy * SENS, -1.45, 1.45);
      const k = input.keys;
      const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
      const s = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
      if (f || s) {
        const speed = (k.has('ShiftLeft') || k.has('ShiftRight') ? RUN : WALK) * this.speedScale * dt;
        const fwd = this.forward();
        const len = Math.hypot(f, s);
        const mx = ((fwd.x * f - fwd.z * s) / len) * speed;
        const mz = ((fwd.z * f + fwd.x * s) / len) * speed;
        before.copy(this.pos);
        // Sub-step so the fastest flow speed cannot tunnel through thin walls.
        const steps = Math.max(1, Math.ceil(Math.hypot(mx, mz) / 0.15));
        for (let i = 0; i < steps; i++) {
          this.pos.x += mx / steps;
          this.resolve(colliders);
          this.pos.z += mz / steps;
          this.resolve(colliders);
        }
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

  resolve(colliders) {
    resolveCircle(this.pos, colliders);
  }
}

export const circleHits = (x, z, c, radius = RADIUS) => {
  const cos = Math.cos(c.rot), sin = Math.sin(c.rot);
  const dx = x - c.cx, dz = z - c.cz;
  const lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
  const ox = lx - clamp(lx, -c.hx, c.hx), oz = lz - clamp(lz, -c.hz, c.hz);
  return ox * ox + oz * oz < radius * radius;
};

// Push a circle out of every overlapping oriented box (done in each box's local frame).
export function resolveCircle(p, colliders, radius = RADIUS) {
  for (const c of colliders) {
    const cos = Math.cos(c.rot), sin = Math.sin(c.rot);
    const dx = p.x - c.cx, dz = p.z - c.cz;
    let lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
    const ox = lx - clamp(lx, -c.hx, c.hx), oz = lz - clamp(lz, -c.hz, c.hz);
    const d2 = ox * ox + oz * oz;
    if (d2 >= radius * radius) continue;
    const d = Math.sqrt(d2);
    if (d > 1e-6) {
      lx += (ox / d) * (radius - d);
      lz += (oz / d) * (radius - d);
    } else if (c.hx - Math.abs(lx) < c.hz - Math.abs(lz)) {
      lx = Math.sign(lx || 1) * (c.hx + radius);
    } else {
      lz = Math.sign(lz || 1) * (c.hz + radius);
    }
    p.x = c.cx + lx * cos + lz * sin;
    p.z = c.cz - lx * sin + lz * cos;
  }
}
