# Demo-Game-in-Browser

**Night Shift**: a short, browser-playable, lo-fi horror demo inspired by Chilla's Art's
*The Convenience Store* (2020). You work the night shift at a 24h konbini, clock in, restock shelves,
serve customers, and take out the trash while the night gets stranger.

It's a fan-made tribute built from original code. Every texture, model and sound is generated
procedurally at runtime, so there are no asset files and nothing from the original game.

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

- **Three.js** + **Vite**, plain JavaScript, no other runtime dependencies (~145 KB gzipped total).
- PS1/VHS look: the scene renders to a 240p target and gets upscaled with nearest-neighbor filtering. A post shader adds
  Bayer dithering, film grain, scanlines, chromatic aberration and vignette, and vertex snapping makes polygons jitter.
- Textures come from `<canvas>` drawing; audio (hum, door chime, phone, stingers) is synthesized with WebAudio.
- The story runs as an `async` script on a game-time scheduler, so pausing freezes it.

```
src/
  engine/   post.js (render pipeline + PS1 material), textures.js, audio.js, input.js
  world/    store.js (level geometry, lights, colliders), person.js (NPCs)
  game/     player.js, hud.js, story.js (the night-shift script)
  main.js   bootstrap + main loop
```

## Debugging

- `/?debug` keeps the game running without pointer lock and exposes `game`, `player`, `world`, `hud` on `window`.
- `/?debug&speed=4` also runs game time 4x faster.
- `scripts/playthrough.mjs` plays the full story automatically and saves screenshots (see `AGENTS.md`).
