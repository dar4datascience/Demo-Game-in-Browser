// Automated full playthrough: drives the story start-to-finish via ?debug hooks and saves screenshots.
// Runs inside the mcp/playwright Docker image (bundled Chromium) against the local dev server:
//   docker run --rm --network host -v "$PWD/scripts:/out" --entrypoint node mcp/playwright /out/playthrough.mjs
import { chromium } from '/app/node_modules/playwright/index.mjs';

const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
const logs = [];
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && logs.push(m.text()));
await page.goto(`${process.env.GAME_URL ?? 'http://localhost:5173'}/?debug&speed=4`);
await page.waitForTimeout(1000);
await page.click('[data-map=konbini]');

const state = () => page.evaluate(() => ({
  obj: document.getElementById('objective').textContent,
  prompt: document.getElementById('prompt').textContent,
  sub: document.getElementById('subtitle').textContent,
  stage: game.flags.stage,
}));
const at = (x, z, yaw, pitch) => page.evaluate(([x, z, yaw, pitch]) => {
  player.pos.set(x, 0, z);
  player.yaw = yaw;
  player.pitch = pitch;
}, [x, z, yaw, pitch]);
// Wait for real rendered frames: software-rendered Chromium can be far slower than wall-clock waits assume.
const frames = (n = 3) => page.evaluate((n) => new Promise((resolve) => {
  const step = () => (--n <= 0 ? resolve() : requestAnimationFrame(step));
  requestAnimationFrame(step);
}), n);
const use = async (label, x, z, yaw, pitch) => {
  await at(x, z, yaw, pitch);
  await frames(3);
  const s = await state();
  console.log(`${label.padEnd(10)} prompt="${s.prompt}"`);
  await page.keyboard.press('e');
  await frames(3);
};
const until = async (pred, label, timeout = 60000) => {
  const t = Date.now();
  while (Date.now() - t < timeout) {
    if (await page.evaluate(pred)) return;
    await page.waitForTimeout(200);
  }
  console.log(`TIMEOUT waiting for ${label}`, JSON.stringify(await state()));
  process.exitCode = 1;
};
const shot = (name) => page.screenshot({ path: `/out/shots/${name}.png` });

await page.waitForTimeout(1500);
await use('clock', 3.8, -7.4, Math.PI / 2, -0.28);
await until(() => game.flags.stage === 'restock', 'restock');
const slots = [[0.2, -2, Math.PI / 2], [0.0, -0.5, -Math.PI / 2], [5.4, -2.6, Math.PI / 2]];
for (const [i, [x, z, yaw]] of slots.entries()) {
  await use('box', 6.5, -8.6, -Math.PI / 4, -0.72);
  if (i === 0) await shot('holding-box');
  await use(`slot${i}`, x, z, yaw, -0.6);
}
console.log('restocked:', await page.evaluate(() => game.flags.restocked));
await until(() => game.flags.phoneRinging, 'phone ring');
await use('phone', 5.0, -8.8, 0, -0.78);
await until(() => game.flags.stage === 'customers', 'customers');
await at(-4.5, 2.0, Math.PI, -0.1);
await until(() => game.flags.customerWaiting, 'customer 1');
await shot('customer1');
await use('register', -5.3, 2.0, Math.PI, -0.4);
await until(() => game.flags.customerWaiting, 'customer 2', 90000);
await at(-4.5, 2.0, Math.PI, 0);
await page.waitForTimeout(200);
await shot('customer2');
await use('register', -5.3, 2.0, Math.PI, -0.4);
await until(() => game.flags.stage === 'trash', 'trash', 90000);
await at(-1.5, 4.0, Math.PI, 0);
await page.waitForTimeout(300);
await shot('woman-outside');
await use('trashbag', 4.3, -8.7, Math.PI / 4, -0.52);
await use('dumpster', -6.0, 9, Math.PI / 2, -0.5);
await at(-2, 8.5, 0, 0);
await page.waitForTimeout(600);
await shot('blackout');
await at(4.5, 3, 0, 0);
await until(() => game.flags.stage === 'monitor', 'monitor stage');
await use('monitor', 6.1, -8.7, 0, -0.68);
await page.waitForTimeout(800);
await shot('cctv');
await until(() => game.inputEnabled, 'back from cctv');
await page.evaluate(() => { player.yaw = Math.PI; player.pitch = 0; });
await page.waitForTimeout(150);
await shot('jumpscare');
await until(() => game.ended, 'end');
await page.waitForTimeout(300);
await shot('end');
console.log('ended:', await page.evaluate(() => game.ended));
console.log(logs.join('\n') || 'no errors');
if (logs.length) process.exitCode = 1;
await browser.close();
