// src/lib/services/audioEngine.ts
// Multi-Bus Audio Engine (Ambient Looping, Music Cross-Fading, SFX One-Shots) with LAN Sync & State Persistence

async function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T | undefined> {
  if (typeof window !== 'undefined') {
    const win = window as any;
    const invokeFn = win.__TAURI__?.core?.invoke || win.__TAURI_INTERNALS__?.invoke;
    if (typeof invokeFn === 'function') {
      return invokeFn(cmd, args);
    }
  }
  return undefined;
}

export type AudioBus = 'ambient' | 'music' | 'sfx';

export interface SoundTrack {
  id: string;
  name: string;
  bus: AudioBus;
  url: string;
  isCustom?: boolean;
}

const STORAGE_KEY_VOLUMES = 'vtt_soundboard_volumes';
const STORAGE_KEY_TRACKS = 'vtt_soundboard_tracks';

const DEFAULT_TRACKS: SoundTrack[] = [
  { id: 'amb-dungeon', name: 'Dripping Dungeon', bus: 'ambient', url: '/audio/ambience-dungeon.mp3' },
  { id: 'amb-forest', name: 'Whispering Woods', bus: 'ambient', url: '/audio/ambience-forest.mp3' },
  { id: 'amb-tavern', name: 'Cozy Hearthside', bus: 'ambient', url: '/audio/ambience-tavern.mp3' },
  { id: 'mus-explore', name: 'Quiet Exploration', bus: 'music', url: '/audio/music-explore.mp3' },
  { id: 'mus-battle', name: 'Combat Drums', bus: 'music', url: '/audio/music-battle.mp3' },
  { id: 'sfx-dice', name: 'Dice Clatter', bus: 'sfx', url: '/audio/dice.wav' },
  { id: 'sfx-sword', name: 'Blade Clash', bus: 'sfx', url: '/audio/sword.wav' },
  { id: 'sfx-spell', name: 'Arcane Surge', bus: 'sfx', url: '/audio/spell.wav' },
];

export class MultiBusAudioEngine {
  private ambientEl: HTMLAudioElement | null = null;
  private currentMusicEl: HTMLAudioElement | null = null;
  private fadingMusicEl: HTMLAudioElement | null = null;
  private crossfadeInterval: ReturnType<typeof setInterval> | null = null;

  volumes: Record<AudioBus | 'master', number> = {
    master: 0.8,
    ambient: 0.6,
    music: 0.5,
    sfx: 0.85,
  };

  mutes: Record<AudioBus | 'master', boolean> = {
    master: false,
    ambient: false,
    music: false,
    sfx: false,
  };

  tracks: SoundTrack[] = [...DEFAULT_TRACKS];
  activeTrackIds: Record<AudioBus, string | null> = {
    ambient: null,
    music: null,
    sfx: null,
  };

  constructor() {
    this.loadPersistedSettings();
    if (typeof window !== 'undefined') {
      this.init();
    }
  }

  private loadPersistedSettings() {
    if (typeof localStorage === 'undefined') return;
    try {
      const volRaw = localStorage.getItem(STORAGE_KEY_VOLUMES);
      if (volRaw) {
        const parsed = JSON.parse(volRaw);
        this.volumes = { ...this.volumes, ...parsed.volumes };
        this.mutes = { ...this.mutes, ...parsed.mutes };
      }
      const tracksRaw = localStorage.getItem(STORAGE_KEY_TRACKS);
      if (tracksRaw) {
        const customTracks: SoundTrack[] = JSON.parse(tracksRaw);
        this.tracks = [...DEFAULT_TRACKS, ...customTracks];
      }
    } catch {
      // Fallback to defaults
    }
  }

  private saveSettings() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(
        STORAGE_KEY_VOLUMES,
        JSON.stringify({ volumes: this.volumes, mutes: this.mutes })
      );
      const customTracks = this.tracks.filter(t => t.isCustom);
      localStorage.setItem(STORAGE_KEY_TRACKS, JSON.stringify(customTracks));
    } catch {
      // Ignore quota errors
    }
  }

  init() {
    if (typeof window === 'undefined') return;
    if (!this.ambientEl) {
      this.ambientEl = new Audio();
      this.ambientEl.loop = true;
    }
    if (!this.currentMusicEl) {
      this.currentMusicEl = new Audio();
      this.currentMusicEl.loop = true;
    }
    this.applyVolumes();
  }

  getEffectiveVolume(bus: AudioBus): number {
    if (this.mutes.master || this.mutes[bus]) return 0;
    return Math.max(0, Math.min(1, this.volumes[bus] * this.volumes.master));
  }

  setVolume(bus: AudioBus | 'master', val: number) {
    this.volumes[bus] = Math.max(0, Math.min(1, val));
    this.applyVolumes();
    this.saveSettings();
  }

  toggleMute(bus: AudioBus | 'master'): boolean {
    this.mutes[bus] = !this.mutes[bus];
    this.applyVolumes();
    this.saveSettings();
    return this.mutes[bus];
  }

  isMuted(bus: AudioBus | 'master'): boolean {
    return this.mutes[bus];
  }

  private applyVolumes() {
    if (this.ambientEl) {
      this.ambientEl.volume = this.getEffectiveVolume('ambient');
    }
    if (this.currentMusicEl && !this.fadingMusicEl) {
      this.currentMusicEl.volume = this.getEffectiveVolume('music');
    }
  }

  /**
   * Plays a track on the specified bus.
   * If on the 'music' bus, executes a smooth linear cross-fade from the previous track.
   */
  async playTrack(bus: AudioBus, url: string, broadcast = true, trackId?: string) {
    this.init();
    this.activeTrackIds[bus] = trackId || url;

    if (bus === 'ambient') {
      if (this.ambientEl) {
        this.ambientEl.src = url;
        this.ambientEl.volume = this.getEffectiveVolume('ambient');
        try {
          await this.ambientEl.play();
        } catch (err) {
          console.warn('Ambient playback failed:', err);
        }
      }
    } else if (bus === 'music') {
      await this.crossfadeMusic(url);
    } else if (bus === 'sfx') {
      this.playSfx(url);
    }

    if (broadcast) {
      try {
        await invoke('broadcast_vtt_event', {
          event: 'audio:play',
          payload: { bus, url, trackId },
        });
      } catch {
        // LAN fallback
      }
    }
  }

  /**
   * Smoothly cross-fades between the active music track and a new track over 1.5 seconds.
   */
  private async crossfadeMusic(newUrl: string, durationMs = 1500): Promise<void> {
    if (this.crossfadeInterval) {
      clearInterval(this.crossfadeInterval);
      this.crossfadeInterval = null;
    }

    const targetVolume = this.getEffectiveVolume('music');

    // Move current track to fading track
    if (this.currentMusicEl && !this.currentMusicEl.paused) {
      this.fadingMusicEl = this.currentMusicEl;
    }

    const nextEl = new Audio(newUrl);
    nextEl.loop = true;
    nextEl.volume = 0;
    this.currentMusicEl = nextEl;

    try {
      await nextEl.play();
    } catch (err) {
      console.warn('Music play blocked:', err);
    }

    const steps = 30;
    const intervalTime = durationMs / steps;
    let step = 0;

    this.crossfadeInterval = setInterval(() => {
      step++;
      const progress = step / steps;

      if (this.currentMusicEl) {
        this.currentMusicEl.volume = targetVolume * progress;
      }
      if (this.fadingMusicEl) {
        this.fadingMusicEl.volume = Math.max(0, targetVolume * (1 - progress));
      }

      if (step >= steps) {
        if (this.crossfadeInterval) clearInterval(this.crossfadeInterval);
        this.crossfadeInterval = null;
        if (this.fadingMusicEl) {
          this.fadingMusicEl.pause();
          this.fadingMusicEl = null;
        }
      }
    }, intervalTime);
  }

  /**
   * Triggers a concurrent one-shot SFX audio element.
   */
  playSfx(url: string) {
    if (this.mutes.master || this.mutes.sfx) return;
    const sfx = new Audio(url);
    sfx.volume = this.getEffectiveVolume('sfx');
    sfx.play().catch(() => {});
  }

  async playDiceClatter() {
    try {
      const { audioEngine: coreAudio } = await import('$lib/audio/AudioEngine');
      await coreAudio.triggerSfx('sfx-dice');
    } catch {
      this.playSfx('/audio/dice.wav');
    }
  }

  stopBus(bus: AudioBus, broadcast = true) {
    this.activeTrackIds[bus] = null;
    if (bus === 'ambient' && this.ambientEl) {
      this.ambientEl.pause();
      this.ambientEl.currentTime = 0;
    } else if (bus === 'music') {
      if (this.currentMusicEl) {
        this.currentMusicEl.pause();
        this.currentMusicEl.currentTime = 0;
      }
      if (this.fadingMusicEl) {
        this.fadingMusicEl.pause();
        this.fadingMusicEl = null;
      }
      if (this.crossfadeInterval) {
        clearInterval(this.crossfadeInterval);
        this.crossfadeInterval = null;
      }
    }

    if (broadcast) {
      invoke('broadcast_vtt_event', {
        event: 'audio:stop',
        payload: { bus },
      }).catch(() => {});
    }
  }

  stopAll(broadcast = true) {
    this.stopBus('ambient', false);
    this.stopBus('music', false);
    this.stopBus('sfx', false);

    if (broadcast) {
      invoke('broadcast_vtt_event', {
        event: 'audio:stop',
        payload: { bus: 'all' },
      }).catch(() => {});
    }
  }

  /**
   * Registers a user audio file into the playlist and persists it.
   */
  async addAudioFile(file: File, bus: AudioBus): Promise<SoundTrack> {
    const url = URL.createObjectURL(file);
    const newTrack: SoundTrack = {
      id: `custom-track-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: file.name.replace(/\.[^/.]+$/, ''),
      bus,
      url,
      isCustom: true,
    };
    this.tracks.push(newTrack);
    this.saveSettings();
    return newTrack;
  }

  getTracks(bus?: AudioBus): SoundTrack[] {
    if (!bus) return this.tracks;
    return this.tracks.filter(t => t.bus === bus);
  }
}

export const audioEngine = new MultiBusAudioEngine();
