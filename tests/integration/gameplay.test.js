import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { LEVELS } from '../../src/levels/index.js';
import { createHarness } from '../helpers/harness.js';

// Mechanics that make the missions playable: interaction gating, carry/load rules, doors, and
// the chase. These complement stories.test.js, which only proves the happy path can be finished.

const byObject = (h, object) => h.interactions.find((i) => i.objects.includes(object));

describe('NightMart mechanics', () => {
  it('only offers clocking in until the shift starts', async () => {
    const h = createHarness('konbini');
    await h.run(() => h.hud.current !== '', { maxTime: 1 });
    expect(h.available().map((i) => i.label())).toEqual(['Clock in']);
    expect(h.game.flags.clockedIn).toBeUndefined();
  });

  it('needs a box from the staff room to fill a shelf', async () => {
    const h = createHarness('konbini');
    await h.run(() => h.game.flags.stage === 'restock', { onStep: () => h.useAvailable() });

    const slot = h.world.refs.slots[0];
    const shelf = byObject(h, slot.mesh);
    expect(shelf.label()).toBe('Empty shelf (get stock from the staff room)');
    shelf.use();
    expect(slot.done).toBe(false);
    expect(h.game.flags.restocked).toBe(0);

    const boxes = byObject(h, h.world.refs.boxes[0]);
    boxes.use();
    expect(h.player.heldKind).toBe('box');
    expect(boxes.label()).toBe(null); // cannot pick up a second box while carrying one
    expect(shelf.label()).toBe('Restock shelf');
    shelf.use();
    expect(slot.done).toBe(true);
    expect(h.player.held).toBe(null);
    expect(h.game.flags.restocked).toBe(1);
  });

  it('only answers the phone while it rings and serves a waiting customer', async () => {
    const h = createHarness('konbini');
    await h.run(() => h.game.flags.stage === 'phone', { onStep: () => h.useAvailable() });

    const phone = byObject(h, h.world.refs.phone[0]);
    const register = byObject(h, h.world.refs.register[0]);
    expect(phone.label()).toBe(null);
    expect(register.label()).toBe(null);

    await h.run(() => h.game.flags.phoneRinging);
    expect(phone.label()).toBe('Answer the phone');
    phone.use();
    expect(h.game.flags.phoneAnswered).toBe(true);

    await h.run(() => h.game.flags.customerWaiting);
    expect(register.label()).toBe('Scan items');
    register.use();
    expect(h.game.flags.served).toBe(true);
    expect(h.game.flags.customerWaiting).toBe(false);
  });

  it('opens the automatic door as someone approaches and closes behind them', () => {
    const scene = new THREE.Scene();
    const world = LEVELS.konbini.build(scene);
    let chimes = 0;
    world.refs.door.onOpen = () => chimes++;

    world.update(0.5, [{ x: 4.5, z: 6 }]);
    expect(world.refs.door.open).toBeGreaterThan(0);
    expect(chimes).toBe(1);
    world.update(0.5, [{ x: 4.5, z: 6 }]);
    expect(chimes).toBe(1);

    for (let i = 0; i < 10; i++) world.update(0.1, []);
    expect(world.refs.door.open).toBe(0);
    expect(world.refs.door.panels[0].position.x).toBeCloseTo(4.0);
  });
});

describe('Central de Abasto mechanics', () => {
  it('diablero needs his diablito to load, and a load slows him down', async () => {
    const h = createHarness('ceda', 'diablero');
    await h.run(() => h.hud.current?.includes('Agarra tu diablito'), { maxTime: 20 });

    const pickup = byObject(h, h.world.refs.pickups['A-3']);
    const laterPickup = byObject(h, h.world.refs.pickups['C-9']);
    expect(pickup.label()).toBe(null); // no cart, no job yet
    expect(laterPickup.label()).toBe(null);

    h.useAvailable(); // grab the diablito
    expect(h.game.flags.hasCart).toBe(true);
    await h.run(() => h.game.flags.job === 0, { maxTime: 20 });

    expect(pickup.label()).toBe('Cargar los bultos');
    expect(laterPickup.label()).toBe(null); // only the active job's pickup
    pickup.use();
    expect(h.player.held.userData.load.visible).toBe(true);
    expect(h.player.speedScale).toBeCloseTo(0.75);
    expect(pickup.label()).toBe(null); // already loaded

    const truck = byObject(h, h.world.refs.trucks.d1);
    expect(truck.label()).toBe('Descargar en la camioneta');
    truck.use();
    expect(h.game.flags.delivered).toBe(1);
    expect(h.player.speedScale).toBeCloseTo(1);
    expect(truck.label()).toBe(null);
  });

  it('the pancarta starts a 70 second flow until it is hung at B-4', async () => {
    const h = createHarness('ceda', 'diablero');
    await h.run(() => h.game.flags.stage === 'pancarta', { onStep: () => h.useAvailable() });

    const pickup = byObject(h, h.world.refs.rotulista.pickup);
    const drop = byObject(h, h.world.refs.pancartaDrop);
    expect(pickup.label()).toBe('Recoger la pancarta');
    expect(drop.label()).toBe(null);
    expect(h.player.speedScale).toBeCloseTo(1);

    pickup.use();
    expect(h.game.flags.flow).toBe(true);
    expect(h.game.flags.hasPancarta).toBe(true);
    expect(h.player.speedScale).toBeCloseTo(1.6);
    expect(h.game.flags.flowEnd - h.game.time).toBeCloseTo(70, 0);
    expect(h.log.flow).toBe(70);
    expect(pickup.label()).toBe(null);
    expect(drop.label()).toBe('Colgar la pancarta');

    drop.use();
    expect(h.game.flags.pancartaDelivered).toBe(true);
    expect(h.game.flags.flow).toBe(false);
    expect(h.log.flow).toBe(null);
    expect(h.player.speedScale).toBeCloseTo(1);
    expect(h.world.refs.pancartaPlaced.visible).toBe(true);
  });

  it('flow lasts exactly the pancarta run, then the tráiler leaves without you', async () => {
    const h = createHarness('ceda', 'diablero');
    await h.run(() => h.game.flags.stage === 'pancarta', { onStep: () => h.useAvailable() });
    byObject(h, h.world.refs.rotulista.pickup).use();
    const t0 = h.game.time;

    // 69 seconds in, the sign can still be hung.
    await h.run(() => h.game.time >= t0 + 69, { maxTime: t0 + 80 });
    expect(h.game.flags.flow).toBe(true);
    expect(h.player.speedScale).toBeCloseTo(1.6);
    byObject(h, h.world.refs.pancartaDrop).use();
    expect(h.game.flags.flow).toBe(false);
    expect(h.game.flags.pancartaDelivered).toBe(true);

    // A fresh run that sits on the sign for 71 seconds loses the shift.
    const late = createHarness('ceda', 'diablero');
    await late.run(() => late.game.flags.stage === 'pancarta', { onStep: () => late.useAvailable() });
    byObject(late, late.world.refs.rotulista.pickup).use();
    const t1 = late.game.time;
    await late.run(() => late.game.ended, { maxTime: t1 + 90 });
    expect(late.log.ending.title).toBe('SE TE FUE EL TRÁILER');
    expect(late.game.time - t1).toBeLessThan(72);
  });

  it('fruit peels slow the ghost in the shrine run', async () => {
    const h = createHarness('ceda', 'diablero');
    await h.run(() => h.game.flags.ghostReady, { onStep: () => h.useAvailable() });
    h.interactions.find((i) => i.label() === 'Pelear con el fantasma').use();
    await h.run(() => h.game.flags.fightReady, { maxTime: h.game.time + 15 });

    const peel = h.interactions.find((i) => i.label() === 'Recoger cáscara');
    expect(peel).toBeDefined();
    peel.use();
    expect(h.game.flags.peels).toBe(1);

    h.input.pressed.add('KeyQ');
    h.step(0.1);
    h.input.pressed.clear();
    expect(h.game.flags.peels).toBe(0);
    expect(h.game.flags.droppedPeels).toHaveLength(1);

    // Move away, then put the ghost on the dropped peel so the slip check fires without a catch.
    h.player.pos.x += 3;
    const dropped = h.game.flags.droppedPeels[0];
    h.game.flags.ghost.place(dropped.mesh.position.x, dropped.mesh.position.z);
    h.step(0.1);
    expect(h.game.flags.ghost.speed).toBe(1.9);
  });

  it('seller must raise the cortina before stocking, and a pallet needs a sack', async () => {
    const h = createHarness('ceda', 'seller');
    await h.run(() => h.hud.current?.includes('Abre tu bodega'), { maxTime: 20 });

    const unit = h.world.refs.units['B-4'];
    const cortina = byObject(h, unit.cortina);
    // Stocking interactions do not even exist until the shutter is up.
    expect(byObject(h, h.world.refs.trucks.seller)).toBeUndefined();
    expect(byObject(h, h.world.refs.pallets[0].mesh)).toBeUndefined();
    expect(h.available().map((i) => i.label())).toEqual(['Subir la cortina']);

    cortina.use();
    await h.run(() => h.game.flags.stage === 'stock', { maxTime: 10 });
    expect(unit.roll).toBe(1);

    const truck = byObject(h, h.world.refs.trucks.seller);
    const pallet = byObject(h, h.world.refs.pallets[0].mesh);
    expect(pallet.label()).toBe('Tarima vacía');
    pallet.use();
    expect(h.world.refs.pallets[0].done).toBeFalsy();
    expect(h.game.flags.stocked).toBe(0);

    truck.use();
    expect(h.player.heldKind).toBe('sack');
    expect(pallet.label()).toBe('Acomodar el bulto');
    pallet.use();
    expect(h.world.refs.pallets[0].done).toBe(true);
    expect(h.game.flags.stocked).toBe(1);
    expect(h.player.held).toBe(null);
  });

  it('ghost chases fast from afar and slows down up close', async () => {
    const h = createHarness('ceda', 'consumer');
    await h.run(() => h.hud.current?.includes('Eje 5 Sur'), { onStep: () => h.useAvailable() });
    const ghost = h.game.npcs[0];

    // Face away (south) so she moves; far away she sprints.
    h.player.spawn(0, 30, Math.PI);
    ghost.place(0, -20);
    h.step(0.1);
    expect(ghost.speed).toBe(6);

    // Close behind the player she closes in at walking-plus speed.
    ghost.place(0, 20);
    h.step(0.1);
    expect(ghost.speed).toBe(2.9);
  });

  it('is caught when the ghost reaches the player', async () => {
    const h = createHarness('ceda', 'consumer');
    await h.run(() => h.hud.current?.includes('Eje 5 Sur'), { onStep: () => h.useAvailable() });
    const ghost = h.game.npcs[0];

    h.player.spawn(-26, -19, 0); // inside the Eje 5 Sur apron, not through the gate yet
    ghost.place(-26, -20);
    await h.run(() => h.game.ended, { maxTime: 30 });

    expect(h.log.ending.title).toBe('TE ALCANZÓ');
    expect(h.log.ending.subtitle).toContain('Nadie sale de la Central');
    expect(h.player.flashlight.intensity).toBe(0);
    expect(h.game.inputEnabled).toBe(false);
  });
});
