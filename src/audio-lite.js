// Audio procedural de reserva (Web Audio): música por capas a 96 BPM, análisis del bombo y efectos.
export class AudioSystem {
  constructor() { this.ctx = null; this.phase = 0; this.drones = new Map(); this.kickEnv = 0; this.step = 0; }

  async init() {
    if (this.ctx) return;
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    const ctx = (this.ctx = new C());
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    this.comp = ctx.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 4;
    this.master = ctx.createGain(); this.master.gain.value = 0.85;
    this.master.connect(this.comp); this.comp.connect(ctx.destination);
    this.musicFilter = ctx.createBiquadFilter(); this.musicFilter.type = 'lowpass'; this.musicFilter.frequency.value = 900;
    this.musicGain = ctx.createGain(); this.musicGain.gain.value = 0;
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.musicFilter); this.musicFilter.connect(this.musicGain); this.musicGain.connect(this.master);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
    // reverberación de nave grande
    const len = Math.floor(ctx.sampleRate * 2.8);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    this.verb = ctx.createConvolver(); this.verb.buffer = ir;
    this.verbIn = ctx.createGain(); this.verbIn.gain.value = 0.5; this.verbIn.connect(this.verb); this.verb.connect(this.master);
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
    // bus del bombo con analizador
    this.kickBus = ctx.createGain(); this.kickBus.connect(this.musicBus);
    this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 512; this.kickBus.connect(this.analyser);
    this.td = new Float32Array(this.analyser.fftSize);
    // zumbido eléctrico
    this.hum = ctx.createGain(); this.hum.gain.value = 0.0; this.hum.connect(this.sfx);
    for (const [f, a] of [[50, 0.5], [100, 0.3], [150, 0.12], [1210, 0.012]]) { const o = ctx.createOscillator(); o.type = f > 1000 ? 'sawtooth' : 'sine'; o.frequency.value = f; const g = ctx.createGain(); g.gain.value = a; o.connect(g); g.connect(this.hum); o.start(); }
    this.bpm = 96; this.spb = 60 / this.bpm; this.next = ctx.currentTime + 0.1; this.t0 = this.next;
    this.timer = setInterval(() => this.sched(), 25);
    this.setPhase(this.phase);
  }

  now() { return this.ctx.currentTime; }
  out(pos) {
    if (!pos || !this.ctx) return this.sfx;
    const p = this.ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 2; p.rolloffFactor = 1.1;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
    p.connect(this.sfx); setTimeout(() => p.disconnect(), 4000);
    return p;
  }
  noise(t, dur, { f = 1000, q = 1, type = 'bandpass', gain = 0.5, dest, verb = 0, attack = 0.002, rate = 1 } = {}) {
    const ctx = this.ctx; const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; s.playbackRate.value = rate;
    const bf = ctx.createBiquadFilter(); bf.type = type; bf.frequency.value = f; bf.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(bf); bf.connect(g); g.connect(dest || this.sfx); if (verb) { const v = ctx.createGain(); v.gain.value = verb; g.connect(v); v.connect(this.verbIn); }
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
    return { bf, g };
  }
  tone(t, dur, f0, f1, { type = 'sine', gain = 0.4, dest, verb = 0, attack = 0.003 } = {}) {
    const ctx = this.ctx; const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(dest || this.sfx); if (verb) { const v = this.ctx.createGain(); v.gain.value = verb; g.connect(v); v.connect(this.verbIn); }
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }

  setPhase(p) {
    this.phase = p;
    if (!this.ctx) return;
    const t = this.now();
    const mg = [0, 0, 0.45, 0.7, 0.9, 0][p] ?? 0;
    const ff = [400, 400, 700, 2600, 16000, 400][p] ?? 1000;
    if (p === 5) { this.musicGain.gain.cancelScheduledValues(t); this.musicGain.gain.setValueAtTime(0, t); }
    else { this.musicGain.gain.cancelScheduledValues(t); this.musicGain.gain.setTargetAtTime(mg, t, 0.8); }
    this.musicFilter.frequency.setTargetAtTime(ff, t, 1.2);
    this.hum.gain.setTargetAtTime(p <= 1 ? 0.05 : p === 5 ? 0.03 : 0.012, t, 0.3);
    if (p === 2) { this.next = Math.max(this.next, t + 2.6); this.t0 = this.next; }
  }

  sched() {
    const ctx = this.ctx; if (!ctx) return;
    while (this.next < ctx.currentTime + 0.12) { this.play(this.step, this.next); this.next += this.spb / 4; this.step++; }
    // chasquidos eléctricos en el apagón
    if (this.phase <= 1 && Math.random() < 0.02) this.noise(ctx.currentTime + 0.01, 0.04 + Math.random() * 0.1, { f: 3000, q: 0.5, gain: 0.05 + Math.random() * 0.1, type: 'highpass' });
  }

  play(step, t) {
    const p = this.phase; if (p < 2 || p > 4) return;
    const s = step % 16, bar = Math.floor(step / 16) % 4;
    const roots = [45, 41, 43, 40]; // La, Fa, Sol, Mi (midi-24)
    const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const B = this.musicBus;
    // bombo (a su bus analizado)
    if (s % 4 === 0) { this.tone(t, 0.42, 130, 42, { gain: 0.95, dest: this.kickBus }); this.noise(t, 0.02, { f: 3000, gain: 0.08, dest: this.kickBus }); }
    // pad oscuro
    if (s === 0) {
      const chord = bar === 0 ? [57, 60, 64] : bar === 1 ? [53, 57, 60] : bar === 2 ? [55, 59, 62] : [52, 55, 59];
      for (const n of chord) for (const d of [-7, 7]) {
        const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(n); o.detune.value = d;
        const g = this.ctx.createGain(); const L = this.spb * 4;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.035, t + 0.6); g.gain.linearRampToValueAtTime(0.0, t + L + 0.1);
        const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
        o.connect(f); f.connect(g); g.connect(B); const v = this.ctx.createGain(); v.gain.value = 0.4; g.connect(v); v.connect(this.verbIn);
        o.start(t); o.stop(t + L + 0.2);
      }
    }
    if (p >= 3) {
      // dembow
      if ([3, 6, 11, 14].includes(s)) { this.noise(t, 0.13, { f: 1900, q: 0.9, gain: 0.35, dest: B, verb: 0.2 }); this.tone(t, 0.08, 240, 180, { gain: 0.15, dest: B }); }
      if (s % 2 === 1) this.noise(t, 0.035, { f: 8000, type: 'highpass', gain: 0.07 + (s % 4 === 3 ? 0.04 : 0), dest: B });
      // bajo
      if ([0, 3, 6, 8, 11, 14].includes(s)) {
        const r = roots[bar]; const n = s === 6 || s === 14 ? r + 12 : r;
        const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(n);
        const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(120, t + 0.25); f.Q.value = 6;
        const g = this.ctx.createGain(); g.gain.setValueAtTime(0.28, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        o.connect(f); f.connect(g); g.connect(B); o.start(t); o.stop(t + 0.35);
      }
      if (s === 8 && bar % 2 === 1) this.tone(t, 0.18, mtof(roots[bar] + 36), mtof(roots[bar] + 36), { type: 'square', gain: 0.05, dest: B, verb: 0.5 });
    } else if (s === 0 || s === 8) {
      this.tone(t, 0.5, mtof(roots[bar] + 12), mtof(roots[bar] + 12), { type: 'sine', gain: 0.3, dest: B });
    }
    if (p >= 4) {
      // sirena / lead
      const arp = [0, 3, 7, 12, 7, 3, 10, 7];
      if (s % 2 === 0) this.tone(t, 0.14, mtof(roots[bar] + 36 + arp[(s / 2) % 8]), mtof(roots[bar] + 36 + arp[(s / 2) % 8]) * 1.01, { type: 'square', gain: 0.045, dest: B, verb: 0.4 });
      if (s === 0 && bar === 0) this.tone(t, this.spb * 4, 600, 1200, { type: 'sawtooth', gain: 0.03, dest: B, verb: 0.6, attack: 0.5 });
    }
  }

  getBeat() {
    if (!this.ctx || this.phase < 2 || this.phase > 4) return { kick: 0, beat: 0, bpm: 96, level: 0 };
    return { kick: this.kickEnv, beat: Math.max(0, (this.ctx.currentTime - this.t0) / this.spb), bpm: this.bpm, level: [0, 0, 0.4, 0.75, 1][this.phase] };
  }

  update(dt, pos, fwd) {
    if (!this.ctx) return;
    this.analyser.getFloatTimeDomainData(this.td);
    let s = 0; for (let i = 0; i < this.td.length; i++) s += this.td[i] * this.td[i];
    const rms = Math.min(1, Math.sqrt(s / this.td.length) * 3.2);
    this.kickEnv = rms > this.kickEnv ? this.kickEnv + (rms - this.kickEnv) * Math.min(1, dt * 40) : this.kickEnv * Math.exp(-dt / 0.15);
    const L = this.ctx.listener;
    if (L.positionX) { L.positionX.value = pos.x; L.positionY.value = pos.y; L.positionZ.value = pos.z; L.forwardX.value = fwd.x; L.forwardY.value = fwd.y; L.forwardZ.value = fwd.z; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
    else if (L.setPosition) { L.setPosition(pos.x, pos.y, pos.z); L.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0); }
  }

  // ---------- efectos ----------
  shot() { if (!this.ctx) return; const t = this.now(); const r = 0.9 + Math.random() * 0.2; this.noise(t, 0.09, { f: 2400 * r, q: 0.6, gain: 0.9, verb: 1.2 }); this.noise(t, 0.28, { f: 500, type: 'lowpass', gain: 0.7, verb: 0.9 }); this.tone(t, 0.16, 140 * r, 45, { gain: 0.8 }); this.noise(t + 0.004, 0.02, { f: 6000, type: 'highpass', gain: 0.25 }); }
  casing(pos) { if (!this.ctx) return; const t = this.now() + 0.02; const d = this.out(pos); for (let i = 0; i < 3; i++) { const f = 3200 + Math.random() * 2600; this.tone(t + i * (0.07 - i * 0.015), 0.12, f, f * 0.98, { gain: 0.06 / (i + 1), dest: d }); this.tone(t + i * 0.06, 0.09, f * 1.47, f * 1.46, { gain: 0.03 / (i + 1), dest: d }); } }
  dryFire() { if (!this.ctx) return; this.noise(this.now(), 0.03, { f: 3500, gain: 0.25 }); }
  reload(step) { if (!this.ctx) return; const t = this.now(); if (step === 'out') { this.noise(t, 0.05, { f: 2500, gain: 0.3 }); this.noise(t + 0.08, 0.12, { f: 900, gain: 0.2 }); } else if (step === 'in') { this.noise(t, 0.06, { f: 1400, gain: 0.5 }); this.tone(t, 0.06, 300, 200, { gain: 0.25 }); } else { this.noise(t, 0.05, { f: 3000, gain: 0.35 }); this.noise(t + 0.12, 0.07, { f: 2200, gain: 0.45 }); this.tone(t + 0.12, 0.05, 500, 300, { gain: 0.2 }); } }
  flashlight() { if (!this.ctx) return; this.noise(this.now(), 0.015, { f: 5000, gain: 0.2 }); }
  glass(pos, big) { if (!this.ctx) return; const t = this.now(); const d = this.out(pos); const n = big ? 30 : 12; for (let i = 0; i < n; i++) { const f = 2500 + Math.random() * 6000; this.tone(t + Math.random() * (big ? 0.6 : 0.25), 0.1 + Math.random() * 0.2, f, f, { gain: (big ? 0.08 : 0.06), dest: d, verb: 0.2 }); } this.noise(t, big ? 0.6 : 0.25, { f: 5000, type: 'highpass', gain: big ? 0.6 : 0.35, dest: d, verb: 0.4 }); }
  impact(pos, mat) { if (!this.ctx) return; const t = this.now(); const d = this.out(pos); if (mat === 'metal') { const f = 900 + Math.random() * 1400; this.tone(t, 0.35, f, f * 0.97, { gain: 0.12, dest: d, verb: 0.3 }); this.tone(t, 0.25, f * 2.4, f * 2.3, { gain: 0.05, dest: d }); } else if (mat === 'glass') this.glass(pos, false); else if (mat === 'body') { this.tone(t, 0.12, 110, 60, { gain: 0.35, dest: d }); } else this.noise(t, mat === 'wood' ? 0.1 : 0.07, { f: mat === 'wood' ? 700 : 1600, gain: 0.35, dest: d, verb: 0.15 }); }
  explosion(pos, size = 0.5) { if (!this.ctx) return; const t = this.now(); const d = this.out(pos); this.noise(t, 0.8 + size * 1.6, { f: 700, type: 'lowpass', gain: 0.9, dest: d, verb: 1, attack: 0.005 }); this.tone(t, 0.6 + size, 90, 30, { gain: 0.8, dest: d }); this.noise(t, 0.2, { f: 3000, gain: 0.4, dest: d }); }
  droneStart(id, pos, big) {
    if (!this.ctx || this.drones.has(id)) return;
    const ctx = this.ctx; const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = big ? 62 : 190 + Math.random() * 30;
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = o.frequency.value * 1.51;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 7 + Math.random() * 3; const lg = ctx.createGain(); lg.gain.value = big ? 4 : 12; lfo.connect(lg); lg.connect(o.frequency);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = big ? 300 : 900; f.Q.value = 1.2;
    const g = ctx.createGain(); g.gain.value = big ? 0.35 : 0.12;
    const p = ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = big ? 5 : 2;
    o.connect(f); o2.connect(f); f.connect(g); g.connect(p); p.connect(this.sfx); o.start(); o2.start(); lfo.start();
    this.drones.set(id, { o, o2, lfo, g, p }); this.droneUpdate(id, pos, 0.5);
  }
  droneUpdate(id, pos, intensity) { const d = this.drones.get(id); if (!d || !pos) return; const p = d.p; if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z); }
  droneStop(id) { const d = this.drones.get(id); if (!d) return; const t = this.now(); d.g.gain.setTargetAtTime(0, t, 0.1); setTimeout(() => { try { d.o.stop(); d.o2.stop(); d.lfo.stop(); d.p.disconnect(); } catch (e) { /* ya parado */ } }, 600); this.drones.delete(id); }
  droneShot(pos) { if (!this.ctx) return; const t = this.now(); this.tone(t, 0.18, 1800, 260, { type: 'square', gain: 0.1, dest: this.out(pos), verb: 0.3 }); }
  enemyShot(pos) { if (!this.ctx) return; const t = this.now(); const d = this.out(pos); this.noise(t, 0.12, { f: 1800, q: 0.7, gain: 0.7, dest: d, verb: 1 }); this.tone(t, 0.12, 120, 50, { gain: 0.4, dest: d }); }
  hurt() { if (!this.ctx) return; const t = this.now(); this.tone(t, 0.25, 90, 40, { gain: 0.6 }); this.musicFilter.frequency.cancelScheduledValues(t); const cur = [400, 400, 700, 2600, 16000, 400][this.phase] || 1000; this.musicFilter.frequency.setValueAtTime(300, t); this.musicFilter.frequency.setTargetAtTime(cur, t + 0.2, 0.3); }
  generator() { if (!this.ctx) return; const t = this.now(); this.noise(t, 0.12, { f: 1200, gain: 1, verb: 1.2 }); this.tone(t, 0.3, 70, 40, { gain: 0.9 }); const o = this.tone(t + 0.3, 2.3, 45, 380, { type: 'sawtooth', gain: 0.12, verb: 0.5, attack: 0.4 }); void o; for (let i = 0; i < 8; i++) this.noise(t + 0.4 + Math.random() * 2, 0.06, { f: 2500, gain: 0.25, type: 'highpass' }); this.noise(t + 2.5, 0.1, { f: 900, gain: 0.8, verb: 1 }); }
  mirrorBallFall(pos) { if (!this.ctx) return; const t = this.now(); const d = this.out(pos); for (let i = 0; i < 5; i++) this.tone(t + i * 0.03, 0.08, 2500 + i * 300, 2400, { gain: 0.1, dest: d }); }
  footstep(running, metal) { if (!this.ctx) return; const t = this.now(); this.noise(t, 0.06, { f: running ? 900 : 700, gain: running ? 0.12 : 0.07, type: 'lowpass' }); if (metal) { const f = 380 + Math.random() * 60; this.tone(t, 0.3, f, f * 0.98, { gain: 0.12, verb: 0.3 }); this.tone(t, 0.2, f * 2.76, f * 2.7, { gain: 0.05 }); } }
  lightsOn() { if (!this.ctx) return; const t = this.now(); for (let i = 0; i < 3; i++) { this.noise(t + i * 0.27, 0.15, { f: 600, gain: 0.9, verb: 1.3 }); this.tone(t + i * 0.27, 0.2, 80, 50, { gain: 0.6 }); } }
  alarm() { if (!this.ctx) return; const t = this.now(); for (let i = 0; i < 6; i++) this.tone(t + i * 0.35, 0.3, i % 2 ? 660 : 880, i % 2 ? 660 : 880, { type: 'square', gain: 0.08, verb: 0.5 }); }
}
