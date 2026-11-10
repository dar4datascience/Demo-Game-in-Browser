# AGENTS.md

## Commands

- Install: `npm install`
- Dev server: `npm run dev` (http://localhost:5173; use `npx vite --host 0.0.0.0` to expose on the LAN)
- Unit + integration tests (run after every change; CI runs them on push/PR): `npm test`
- Build: `npm run build`
- Deploy to Cloudflare Workers (needs `wrangler login` or `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`): `npm run deploy`.
  CI deploys to https://nightshift.radarcentral.dev on every push to `main` via `.github/workflows/deploy.yml`.
- Browser E2E playthroughs of every story (slow, needs Docker): `npm run test:e2e`
- CDMX showcase tour (non-playable, camera-driven): open the "Ciudad de México" menu card, or
  `?debug&shot=N` (1–10) to play one shot. The showcase renders at 480p in "photo" mode; the default
  internal render height is 360 (`RENDER_HEIGHT` in `src/engine/post.js`). `?renderH=N` overrides it —
  `record-cdmx.mjs` defaults to `RENDER_H=360`, drop to 300/240 if SwiftShader can't keep up.
- Record the showcase to `docs/cdmx-night.mp4` (needs the dev server on :5173):

  ```bash
  docker run --rm --network host -v "$PWD:/repo" --entrypoint node mcp/playwright /repo/scripts/record-cdmx.mjs   # per-shot webms
  docker run --rm --network host -v "$PWD:/repo" --entrypoint node mcp/playwright /repo/scripts/record-cdmx-audio.mjs # lofi bed wav
  bash scripts/make-cdmx-video.sh                                                                              # stitch + mux
  ```

  `record-cdmx.mjs` uses the page's own `canvas.captureStream` + MediaRecorder (much faster than
  Playwright's screencast under SwiftShader), then `make-cdmx-video.sh`
  upscales to 1080×1920 H.264 24fps and muxes the offline-rendered lofi bed.
  Both make scripts take `FFMPEG`/`FFPROBE` env vars pointing at any ffmpeg/ffprobe binary
  (e.g. a static build in /tmp) and fall back to `ffmpeg`/`ffprobe` on PATH.
- Screenshot tour of every shot: `docker run --rm --network host -v "$PWD/scripts:/out" --entrypoint node mcp/playwright /out/look-cdmx.mjs`

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

- Central de Abasto, one run per character (`CHAR=diablero|seller|consumer`; diablero also takes
  `VARIANT=man|woman|nonbinary`, `CHOICE=fight|beer`, `OUTCOME=win|lose`; seller/consumer take
  `ENDING=escape|caught`; `SEED` pins the shrine):

  ```bash
  docker run --rm --network host -v "$PWD/scripts:/out" -e CHAR=diablero -e CHOICE=beer -e OUTCOME=win --entrypoint node mcp/playwright /out/playthrough-ceda.mjs
  ```

- Software rendering in that container is slow on the heavy maps (the level merges static
  geometry and keeps only 8 point lights live), so a full run takes a couple of minutes and level
  boot + intro can take ~75 s wall-clock. The scripts wait on rendered frames, not wall-clock time;
  `record-controls.mjs` allows up to 90 s for the first objective to appear. `npm run test:e2e`
  (`scripts/e2e.sh`) starts its own Vite server on
  port 5199 and runs all playthroughs (NightMart, both diablero ghost choices with win/lose outcomes, and the
  seller/consumer shared finale).
- `scripts/profile.mjs` prints draw calls, mesh/light counts and frame time (`CHAR=diablero`); `scripts/look.mjs`
  saves a screenshot tour of the market plus a top-down map check; `scripts/audio-check.mjs` renders both music
  beds offline and reports peak/RMS. All three use the same Docker invocation with `-v "$PWD/scripts:/out"`.
- `scripts/map.mjs` generates `docs/ceda-map.svg` from the level constants; render the PNG with
  `docker run --rm --network host -v "$PWD:/repo" --entrypoint node mcp/playwright /repo/scripts/render-map.mjs`.
- `scripts/record-controls.mjs` records the controls and Flow clips (`-v "$PWD:/repo"`); then run
  `bash scripts/make-controls-video.sh` on the host (needs ffmpeg, or `FFMPEG=/path/to/ffmpeg`) to
  produce `docs/diablero-controls.mp4` and the README GIF. It only deletes its own files under
  `docs/raw/`, so it can run before/after the CDMX recorders without clobbering their webms.
- `scripts/shots/` is gitignored, so agent file tools can't read it; copy the screenshots out first (`cp -r scripts/shots /tmp/`).

## Conventions

- `.devin/skills/night-shift-dev/SKILL.md` is the development ground truth for engine/level contracts,
  mission mechanics and the headless harness. Read it before changing game logic or adding tests.
- Plain ES modules, 2-space indent, single quotes. Three.js materials must go through `lam()` / `basic()` from
  `src/engine/post.js` so they get PS1 vertex snapping.
- Keep assets procedural (canvas textures, WebAudio). Don't add copied art, audio, names or characters from
  Chilla's Art games; this is a style tribute. Central de Abasto businesses must stay fictional (no real brands or logos).
- New levels: add `src/levels/<id>/world.js` (`buildWorld(scene)` returning the `createBuilder` object plus
  `refs`, `cameras`, `fog`, `update`) and `story.js` (`runStory(ctx)`), then register them in `LEVELS` in `src/levels/index.js`
  and add a menu card in `index.html`.
- Pin dependency versions exactly, and pick releases that are at least 7 days old.
