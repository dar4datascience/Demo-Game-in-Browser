import * as THREE from 'three';
import { lam } from '../../engine/post.js';
import * as T from '../../engine/textures.js';

const mats = {};
const mat = (key, make) => (mats[key] ??= make());
const sackMat = () => mat('sack', () => lam({ map: T.sackTex() }));
const metal = (color) => mat(`metal${color}`, () => lam({ color }));

function part(parent, w, h, d, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function wheel(parent, r, w, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 8), metal(0x161616));
  mesh.rotation.z = Math.PI / 2;
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

// Invisible-but-raycastable volume that makes thin props easy to interact with.
export function hitbox(w, h, d, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat('hitbox', () => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })));
  mesh.position.set(x, y, z);
  return mesh;
}

// Hand truck. Rails rise along +y, the nose plate points toward +z.
export function makeDiablito() {
  const g = new THREE.Group();
  const red = metal(0xb3261e);
  for (const x of [-0.2, 0.2]) part(g, 0.04, 1.3, 0.04, red, x, 0.65, 0);
  for (const y of [0.45, 0.9]) part(g, 0.4, 0.03, 0.03, red, 0, y, 0);
  part(g, 0.56, 0.04, 0.04, metal(0x222222), 0, 1.3, 0);
  part(g, 0.46, 0.03, 0.34, red, 0, 0.02, 0.17);
  for (const x of [-0.27, 0.27]) wheel(g, 0.13, 0.06, x, 0.13, -0.08);
  const load = new THREE.Group();
  for (let i = 0; i < 3; i++) part(load, 0.42, 0.26, 0.3, sackMat(), (i % 2) * 0.03 - 0.015, 0.17 + i * 0.27, 0.2);
  load.visible = false;
  g.add(load);
  g.userData.load = load;
  return g;
}

export function sackStack(n = 4) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const s = part(g, 0.62, 0.3, 0.42, sackMat(), (i % 2) * 0.66 - 0.33, 0.15 + Math.floor(i / 2) * 0.31, 0);
    s.rotation.y = (i * 0.37) % 0.3 - 0.15;
  }
  return g;
}

export function crate(color) {
  const g = new THREE.Group();
  part(g, 0.6, 0.34, 0.4, mat('crate', () => lam({ map: T.woodTex() })), 0, 0.17, 0);
  part(g, 0.54, 0.04, 0.34, lam({ color }), 0, 0.33, 0);
  return g;
}

// Stake-bed truck ("camioneta de redilas"): cab toward +z, open bed toward -z.
export function makeTruck(color, cargo = true) {
  const g = new THREE.Group();
  const body = lam({ color });
  part(g, 2.0, 0.45, 5.4, metal(0x1d1d1f), 0, 0.6, 0);
  part(g, 2.0, 1.5, 1.7, body, 0, 1.55, 1.75);
  part(g, 1.8, 0.6, 0.05, mat('windshield', () => lam({ color: 0x1b2a38, emissive: 0x0a1018 })), 0, 1.95, 2.61);
  for (const x of [-0.7, 0.7]) part(g, 0.25, 0.12, 0.05, mat('headlight', () => lam({ color: 0xfff4c8, emissive: 0x665a30 })), x, 1.05, 2.62);
  const bed = part(g, 2.0, 0.15, 3.5, mat('bed', () => lam({ map: T.woodTex() })), 0, 0.9, -0.95);
  const stakes = mat('stakes', () => lam({ map: T.woodTex() }));
  for (const x of [-0.97, 0.97]) part(g, 0.06, 0.8, 3.5, stakes, x, 1.37, -0.95);
  part(g, 2.0, 0.8, 0.06, stakes, 0, 1.37, -2.68);
  for (const [x, z] of [[-0.95, 1.7], [0.95, 1.7], [-0.95, -1.7], [0.95, -1.7]]) wheel(g, 0.42, 0.3, x, 0.42, z);
  if (cargo) {
    const load = sackStack(6);
    load.position.set(0, 0.98, -1.3);
    g.add(load);
  }
  g.userData.bed = bed;
  return g;
}

// Market stall: four poles, a tilted tarp ("lona") and a produce table.
export function makeStall(color) {
  const g = new THREE.Group();
  const pole = metal(0x6d6d6d);
  for (const [x, z] of [[-1.3, -1], [1.3, -1], [-1.3, 1], [1.3, 1]]) part(g, 0.05, z < 0 ? 2.6 : 2.2, 0.05, pole, x, z < 0 ? 1.3 : 1.1, z);
  const lona = new THREE.Mesh(new THREE.PlaneGeometry(3, 2.5), mat(`lona${color}`, () => lam({ map: T.lonaTex(color), side: THREE.DoubleSide })));
  lona.rotation.set(-Math.PI / 2 + 0.18, 0, 0);
  lona.position.set(0, 2.42, 0);
  g.add(lona);
  part(g, 2.3, 0.75, 1.1, mat('table', () => lam({ map: T.woodTex() })), 0, 0.375, 0);
  part(g, 2.2, 0.06, 1.0, mat('produce', () => lam({ map: T.produceTex() })), 0, 0.78, 0);
  return g;
}

export function trashPile() {
  const g = new THREE.Group();
  const bag = mat('bag', () => lam({ color: 0x141518, flatShading: true }));
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3 + (i % 2) * 0.1, 0), bag);
    m.position.set((i % 2) * 0.5 - 0.25, 0.25, Math.floor(i / 2) * 0.45 - 0.2);
    g.add(m);
  }
  part(g, 0.8, 0.04, 0.6, mat('cardboard', () => lam({ map: T.cardboardTex() })), 0.6, 0.02, 0.3).rotation.y = 0.4;
  return g;
}
