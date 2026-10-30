---
name: night-shift-dev
description: Ground development of the Night Shift browser horror demo — engine and level contracts, story scripting, mission mechanics, and the headless test harness.
allowed-tools:
  - read
  - grep
  - glob
  - exec
triggers:
  - user
  - model
---

# Night Shift development

Use this skill before changing game logic, adding levels, editing story scripts, or writing tests.
It is the map of the contracts the code relies on. Verify details against source when in doubt;
this file tracks the code, it does not replace it.

## What the game is

Three.js + Vite, plain ES modules, no runtime dependencies beyond `three`. Two playable maps:

- **NightMart** (`konbini`): 11:40 PM convenience-store shift. One scripted mission.
- **Central de Abasto** (`ceda`): 4:10 AM Iztapalapa market. Three characters (diablero, seller,
  consumer), each with its own mission, all sharing one blackout-chase finale.

Everything is procedural: canvas textures, box-model people, WebAudio. No copied assets or real
business names.

## Commands

```bash
npm install
npm run dev                 # http://localhost:5173
npm test                    # Vitest, headless, ~2s — the main regression gate
npm run build               # Vite production build
npm run test:e2e            # Docker + Chromium playthroughs, slow
```

`?debug` runs without pointer lock and exposes `window.game/player/world/hud`; `?debug&speed=4`
runs game time 4x. E2E scripts live in `scripts/` (see `AGENTS.md` for the Docker invocation).

## File map

```
src/main.js                 menu, level boot, frame loop
src/engine/post.js          render pipeline, lam()/basic() materials (PS1 vertex snapping)
src/engine/textures.js      canvas textures, seeded rand()
src/engine/audio.js         WebAudio Sfx (beeps, chimes, squeaks, stingers, tension, flow, fire)
src/engine/input.js         keys/pressed/mouse, pointer lock
src/game/scheduler.js       createGame: game-time, waiters, hooks, flags, seed
src/game/rng.js             mulberry32 seeded PRNG + randomSeed
src/game/player.js          Player movement, collision, held items, flashlight
src/game/interaction.js     raycast interactions with label gating + occlusion
src/game/hud.js             objective/prompt/subtitle/clock/camera/ending
src/game/director.js        story helpers: spawn/despawn/say/power/flicker/jumpscare + GHOST
src/world/builder.js        createBuilder: meshes, oriented colliders, lights, power
src/world/person.js         NPC box humanoid + walk/face/update
src/levels/index.js         LEVELS registry
src/levels/konbini/         world.js, story.js
src/levels/ceda/            world.js, props.js, story.js
tests/helpers/harness.js    headless story runner + reachability helpers
tests/unit/                 scheduler, player, interaction, world/NPC/HUD/layout
tests/integration/          level contract/reachability, story playthroughs
```

## Frame loop and pause semantics

`main.js` clamps `dt` to `0.05 * TIME_SCALE` and only calls `update(dt)` while
`game.started && !game.ended && (input.locked || DEBUG)`. Pausing therefore freezes stories:
scripts advance only through `game.tick`.

Update order per frame:

1. `game.tick(dt)` — time, hooks, waiters
2. `player.update(dt, input, world.colliders, game.inputEnabled, onStep)`
3. `game.npcs.forEach(n => n.update(dt))`
4. `world.update(dt, [player.pos, ...npc.pos])` — doors, shutters, lamp flicker, static
5. if `game.inputEnabled`: raycast pick → `hud.prompt(label)` → `use()` on `KeyE`/click
6. `hud.clock(game.time)`, shake decay, `uFlash` decay, `uFade` approach

## Scheduler contract (`createGame`)

`game` is the story clock and shared state bag:

| Member | Meaning |
| --- | --- |
| `time` | seconds of game time; accumulates in `tick(dt)` |
| `seed` | unsigned 32-bit run seed; `mulberry32(game.seed)` drives the shrine spot |
| `until(pred)` | promise resolved on the first tick where `pred()` is true |
| `wait(seconds)` | sugar for `until(() => time >= t)` |
| `fadeTo(target, seconds)` | sets `fade = { target, rate }`; `main` moves `uFade` |
| `hooks` | per-tick callbacks; return `true` to unregister |
| `flags` | story state (`F` in scripts); also read by tests |
| `npcs` | live NPCs, updated every frame |
| `cam` | render camera (`world.secCam` for CCTV, the fire camera during the beer scene) |
| `inputEnabled` | movement + interaction gate |
| `shake` | jumpscare camera shake, decays in `main` |
| `started` / `ended` | boot and ending guards |

Important: a resolved waiter's continuation runs as a microtask **after** the tick. Tests that
yield with `setImmediate` let those continuations run before the next assertion.

## Interaction contract (`createInteractions`)

```js
interact(objects, label, use)
```

- `objects` is a mesh or array/group; every mesh inside is registered as a raycast target.
- `label` is a **function** returning a string or `null`. This is the availability gate. `null`
  means the crosshair ignores the object; a string becomes `[E] <label>`.
- `use` runs on E/click. It may be async; `main` does not await it.
- Reach is 2.3 m from the camera, and `world.occluders` are in the same raycast list, so nothing
  is usable through a wall. Hidden objects (including via a hidden ancestor) are skipped.
- Interaction code must stay DOM-free: only `ctx.hud`, `ctx.sfx`, `ctx.pipe`, geometry.

Pattern in stories: register all interactions up front, then gate them on flags/stages. Never
assume the player presses things in order — the label function is the only ordering authority.

## Player mechanics

`EYE = 1.6`, collision `RADIUS = 0.3`, mouse `SENS = 0.0022`, default spawn `(4.5, 0, 13)`.

- Walk 2.2 m/s, run 3.6 m/s (Shift), both multiplied by `player.speedScale`. The diablero's Flow
  sets `speedScale = 2.7`; movement is sub-stepped at 0.15 m so that speed cannot tunnel through
  thin walls.
- Diagonal movement is normalized (no diagonal speed boost).
- Collision: oriented boxes `{ cx, cz, hx, hz, rot }`, resolved per axis by `resolveCircle`.
  `circleHits(x, z, collider, radius)` is the predicate tests reuse for reachability.
- `forward()` is `(-sin yaw, 0, -cos yaw)`; yaw 0 faces north (-z).
- Pitch clamps to ±1.45 rad. Head bob is visual only.
- `onStep` fires every 0.8 m walked (footstep sfx).
- `hold(kind, mesh?, pos?, rot?)` parents a mesh to the camera and sets `heldKind`; `hold(null)`
  clears. Gating on `player.heldKind` is how carry missions work.
- `flashlight` is a SpotLight on the camera, intensity 0 until a blackout sets it (usually 40).

## Level contract

`src/levels/index.js`:

```js
export const LEVELS = {
  konbini: { build: buildWorld, story: runStory, clock: 23 * 60 + 40 },
  ceda:    { build: buildWorld, story: runStory, clock: 4 * 60 + 10, characters: CHARACTERS },
};
```

`buildWorld(scene)` must return the builder plus:

```js
{
  refs,                 // the names story.js and tests rely on
  cameras: [secCam?],   // extra cameras resized by main
  fog: [color, near, far],
  update(dt, movers),   // movers = [player.pos, ...npc.pos]
  secCam?,              // konbini CCTV camera
  colliders, occluders, setPower, ...
}
```

`runStory(ctx)` is an async script. `ctx` provides:

```js
{ game, world, hud, sfx, player, scene, pipe, interact, input, character, variant,
  end(title, subtitle) }   // sets game.ended, unlocks input, shows the end screen
```

`input` is the live input object (use `input.pressed` for QTE/drop keys). `variant` is the chosen
diablero presentation (`man`, `woman`, `nonbinary`); other routes ignore it.

Builder (`src/world/builder.js`):

- `box(w,h,d,mat,x,y,z,{collide=true, occlude=false, tile=1, parent=scene, ry=0})` adds an
  oriented collider `{cx,cz,hx,hz,rot:ry}` and optionally an occluder.
- `plane(...)` is visual only (no collision).
- `light(..., onGrid=true)` joins the power grid; `glowMat(opts, offColor)` dims with power.
- `setPower(false)` kills grid lights and swaps glow colors; `powered` reflects state.
- `addBounds(minX,maxX,minZ,maxZ)` adds a wall collider.
- Materials must come from `lam()` / `basic()` in `engine/post.js` so PS1 vertex snapping applies.

## Director and NPCs

`createDirector(ctx)` returns:

- `spawn(opts, x, z)` → `NPC` in the scene and `game.npcs`; `despawn(npc)` removes it.
- `say(text, dur)` → `hud.say`.
- `power(on)` → `world.setPower` + `sfx.setPower`.
- `flicker([[on, dur], ...])` → toggles power with game-time waits.
- `jumpscare(npc)` → input off, NPC snaps in front of the player, stinger/flash/shake, waits
  1.4 s, fades, waits 1.6 s. Caller decides the ending.
- `GHOST` look: pale, long hair, hollow eyes, slightly short.

`NPC` faces +z. `walk(points, speed)` returns a promise that resolves on arrival; `update(dt)`
moves along `path`, turns toward the target, and swings limbs. `pos` is `root.position`.
Setting `npc.path = []` stops it; `place(x,z)` teleports; `face(x,z)` aims it.

## HUD

`createHud(game)` exposes `objective(text)`, `prompt(label)`, `say(text, dur)`,
`setClockStart(minutes)`, `clock(seconds)`, `camera(on)`, `qte(text)`, `ending(title, subtitle)`,
`show(id)`, `hide(id)`.

`qte(text)` shows the centered key-sequence box (`#qte`); pass `null` to hide it. `qte`/`cam` are
the two HUD hooks the beer scene uses.

`formatClock(startMinutes, seconds)` advances one game minute per 6 real seconds and wraps at
midnight; keep it in sync with the start values in `LEVELS`.

## NightMart mission (`src/levels/konbini`)

Layout: store floor `x -8..8, z -6..6`; staff room `x 3..8, z -10..-6`; parking `z 6..15`;
automatic door at `x 4.5, z 6`. Player spawns `(4.5, 13)` facing north.

Story stages (`F.stage`), in order:

1. `undefined` → clock in at `refs.timeClock` (sets `clockedIn`).
2. `restock` → pick a box at `refs.boxes`, fill each of the 3 `refs.slots` (`F.restocked` 0→3).
   The box pickup is only offered when not carrying; an empty shelf is offered but does nothing.
3. `phone` → `refs.phone` is only usable while `phoneRinging`; answering sets `phoneAnswered`,
   then the caller's five lines play.
4. `customers` → `refs.register` is only usable while `customerWaiting`; two customers
   (salaryman, then the veiled woman) walk in and must be served (`F.served`).
5. `trash` → take `refs.trashBag` (only when not carrying) and use `refs.dumpster`.
6. `monitor` → use `refs.monitor`; triggers the CCTV shot on `world.secCam`.
7. `end` → input off, CCTV for 3.2 s, then face the lurker (or 6 s timeout) → jumpscare →
   `end('END OF SHIFT', ...)`.

Door: `world.update` opens `refs.door` when any mover is within 2.2 m of `(4.5, 6)` and fires
`onOpen` once per approach (story wires it to the chime).

## Central de Abasto mission (`src/levels/ceda`)

Geometry (`src/levels/ceda/world.js`):

- `ROWS = { A: -38, B: -21, C: 10, D: 27 }` (storefront z), `UNIT_X` 12 positions per row,
  `PASILLOS = [-30, 0, 30]`, `SEGMENTS = [[-27,-3],[3,27]]`, `DOCK = 2.5`, `EXIT_Z = -52`.
- `unitAt(id)` maps `"B-4"` to `{x, z}`; ids are `<row>-<1..12>`.
- Key storefronts: `B-4` seller (closed), `B-2/A-8/C-5` consumer counters,
  `A-3/C-9/B-11` diablero pickups.
- Key trucks: `d1` (row C, red), `d2` (row A, blue), `d3` (row D, white), `seller` (row B).
- `refs.rotulista.pickup` is the pancarta stand in Pasillo 3, local 3; `refs.pancartaDrop` is the
  empty frame over the B-4 counter; `refs.pancartaPlaced` appears after delivery.
- `SHRINE_SPOTS` (exported) are the open-air candidates for the diablero's shrine; tests check all
  of them are free and reachable. `FIRE_SPOT` is the clear plaza spot for the beer scene, and the
  test also checks its camera offset.
- Player spawns `(0, 33)` facing north toward the Eje 5 Sur gate.
- `refs.lamps` flicker while powered; `setPower(false)` is the blackout.
- Four AM crowd patrols loops; a squeak hook is removed once `F.stage` is `finale`, `ghost`,
  `fight` or `beer`.

Character speeds: diablero 0.9, seller 1, consumer 1.05. Seller and Consumer end in the shared
finale; the Diablero has its own end-of-shift ghost encounter.

The three routes are **distinct jobs, not a hierarchy**: diablero (loader), seller (bodega
operator) and consumer (shopper). Write and speak about them that way — no role is "lower" or
"higher" than another. The diablero is also not gender-locked: man, woman and nonbinary are all
valid (`DIABLERO_VARIANTS` in `story.js`), selected from the `menu-variants` card and passed as
`ctx.variant`. Dialogue should stay neutral or follow the player's choice.

### Diablero

- Grab `refs.diablito` at `(1.8, 31)` → `F.hasCart`.
- Three jobs (`F.job` 0→2, `F.delivered` counts completed):
  `A-3 → d1`, `C-9 → d2`, `B-11 → d3`.
- Loading requires the cart and no visible load; it sets `player.speedScale = 0.7`.
- Delivering hides the load, restores `0.9`, increments `delivered`.
- A pickup/truck only offers its label for the active job and correct load state, so the same
  load cannot be re-picked after delivery.
- After the haul, `F.stage = 'pancarta'`: park the cart, run to `refs.rotulista.pickup` in
  Pasillo 3, local 3, and take the pancarta. `refs.pancartaDrop` at B-4 is the delivery target.
  `F.pancartaDeadline` is 75 s; missing it ends with `SE TE FUE EL TRÁILER`.
- Picking up the pancarta starts **Flow**: `player.speedScale = 2.7` (0.9 × 3), a bocina on the
  camera, and `sfx.flow(true)`. It lasts until the sign is hung (or the phase ends), so the whole
  return run is at x3.
- At the end of the shift, `F.ghostReady` gates the choice interactions:
  - **Fight** (`F.stage = 'fight'`): `SHRINE_SPOTS` (exported by `world.js`) is filtered to spots
    more than 15 m away and picked with `mulberry32(game.seed)`. Reaching within 2.2 m wins;
    the ghost catches within 1.2 m. Peels are picked with E, dropped behind with Q, and slow the
    ghost from 2.8 to 1.1 m/s for 1.6 s.
  - **Beer** (`F.stage = 'beer'`): a fire scene on a cinematic camera, then `WAKE_SEQUENCE`
    (`W A S D W D A S`). Each correct key gets 3 s; a wrong sequence key or a timeout loses.
    `F.qte` exposes `{ active, index, length }` for tests.
- `F.ghost` is the ghost NPC; `F.peels` and `F.droppedPeels` expose the peel state.
- Endings: `LE GANASTE AL FANTASMA`, `TE ALCANZÓ EL FANTASMA`, `AMANECISTE`, `TE DORMISTE`,
  and `SE TE FUE EL TRÁILER`.

### Seller

- Raise `refs.units['B-4'].cortina` (`target = 1`; `world.update` rolls it at 0.7/s).
- `F.stage = 'stock'`: take a sack from `refs.trucks.seller` (only when empty-handed) and place
  it on each of the 3 `refs.pallets` (`F.stocked` 0→3). Empty pallets say "Tarima vacía" and do
  nothing.
- `F.stage = 'sell'`: `refs.scale` is only usable while `customerWaiting`; serve the buyer then
  the woman. Standing still through the finale gets caught.

### Consumer

- Holds a bag; shopping list is `B-2` chiles, `A-8` frijol, `C-5` mole.
- Each counter is usable once; purchases tick the objective list and grow the bag.
- After all three, a vendor line plays and the finale begins.

### Seller/Consumer shared finale

`F.stage = 'finale'`; after 1.5 s the power dies, the crowd despawns, and the phone flashlight
turns on (intensity 40). A ghost spawns 18 m behind the player. One per-tick hook decides:

- `player.pos.z < EXIT_Z` → **escaped**.
- distance < 1.3 → **caught**.
- if `player.facing(ghost) > 0.6 && dist < 28` → she freezes and faces you.
- otherwise she chases: speed `dist > 16 ? 6 : 2.9`.
- every 7 s the flashlight blinks off for 0.3 s; if she is farther than 12 m she teleports to
  9 m behind the player.

Caught → `jumpscare` + `end('TE ALCANZÓ', ...)`. Escaped → fade out + `end('SALISTE DE LA
CENTRAL', ...)`. The ghost only moves while unobserved, so looking back is a real mechanic.

## Testing

`npm test` is the gate. Vitest runs in Node with `tests/setup/canvas.js` stubbing `<canvas>`, so
levels build without WebGL. `tests/helpers/harness.js` runs the real story, scheduler, world,
player and NPCs with a silent `sfx` and a fake HUD.

Harness API:

```js
const h = createHarness('ceda', 'seller');
const h = createHarness('ceda', 'diablero', { seed: 1, variant: 'woman' });
h.step(dt = 0.1);                 // one tick
h.press('KeyW');                  // tap a key for one tick (QTE tests)
await h.run(done, { maxTime = 900, dt = 0.1, onStep });
h.available();                    // interactions whose label() is truthy right now
h.useAvailable(filter?);          // press E on all available interactions
h.input;                          // the fake input (pressed/keys sets)
h.ctx;                            // the story ctx, including seed/variant/input
h.log;                            // { subtitles, objectives, used, ending }
```

`run` yields to the event loop every tick, rethrows story errors, and fails on timeout with the
current objective. **`maxTime` is absolute game time**, not a duration: after a long haul, use
`maxTime: h.game.time + 20`. `reachableCells(colliders, bounds, start, cell)` returns free cells
reachable on foot using the player radius; `nearestDistance(cells, x, z)` and
`worldPosition(object)` are the companions used by `tests/integration/levels.test.js`
(`REACH = 2.0` against a 2.3 m reach).

Pitfalls:

- `useAvailable()` presses **everything** available, including no-op labels like "Tarima vacía"
  or "Empty shelf". Do not pass it as `onStep` when a test needs to assert that an interaction is
  gated or that using it does nothing — call the specific interaction's `use()` instead.
- `useAvailable()` also picks up and hangs the pancarta for the diablero as soon as those labels
  appear. To test the run itself, stop at `F.stage === 'pancarta'` and call the pickup/drop
  interactions manually.
- Interactions are only registered once the story reaches the code that registers them. For
  `ceda`, advance past the intro (`hud.current` contains the first objective) before looking for
  character interactions. The diablero ghost choice appears only after the end-of-shift dialogue,
  so wait for `F.ghostReady`; the shrine chase is live at `F.fightReady`.
- `h.run` stops before `onStep` runs when `done()` is already true, so a condition like
  `F.stage === 'restock'` leaves the next interactions untouched.
- Keep story code DOM-free or the harness cannot run it.

Existing coverage: scheduler semantics, collision/movement (including x3 flow sub-stepping),
raycast gating/occlusion, builder power/colliders, NPC walking, clock, textures, seeded RNG, CEDA
layout invariants, every mission target and shrine spot reachable, the diablero pancarta/Flow and
both ghost branches (win and lose), all three presentations, and full playthroughs of NightMart
and the Seller/Consumer shared finale (both endings).

When adding a level: `world.js` + `story.js`, register in `LEVELS`, add a menu card in
`index.html`, add a story autoplay test, and add every new interactable to the reachability test.

## Conventions

- Plain ES modules, 2-space indent, single quotes.
- `lam()` / `basic()` for every Three.js material.
- Procedural assets only; no copied art/audio/names; Central de Abasto businesses stay fictional.
- Pin dependency versions exactly, at least 7 days old.
- Small, focused commits with Conventional Commit messages; no AI attribution.
