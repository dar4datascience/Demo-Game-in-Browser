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

Three.js + Vite, plain ES modules, no runtime dependencies beyond `three`. Two playable maps plus
one showcase:

- **NightMart** (`konbini`): 11:40 PM convenience-store shift. One scripted mission.
- **Central de Abasto** (`ceda`): 4:10 AM Iztapalapa market. Three characters (diablero, seller,
  consumer), each with its own mission, all sharing one blackout-chase finale.
- **Ciudad de México** (`cdmx`): non-playable night-city showcase; `story.js` drives a 10-shot
  camera tour of the seven reference shots — angel, metro, abarrotes, park, biblioteca,
  library, torre (`?shot=N` plays one shot) used for `docs/cdmx-night.mp4`.

Everything is procedural: canvas textures, skinned low-poly people, WebAudio. No copied assets or
real business names.

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
src/engine/post.js          render pipeline, lam()/basic()/phong() materials (PS1 vertex snapping)
src/engine/textures.js      canvas textures, blotch()/grime() wear helpers, seeded rand()
src/engine/audio.js         WebAudio Sfx (beeps, chimes, squeaks, stingers, tension, flow, fire, lofi)
src/engine/music.js         pure lofi/cumbia patterns, MIDI helpers and step timing
src/engine/input.js         keys/pressed/mouse, pointer lock
src/game/scheduler.js       createGame: game-time, waiters, hooks, flags, seed
src/game/rng.js             mulberry32 seeded PRNG + randomSeed
src/game/player.js          Player movement, collision, held items, flashlight
src/game/interaction.js     raycast interactions with label gating + occlusion
src/game/hud.js             objective/prompt/subtitle/clock/camera/ending
src/game/director.js        story helpers: spawn/despawn/say/power/flicker/jumpscare + GHOST
src/world/builder.js        createBuilder: meshes, oriented colliders, pooled lights, halos,
                            chamferedBox(), bakeAO(), power
src/world/batch.js          static geometry merging + light budget helpers for draw calls
src/world/person.js         skinned-humanoid NPCs (13-bone rig) + walk/face/update/lookAt
src/world/propkit.js        shared low-poly prop kit + soft light-shaft cones
src/levels/index.js         LEVELS registry
src/levels/konbini/         world.js, story.js
src/levels/ceda/            world.js, props.js, story.js
src/levels/cdmx/            world.js, props.js (incl. wetGround), story.js — showcase, not playable
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

- Walk 4.2 m/s, run 6.8 m/s (Shift), both multiplied by `player.speedScale`. The diablero's Flow
  sets `speedScale = 1.6`; movement is sub-stepped at 0.15 m so that speed cannot tunnel through
  thin walls.
- Diagonal movement is normalized (no diagonal speed boost).
- Collision: oriented boxes `{ cx, cz, hx, hz, rot }`, resolved per axis by `resolveCircle`.
  `circleHits(x, z, collider, radius)` is the predicate tests reuse for reachability.
- `forward()` is `(-sin yaw, 0, -cos yaw)`; yaw 0 faces north (-z). It returns a shared scratch
  vector: use it immediately, never keep the reference.
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
  oriented collider `{cx,cz,hx,hz,rot:ry}` (also returned as `mesh.userData.collider`) and
  optionally an occluder.
- `plane(...)` is visual only (no collision).
- `light(..., onGrid=true)` registers a light; only the nearest `poolSize` (8) are copied into the
  real PointLight pool each frame, so authored lamps never cost 20 lights per fragment.
- `setPower(false)` kills grid lights and swaps glow colors; `powered` reflects state.
- `addBounds(minX,maxX,minZ,maxZ)` adds a wall collider.
- Materials must come from `lam()` / `basic()` in `engine/post.js` so PS1 vertex snapping applies.
- `batchWorld(scene, refs, { occluders })` (in `world/batch.js`) merges static geometry by material
  after the level is built: everything referenced from `refs` keeps its identity, and each
  referenced group is merged internally. Call it at the end of `buildWorld`, replace
  `b.occluders` with the returned merged occluders, and mark any hidden/animated subtree
  `userData.noBatch`. This is what keeps the A–Z market at ~140 draw calls instead of ~900.
- Signs use one shared atlas (`T.signAtlas` + `T.setUV`), so hundreds of bodega signs are one call.

## Director and NPCs

`createDirector(ctx)` returns:

- `spawn(opts, x, z)` → `NPC` in the scene and `game.npcs`; `despawn(npc)` removes it.
- `say(text, dur)` → `hud.say`.
- `power(on)` → `world.setPower` + `sfx.setPower`.
- `flicker([[on, dur], ...])` → toggles power with game-time waits.
- `jumpscare(npc)` → input off, NPC snaps in front of the player, stinger/flash/shake, waits
  1.4 s, fades, waits 1.6 s. Caller decides the ending.
- `GHOST` look: pale, long hair, hollow eyes, slightly short.

### People (`src/world/person.js`)

`makePerson(opts)` builds a smooth-skinned humanoid: one `THREE.SkinnedMesh` for the body (torso,
limbs, hands, shoes — welded tube geometry with blended weights across shoulders/elbows/hips/knees)
plus a head mesh on the head bone, all deforming a shared 13-bone skeleton (hips → spine → chest →
neck → head; shoulderL/R → elbowL/R → hand; hipL/R → knee → foot). Materials come from a cached
painted atlas per look (face, cloth folds, skin) with a small emissive floor and a fresnel rim —
never rely on flat emissive for readability. Every skinned mesh sets `userData.noBatch` so
`batchStatic` leaves it alone; geometry/materials are cached per look key, so crowds are cheap.

Options (all optional, legacy keys still work):

- Legacy: `skin`, `top`, `bottom`, `hair`, `longHair`, `veil`, `dress`, `height`, `emissive`,
  `hollow` (hollow = black sockets/mouth for the ghost).
- New: `outfit` (`'tee'|'hoodie'|'jacket'|'apron'|'suit'|'uniform'|'dress'`), `build`
  (`'slim'|'average'|'heavy'` scales limb/torso width), `figure` (`'masc'|'femme'` — skirt vs
  trousers under outfits), `hairStyle` (`'short'|'long'|'bob'|'bun'|'cap'|'bald'`; `longHair`
  maps to `'long'`), `glasses`, `cap`/`hat` (alias), `pose` (`'stand'|'sit'|'present'|'hold'`).

Returns `{ root, legs, arms, head, rig }` where `legs`/`arms`/`head` are the **bones** (thighL/R,
uarmL/R, head) — story code rotates them directly (`legs[i].rotation.x`, `head.rotation.z`) and
`root.add(...)` still works for attachments. `rig` exposes the full bone map, `skeleton`, `mesh`,
`headMesh`, `shins`, `forearms`, `chest`, `neck`, `spine`, `hips` and `base` rest rotations.

`NPC` (director `spawn`) adds `walk(points, speed)` → promise, `place(x,z)`, `face(x,z)`, `pos`,
and `update(dt)` which runs the walk cycle (legs swing with knee flex, arms counter-swing with
elbow flex, hip bob), idle breathing/weight shift, and head look-at. `lookAt(target, lift)` /
`lookAtPlayer(player)` ease the head bone toward a point within ~6 m (yaw ±40°, pitch capped);
they only write `rotation.x/y`, so story `rotation.z` head tilts survive. Clearing works by
calling `lookAt(null)`.

### Props and environment (`src/world/propkit.js`)

Shared low-poly prop kit, all batch-mergeable through `kitMats` (module-cached `lam()`/`basic()`
materials shared with the level sets): `bucket`, `pot`, `bottle`, `bottleCrate`, `stool`, `tire`,
`taped box` (`box(w,h,d,{open,tint})`), `sack`, `crateSlats`, `fence` (alpha-tested chain-link),
`plasticCrate`, `table`, `tarpPile`, `cone` (traffic). Geometry is tapered cylinders / lathe /
`chamferedBox` with `bakeAO` vertex tinting and `blotch`/`grime` canvas wear. Keep new clutter
off paths: only add colliders where a similar prop already has one, and the reachability test in
`tests/integration/levels.test.js` must stay green.

Wet ground and light: `phong()` (in `post.js`) is the lit material with specular — CDMX
`wetGround()` (in `levels/cdmx/props.js`) merges puddle decals + additive reflection streaks into
3 draw calls. `PK.shaftCone(color, h, r, opacity)` / `PK.shaftMat` make soft volumetric cones: a
tiny shared shader feathers alpha by view angle and fades apex→floor, `depthWrite:false`, additive —
use for lamp spills and window shafts, never hard-edged cone geometry. Builder `light()` already
adds a camera-facing halo quad per lamp (one merged mesh, `aLevel` attribute dims with power).

### Render profile

`RENDER_HEIGHT = 360` in `post.js` is the default internal target; `?renderH=N` overrides it per
URL. Levels can return `render: { height, photo }` from `buildWorld` — the CDMX showcase uses
`{ height: 480, photo: true }` (photo mode dials grain/CA/monitor artifacts down). `snap` grid and
bloom thresholds live in the same file; keep face/cloth emissive low or highlights bloom into
white blobs.

## HUD

`createHud(game)` exposes `objective(text)`, `prompt(label)`, `say(text, dur)`,
`setClockStart(minutes)`, `clock(seconds)`, `camera(on)`, `qte(text)`, `ending(title, subtitle)`,
`show(id)`, `hide(id)`.

`qte(text)` shows the centered key-sequence box (`#qte`); pass `null` to hide it. `qte`/`cam` are
the two HUD hooks the beer scene uses.

`formatClock(startMinutes, seconds)` advances one game minute per 6 real seconds and wraps at
midnight; keep it in sync with the start values in `LEVELS`.

## Music and audio

Everything is synthesized; there are no audio files. `src/engine/music.js` holds the pure patterns
and `audio.js` turns them into nodes.

- **Lofi bed** (`Sfx.startLofi`, started by `startAmbience`): 68 BPM, 4-bar Dm9–Bbmaj9–Gm9–A7b9
  progression, detuned triangle pads (`pad()`), sine bass, soft kick/rim/hat, and a filtered vinyl
  crackle. It runs through a 1400 Hz low-pass and an 85 Hz high-pass at `lofiBase = 0.8`.
- **Tension ducking**: `setTension(v)` lowers the lofi bed to `lofiBase * (1 - v * 0.6)`, so the
  bed recedes during the phone call and the chase.
- **Sonidera cumbia** (`Sfx.flow`): 92 BPM, 16th-note grid, Am–F–C–G. Kick `[0,6,8]`, clap
  `[4,12]`, guiro on even steps, shaker on odd steps, tumbao root/fifth/octave bass, organ stabs on
  `[2,6,10,14]`, and an accordion-style `reed()` lead with a short echo. It runs through
  `cumbiaBus` (high-pass 55, low-pass 6500) at 0.7.
- **Flow ducking**: `flow(true)` drops the lofi bed to 18% and starts the cumbia; `flow(false)`
  restores it to the tension-adjusted level and fades the cumbia bus to 0.
- **Sequencer**: `startSequencer(bpm, stepsPerBeat, fn)` schedules with a 25 ms timer and a 0.2 s
  lookahead. `tone`/`noise` accept `when` (absolute AudioContext time) and `dest` (bus/filter).
- **Master**: `init()` puts a `DynamicsCompressorNode` between `out` and the destination.
- `silence()` clears both sequencers and fades `out`; call it before every ending.

Tests for the patterns live in `tests/unit/music.test.js`; the browser exposes `sfx` on `window`
under `?debug` so the lofi/flow gains and timers can be inspected.

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

Geometry (`src/levels/ceda/world.js`), compressed from the real CEDA organisation:

- 26 lettered rows, A north to Z south, in 13 letter-pair naves (`NAVES`). Each nave is two rows
  facing one pedestrian **andador** (`AISLE = 7` m); a **street** (`STREET = 7`) with the loading
  andenes separates naves, on a `PITCH = 28` m grid. Bodega bodies are `DEPTH = 7` (real ones are
  20 m).
- `UNIT_X` / `UNIT_W`: 12 bodegas per row, numbered 1..12 west to east. `unitAt(id)` returns
  `{ x, z, face, w }`; `ROWS[letter]` is the storefront z and `ROW_FACE[letter]` is `+1` when the
  shop faces south (+z) and `-1` when it faces north. Props in front of a shop use
  `z + face * d`, never `z + d`.
- `PASILLOS = [-52, -26, 0, 26, 52]`, `PASILLO_W = [6, 10, 6, 6, 6]`: five numbered walkways that
  cut through every row. Pasillo 2 is the main artery, has the wide deck, and carries the bridge.
- `BRIDGE = { x: -26, z: streetZ(4), hx: 5, hz: 4.5 }`: the pasillo 2 bridge between the abarrotes
  (A–H) and the vegetable halls (I–Z). Crossing it during Flow shakes the camera and rattles the
  cart.
- `EXIT_Z = -23`, `NORTH_Z = -22` (Eje 5 Sur gate wall with a 10 m gap at pasillo 2), `SOUTH_Z =
  356` (Eje 6 Sur). `SPAWN = [-26, -18]`, facing south into the market.
- Key storefronts: `B-4` seller (closed), `B-2/A-8/C-5` consumer counters,
  `A-3/C-9/B-11` diablero pickups.
- Key trucks: `d1` (row A's andén, north street), `d2` (row C), `d3` (row B), `seller` (row B).
- `refs.rotulista.pickup` is the pancarta stand in Pasillo 3, local 3, at `aisleZ(6)`;
  `refs.pancartaDrop` is the empty frame over the B-4 counter; `refs.pancartaPlaced` appears after
  delivery.
- `SHRINE_SPOTS` (exported) are the open-air candidates for the diablero's shrine; tests check all
  of them are free and reachable. `FIRE_SPOT` is the clear plaza spot for the beer scene, and the
  test also checks its camera offset.
- `refs.solid` lists every prop that owns a collider (`obj.userData.collider`); the level test
  checks each footprint against the prop's local geometry size.
- `refs.lamps` flicker while powered; `setPower(false)` is the blackout.
- Five AM crowd patrols loops; a squeak hook is removed once `F.stage` is `finale`, `ghost`,
  `fight` or `beer`.

Character speeds: all routes use `speed: 1` (the 4.2/6.8 m/s base). Seller and Consumer end in the
shared finale; the Diablero has its own end-of-shift ghost encounter.

The three routes are **distinct jobs, not a hierarchy**: diablero (loader), seller (bodega
operator) and consumer (shopper). Write and speak about them that way — no role is "lower" or
"higher" than another. The diablero is also not gender-locked: man, woman and nonbinary are all
valid (`DIABLERO_VARIANTS` in `story.js`), selected from the `menu-variants` card and passed as
`ctx.variant`. Dialogue should stay neutral or follow the player's choice.

### Diablero

- Grab `refs.diablito` near the Eje 5 Sur gate → `F.hasCart`.
- Three jobs (`F.job` 0→2, `F.delivered` counts completed):
  `A-3 → d1`, `C-9 → d2`, `B-11 → d3`.
- Loading requires the cart and no visible load; it sets `player.speedScale = 0.75`.
- Delivering hides the load, restores `1`, increments `delivered`.
- A pickup/truck only offers its label for the active job and correct load state, so the same
  load cannot be re-picked after delivery.
- After the haul, `F.stage = 'pancarta'`: park the cart, run to `refs.rotulista.pickup` in
  Pasillo 3, local 3 (at `aisleZ(6)`, a real walk across the market), and take the pancarta.
  `refs.pancartaDrop` at B-4 is the delivery target. There is **no timer before the pickup**.
- Picking up the pancarta starts **Flow**: `player.speedScale = 1.6`, a bocina on the camera, and
  `sfx.flow(true)`. `F.flowEnd = game.time + FLOW_SECONDS` (70), exposed on the HUD bar
  (`hud.flow(seconds, total)`); the whole run must be finished within those 70 s or the shift ends
  with `SE TE FUE EL TRÁILER`. Crossing `BRIDGE` during Flow shakes the camera and rattles the cart.
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
`maxTime: h.game.time + 20`. `reachableCells(colliders, bounds, start, cell = 1)` returns free
cells reachable on foot using the player radius (colliders are bucketed in an 8 m grid first, so
the 144 × 376 m market still runs in under a second); `nearestDistance(cells, x, z)` and
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

Existing coverage: scheduler semantics, collision/movement (including flow-speed sub-stepping),
raycast gating/occlusion, builder power/colliders/halos, skinned-person contract (weights, budgets,
poses, look-at clamps, GHOST), propkit budgets/finite geometry, NPC walking, clock, textures,
seeded RNG, music patterns, CEDA
layout invariants (26 rows, 13 naves, pasillo numbering, prop collider footprints), every mission
target and shrine spot reachable, the diablero pancarta/Flow 70 s window and both ghost branches
(win and lose), all three presentations, and full playthroughs of NightMart and the
Seller/Consumer shared finale (both endings).

When adding a level: `world.js` + `story.js`, register in `LEVELS`, add a menu card in
`index.html`, add a story autoplay test, and add every new interactable to the reachability test.

## Conventions

- Plain ES modules, 2-space indent, single quotes.
- `lam()` / `basic()` / `phong()` for every Three.js material.
- Procedural assets only; no copied art/audio/names; Central de Abasto businesses stay fictional.
- Pin dependency versions exactly, at least 7 days old.
- Small, focused commits with Conventional Commit messages; no AI attribution.
