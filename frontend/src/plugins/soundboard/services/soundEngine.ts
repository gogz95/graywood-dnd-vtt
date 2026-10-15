// frontend/src/plugins/soundboard/services/soundEngine.ts
// Dependency-free Web Audio Synthesizer & Procedural Sound FX Engine

const VOL_STORAGE_KEY = 'vtt_soundboard_volume';
const MUTE_STORAGE_KEY = 'vtt_soundboard_muted';

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private volume: number = 0.7;
  private muted: boolean = false;

  constructor() {
    this.loadSettings();
  }

  private loadSettings(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const savedVol = localStorage.getItem(VOL_STORAGE_KEY);
      if (savedVol !== null) {
        const parsed = parseFloat(savedVol);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
          this.volume = parsed;
        }
      }
      const savedMute = localStorage.getItem(MUTE_STORAGE_KEY);
      if (savedMute !== null) {
        this.muted = savedMute === 'true';
      }
    } catch {
      // Ignore storage errors
    }
  }

  private saveSettings(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(VOL_STORAGE_KEY, this.volume.toString());
      localStorage.setItem(MUTE_STORAGE_KEY, this.muted.toString());
    } catch {
      // Ignore storage errors
    }
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    return this.ctx;
  }

  public getVolume(): number {
    return this.volume;
  }

  public setVolume(val: number): void {
    this.volume = Math.max(0, Math.min(1, val));
    this.saveSettings();
    if (this.ctx && this.masterGain && !this.muted) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    this.saveSettings();
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setValueAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime);
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /**
   * Dual sine-wave harmonic chime signaling combat turn transitions.
   */
  public playTurnChime(): void {
    const ctx = this.getAudioContext();
    if (!ctx || !this.masterGain || this.muted) return;

    const now = ctx.currentTime;
    const duration = 1.2;

    const chimeGain = ctx.createGain();
    chimeGain.gain.setValueAtTime(0.001, now);
    chimeGain.gain.exponentialRampToValueAtTime(0.4, now + 0.05);
    chimeGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    chimeGain.connect(this.masterGain);

    // Primary bell tone (E5: 659.25 Hz)
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    osc1.connect(chimeGain);

    // Harmonic overtone (G#5: 830.61 Hz)
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(830.61, now + 0.04);
    osc2.connect(chimeGain);

    osc1.start(now);
    osc2.start(now + 0.04);
    osc1.stop(now + duration);
    osc2.stop(now + duration);
  }

  /**
   * Low-frequency sawtooth impact with aggressive noise burst for critical hits.
   */
  public playCritImpact(): void {
    const ctx = this.getAudioContext();
    if (!ctx || !this.masterGain || this.muted) return;

    const now = ctx.currentTime;

    // Sub-bass impact saw drop (130Hz -> 35Hz)
    const subOsc = ctx.createOscillator();
    subOsc.type = 'sawtooth';
    subOsc.frequency.setValueAtTime(130, now);
    subOsc.frequency.exponentialRampToValueAtTime(35, now + 0.45);

    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.6, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    const subFilter = ctx.createBiquadFilter();
    subFilter.type = 'lowpass';
    subFilter.frequency.setValueAtTime(320, now);

    subOsc.connect(subFilter);
    subFilter.connect(subGain);
    subGain.connect(this.masterGain);

    subOsc.start(now);
    subOsc.stop(now + 0.5);

    // Transient noise impact crack
    const bufferSize = ctx.sampleRate * 0.25;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(1100, now);
    noiseFilter.Q.setValueAtTime(2.5, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    noiseSource.start(now);
    noiseSource.stop(now + 0.25);
  }

  /**
   * Procedural dice rolling sound with random friction impulses and rattle.
   */
  public playDiceRoll(): void {
    const ctx = this.getAudioContext();
    if (!ctx || !this.masterGain || this.muted) return;

    const now = ctx.currentTime;
    const clickCount = 6;

    for (let i = 0; i < clickCount; i++) {
      const clickTime = now + (i * 0.05) + (Math.random() * 0.03);
      const freq = 450 + Math.random() * 600;

      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, clickTime);
      osc.frequency.exponentialRampToValueAtTime(180, clickTime + 0.04);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, clickTime);
      gain.gain.exponentialRampToValueAtTime(0.35 * (1 - i / clickCount), clickTime + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, clickTime + 0.04);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(clickTime);
      osc.stop(clickTime + 0.045);
    }
  }
}

export const soundEngine = new SoundEngine();

export function playTurnChime(): void {
  soundEngine.playTurnChime();
}

export function playCritImpact(): void {
  soundEngine.playCritImpact();
}

export function playDiceRoll(): void {
  soundEngine.playDiceRoll();
}
