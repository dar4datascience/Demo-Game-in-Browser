// Close-range lineup of every NPC variant for visual review of the organic humanoids.
// Shot 1-2: clean studio setup inside the NightMart scene (geometry/face check).
// Shot 3: the same lineup in the moonlit Central de Abasto (in-context check).
//   docker run --rm --network host -v "$PWD/scripts:/out" --entrypoint node mcp/playwright /out/look-people.mjs
import { chromium } from '/app/node_modules/playwright/index.mjs';

const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`));
const frames = (n = 4) => page.evaluate((n) => new Promise((resolve) => {
  const step = () => (--n <= 0 ? resolve() : requestAnimationFrame(step));
  requestAnimationFrame(step);
}, n), n);

// Both levels open on a fade-in; under software rendering that is ~30 wall seconds.
const waitFade = async () => {
  for (let i = 0; i < 240; i++) {
    const f = await page.evaluate(() => pipe.u.uFade.value);
    if (f <= 0.01) return;
    await page.evaluate(() => new Promise((r) => setTimeout(r, 250)));
  }
};

// Injected into the page: variant lineup + a free camera; returns head screen positions.
const LINEUP = async ([xs, z, camPos, look]) => {
  const { NPC } = await import('/src/world/person.js');
  const { GHOST } = await import('/src/game/director.js');
  const variants = [
    ['man-tee', { skin: '#c99a72', top: '#37455c', bottom: '#23262e', hair: '#241a12', outfit: 'tee' }],
    ['suit', { skin: '#c99a72', top: '#2c2f38', bottom: '#1e2126', hair: '#1c1410', outfit: 'suit', hairStyle: 'short' }],
    ['hoodie', { skin: '#8a6a50', top: '#4a3b2c', bottom: '#26221e', hair: '#0e0c0a', outfit: 'hoodie', build: 'heavy', hairStyle: 'short' }],
    ['apron', { skin: '#caa27e', top: '#7a4a2e', bottom: '#3a3630', hair: '#241a12', outfit: 'apron', hairStyle: 'bun' }],
    ['woman', { skin: '#d9b08c', top: '#5c2e35', bottom: '#3a3f4a', hair: '#120e0c', longHair: true, outfit: 'dress', build: 'slim' }],
    ['bride', { skin: '#e3ddd2', top: '#e6e2d6', bottom: '#d8d2c8', hair: '#060606', longHair: true, veil: true, dress: true, outfit: 'dress', emissive: 0.1 }],
    ['ghost', GHOST],
    ['uniform', { skin: '#d9b08c', top: '#3d4a3a', bottom: '#2c2a33', hair: '#3a2a18', outfit: 'uniform', build: 'slim', glasses: true, hairStyle: 'bob' }],
    ['child', { skin: '#d9b08c', top: '#7a4a2e', bottom: '#2c2a33', hair: '#3a2a18', height: 0.62, outfit: 'tee' }],
  ];
  const npcs = variants.map(([name, opts], i) => {
    const npc = new NPC(opts, scene);
    npc.place(xs[i], z);
    npc.face(camPos[0], camPos[2]);
    return { name, npc };
  });
  const cam = new player.camera.constructor(55, innerWidth / innerHeight, 0.1, 300);
  cam.position.set(...camPos);
  cam.lookAt(...look);
  cam.updateMatrixWorld(true);
  game.cam = cam;
  const V = cam.position.constructor;
  const v = new V();
  return npcs.map(({ name, npc }) => {
    npc.head.getWorldPosition(v);
    const p = v.clone().project(cam);
    return { name, x: Math.round(((p.x + 1) / 2) * innerWidth), y: Math.round(((1 - p.y) / 2) * innerHeight) };
  });
};

// Replace the level with a dark studio: ground disc, key + fill lamps, ambient.
const STUDIO = async () => {
  const { lam } = await import('/src/engine/post.js');
  let Mesh, PlaneG, PL, AL, Color;
  scene.traverse((o) => {
    if (o.isMesh) {
      if (!Mesh) Mesh = o.constructor;
      if (!PlaneG && o.geometry.type === 'PlaneGeometry') PlaneG = o.geometry.constructor;
      if (!Color && o.material?.color) Color = o.material.color.constructor;
    }
    if (!PL && o.isPointLight) PL = o.constructor;
    if (!AL && o.isAmbientLight) AL = o.constructor;
  });
  scene.clear();
  scene.background = new Color(0x0a0c16);
  const ground = new Mesh(new PlaneG(30, 30), lam({ color: 0x222838 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  scene.add(ground);
  const key = new PL(0xffd9a8, 240, 20, 2);
  key.position.set(0, 3.4, 2.2);
  scene.add(key);
  const fill = new PL(0x7a86c8, 120, 18, 2);
  fill.position.set(-3.5, 2.4, 4.2);
  scene.add(fill);
  // Frontal softbox so faces are actually readable in the close-ups.
  const front = new PL(0xcfd8ff, 90, 12, 2);
  front.position.set(0, 1.7, 3.4);
  scene.add(front);
  scene.add(new AL(0x3a4470, 1.6));
};

// --- Studio lineup inside the (emptied) NightMart scene ---
await page.goto('http://localhost:5173/?debug&speed=1');
await page.waitForTimeout(800);
await page.click('[data-map=konbini]');
await waitFade();
await page.evaluate(STUDIO);
const studioHeads = await page.evaluate(LINEUP, [[-3.6, -2.7, -1.8, -0.9, 0, 0.9, 1.8, 2.7, 3.6], 0, [0, 1.55, 5.4], [0, 1.05, 0]]);
console.log('studio:', JSON.stringify(studioHeads));
await frames(8);
await page.screenshot({ path: '/out/shots/people-studio.png' });

// Close-up on woman/bride/ghost (indices 4-6, x 0..1.8) for face detail.
await page.evaluate(() => {
  const cam = game.cam;
  cam.position.set(0.9, 1.5, 2.1);
  cam.lookAt(0.9, 1.42, 0);
  cam.updateMatrixWorld(true);
});
await frames(6);
await page.screenshot({ path: '/out/shots/people-faces.png' });

// Tight head shots: bride then ghost, ~1.4 m out so facial features fill the frame.
await page.evaluate(() => {
  const cam = game.cam;
  cam.position.set(0.9, 1.62, 1.5);
  cam.lookAt(0.9, 1.6, 0);
  cam.updateMatrixWorld(true);
});
await frames(6);
await page.screenshot({ path: '/out/shots/people-head-bride.png' });
await page.evaluate(() => {
  const cam = game.cam;
  cam.position.set(1.8, 1.62, 1.5);
  cam.lookAt(1.8, 1.6, 0);
  cam.updateMatrixWorld(true);
});
await frames(6);
await page.screenshot({ path: '/out/shots/people-head-ghost.png' });
await page.evaluate(() => {
  const cam = game.cam;
  cam.position.set(0, 1.62, 1.5);
  cam.lookAt(0, 1.6, 0);
  cam.updateMatrixWorld(true);
});
await frames(6);
await page.screenshot({ path: '/out/shots/people-head-woman.png' });

// --- Central de Abasto: the same lineup in real moonlight ---
await page.goto('http://localhost:5173/?debug&speed=1');
await page.waitForTimeout(800);
await page.click('[data-map=ceda]');
await page.click('[data-char=diablero]');
await page.click('[data-variant=nonbinary]');
await waitFade();
const cedaHeads = await page.evaluate(LINEUP, [[-31.2, -30.2, -29.2, -28.2, -27.2, -26.2, -25.2, -24.2, -23.2], -15, [-27.2, 1.6, -9.0], [-27.2, 1.1, -15]]);
console.log('ceda:', JSON.stringify(cedaHeads));
await frames(8);
await page.screenshot({ path: '/out/shots/people-ceda.png' });

await browser.close();
