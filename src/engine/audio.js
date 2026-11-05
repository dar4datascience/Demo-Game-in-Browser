// All sound is synthesized with WebAudio, so the demo ships with zero audio assets.
import {
  LOFI_BPM, CUMBIA_BPM, LOFI_CHORDS, LOFI_BASS,
  CUMBIA_BASS, CUMBIA_LEAD, CUMBIA_KICK, CUMBIA_CLAP, CUMBIA_GUIRO, CUMBIA_SHAKER, CUMBIA_STAB, CUMBIA_CHORDS,
  midiToFreq,
} from './music.js';

export class Sfx {
  init() {
    if (this.ctx) return;
    const ctx = (this.ctx = new AudioContext());
    this.out = ctx.createGain();
    this.out.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.005;
    comp.release.value = 0.2;
    this.out.connect(comp).connect(ctx.destination);
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.lofiBase = 0.8;
    this.lofiTimer = null;
    this.flowTimer = null;
    this.tension = 0;
  }

  get now() {
    return this.ctx.currentTime;
  }

  env(gain, t, vol, attack, dur) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  tone(freq, dur, { type = 'sine', vol = 0.2, at = 0, attack = 0.01, when = null, dest = null } = {}) {
    if (!this.ctx) return null;
    const t = when ?? this.now + at;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = this.ctx.createGain();
    this.env(gain, t, vol, attack, dur);
    osc.connect(gain).connect(dest ?? this.out);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    return osc;
  }

  noise(dur, { vol = 0.2, at = 0, freq = 1000, type = 'lowpass', attack = 0.005, when = null, dest = null } = {}) {
    if (!this.ctx) return;
    const t = when ?? this.now + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const gain = this.ctx.createGain();
    this.env(gain, t, vol, attack, dur);
    src.connect(filter).connect(gain).connect(dest ?? this.out);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  // Warm two-oscillator pad: detuned triangles behind a soft low-pass.
  pad(freq, dur, { vol = 0.01, when = null, dest = null, attack = 0.6, cutoff = 900 } = {}) {
    if (!this.ctx) return;
    const t = when ?? this.now;
    const gain = this.ctx.createGain();
    this.env(gain, t, vol, attack, dur);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    lp.Q.value = 0.3;
    gain.connect(lp).connect(dest ?? this.out);
    for (const det of [-6, 6]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.detune.value = det;
      osc.connect(gain);
      osc.start(t);
      osc.stop(t + dur + 0.1);
    }
  }

  // Accordion-ish reed: two detuned saws through a low-pass and a band-pass formant.
  reed(freq, dur, { vol = 0.03, when = null, dest = null } = {}) {
    if (!this.ctx) return;
    const t = when ?? this.now;
    const gain = this.ctx.createGain();
    this.env(gain, t, vol, 0.02, dur);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    const formant = this.ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.frequency.value = 1250;
    formant.Q.value = 1.1;
    gain.connect(lp).connect(formant).connect(dest ?? this.out);
    for (const det of [-8, 8]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value = det;
      osc.connect(gain);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }
  }

  loop(node, gainValue, filterFreq) {
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.value = gainValue;
    node.connect(filter).connect(gain);
    node.start();
    return gain;
  }

  osc(type, freq) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    return o;
  }

  startAmbience() {
    if (!this.ctx) return;
    // Fluorescent-light hum (cut during blackouts).
    this.humGain = this.ctx.createGain();
    this.humGain.gain.value = 0.03;
    this.humGain.connect(this.out);
    this.loop(this.osc('sawtooth', 100), 1, 260).connect(this.humGain);
    this.loop(this.osc('sine', 50), 0.6, 200).connect(this.humGain);
    // Room tone.
    const room = this.ctx.createBufferSource();
    room.buffer = this.noiseBuf;
    room.loop = true;
    this.roomGain = this.loop(room, 0.015, 500);
    this.roomGain.connect(this.out);
    // Dread drone, raised as tension builds.
    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = 0;
    this.droneGain.connect(this.out);
    this.loop(this.osc('sine', 41), 1, 400).connect(this.droneGain);
    this.loop(this.osc('sine', 41.7), 1, 400).connect(this.droneGain);
    this.loop(this.osc('triangle', 61.5), 0.4, 300).connect(this.droneGain);
    this.startLofi();
  }

  setPower(on) {
    this.humGain?.gain.setTargetAtTime(on ? 0.03 : 0, this.now, 0.03);
  }

  setTension(v) {
    this.tension = v;
    this.droneGain?.gain.setTargetAtTime(v * 0.14, this.now, 1.5);
    if (!this.flowTimer) this.lofiGain?.gain.setTargetAtTime(this.lofiBase * (1 - v * 0.6), this.now, 1.5);
  }

  startSequencer(bpm, stepsPerBeat, fn) {
    if (!this.ctx) return null;
    const stepDur = 60 / bpm / stepsPerBeat;
    let step = 0;
    let next = this.now + 0.05;
    const tick = () => {
      if (next < this.now - 0.5) next = this.now + 0.05;
      while (next < this.now + 0.2) {
        fn(step, next);
        next += stepDur;
        step++;
      }
    };
    tick();
    return setInterval(tick, 25);
  }

  startLofi() {
    if (!this.ctx || this.lofiTimer) return;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1400;
    filter.Q.value = 0.5;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 85;
    this.lofiGain = this.ctx.createGain();
    this.lofiGain.gain.value = this.lofiBase;
    filter.connect(hp).connect(this.lofiGain).connect(this.out);
    this.lofiBus = filter;

    const crackle = this.ctx.createBufferSource();
    crackle.buffer = this.noiseBuf;
    crackle.loop = true;
    const chp = this.ctx.createBiquadFilter();
    chp.type = 'bandpass';
    chp.frequency.value = 2600;
    chp.Q.value = 0.6;
    this.lofiCrackle = this.ctx.createGain();
    this.lofiCrackle.gain.value = 0.012;
    crackle.connect(chp).connect(this.lofiCrackle).connect(this.out);
    crackle.start();

    this.lofiTimer = this.startSequencer(LOFI_BPM, 2, (step, time) => this.lofiStep(step, time));
  }

  lofiStep(step, time) {
    const bar = Math.floor(step / 8) % LOFI_CHORDS.length;
    const beat = step % 8;
    const bus = this.lofiBus;
    if (beat === 0) {
      this.tone(midiToFreq(LOFI_BASS[bar]), 3.4, { type: 'sine', vol: 0.12, attack: 0.12, when: time, dest: bus });
      LOFI_CHORDS[bar].forEach((n, i) => {
        this.pad(midiToFreq(n), 3.6, { vol: 0.02, when: time + i * 0.05, dest: bus });
      });
    }
    if (beat === 0 || beat === 4) this.tone(52, 0.35, { type: 'sine', vol: beat === 0 ? 0.08 : 0.04, when: time, dest: bus });
    if (beat === 2 || beat === 6) this.noise(0.09, { vol: 0.02, freq: 2200, type: 'bandpass', when: time, dest: bus });
    if (beat % 2 === 1) this.noise(0.02, { vol: 0.006, freq: 7500, type: 'highpass', when: time, dest: this.out });
    if (beat === 4) {
      const note = LOFI_CHORDS[bar][(bar + 2) % 5] + 12;
      this.tone(midiToFreq(note), 1.6, { type: 'sine', vol: 0.012, attack: 0.05, when: time, dest: bus });
    }
    if (Math.random() < 0.04) this.noise(0.015, { vol: 0.012, freq: 3200, type: 'highpass', when: time, dest: this.out });
  }

  createCumbiaBus() {
    if (this.cumbiaGain) return;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 55;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 6500;
    this.cumbiaGain = this.ctx.createGain();
    this.cumbiaGain.gain.value = 0;
    hp.connect(lp).connect(this.cumbiaGain).connect(this.out);
    this.cumbiaBus = hp;
  }

  cumbiaStep(step, time) {
    const beat = step % 16;
    const bar = Math.floor(step / 16) % CUMBIA_CHORDS.length;
    const bus = this.cumbiaBus;
    if (CUMBIA_STAB.includes(beat)) {
      CUMBIA_CHORDS[bar].forEach((n, i) => {
        this.tone(midiToFreq(n), 0.16, { type: 'square', vol: 0.011, attack: 0.01, when: time + i * 0.008, dest: bus });
      });
    }
    if (CUMBIA_KICK.includes(beat)) this.tone(50, 0.22, { type: 'sine', vol: 0.14, when: time, dest: bus });
    if (CUMBIA_CLAP.includes(beat)) this.noise(0.1, { vol: 0.045, freq: 1500, type: 'bandpass', when: time, dest: bus });
    if (CUMBIA_GUIRO.includes(beat)) {
      this.noise(0.035, { vol: beat % 4 === 0 ? 0.03 : 0.016, freq: 3800, type: 'highpass', when: time, dest: bus });
    }
    if (CUMBIA_SHAKER.includes(beat)) this.noise(0.025, { vol: 0.008, freq: 6800, type: 'highpass', when: time, dest: bus });
    if (beat % 2 === 0) {
      const i = (step / 2) % CUMBIA_BASS.length;
      const bass = CUMBIA_BASS[i];
      this.tone(midiToFreq(bass), 0.2, { type: 'triangle', vol: 0.08, attack: 0.01, when: time, dest: bus });
      this.tone(midiToFreq(bass + 12), 0.12, { type: 'sine', vol: 0.025, when: time, dest: bus });
      const lead = CUMBIA_LEAD[i];
      this.reed(midiToFreq(lead), 0.22, { vol: 0.03, when: time, dest: bus });
      this.reed(midiToFreq(lead), 0.16, { vol: 0.008, when: time + 0.26, dest: bus });
    }
  }

  chime() {
    this.tone(659.25, 0.9, { vol: 0.1 });
    this.tone(523.25, 1.3, { vol: 0.1, at: 0.4 });
  }

  beep(at = 0) {
    this.tone(2093, 0.08, { type: 'square', vol: 0.035, at });
  }

  step() {
    this.noise(0.08, { vol: 0.13, freq: 320 + Math.random() * 160 });
  }

  thud() {
    this.tone(90, 0.25, { vol: 0.3 });
    this.noise(0.15, { vol: 0.2, freq: 400 });
  }

  click() {
    this.noise(0.04, { vol: 0.3, freq: 3000, type: 'bandpass' });
  }

  thunk() {
    const osc = this.tone(120, 0.7, { vol: 0.4 });
    osc?.frequency.exponentialRampToValueAtTime(30, this.now + 0.7);
    this.noise(0.4, { vol: 0.3, freq: 200 });
  }

  ring() {
    if (!this.ctx) return () => {};
    let on = true;
    let timer;
    const burst = () => {
      if (!on) return;
      for (const at of [0, 0.5]) {
        this.tone(440, 0.4, { vol: 0.05, at });
        this.tone(480, 0.4, { vol: 0.05, at });
      }
      timer = setTimeout(burst, 3000);
    };
    burst();
    return () => {
      on = false;
      clearTimeout(timer);
    };
  }

  // Roll-up metal shutter.
  rattle(dur = 1.4) {
    for (let t = 0; t < dur; t += 0.06) this.noise(0.05, { at: t, vol: 0.1, freq: 1400 + Math.random() * 600, type: 'bandpass' });
  }

  squeak() {
    const osc = this.tone(1700, 0.18, { type: 'triangle', vol: 0.03 });
    osc?.frequency.linearRampToValueAtTime(2300, this.now + 0.18);
  }

  coins() {
    [0, 0.07, 0.15].forEach((at, i) => this.tone(3200 + i * 400, 0.12, { vol: 0.04, at }));
  }

  traffic() {
    if (!this.ctx || this.trafficGain) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    this.trafficGain = this.loop(src, 0.04, 220);
    this.trafficGain.connect(this.out);
  }

  // Diegetic electro-cumbia loop for the diablero's "flow" (speed boost).
  flow(on) {
    if (!this.ctx) return;
    if (!on) {
      clearInterval(this.flowTimer);
      this.flowTimer = null;
      this.cumbiaGain?.gain.setTargetAtTime(0, this.now, 0.15);
      this.lofiGain?.gain.setTargetAtTime(this.lofiBase * (1 - (this.tension ?? 0) * 0.6), this.now, 0.3);
      this.roomGain?.gain.setTargetAtTime(0.015, this.now, 0.3);
      return;
    }
    if (this.flowTimer) return;
    this.createCumbiaBus();
    this.cumbiaGain.gain.setTargetAtTime(0.7, this.now, 0.08);
    this.lofiGain?.gain.setTargetAtTime(this.lofiBase * 0.18, this.now, 0.2);
    this.roomGain?.gain.setTargetAtTime(0.004, this.now, 0.2);
    this.flowTimer = this.startSequencer(CUMBIA_BPM, 4, (step, time) => this.cumbiaStep(step, time));
  }

  // Campfire crackle; returns a stop function.
  fire() {
    if (!this.ctx) return () => {};
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const gain = this.loop(src, 0.05, 900);
    gain.connect(this.out);
    return () => gain.gain.setTargetAtTime(0, this.now, 0.2);
  }

  whisper() {
    this.noise(1.2, { vol: 0.08, freq: 2600, type: 'bandpass', attack: 0.4 });
  }

  stinger() {
    [98, 104, 147, 208, 311, 415, 622].forEach((f) => this.tone(f, 2.8, { type: 'sawtooth', vol: 0.07, attack: 0.005 }));
    this.noise(1.5, { vol: 0.6, freq: 2500, type: 'highpass' });
    this.tone(55, 2, { vol: 0.5, attack: 0.005 });
  }

  silence() {
    clearInterval(this.lofiTimer);
    clearInterval(this.flowTimer);
    this.lofiTimer = null;
    this.flowTimer = null;
    this.out?.gain.setTargetAtTime(0, this.now, 0.4);
  }
}
