// Automated Central de Abasto playthrough for one character (CHAR=diablero|seller|consumer).
// Diablero: VARIANT=man|woman|nonbinary, CHOICE=fight|beer, OUTCOME=win|lose.
// Seller/Consumer: ENDING=escape|caught for the shared finale.
//   docker run --rm --network host -v "$PWD/scripts:/out" -e CHAR=diablero -e CHOICE=beer -e OUTCOME=win --entrypoint node mcp/playwright /out/playthrough-ceda.mjs
import { chromium } from '/app/node_modules/playwright/index.mjs';

const CHAR = process.env.CHAR ?? 'diablero';
const VARIANT = process.env.VARIANT ?? 'nonbinary';
const CHOICE = process.env.CHOICE ?? 'fight';
const OUTCOME = process.env.OUTCOME ?? 'win';
const ENDING = process.env.ENDING ?? 'escape';
const SEED = process.env.SEED ?? '1';
const SPEED = process.env.SPEED ?? '4';
const URL = `${process.env.GAME_URL ?? 'http://localhost:5173'}/?debug&speed=${SPEED}&seed=${SEED}`;

const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
const logs = [];
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && logs.push(m.text()));
await page.goto(URL);
await page.waitForTimeout(800);
await page.click('[data-map=ceda]');
if (CHAR === 'diablero') {
  await page.click('[data-char=diablero]');
  await page.click(`[data-variant=${VARIANT}]`);
} else {
  await page.click(`[data-char=${CHAR}]`);
}

const shot = (name) => page.screenshot({
  path: `/out/shots/ceda-${CHAR === 'diablero' ? `${CHAR}-${VARIANT}-${CHOICE}-${OUTCOME}` : CHAR}-${name}.png`,
});
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
  let prompt = (await state()).prompt;
  if (!prompt) {
    await frames(8);
    prompt = (await state()).prompt;
  }
  console.log(`${label.padEnd(12)} prompt="${prompt}"`);
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
// A point in the andén, three metres off a truck's nose, and the truck itself.

await page.waitForTimeout(1500);
const t0 = Date.now();
await frames(20);
console.log(`fps (software renderer): ${(20000 / (Date.now() - t0)).toFixed(1)}`);
await look(-26, -18, -26, 1.5, -30);
await shot('start');
await look(-35.5, -2.4, -35.5, 2.2, 3.4);
await shot('dock-b');
await look(-26, 40, -26, 1.6, 60);
await shot('pasillo2');

if (CHAR === 'diablero') {
  await use('diablito', -23.4, -13.4, -22, 0.6, -14);
  await shot('diablito');
  const jobs = [
    { id: 'A-3', truck: 'd1', pickup: [-44.5, -2.7], face: 1, truckAt: [-44.5, -14] },
    { id: 'C-9', truck: 'd2', pickup: [34, 25.3], face: 1, truckAt: [44, 14] },
    { id: 'B-11', truck: 'd3', pickup: [59.25, 2.7], face: -1, truckAt: [59.25, 14] },
  ];
  for (const [i, job] of jobs.entries()) {
    const [px, pz] = job.pickup;
    const [tx, tz] = job.truckAt;
    await until((id) => document.getElementById('objective').textContent.includes(`Bod. ${id}`), `job ${job.id}`, 30000, job.id);
    await use(`pickup${i + 1}`, px + 0.9, pz + job.face * 1.6, px + 0.9, 0.5, pz);
    if (i === 0) await shot('loaded');
    await use(`deliver${i + 1}`, tx - 2.5, tz, tx, 1.0, tz);
    await until((i) => game.flags.delivered === i + 1 && !document.getElementById('subtitle').textContent, `delivery ${i + 1}`, 60000, i);
  }

  await until(() => game.flags.stage === 'pancarta', 'pancarta stage');
  await shot('pancarta-start');
  await use('pancarta', -0.5, 168, 1.65, 1.0, 168);
  await until(() => game.flags.flow, 'flow');
  await shot('flow');
  await use('hang', -35.5, -0.2, -35.5, 1.35, 1.55);
  await until(() => game.flags.pancartaDelivered, 'pancarta delivered');
  await shot('pancarta-hung');
  await until(() => game.flags.ghostReady, 'ghost choice');
  await shot('ghost-choice');

  if (CHOICE === 'fight') {
    await use('fight', -34, -1.5, -33.9, 1.2, -0.1);
    await until(() => game.flags.fightReady, 'fight ready');
    if (OUTCOME === 'win') {
      // Reach the shrine before the screenshot: at 4x game speed the ghost closes in fast.
      const shrine = await page.evaluate(() => game.flags.shrine);
      await page.evaluate(({ x, z }) => player.pos.set(x, 0, z), shrine);
      await frames(4);
      await shot('shrine');
    } else {
      await shot('shrine-run');
    }
  } else {
    await use('beer', -31.8, -0.8, -33, 0.6, 0.3);
    await until(() => game.flags.qte?.active, 'beer qte');
    await shot('beer');
    if (OUTCOME === 'win') {
      for (const key of ['w', 'a', 's', 'd', 'w', 'd', 'a', 's']) {
        await page.keyboard.press(key);
        await frames(1);
      }
    }
  }
} else if (CHAR === 'seller') {
  await use('cortina', -35.5, 1.2, -35.5, 1.5, 3.44);
  await until(() => world.refs.units['B-4'].roll >= 1, 'cortina open');
  await shot('bodega-open');
  for (const x of [-37.3, -33.7, -32.5]) {
    await use('take-sack', -35.5, 11.8, -35.5, 1.0, 14);
    await use('pallet', x, 1.2, x, 0.3, 2.8);
  }
  for (let i = 1; i <= 2; i++) {
    await until(() => game.flags.customerWaiting, `customer ${i}`);
    await look(-35.5, 0.6, -35.5, 1.4, 1.9);
    await frames(4);
    await shot(`customer${i}`);
    await use('scale', -34.9, 0.6, -34.9, 1.25, 2.05);
  }
} else {
  await shot('bag');
  for (const [id, x, z, stand] of [['B-2', -59.25, 2.2, 0.6], ['A-8', 18, -2.2, -0.6], ['C-5', -16.5, 25.8, 27.4]]) {
    await use(`buy ${id}`, x, stand, x, 0.95, z);
    if (id === 'B-2') await shot('vendor');
  }
}

if (CHAR !== 'diablero') {
  await until(() => game.flags.stage === 'finale' && document.getElementById('objective').textContent.includes('Eje 5'), 'finale');
  await look(-26, -10, -26, 1.4, -30);
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
    await look(-26, -24, -26, 1.6, -34);
  }
}

await until(() => game.ended, 'end');
await page.waitForTimeout(300);
await shot('end');
console.log('ending:', await page.evaluate(() => document.getElementById('end-title').textContent));
console.log(logs.join('\n') || 'no errors');
if (logs.length) process.exitCode = 1;
await browser.close();
