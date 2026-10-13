export function createInput(canvas) {
  const input = {
    keys: new Set(),
    pressed: new Set(),
    dx: 0,
    dy: 0,
    click: false,
    locked: false,
    onLockChange: null,
    lock: () => canvas.requestPointerLock(),
    unlock: () => document.exitPointerLock(),
    consume() {
      this.dx = this.dy = 0;
      this.click = false;
      this.pressed.clear();
    },
  };
  addEventListener('keydown', (e) => {
    if (!e.repeat) input.pressed.add(e.code);
    input.keys.add(e.code);
  });
  addEventListener('keyup', (e) => input.keys.delete(e.code));
  addEventListener('blur', () => input.keys.clear());
  addEventListener('mousemove', (e) => {
    if (!input.locked) return;
    input.dx += e.movementX;
    input.dy += e.movementY;
  });
  addEventListener('mousedown', (e) => {
    if (input.locked && e.button === 0) input.click = true;
  });
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
    input.onLockChange?.(input.locked);
  });
  return input;
}
