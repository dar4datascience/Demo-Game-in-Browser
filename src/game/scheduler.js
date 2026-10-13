// Game-time scheduler: story steps await these, so pausing (not ticking) freezes the script.
export function createGame(camera) {
  return {
    time: 0,
    waiters: [],
    hooks: [], // per-tick callbacks; return true to unregister
    flags: {},
    npcs: [],
    cam: camera,
    inputEnabled: true,
    shake: 0,
    fade: { target: 1, rate: 1 },
    started: false,
    ended: false,
    until(pred) {
      return new Promise((resolve) => this.waiters.push({ pred, resolve }));
    },
    wait(seconds) {
      const t = this.time + seconds;
      return this.until(() => this.time >= t);
    },
    fadeTo(target, seconds) {
      this.fade = { target, rate: 1 / Math.max(seconds, 0.001) };
    },
    tick(dt) {
      this.time += dt;
      this.hooks = this.hooks.filter((h) => !h(dt));
      this.waiters = this.waiters.filter((w) => !(w.pred() && (w.resolve(), true)));
    },
  };
}
