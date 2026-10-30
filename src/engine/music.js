// Pure pattern data for the procedural soundtrack. Audio nodes live in audio.js.
export const LOFI_BPM = 72;
export const CUMBIA_BPM = 98;

export const midiToFreq = (midi) => 440 * 2 ** ((midi - 69) / 12);
export const stepSeconds = (bpm, stepsPerBeat = 4) => 60 / bpm / stepsPerBeat;

// Dm9 – G13 – Cmaj7 – A7, voiced around middle C.
export const LOFI_CHORDS = [
  [50, 57, 60, 64, 67],
  [43, 50, 53, 57, 64],
  [48, 55, 59, 64, 67],
  [45, 52, 55, 61, 64],
];
export const LOFI_BASS = [38, 43, 36, 45];

// Two bars of Am – G – F – G, one bass note per eighth.
export const CUMBIA_BASS = [
  45, 45, 52, 45, 45, 52, 45, 52,
  43, 43, 50, 43, 43, 50, 43, 50,
  41, 41, 48, 41, 41, 48, 41, 48,
  43, 43, 50, 43, 43, 50, 43, 50,
];

// Montuno-style eighth-note lead over the same progression.
export const CUMBIA_LEAD = [
  69, 72, 76, 72, 69, 72, 76, 79,
  67, 71, 74, 71, 67, 71, 74, 77,
  65, 69, 72, 69, 65, 69, 72, 76,
  67, 71, 74, 71, 67, 71, 74, 77,
];

export const CUMBIA_KICK = [0, 6, 8, 14];
export const CUMBIA_CLAP = [4, 12];
export const CUMBIA_GUIRO = [0, 2, 4, 6, 8, 10, 12, 14];
export const CUMBIA_SHAKER = [1, 3, 5, 7, 9, 11, 13, 15];
export const CUMBIA_CHORDS = [
  [57, 60, 64],
  [55, 59, 62],
  [53, 57, 60],
  [55, 59, 62],
];
