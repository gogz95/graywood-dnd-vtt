// AudioEngine.ts — Dual-Bus Web Audio Engine
// Music/Ambience Bus: looping tracks with 1.5s linear gain crossfade
// SFX Bus: concurrent one-shot procedural and asset-backed effects

export interface TrackEntry {
  id: string;
  label: string;
  url: string;
  loop: boolean;
  isAmbience: boolean;
}

export interface SfxEntry {
  id: string;
  label: string;
  hotkey: number | null; // 1-9 maps to NumPad1-9
  url: string | null;    // null = procedural synthesis
  procedural: boolean;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;

  // Master → Ambience chain
  private masterGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  // Volume levels (0.0 – 1.0)
  private masterVol = 0.8;
  private ambienceVol = 0.7;
  private sfxVol = 0.8;

  // Currently playing ambience source
  private activeAmbienceSource: AudioBufferSourceNode | null = null;
  private activeAmbienceGainNode: GainNode | null = null;
  private activeAmbienceTrackId: string | null = null;

  // Buffer cache for loaded tracks
  private bufferCache = new Map<string, AudioBuffer>();

  // Registered tracks and sfx buttons
  private tracks: TrackEntry[] = [];
  private sfxButtons: SfxEntry[] = [];

  // -----------------------------------------------------------------------
  // Context Bootstrap
  // -----------------------------------------------------------------------

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.masterVol, this.ctx.currentTime);

      this.ambienceGain = this.ctx.createGain();
      this.ambienceGain.gain.setValueAtTime(this.ambienceVol, this.ctx.currentTime);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(this.sfxVol, this.ctx.currentTime);

      this.ambienceGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  // -----------------------------------------------------------------------
  // Volume Controls
  // -----------------------------------------------------------------------

  getMasterVolume(): number { return this.masterVol; }
  getAmbienceVolume(): number { return this.ambienceVol; }
  getSfxVolume(): number { return this.sfxVol; }

  setMasterVolume(v: number): void {
    this.masterVol = Math.max(0, Math.min(1, v));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.linearRampToValueAtTime(this.masterVol, this.ctx.currentTime + 0.05);
    }
  }

  setAmbienceVolume(v: number): void {
    this.ambienceVol = Math.max(0, Math.min(1, v));
    if (this.ambienceGain && this.ctx) {
      this.ambienceGain.gain.linearRampToValueAtTime(this.ambienceVol, this.ctx.currentTime + 0.05);
    }
  }

  setSfxVolume(v: number): void {
    this.sfxVol = Math.max(0, Math.min(1, v));
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.linearRampToValueAtTime(this.sfxVol, this.ctx.currentTime + 0.05);
    }
  }

  // -----------------------------------------------------------------------
  // Track & SFX Registry
  // -----------------------------------------------------------------------

  getTracks(): ReadonlyArray<TrackEntry> { return this.tracks; }
  getSfxButtons(): ReadonlyArray<SfxEntry> { return this.sfxButtons; }
  getActiveTrackId(): string | null { return this.activeAmbienceTrackId; }

  addTrack(entry: TrackEntry): void {
    if (!this.tracks.find(t => t.id === entry.id)) {
      this.tracks = [...this.tracks, entry];
    }
  }

  addSfxButton(entry: SfxEntry): void {
    if (!this.sfxButtons.find(s => s.id === entry.id)) {
      this.sfxButtons = [...this.sfxButtons, entry];
    }
  }

  // -----------------------------------------------------------------------
  // Buffer Loading
  // -----------------------------------------------------------------------

  private async loadBuffer(url: string): Promise<AudioBuffer> {
    const ctx = this.ensureContext();
    const cached = this.bufferCache.get(url);
    if (cached) return cached;

    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    this.bufferCache.set(url, audioBuffer);
    return audioBuffer;
  }

  // -----------------------------------------------------------------------
  // Ambience / Music Bus — Crossfade Play
  // -----------------------------------------------------------------------

  async playTrack(trackId: string): Promise<void> {
    const ctx = this.ensureContext();
    const track = this.tracks.find(t => t.id === trackId);
    if (!track) return;

    const FADE = 1.5; // seconds
    const now = ctx.currentTime;

    // Fade out current track if any
    if (this.activeAmbienceGainNode && this.activeAmbienceSource) {
      const fade = this.activeAmbienceGainNode;
      fade.gain.setValueAtTime(fade.gain.value, now);
      fade.gain.linearRampToValueAtTime(0, now + FADE);
      const dying = this.activeAmbienceSource;
      setTimeout(() => {
        try { dying.stop(); dying.disconnect(); } catch { /* already stopped */ }
      }, (FADE + 0.1) * 1000);
    }

    this.activeAmbienceTrackId = trackId;

    try {
      const buffer = await this.loadBuffer(track.url);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = track.loop;

      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(1, now + FADE);

      source.connect(gainNode);
      gainNode.connect(this.ambienceGain!);
      source.start(0);

      this.activeAmbienceSource = source;
      this.activeAmbienceGainNode = gainNode;

      source.onended = () => {
        if (this.activeAmbienceTrackId === trackId) {
          this.activeAmbienceTrackId = null;
          this.activeAmbienceSource = null;
          this.activeAmbienceGainNode = null;
        }
      };
    } catch {
      this.activeAmbienceTrackId = null;
    }
  }

  stopTrack(): void {
    if (this.activeAmbienceSource && this.ctx) {
      const now = this.ctx.currentTime;
      const fade = this.activeAmbienceGainNode;
      if (fade) {
        fade.gain.setValueAtTime(fade.gain.value, now);
        fade.gain.linearRampToValueAtTime(0, now + 0.4);
      }
      const s = this.activeAmbienceSource;
      setTimeout(() => { try { s.stop(); s.disconnect(); } catch { /* stopped */ } }, 500);
    }
    this.activeAmbienceSource = null;
    this.activeAmbienceGainNode = null;
    this.activeAmbienceTrackId = null;
  }

  // -----------------------------------------------------------------------
  // SFX Bus — One-Shot Playback
  // -----------------------------------------------------------------------

  async triggerSfx(sfxId: string): Promise<void> {
    const ctx = this.ensureContext();
    const sfx = this.sfxButtons.find(s => s.id === sfxId);
    if (!sfx) return;

    if (sfx.procedural || !sfx.url) {
      this.synthesizeSfx(sfxId, ctx);
      return;
    }

    try {
      const buffer = await this.loadBuffer(sfx.url);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(1, ctx.currentTime);
      source.connect(gainNode);
      gainNode.connect(this.sfxGain!);
      source.start(0);
    } catch {
      // Fallback to synthesis on load failure
      this.synthesizeSfx(sfxId, ctx);
    }
  }

  private synthesizeSfx(sfxId: string, ctx: AudioContext): void {
    const now = ctx.currentTime;

    if (sfxId === 'sfx-dice' || sfxId.includes('dice')) {
      // Dice clatter: short burst of filtered noise
      for (let i = 0; i < 6; i++) {
        const t = now + i * 0.06;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800 + Math.random() * 600, t);
        osc.frequency.exponentialRampToValueAtTime(100 + Math.random() * 100, t + 0.07);
        g.gain.setValueAtTime(0.18, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
        osc.connect(g);
        g.connect(this.sfxGain!);
        osc.start(t);
        osc.stop(t + 0.1);
      }
      return;
    }

    if (sfxId === 'sfx-sword' || sfxId.includes('sword') || sfxId.includes('hit')) {
      // Sword strike: sharp metallic transient + ring-down
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(1800, now);
      osc.frequency.exponentialRampToValueAtTime(280, now + 0.15);
      g.gain.setValueAtTime(0.5, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.connect(g);
      g.connect(this.sfxGain!);
      osc.start(now);
      osc.stop(now + 0.2);

      // High metallic shimmer
      const shimmer = ctx.createOscillator();
      const sg = ctx.createGain();
      shimmer.type = 'sine';
      shimmer.frequency.setValueAtTime(6400, now);
      shimmer.frequency.exponentialRampToValueAtTime(3200, now + 0.3);
      sg.gain.setValueAtTime(0.12, now);
      sg.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      shimmer.connect(sg);
      sg.connect(this.sfxGain!);
      shimmer.start(now);
      shimmer.stop(now + 0.35);
      return;
    }

    if (sfxId === 'sfx-spell' || sfxId.includes('spell') || sfxId.includes('magic')) {
      // Arcane impact: rising shimmer + low boom
      for (let i = 0; i < 3; i++) {
        const t = now + i * 0.04;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440 * (i + 1), t);
        osc.frequency.exponentialRampToValueAtTime(880 * (i + 1), t + 0.2);
        g.gain.setValueAtTime(0.2, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        osc.connect(g);
        g.connect(this.sfxGain!);
        osc.start(t);
        osc.stop(t + 0.45);
      }
      return;
    }

    if (sfxId === 'sfx-bell' || sfxId.includes('bell') || sfxId.includes('combat')) {
      // Combat bell: rich harmonic bell tone
      const partials = [1, 2.756, 5.404, 8.933];
      partials.forEach((ratio, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440 * ratio, now);
        g.gain.setValueAtTime(0.3 / (i + 1), now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 2.5 / (i * 0.4 + 1));
        osc.connect(g);
        g.connect(this.sfxGain!);
        osc.start(now);
        osc.stop(now + 2.5);
      });
      return;
    }

    // Generic ping fallback
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, now);
    g.gain.setValueAtTime(0.3, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.connect(g);
    g.connect(this.sfxGain!);
    osc.start(now);
    osc.stop(now + 0.45);
  }

  // -----------------------------------------------------------------------
  // Hotkey Trigger (NumPad 1-9)
  // -----------------------------------------------------------------------

  handleHotkey(numKey: number): void {
    const sfx = this.sfxButtons.find(s => s.hotkey === numKey);
    if (sfx) {
      this.triggerSfx(sfx.id);
    }
  }
}

// Singleton export
export const audioEngine = new AudioEngine();

// Seed default SFX buttons
audioEngine.addSfxButton({ id: 'sfx-dice',  label: 'Dice Clatter', hotkey: 1, url: null, procedural: true });
audioEngine.addSfxButton({ id: 'sfx-sword', label: 'Sword Strike', hotkey: 2, url: null, procedural: true });
audioEngine.addSfxButton({ id: 'sfx-spell', label: 'Spell Impact',  hotkey: 3, url: null, procedural: true });
audioEngine.addSfxButton({ id: 'sfx-bell',  label: 'Combat Bell',   hotkey: 4, url: null, procedural: true });
audioEngine.addSfxButton({ id: 'sfx-5',     label: 'SFX Slot 5',    hotkey: 5, url: null, procedural: true });
audioEngine.addSfxButton({ id: 'sfx-6',     label: 'SFX Slot 6',    hotkey: 6, url: null, procedural: true });
audioEngine.addSfxButton({ id: 'sfx-7',     label: 'SFX Slot 7',    hotkey: 7, url: null, procedural: true });
audioEngine.addSfxButton({ id: 'sfx-8',     label: 'SFX Slot 8',    hotkey: 8, url: null, procedural: true });
audioEngine.addSfxButton({ id: 'sfx-9',     label: 'SFX Slot 9',    hotkey: 9, url: null, procedural: true });
