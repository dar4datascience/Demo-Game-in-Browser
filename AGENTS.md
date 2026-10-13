# AGENTS.md

## Commands

- Install: `npm install`
- Dev server: `npm run dev` (http://localhost:5173; use `npx vite --host 0.0.0.0` to expose on the LAN)
- Build (main correctness check, no lint/test setup yet): `npm run build`

## Verification

- No local browser is installed on this machine, and the `mcp-playwright` MCP container cannot reach the host network.
  To verify visually, run the bundled Chromium from the `mcp/playwright` image with host networking against the dev server:

  ```bash
  docker run --rm --network host -v "$PWD/scripts:/out" --entrypoint node mcp/playwright /out/playthrough.mjs
  ```

  It plays the whole story through `?debug&speed=4` hooks, prints each interaction prompt, exits non-zero on
  timeouts/page errors, and writes screenshots to `scripts/shots/` (gitignored).

## Conventions

- Plain ES modules, 2-space indent, single quotes. Three.js materials must go through `lam()` / `basic()` from
  `src/engine/post.js` so they get PS1 vertex snapping.
- Keep assets procedural (canvas textures, WebAudio). Don't add copied art, audio, names or characters from
  Chilla's Art games; this is a style tribute.
- Pin dependency versions exactly, and pick releases that are at least 7 days old.
