// src/lib/services/spatialAudioEngine.ts
// 2D Positional Spatial Audio Emitter & Web Audio Distance Falloff Engine

import type { AudioEmitter, ListenerPosition } from '../types/audio';
import { audioEngine } from '../audio/AudioEngine';

const STORAGE_PREFIX = 'vtt_spatial_emitters_';

interface ActiveNodeInstance {
  emitterId: string;
  sourceNode: AudioBufferSourceNode | MediaElementAudioSourceNode | null;
  audioElement: HTMLAudioElement | null;
  gainNode: GainNode;
  pannerNode: StereoPannerNode | PannerNode | null;
  proceduralInterval: ReturnType<typeof setInterval> | null;
  isPlaying: boolean;
}

class SpatialAudioEngine {
  emitters = $state<AudioEmitter[]>([]);
  listenerPos = $state<ListenerPosition | null>(null);
  selectedEmitterId = $state<string | null>(null);
  masterEnabled = $state<boolean>(true);
  currentMapKey = $state<string>('');

  private ctx: AudioContext | null = null;
  private instances = new Map<string, ActiveNodeInstance>();
  private audioBufferCache = new Map<string, AudioBuffer>();
  private updateFrameId: number | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.startDistanceUpdateLoop();
    }
  }

  // ── Audio Context Initialization ───────────────────────────────────────────
  private async getAudioContext(): Promise<AudioContext | null> {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      this.ctx = await audioEngine.resumeContext();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    return this.ctx;
  }

  // ── Map Scene Persistence ──────────────────────────────────────────────────
  setMap(mapKey: string) {
    if (!mapKey) return;
    if (this.currentMapKey && this.currentMapKey !== mapKey) {
      this.persistToStorage(this.currentMapKey);
      this.stopAll();
    }
    this.currentMapKey = mapKey;
    this.loadFromStorage(mapKey);
  }

  // ── Emitter CRUD Operations ────────────────────────────────────────────────
  addEmitter(emitter: AudioEmitter) {
    this.emitters = [...this.emitters, { ...emitter }];
    if (this.currentMapKey) this.persistToStorage(this.currentMapKey);
    if (emitter.isPlaying !== false) {
      this.playEmitter(emitter.id);
    }
  }

  updateEmitter(id: string, updates: Partial<AudioEmitter>) {
    this.emitters = this.emitters.map((e) => {
      if (e.id === id) {
        return { ...e, ...updates };
      }
      return e;
    });

    if (this.currentMapKey) this.persistToStorage(this.currentMapKey);

    // Apply immediate updates to audio nodes
    const inst = this.instances.get(id);
    const updated = this.emitters.find((e) => e.id === id);
    if (inst && updated) {
      if (updates.isPlaying !== undefined) {
        if (updates.isPlaying && !inst.isPlaying) {
          this.playEmitter(id);
        } else if (!updates.isPlaying && inst.isPlaying) {
          this.stopEmitter(id);
        }
      }
      this.updateSpatialNode(updated, inst);
    }
  }

  removeEmitter(id: string) {
    this.stopEmitter(id);
    this.emitters = this.emitters.filter((e) => e.id !== id);
    if (this.currentMapKey) this.persistToStorage(this.currentMapKey);
    if (this.selectedEmitterId === id) {
      this.selectedEmitterId = null;
    }
  }

  // ── Listener Position Updates ──────────────────────────────────────────────
  setListener(x: number, y: number, gridSize = 60) {
    this.listenerPos = { x, y, gridSize };
    this.updateAllNodeGains();
  }

  // ── Web Audio Node Lifecycle ───────────────────────────────────────────────
  async playEmitter(id: string): Promise<void> {
    const emitter = this.emitters.find((e) => e.id === id);
    if (!emitter) return;

    const ctx = await this.getAudioContext();
    if (!ctx) return;

    // Teardown existing instance if active
    this.stopEmitter(id);

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, ctx.currentTime);

    let pannerNode: StereoPannerNode | PannerNode | null = null;
    if (typeof ctx.createStereoPanner === 'function') {
      pannerNode = ctx.createStereoPanner();
      pannerNode.pan.setValueAtTime(0, ctx.currentTime);
      gainNode.connect(pannerNode);
      pannerNode.connect(ctx.destination);
    } else {
      gainNode.connect(ctx.destination);
    }

    const inst: ActiveNodeInstance = {
      emitterId: id,
      sourceNode: null,
      audioElement: null,
      gainNode,
      pannerNode,
      proceduralInterval: null,
      isPlaying: true,
    };
    this.instances.set(id, inst);

    // Procedural synthesis or media URL
    if (emitter.isProcedural || emitter.fileUrl.startsWith('synth:')) {
      this.startProceduralAudio(emitter, inst, ctx);
    } else {
      this.startMediaElementAudio(emitter, inst, ctx);
    }

    this.updateSpatialNode(emitter, inst);
  }

  private startMediaElementAudio(
    emitter: AudioEmitter,
    inst: ActiveNodeInstance,
    ctx: AudioContext
  ) {
    try {
      const audio = new Audio();
      audio.src = emitter.fileUrl;
      audio.loop = emitter.loop !== false;
      audio.crossOrigin = 'anonymous';
      audio.preload = 'auto';

      const sourceNode = ctx.createMediaElementSource(audio);
      sourceNode.connect(inst.gainNode);

      audio.play().catch((err) => {
        console.warn(`[SpatialAudio] Playback prevented for ${emitter.fileUrl}:`, err);
      });

      inst.audioElement = audio;
      inst.sourceNode = sourceNode;
    } catch (err) {
      console.warn(`[SpatialAudio] MediaElement error, falling back to procedural:`, err);
      this.startProceduralAudio(emitter, inst, ctx);
    }
  }

  private startProceduralAudio(
    emitter: AudioEmitter,
    inst: ActiveNodeInstance,
    ctx: AudioContext
  ) {
    // Generate pink noise / crackling fire procedural loop
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    // Filter to warm campfire/dungeon ambient hum
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, ctx.currentTime);

    noiseSource.connect(filter);
    filter.connect(inst.gainNode);
    noiseSource.start(0);

    inst.sourceNode = noiseSource;
  }

  stopEmitter(id: string) {
    const inst = this.instances.get(id);
    if (!inst) return;

    if (inst.audioElement) {
      try {
        inst.audioElement.pause();
        inst.audioElement.src = '';
      } catch {}
    }

    if (inst.sourceNode && 'stop' in inst.sourceNode) {
      try {
        (inst.sourceNode as AudioBufferSourceNode).stop();
      } catch {}
    }

    if (inst.proceduralInterval) {
      clearInterval(inst.proceduralInterval);
    }

    inst.isPlaying = false;
    this.instances.delete(id);
  }

  stopAll() {
    for (const id of Array.from(this.instances.keys())) {
      this.stopEmitter(id);
    }
  }

  // ── Distance Attenuation & Stereo Panning Calculations ─────────────────────
  private updateSpatialNode(emitter: AudioEmitter, inst: ActiveNodeInstance) {
    if (!this.ctx || !inst.isPlaying) return;

    if (!this.masterEnabled) {
      inst.gainNode.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      return;
    }

    const listener = this.listenerPos;
    if (!listener) {
      // Default fallback: audible at default volume if no listener positioned
      inst.gainNode.gain.setTargetAtTime(emitter.volume, this.ctx.currentTime, 0.05);
      return;
    }

    const gridSize = listener.gridSize || 60;
    const dx = emitter.x - listener.x;
    const dy = emitter.y - listener.y;
    const pixelDist = Math.hypot(dx, dy);

    // Convert pixel distance to in-game 5e feet (gridSize px = 5 feet)
    const distFeet = (pixelDist / gridSize) * 5;

    // Formula:
    // d <= innerRadius => gain = volume
    // innerRadius < d < outerRadius => gain = volume * (1 - (d - inner) / (outer - inner))
    // d >= outerRadius => gain = 0
    let targetGain = 0;
    const inner = Math.max(0, emitter.innerRadius);
    const outer = Math.max(inner + 1, emitter.outerRadius);

    if (distFeet <= inner) {
      targetGain = emitter.volume;
    } else if (distFeet < outer) {
      const falloff = 1 - (distFeet - inner) / (outer - inner);
      targetGain = emitter.volume * Math.max(0, Math.min(1, falloff));
    } else {
      targetGain = 0;
    }

    // Smooth gain ramp
    inst.gainNode.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.05);

    // Stereo Panning (-1.0 left to +1.0 right)
    if (inst.pannerNode && 'pan' in inst.pannerNode) {
      const maxSpreadPx = (outer / 5) * gridSize;
      const panRaw = maxSpreadPx > 0 ? dx / maxSpreadPx : 0;
      const panClamped = Math.max(-1.0, Math.min(1.0, panRaw));
      (inst.pannerNode as StereoPannerNode).pan.setTargetAtTime(
        panClamped,
        this.ctx.currentTime,
        0.05
      );
    }
  }

  private updateAllNodeGains() {
    for (const emitter of this.emitters) {
      const inst = this.instances.get(emitter.id);
      if (inst) {
        this.updateSpatialNode(emitter, inst);
      }
    }
  }

  private startDistanceUpdateLoop() {
    const check = () => {
      if (this.instances.size > 0 && this.listenerPos) {
        this.updateAllNodeGains();
      }
      this.updateFrameId = requestAnimationFrame(check);
    };
    this.updateFrameId = requestAnimationFrame(check);
  }

  private persistToStorage(mapKey: string) {
    if (typeof localStorage === 'undefined' || !mapKey) return;
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${mapKey}`, JSON.stringify(this.emitters));
    } catch (e) {
      console.warn('[SpatialAudio] LocalStorage save error:', e);
    }
  }

  private loadFromStorage(mapKey: string) {
    if (typeof localStorage === 'undefined' || !mapKey) return;
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${mapKey}`);
      if (raw) {
        this.emitters = JSON.parse(raw);
        // Start any saved active emitters
        for (const e of this.emitters) {
          if (e.isPlaying !== false) {
            this.playEmitter(e.id);
          }
        }
      } else {
        this.emitters = [];
      }
    } catch {
      this.emitters = [];
    }
  }
}

export const spatialAudioEngine = new SpatialAudioEngine();
