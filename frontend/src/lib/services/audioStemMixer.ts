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

  constructor() {}

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
