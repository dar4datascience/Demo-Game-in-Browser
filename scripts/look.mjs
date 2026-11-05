// Screenshot tour of the Central de Abasto map for visual review.
//   docker run --rm --network host -v "$PWD/scripts:/out" --entrypoint node mcp/playwright /out/look.mjs
import { chromium } from '/app/node_modules/playwright/index.mjs';

const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`));
await page.goto('http://localhost:5173/?debug&speed=1&seed=1');
await page.waitForTimeout(700);
await page.click('[data-map=ceda]');
await page.click('[data-char=diablero]');
await page.click('[data-variant=nonbinary]');
await page.waitForTimeout(1200);

const frames = (n = 4) => page.evaluate((n) => new Promise((resolve) => {
  const step = () => (--n <= 0 ? resolve() : requestAnimationFrame(step));
  requestAnimationFrame(step);
}), n);

const views = [
  ['spawn', -26, -18, Math.PI, 0],
  ['aisle-ab', -26, 0, -Math.PI / 2, 0],
  ['pasillo2-south', -26, 40, Math.PI, 0],
  ['bodegas', -35.5, 1, Math.PI, 0],
  ['bridge', -26, 88, Math.PI, 0],
  ['rotulista', -1, 168, -Math.PI / 2, 0],
  ['south-end', -26, 300, Math.PI, 0],
  ['gate', -26, -6, 0, 0],
];
for (const [name, x, z, yaw, pitch] of views) {
  await page.evaluate(([x, z, yaw, pitch]) => {
    player.pos.set(x, 0, z);
    player.yaw = yaw;
    player.pitch = pitch;
  }, [x, z, yaw, pitch]);
  await frames(6);
  await page.screenshot({ path: `/out/shots/look-${name}.png` });
  console.log(name, await page.evaluate(() => document.getElementById('objective').textContent));
}

// Top-down map check: the A–Z rows, pasillos and andenes.
await page.evaluate(() => {
  scene.fog = null;
  const cam = new player.camera.constructor(55, 1.6, 1, 900);
  cam.position.set(0, 470, 168);
  cam.lookAt(0, 0, 168);
  game.cam = cam;
});
await frames(8);
await page.screenshot({ path: '/out/shots/look-topdown.png' });
await browser.close();
