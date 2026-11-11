// Records each CDMX showcase shot as its own vertical clip with the page's own MediaRecorder
// (canvas.captureStream), which is much faster than Playwright's screencast under SwiftShader.
// The internal render height is dropped via ?renderH (RENDER_H env, default 360) for speed and
// upscaled with ffmpeg; see make-cdmx-video.sh.
//   docker run --rm --network host -v "$PWD:/repo" --entrypoint node mcp/playwright /repo/scripts/record-cdmx.mjs
//   SHOTS="1 4 10" records only those shot numbers (1-based).
import { chromium } from '/app/node_modules/playwright/index.mjs';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

const RAW = '/repo/docs/raw/cdmx';
rmSync(RAW, { recursive: true, force: true });
mkdirSync(RAW, { recursive: true });

const ALL = [1, 2, 3, 4, 5, 6, 7];
const SHOTS = (process.env.SHOTS ?? ALL.join(' ')).split(' ').map(Number);
const SPEED = process.env.SPEED ?? '4';
const RENDER_H = process.env.RENDER_H ?? '360';

const browser = await chromium.launch({
  channel: 'chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});

const startRecorder = (page) => page.evaluate(() => {
  const stream = document.getElementById('game').captureStream();
  const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 3_000_000 });
  window.__rec = { chunks: [], done: false };
  rec.ondataavailable = (e) => e.data.size && window.__rec.chunks.push(e.data);
  rec.onstop = () => {
    window.__rec.blob = new Blob(window.__rec.chunks, { type: 'video/webm' });
    window.__rec.done = true;
  };
  rec.start(200);
  window.__rec.rec = rec;
});

const grab = (page) => page.evaluate(async () => {
  const buf = await window.__rec.blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
  return btoa(s);
});

for (const shot of SHOTS) {
  const page = await browser.newPage({ viewport: { width: 270, height: 480 } });
  page.on('pageerror', (e) => console.log(`shot ${shot} pageerror: ${e.message}`));
  const t0 = Date.now();
  await page.goto(`http://localhost:5173/?debug&speed=${SPEED}&renderH=${RENDER_H}&shot=${shot}`);
  await page.waitForTimeout(700);
  await page.click('[data-map=cdmx]');
  await page.waitForFunction(() => typeof game !== 'undefined' && game.flags.shot, null, { timeout: 60000 });
  await startRecorder(page);
  await page.waitForFunction(() => game.flags.shots >= 1, null, { timeout: 120000 });
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__rec.rec.stop());
  await page.waitForFunction(() => window.__rec.done);
  const b64 = await grab(page);
  writeFileSync(`${RAW}/shot-${String(shot).padStart(2, '0')}.webm`, Buffer.from(b64, 'base64'));
  await page.close();
  console.log(`shot ${shot} recorded in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

await browser.close();
