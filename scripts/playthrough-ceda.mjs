// Automated Central de Abasto playthrough for one character (CHAR=diablero|seller|consumer).
// ENDING=escape (default) runs to the Eje 5 Sur gate; ENDING=caught lets the ghost reach you.
//   docker run --rm --network host -v "$PWD/scripts:/out" -e CHAR=seller --entrypoint node mcp/playwright /out/playthrough-ceda.mjs
import { chromium } from '/app/node_modules/playwright/index.mjs';

const CHAR = process.env.CHAR ?? 'diablero';
const ENDING = process.env.ENDING ?? 'escape';
const URL = `${process.env.GAME_URL ?? 'http://localhost:5173'}/?debug&speed=4`;

const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
const logs = [];
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && logs.push(m.text()));
await page.goto(URL);
await page.waitForTimeout(800);
await page.click('[data-map=ceda]');
await page.click(`[data-char=${CHAR}]`);

const shot = (name) => page.screenshot({ path: `/out/shots/ceda-${CHAR}-${name}.png` });
const state = () => page.evaluate(() => ({
  obj: document.getElementById('objective').textContent,
  prompt: document.getElementById('prompt').textContent,
  stage: game.flags.stage,
}));
// Stand at (x, z) and aim at (tx, ty, tz).
const look = (x, z, tx, ty, tz) => page.evaluate(([x, z, tx, ty, tz]) => {
  player.pos.set(x, 0, z);
  player.yaw = Math.atan2(-(tx - x), -(tz - z));
  player.pitch = Math.atan2(ty - 1.6, Math.hypot(tx - x, tz - z));
}, [x, z, tx, ty, tz]);
// Wait for real rendered frames: software-rendered Chromium can be far slower than wall-clock waits assume.
const frames = (n = 3) => page.evaluate((n) => new Promise((resolve) => {
  const step = () => (--n <= 0 ? resolve() : requestAnimationFrame(step));
  requestAnimationFrame(step);
}), n);
const use = async (label, ...args) => {
  await look(...args);
  await frames(3);
  console.log(`${label.padEnd(12)} prompt="${(await state()).prompt}"`);
  await page.keyboard.press('e');
  await frames(3);
};
const until = async (pred, label, timeout = 90000, arg = null) => {
  const t = Date.now();
  while (Date.now() - t < timeout) {
    if (await page.evaluate(pred, arg)) return;
    await frames(4);
  }
  console.log(`TIMEOUT waiting for ${label}`, JSON.stringify(await state()));
  process.exitCode = 1;
};
// A point beside a diagonally parked truck (rot 0.45) and the truck's bed.
const truckSide = (key) => page.evaluate((key) => {
  const p = world.refs.trucks[key].position;
  return [p.x - 1.6 * Math.cos(0.45), p.z + 1.6 * Math.sin(0.45), p.x, 1.0, p.z];
}, key);

await page.waitForTimeout(1500);
const t0 = Date.now();
await frames(20);
console.log(`fps (software renderer): ${(20000 / (Date.now() - t0)).toFixed(1)}`);
await look(0, 33, 0, 1.5, 0);
await shot('start');
await look(-20, -14, -21, 1.6, -21);
await shot('dock-b');
await look(10, 2.5, -10, 1.6, -7);
await shot('plaza');

if (CHAR === 'diablero') {
  await use('diablito', 1.8, 32.4, 1.8, 0.6, 31);
  await shot('diablito');
  const jobs = [['d1', -16.1, -37.2], ['d2', 13.9, 10.8], ['d3', 21.9, -20.2]];
  for (const [i, [truck, px, pz]] of jobs.entries()) {
    await use(`pickup${i + 1}`, px, pz + 1.6, px, 0.5, pz);
    if (i === 0) await shot('loaded');
    await use(`deliver${i + 1}`, ...(await truckSide(truck)));
    await until((i) => game.flags.delivered === i + 1 && !document.getElementById('subtitle').textContent, `delivery ${i + 1}`, 60000, i);
  }
} else if (CHAR === 'seller') {
  await use('cortina', -14.2, -19.6, -14.2, 1.5, -20.94);
  await until(() => world.refs.units['B-4'].roll >= 1, 'cortina open');
  await shot('bodega-open');
  for (const x of [-14.8, -11.2, -10.0]) {
    await use('take-sack', ...(await truckSide('seller')));
    await use('pallet', x, -19.0, x, 0.3, -20.3);
  }
  for (let i = 1; i <= 2; i++) {
    await until(() => game.flags.customerWaiting, `customer ${i}`);
    await look(-12.7, -20.4, -12.7, 1.4, -18.6);
    await frames(4);
    await shot(`customer${i}`);
    await use('scale', -12.4, -20.4, -12.4, 1.25, -19.4);
  }
} else {
  await shot('bag');
  for (const [id, x, z] of [['B-2', -21, -19.7], ['A-8', 9, -36.7], ['C-5', -9, 11.3]]) {
    await use(`buy ${id}`, x, z + 1.3, x, 0.95, z);
    if (id === 'B-2') await shot('vendor');
  }
}

await until(() => game.flags.stage === 'finale' && document.getElementById('objective').textContent.includes('Eje 5'), 'finale');
await look(0, -20, 0, 1.4, -40);
await frames(4);
await shot('blackout');
await page.evaluate(() => { player.yaw += Math.PI; });
await frames(4);
await shot('ghost');
if (ENDING === 'caught') {
  await page.evaluate(() => { player.yaw += Math.PI; });
  await until(() => game.ended || !game.inputEnabled, 'caught');
  await frames(4);
  await shot('jumpscare');
} else {
  await look(0, -53, 0, 1.6, -60);
}
await until(() => game.ended, 'end');
await page.waitForTimeout(300);
await shot('end');
console.log('ending:', await page.evaluate(() => document.getElementById('end-title').textContent));
console.log(logs.join('\n') || 'no errors');
if (logs.length) process.exitCode = 1;
await browser.close();
