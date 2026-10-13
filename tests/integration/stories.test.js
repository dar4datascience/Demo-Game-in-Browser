import { describe, it, expect } from 'vitest';
import { createHarness } from '../helpers/harness.js';
import { EXIT_Z } from '../../src/levels/ceda/world.js';

// Headless end-to-end runs of each story script: real scheduler, world, NPC movement and interactions.
// The "autoplayer" presses E on whatever is currently offered, like an impatient but obedient player.

describe('NightMart story', () => {
  it('plays from clock-in to the CCTV ending', async () => {
    const h = createHarness('konbini');
    await h.run(() => h.game.ended, {
      onStep: () => {
        h.useAvailable();
        if (h.hud.current === 'Go back inside.') h.player.pos.set(0, 0, 0);
      },
    });
    const F = h.game.flags;
    expect(h.log.ending.title).toBe('END OF SHIFT');
    expect(F.restocked).toBe(3);
    expect(h.world.refs.slots.every((s) => s.done)).toBe(true);
    expect(F.phoneAnswered && F.trashDone && F.monitorUsed).toBe(true);
    expect(h.log.subtitles).toContain("Caller: And whatever you do... don't check the cameras.");

    const order = ['Clock in', 'Restock shelf', 'Answer the phone', 'Scan items', 'Take the trash bag', 'Throw out the trash', 'Check the security camera'];
    const firstUse = order.map((label) => h.log.used.indexOf(label));
    expect(firstUse.every((i) => i >= 0)).toBe(true);
    expect([...firstUse].sort((a, b) => a - b)).toEqual(firstUse);
    expect(h.log.used.filter((l) => l === 'Scan items')).toHaveLength(2);
  });

  it('does not progress without player input', async () => {
    const h = createHarness('konbini');
    for (let i = 0; i < 600; i++) {
      h.step(0.1);
      await new Promise((r) => setImmediate(r));
    }
    expect(h.game.flags.clockedIn).toBeUndefined();
    expect(h.hud.current).toBe('Clock in at the terminal in the staff room.');
  });
});

describe('Central de Abasto stories', () => {
  // Teleport through the gate once the finale objective appears.
  const escape = (h) => () => {
    h.useAvailable();
    if (h.hud.current?.includes('Eje 5 Sur')) h.player.pos.set(0, 0, EXIT_Z - 1);
  };

  it('Diablero hauls three loads and escapes', async () => {
    const h = createHarness('ceda', 'diablero');
    await h.run(() => h.game.ended, { onStep: escape(h) });
    expect(h.game.flags.delivered).toBe(3);
    expect(h.log.used.filter((l) => l === 'Descargar en la camioneta')).toHaveLength(3);
    expect(h.player.speedScale).toBeCloseTo(0.9);
    expect(h.log.ending.title).toBe('SALISTE DE LA CENTRAL');
    expect(h.log.ending.subtitle).toContain('Diablero');
  });

  it('Seller opens the bodega, stocks 3 pallets, serves 2 customers, and gets caught if they stand still', async () => {
    const h = createHarness('ceda', 'seller');
    await h.run(() => h.game.ended, { onStep: () => h.useAvailable() });
    expect(h.world.refs.units['B-4'].roll).toBe(1);
    expect(h.game.flags.stocked).toBe(3);
    expect(h.world.refs.pallets.every((p) => p.done)).toBe(true);
    expect(h.log.used.filter((l) => l === 'Pesar y cobrar')).toHaveLength(2);
    expect(h.log.ending.title).toBe('TE ALCANZÓ');
    expect(h.pipe.u.uFlash.value).toBeGreaterThan(0);
  });

  it('Consumer buys the whole shopping list and escapes', async () => {
    const h = createHarness('ceda', 'consumer');
    await h.run(() => h.game.ended, { onStep: escape(h) });
    const lists = h.log.objectives.filter((o) => o.startsWith('Lista del mandado'));
    expect(lists.at(-1).match(/\[x\]/g)).toHaveLength(3);
    expect(h.log.used.filter((l) => l.startsWith('Comprar'))).toHaveLength(3);
    expect(h.log.ending.title).toBe('SALISTE DE LA CENTRAL');
  });

  it('blacks out the market and clears the crowd for the finale', async () => {
    const h = createHarness('ceda', 'consumer');
    await h.run(() => h.hud.current?.includes('Eje 5 Sur'), { onStep: () => h.useAvailable() });
    expect(h.world.powered).toBe(false);
    expect(h.player.flashlight.intensity).toBeGreaterThan(0);
    expect(h.game.npcs).toHaveLength(1); // only her
  });

  it('the ghost freezes while watched', async () => {
    const h = createHarness('ceda', 'consumer');
    await h.run(() => h.hud.current?.includes('Eje 5 Sur'), { onStep: () => h.useAvailable() });
    const ghost = h.game.npcs[0];
    h.player.spawn(0, -20, 0);
    ghost.place(0, -30); // straight ahead
    const before = ghost.pos.clone();
    const advance = async (seconds) => {
      for (let t = 0; t < seconds; t += 0.1) {
        h.step(0.1);
        await new Promise((r) => setImmediate(r));
      }
    };
    await advance(2);
    expect(ghost.pos.distanceTo(before)).toBeLessThan(0.05);
    h.player.yaw = Math.PI; // look away
    await advance(2);
    expect(ghost.pos.distanceTo(before)).toBeGreaterThan(1);
  });

  it.each(['diablero', 'seller', 'consumer'])('%s story starts with a valid spawn and its first objective', async (character) => {
    const h = createHarness('ceda', character);
    await h.run(() => h.log.objectives.length > 0, { maxTime: 10 });
    expect(h.player.pos.z).toBe(33);
    expect(h.game.npcs.length).toBeGreaterThanOrEqual(6); // the 4 AM crowd
  });
});
