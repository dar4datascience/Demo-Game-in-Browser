import { NPC } from '../world/person.js';

// Story helpers shared by every level script.
export function createDirector({ game, world, hud, sfx, player, scene, pipe }) {
  const director = {
    spawn(opts, x, z) {
      const npc = new NPC(opts, scene);
      npc.place(x, z);
      game.npcs.push(npc);
      return npc;
    },
    despawn(npc) {
      npc.root.removeFromParent();
      const i = game.npcs.indexOf(npc);
      if (i >= 0) game.npcs.splice(i, 1);
    },
    say: (text, dur = 3) => hud.say(text, dur),
    power(on) {
      world.setPower(on);
      sfx.setPower(on);
    },
    async flicker(steps) {
      for (const [on, dur] of steps) {
        director.power(on);
        await game.wait(dur);
      }
    },
    async jumpscare(npc) {
      game.inputEnabled = false;
      const front = player.pos.clone().addScaledVector(player.forward(), 0.6);
      npc.path = [];
      npc.place(front.x, front.z);
      npc.face(player.pos.x, player.pos.z);
      player.pitch = 0.05;
      sfx.stinger();
      pipe.u.uFlash.value = 0.9;
      game.shake = 1;
      await game.wait(1.4);
      game.fadeTo(1, 0.05);
      sfx.silence();
      await game.wait(1.6);
    },
  };
  return director;
}

export const GHOST = { top: '#e6e2d6', skin: '#d8d2c8', hair: '#060606', longHair: true, dress: true, emissive: 0.55, height: 1.04, hollow: true };
