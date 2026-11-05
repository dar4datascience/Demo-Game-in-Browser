// Offline render of the two music beds, to check they are audible and not clipping.
//   docker run --rm --network host -v "$PWD/scripts:/out" --entrypoint node mcp/playwright /out/audio-check.mjs
import { chromium } from '/app/node_modules/playwright/index.mjs';

const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`));
await page.goto('http://localhost:5173/?debug');
await page.waitForTimeout(700);
await page.click('[data-map=ceda]');
await page.click('[data-char=seller]');
await page.waitForTimeout(800);

const res = await page.evaluate(async () => {
  const { Sfx } = await import('/src/engine/audio.js');
  const ctx = new OfflineAudioContext(2, 44100 * 6, 44100);
  const s = new Sfx();
  s.ctx = ctx;
  s.out = ctx.createGain();
  s.out.gain.value = 0.9;
  s.out.connect(ctx.destination);
  s.noiseBuf = ctx.createBuffer(1, 44100 * 2, 44100);
  const noise = s.noiseBuf.getChannelData(0);
  for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1;
  s.lofiBase = 0.8;
  s.tension = 0;
  s.startLofi();
  clearInterval(s.lofiTimer);
  s.lofiTimer = null;
  const lofiStep = 60 / 68 / 2;
  for (let i = 1; i < Math.ceil(3 / lofiStep); i++) s.lofiStep(i, 0.3 + i * lofiStep);
  s.createCumbiaBus();
  s.cumbiaGain.gain.value = 0.7;
  const cumbiaStep = 60 / 92 / 4;
  for (let i = 0; i < Math.ceil(3 / cumbiaStep); i++) s.cumbiaStep(i, 3.2 + i * cumbiaStep);
  const buf = await ctx.startRendering();
  const measure = (from, to) => {
    let peak = 0, sum = 0, n = 0;
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = Math.floor(from * 44100); i < Math.min(data.length, to * 44100); i++) {
        const v = Math.abs(data[i]);
        peak = Math.max(peak, v);
        sum += v * v;
        n++;
      }
    }
    return { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / n).toFixed(4) };
  };
  return { lofi: measure(0.3, 3.0), cumbia: measure(3.2, 6.0) };
});
console.log(JSON.stringify(res, null, 2));
await browser.close();
