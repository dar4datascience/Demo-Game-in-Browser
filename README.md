# Demo-Game-in-Browser

**Night Shift**: short, browser-playable, lo-fi horror demos with a PS1/VHS look, inspired by Chilla's Art.

| Map | Setting | Characters |
| --- | ------- | ---------- |
| **NightMart** | 11:40 PM, a 24h konbini. Clock in, restock, serve customers, survive the blackout. Inspired by *The Convenience Store* (2020). | Night clerk |
| **Central de Abasto** | 4:10 AM, Iztapalapa, CDMX. Three covered *pasillos*, bodega rows A–D, loading docks with diagonal truck bays, a plaza of tarp stalls, and the Eje 5 Sur gate. Loosely based on the public "Abarrotes y Víveres — Lado A" floor plan. | **Diablero** (porter with a diablito), **Seller** (bodeguero), **Consumer** (marchante) |

In the Central de Abasto, each character has its own mission. Diablero hauls three loads to the trucks, Seller opens the shutter, stocks pallets and serves customers at the scale, and Consumer works through a shopping list. All three end in the same blackout chase: reach the Eje 5 Sur gate with your phone flashlight, while something that only moves when you aren't looking closes in.

These are fan-made tributes built from original code. Every texture, model and sound is generated procedurally at runtime. All businesses shown are fictional.

## Run locally

Requires Node.js 22+ and npm.

```bash
npm install
npm run dev        # open http://localhost:5173
```

Production build: `npm run build && npm run preview`.

## Controls

| Input       | Action          |
| ----------- | --------------- |
| WASD        | Move            |
| Mouse       | Look            |
| Shift       | Run             |
| E / Click   | Interact        |
| Esc         | Pause           |

Desktop browser with WebGL2 required. Headphones recommended.

## Tech

- **Three.js** + **Vite**, plain JavaScript, no other runtime dependencies.
- PS1/VHS look: the scene renders to a 240p target and gets upscaled with nearest-neighbor filtering. A post shader adds
  Bayer dithering, film grain, scanlines, chromatic aberration and vignette, and vertex snapping makes polygons jitter.
- Textures come from `<canvas>` drawing; audio (hum, chimes, shutters, diablito squeaks, stingers) is synthesized with WebAudio.
- Each level is a `buildWorld(scene)` + `runStory(ctx)` pair. Stories are `async` scripts on a game-time scheduler, so pausing freezes them.

```
src/
  engine/          post.js (render pipeline + PS1 material), textures.js, audio.js, input.js
  world/           builder.js (shared level helpers, oriented-box colliders), person.js (NPCs)
  game/            player.js, hud.js, scheduler.js, interaction.js, director.js (shared story helpers)
  levels/index.js  level registry
  levels/konbini/  world.js, story.js
  levels/ceda/     world.js, props.js (trucks, diablitos, stalls), story.js (3 characters + finale)
  main.js          menu, level loading, main loop
```

## Tests

```bash
npm test            # unit + integration (Vitest, headless, ~5s), also run in CI on every push/PR
npm run test:e2e    # browser playthroughs of every story (Docker + mcp/playwright image, slow)
```

- **Unit** (`tests/unit/`): scheduler, collision and player movement, raycast interactions, level builder,
  NPC walking, HUD clock, textures, Central de Abasto layout invariants.
- **Integration** (`tests/integration/`): builds both levels in Node (canvas stub, no WebGL), checks that every
  mission target is reachable on foot from the spawn using the game's collision rules, and plays every story
  headlessly to its ending (NightMart, plus each Central de Abasto character with both endings).
- **E2E** (`scripts/e2e.sh`): real Chromium with WebGL plays each story through `?debug` hooks and saves screenshots.

## Debugging

- `/?debug` keeps the game running without pointer lock and exposes `game`, `player`, `world`, `hud` on `window`.
- `/?debug&speed=4` also runs game time 4x faster.
- `scripts/playthrough.mjs` (NightMart) and `scripts/playthrough-ceda.mjs` (Central de Abasto) play the full stories automatically and save screenshots. See `AGENTS.md`.
