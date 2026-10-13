const $ = (id) => document.getElementById(id);

// In-game clock: one game minute every 6 real seconds, starting at `startMinutes` past midnight.
export function formatClock(startMinutes, seconds) {
  const m = Math.floor(startMinutes + seconds / 6) % (24 * 60);
  const h = Math.floor(m / 60);
  return `${((h + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

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
      const text = formatClock(clockStart, seconds);
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
