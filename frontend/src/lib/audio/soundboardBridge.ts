// soundboardBridge.ts - Local Audio Engine and UI Event Dispatcher
// Uses the HTML5 Web Audio API to synthesize high-fidelity procedural audio one-shots
// or play local audio assets with zero external dependencies.

export type SoundEventType =
  | 'fireball'
  | 'critical_hit'
  | 'black_orb_seal'
  | 'coin_clink'
  | 'potion'
  | 'item_broken'
  | 'turn_bell'
  | 'door_open';

export class SoundboardBridge {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private soundAssetCache: Map<string, HTMLAudioElement> = new Map();
  private isMuted: boolean = false;
  private volumeLevel: number = 0.8; // Default 80% volume

  constructor() {
    // AudioContext will be initialized on first user interaction to comply with browser autoplay policies
  }

  private getAudioContext(): AudioContext | null {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volumeLevel, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setValueAtTime(muted ? 0 : this.volumeLevel, this.ctx.currentTime);
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  public isMuteActive(): boolean {
    return this.isMuted;
  }

  public setMasterVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    this.volumeLevel = clamped;
    if (this.ctx && this.masterGain && !this.isMuted) {
      this.masterGain.gain.setValueAtTime(clamped, this.ctx.currentTime);
    }
  }

  public getMasterVolume(): number {
    return this.volumeLevel;
  }

  public play(eventType: SoundEventType): void {
    if (this.isMuted) return;

    // Check if a local audio asset exists in cache
    const assetPath = `/assets/sounds/${eventType}.ogg`;
    if (this.soundAssetCache.has(assetPath)) {
      const audio = this.soundAssetCache.get(assetPath)!;
      audio.volume = this.volumeLevel;
      audio.currentTime = 0;
      audio.play().catch(() => this.synthesizeProceduralSound(eventType));
      return;
    }

    // Default to procedural synthesizer for 100% deterministic, dependency-free audio
    this.synthesizeProceduralSound(eventType);
  }

  private getDestinationNode(ctx: AudioContext): AudioNode {
    if (!this.masterGain) {
      this.masterGain = ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volumeLevel, ctx.currentTime);
      this.masterGain.connect(ctx.destination);
    }
    return this.masterGain;
  }

  private synthesizeProceduralSound(eventType: SoundEventType): void {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const dest = this.getDestinationNode(ctx);
    const now = ctx.currentTime;

    switch (eventType) {
      case 'fireball': {
        // Deep explosive blast + descending crackle sweep
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 1.2);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, now);
        filter.frequency.exponentialRampToValueAtTime(80, now + 1.2);

        gain.gain.setValueAtTime(0.8, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(dest);

        osc.start(now);
        osc.stop(now + 1.2);

        // White noise burst for flame roar
        this.synthesizeNoiseBurst(ctx, dest, now, 0.9, 0.4);
        break;
      }

      case 'critical_hit': {
        // Sharp metallic blade strike + low booming thunder
        const chime1 = ctx.createOscillator();
        const chime2 = ctx.createOscillator();
        const chimeGain = ctx.createGain();

        chime1.type = 'sine';
        chime1.frequency.setValueAtTime(1200, now);
        chime2.type = 'triangle';
        chime2.frequency.setValueAtTime(2400, now);

        chimeGain.gain.setValueAtTime(0.6, now);
        chimeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

        chime1.connect(chimeGain);
        chime2.connect(chimeGain);
        chimeGain.connect(dest);

        chime1.start(now);
        chime2.start(now);
        chime1.stop(now + 0.8);
        chime2.stop(now + 0.8);

        // Low heavy impact
        const sub = ctx.createOscillator();
        const subGain = ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(160, now);
        sub.frequency.exponentialRampToValueAtTime(40, now + 0.5);

        subGain.gain.setValueAtTime(0.7, now);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

        sub.connect(subGain);
        subGain.connect(dest);
        sub.start(now);
        sub.stop(now + 0.5);
        break;
      }

      case 'black_orb_seal': {
        // Ominous dissonant descending chord (System 15 Quarantine)
        const freqs = [185, 220, 261];
        freqs.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, now);
          osc.frequency.exponentialRampToValueAtTime(freq * 0.4, now + 2.0);

          gain.gain.setValueAtTime(0.2, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);

          osc.connect(gain);
          gain.connect(dest);

          osc.start(now + idx * 0.05);
          osc.stop(now + 2.0);
        });
        break;
      }

      case 'coin_clink': {
        // High crystalline brass chime pair
        const t1 = ctx.createOscillator();
        const t2 = ctx.createOscillator();
        const g = ctx.createGain();

        t1.type = 'sine';
        t1.frequency.setValueAtTime(2400, now);
        t2.type = 'sine';
        t2.frequency.setValueAtTime(3600, now + 0.08);

        g.gain.setValueAtTime(0.4, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        t1.connect(g);
        t2.connect(g);
        g.connect(dest);

        t1.start(now);
        t1.stop(now + 0.3);
        t2.start(now + 0.08);
        t2.stop(now + 0.4);
        break;
      }

      case 'potion': {
        // Upward bubbling resonant chirp
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(450, now);
        osc.frequency.exponentialRampToValueAtTime(900, now + 0.35);

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc.connect(gain);
        gain.connect(dest);

        osc.start(now);
        osc.stop(now + 0.35);
        break;
      }

      case 'item_broken': {
        // Harsh metal/stone fracturing crunch
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.45);

        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        osc.connect(gain);
        gain.connect(dest);

        osc.start(now);
        osc.stop(now + 0.45);
        this.synthesizeNoiseBurst(ctx, dest, now, 0.4, 0.3);
        break;
      }

      case 'turn_bell': {
        // Clean resonating combat turn transition bell
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now); // A5

        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);

        osc.connect(gain);
        gain.connect(dest);

        osc.start(now);
        osc.stop(now + 1.0);
        break;
      }

      case 'door_open': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.linearRampToValueAtTime(330, now + 0.25);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(now);
        osc.stop(now + 0.38);
        break;
      }
    }
  }

  private synthesizeNoiseBurst(
    ctx: AudioContext,
    dest: AudioNode,
    startTime: number,
    duration: number,
    volume: number
  ): void {
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(600, startTime);
    filter.Q.setValueAtTime(1.5, startTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    noise.start(startTime);
    noise.stop(startTime + duration);
  }
}

export const soundboard = new SoundboardBridge();

export function dispatchSoundEvent(event: SoundEventType): void {
  soundboard.play(event);
}
