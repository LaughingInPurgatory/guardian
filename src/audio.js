// Fully procedural audio: every sound effect and the chiptune score are
// synthesized at runtime with the Web Audio API. No samples, no libraries.
'use strict';
(function () {

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.noiseBuffer = null;
    this.musicTimer = null;
    this.nextNoteTime = 0;
    this.stepIndex = 0;
    this.bpm = 100;
    this.targetBpm = 100;
    this.variant = 0;
  }

  // Must be called from a user-gesture handler (browsers block autoplay otherwise).
  init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.9;
    this.sfxGain.connect(this.master);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.35;
    this.musicGain.connect(this.master);

    this.noiseBuffer = this._buildNoiseBuffer(1.0);
  }

  _buildNoiseBuffer(duration) {
    const rate = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, rate * duration, rate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _env(gainNode, t0, attack, decay, peak) {
    const g = gainNode.gain;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0.0001, t0);
    g.linearRampToValueAtTime(peak, t0 + attack);
    g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  _tone(freq, { type = 'square', duration = 0.15, peak = 0.3, attack = 0.005, glideTo = null, dest = null } = {}) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + duration);
    this._env(gain, t0, attack, duration, peak);
    osc.connect(gain);
    gain.connect(dest || this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  _noiseBurst({ duration = 0.2, peak = 0.5, filterFreq = 1200, dest = null } = {}) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, filterFreq * 0.2), t0 + duration);
    const gain = this.ctx.createGain();
    this._env(gain, t0, 0.005, duration, peak);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(dest || this.sfxGain);
    src.start(t0);
    src.stop(t0 + duration + 0.05);
  }

  shoot() {
    this._tone(700, { type: 'square', duration: 0.09, peak: 0.18, glideTo: 220 });
  }

  enemyShoot() {
    this._tone(300, { type: 'sawtooth', duration: 0.12, peak: 0.14, glideTo: 120 });
  }

  hit() {
    this._noiseBurst({ duration: 0.06, peak: 0.25, filterFreq: 2500 });
  }

  explosion(size = 1) {
    this._noiseBurst({ duration: 0.3 + size * 0.2, peak: 0.5, filterFreq: 900 + size * 300 });
    this._tone(80 / size, { type: 'sine', duration: 0.35 + size * 0.1, peak: 0.4, attack: 0.001 });
  }

  playerHit() {
    this._tone(220, { type: 'sawtooth', duration: 0.5, peak: 0.35, glideTo: 40 });
    this._noiseBurst({ duration: 0.4, peak: 0.3, filterFreq: 1500 });
  }

  powerup() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      setTimeout(() => this._tone(f, { type: 'triangle', duration: 0.12, peak: 0.25 }), i * 55);
    });
  }

  abductAlarm() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(500, t0);
    osc.frequency.linearRampToValueAtTime(800, t0 + 0.15);
    osc.frequency.linearRampToValueAtTime(500, t0 + 0.3);
    this._env(gain, t0, 0.01, 0.35, 0.2);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + 0.4);
  }

  humanoidCaught() {
    this._tone(440, { type: 'triangle', duration: 0.15, peak: 0.25, glideTo: 880 });
  }

  smartBomb() {
    this._noiseBurst({ duration: 0.9, peak: 0.6, filterFreq: 2000 });
    this._tone(60, { type: 'sine', duration: 1.0, peak: 0.5, attack: 0.001 });
  }

  hyperspace() {
    this._tone(1200, { type: 'sine', duration: 0.25, peak: 0.2, glideTo: 80 });
  }

  extraLife() {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
      setTimeout(() => this._tone(f, { type: 'square', duration: 0.15, peak: 0.2 }), i * 70);
    });
  }

  gameOverJingle() {
    [392, 349.2, 293.7, 220].forEach((f, i) => {
      setTimeout(() => this._tone(f, { type: 'sawtooth', duration: 0.4, peak: 0.3 }), i * 220);
    });
  }

  // --- Procedural chiptune music: a lookahead step-sequencer over a small,
  // wave-selected set of scale/pattern variants. Tempo rises with difficulty.
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.stepIndex = 0;
    this.musicTimer = setInterval(() => this._musicScheduler(), 25);
  }

  stopMusic() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  setIntensity(wave) {
    this.targetBpm = 100 + Math.min(160, wave * 2.2);
    this.variant = Math.floor(wave / 8) % SCALES.length;
  }

  _musicScheduler() {
    const scheduleAhead = 0.12;
    this.bpm += (this.targetBpm - this.bpm) * 0.05;
    const stepDur = 60 / this.bpm / 2;
    while (this.nextNoteTime < this.ctx.currentTime + scheduleAhead) {
      this._scheduleMusicStep(this.stepIndex, this.nextNoteTime, stepDur);
      this.nextNoteTime += stepDur;
      this.stepIndex = (this.stepIndex + 1) % 16;
    }
  }

  _scheduleMusicStep(step, time, stepDur) {
    const scale = SCALES[this.variant];
    const bassDeg = BASS_PATTERN[step % BASS_PATTERN.length];
    if (bassDeg !== null) {
      this._scheduledTone(scale.root * scale.ratios[bassDeg] * 0.5, time, stepDur * 1.8, 'triangle', 0.22);
    }
    const leadDeg = LEAD_PATTERN[(step + this.variant * 3) % LEAD_PATTERN.length];
    if (leadDeg !== null) {
      this._scheduledTone(scale.root * scale.ratios[leadDeg] * 2, time, stepDur * 0.9, 'square', 0.12);
    }
  }

  _scheduledTone(freq, t0, duration, type, peak) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }
}

// Minor-pentatonic-ish ratio sets over different roots, picked by wave.
const SCALES = [
  { root: 220, ratios: [1, 1.2, 1.35, 1.5, 1.8] },
  { root: 196, ratios: [1, 1.125, 1.35, 1.5, 1.68] },
  { root: 246.94, ratios: [1, 1.2, 1.33, 1.5, 1.78] },
];
const BASS_PATTERN = [0, null, 2, null, 3, null, 2, null, 0, null, 1, null, 3, null, 2, null];
const LEAD_PATTERN = [0, 2, 3, 4, 3, 2, 4, 0, 1, 3, 4, 2, 0, 3, 2, 1];

const api = { AudioEngine };
if (typeof module !== 'undefined') module.exports = api;
if (typeof window !== 'undefined') window.GuardianAudio = api;

})();
