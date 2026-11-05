// Renders docs/ceda-map.svg to docs/ceda-map.png with the Playwright Chromium.
//   docker run --rm --network host -v "$PWD:/repo" --entrypoint node mcp/playwright /repo/scripts/render-map.mjs
import { chromium } from '/app/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';

const svg = readFileSync('/repo/docs/ceda-map.svg', 'utf8');
const [, sw, sh] = svg.match(/<svg[^>]*width="([\d.]+)" height="([\d.]+)"/).map(Number);
const w = Math.ceil(sw), h = Math.ceil(sh);
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
await page.goto('file:///repo/docs/ceda-map.svg');
await page.screenshot({ path: '/repo/docs/ceda-map.png' });
await browser.close();
console.log(`docs/ceda-map.png  ${w * 2} x ${h * 2} px`);
