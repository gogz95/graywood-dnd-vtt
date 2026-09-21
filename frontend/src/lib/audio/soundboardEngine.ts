// src/lib/audio/soundboardEngine.ts
// Multi-Channel Web Audio Ambient Mixer, Combat Music Sequencer & SFX Soundboard
// Features 3 isolated audio busses with smooth 2-second crossfading and systemBus hookups

import { systemBus } from '../services/systemBus';

export type AtmospherePreset = 'rain' | 'tavern' | 'dungeon' | 'wind' | 'silence';
export type CombatTrack = 'tension' | 'battle' | 'boss' | 'none';
export type SfxTrigger = 'sword_clash' | 'fireball' | 'crit_fanfare' | 'fumble_stinger' | 'door_creak';

export interface SoundboardState {
  masterVol: number;
  atmosphereVol: number;
  combatVol: number;
  sfxVol: number;
  activeAtmosphere: AtmospherePreset | string;
  activeCombat: CombatTrack | string;
  isCombatActive: boolean;
}

class SoundboardEngine {
  private ctx: AudioContext | null = null;

  // Audio Busses
  private masterGain: GainNode | null = null;
  private atmosphereGain: GainNode | null = null;
  private combatGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  // Active Loops / Nodes
  private atmosphereSource: AudioNode | null = null;
  private atmosphereInterval: number | null = null;
  private combatSource: AudioNode | null = null;
  private combatInterval: number | null = null;

  // State
  private masterVol = 0.8;
  private atmosphereVol = 0.6;
  private combatVol = 0.7;
  private sfxVol = 0.85;

  private currentAtmosphere: AtmospherePreset | string = 'silence';
  private currentCombat: CombatTrack | string = 'none';
  private inCombat = false;
  private prevAtmosphereBeforeCombat: AtmospherePreset | string = 'silence';

  constructor() {
    if (typeof window !== 'undefined') {
      this.initSystemBusListeners();
    }
  }

  private initSystemBusListeners(): void {
    systemBus.on('COMBAT_START', () => {
      this.handleCombatStart();
    });

    systemBus.on('COMBAT_END', () => {
      this.handleCombatEnd();
    });
  }

  public async getContext(): Promise<AudioContext> {
    if (!this.ctx && typeof window !== 'undefined') {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AC) {
        this.ctx = new AC();
        this.setupGraph();
      }
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    return this.ctx!;
  }

  private setupGraph(): void {
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.masterVol, t);

    this.atmosphereGain = this.ctx.createGain();
    this.atmosphereGain.gain.setValueAtTime(this.atmosphereVol, t);

    this.combatGain = this.ctx.createGain();
    this.combatGain.gain.setValueAtTime(this.combatVol, t);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.setValueAtTime(this.sfxVol, t);

    this.atmosphereGain.connect(this.masterGain);
    this.combatGain.connect(this.masterGain);
    this.sfxGain.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // CHANNEL 1: ATMOSPHERE (Looping Environmental Background + 2s Crossfade)
  // ───────────────────────────────────────────────────────────────────────────

  public async crossfadeAtmosphere(presetOrUrl: string, durationMs = 2000): Promise<void> {
    return this.setAtmosphere(presetOrUrl, durationMs / 1000);
  }

  public async setAtmosphere(preset: AtmospherePreset | string, crossfadeSec = 2.0): Promise<void> {
    const ctx = await this.getContext();
    if (!ctx || !this.atmosphereGain) return;

    if (this.currentAtmosphere === preset) return;

    const now = ctx.currentTime;

    // Smooth 2-second crossfade down on existing atmosphere
    if (this.atmosphereSource) {
      const oldGain = this.atmosphereGain.gain;
      oldGain.cancelScheduledValues(now);
      oldGain.setValueAtTime(oldGain.value, now);
      oldGain.linearRampToValueAtTime(0.0001, now + crossfadeSec);

      const oldSource = this.atmosphereSource;
      const oldTimer = this.atmosphereInterval;
      setTimeout(() => {
        try {
          if ('stop' in oldSource && typeof (oldSource as AudioScheduledSourceNode).stop === 'function') {
            (oldSource as AudioScheduledSourceNode).stop();
          }
          oldSource.disconnect();
        } catch (_) {}
        if (oldTimer) clearInterval(oldTimer);
      }, crossfadeSec * 1000 + 100);
    }

    this.currentAtmosphere = preset;
    if (preset === 'silence') {
      this.atmosphereSource = null;
      return;
    }

    // Instantiate new sound generator
    const newGainNode = ctx.createGain();
    newGainNode.gain.setValueAtTime(0.0001, now);
    newGainNode.linearRampToValueAtTime(this.atmosphereVol, now + crossfadeSec);
    newGainNode.connect(this.masterGain!);

    this.startAtmosphereSynthesis(ctx, preset, newGainNode);
    this.atmosphereGain = newGainNode;
  }

  private startAtmosphereSynthesis(ctx: AudioContext, preset: string, outputNode: GainNode): void {
    if (this.atmosphereInterval) {
      clearInterval(this.atmosphereInterval);
      this.atmosphereInterval = null;
    }

    if (preset === 'rain') {
      // Pink/white noise through bandpass filter + random water droplets
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        output[i] = (b0 + b1 + b2) * 0.12;
      }

      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1200, ctx.currentTime);

      whiteNoise.connect(filter);
      filter.connect(outputNode);
      whiteNoise.start();
      this.atmosphereSource = whiteNoise;

      // Periodic random drops
      this.atmosphereInterval = window.setInterval(() => {
        if (!this.ctx || this.currentAtmosphere !== 'rain') return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const dropGain = this.ctx.createGain();
        osc.frequency.setValueAtTime(1800 + Math.random() * 800, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.06);
        dropGain.gain.setValueAtTime(0.04, now);
        dropGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
        osc.connect(dropGain);
        dropGain.connect(outputNode);
        osc.start(now);
        osc.stop(now + 0.07);
      }, 150);

    } else if (preset === 'wind') {
      // Wind: Resonant bandpass sweep
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) output[i] = (Math.random() * 2 - 1) * 0.2;

      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      noise.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.setValueAtTime(3.5, ctx.currentTime);
      filter.frequency.setValueAtTime(400, ctx.currentTime);

      // LFO for howling effect
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.setValueAtTime(0.18, ctx.currentTime);
      lfoGain.gain.setValueAtTime(250, ctx.currentTime);

      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      lfo.start();

      noise.connect(filter);
      filter.connect(outputNode);
      noise.start();
      this.atmosphereSource = noise;

    } else if (preset === 'tavern') {
      // Tavern: Warm dual filter murmur with periodic wooden clinks
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.15;

      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      noise.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(650, ctx.currentTime);

      noise.connect(filter);
      filter.connect(outputNode);
      noise.start();
      this.atmosphereSource = noise;

      // Wooden cup clink
      this.atmosphereInterval = window.setInterval(() => {
        if (!this.ctx || this.currentAtmosphere !== 'tavern') return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const clinkG = this.ctx.createGain();
        osc.frequency.setValueAtTime(1200 + Math.random() * 400, now);
        clinkG.gain.setValueAtTime(0.03, now);
        clinkG.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
        osc.connect(clinkG);
        clinkG.connect(outputNode);
        osc.start(now);
        osc.stop(now + 0.09);
      }, 1200);

    } else if (preset === 'dungeon') {
      // Dungeon: Low eerie drone (55Hz / 82.5Hz) with slow phase
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = 'sine';
      osc2.type = 'triangle';
      osc1.frequency.setValueAtTime(55, ctx.currentTime); // A1
      osc2.frequency.setValueAtTime(82.41, ctx.currentTime); // E2

      const subGain = ctx.createGain();
      subGain.gain.setValueAtTime(0.35, ctx.currentTime);

      osc1.connect(subGain);
      osc2.connect(subGain);
      subGain.connect(outputNode);

      osc1.start();
      osc2.start();
      this.atmosphereSource = osc1;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // CHANNEL 2: COMBAT MUSIC (Looping Battle Tension + Independent Volume)
  // ───────────────────────────────────────────────────────────────────────────

  public async setCombatMusic(track: CombatTrack | string, crossfadeSec = 1.5): Promise<void> {
    const ctx = await this.getContext();
    if (!ctx || !this.combatGain) return;

    if (this.currentCombat === track) return;

    const now = ctx.currentTime;

    // Crossfade down old track
    if (this.combatSource) {
      const oldGain = this.combatGain.gain;
      oldGain.cancelScheduledValues(now);
      oldGain.setValueAtTime(oldGain.value, now);
      oldGain.linearRampToValueAtTime(0.0001, now + crossfadeSec);

      const oldSource = this.combatSource;
      const oldTimer = this.combatInterval;
      setTimeout(() => {
        try {
          if ('stop' in oldSource && typeof (oldSource as AudioScheduledSourceNode).stop === 'function') {
            (oldSource as AudioScheduledSourceNode).stop();
          }
          oldSource.disconnect();
        } catch (_) {}
        if (oldTimer) clearInterval(oldTimer);
      }, crossfadeSec * 1000 + 100);
    }

    this.currentCombat = track;
    if (track === 'none') {
      this.combatSource = null;
      return;
    }

    const newGain = ctx.createGain();
    newGain.gain.setValueAtTime(0.0001, now);
    newGain.linearRampToValueAtTime(this.combatVol, now + crossfadeSec);
    newGain.connect(this.masterGain!);

    this.startCombatSynthesis(ctx, track, newGain);
    this.combatGain = newGain;
  }

  private startCombatSynthesis(ctx: AudioContext, track: string, outputNode: GainNode): void {
    if (this.combatInterval) {
      clearInterval(this.combatInterval);
      this.combatInterval = null;
    }

    // Synthesized battle ostinato & pulse
    let beat = 0;
    const bpm = track === 'boss' ? 140 : 120;
    const intervalMs = (60 / bpm) * 500; // eighth notes

    this.combatInterval = window.setInterval(() => {
      if (!this.ctx || this.currentCombat === 'none') return;
      const now = this.ctx.currentTime;
      beat = (beat + 1) % 8;

      // Kick drum on 0 and 4
      if (beat === 0 || beat === 4) {
        const kickOsc = this.ctx.createOscillator();
        const kickGain = this.ctx.createGain();
        kickOsc.frequency.setValueAtTime(140, now);
        kickOsc.frequency.exponentialRampToValueAtTime(38, now + 0.12);
        kickGain.gain.setValueAtTime(0.4, now);
        kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        kickOsc.connect(kickGain);
        kickGain.connect(outputNode);
        kickOsc.start(now);
        kickOsc.stop(now + 0.19);
      }

      // Snare on 2 and 6
      if (beat === 2 || beat === 6) {
        const snareNoise = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.1, this.ctx.sampleRate);
        const d = snareNoise.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.25;
        const src = this.ctx.createBufferSource();
        src.buffer = snareNoise;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.25, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        src.connect(g);
        g.connect(outputNode);
        src.start(now);
      }

      // Driving bass arp: E1, G1, B1, D2
      const notes = [41.20, 49.00, 61.74, 73.42];
      const bassOsc = this.ctx.createOscillator();
      const bassGain = this.ctx.createGain();
      bassOsc.type = 'sawtooth';
      bassOsc.frequency.setValueAtTime(notes[beat % notes.length], now);

      const bassFilter = this.ctx.createBiquadFilter();
      bassFilter.type = 'lowpass';
      bassFilter.frequency.setValueAtTime(track === 'boss' ? 550 : 380, now);

      bassGain.gain.setValueAtTime(0.2, now);
      bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      bassOsc.connect(bassFilter);
      bassFilter.connect(bassGain);
      bassGain.connect(outputNode);

      bassOsc.start(now);
      bassOsc.stop(now + 0.22);
    }, intervalMs);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // CHANNEL 3: SFX (One-Shot Action & Event Triggers)
  // ───────────────────────────────────────────────────────────────────────────

  public async playSfx(trigger: SfxTrigger | string): Promise<void> {
    const ctx = await this.getContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;

    switch (trigger) {
      case 'sword_clash': {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(2200, now);
        osc.frequency.exponentialRampToValueAtTime(240, now + 0.18);
        g.gain.setValueAtTime(0.45, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.connect(g);
        g.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.23);
        break;
      }

      case 'fireball': {
        // Low explosive boom + noise sweep
        const osc = ctx.createOscillator();
        const boomGain = ctx.createGain();
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(25, now + 0.8);
        boomGain.gain.setValueAtTime(0.6, now);
        boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
        osc.connect(boomGain);
        boomGain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.86);

        const noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.6), ctx.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.35;
        const noiseNode = ctx.createBufferSource();
        noiseNode.buffer = noiseBuf;
        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.setValueAtTime(800, now);
        noiseFilter.frequency.exponentialRampToValueAtTime(120, now + 0.6);
        const noiseG = ctx.createGain();
        noiseG.gain.setValueAtTime(0.5, now);
        noiseG.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        noiseNode.connect(noiseFilter);
        noiseFilter.connect(noiseG);
        noiseG.connect(this.sfxGain);
        noiseNode.start(now);
        break;
      }

      case 'crit_fanfare': {
        const notes = [587.33, 739.99, 880.00, 1174.66]; // D5, F#5, A5, D6
        notes.forEach((freq, idx) => {
          const t = now + idx * 0.07;
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(freq, t);
          const f = ctx.createBiquadFilter();
          f.type = 'lowpass';
          f.frequency.setValueAtTime(3200, t);
          f.frequency.exponentialRampToValueAtTime(900, t + 1.2);
          g.gain.setValueAtTime(0.001, t);
          g.gain.linearRampToValueAtTime(0.35, t + 0.03);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
          o.connect(f);
          f.connect(g);
          g.connect(this.sfxGain!);
          o.start(t);
          o.stop(t + 1.55);
        });
        break;
      }

      case 'fumble_stinger': {
        const fumbleNotes = [466.16, 440.00, 415.30, 311.13]; // Bb4 -> A4 -> Ab4 -> Eb4
        fumbleNotes.forEach((freq, idx) => {
          const t = now + idx * 0.1;
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(freq, t);
          g.gain.setValueAtTime(0.28, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
          o.connect(g);
          g.connect(this.sfxGain!);
          o.start(t);
          o.stop(t + 0.5);
        });
        break;
      }

      case 'door_creak': {
        const creak = ctx.createOscillator();
        const creakGain = ctx.createGain();
        const creakFilter = ctx.createBiquadFilter();
        creak.type = 'sawtooth';
        creak.frequency.setValueAtTime(220, now);
        creak.frequency.linearRampToValueAtTime(340, now + 0.35);
        creak.frequency.linearRampToValueAtTime(180, now + 0.7);
        creakFilter.type = 'bandpass';
        creakFilter.Q.setValueAtTime(6.0, now);
        creakFilter.frequency.setValueAtTime(600, now);
        creakGain.gain.setValueAtTime(0.001, now);
        creakGain.gain.linearRampToValueAtTime(0.3, now + 0.08);
        creakGain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
        creak.connect(creakFilter);
        creakFilter.connect(creakGain);
        creakGain.connect(this.sfxGain);
        creak.start(now);
        creak.stop(now + 0.78);
        break;
      }

      default:
        break;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SYSTEM BUS ADAPTATION & AUTO-FADING
  // ───────────────────────────────────────────────────────────────────────────

  public handleCombatStart(): void {
    if (this.inCombat) return;
    this.inCombat = true;
    this.prevAtmosphereBeforeCombat = this.currentAtmosphere;

    // Smoothly duck atmosphere and spin up combat music
    this.setAtmosphere('silence', 2.0);
    this.setCombatMusic('battle', 2.0);
  }

  public handleCombatEnd(): void {
    if (!this.inCombat) return;
    this.inCombat = false;

    // Fade combat music down and restore previous atmospheric track
    this.setCombatMusic('none', 2.0);
    if (this.prevAtmosphereBeforeCombat && this.prevAtmosphereBeforeCombat !== 'silence') {
      this.setAtmosphere(this.prevAtmosphereBeforeCombat, 2.0);
    }
  }

  public onDiceRoll(isCritical: boolean, isFumble: boolean): void {
    if (isCritical) {
      this.playSfx('crit_fanfare');
    } else if (isFumble) {
      this.playSfx('fumble_stinger');
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // VOLUME SETTERS
  // ───────────────────────────────────────────────────────────────────────────

  public setMasterVolume(v: number): void {
    this.masterVol = Math.max(0, Math.min(1, v));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.linearRampToValueAtTime(this.masterVol, this.ctx.currentTime + 0.05);
    }
  }

  public setAtmosphereVolume(v: number): void {
    this.atmosphereVol = Math.max(0, Math.min(1, v));
    if (this.atmosphereGain && this.ctx) {
      this.atmosphereGain.gain.linearRampToValueAtTime(this.atmosphereVol, this.ctx.currentTime + 0.05);
    }
  }

  public setCombatVolume(v: number): void {
    this.combatVol = Math.max(0, Math.min(1, v));
    if (this.combatGain && this.ctx) {
      this.combatGain.gain.linearRampToValueAtTime(this.combatVol, this.ctx.currentTime + 0.05);
    }
  }

  public setSfxVolume(v: number): void {
    this.sfxVol = Math.max(0, Math.min(1, v));
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.linearRampToValueAtTime(this.sfxVol, this.ctx.currentTime + 0.05);
    }
  }

  public getState(): SoundboardState {
    return {
      masterVol: this.masterVol,
      atmosphereVol: this.atmosphereVol,
      combatVol: this.combatVol,
      sfxVol: this.sfxVol,
      activeAtmosphere: this.currentAtmosphere,
      activeCombat: this.currentCombat,
      isCombatActive: this.inCombat,
    };
  }
}

export const soundboardEngine = new SoundboardEngine();
