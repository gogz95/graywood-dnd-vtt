// frontend/src/lib/services/audioStemMixer.ts
// Multi-Track Ambient Stem Audio Mixer with 2.5s Equal-Power Crossfading and Procedural One-Shots

export interface AudioStem {
  id: string;
  name: string;
  url: string;
  volume: number; // 0.0 to 1.0
  isMuted?: boolean;
  loop?: boolean;
}

export interface OneShotTrigger {
  id: string;
  name: string;
  urls: string[];
  minIntervalSeconds: number; // e.g. 15
  maxIntervalSeconds: number; // e.g. 45
  volume: number;
}

export interface SoundscapeScene {
  id: string;
  name: string;
  stems: AudioStem[];
  oneShots?: OneShotTrigger[];
}

interface ActiveStemChannel {
  stem: AudioStem;
  audio: HTMLAudioElement;
  gainNode?: GainNode;
}

/**
 * Computes 5e equal-power crossfade gain values for smooth non-clipping transitions:
 * g_out(t) = cos(t * PI / 2)
 * g_in(t) = sin(t * PI / 2)
 * Identity: g_out^2 + g_in^2 = 1.0 (constant acoustic power)
 */
export function calculateEqualPowerGains(progress: number): {
  gainOut: number;
  gainIn: number;
} {
  const p = Math.max(0.0, Math.min(1.0, progress));
  const angle = (p * Math.PI) / 2;
  return {
    gainOut: Math.cos(angle),
    gainIn: Math.sin(angle),
  };
}

export class AudioStemMixer {
  private activeChannels: Map<string, ActiveStemChannel> = new Map();
  private oneShotTimers: Array<ReturnType<typeof setTimeout>> = [];
  private currentScene: SoundscapeScene | null = null;
  private masterVolume: number = 0.8;
  private isMuted: boolean = false;

  private audioCtx: AudioContext | null = null;
  private duckingBus: GainNode | null = null;
  private duckingRestoreTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {}

  /**
   * Initializes or returns the dedicated Web Audio duckingBus node
   * between the ambient stem summing stage and master output.
   */
  public getDuckingBus(): GainNode | null {
    if (this.duckingBus) return this.duckingBus;
    if (typeof window === 'undefined') return null;

    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;

    try {
      this.audioCtx = new AC();
      this.duckingBus = this.audioCtx.createGain();
      this.duckingBus.gain.setValueAtTime(1.0, this.audioCtx.currentTime);
      this.duckingBus.connect(this.audioCtx.destination);
      return this.duckingBus;
    } catch {
      return null;
    }
  }

  /**
   * Sidechain Ambient Stem Audio Ducking:
   * When any high-impact sound (spell impact, melee critical hit, or weapon burst) fires:
   * - Instantly ramp duckingBus.gain from 1.0 down to 0.63 (-4 dB) over 50ms (exponential ramp).
   * - Hold the ducked gain floor for 400ms.
   * - Smoothly restore gain back to 1.0 (0 dB) over 250ms.
   */
  public triggerCombatImpactDucking(): void {
    const bus = this.getDuckingBus();
    if (bus && this.audioCtx) {
      try {
        const now = this.audioCtx.currentTime;
        bus.gain.cancelScheduledValues(now);
        bus.gain.setValueAtTime(Math.max(0.001, bus.gain.value), now);
        // Ramp down to 0.63 (-4 dB) over 50ms
        bus.gain.exponentialRampToValueAtTime(0.63, now + 0.05);
        // Hold floor for 400ms, then ramp back to 1.0 over 250ms
        bus.gain.setValueAtTime(0.63, now + 0.45);
        bus.gain.exponentialRampToValueAtTime(1.0, now + 0.70);
      } catch (err) {
        console.warn('[AudioStemMixer] Web Audio ducking ramp error:', err);
      }
    }

    // Apply HTMLAudioElement stem fallback for direct stem volume attenuation
    if (this.duckingRestoreTimer) {
      clearTimeout(this.duckingRestoreTimer);
      this.duckingRestoreTimer = null;
    }

    this.applyDirectStemDucking(0.63);

    this.duckingRestoreTimer = setTimeout(() => {
      this.applyDirectStemDucking(1.0);
      this.duckingRestoreTimer = null;
    }, 700);
  }

  private applyDirectStemDucking(multiplier: number): void {
    for (const ch of this.activeChannels.values()) {
      if (!ch.stem.isMuted && !this.isMuted) {
        ch.audio.volume = Math.max(0, Math.min(1, ch.stem.volume * this.masterVolume * multiplier));
      }
    }
  }

  public triggerSidechainDucking(): void {
    this.triggerCombatImpactDucking();
  }

  public triggerSubBassThud(): void {
    this.triggerCombatImpactDucking();
    if (typeof window === 'undefined') return;
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;

    try {
      if (!this.audioCtx) {
        this.audioCtx = new AC();
      }
      const ctx = this.audioCtx;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(60, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.35);

      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.45);
    } catch (err) {
      console.warn('[AudioStemMixer] Sub-bass thud synthesis failed:', err);
    }
  }


  public async loadSoundscapeScene(
    scene: SoundscapeScene,
    crossfadeDurationSeconds: number = 2.5
  ): Promise<void> {
    const oldChannels = Array.from(this.activeChannels.values());
    this.clearOneShotTimers();

    const newChannels: ActiveStemChannel[] = [];

    // Initialize new audio elements
    for (const stem of scene.stems) {
      if (typeof Audio === 'undefined') continue;
      const audio = new Audio(stem.url);
      audio.loop = stem.loop !== false;
      audio.volume = 0; // Starts silent for crossfade
      newChannels.push({ stem, audio });
    }

    // Play new channels
    for (const ch of newChannels) {
      try {
        await ch.audio.play();
      } catch (err) {
        console.warn(`[AudioStemMixer] Autoplay prevented for stem ${ch.stem.name}:`, err);
      }
    }

    // Execute 2.5s equal-power crossfade
    const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const durationMs = crossfadeDurationSeconds * 1000;

    return new Promise((resolve) => {
      const stepFade = () => {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const elapsed = now - startTime;
        const progress = Math.min(1.0, elapsed / durationMs);

        const { gainOut, gainIn } = calculateEqualPowerGains(progress);

        // Fade out old stems
        for (const oldCh of oldChannels) {
          const baseVol = oldCh.stem.isMuted || this.isMuted ? 0 : oldCh.stem.volume * this.masterVolume;
          oldCh.audio.volume = Math.max(0, Math.min(1, baseVol * gainOut));
        }

        // Fade in new stems
        for (const newCh of newChannels) {
          const baseVol = newCh.stem.isMuted || this.isMuted ? 0 : newCh.stem.volume * this.masterVolume;
          newCh.audio.volume = Math.max(0, Math.min(1, baseVol * gainIn));
        }

        if (progress < 1.0) {
          requestAnimationFrame(stepFade);
        } else {
          // Tear down old stems
          for (const oldCh of oldChannels) {
            oldCh.audio.pause();
            oldCh.audio.src = '';
          }

          // Register new channels
          this.activeChannels.clear();
          for (const ch of newChannels) {
            this.activeChannels.set(ch.stem.id, ch);
          }

          this.currentScene = scene;
          this.startOneShotSchedulers(scene.oneShots || []);
          resolve();
        }
      };

      requestAnimationFrame(stepFade);
    });
  }

  private startOneShotSchedulers(triggers: OneShotTrigger[]): void {
    for (const trigger of triggers) {
      this.scheduleNextOneShot(trigger);
    }
  }

  private scheduleNextOneShot(trigger: OneShotTrigger): void {
    if (trigger.urls.length === 0) return;

    const delaySec =
      trigger.minIntervalSeconds +
      Math.random() * (trigger.maxIntervalSeconds - trigger.minIntervalSeconds);

    const timer = setTimeout(() => {
      if (typeof Audio === 'undefined') return;
      const url = trigger.urls[Math.floor(Math.random() * trigger.urls.length)];
      const sfx = new Audio(url);
      sfx.volume = (trigger.volume ?? 0.6) * this.masterVolume;
      sfx.play().catch(() => {});

      // Reschedule next
      this.scheduleNextOneShot(trigger);
    }, delaySec * 1000);

    this.oneShotTimers.push(timer);
  }

  private clearOneShotTimers(): void {
    for (const timer of this.oneShotTimers) {
      clearTimeout(timer);
    }
    this.oneShotTimers = [];
  }

  public setStemVolume(stemId: string, volume: number): void {
    const ch = this.activeChannels.get(stemId);
    if (!ch) return;

    ch.stem.volume = Math.max(0, Math.min(1, volume));
    if (!ch.stem.isMuted && !this.isMuted) {
      ch.audio.volume = ch.stem.volume * this.masterVolume;
    }
  }

  public toggleStemMute(stemId: string): void {
    const ch = this.activeChannels.get(stemId);
    if (!ch) return;

    ch.stem.isMuted = !ch.stem.isMuted;
    ch.audio.volume = ch.stem.isMuted || this.isMuted ? 0 : ch.stem.volume * this.masterVolume;
  }

  public stopAll(): void {
    this.clearOneShotTimers();
    for (const ch of this.activeChannels.values()) {
      ch.audio.pause();
      ch.audio.src = '';
    }
    this.activeChannels.clear();
    this.currentScene = null;
  }
}

export const audioStemMixer = new AudioStemMixer();
