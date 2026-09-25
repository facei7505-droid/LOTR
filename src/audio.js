// ================= AUDIO: synthesized battle sounds, ambience and generative music (no audio files) =================
const MUSIC = {
  // root frequency, scale (semitones), chord progression (scale degrees), lead instrument, drum weight
  menu: { root: 146.83, scale: [0, 2, 3, 5, 7, 9, 10], prog: [0, 5, 3, 4], lead: 'lute', drums: 0.3 },
  hum: { root: 146.83, scale: [0, 2, 3, 5, 7, 9, 10], prog: [0, 5, 3, 4], lead: 'horn', drums: 0.7 },
  elf: { root: 164.81, scale: [0, 2, 4, 6, 7, 9, 11], prog: [0, 3, 4, 0], lead: 'flute', drums: 0.4 },
  dwf: { root: 110.0, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 6, 0], lead: 'horn', drums: 1 },
  orc: { root: 98.0, scale: [0, 1, 3, 5, 7, 8, 10], prog: [0, 1, 0, 6], lead: 'brass', drums: 1.2 },
  und: { root: 92.5, scale: [0, 1, 3, 5, 6, 8, 10], prog: [0, 6, 5, 1], lead: 'brass', drums: 0.8 },
  des: { root: 138.59, scale: [0, 1, 4, 5, 7, 8, 10], prog: [0, 1, 0, 6], lead: 'flute', drums: 0.95 },
};
const Snd = {
  ctx: null, on: true, musicOn: true, last: {}, intensity: 0, targetI: 0, theme: 'menu',
  step: 0, nextT: 0, melDeg: 4, amb: {},
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    const c = this.ctx;
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -16; this.comp.ratio.value = 4; this.comp.connect(c.destination);
    this.master = c.createGain(); this.master.gain.value = 0.9; this.master.connect(this.comp);
    this.sfx = c.createGain(); this.sfx.gain.value = this.on ? this.vol : 0; this.sfx.connect(this.master);
    this.mus = c.createGain(); this.mus.gain.value = this.musicOn && this.on ? 0.55 * this.mvol : 0; this.mus.connect(this.master);
    // generated hall reverb
    const len = c.sampleRate * 2.4, ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    this.rev = c.createConvolver(); this.rev.buffer = ir; this.revIn = c.createGain(); this.revIn.gain.value = 0.35; this.revIn.connect(this.rev); this.rev.connect(this.master);
    const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1; this.noiseBuf = nb;
    this.nextT = c.currentTime + 0.2;
    setInterval(() => this.schedule(), 90);
  },
  vol: 1, mvol: 1,
  setOn(v) { this.on = v; if (this.sfx) { this.sfx.gain.value = v ? this.vol : 0; this.mus.gain.value = v && this.musicOn ? 0.55 * this.mvol : 0; } },
  setMusic(v) { this.musicOn = v; if (this.mus) this.mus.gain.setTargetAtTime(v && this.on ? 0.55 * this.mvol : 0, this.ctx.currentTime, 0.3); },
  setVol(a, b) { this.vol = a; this.mvol = b; this.setOn(this.on); },
  setTheme(k) { if (MUSIC[k]) this.theme = k; },
  setIntensity(x) { this.targetI = clamp(x, 0, 1); },
  // ---- building blocks ----
  env(g, t, a, peak, dec) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); },
  osc(type, f, t, dur, out, peak, a) { const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); o.connect(g); g.connect(out); this.env(g, t, a || 0.005, peak, dur); o.start(t); o.stop(t + (a || 0.005) + dur + 0.05); return o; },
  noise(t, dur, out, peak, type, f, q, a) { const c = this.ctx, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(); s.buffer = this.noiseBuf; fl.type = type || 'bandpass'; fl.frequency.setValueAtTime(f || 1000, t); fl.Q.value = q || 1; s.connect(fl); fl.connect(g); g.connect(out); this.env(g, t, a || 0.003, peak, dur); s.start(t, Math.random()); s.stop(t + (a || 0.003) + dur + 0.05); return fl; },
  out(pan) { const c = this.ctx; if (!pan || !c.createStereoPanner) return this.sfx; const p = c.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); p.connect(this.sfx); const s = c.createGain(); s.gain.value = 0.25; p.connect(s); s.connect(this.revIn); return p; },
  play(k, vol, pan) {
    if (!this.on || !this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const gap = { clash: 0.045, arrow: 0.05, hit: 0.04, gallop: 0.3, step: 0.2 }[k] || 0.07;
    if (this.last[k] && t - this.last[k] < gap) return; this.last[k] = t;
    const out = this.out(pan), v = vol || 1;
    if (k === 'clash') { // steel on steel: inharmonic partials + a click
      const f = 1400 + Math.random() * 1600;
      for (const m of [1, 1.51, 2.33, 3.17]) this.osc(m > 2 ? 'triangle' : 'square', f * m * (0.98 + Math.random() * 0.04), t, 0.08 + Math.random() * 0.14, out, 0.05 * v / m);
      this.noise(t, 0.04, out, 0.25 * v, 'highpass', 2500, 0.7);
    } else if (k === 'hit') this.noise(t, 0.09, out, 0.35 * v, 'lowpass', 420, 0.8);
    else if (k === 'arrow') { const fl = this.noise(t, 0.16, out, 0.12 * v, 'bandpass', 3200, 4); fl.frequency.exponentialRampToValueAtTime(900, t + 0.16); }
    else if (k === 'boom') { this.noise(t, 0.9, out, 0.7 * v, 'lowpass', 260, 0.7); const o = this.osc('sine', 110, t, 0.6, out, 0.5 * v); o.frequency.exponentialRampToValueAtTime(32, t + 0.6); this.noise(t, 0.2, out, 0.2 * v, 'highpass', 1800, 0.5); }
    else if (k === 'thunder') { this.noise(t, 3.2, this.sfx, 0.55 * v, 'lowpass', 180, 0.6, 0.08); this.noise(t + 0.05, 0.5, this.sfx, 0.35 * v, 'lowpass', 900, 0.5); }
    else if (k === 'horn') { // war horn with vibrato and opening filter
      const o = c.createOscillator(), o2 = c.createOscillator(), fl = c.createBiquadFilter(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
      o.type = 'sawtooth'; o2.type = 'sawtooth'; o.frequency.setValueAtTime(98, t); o.frequency.linearRampToValueAtTime(110, t + 0.25); o2.frequency.setValueAtTime(98.8, t); o2.frequency.linearRampToValueAtTime(110.6, t + 0.25);
      lfo.frequency.value = 5; lg.gain.value = 1.4; lfo.connect(lg); lg.connect(o.frequency);
      fl.type = 'lowpass'; fl.frequency.setValueAtTime(300, t); fl.frequency.linearRampToValueAtTime(1300, t + 0.4); fl.frequency.linearRampToValueAtTime(500, t + 1.5);
      o.connect(fl); o2.connect(fl); fl.connect(g); g.connect(out); const s = c.createGain(); s.gain.value = 0.5; g.connect(s); s.connect(this.revIn);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18 * v, t + 0.2); g.gain.setValueAtTime(0.18 * v, t + 1.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
      for (const x of [o, o2, lfo]) { x.start(t); x.stop(t + 1.8); }
    }
    else if (k === 'gallop') for (let i = 0; i < 3; i++) this.noise(t + i * 0.09, 0.05, out, 0.18 * v, 'lowpass', 220, 1);
    else if (k === 'heal') [523, 659, 784, 1047].forEach((f, i) => this.osc('sine', f, t + i * 0.06, 0.5, out, 0.06 * v));
    else if (k === 'lvl') [440, 554, 659, 880].forEach((f, i) => this.osc('triangle', f, t + i * 0.08, 0.35, out, 0.08 * v));
    else if (k === 'click') this.osc('square', 700, t, 0.04, this.sfx, 0.03);
    else if (k === 'build') for (let i = 0; i < 3; i++) { this.osc('triangle', 900 + i * 40, t + i * 0.14, 0.08, out, 0.08 * v); this.noise(t + i * 0.14, 0.03, out, 0.12 * v, 'bandpass', 2000, 2); }
    else if (k === 'anvil') { for (const m of [1, 2.76, 5.4]) this.osc('sine', 620 * m, t, 0.9 / m, out, 0.09 * v / m); this.noise(t, 0.03, out, 0.2 * v, 'highpass', 3000, 1); }
    else if (k === 'coins') for (let i = 0; i < 7; i++) this.osc('sine', 2200 + Math.random() * 1600, t + i * 0.05 + Math.random() * 0.03, 0.2, out, 0.04 * v);
    else if (k === 'death') { const fl = this.noise(t, 0.35, out, 0.12 * v, 'bandpass', 600, 3); fl.frequency.exponentialRampToValueAtTime(260, t + 0.35); }
  },
  // looping weather beds (rain hiss, winter wind)
  ambience(kind, amt) {
    if (!this.ctx) return;
    for (const k of ['rain', 'wind']) {
      let a = this.amb[k];
      const want = this.on && ((k === 'rain' && kind === 'rain') || (k === 'wind' && (kind === 'snow' || kind === 'fog'))) ? amt : 0;
      if (!a && want <= 0) continue;
      if (!a) {
        const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
        s.buffer = this.noiseBuf; s.loop = true; f.type = k === 'rain' ? 'highpass' : 'bandpass'; f.frequency.value = k === 'rain' ? 900 : 420; f.Q.value = k === 'rain' ? 0.5 : 0.8;
        g.gain.value = 0; s.connect(f); f.connect(g); g.connect(this.master); s.start(); a = this.amb[k] = { g, f };
      }
      a.g.gain.setTargetAtTime(want * (k === 'rain' ? 0.12 : 0.08), this.ctx.currentTime, 0.8);
      if (k === 'wind') a.f.frequency.setTargetAtTime(380 + Math.sin(this.ctx.currentTime * 0.3) * 160, this.ctx.currentTime, 1);
    }
  },
  // ---- generative score: pad + bass + lead + war drums, denser when battle intensity rises ----
  schedule() {
    const c = this.ctx; if (!c || !this.musicOn || !this.on) { if (c) this.nextT = c.currentTime + 0.1; return; }
    this.intensity += (this.targetI - this.intensity) * 0.05;
    const M = MUSIC[this.theme] || MUSIC.menu, I = this.intensity;
    const spb = 60 / (70 + I * 34) / 2; // eighth notes
    const freq = (deg, oct) => { const n = M.scale.length, o = Math.floor(deg / n), d = ((deg % n) + n) % n; return M.root * Math.pow(2, oct + o + M.scale[d] / 12); };
    while (this.nextT < c.currentTime + 0.3) {
      const t = this.nextT, st = this.step, beat = st % 8, bar = Math.floor(st / 8), chord = M.prog[bar % M.prog.length];
      if (beat === 0 && bar % 2 === 0) {
        for (const k of [0, 2, 4]) { const o = this.osc('sawtooth', freq(chord + k, 0), t, spb * 15, this.mus, 0.018, spb * 5); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700; o.disconnect(); o.connect(f); const g = c.createGain(); f.connect(g); g.connect(this.mus); g.connect(this.revIn); this.env(g, t, spb * 5, 0.02, spb * 11); }
        this.osc('triangle', freq(chord, -1), t, spb * 14, this.mus, 0.07, 0.05);
      }
      // lead: a wandering melody around the chord
      const play = (beat % 2 === 0 ? 0.55 : 0.2) + I * 0.2;
      if (bar % 8 !== 7 && Math.random() < play) {
        this.melDeg = clamp(this.melDeg + [-2, -1, -1, 0, 1, 1, 2][(Math.random() * 7) | 0], 0, 11);
        if (Math.random() < 0.35) this.melDeg = chord + [0, 2, 4, 7][(Math.random() * 4) | 0];
        const f = freq(this.melDeg, 1), dur = spb * (Math.random() < 0.3 ? 3 : 1.6);
        const g = c.createGain(); g.connect(this.mus); const s = c.createGain(); s.gain.value = 0.6; g.connect(s); s.connect(this.revIn);
        if (M.lead === 'flute') { const o = this.osc('sine', f, t, dur, g, 0.05, 0.06); const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 5.5; lg.gain.value = f * 0.008; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.2); this.noise(t, dur * 0.6, g, 0.006, 'bandpass', f * 2, 2, 0.05); }
        else if (M.lead === 'lute') { this.osc('triangle', f, t, dur * 0.9, g, 0.06); this.osc('sine', f * 2, t, dur * 0.4, g, 0.02); }
        else { const o = this.osc('sawtooth', f / (M.lead === 'brass' ? 2 : 1), t, dur, g, 0.03, 0.05); const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = M.lead === 'brass' ? 700 : 1100; o.disconnect(); o.connect(fl); fl.connect(g); this.env(g, t, 0.05, 0.6, dur); }
      }
      // war drums
      const dw = M.drums * (0.25 + I);
      const pat = I > 0.45 ? [1, 0, 0.6, 1, 0, 0.7, 1, 0.5] : [1, 0, 0, 0, 0.6, 0, 0, 0];
      if (pat[beat] && dw > 0.2) { const o = this.osc('sine', 95, t, 0.35, this.mus, 0.22 * dw * pat[beat]); o.frequency.exponentialRampToValueAtTime(42, t + 0.3); this.noise(t, 0.08, this.mus, 0.05 * dw, 'lowpass', 500, 0.7); }
      if (I > 0.6 && beat % 4 === 2) this.noise(t, 0.12, this.mus, 0.05 * dw, 'bandpass', 1800, 1.2);
      this.nextT += spb; this.step++;
    }
  },
};
