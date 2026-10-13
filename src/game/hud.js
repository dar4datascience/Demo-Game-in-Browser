const $ = (id) => document.getElementById(id);

export function createHud(game) {
  let clockStart = 0;
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
    setClockStart(minutes) {
      clockStart = minutes;
    },
    clock(seconds) {
      const m = Math.floor(clockStart + seconds / 6) % (24 * 60);
      const h = Math.floor(m / 60);
      const text = `${((h + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
      set('clock', text);
      set('camtime', text);
    },
    camera(on) {
      $('cam').classList.toggle('hidden', !on);
      $('crosshair').classList.toggle('hidden', on);
    },
    ending(title, subtitle) {
      set('end-title', title);
      set('end-sub', subtitle);
      $('end').classList.remove('hidden');
    },
    show: (id) => $(id).classList.remove('hidden'),
    hide: (id) => $(id).classList.add('hidden'),
  };
}
