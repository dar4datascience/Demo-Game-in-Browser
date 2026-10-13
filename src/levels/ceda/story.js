import * as THREE from 'three';
import { lam } from '../../engine/post.js';
import { lonaTex } from '../../engine/textures.js';
import { createDirector, GHOST } from '../../game/director.js';
import { makeDiablito, sackStack } from './props.js';
import { ROWS, unitAt, EXIT_Z } from './world.js';

export const CHARACTERS = {
  diablero: { label: 'Diablero', speed: 0.9 },
  seller: { label: 'Seller', speed: 1 },
  consumer: { label: 'Consumer', speed: 1.05 },
};

const PEOPLE = {
  diablero: { top: '#8a2a1e', bottom: '#2f3a4a', skin: '#a8754f', hair: '#141210' },
  cargador: { top: '#c9b48a', bottom: '#33302a', skin: '#9c6a46', hair: '#101010' },
  vendor: { top: '#f2f2ee', bottom: '#2a2a2a', skin: '#b98560', hair: '#1a1410' },
  vendora: { top: '#7a3e6a', bottom: '#3a2a2a', skin: '#b07850', hair: '#2a2a2a', longHair: true, dress: true },
  buyer: { top: '#2f5d8a', bottom: '#2a2c33', skin: '#c08a60', hair: '#1a1410' },
  woman: { top: '#4a4f3e', bottom: '#2a2a2a', skin: '#d8c2ae', hair: '#0b0b0b', longHair: true, veil: true, dress: true },
};

// People going about the 4 AM shift: [look, loop waypoints, speed, pushes a diablito].
const CROWD = [
  [PEOPLE.diablero, [[-30, -44], [-30, 30]], 1.1, true],
  [PEOPLE.cargador, [[30, 30], [30, -44]], 1.0, false],
  [PEOPLE.diablero, [[-26, ROWS.A + 2], [-4, ROWS.A + 2]], 0.9, true],
  [PEOPLE.buyer, [[-20, -11.5], [20, -11.5], [20, 2.2], [-20, 2.2]], 1.0, false],
  [PEOPLE.vendora, [[4, ROWS.C + 2], [26, ROWS.C + 2]], 0.8, false],
  [PEOPLE.diablero, [[-4, ROWS.D + 2], [-26, ROWS.D + 2]], 1.0, true],
];

export async function runStory(ctx) {
  const { game, world, hud, sfx, player, scene, interact, end, character } = ctx;
  const R = world.refs, F = game.flags;
  const d = createDirector(ctx);
  const { spawn, despawn, say } = d;
  const label = CHARACTERS[character].label;

  player.spawn(0, 33, 0);
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
    if (F.stage === 'finale') return true;
    if (game.time > squeakAt && game.npcs.some((n) => n.root.children.length > 1 && n.pos.distanceTo(player.pos) < 7)) {
      sfx.squeak();
      squeakAt = game.time + 1.2 + Math.random();
    }
  });

  game.fadeTo(0, 3);
  await say('4:10 AM. Central de Abasto, Iztapalapa.', 3.5);
  await { diablero, seller, consumer }[character]();
  await finale();

  // --- Diablero: haul three loads from bodegas to trucks ---------------------------------
  async function diablero() {
    const cart = makeDiablito();
    const load = cart.userData.load;
    hud.objective('Agarra tu diablito (junto a la entrada del Pasillo 2).');
    interact(R.diablito, () => (F.hasCart ? null : 'Agarrar el diablito'), () => {
      F.hasCart = true;
      R.diablito.visible = false;
      player.hold('diablito', cart, [0, -1.25, -1.6], [0.75, Math.PI, 0]);
      sfx.squeak();
    });
    const jobs = [
      ['A-3', 'd1', 'la camioneta roja del andén C'],
      ['C-9', 'd2', 'la camioneta azul del andén A'],
      ['B-11', 'd3', 'la camioneta blanca del andén D'],
    ];
    jobs.forEach(([pickup, truck], i) => {
      interact(R.pickups[pickup], () => (F.job === i && F.hasCart && !load.visible ? 'Cargar los bultos' : null), () => {
        load.visible = true;
        player.speedScale = 0.7;
        sfx.thud();
      });
      interact(R.trucks[truck], () => (F.job === i && load.visible ? 'Descargar en la camioneta' : null), () => {
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
    const { x, z } = unitAt('B-4');
    const path = [[-3.5, z + 2.4], [x, z + 2.4]];
    const serve = async () => {
      F.customerWaiting = true;
      hud.objective('Atiende al cliente en la báscula.');
      await game.until(() => F.served);
      F.served = false;
    };

    hud.objective('Espera a los clientes.');
    const buyer = spawn(PEOPLE.buyer, 0, z + 2.4);
    await buyer.walk(path, 1.1);
    buyer.face(x, z);
    await say('Cliente: Buenos días. Medio kilo de frijol y un kilo de arroz.', 3);
    await serve();
    await say('Cliente: Gracias, joven. Que le vaya bonito.', 2.5);
    buyer.walk([[-3.5, z + 2.4], [0, z + 6]], 1.1).then(() => despawn(buyer));

    await game.wait(6);
    const woman = spawn(PEOPLE.woman, 0, z + 2.4);
    woman.head.rotation.z = 0.35;
    sfx.setTension(0.45);
    await woman.walk(path, 0.55);
    woman.face(x, z);
    await say('...', 2);
    await serve();
    await say('Clienta: Llevo años buscando a mi hijo aquí. Era diablero.', 3.5);
    await say('Clienta: ¿No lo ha visto pasar... esta noche?', 3.5);
    await woman.walk([[-3.5, z + 2.4], [0, z + 6]], 0.55);
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
      const { x, z } = unitAt(id);
      spawn(id === 'C-5' ? PEOPLE.vendora : PEOPLE.vendor, x, z + 0.6).face(x, z + 5);
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
    const ghost = spawn(GHOST, THREE.MathUtils.clamp(back.x, -36, 36), THREE.MathUtils.clamp(back.z, -49, 34));
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
