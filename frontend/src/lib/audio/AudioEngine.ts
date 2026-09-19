// AudioEngine.ts — Production-Ready Dual-Bus Web Audio Engine
// Ambience Bus: looping background tracks with 1.5s linear gain crossfade
// SFX Bus: concurrent one-shot sound effects with independent volume fader
// Synthesizer Fallbacks: 6 Web Audio procedural synthesizers working out of the box

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

  // Master -> Bus chains
  private masterGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private combatMusicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  // Volume levels (0.0 - 1.0)
  private masterVol = 0.8;
  private ambienceVol = 0.7;
  private combatMusicVol = 0.75;
  private sfxVol = 0.8;

  // Currently playing ambience source
  private activeAmbienceSource: AudioBufferSourceNode | null = null;
  private activeAmbienceGainNode: GainNode | null = null;
  private activeAmbienceTrackId: string | null = null;

  // Buffer cache for loaded tracks and in-memory blobs
  private bufferCache = new Map<string, AudioBuffer>();

  // Registered tracks and sfx buttons
  private tracks: TrackEntry[] = [];
  private sfxButtons: SfxEntry[] = [];

  // Output configuration
  private selectedDeviceId = 'default';
  private bufferSize = 256;

  // -----------------------------------------------------------------------
  // Lifecycle & Autoplay Resume Hook
  // -----------------------------------------------------------------------

  /**
   * Defers AudioContext instantiation until first user gesture.
   * Wraps all playback calls in an explicit resume hook.
   */
  async resumeContext(): Promise<AudioContext> {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.setupBusses();
    }

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    return this.ctx;
  }

  private setupBusses(): void {
    if (!this.ctx) return;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.masterVol, this.ctx.currentTime);

    this.ambienceGain = this.ctx.createGain();
    this.ambienceGain.gain.setValueAtTime(this.ambienceVol, this.ctx.currentTime);

    this.combatMusicGain = this.ctx.createGain();
    this.combatMusicGain.gain.setValueAtTime(this.combatMusicVol, this.ctx.currentTime);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.setValueAtTime(this.sfxVol, this.ctx.currentTime);

    this.ambienceGain.connect(this.masterGain);
    this.combatMusicGain.connect(this.masterGain);
    this.sfxGain.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
  }

  // -----------------------------------------------------------------------
  // Volume Controls (Master, Ambience, SFX)
  // -----------------------------------------------------------------------

  getMasterVolume(): number { return this.masterVol; }
  getAmbienceVolume(): number { return this.ambienceVol; }
  getCombatMusicVolume(): number { return this.combatMusicVol; }
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

  setCombatMusicVolume(v: number): void {
    this.combatMusicVol = Math.max(0, Math.min(1, v));
    if (this.combatMusicGain && this.ctx) {
      this.combatMusicGain.gain.linearRampToValueAtTime(this.combatMusicVol, this.ctx.currentTime + 0.05);
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

  removeTrack(id: string): void {
    if (this.activeAmbienceTrackId === id) {
      this.stopTrack();
    }
    this.tracks = this.tracks.filter(t => t.id !== id);
  }

  addSfxButton(entry: SfxEntry): void {
    const existingIndex = this.sfxButtons.findIndex(s => s.id === entry.id);
    if (existingIndex >= 0) {
      this.sfxButtons[existingIndex] = entry;
      this.sfxButtons = [...this.sfxButtons];
    } else {
      this.sfxButtons = [...this.sfxButtons, entry];
    }
  }

  // -----------------------------------------------------------------------
  // Local Asset & Blob Ingestion
  // -----------------------------------------------------------------------

  /**
   * Ingests a local file via URL.createObjectURL and decodeAudioData
   * to eliminate Tauri/browser CORS and asset protocol blocks.
   */
  async loadAudioFile(file: File, isAmbience: boolean, label?: string): Promise<TrackEntry | SfxEntry> {
    const ctx = await this.resumeContext();
    const objectUrl = URL.createObjectURL(file);
    const cleanName = label || file.name.replace(/\.[^/.]+$/, '');

    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      this.bufferCache.set(objectUrl, audioBuffer);
    } catch (err) {
      console.warn('Audio decoding fallback to direct URL playback:', err);
    }

    if (isAmbience) {
      const newTrack: TrackEntry = {
        id: `track-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        label: cleanName,
        url: objectUrl,
        loop: true,
        isAmbience: true,
      };
      this.addTrack(newTrack);
      return newTrack;
    } else {
      // Find lowest available hotkey slot if open
      const usedHotkeys = new Set(this.sfxButtons.map(s => s.hotkey).filter((h): h is number => h !== null));
      let availableHotkey: number | null = null;
      for (let i = 1; i <= 9; i++) {
        if (!usedHotkeys.has(i)) {
          availableHotkey = i;
          break;
        }
      }

      const newSfx: SfxEntry = {
        id: `sfx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        label: cleanName,
        hotkey: availableHotkey,
        url: objectUrl,
        procedural: false,
      };
      this.addSfxButton(newSfx);
      return newSfx;
    }
  }

  // -----------------------------------------------------------------------
  // Buffer Loading with Memory Cache
  // -----------------------------------------------------------------------

  private async loadBuffer(url: string): Promise<AudioBuffer> {
    const ctx = await this.resumeContext();
    const cached = this.bufferCache.get(url);
    if (cached) return cached;

    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    this.bufferCache.set(url, audioBuffer);
    return audioBuffer;
  }

  // -----------------------------------------------------------------------
  // Ambience Bus — Looping Playback with Linear Crossfade
  // -----------------------------------------------------------------------

  async playTrack(trackId: string): Promise<void> {
    const ctx = await this.resumeContext();
    const track = this.tracks.find(t => t.id === trackId);
    if (!track) return;

    const FADE_DURATION = 1.5; // seconds
    const now = ctx.currentTime;

    // Crossfade: smoothly fade out previous track
    if (this.activeAmbienceGainNode && this.activeAmbienceSource) {
      const dyingGain = this.activeAmbienceGainNode;
      const dyingSource = this.activeAmbienceSource;
      dyingGain.gain.setValueAtTime(dyingGain.gain.value, now);
      dyingGain.gain.linearRampToValueAtTime(0, now + FADE_DURATION);

      setTimeout(() => {
        try {
          dyingSource.stop();
          dyingSource.disconnect();
        } catch {
          // Track might have already ended
        }
      }, (FADE_DURATION + 0.1) * 1000);
    }

    this.activeAmbienceTrackId = trackId;

    try {
      const buffer = await this.loadBuffer(track.url);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = track.loop;

      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(1, now + FADE_DURATION);

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
    } catch (err) {
      console.error(`Failed to play ambience track [${trackId}]:`, err);
      this.activeAmbienceTrackId = null;
    }
  }

  stopTrack(): void {
    if (this.activeAmbienceSource && this.ctx) {
      const now = this.ctx.currentTime;
      const fade = this.activeAmbienceGainNode;
      if (fade) {
        fade.gain.setValueAtTime(fade.gain.value, now);
        fade.gain.linearRampToValueAtTime(0, now + 0.5);
      }
      const s = this.activeAmbienceSource;
      setTimeout(() => {
        try {
          s.stop();
          s.disconnect();
        } catch {
          // Source already stopped
        }
      }, 550);
    }
    this.activeAmbienceSource = null;
    this.activeAmbienceGainNode = null;
    this.activeAmbienceTrackId = null;
  }

  // -----------------------------------------------------------------------
  // SFX Bus — Concurrent One-Shot Playback & Procedural Synthesizers
  // -----------------------------------------------------------------------

  async triggerSfx(sfxId: string): Promise<void> {
    const ctx = await this.resumeContext();
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
      // Fallback to procedural synthesis on asset load failure
      this.synthesizeSfx(sfxId, ctx);
    }
  }

  /**
   * 6 Synthesized Fallback Sound Effects:
   * 1. Dice Roll (noise burst + clicking transients)
   * 2. Bell Alert (harmonic bell overtones)
   * 3. Door Creak (FM sawtooth through bandpass filter)
   * 4. Short Rest Chime (peaceful major triad: C5-E5-G5)
   * 5. Combat Alert (dissonant tritone brass pulse: 440 Hz + 622.25 Hz)
   * 6. Secret Chime (ascending shimmer arpeggio: C6-E6-G6-B6)
   */
  synthesizeSfx(sfxId: string, ctx: AudioContext): void {
    const now = ctx.currentTime;

    // 1. Dice Roll: Multi-particle noise burst with clicking transients
    if (sfxId === 'sfx-dice' || sfxId.includes('dice')) {
      for (let i = 0; i < 7; i++) {
        const t = now + i * 0.055 + (Math.random() * 0.015);
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = i % 2 === 0 ? 'sawtooth' : 'triangle';
        osc.frequency.setValueAtTime(900 + Math.random() * 800, t);
        osc.frequency.exponentialRampToValueAtTime(120 + Math.random() * 80, t + 0.06);

        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1200 + i * 150, t);
        filter.Q.setValueAtTime(3.5, t);

        g.gain.setValueAtTime(0.22, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.065);

        osc.connect(filter);
        filter.connect(g);
        g.connect(this.sfxGain!);

        osc.start(t);
        osc.stop(t + 0.07);
      }
      return;
    }

    // 2. Bell Alert: Harmonic bell tone with decaying overtones
    if (sfxId === 'sfx-bell' || sfxId.includes('bell')) {
      const baseFreq = 587.33; // D5
      const partials = [1.0, 2.756, 5.404, 8.933];
      const amplitudes = [0.4, 0.22, 0.12, 0.06];

      partials.forEach((ratio, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(baseFreq * ratio, now);

        g.gain.setValueAtTime(amplitudes[i] ?? 0.1, now);
        const decayTime = 2.8 / (i * 0.45 + 1);
        g.gain.exponentialRampToValueAtTime(0.0001, now + decayTime);

        osc.connect(g);
        g.connect(this.sfxGain!);
        osc.start(now);
        osc.stop(now + decayTime);
      });
      return;
    }

    // 3. Door Creak: FM sawtooth modulated through bandpass filter with pitch drop
    if (sfxId === 'sfx-door' || sfxId.includes('door') || sfxId.includes('creak')) {
      const carrier = ctx.createOscillator();
      const modulator = ctx.createOscillator();
      const modGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      const mainGain = ctx.createGain();

      carrier.type = 'sawtooth';
      carrier.frequency.setValueAtTime(140, now);
      carrier.frequency.linearRampToValueAtTime(85, now + 0.85);

      modulator.type = 'sine';
      modulator.frequency.setValueAtTime(28, now);
      modulator.frequency.linearRampToValueAtTime(12, now + 0.85);

      modGain.gain.setValueAtTime(65, now);
      modGain.gain.linearRampToValueAtTime(20, now + 0.85);

      modulator.connect(modGain);
      modGain.connect(carrier.frequency);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(450, now);
      filter.frequency.linearRampToValueAtTime(220, now + 0.85);
      filter.Q.setValueAtTime(4.0, now);

      mainGain.gain.setValueAtTime(0.01, now);
      mainGain.gain.linearRampToValueAtTime(0.35, now + 0.08);
      mainGain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

      carrier.connect(filter);
      filter.connect(mainGain);
      mainGain.connect(this.sfxGain!);

      modulator.start(now);
      carrier.start(now);
      modulator.stop(now + 0.92);
      carrier.stop(now + 0.92);
      return;
    }

    // 4. Short Rest Chime: Peaceful warm major triad (C5, E5, G5)
    if (sfxId === 'sfx-rest' || sfxId.includes('rest') || sfxId.includes('chime')) {
      const triad = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      triad.forEach((freq, idx) => {
        const noteStart = now + idx * 0.09;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, noteStart);

        g.gain.setValueAtTime(0.001, noteStart);
        g.gain.linearRampToValueAtTime(0.24, noteStart + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, noteStart + 2.2);

        osc.connect(g);
        g.connect(this.sfxGain!);

        osc.start(noteStart);
        osc.stop(noteStart + 2.3);
      });
      return;
    }

    // 5. Combat Alert: Sharp dissonance tritone brass pulse (root + diminished 5th)
    if (sfxId === 'sfx-combat' || sfxId.includes('combat') || sfxId.includes('alert')) {
      const notes = [440.0, 622.25]; // A4 + D#5 (Tritone)
      notes.forEach(f => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, now);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2600, now);
        filter.frequency.exponentialRampToValueAtTime(600, now + 0.45);

        g.gain.setValueAtTime(0.42, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

        osc.connect(filter);
        filter.connect(g);
        g.connect(this.sfxGain!);

        osc.start(now);
        osc.stop(now + 0.52);
      });
      return;
    }

    // 6. Secret Chime: Ascending 4-note arpeggio (C6, E6, G6, B6) with high shimmer
    if (sfxId === 'sfx-secret' || sfxId.includes('secret') || sfxId.includes('discovery')) {
      const arpeggio = [1046.50, 1318.51, 1567.98, 1975.53]; // C6, E6, G6, B6 (Maj7)
      arpeggio.forEach((freq, idx) => {
        const noteStart = now + idx * 0.08;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, noteStart);

        g.gain.setValueAtTime(0.001, noteStart);
        g.gain.linearRampToValueAtTime(0.28, noteStart + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, noteStart + 1.6);

        osc.connect(g);
        g.connect(this.sfxGain!);

        osc.start(noteStart);
        osc.stop(noteStart + 1.7);
      });
      return;
    }

    // Backwards compatibility: Sword Strike
    if (sfxId === 'sfx-sword' || sfxId.includes('sword') || sfxId.includes('hit')) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(1800, now);
      osc.frequency.exponentialRampToValueAtTime(280, now + 0.15);
      g.gain.setValueAtTime(0.4, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.connect(g);
      g.connect(this.sfxGain!);
      osc.start(now);
      osc.stop(now + 0.2);
      return;
    }

    // Backwards compatibility: Spell Surge
    if (sfxId === 'sfx-spell' || sfxId.includes('spell') || sfxId.includes('magic')) {
      for (let i = 0; i < 3; i++) {
        const t = now + i * 0.04;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440 * (i + 1), t);
        osc.frequency.exponentialRampToValueAtTime(880 * (i + 1), t + 0.2);
        g.gain.setValueAtTime(0.18, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        osc.connect(g);
        g.connect(this.sfxGain!);
        osc.start(t);
        osc.stop(t + 0.45);
      }
      return;
    }

    // Natural 20 / Critical Success Fanfare: Radiant brass major chord with sparkling shimmer
    if (sfxId === 'sfx-nat20' || sfxId === 'sfx-crit' || sfxId === 'sfx-critical') {
      const fanfare = [587.33, 739.99, 880.00, 1174.66]; // D5, F#5, A5, D6
      fanfare.forEach((freq, i) => {
        const noteTime = now + i * 0.06;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, noteTime);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(3200, noteTime);
        filter.frequency.exponentialRampToValueAtTime(1000, noteTime + 1.2);

        g.gain.setValueAtTime(0.001, noteTime);
        g.gain.linearRampToValueAtTime(0.3, noteTime + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, noteTime + 1.8);

        osc.connect(filter);
        filter.connect(g);
        g.connect(this.sfxGain!);
        osc.start(noteTime);
        osc.stop(noteTime + 1.85);
      });
      return;
    }

    // Natural 1 / Critical Fumble Stinger: Discordant minor descent with gritty distortion
    if (sfxId === 'sfx-nat1' || sfxId === 'sfx-fumble' || sfxId === 'sfx-failure') {
      const fumbleTones = [466.16, 440.00, 415.30, 311.13]; // Bb4 -> A4 -> Ab4 -> Eb4
      fumbleTones.forEach((freq, i) => {
        const noteTime = now + i * 0.12;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, noteTime);
        osc.frequency.linearRampToValueAtTime(freq * 0.9, noteTime + 0.3);

        g.gain.setValueAtTime(0.28, noteTime);
        g.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.35);

        osc.connect(g);
        g.connect(this.sfxGain!);
        osc.start(noteTime);
        osc.stop(noteTime + 0.38);
      });
      return;
    }

    // Monster Roar: Low frequency throat oscillation with noise modulation
    if (sfxId === 'sfx-roar' || sfxId.includes('roar') || sfxId.includes('monster')) {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const g = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(95, now);
      osc.frequency.linearRampToValueAtTime(140, now + 0.3);
      osc.frequency.exponentialRampToValueAtTime(45, now + 1.2);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(320, now);
      filter.Q.setValueAtTime(3.0, now);

      g.gain.setValueAtTime(0.01, now);
      g.gain.linearRampToValueAtTime(0.48, now + 0.15);
      g.gain.exponentialRampToValueAtTime(0.001, now + 1.3);

      osc.connect(filter);
      filter.connect(g);
      g.connect(this.sfxGain!);

      osc.start(now);
      osc.stop(now + 1.35);
      return;
    }

    // Metallic Weapon Clash: High frequency transient with ringing overtone
    if (sfxId === 'sfx-clash' || sfxId.includes('clash')) {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const g = ctx.createGain();

      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(2400, now);
      osc1.frequency.exponentialRampToValueAtTime(800, now + 0.1);

      osc2.type = 'square';
      osc2.frequency.setValueAtTime(1480, now);
      osc2.frequency.exponentialRampToValueAtTime(600, now + 0.15);

      g.gain.setValueAtTime(0.35, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

      osc1.connect(g);
      osc2.connect(g);
      g.connect(this.sfxGain!);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.5);
      osc2.stop(now + 0.5);
      return;
    }

    // Generic ping
    const fallbackOsc = ctx.createOscillator();
    const fallbackGain = ctx.createGain();
    fallbackOsc.type = 'sine';
    fallbackOsc.frequency.setValueAtTime(660, now);
    fallbackGain.gain.setValueAtTime(0.25, now);
    fallbackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    fallbackOsc.connect(fallbackGain);
    fallbackGain.connect(this.sfxGain!);
    fallbackOsc.start(now);
    fallbackOsc.stop(now + 0.45);
  }

  // -----------------------------------------------------------------------
  // Output Device & Buffer Configuration
  // -----------------------------------------------------------------------

  async setOutputDevice(deviceId: string): Promise<boolean> {
    this.selectedDeviceId = deviceId;
    if (this.ctx && 'setSinkId' in this.ctx) {
      try {
        await (this.ctx as unknown as { setSinkId: (id: string) => Promise<void> }).setSinkId(deviceId);
        return true;
      } catch (e) {
        console.warn('AudioContext.setSinkId failed:', e);
        return false;
      }
    }
    return true;
  }

  getDeviceId(): string { return this.selectedDeviceId; }
  setBufferSize(size: number): void { this.bufferSize = size; }
  getBufferSize(): number { return this.bufferSize; }

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

// Seed initial fallback synthesizers and hotkeys (1-6 strictly defined by spec)
audioEngine.addSfxButton({ id: 'sfx-dice',   label: 'Dice Clatter',    hotkey: 1, url: null, procedural: true });
audioEngine.addSfxButton({ id: 'sfx-bell',   label: 'Bell Alert',      hotkey: 2, url: null, procedural: true });
audioEngine.addSfxButton({ id: 'sfx-door',   label: 'Door Creak',      hotkey: 3, url: null, procedural: true });
audioEngine.addSfxButton({ id: 'sfx-rest',   label: 'Short Rest Chime',hotkey: 4, url: null, procedural: true });
audioEngine.addSfxButton({ id: 'sfx-combat', label: 'Combat Alert',    hotkey: 5, url: null, procedural: true });
audioEngine.addSfxButton({ id: 'sfx-secret', label: 'Secret Chime',    hotkey: 6, url: null, procedural: true });
audioEngine.addSfxButton({ id: 'sfx-nat20',  label: 'Nat 20 Fanfare',  hotkey: 7, url: null, procedural: true });
audioEngine.addSfxButton({ id: 'sfx-nat1',   label: 'Nat 1 Stinger',   hotkey: 8, url: null, procedural: true });
audioEngine.addSfxButton({ id: 'sfx-roar',   label: 'Monster Roar',    hotkey: 9, url: null, procedural: true });
audioEngine.addSfxButton({ id: 'sfx-clash',  label: 'Blade Clash',     hotkey: null, url: null, procedural: true });
audioEngine.addSfxButton({ id: 'sfx-sword',  label: 'Sword Strike',    hotkey: null, url: null, procedural: true });
audioEngine.addSfxButton({ id: 'sfx-spell',  label: 'Spell Surge',     hotkey: null, url: null, procedural: true });
