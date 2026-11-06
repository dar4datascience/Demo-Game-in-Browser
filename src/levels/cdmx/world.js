import * as THREE from 'three';
import { lam, basic } from '../../engine/post.js';
import * as T from '../../engine/textures.js';
import { createBuilder } from '../../world/builder.js';
import { batchWorld } from '../../world/batch.js';
import { createSky } from '../../world/sky.js';
import {
  plaza, skyline, skylineRing, torre, biblioteca, park, road, metroStation, metroCar, abarrotes, bride, field, fence,
} from './props.js';

/*
 * CDMX showcase backlot. The sets are separate islands spread over ~300 m so a shot only ever
 * sees the set it is framed on; fog and the sky dome hide everything else. There is no mission
 * here: story.js drives `shotCam` through the shot list while the player stands still.
 *
 *   plaza + towers   (0, 0)        road            z 30
 *   park             (45, 10)      abarrotes row   z 85
 *   biblioteca       (-75, -55)    bride window    (-40, 85)
 *   torre            (80, -95)     metro station   (-115, 22)
 *   metro car        (0, -150)     fog field       (-150, -70)
 */
export function buildWorld(scene) {
  const b = createBuilder(scene, { poolSize: 8 });
  const refs = {};

  const M = {
    stone: lam({ map: T.plasterTex('#6a6070', '#2e2740') }),
    plaster: lam({ map: T.plasterTex() }),
    gold: lam({ color: 0xe0b232, emissive: 0x6a4a08 }),
    metal: lam({ map: T.metalTex() }),
    bark: lam({ color: 0x2a2228 }),
    jacaranda: lam({ color: 0x8a5ac8, emissive: 0x1a0a30 }),
    wood: lam({ map: T.woodTex() }),
    car: lam({ color: 0x2a2a38, emissive: 0x0a0a14 }),
    carGlass: basic({ color: 0x2a3a55 }),
    tyre: lam({ color: 0x0c0c10 }),
    stationFloor: lam({ map: T.concreteTex() }),
    asphalt: lam({ map: T.asphaltTex() }),
    stationWall: lam({ map: T.stationTex() }),
    metroBody: lam({ color: 0xd9822b }),
    metroInner: lam({ map: T.plasterTex('#4a4450', '#201a28'), side: THREE.BackSide }),
    metroSeat: lam({ map: T.metroSeatTex() }),
    chrome: lam({ color: 0xb8c0c8, emissive: 0x1a1a1e }),
  };

  scene.add(new THREE.AmbientLight(0x5a4f80, 1.9), new THREE.HemisphereLight(0x7a6aa8, 0x241c30, 2.2));
  // Set here as well as in main.js: the headless harness has no main.js and shots swap fog per cut.
  scene.fog = new THREE.Fog(0x2a2140, 10, 140);

  // Cobbled ground for the whole backlot; one plane, 1 m cobbles.
  b.plane(380, 380, lam({ map: T.cobbleTex() }), 0, 0, 0, 0, -Math.PI / 2, [1 / 8, 1 / 8]);

  refs.sky = createSky(scene);
  refs.plaza = plaza(b, M);
  skylineRing(b, M);
  skyline(b, M);
  torre(b, M);
  biblioteca(b, M);
  refs.park = park(b, M);
  refs.road = road(b, M);
  refs.station = metroStation(b, M);
  refs.car = metroCar(b, M);
  abarrotes(b, M);
  refs.bride = bride(b, M);
  refs.field = field(b, M);
  fence(b, M);

  // Footprints so the camera-clearance test has something to check against, and so the level
  // contract matches the other maps. The showcase never moves the player.
  b.addCollider(0, 0, 3, 3);
  b.addCollider(80, -95, 13, 13);
  b.addCollider(-75, -55, 23, 11);
  b.addCollider(0, 82.5, 13, 3);
  b.addCollider(-40, 82, 5, 3.5);
  b.addCollider(-115, 10.6, 17, 0.4); // station back wall; the platform itself is walkable
  b.addCollider(-8, 30, 2.3, 1);

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
    fog: [0x2a2140, 10, 140],
    render: { height: 480, photo: true },
    update(dt) {
      t += dt;
      b.updateLights(shotCam.position);
      // Slow cloud drift, a pulsing headlight and one dying lamp: enough motion to feel alive.
      refs.sky.dome.rotation.y = t * 0.004;
      refs.road.beamMat.opacity = 0.18 + Math.sin(t * 5.5) * 0.05;
      const lamp = refs.park.lamp;
      if (lamp) lamp.intensity = lamp.userData.base * (0.82 + Math.sin(t * 11) * 0.12);
    },
  });
}
