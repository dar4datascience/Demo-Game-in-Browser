# Demo-Game-in-Browser

**Night Shift**: short, browser-playable, lo-fi horror demos with a PS1/VHS look, inspired by Chilla's Art.

| Map | Setting | Characters |
| --- | ------- | ---------- |
| **NightMart** | 11:40 PM, a 24h konbini. Clock in, restock, serve customers, survive the blackout. Inspired by *The Convenience Store* (2020). | Night clerk |
| **Central de Abasto** | 4:10 AM, Iztapalapa, CDMX. The full **A–Z** market: thirteen letter-pair naves, five numbered pasillos, andenes with diagonal truck bays, the pasillo 2 bridge, and the Eje 5 Sur gate. Compressed from the real CEDA layout (26 lettered rows, bodegas numbered west to east). | **Diablero** (loader with a diablito), **Seller** (bodeguero), **Consumer** (marchante) |

In the Central de Abasto, each character has its own mission. Diablero hauls three loads to the trucks, fetches a hand-painted price sign on a Flow-powered run, and ends the shift facing a ghost. Seller opens the shutter, stocks pallets and serves customers at the scale, and Consumer works through a shopping list. Seller and Consumer end in the shared blackout chase: reach the Eje 5 Sur gate with your phone flashlight, while something that only moves when you aren't looking closes in. The Diablero's shift ends with a different kind of ghost encounter.

These are fan-made tributes built from original code. Every texture, model and sound is generated procedurally at runtime. All businesses shown are fictional.

## Storylines

Every map is a self-contained short story. NightMart is one linear shift. The Central de Abasto has
three character routes: Seller and Consumer share the blackout finale, while the Diablero has its
own end-of-shift encounter.

### NightMart — the shift

A single linear shift for the night clerk: clock in at the staff-room terminal, restock three empty
shelves from the stock boxes, answer the ringing phone, serve two customers at the register, take
the trash bag to the dumpster, then check the security monitor. The caller's warning — *"whatever
you do... don't check the cameras"* — pays off in a CCTV jumpscare. There is no character choice on
this map.

### Central de Abasto — three routes

All three start at 4:10 AM and run their own job loop. Choose the route from the character cards on
the title screen; the Diablero also lets you play as a man, a woman or a nonbinary person. They are
three distinct jobs — a loader, a bodega operator and a shopper — not a hierarchy.

| Route | Job | Job loop | Story beat |
| --- | --- | --- | --- |
| **Diablero** | loader with a diablito | grab the cart, haul three loads, then fetch the pancarta de precios from the rotulista | the third truck is empty; the rotulista's sign starts a 70-second Flow run; a ghost diablero waits at the end of the shift |
| **Seller** | bodeguero at Bod. B-4 | raise the cortina, stock three pallets, serve two customers at the scale | the second customer is the veiled woman asking about her son, a former diablero |
| **Consumer** | marchante with a shopping list | buy chiles, frijol and mole from three vendors | the vendors gossip about the ánimas just before the lights die |

The three loops are deliberately different kinds of play:

- **Hauling (Diablero)** — fetch-and-deliver. Picking up a load slows you to 0.75×; delivering
  restores normal speed. Only the active job's pickup and truck offer a prompt.
- **Retail (Seller)** — open, stock, serve. Stocking interactions do not exist until the cortina is
  up, and the scale only works while a customer is waiting.
- **Shopping (Consumer)** — a checklist. Each counter can be used once, the objective list ticks
  items off, and the bag visibly grows.

### Diablero — the pancarta and the ghost

After the three hauls, the diablero parks the cart and runs to **Pasillo 3, local 3**, deep in the
market, where the best letterer in the Central paints the **pancarta de precios**. Picking it up
starts **Flow**: a bocina loaded with sonidera cumbia, 1.6× movement speed, and exactly **70
seconds of game time** to carry the sign to Bod. B-4 and hang it. The clock starts the moment you
take the sign, not before; if it runs out, the trailer leaves without you (`SE TE FUE EL TRÁILER`).
The run crosses the bridge over Pasillo 2, where a loaded diablito is hard to hold back.

At the end of the shift, the ghost of a diablero who died in the Central offers a choice:

- **Fight** — outrun him to a **Virgen María shrine** that appears in a different random spot each
  run. Collect fruit peels with **E** and drop them behind with **Q** to make him slip.
- **Share a beer** — sit by a fire and trade stories. Press the displayed key sequence to keep the
  diablero awake; fall asleep and the ghost keeps the shift, stay awake and you tell the tale in the
  morning.

### Seller and Consumer — the shared finale

The power dies across the Central, the crowd disappears, and you turn on your phone flashlight. A
ghost spawns behind you and only moves while you are not looking. Reach the Eje 5 Sur gate to
escape; let her get within arm's reach and the run ends with `TE ALCANZÓ`. Escaping ends on
`SALISTE DE LA CENTRAL`, with the character's name in the subtitle.

## Run locally

Requires Node.js 22+ and npm.

```bash
npm install
npm run dev        # open http://localhost:5173
```

Production build: `npm run build && npm run preview`.

## Deploy

The site deploys to Cloudflare Workers as static assets at <https://nightshift.radarcentral.dev>.
`.github/workflows/deploy.yml` runs tests and `vite build` on every push/PR, then `wrangler deploy`
on pushes to `main`.

- Wrangler config: `wrangler.jsonc` (assets from `dist/`, custom domain `nightshift.radarcentral.dev`).
- Required GitHub secrets: `CLOUDFLARE_API_TOKEN` (Workers Scripts + Workers Routes edit on the
  `radarcentral.dev` zone) and `CLOUDFLARE_ACCOUNT_ID`.
- Manual deploy: `npm run deploy` (needs `wrangler login` or the same env vars locally).

## Controls

| Input       | Action                          |
| ----------- | ------------------------------- |
| WASD        | Move                            |
| Mouse       | Look                            |
| Shift       | Run                             |
| E / Click   | Interact                        |
| Q           | Drop a fruit peel (shrine run)  |
| Esc         | Pause                           |

Desktop browser with WebGL2 required. Headphones recommended.

## Tech

- **Three.js** + **Vite**, plain JavaScript, no other runtime dependencies.
- PS1/VHS look: the scene renders to a 240p target and gets upscaled with nearest-neighbor filtering. A post shader adds
  Bayer dithering, film grain, scanlines, chromatic aberration and vignette, and vertex snapping makes polygons jitter.
- Textures come from `<canvas>` drawing; audio (hum, chimes, shutters, diablito squeaks, stingers) is synthesized with WebAudio.
- Music is procedural too: a 68 BPM lofi bed (Dm9–Bbmaj9–Gm9–A7b9) with warm detuned pads, vinyl
  crackle and a soft brushed beat, and a 92 BPM sonidera cumbia loop (tumbao bass, guiro, clap,
  organ stabs and an accordion-style reed lead) that takes over during Flow. The lofi bed ducks
  under the cumbia and as tension rises.
- Each level is a `buildWorld(scene)` + `runStory(ctx)` pair. Stories are `async` scripts on a game-time scheduler, so pausing freezes them.

```
src/
  engine/          post.js (render pipeline + PS1 material), textures.js, audio.js, music.js, input.js
  world/           builder.js (shared level helpers, oriented-box colliders), person.js (NPCs)
  game/            player.js, hud.js, scheduler.js, interaction.js, director.js, rng.js (shared story helpers)
  levels/index.js  level registry
  levels/konbini/  world.js, story.js
  levels/ceda/     world.js, props.js (trucks, diablitos, pancarta, shrine, fire), story.js (3 characters)
  main.js          menu, level loading, main loop
```

## Tests

```bash
npm test            # unit + integration (Vitest, headless, ~5s), also run in CI on every push/PR
npm run test:e2e    # browser playthroughs of every story (Docker + mcp/playwright image, slow)
```

- **Unit** (`tests/unit/`): scheduler, collision and player movement, raycast interactions, level builder,
  NPC walking, HUD clock, textures, seeded RNG, music patterns, Central de Abasto layout invariants.
- **Integration** (`tests/integration/`): builds both levels in Node (canvas stub, no WebGL), checks that every
  mission target is reachable on foot from the spawn using the game's collision rules, and plays every story
  headlessly to its ending (NightMart, the Diablero's shrine and beer branches, all three Diablero presentations
  at spawn, and both Central de Abasto shared-finale endings).
- **Mechanics** (`tests/integration/gameplay.test.js`): proves the routes are actually playable — interaction
  gating (a shelf needs a box, the phone only rings for a while, the register needs a waiting customer), the
  diablero's load/carry speed rules, the 70-second Flow timer (a delivery at 69 s wins, an idle run loses at
  70 s), fruit peels slowing the ghost, the seller's cortina and sack requirements, the automatic door, and the
  shared chase speeds and caught ending.
- **E2E** (`scripts/e2e.sh`): real Chromium with WebGL plays each story through `?debug` hooks and saves
  screenshots, including both Diablero ghost choices (win and lose); set `VARIANT` to pick the presentation.

## Development skill

`.devin/skills/night-shift-dev/SKILL.md` is a project skill for AI agents and a concise map for humans. It
documents the frame loop and pause semantics, the scheduler, interaction gating, the level/story contracts,
both missions (including the chase rules), the headless harness, and the conventions above. In Devin CLI it is
available as `/night-shift-dev`.

## Debugging

- `/?debug` keeps the game running without pointer lock and exposes `game`, `player`, `world`, `hud`, `sfx`,
  `pipe` and `scene` on `window`.
- `/?debug&speed=4` also runs game time 4x faster.
- `/?debug&colliders` draws every collision footprint as a wireframe, for checking prop boundaries.
- `scripts/playthrough.mjs` (NightMart) and `scripts/playthrough-ceda.mjs` (Central de Abasto) play the full stories automatically and save screenshots. See `AGENTS.md`.
- `scripts/profile.mjs` prints draw calls, mesh/light counts and frame time; `scripts/look.mjs` saves a screenshot
  tour of the market; `scripts/audio-check.mjs` renders both music beds offline and reports peak/RMS.
