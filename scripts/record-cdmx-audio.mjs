// Renders the showcase's lofi bed offline to a WAV so make-cdmx-video.sh can mux sound.
//   docker run --rm --network host -v "$PWD:/repo" --entrypoint node mcp/playwright /repo/scripts/record-cdmx-audio.mjs
// Duration matches the stitched video (sum of shot lengths + tails).
import { chromium } from '/app/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';

const SECONDS = Number(process.env.SECONDS ?? 52);
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`));
await page.goto('http://localhost:5173/?debug');
await page.waitForTimeout(700);
await page.click('[data-map=cdmx]');
await page.waitForTimeout(500);

const b64 = await page.evaluate(async (SECONDS) => {
  const { Sfx } = await import('/src/engine/audio.js');
  const ctx = new OfflineAudioContext(2, 44100 * SECONDS, 44100);
  const s = new Sfx();
  s.ctx = ctx;
  s.out = ctx.createGain();
  s.out.gain.value = 0.9;
  s.out.connect(ctx.destination);
  s.noiseBuf = ctx.createBuffer(1, 44100 * 2, 44100);
  const noise = s.noiseBuf.getChannelData(0);
  for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1;
  s.lofiBase = 0.8;
  s.tension = 0.35;
  s.startLofi();
  const step = 60 / 68 / 2;
  for (let i = 1; i < Math.ceil(SECONDS / step); i++) s.lofiStep(i, 0.3 + i * step);
  const buf = await ctx.startRendering();
  const out = new Float32Array(buf.length * 2);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) out[i * 2 + ch] = d[i];
  }
  // 16-bit PCM WAV
  const n = out.length;
  const data = new Uint8Array(44 + n * 2);
  const v = new DataView(data.buffer);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) data[o + i] = s.charCodeAt(i); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, 44100, true); v.setUint32(28, 44100 * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const x = Math.max(-1, Math.min(1, out[i]));
    v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
  }
  let b64str = '';
  for (let i = 0; i < data.length; i += 32768) b64str += String.fromCharCode.apply(null, data.subarray(i, i + 32768));
  return btoa(b64str);
}, SECONDS);

mkdirSync('/repo/docs/raw', { recursive: true });
writeFileSync('/repo/docs/raw/cdmx-audio.wav', Buffer.from(b64, 'base64'));
console.log('wrote', SECONDS, 's wav');
await browser.close();
