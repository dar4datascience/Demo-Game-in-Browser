// Pure pattern data for the procedural soundtrack. Audio nodes live in audio.js.
export const LOFI_BPM = 68;
export const CUMBIA_BPM = 92;

export const midiToFreq = (midi) => 440 * 2 ** ((midi - 69) / 12);
export const stepSeconds = (bpm, stepsPerBeat = 4) => 60 / bpm / stepsPerBeat;

// Four slow bars in D minor: Dm9 – Bbmaj9 – Gm9 – A7b9. Full voicings, kept around middle C.
export const LOFI_CHORDS = [
  [50, 53, 57, 60, 64],
  [46, 50, 53, 57, 60],
  [43, 46, 50, 53, 57],
  [45, 49, 52, 55, 58],
];
export const LOFI_BASS = [38, 34, 31, 33];

// Sonidera cumbia in A minor: Am – F – C – G. One bass note per eighth, four bars.
export const CUMBIA_CHORDS = [
  [57, 60, 64],
  [53, 57, 60],
  [48, 52, 55],
  [55, 59, 62],
];

// Tumbao bass: root, root, fifth, root, root, octave, fifth, root.
export const CUMBIA_BASS = [
  45, 45, 52, 45, 45, 57, 52, 45,
  41, 41, 48, 41, 41, 53, 48, 41,
  48, 48, 55, 48, 48, 60, 55, 48,
  43, 43, 50, 43, 43, 55, 50, 43,
];

// Accordion-style melody over the same progression, one note per eighth.
export const CUMBIA_LEAD = [
  69, 72, 76, 72, 69, 72, 76, 79,
  65, 69, 72, 69, 65, 69, 72, 76,
  64, 67, 72, 67, 64, 67, 72, 76,
  67, 71, 74, 71, 67, 71, 74, 79,
];

// Cumbia "boom-chick" on a 16-step bar: kick on the one, the and-of-two and three.
export const CUMBIA_KICK = [0, 6, 8];
export const CUMBIA_CLAP = [4, 12];
export const CUMBIA_GUIRO = [0, 2, 4, 6, 8, 10, 12, 14];
export const CUMBIA_SHAKER = [1, 3, 5, 7, 9, 11, 13, 15];
export const CUMBIA_STAB = [2, 6, 10, 14];
