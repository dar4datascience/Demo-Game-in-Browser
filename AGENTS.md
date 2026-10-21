# AGENTS.md

## Commands

- Install: `npm install`
- Dev server: `npm run dev` (http://localhost:5173; use `npx vite --host 0.0.0.0` to expose on the LAN)
- Unit + integration tests (run after every change; CI runs them on push/PR): `npm test`
- Build: `npm run build`
- Deploy to Cloudflare Workers (needs `wrangler login` or `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`): `npm run deploy`.
  CI deploys to https://nightshift.radarcentral.dev on every push to `main` via `.github/workflows/deploy.yml`.
- Browser E2E playthroughs of every story (slow, needs Docker): `npm run test:e2e`

## Verification

- `npm test` is the main regression gate. It runs in Node with no browser: `tests/setup/canvas.js` stubs `<canvas>` so
  levels build headlessly, and `tests/helpers/harness.js` runs real story scripts with a silent sfx and a fake HUD.
  When adding a level or mission, add a story test (autoplay with `useAvailable()` until `game.ended`) and add its
  interactables to the reachability test in `tests/integration/levels.test.js`.
- Story code must stay DOM-free (go through `ctx.hud`, `ctx.sfx`, `ctx.pipe`) so the harness can run it.
- No local browser is installed on this machine, and the `mcp-playwright` MCP container cannot reach the host network.
  To verify visually, run the bundled Chromium from the `mcp/playwright` image with host networking against the dev server:

  ```bash
  docker run --rm --network host -v "$PWD/scripts:/out" --entrypoint node mcp/playwright /out/playthrough.mjs
  ```

  It plays the whole story through `?debug&speed=4` hooks, prints each interaction prompt, exits non-zero on
  timeouts/page errors, and writes screenshots to `scripts/shots/` (gitignored).

- Central de Abasto, one run per character (`CHAR=diablero|seller|consumer`, optional `ENDING=caught`):

  ```bash
  docker run --rm --network host -v "$PWD/scripts:/out" -e CHAR=seller --entrypoint node mcp/playwright /out/playthrough-ceda.mjs
  ```

- Software rendering in that container runs at about 3 fps on the CEDA map (about 21 point lights), so each run takes a few
  minutes. The scripts wait on rendered frames, not wall-clock time. `npm run test:e2e` (`scripts/e2e.sh`) starts its
  own Vite server on port 5199 and runs all four playthroughs.
- `scripts/shots/` is gitignored, so agent file tools can't read it; copy the screenshots out first (`cp -r scripts/shots /tmp/`).

## Conventions

- Plain ES modules, 2-space indent, single quotes. Three.js materials must go through `lam()` / `basic()` from
  `src/engine/post.js` so they get PS1 vertex snapping.
- Keep assets procedural (canvas textures, WebAudio). Don't add copied art, audio, names or characters from
  Chilla's Art games; this is a style tribute. Central de Abasto businesses must stay fictional (no real brands or logos).
- New levels: add `src/levels/<id>/world.js` (`buildWorld(scene)` returning the `createBuilder` object plus
  `refs`, `cameras`, `fog`, `update`) and `story.js` (`runStory(ctx)`), then register them in `LEVELS` in `src/levels/index.js`
  and add a menu card in `index.html`.
- Pin dependency versions exactly, and pick releases that are at least 7 days old.
