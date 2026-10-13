import * as THREE from 'three';
import { lam } from '../../engine/post.js';
import { cardboardTex } from '../../engine/textures.js';
import { createDirector, GHOST } from '../../game/director.js';

const SALARYMAN = { top: '#2c3442', bottom: '#22252b', skin: '#d6a983', hair: '#1a1612' };
const WOMAN = { top: '#6f655a', bottom: '#2a2a2a', skin: '#e0c7b0', hair: '#0b0b0b', longHair: true, veil: true, dress: true };
const CLERK = { top: '#1d8a86', bottom: '#2a2c33', skin: '#d9b08c', hair: '#201810' };

const ENTRANCE = [[4.5, 7], [4.5, 4.2], [-4.5, 3.9]];
const EXIT = [[4.5, 4.2], [4.5, 7], [4.5, 16]];

const PHONE_CALL = [
  'Caller: ...Hello? Is this the NightMart on Route 9?',
  'Caller: The clerk who worked nights before you... did they tell you why they quit?',
  "Caller: If a woman comes in alone tonight, don't look at her for too long.",
  "Caller: And whatever you do... don't check the cameras.",
  '*click*',
];

export async function runStory(ctx) {
  const { game, world, hud, sfx, player, pipe, interact, end } = ctx;
  const R = world.refs, F = game.flags;
  const { spawn, despawn, say, power, flicker, jumpscare } = createDirector(ctx);
  const holding = (kind) => player.heldKind === kind;
  F.restocked = 0;
  player.spawn(4.5, 13, 0);
  R.door.onOpen = () => sfx.chime();

  const serve = async () => {
    F.customerWaiting = true;
    hud.objective('Serve the customer at the register.');
    await game.until(() => F.served);
    F.served = false;
  };

  // --- Interactions --------------------------------------------------------
  interact(R.timeClock, () => (F.clockedIn ? null : 'Clock in'), () => {
    F.clockedIn = true;
    sfx.beep();
  });
  interact(R.boxes, () => (F.stage === 'restock' && !player.heldKind ? 'Pick up a box of stock' : null), () => {
    player.hold('box', new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.28, 0.32), lam({ map: cardboardTex() })));
    sfx.thud();
  });
  R.slots.forEach((slot) => interact(slot.mesh,
    () => (slot.done || F.stage !== 'restock' ? null : holding('box') ? 'Restock shelf' : 'Empty shelf (get stock from the staff room)'),
    () => {
      if (!holding('box')) return;
      slot.fill();
      player.hold(null);
      F.restocked++;
      sfx.thud();
    }));
  interact(R.phone, () => (F.phoneRinging ? 'Answer the phone' : null), () => {
    F.phoneRinging = false;
    F.phoneAnswered = true;
    sfx.click();
  });
  interact(R.register, () => (F.customerWaiting ? 'Scan items' : null), () => {
    F.customerWaiting = false;
    [0, 0.3, 0.6].forEach((at) => sfx.beep(at));
    F.served = true;
  });
  interact(R.trashBag, () => (F.stage === 'trash' && !player.heldKind ? 'Take the trash bag' : null), () => {
    const bag = R.trashBag.clone();
    bag.scale.setScalar(0.6);
    R.trashBag.visible = false;
    player.hold('trash', bag);
  });
  interact(R.dumpster, () => (holding('trash') ? 'Throw out the trash' : null), () => {
    player.hold(null);
    F.trashDone = true;
    sfx.thud();
  });
  interact(R.monitor, () => (F.stage === 'monitor' ? 'Check the security camera' : null), () => {
    F.monitorUsed = true;
  });

  // --- Script --------------------------------------------------------------
  game.fadeTo(0, 3);
  hud.objective('Clock in at the terminal in the staff room.');
  await say('11:40 PM. Night shift again.', 3.5);
  await game.until(() => F.clockedIn);

  F.stage = 'restock';
  await game.until(() => {
    hud.objective(`Restock the empty shelves (${F.restocked}/3). Stock is in the staff room.`);
    return F.restocked >= 3;
  });

  F.stage = 'phone';
  hud.objective('');
  await say('That should do it.', 2.5);
  const stopRing = sfx.ring();
  F.phoneRinging = true;
  hud.objective('The phone is ringing in the staff room.');
  await game.until(() => F.phoneAnswered);
  stopRing();
  hud.objective('');
  for (const line of PHONE_CALL) await say(line, 3.6);
  sfx.setTension(0.25);
  await flicker([[false, 0.08], [true, 0.15], [false, 0.1], [true, 0]]);
  await say('...Prank call. Probably.', 2.5);

  F.stage = 'customers';
  hud.objective('Wait behind the register for customers.');
  await game.wait(4);
  const salaryman = spawn(SALARYMAN, 4.5, 14);
  await salaryman.walk(ENTRANCE, 1.2);
  salaryman.face(-4.5, 2);
  await serve();
  await say('Customer: Thanks. Cold out tonight, huh?', 3);
  salaryman.walk(EXIT, 1.2).then(() => despawn(salaryman));
  hud.objective('Wait for the next customer.');
  await game.wait(8);

  const woman = spawn(WOMAN, 4.5, 14);
  woman.head.rotation.z = 0.35;
  sfx.setTension(0.5);
  await woman.walk(ENTRANCE, 0.6);
  woman.face(-4.5, 2);
  await serve();
  await say('...', 2.5);
  await say("Customer: You can see me too... can't you?", 3.5);
  hud.objective('');
  await woman.walk([[4.5, 4.2], [4.5, 7.3], [-1.5, 7.3]], 0.6);
  woman.face(-1.5, 0);
  sfx.setTension(0.6);
  await say("She's just... standing outside.", 3);

  F.stage = 'trash';
  hud.objective('Take the trash out to the dumpster in the parking lot.');
  await game.until(() => F.trashDone);
  despawn(woman);
  power(false);
  sfx.thunk();
  const ghost = spawn(GHOST, -2.8, 4.7);
  ghost.face(-2.8, 10);
  await say('...The power went out?', 3);
  hud.objective('Go back inside.');
  await game.until(() => player.pos.z < 5.5 && Math.abs(player.pos.x) < 8);

  await flicker([[true, 0.1], [false, 0.35]]);
  ghost.place(0.1, 2.0);
  ghost.face(player.pos.x, player.pos.z);
  await flicker([[true, 0.12], [false, 0.5]]);
  despawn(ghost);
  power(true);
  sfx.thud();
  sfx.setTension(0.8);
  await say('Someone was in here. I saw her through the window.', 3);

  F.stage = 'monitor';
  hud.objective('Check the security monitor in the staff room.');
  await game.until(() => F.monitorUsed);
  F.stage = 'end';
  hud.objective('');
  game.inputEnabled = false;
  const behind = player.pos.clone().addScaledVector(player.forward(), -0.9);
  const lurker = spawn(GHOST, THREE.MathUtils.clamp(behind.x, 3.3, 7.6), THREE.MathUtils.clamp(behind.z, -9.7, -6.4));
  lurker.face(player.pos.x, player.pos.z);
  // The player has no body in first person, so stand in a clerk for the CCTV shot.
  const self = spawn(CLERK, player.pos.x, player.pos.z);
  self.root.rotation.y = player.yaw + Math.PI;
  game.cam = world.secCam;
  pipe.u.uMonitor.value = 1;
  hud.camera(true);
  await game.wait(3.2);
  despawn(self);
  game.cam = player.camera;
  pipe.u.uMonitor.value = 0;
  hud.camera(false);
  game.inputEnabled = true;
  sfx.setTension(1);

  const t0 = game.time;
  await game.until(() => player.facing(lurker.pos) > 0.75 || game.time - t0 > 6);
  await jumpscare(lurker);
  end('END OF SHIFT', 'Thanks for playing the demo.');
}
