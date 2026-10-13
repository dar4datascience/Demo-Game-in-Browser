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
  game/            player.js, hud.js, director.js (shared story helpers)
  levels/konbini/  world.js, story.js
  levels/ceda/     world.js, props.js (trucks, diablitos, stalls), story.js (3 characters + finale)
  main.js          menu, level loading, main loop
```

## Debugging

- `/?debug` keeps the game running without pointer lock and exposes `game`, `player`, `world`, `hud` on `window`.
- `/?debug&speed=4` also runs game time 4x faster.
- `scripts/playthrough.mjs` (NightMart) and `scripts/playthrough-ceda.mjs` (Central de Abasto) play the full stories automatically and save screenshots. See `AGENTS.md`.
