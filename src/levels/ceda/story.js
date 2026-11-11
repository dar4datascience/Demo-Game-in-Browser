import * as THREE from 'three';
import { lam } from '../../engine/post.js';
import { lonaTex } from '../../engine/textures.js';
import { createDirector, GHOST } from '../../game/director.js';
import { mulberry32 } from '../../game/rng.js';
import { makeDiablito, sackStack, hitbox, makePancarta, makeBocina, makePeel, makeBeer, makeShrine, makeFire, crate } from './props.js';
import { ROWS, ROW_FACE, unitAt, EXIT_Z, SPAWN, SHRINE_SPOTS, FIRE_SPOT, BRIDGE, NORTH_Z, SOUTH_Z, aisleZ } from './world.js';

// Every route walks at the same base speed; the loaded diablito is the only real slowdown.
export const CHARACTERS = {
  diablero: { label: 'Diablero', speed: 1 },
  seller: { label: 'Seller', speed: 1 },
  consumer: { label: 'Consumer', speed: 1 },
};
// The pancarta run: picked up at the rotulista, then 70 seconds to hang it at B-4.
export const FLOW_SECONDS = 70;

const PEOPLE = {
  diablero: { top: '#8a2a1e', bottom: '#2f3a4a', skin: '#a8754f', hair: '#141210', outfit: 'jacket', figure: 'masc' },
  cargador: { top: '#c9b48a', bottom: '#33302a', skin: '#9c6a46', hair: '#101010', outfit: 'hoodie', build: 'heavy', hairStyle: 'short', figure: 'masc' },
  vendor: { top: '#f2f2ee', bottom: '#2a2a2a', skin: '#b98560', hair: '#1a1410', outfit: 'apron', hairStyle: 'bun', figure: 'masc' },
  vendora: { top: '#7a3e6a', bottom: '#3a2a2a', skin: '#b07850', hair: '#2a2a2a', longHair: true, dress: true, outfit: 'dress', build: 'slim', figure: 'femme' },
  buyer: { top: '#2f5d8a', bottom: '#2a2c33', skin: '#c08a60', hair: '#1a1410', outfit: 'tee', hairStyle: 'bob', figure: 'masc' },
  woman: { top: '#4a4f3e', bottom: '#2a2a2a', skin: '#d8c2ae', hair: '#0b0b0b', longHair: true, veil: true, dress: true, outfit: 'dress', build: 'slim', figure: 'femme' },
};

// The diablero can present as a man, a woman or nonbinary; the work clothes stay the same.
export const DIABLERO_VARIANTS = {
  man: { ...PEOPLE.diablero },
  woman: { ...PEOPLE.diablero, top: '#7a2a3e', longHair: true, figure: 'femme' },
  nonbinary: { ...PEOPLE.diablero, top: '#6a2a5a', hair: '#2a2a2a' },
};

// Keys the player presses, in order, to stay awake by the fire.
export const WAKE_SEQUENCE = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyW', 'KeyD', 'KeyA', 'KeyS'];

const GHOST_DIABLERO = { ...GHOST, top: '#8a2a1e', bottom: '#2f3a4a', dress: false, outfit: 'jacket', figure: 'masc' };

function sit(npc) {
  npc.legs.forEach((l) => (l.rotation.x = -1.1));
  npc.arms.forEach((a) => (a.rotation.x = -0.5));
  npc.root.position.y = -0.28;
  npc.update = () => {};
}

const keyName = (code) => code.replace('Key', '');
const displaySequence = (seq, at) => seq.map((k, i) => (i < at ? '✓' : i === at ? keyName(k) : '·')).join(' ');

// People going about the 4 AM shift: [look, loop waypoints, speed, pushes a diablito].
const CROWD = [
  [PEOPLE.diablero, [[-26, -6], [-26, 168]], 1.5, true],
  [PEOPLE.cargador, [[-52, 140], [-52, 6]], 1.4, false],
  [PEOPLE.diablero, [[-68, -1.2], [-6, -1.2]], 1.3, true],
  [PEOPLE.buyer, [[0, 60], [0, 30], [58, 30], [58, 60]], 1.3, false],
  [PEOPLE.vendora, [[4, 60], [48, 60]], 1.1, false],
];

export async function runStory(ctx) {
  const { game, world, hud, sfx, player, scene, interact, end, character, input, variant = 'nonbinary' } = ctx;
  const R = world.refs, F = game.flags;
  const d = createDirector(ctx);
  const { spawn, despawn, say } = d;
  const label = CHARACTERS[character].label;
  const rng = mulberry32(game.seed);
  const look = DIABLERO_VARIANTS[variant] ?? DIABLERO_VARIANTS.nonbinary;
  F.variant = variant;

  player.spawn(SPAWN[0], SPAWN[1], Math.PI);
  player.speedScale = CHARACTERS[character].speed;
  sfx.traffic();

  const withCart = (npc) => {
    const cart = makeDiablito();
    cart.position.set(0, 0, 0.7);
    cart.rotation.x = -0.45;
    cart.userData.load.visible = true;
    npc.root.add(cart);
  };
  const patrol = async (npc, points, speed) => {
    while (npc.root.parent) await npc.walk(points, speed);
  };
  for (const [look, points, speed, cart] of CROWD) {
    const npc = spawn(look, ...points[0]);
    if (cart) withCart(npc);
    patrol(npc, points.slice(1).concat([points[0]]), speed);
  }
  // Squeaky wheels nearby sell the place.
  let squeakAt = 0;
  game.hooks.push(() => {
    if (['finale', 'ghost', 'fight', 'beer'].includes(F.stage)) return true;
    if (game.time > squeakAt && game.npcs.some((n) => n.root.children.length > 1 && n.pos.distanceTo(player.pos) < 7)) {
      sfx.squeak();
      squeakAt = game.time + 1.2 + Math.random();
    }
  });

  game.fadeTo(0, 3);
  await say('4:10 AM. Central de Abasto, Iztapalapa.', 3.5);
  const route = await { diablero, seller, consumer }[character]();
  if (route !== 'done') await finale();

  // --- Diablero: haul three loads, fetch the pancarta, then face the ghost -------------------
  async function diablero() {
    const cart = makeDiablito();
    const load = cart.userData.load;
    const bocina = makeBocina();

    const startFlow = () => {
      if (F.flow) return;
      F.flow = true;
      F.flowEnd = game.time + FLOW_SECONDS;
      player.speedScale = CHARACTERS.diablero.speed * 1.6;
      bocina.position.set(0.55, -0.62, -1.05);
      bocina.rotation.set(0.1, -0.5, 0);
      bocina.scale.setScalar(0.7);
      player.camera.add(bocina);
      sfx.flow(true);
      hud.objective(`¡Flow! Lleva la pancarta a Bod. B-4. Tienes ${FLOW_SECONDS} s.`);
      hud.flow?.(FLOW_SECONDS, FLOW_SECONDS);
    };
    const stopFlow = () => {
      if (!F.flow) return;
      F.flow = false;
      player.speedScale = CHARACTERS.diablero.speed;
      bocina.removeFromParent();
      sfx.flow(false);
      hud.flow?.(null);
    };

    hud.objective('Agarra tu diablito (junto a la puerta del Eje 5 Sur).');
    interact(R.diablito, () => (F.hasCart ? null : 'Agarrar el diablito'), () => {
      F.hasCart = true;
      R.diablito.visible = false;
      player.hold('diablito', cart, [0, -1.25, -1.6], [0.75, Math.PI, 0]);
      sfx.squeak();
    });
    const jobs = [
      ['A-3', 'd1', 'la camioneta roja del andén norte'],
      ['C-9', 'd2', 'la camioneta azul del andén de la C-D'],
      ['B-11', 'd3', 'la camioneta blanca del andén de la A-B'],
    ];
    F.delivered = 0;
    // A job is active only until it's delivered (no re-loading the same pickup during the driver's lines).
    const active = (i) => F.job === i && F.delivered === i;
    jobs.forEach(([pickup, truck], i) => {
      interact(R.pickups[pickup], () => (active(i) && F.hasCart && !load.visible ? 'Cargar los bultos' : null), () => {
        load.visible = true;
        player.speedScale = 0.75;
        sfx.thud();
      });
      interact(R.trucks[truck], () => (active(i) && load.visible ? 'Descargar en la camioneta' : null), () => {
        load.visible = false;
        player.speedScale = CHARACTERS.diablero.speed;
        F.delivered = i + 1;
        sfx.thud();
        if (i < 2) sfx.coins();
      });
    });
    const driver = (key) => {
      const t = R.trucks[key].position;
      const npc = spawn(PEOPLE.cargador, t.x + 1.9, t.z + 1.2);
      npc.face(t.x, t.z - 3);
      return npc;
    };
    driver('d1');
    driver('d2');

    await game.until(() => F.hasCart);
    for (const [i, [pickup, , where]] of jobs.entries()) {
      F.job = i;
      hud.objective(`Viaje ${i + 1}/3: recoge la carga en la Bod. ${pickup} (${R.units[pickup].name}).`);
      await game.until(() => load.visible);
      hud.objective(`Viaje ${i + 1}/3: llévala a ${where}.`);
      await game.until(() => F.delivered === i + 1);
      hud.objective('');
      if (i === 0) await say('Chofer: Órale, joven. Ahí está su propina.', 3);
      if (i === 1) {
        await say('Chofer: ¿Ya viste? Se están apagando las lámparas del Pasillo 3...', 3.5);
        sfx.setTension(0.4);
        await d.flicker([[false, 0.1], [true, 0.2], [false, 0.08], [true, 0]]);
      }
      if (i === 2) {
        await say('...No hay nadie en esta camioneta.', 3);
        sfx.whisper();
        await say('Una voz: Esa bodega está cerrada desde el temblor, joven...', 4);
      }
    }

    // --- The pancarta run: no timer until the sign is in your hands ------------------------
    player.hold(null);
    F.stage = 'pancarta';
    const letterer = spawn(PEOPLE.vendor, 5.2, aisleZ(6));
    letterer.face(0, aisleZ(6));
    hud.objective('Ve al Pasillo 3, local 3, al fondo del mercado: el rotulista tiene la pancarta de precios.');

    interact(R.rotulista.pickup, () => (F.stage === 'pancarta' && !F.hasPancarta ? 'Recoger la pancarta' : null), () => {
      if (F.hasPancarta) return;
      F.hasPancarta = true;
      R.rotulista.pancarta.scale.setScalar(0.8);
      player.hold('pancarta', R.rotulista.pancarta, [0.12, -0.5, -1.5], [0.02, 0.14, 0]);
      startFlow();
      sfx.thud();
    });
    interact(R.pancartaDrop, () => (F.hasPancarta && !F.pancartaDelivered ? 'Colgar la pancarta' : null), () => {
      if (!F.hasPancarta || F.pancartaDelivered) return;
      F.pancartaDelivered = true;
      player.hold(null);
      R.pancartaPlaced.visible = true;
      stopFlow();
      sfx.coins();
      sfx.thud();
    });

    let lastSec = -1;
    let bridgeDone = false;
    game.hooks.push(() => {
      if (game.ended || F.stage !== 'pancarta' || F.pancartaDelivered) return true;
      if (!F.flow) return false;
      const sec = Math.ceil(F.flowEnd - game.time);
      hud.flow?.(sec, FLOW_SECONDS);
      if (sec !== lastSec && (sec <= 10 || sec % 10 === 0)) {
        lastSec = sec;
        hud.objective(`Lleva la pancarta a Bod. B-4. Flow: quedan ${sec} s.`);
      }
      // The bridge over Pasillo 2 is where loaded diablitos lose control.
      if (!bridgeDone && Math.abs(player.pos.x - BRIDGE.x) < BRIDGE.hx && Math.abs(player.pos.z - BRIDGE.z) < BRIDGE.hz) {
        bridgeDone = true;
        game.shake = 0.9;
        sfx.rattle(1);
        say('¡Aguanta el diablo en la bajada del puente!', 2.5);
      }
      return false;
    });

    await game.until(() => F.hasPancarta);
    say('Rotulista: Ahí está. Que no se te moje, joven.', 2.5);
    await game.until(() => F.pancartaDelivered || game.time > F.flowEnd);
    stopFlow();
    if (!F.pancartaDelivered) {
      player.hold(null);
      sfx.silence();
      end('SE TE FUE EL TRÁILER', `El flow se acabó con ${FLOW_SECONDS} segundos y la pancarta nunca llegó.`);
      return 'done';
    }

    // --- End of shift: the ghost diablero ------------------------------------------------
    F.stage = 'ghost';
    hud.objective('');
    await game.wait(1.5);
    await say('Dejaste la pancarta en su lugar. El turno casi termina.', 3);

    const gx = R.units['B-4'].x + 1.6;
    const gz = ROWS.B + ROW_FACE.B * 3.6;
    const ghost = spawn(GHOST_DIABLERO, gx, gz);
    ghost.face(player.pos.x, player.pos.z);
    F.ghost = ghost;
    const beer = new THREE.Group();
    beer.position.set(gx + 0.9, 0.34, gz + 0.4);
    beer.add(makeBeer());
    beer.add(hitbox(0.7, 0.8, 0.7, 0, 0.2, 0));
    const beerCrate = crate('#7a4a2a');
    beerCrate.position.set(beer.position.x, 0, beer.position.z);
    scene.add(beerCrate, beer);
    hud.objective('El fantasma de un diablero te espera. ¿Peleas con él o compartes una cerveza?');
    await say('Fantasma: Otro diablero... Hace años que nadie se queda hasta el final del turno.', 4);
    await say('Fantasma: ¿Qué dices? ¿Nos vamos a los golpes o nos tomamos una?', 4);

    let chooseResolve;
    const choice = new Promise((resolve) => (chooseResolve = resolve));
    const choose = (kind) => {
      if (F.ghostChoice) return;
      F.ghostChoice = kind;
      chooseResolve(kind);
    };
    interact(ghost.root, () => (F.ghostChoice ? null : 'Pelear con el fantasma'), () => choose('fight'));
    interact(beer, () => (F.ghostChoice ? null : 'Compartir una cerveza'), () => choose('beer'));
    F.ghostReady = true;

    const kind = await choice;
    beer.visible = false;
    beerCrate.visible = false;
    if (kind === 'fight') await fightGhost(ghost);
    else await beerGhost(ghost);
    return 'done';
  }

  // --- Ghost fight: outrun her to a randomly placed Virgen María shrine ----------------------
  async function fightGhost(ghost) {
    F.stage = 'fight';
    const candidates = SHRINE_SPOTS.filter(([x, z]) => Math.hypot(x - player.pos.x, z - player.pos.z) > 15);
    const [sx, sz] = candidates[Math.floor(rng() * candidates.length)] ?? SHRINE_SPOTS[0];
    F.shrine = { x: sx, z: sz };
    const shrine = makeShrine();
    shrine.position.set(sx, 0, sz);
    scene.add(shrine);
    world.addCollider(sx, sz, 0.8, 0.5);
    hud.objective('Corre al santuario de la Virgen María. Recoge cáscaras con E y suéltalas con Q para frenar al fantasma.');
    await say('Fantasma: ¡A ver si sigues corriendo como cuando cargas bultos!', 3);

    F.peels = 0;
    F.droppedPeels = [];
    for (const [dx, dz] of [[-4, 2], [-2, 3], [0, 2], [2, 3], [4, 2], [-3, 4], [3, 4], [0, 5]]) {
      const peel = makePeel();
      peel.position.set(player.pos.x + dx, 0, player.pos.z + dz);
      peel.add(hitbox(0.35, 0.3, 0.35, 0, 0.15, 0));
      scene.add(peel);
      interact(peel, () => (F.peels < 5 ? 'Recoger cáscara' : null), () => {
        if (F.peels >= 5) return;
        F.peels++;
        peel.visible = false;
        sfx.click();
      });
    }

    ghost.place(player.pos.x - 1.5, player.pos.z + 4.0);
    ghost.speed = 4.6;
    let slipUntil = 0;
    const dropPeel = () => {
      if (F.peels <= 0) return;
      F.peels--;
      const peel = makePeel();
      const back = player.pos.clone().addScaledVector(player.forward(), -0.9);
      peel.position.set(back.x, 0, back.z);
      scene.add(peel);
      F.droppedPeels.push({ mesh: peel, used: false });
      sfx.squeak();
    };

    F.fightReady = true;
    const outcome = await new Promise((resolve) => {
      game.hooks.push(() => {
        if (game.ended) return true;
        if (input.pressed.has('KeyQ')) dropPeel();
        if (Math.hypot(player.pos.x - sx, player.pos.z - sz) < 2.2) {
          resolve('shrine');
          return true;
        }
        if (Math.hypot(player.pos.x - ghost.pos.x, player.pos.z - ghost.pos.z) < 1.2) {
          resolve('caught');
          return true;
        }
        for (const peel of F.droppedPeels) {
          if (peel.used) continue;
          if (Math.hypot(ghost.pos.x - peel.mesh.position.x, ghost.pos.z - peel.mesh.position.z) < 1.0) {
            peel.used = true;
            slipUntil = game.time + 1.6;
            sfx.squeak();
          }
        }
        ghost.speed = game.time < slipUntil ? 1.9 : 4.6;
        ghost.path = [[player.pos.x, player.pos.z]];
        return false;
      });
    });

    hud.objective('');
    if (outcome === 'caught') {
      await d.jumpscare(ghost);
      F.ghostDone = true;
      end('TE ALCANZÓ EL FANTASMA', 'El diablero que se quedó en la Central se quedó contigo.');
      return;
    }
    despawn(ghost);
    sfx.setTension(0);
    game.fadeTo(1, 2);
    await say('Llegaste al santuario. El fantasma se detuvo entre las veladoras.', 3);
    F.ghostDone = true;
    sfx.silence();
    end('LE GANASTE AL FANTASMA', 'Corriste más que la muerte y amaneciste para contarlo.');
  }

  // --- Ghost beer: sit by the fire and stay awake through the stories ------------------------
  async function beerGhost(ghost) {
    F.stage = 'beer';
    game.inputEnabled = false;
    ghost.path = [];

    const firePos = new THREE.Vector3(FIRE_SPOT[0], 0, FIRE_SPOT[1]);
    const fire = makeFire();
    fire.position.copy(firePos);
    scene.add(fire);
    const stopFire = sfx.fire();

    const self = spawn(look, firePos.x - 0.8, firePos.z + 0.2);
    self.face(firePos.x, firePos.z);
    sit(self);
    ghost.place(firePos.x + 0.8, firePos.z + 0.2);
    ghost.face(firePos.x, firePos.z);
    sit(ghost);

    const cam = new THREE.PerspectiveCamera(60, player.camera.aspect, 0.05, 30);
    cam.position.set(firePos.x - 3.2, 2.0, firePos.z + 3.2);
    cam.lookAt(firePos.x, 1.0, firePos.z);
    scene.add(cam);
    world.cameras.push(cam);
    game.cam = cam;

    hud.objective('Siéntate junto al fuego. No te duermas.');
    await say('Fantasma: Siéntate. La noche es larga y los dos cargamos lo mismo.', 3.5);
    await say('Diablero: ¿Cómo te llamabas?', 2.5);
    await say('Fantasma: Como tú. Nadie me llamaba por mi nombre.', 3.5);
    await say('Fantasma: Cuéntame una de tus rutas. Yo te cuento la mía.', 3.5);

    let index = 0;
    let deadline = game.time + 3;
    F.qte = { active: true, index, length: WAKE_SEQUENCE.length };
    hud.qte(`MANTENTE DESPIERTO\n${displaySequence(WAKE_SEQUENCE, index)}`);

    const outcome = await new Promise((resolve) => {
      game.hooks.push(() => {
        if (game.ended) return true;
        if (game.time > deadline) {
          resolve('sleep');
          return true;
        }
        if (input.pressed.has(WAKE_SEQUENCE[index])) {
          index++;
          deadline = game.time + 3;
          F.qte.index = index;
          hud.qte(index >= WAKE_SEQUENCE.length ? 'DESPIERTO' : `MANTENTE DESPIERTO\n${displaySequence(WAKE_SEQUENCE, index)}`);
          if (index >= WAKE_SEQUENCE.length) {
            resolve('awake');
            return true;
          }
        } else if ([...input.pressed].some((key) => WAKE_SEQUENCE.includes(key))) {
          resolve('sleep');
          return true;
        }
        return false;
      });
    });

    F.qte.active = false;
    hud.qte(null);
    if (outcome === 'sleep') {
      game.fadeTo(1, 2);
      await game.wait(2);
      stopFire();
      F.ghostDone = true;
      sfx.silence();
      end('TE DORMISTE', 'El fuego se apagó y el fantasma siguió contando su historia sin ti.');
      return;
    }

    stopFire();
    game.inputEnabled = true;
    game.cam = player.camera;
    cam.removeFromParent();
    const camIndex = world.cameras.indexOf(cam);
    if (camIndex >= 0) world.cameras.splice(camIndex, 1);
    sfx.setTension(0);
    await say('Amaneció. El fantasma se desvaneció con la primera luz.', 3.5);
    F.ghostDone = true;
    sfx.silence();
    end('AMANECISTE', 'Sobreviviste la noche y contaste la historia a tus amigos.');
  }

  // --- Seller: open the bodega, stock it, serve two customers --------------------------------
  async function seller() {
    const unit = R.units['B-4'];
    hud.objective('Abre tu bodega: Bod. B-4, Abarrotes La Esperanza (fila B, entre Pasillo 1 y 2).');
    interact(unit.cortina, () => (unit.target === 0 ? 'Subir la cortina' : null), () => {
      unit.target = 1;
      sfx.rattle();
    });
    await game.until(() => unit.roll >= 1);

    F.stocked = 0;
    F.stage = 'stock';
    interact(R.trucks.seller, () => (F.stage === 'stock' && !player.heldKind ? 'Bajar un bulto' : null), () => {
      player.hold('sack', sackStack(1));
      player.held.scale.setScalar(0.7);
      sfx.thud();
    });
    for (const pallet of R.pallets) {
      interact(pallet.mesh, () => (F.stage !== 'stock' || pallet.done ? null : player.heldKind === 'sack' ? 'Acomodar el bulto' : 'Tarima vacía'), () => {
        if (player.heldKind !== 'sack') return;
        pallet.done = true;
        player.hold(null);
        const pile = sackStack(4);
        pile.position.set(pallet.x, 0.3, pallet.z);
        scene.add(pile);
        F.stocked++;
        sfx.thud();
      });
    }
    await game.until(() => {
      hud.objective(`Baja los bultos de la camioneta y acomódalos en las tarimas (${F.stocked}/3).`);
      return F.stocked >= 3;
    });

    F.stage = 'sell';
    interact(R.scale, () => (F.customerWaiting ? 'Pesar y cobrar' : null), () => {
      F.customerWaiting = false;
      F.served = true;
      sfx.beep();
      sfx.coins();
    });
    const { x, z, face } = unitAt('B-4');
    const lane = z + face * 2.4;
    const path = [[x + 7, lane], [x, lane]];
    const leave = [[x + 7, lane], [x + 11, lane]];
    const serve = async () => {
      F.customerWaiting = true;
      hud.objective('Atiende al cliente en la báscula.');
      await game.until(() => F.served);
      F.served = false;
    };

    hud.objective('Espera a los clientes.');
    const buyer = spawn(PEOPLE.buyer, x + 7, lane);
    await buyer.walk(path, 1.1);
    buyer.face(x, z);
    buyer.lookAtPlayer(player);
    await say('Cliente: Buenos días. Medio kilo de frijol y un kilo de arroz.', 3);
    await serve();
    await say('Cliente: Gracias, joven. Que le vaya bonito.', 2.5);
    buyer.walk(leave, 1.1).then(() => despawn(buyer));

    await game.wait(6);
    const woman = spawn(PEOPLE.woman, x + 7, lane);
    woman.head.rotation.z = 0.15;
    sfx.setTension(0.45);
    await woman.walk(path, 0.55);
    woman.face(x, z);
    woman.lookAtPlayer(player);
    await say('...', 2);
    await serve();
    await say('Clienta: Llevo años buscando a mi hijo aquí. Era diablero.', 3.5);
    await say('Clienta: ¿No lo ha visto pasar... esta noche?', 3.5);
    await woman.walk(leave, 0.55);
    despawn(woman);
  }

  // --- Consumer: buy everything on the shopping list ---------------------------------------
  async function consumer() {
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.16), lam({ map: lonaTex('#e4007c') }));
    player.hold('bag', bag, [0.45, -0.52, -0.75], [0.05, -0.4, 0]);
    const list = [
      ['B-2', 'chiles guajillo', '$120', 'Vendedor: Ándele, marchante. Guajillo del bueno, de Zacatecas.'],
      ['A-8', '2 kg de frijol', '$64', 'Vendedor: Dos kilitos de frijol bayo. ¿Algo más?'],
      ['C-5', 'medio kilo de mole', '$90', 'Vendedora: Este mole lo molía mi mamá... desde antes de que se fuera.'],
    ];
    const bought = new Set();
    for (const [id, item, price, line] of list) {
      const { x, z, face } = unitAt(id);
      // The vendor stands beside the counter, in the andador, leaving the customer a clear line.
      const vend = spawn(id === 'C-5' ? PEOPLE.vendora : PEOPLE.vendor, x + 1.2, z + face * 2.2);
      vend.face(x, z);
      vend.lookAtPlayer(player);
      interact(R.counters[id], () => (bought.has(id) ? null : `Comprar ${item} (${price})`), async () => {
        bought.add(id);
        sfx.coins();
        bag.scale.setScalar(1 + bought.size * 0.15);
        await say(line, 3.5);
      });
    }
    await game.until(() => {
      const rows = list.map(([id, item]) => `${bought.has(id) ? '[x]' : '[ ]'} ${item} (Bod. ${id})`);
      hud.objective(['Lista del mandado:', ...rows].join('\n'));
      return bought.size === list.length;
    });
    await game.wait(3.6);
    sfx.whisper();
    await say('Vendedora: Ya váyase, marchante. A esta hora es cuando salen las ánimas.', 4);
  }

  // --- Shared finale: blackout, then reach the Eje 5 Sur gate before she reaches you --------------
  async function finale() {
    hud.objective('');
    F.stage = 'finale';
    await game.wait(1.5);
    d.power(false);
    sfx.thunk();
    sfx.setTension(0.9);
    [...game.npcs].forEach(despawn);
    await say('...¿Se fue la luz en toda la Central?', 3);
    player.flashlight.intensity = 40;
    sfx.click();
    await say('(Prendes la lámpara del celular.)', 2.5);
    hud.objective('Sal de la Central por la puerta del Eje 5 Sur (al norte, por el Pasillo 2).');

    const back = player.pos.clone().addScaledVector(player.forward(), -18);
    const ghost = spawn(GHOST, THREE.MathUtils.clamp(back.x, -70, 70), THREE.MathUtils.clamp(back.z, NORTH_Z + 2, SOUTH_Z - 4));
    let blinkAt = game.time + 7;
    const blink = async () => {
      player.flashlight.intensity = 0;
      sfx.whisper();
      await game.wait(0.3);
      player.flashlight.intensity = 40;
    };
    // She only moves while you aren't looking at her.
    const outcome = await new Promise((resolve) => game.hooks.push(() => {
      const p = player.pos, g = ghost.pos;
      const dist = Math.hypot(p.x - g.x, p.z - g.z);
      if (p.z < EXIT_Z || dist < 1.3) {
        resolve(p.z < EXIT_Z ? 'escaped' : 'caught');
        return true;
      }
      if (player.facing(g) > 0.6 && dist < 28) {
        ghost.path = [];
        ghost.face(p.x, p.z);
      } else {
        ghost.path = [[p.x, p.z]];
        ghost.speed = dist > 16 ? 6 : 2.9;
      }
      if (game.time > blinkAt) {
        blinkAt = game.time + 7;
        blink();
        if (dist > 12) {
          const behind = p.clone().addScaledVector(player.forward(), -9);
          ghost.place(behind.x, behind.z);
        }
      }
    }));

    player.flashlight.intensity = 0;
    if (outcome === 'caught') {
      await d.jumpscare(ghost);
      end('TE ALCANZÓ', 'Nadie sale de la Central después de las 4. — Fin');
      return;
    }
    game.inputEnabled = false;
    despawn(ghost);
    sfx.setTension(0);
    game.fadeTo(1, 3);
    await say('Las luces del Eje 5 Sur nunca se habían visto tan bonitas.', 3.5);
    sfx.silence();
    end('SALISTE DE LA CENTRAL', `You survived the 4 AM shift as the ${label}. Thanks for playing.`);
  }
}
