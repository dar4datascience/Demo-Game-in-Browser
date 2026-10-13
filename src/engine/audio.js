// All sound is synthesized with WebAudio, so the demo ships with zero audio assets.
export class Sfx {
  init() {
    if (this.ctx) return;
    const ctx = (this.ctx = new AudioContext());
    this.out = ctx.createGain();
    this.out.gain.value = 0.9;
    this.out.connect(ctx.destination);
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  get now() {
    return this.ctx.currentTime;
  }

  env(gain, t, vol, attack, dur) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  tone(freq, dur, { type = 'sine', vol = 0.2, at = 0, attack = 0.01 } = {}) {
    if (!this.ctx) return null;
    const t = this.now + at;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = this.ctx.createGain();
    this.env(gain, t, vol, attack, dur);
    osc.connect(gain).connect(this.out);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    return osc;
  }

  noise(dur, { vol = 0.2, at = 0, freq = 1000, type = 'lowpass', attack = 0.005 } = {}) {
    if (!this.ctx) return;
    const t = this.now + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const gain = this.ctx.createGain();
    this.env(gain, t, vol, attack, dur);
    src.connect(filter).connect(gain).connect(this.out);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
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
    this.loop(room, 0.015, 500).connect(this.out);
    // Dread drone, raised as tension builds.
    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = 0;
    this.droneGain.connect(this.out);
    this.loop(this.osc('sine', 41), 1, 400).connect(this.droneGain);
    this.loop(this.osc('sine', 41.7), 1, 400).connect(this.droneGain);
    this.loop(this.osc('triangle', 61.5), 0.4, 300).connect(this.droneGain);
  }

  setPower(on) {
    this.humGain?.gain.setTargetAtTime(on ? 0.03 : 0, this.now, 0.03);
  }

  setTension(v) {
    this.droneGain?.gain.setTargetAtTime(v * 0.14, this.now, 1.5);
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

  stinger() {
    [98, 104, 147, 208, 311, 415, 622].forEach((f) => this.tone(f, 2.8, { type: 'sawtooth', vol: 0.07, attack: 0.005 }));
    this.noise(1.5, { vol: 0.6, freq: 2500, type: 'highpass' });
    this.tone(55, 2, { vol: 0.5, attack: 0.005 });
  }

  silence() {
    this.out?.gain.setTargetAtTime(0, this.now, 0.4);
  }
}
