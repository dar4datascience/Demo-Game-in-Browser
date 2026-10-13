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
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  facing(p) {
    return new THREE.Vector3(p.x - this.pos.x, 0, p.z - this.pos.z).normalize().dot(this.forward());
  }

  hold(kind, mesh = null, pos = [0.32, -0.32, -0.65], rot = [0.1, -0.3, 0]) {
    if (this.held) this.camera.remove(this.held);
    this.heldKind = kind;
    this.held = mesh;
    if (!mesh) return;
    mesh.position.set(...pos);
    mesh.rotation.set(...rot);
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
        const speed = (k.has('ShiftLeft') || k.has('ShiftRight') ? 3.6 : 2.2) * this.speedScale * dt;
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

  resolve(colliders) {
    resolveCircle(this.pos, colliders);
  }
}

// Point (x, z) in an oriented box collider's local frame, plus its offset from the box surface.
function toLocal(x, z, c) {
  const cos = Math.cos(c.rot), sin = Math.sin(c.rot);
  const dx = x - c.cx, dz = z - c.cz;
  const lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
  const ox = lx - THREE.MathUtils.clamp(lx, -c.hx, c.hx);
  const oz = lz - THREE.MathUtils.clamp(lz, -c.hz, c.hz);
  return { cos, sin, lx, lz, ox, oz, d: Math.hypot(ox, oz) };
}

export const circleHits = (x, z, c, radius = RADIUS) => toLocal(x, z, c).d < radius;

// Push a circle out of every overlapping oriented box (done in each box's local frame).
export function resolveCircle(p, colliders, radius = RADIUS) {
  for (const c of colliders) {
    let { cos, sin, lx, lz, ox, oz, d } = toLocal(p.x, p.z, c);
    if (d >= radius) continue;
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
