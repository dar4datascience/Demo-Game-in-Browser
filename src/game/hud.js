const $ = (id) => document.getElementById(id);
const START_MINUTES = 23 * 60 + 40;

export function createHud(game) {
  const set = (id, text) => {
    const el = $(id);
    if (el.textContent !== text) el.textContent = text;
  };
  return {
    objective: (text) => set('objective', text),
    prompt: (label) => set('prompt', label ? `[E] ${label}` : ''),
    async say(text, dur = 3) {
      set('subtitle', text);
      await game.wait(dur);
      if ($('subtitle').textContent === text) set('subtitle', '');
    },
    clock(seconds) {
      const m = Math.floor(START_MINUTES + seconds / 6) % (24 * 60);
      const h = Math.floor(m / 60);
      const text = `${((h + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
      set('clock', text);
      set('camtime', text);
    },
    camera(on) {
      $('cam').classList.toggle('hidden', !on);
      $('crosshair').classList.toggle('hidden', on);
    },
    show: (id) => $(id).classList.remove('hidden'),
    hide: (id) => $(id).classList.add('hidden'),
  };
}
