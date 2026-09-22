// src/lib/services/audioEngine.ts
// Multi-Track Audio Engine (.ogg, .mp3, .wav, .flac, .m4a) with LAN Sync

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
}

class AudioEngine {
  private audioElements: Map<AudioBus, HTMLAudioElement> = new Map();
  volumes = {
    master: 0.8,
    ambient: 0.6,
    music: 0.5,
    sfx: 0.9
  };

  init() {
    if (typeof window === 'undefined') return;
    this.audioElements.set('ambient', new Audio());
    this.audioElements.set('music', new Audio());
    this.audioElements.set('sfx', new Audio());

    const ambientEl = this.audioElements.get('ambient');
    const musicEl = this.audioElements.get('music');
    if (ambientEl) ambientEl.loop = true;
    if (musicEl) musicEl.loop = true;

    this.applyVolumes();
  }

  setVolume(bus: AudioBus | 'master', val: number) {
    this.volumes[bus] = Math.max(0, Math.min(1, val));
    this.applyVolumes();
  }

  private applyVolumes() {
    const ambientEl = this.audioElements.get('ambient');
    const musicEl = this.audioElements.get('music');
    const sfxEl = this.audioElements.get('sfx');

    if (ambientEl) ambientEl.volume = this.volumes.ambient * this.volumes.master;
    if (musicEl) musicEl.volume = this.volumes.music * this.volumes.master;
    if (sfxEl) sfxEl.volume = this.volumes.sfx * this.volumes.master;
  }

  async playTrack(bus: AudioBus, url: string, broadcast = true) {
    let el = this.audioElements.get(bus);
    if (!el) {
      el = new Audio();
      if (bus === 'ambient' || bus === 'music') el.loop = true;
      this.audioElements.set(bus, el);
    }

    el.src = url;
    this.applyVolumes();
    try {
      await el.play();
    } catch (err) {
      console.warn(`Audio playback blocked or failed for ${bus}:`, err);
    }

    if (broadcast) {
      try {
        await invoke('broadcast_vtt_event', {
          event: 'audio:play',
          payload: { bus, url }
        });
      } catch (err) {
        console.warn('LAN audio broadcast unavailable:', err);
      }
    }
  }

  stopBus(bus: AudioBus, broadcast = true) {
    const el = this.audioElements.get(bus);
    if (el) {
      el.pause();
      el.currentTime = 0;
    }

    if (broadcast) {
      try {
        invoke('broadcast_vtt_event', {
          event: 'audio:stop',
          payload: { bus }
        });
      } catch (err) {
        console.warn('LAN audio stop broadcast unavailable:', err);
      }
    }
  }
}

export const audioEngine = new AudioEngine();
