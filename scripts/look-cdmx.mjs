// Screenshot tour of the CDMX showcase: start, middle and end of every shot.
//   docker run --rm --network host -v "$PWD/scripts:/out" --entrypoint node mcp/playwright /out/look-cdmx.mjs
import { chromium } from '/app/node_modules/playwright/index.mjs';

const SHOTS = ['angel', 'road', 'metro', 'metro-car', 'abarrotes', 'park', 'biblioteca', 'torre', 'bride', 'field'];
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && console.log(`console: ${m.text()}`));
await page.goto('http://localhost:5173/?debug&speed=1');
await page.waitForTimeout(700);
await page.click('[data-map=cdmx]');
await page.waitForTimeout(600);

const until = (fn, arg, timeout = 90000) => page.waitForFunction(fn, arg, { timeout });
for (const [i, id] of SHOTS.entries()) {
  await until((id) => game.flags.shot === id, id);
  const marks = [
    ['a', () => until((id) => game.flags.shot === id && game.flags.shotK < 0.12, id)],
    ['b', () => until((id) => game.flags.shot === id && game.flags.shotK > 0.5, id)],
    ['c', () => until((id) => game.flags.shot === id && game.flags.shotK > 0.9, id)],
  ];
  for (const [tag, wait] of marks) {
    await wait();
    await page.screenshot({ path: `/out/shots/cdmx-${i}-${id}-${tag}.png` });
  }
  console.log(`${i} ${id} ok`);
}
console.log('done', await page.evaluate(() => JSON.stringify(game.flags)));
await browser.close();
