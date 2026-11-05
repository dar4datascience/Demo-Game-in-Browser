// Frame/draw-call profiler for one character. Prints scene composition and renderer stats.
//   docker run --rm --network host -v "$PWD/scripts:/out" -e CHAR=diablero --entrypoint node mcp/playwright /out/profile.mjs
import { chromium } from '/app/node_modules/playwright/index.mjs';

const CHAR = process.env.CHAR ?? 'diablero';
const SPEED = process.env.SPEED ?? '1';
const URL = `${process.env.GAME_URL ?? 'http://localhost:5173'}/?debug&speed=${SPEED}&seed=1`;

const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`));
await page.goto(URL);
await page.waitForTimeout(800);
await page.click('[data-map=ceda]');
await page.click(`[data-char=${CHAR}]`);
if (CHAR === 'diablero') await page.click('[data-variant=nonbinary]');
await page.waitForTimeout(1500);

const stats = await page.evaluate(async () => {
  const counts = {};
  let meshes = 0, lights = 0, instanced = 0, triangles = 0;
  scene.traverse((o) => {
    counts[o.type] = (counts[o.type] ?? 0) + 1;
    if (o.isMesh) {
      meshes++;
      if (o.isInstancedMesh) instanced++;
      const g = o.geometry;
      if (g?.index) triangles += g.index.count / 3;
      else if (g?.attributes?.position) triangles += g.attributes.position.count / 3;
    }
    if (o.isLight) lights++;
  });
  const sample = () => new Promise((resolve) => {
    const t0 = performance.now();
    let n = 0;
    const step = () => (++n < 30 ? requestAnimationFrame(step) : resolve(performance.now() - t0));
    requestAnimationFrame(step);
  });
  const ms = await sample();
  const byMaterial = {};
  const byParent = {};
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    const label = `${m.type}${m.map ? ' map' : ''} ${m.color?.getHexString?.() ?? ''} ${m.map?.image?.width ?? ''}x${m.map?.image?.height ?? ''}`;
    byMaterial[label] = (byMaterial[label] ?? 0) + 1;
    const p = o.parent === scene ? 'scene' : (o.parent?.name || o.parent?.type || '?');
    byParent[p] = (byParent[p] ?? 0) + 1;
  });
  pipe.renderer.info.reset();
  pipe.renderer.setRenderTarget(pipe.rt);
  pipe.renderer.render(scene, game.cam);
  pipe.renderer.setRenderTarget(null);
  const info = pipe.renderer.info;
  return {
    meshes, lights, instanced, triangles: Math.round(triangles),
    calls: info.render.calls, drawnTriangles: info.render.triangles,
    geometries: info.memory.geometries, textures: info.memory.textures,
    programs: info.programs?.length,
    frameMs: +(ms / 30).toFixed(1),
    fps: +(30000 / ms).toFixed(1),
    types: counts,
    topMaterials: Object.entries(byMaterial).sort((a, b) => b[1] - a[1]).slice(0, 12),
    parents: Object.entries(byParent).sort((a, b) => b[1] - a[1]).slice(0, 12),
  };
});
console.log(JSON.stringify(stats, null, 2));
await browser.close();
