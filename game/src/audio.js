// PALMA HEAT — procedural WebAudio sound effects. No audio files:
// every sound is synthesised from oscillators and filtered noise.

class PalmaAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenTimer = 0;
    this.enabled = true;
  }

  // Must be called from a user gesture at least once.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.enabled = false; return; }
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    } catch (err) {
      this.enabled = false;
    }
  }

  now() { return this.ctx ? this.ctx.currentTime : 0; }

  tone(freq, dur, type, vol, slideTo, delay) {
    if (!this.ctx || !this.enabled) return;
    const t0 = this.now() + (delay || 0);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol || 0.2, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain); gain.connect(this.master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  noise(dur, vol, freq, q, delay) {
    if (!this.ctx || !this.enabled) return;
    const t0 = this.now() + (delay || 0);
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq || 1200;
    filter.Q.value = q || 0.8;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol || 0.3, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter); filter.connect(gain); gain.connect(this.master);
    src.start(t0);
  }

  shot() {
    this.noise(0.16, 0.55, 900, 0.5);
    this.tone(160, 0.12, 'square', 0.25, 40);
  }

  dryFire() { this.tone(1200, 0.04, 'square', 0.08); }

  reload() {
    this.tone(500, 0.05, 'square', 0.12);
    this.tone(700, 0.05, 'square', 0.12, null, 0.14);
    this.tone(420, 0.06, 'square', 0.14, null, 0.3);
  }

  hit() { this.noise(0.08, 0.3, 2400, 1.2); }

  crash(strength) {
    const s = Math.min(1, strength || 0.5);
    this.noise(0.3, 0.5 * s, 300, 0.4);
    this.tone(90, 0.28, 'triangle', 0.4 * s, 35);
  }

  door() {
    this.tone(220, 0.07, 'triangle', 0.2, 140);
    this.noise(0.05, 0.12, 700, 1, 0.05);
  }

  pickup() {
    this.tone(660, 0.12, 'sine', 0.25);
    this.tone(990, 0.2, 'sine', 0.25, null, 0.1);
  }

  cashRegister() {
    this.tone(880, 0.1, 'triangle', 0.25);
    this.tone(1174, 0.12, 'triangle', 0.25, null, 0.09);
    this.tone(1568, 0.24, 'triangle', 0.28, null, 0.18);
    this.noise(0.1, 0.1, 5000, 2, 0.02);
  }

  bustSting() {
    this.tone(392, 0.22, 'sawtooth', 0.2);
    this.tone(311, 0.22, 'sawtooth', 0.2, null, 0.2);
    this.tone(233, 0.5, 'sawtooth', 0.22, null, 0.4);
  }

  wastedSting() {
    this.tone(330, 0.3, 'triangle', 0.25, 320);
    this.tone(262, 0.3, 'triangle', 0.25, 250, 0.28);
    this.tone(196, 0.7, 'triangle', 0.28, 130, 0.56);
  }

  step() { this.noise(0.045, 0.06, 500, 0.7); }

  // Two-tone police siren blip; call sparingly, throttled by update().
  sirenBlip() {
    this.tone(720, 0.16, 'triangle', 0.1);
    this.tone(960, 0.16, 'triangle', 0.1, null, 0.16);
  }

  update(dt, opts) {
    if (!this.ctx || !this.enabled) return;
    // Siren cadence while police are close.
    if (opts && opts.policeNear && opts.wanted > 0) {
      this.sirenTimer -= dt;
      if (this.sirenTimer <= 0) {
        this.sirenBlip();
        this.sirenTimer = 0.85;
      }
    } else {
      this.sirenTimer = 0.2;
    }
  }

  engineStart() {
    if (!this.ctx || !this.enabled || this.engineOsc) return;
    const t0 = this.now();
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.setValueAtTime(38, t0);
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 320;
    this.engineFilter.Q.value = 2;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.setValueAtTime(0.0, t0);
    this.engineGain.gain.linearRampToValueAtTime(0.12, t0 + 0.25);
    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start(t0);
    this.tone(70, 0.3, 'square', 0.15, 120);
  }

  engineUpdate(speedRatio, rpmLoad) {
    if (!this.engineOsc) return;
    const t = this.now();
    const freq = 42 + Math.abs(speedRatio) * 95 + (rpmLoad || 0) * 28;
    this.engineOsc.frequency.setTargetAtTime(freq, t, 0.06);
    this.engineFilter.frequency.setTargetAtTime(280 + Math.abs(speedRatio) * 900, t, 0.08);
  }

  engineStop() {
    if (!this.engineOsc) return;
    try {
      const t = this.now();
      this.engineGain.gain.setTargetAtTime(0.0, t, 0.08);
      const osc = this.engineOsc;
      window.setTimeout(() => { try { osc.stop(); } catch (e) { /* already stopped */ } }, 350);
    } catch (e) { /* ignore */ }
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
  }
}

export const audio = new PalmaAudio();
