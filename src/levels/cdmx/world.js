import * as THREE from 'three';
import { lam, basic, phong } from '../../engine/post.js';
import * as T from '../../engine/textures.js';
import { createBuilder } from '../../world/builder.js';
import { batchWorld } from '../../world/batch.js';
import { createSky } from '../../world/sky.js';
import {
  angelStatue, angelTowers, angelPlaza, metroSet, taxi, abarrotes, park, biblioteca, library, torre,
  skylineRing, wetGround, flushDecals,
} from './props.js';
import { dressCity } from './buildings.js';

/*
 * CDMX showcase backlot, rebuilt for the seven-shot reference tour. The sets are separate
 * islands ~300 m apart so a shot only ever sees the set it is framed on; fog and the sky
 * dome hide everything else. There is no mission here: story.js drives `shotCam` through
 * the shot list while the player stands still.
 *
 *   angel        (0, 0)      metro        (0, -300)
 *   abarrotes    (40, 300)   park         (-280, -80)
 *   biblioteca   (-300, 120) library      (280, 160)
 *   torre        (300, -160)
 */
export function buildWorld(scene) {
  const b = createBuilder(scene, { poolSize: 8 });
  const refs = {};

  const M = {
    stone: lam({ map: T.plasterTex('#8a86a0', '#4a4660'), vertexColors: true }),
    plaster: lam({ map: T.plasterTex('#e8e2d4', '#b8b0a0'), vertexColors: true }),
    gold: phong({ color: 0xffc23a, specular: 0xfff4c0, shininess: 48, emissive: 0x6a3200 }),
    goldHi: phong({ color: 0xffe08a, specular: 0xffffff, shininess: 60, emissive: 0x9a5a08, side: THREE.DoubleSide }),
    goldDark: lam({ color: 0x8a4c10, emissive: 0x3a1a00 }),
    metal: lam({ map: T.metalTex(), vertexColors: true }),
    parapet: lam({ color: 0x9a94b8, vertexColors: true }),
    bark: lam({ color: 0x241c22, vertexColors: true }),
    leaf: lam({ color: 0x14200f, vertexColors: true }),
    jacaranda: lam({ color: 0x9a5ad0, emissive: 0x2a1060, vertexColors: true }),
    jacarandaLight: lam({ color: 0xc890ff, emissive: 0x3a1a70, vertexColors: true }),
    jacarandaDeep: lam({ color: 0x6a3ab0, emissive: 0x180830, vertexColors: true }),
    wood: lam({ map: T.woodTex(), vertexColors: true }),
    tyre: lam({ color: 0x0c0c10, vertexColors: true }),
    concrete: lam({ map: T.concreteTex(), vertexColors: true }),
    stationFloor: null, // aliased to concrete below — same material, one draw call
    asphalt: phong({ map: T.asphaltTex(), shininess: 12, specular: 0x27324e, vertexColors: true }),
    path: phong({ map: T.pathTex(), shininess: 30, specular: 0x8a9aff, vertexColors: true }),
    parkGround: lam({ map: T.parkGroundTex(), vertexColors: true }),
    orange: lam({ color: 0xf06018, emissive: 0x3a1000, vertexColors: true }),
    trainDark: lam({ color: 0x241a16, vertexColors: true }),
    taxiGreen: lam({ color: 0x2e7d4a, vertexColors: true }),
    taxiWhite: lam({ color: 0xe8e6da, vertexColors: true }),
    red: lam({ color: 0x8a2a1a, vertexColors: true }),
    blue: lam({ color: 0x1d4a8a, vertexColors: true }),
    dark: lam({ color: 0x14101c, vertexColors: true }),
    chrome: lam({ color: 0xb8c0c8, emissive: 0x1a1a1e, vertexColors: true }),
    // Library interior.
    libFloor: phong({ map: T.concreteTex(), shininess: 24, specular: 0x6a5ad0, vertexColors: true }),
    libWall: lam({ color: 0x3a3a44, vertexColors: true }),
    libFrame: lam({ color: 0x23262c, vertexColors: true }),
    libPillar: basic({ map: T.libPillarTex() }),
    shelf: basic({ map: T.libShelfTex() }),
    book: basic({ map: T.bookTex(), fog: false }),
    bookBack: lam({ color: 0xd8b820 }),
  };
  M.stationFloor = M.concrete;
  M.sidewalk = M.concrete;   // sidewalk shares the concrete texture — one draw call

  scene.add(new THREE.AmbientLight(0x4a4068, 1.35), new THREE.HemisphereLight(0x6a5a98, 0x1e1830, 1.7),
    new THREE.HemisphereLight(0x364070, 0x241c14, 0.3));
  // Set here as well as in main.js: the headless harness has no main.js and shots swap fog per cut.
  scene.fog = new THREE.Fog(0x221b3d, 10, 140);

  // Cobbled ground for the whole backlot; one plane, 1 m cobbles, faint wet sheen.
  b.plane(380, 380, phong({ map: T.cobbleTex(), shininess: 12, specular: 0x27324e, vertexColors: true }), 0, 0, 0, 0, -Math.PI / 2, [1 / 8, 1 / 8]);

  refs.sky = createSky(scene);
  refs.stars = makeStars(refs.sky.dome);
  refs.angel = { statue: angelStatue(b, M).statue };
  angelTowers(b, M);
  angelPlaza(b, M);
  refs.metro = metroSet(b, M);
  refs.taxi = taxi(b, M);
  abarrotes(b, M);
  refs.park = park(b, M);
  biblioteca(b, M);
  refs.library = library(b, M);
  refs.torre = torre(b, M);
  skylineRing(b, M);
  dressCity(b);
  wetGround(b);
  flushDecals(b);

  // Footprints so the camera-clearance test has something to check against, and so the level
  // contract matches the other maps. The showcase never moves the player.
  b.addCollider(0, 0, 4.5, 4.5);            // statue plinth
  b.addCollider(0, -300, 4, 4);             // metro parapet edge (camera stays behind it)
  b.addCollider(40, 300, 6, 3.5);          // shop block
  b.addCollider(-300, 120, 23, 3);         // biblioteca block
  b.addCollider(300, -160, 14, 14);        // torre shaft

  const shotCam = new THREE.PerspectiveCamera(50, 1, 0.05, 900);
  shotCam.position.set(0, 2.2, 26);

  let t = 0;
  b.updateLights(shotCam.position);
  const batched = batchWorld(scene, refs, { occluders: b.occluders });
  b.occluders.length = 0;
  b.occluders.push(...batched.occluders);

  return Object.assign(b, {
    refs,
    shotCam,
    cameras: [shotCam],
    fog: [0x221b3d, 10, 140],
    render: { height: 480, photo: true },
    update(dt) {
      t += dt;
      b.updateLights(shotCam.position);
      // Slow cloud drift; the dome rides with the camera so every backlot island sits at its centre.
      refs.sky.dome.rotation.y = t * 0.004;
      refs.sky.dome.position.copy(shotCam.position);
      // Taxi crossing during the abarrotes shot.
      const tx = refs.taxi?.taxi;
      if (tx) {
        const u = tx.userData;
        if (u.on) {
          u.k = Math.min(1, u.k + dt / u.dur);
          const e = u.k * u.k * (3 - 2 * u.k);
          tx.position.x = u.baseX + u.from + (u.to - u.from) * e;
          tx.position.y = Math.abs(Math.sin(t * 9)) * 0.02;
        } else {
          u.k = 0;
          tx.position.x = u.baseX + u.from;
          tx.position.y = 0;
        }
        if (u.beamMat) u.beamMat.opacity = 0.05 + Math.sin(t * 7) * 0.02;
      }
      // The pickup book floats, rotates and bobs inside its purple bubble.
      const book = refs.library?.book;
      if (book) {
        book.rotation.y = Math.sin(t * 0.7) * 0.18;
        book.position.y = book.userData.baseY + Math.sin(t * 1.35) * 0.12;
      }
      // Tower beacon + the park's distant one blink out of phase.
      const pulse = (mesh, phase) => {
        const m = mesh?.userData?.beaconMat ?? mesh?.material;
        if (m && m.color) {
          const on = (Math.sin(t * 2.4 + phase) > -0.2) ? 1 : 0.25;
          m.color.setHex(0xff5040).multiplyScalar(on);
        }
      };
      pulse(refs.torre?.beacon, 0);
      pulse(refs.park?.beacon, 2.1);
      // One park lamp has a failing tube.
      const lamp = refs.park?.lamp;
      if (lamp) lamp.intensity = lamp.userData.base * (0.82 + Math.sin(t * 11) * 0.12 + (Math.sin(t * 23) > 0.96 ? -0.3 : 0));
    },
  });
}

// Dense small stars on the inside of the sky dome — the reference's busiest sky detail.
// Sizes stay sub-pixel-ish so they read as pinpoints, not snow. parented to the dome so they
// drift with the cloud bands.
function makeStars(parent) {
  const N = 1400;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    // Uniform-ish on the upper hemisphere of a 390-radius sphere (inside the 420 dome).
    const u = Math.random(), v = Math.random();
    const theta = u * Math.PI * 2;
    const phi = Math.acos(1 - v * 0.85);           // bias toward the top
    const r = 390;
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = Math.abs(r * Math.cos(phi)) * 0.9 + 8;
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    const roll = Math.random();
    c.setHSL(roll < 0.15 ? 0.09 : roll < 0.4 ? 0.62 : 0.72, roll < 0.5 ? 0.5 : 0.15, 0.75 + Math.random() * 0.25);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.3, vertexColors: true, transparent: true, opacity: 0.9,
    sizeAttenuation: true, depthWrite: false, fog: false,
  }));
  pts.userData.noBatch = true;
  pts.frustumCulled = false;
  parent.add(pts);
  return pts;
}
