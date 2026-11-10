// Records two short, captioned clips of the diablero: the controls, then the Flow run. The raw
// WebMs are trimmed, concatenated and converted to mp4/gif with ffmpeg (see README/AGENTS).
//   docker run --rm --network host -v "$PWD:/repo" --entrypoint node mcp/playwright /repo/scripts/record-controls.mjs
import { chromium } from '/app/node_modules/playwright/index.mjs';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';

const RAW = '/repo/docs/raw';
mkdirSync(RAW, { recursive: true });
// Only clear this script's own outputs — docs/raw/cdmx/ and cdmx-audio.wav belong to the
// CDMX recording pipeline and may still be needed by make-cdmx-video.sh.
for (const f of readdirSync(RAW)) {
  if (f === 'controls.webm' || f === 'flow.webm' || f === 'times.json' || f.startsWith('page@')) {
    rmSync(`${RAW}/${f}`, { force: true });
  }
}

const browser = await chromium.launch({
  channel: 'chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});

const startGame = async (page, speed) => {
  await page.goto(`http://localhost:5173/?debug&speed=${speed}&seed=1`);
  await page.waitForTimeout(600);
  await page.click('[data-map=ceda]');
  await page.click('[data-char=diablero]');
  await page.click('[data-variant=nonbinary]');
  // Software rendering can take a minute for the level to boot and the intro line to play.
  await page.waitForFunction(() => document.getElementById('objective').textContent.includes('Agarra'), null, { timeout: 90000 });
};

const times = {};
const record = async (name, fn) => {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 640 },
    recordVideo: { dir: RAW, size: { width: 1024, height: 640 } },
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`));
  const info = await fn(page);
  const video = page.video();
  await page.close();
  await video.saveAs(`${RAW}/${name}.webm`);
  await context.close();
  times[name] = info;
  console.log(`${name}.webm ${JSON.stringify(info)}`);
};

const look = (page, x, z, tx, ty, tz) => page.evaluate(([x, z, tx, ty, tz]) => {
  player.pos.set(x, 0, z);
  player.yaw = Math.atan2(-(tx - x), -(tz - z));
  player.pitch = Math.atan2(ty - 1.6, Math.hypot(tx - x, tz - z));
}, [x, z, tx, ty, tz]);

// --- Clip A: controls -------------------------------------------------------------------------
if (process.env.ONLY !== 'flow') await record('controls', async (page) => {
  const t0 = Date.now();
  await startGame(page, 1);
  const menuMs = Date.now() - t0;

  await page.addStyleTag({
    content: `
      #rec-cap { position: fixed; left: 22px; bottom: 26px; z-index: 50; display: flex; align-items: center;
        gap: 12px; padding: 9px 14px; background: rgba(0,0,0,.78); border: 2px solid #ffd24a;
        font-family: 'Courier New', monospace; color: #f0ead6; font-size: 18px; letter-spacing: 1px;
        transition: opacity .18s linear; }
      #rec-cap b { color: #ffd24a; font-size: 20px; letter-spacing: 3px; }
      #rec-title { position: fixed; inset: 0; z-index: 60; display: flex; flex-direction: column;
        align-items: center; justify-content: center; background: rgba(0,0,0,.82);
        font-family: 'Courier New', monospace; color: #e9e3cf; text-align: center;
        transition: opacity .35s linear; }
      #rec-title h1 { margin: 0; font-size: 54px; letter-spacing: 10px; text-shadow: 3px 3px 0 #5a1414; }
      #rec-title p { margin: 10px 0 0; font-size: 16px; letter-spacing: 4px; color: #a9a493; }
    `,
  });
  await page.evaluate(() => {
    const cap = document.createElement('div');
    cap.id = 'rec-cap';
    cap.style.opacity = '0';
    cap.innerHTML = '<b></b><span></span>';
    document.body.appendChild(cap);
    const title = document.createElement('div');
    title.id = 'rec-title';
    title.innerHTML = '<h1>DIABLERO</h1><p>CONTROLES · CENTRAL DE ABASTO</p>';
    document.body.appendChild(title);
  });

  const cap = (keys, text) => page.evaluate(([keys, text]) => {
    const el = document.getElementById('rec-cap');
    el.querySelector('b').textContent = keys;
    el.querySelector('span').textContent = text;
    el.style.opacity = '1';
  }, [keys, text]);
  const titleCard = (h1, p, ms = 1700) => page.evaluate(([h1, p]) => {
    const el = document.getElementById('rec-title');
    el.querySelector('h1').textContent = h1;
    el.querySelector('p').textContent = p;
    el.style.opacity = '1';
  }, [h1, p]).then(() => page.waitForTimeout(ms)).then(() => page.evaluate(() => {
    document.getElementById('rec-title').style.opacity = '0';
  }));
  const cut = async (fn) => {
    await page.evaluate(() => game.fadeTo(1, 0.12));
    await page.waitForTimeout(220);
    await fn();
    await page.evaluate(() => game.fadeTo(0, 0.12));
    await page.waitForTimeout(260);
  };
  const hold = async (keys, ms) => {
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(ms);
    for (const k of keys) await page.keyboard.up(k);
  };

  await titleCard('DIABLERO', 'CONTROLES · CENTRAL DE ABASTO');
  await cap('W A S D', 'caminar');
  await hold(['w'], 1100);
  await hold(['d'], 700);
  await page.waitForTimeout(250);
  await cap('SHIFT + W', 'correr');
  await hold(['Shift', 'w'], 1400);
  await page.waitForTimeout(200);
  await cap('MOUSE', 'mirar');
  await page.evaluate(() => new Promise((resolve) => {
    const start = player.yaw, t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 1200);
      player.yaw = start - 0.85 * Math.sin(k * Math.PI);
      if (k < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  }));
  await page.waitForTimeout(200);
  await cap('E', 'agarrar el diablito');
  await cut(async () => {
    await look(page, -23.4, -13.4, -22, 0.6, -14);
    await page.waitForTimeout(300);
    await page.keyboard.press('e');
    await page.waitForTimeout(700);
  });
  await cap('E', 'cargar los bultos');
  await cut(async () => {
    await look(page, -43.6, -1.1, -43.6, 0.5, -2.7);
    await page.waitForTimeout(300);
    await page.keyboard.press('e');
    await page.waitForTimeout(600);
  });
  await cap('E', 'descargar en la camioneta');
  await cut(async () => {
    await look(page, -47, -14, -44.5, 1, -14);
    await page.waitForTimeout(300);
    await page.keyboard.press('e');
    await page.waitForTimeout(600);
  });
  await page.evaluate(() => {
    document.getElementById('rec-cap').style.opacity = '0';
    game.fadeTo(1, 0.4);
  });
  await page.waitForTimeout(500);
  return { menuMs };
});

// --- Clip B: Flow -----------------------------------------------------------------------------
if (process.env.ONLY !== 'controls') await record('flow', async (page) => {
  const t0 = Date.now();
  await startGame(page, 4);
  const menuMs = Date.now() - t0;

  const use = async (label) => {
    for (let i = 0; i < 24; i++) {
      const ok = await page.evaluate((label) => {
        const mesh = interactions.targets.find((m) => m.userData.interact?.label?.() === label);
        if (!mesh) return false;
        mesh.userData.interact.use();
        return true;
      }, label);
      if (ok) return true;
      await page.waitForTimeout(250);
    }
    console.log('missing interaction:', label, await page.evaluate(() => interactions.targets.map((m) => m.userData.interact?.label?.()).filter(Boolean)));
    return false;
  };
  // waitForFunction runs in an isolated world where `window.game` is not visible, so poll with evaluate.
  const poll = async (fn, arg = null, timeoutMs = 30000) => {
    const t = Date.now();
    while (Date.now() - t < timeoutMs) {
      if (await page.evaluate(fn, arg)) return true;
      await page.waitForTimeout(200);
    }
    throw new Error(`poll timed out: ${fn}`);
  };
  const waitJob = (n) => poll(({ n }) => game.flags.job === n, { n });

  const loaded = () => poll(() => document.getElementById('objective').textContent.includes('llévala'));
  await use('Agarrar el diablito');
  await waitJob(0);
  await use('Cargar los bultos');
  await loaded();
  await use('Descargar en la camioneta');
  await waitJob(1);
  await use('Cargar los bultos');
  await loaded();
  await use('Descargar en la camioneta');
  await waitJob(2);
  await use('Cargar los bultos');
  await loaded();
  await use('Descargar en la camioneta');
  await poll(() => game.flags.stage === 'pancarta');
  const driveMs = Date.now() - t0;
  await page.addStyleTag({
    content: `
      #rec-cap { position: fixed; left: 22px; bottom: 26px; z-index: 50; display: flex; align-items: center;
        gap: 12px; padding: 9px 14px; background: rgba(0,0,0,.78); border: 2px solid #ffd24a;
        font-family: 'Courier New', monospace; color: #f0ead6; font-size: 18px; letter-spacing: 1px; }
      #rec-cap b { color: #ffd24a; font-size: 20px; letter-spacing: 3px; }
      #rec-title { position: fixed; inset: 0; z-index: 60; display: flex; flex-direction: column;
        align-items: center; justify-content: center; background: rgba(0,0,0,.82);
        font-family: 'Courier New', monospace; color: #e9e3cf; text-align: center; }
      #rec-title h1 { margin: 0; font-size: 54px; letter-spacing: 10px; text-shadow: 3px 3px 0 #5a1414; }
      #rec-title p { margin: 10px 0 0; font-size: 16px; letter-spacing: 4px; color: #a9a493; }
    `,
  });
  await page.evaluate(() => {
    const cap = document.createElement('div');
    cap.id = 'rec-cap';
    cap.innerHTML = '<b>FLOW · 70 s</b><span>la pancarta acelera al diablero</span>';
    document.body.appendChild(cap);
  });

  await page.evaluate(() => game.fadeTo(1, 0.12));
  await page.waitForTimeout(220);
  await look(page, -0.5, 168, 1.65, 1, 168);
  await page.waitForTimeout(300);
  await page.evaluate(() => game.fadeTo(0, 0.12));
  await page.waitForTimeout(260);
  const flowStartMs = Date.now() - t0;
  await page.keyboard.press('e');
  await poll(() => game.flags.flow);
  await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  await page.waitForTimeout(2600);
  await page.keyboard.up('w');
  await page.keyboard.up('Shift');
  await page.evaluate(() => {
    document.getElementById('rec-cap').style.opacity = '0';
    const t = document.createElement('div');
    t.id = 'rec-title';
    t.innerHTML = '<h1>NIGHT SHIFT</h1><p>CENTRAL DE ABASTO · 4:10 AM</p>';
    document.body.appendChild(t);
  });
  await page.waitForTimeout(1900);
  return { menuMs, driveMs, flowStartMs };
});

await browser.close();
writeFileSync(`${RAW}/times.json`, JSON.stringify(times, null, 2));
console.log('convert with: bash scripts/make-controls-video.sh');
