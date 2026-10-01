// src/lib/services/spatialAudioEngine.ts
// 2D Positional Spatial Audio Emitter & Web Audio Distance Falloff Engine
// Phase 14: Wall-occlusion BiquadFilter integration via raycastVisionEngine

import type { AudioEmitter, ListenerPosition } from '../types/audio';
import { audioEngine } from '../audio/AudioEngine';
import { queryWallsInRadius, type LineSegment } from '../canvas/raycastVisionEngine';

const STORAGE_PREFIX = 'vtt_spatial_emitters_';

export type ReverbPreset = 'catacomb' | 'tavern' | 'outdoors';

interface ActiveNodeInstance {
  emitterId: string;
  sourceNode: AudioBufferSourceNode | MediaElementAudioSourceNode | null;
  audioElement: HTMLAudioElement | null;
  gainNode: GainNode;
  pannerNode: StereoPannerNode | PannerNode | null;
  occlusionFilter: BiquadFilterNode | null;
  reverbSendNode: GainNode | null;
  proceduralInterval: ReturnType<typeof setInterval> | null;
  isPlaying: boolean;
}

class SpatialAudioEngine {
  emitters = $state<AudioEmitter[]>([]);
  listenerPos = $state<ListenerPosition | null>(null);
  selectedEmitterId = $state<string | null>(null);
  masterEnabled = $state<boolean>(true);
  currentMapKey = $state<string>('');
  currentReverbPreset = $state<ReverbPreset>('outdoors');

  private ctx: AudioContext | null = null;
  private convolverNode: ConvolverNode | null = null;
  private reverbWetGain: GainNode | null = null;
  private instances = new Map<string, ActiveNodeInstance>();
  private audioBufferCache = new Map<string, AudioBuffer>();
  private updateFrameId: number | null = null;
  /** Wall segments from raycastVisionEngine for occlusion calculation. */
  private wallSegments: LineSegment[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      this.startDistanceUpdateLoop();
    }
  }

  // ── Procedural Impulse Response Synthesizer ────────────────────────────────
  /**
   * Generates a procedural impulse response buffer:
   * - catacomb: 2.5s decay with high stone reflection density and dark tail
   * - tavern: 0.8s warm wooden room decay
   * - outdoors: 0.1s dry/minimal reflection
   */
  public generateImpulseResponse(ctx: AudioContext, duration: number, decay: number): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * duration);
    const impulse = ctx.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const t = i / length;
      const envelope = Math.exp(-t * decay);
      left[i] = (Math.random() * 2 - 1) * envelope;
      right[i] = (Math.random() * 2 - 1) * envelope;
    }
    return impulse;
  }

  public setEnvironmentPreset(preset: ReverbPreset): void {
    this.currentReverbPreset = preset;
    if (!this.ctx || !this.convolverNode || !this.reverbWetGain) return;

    if (preset === 'outdoors') {
      // Dry/bypassed
      this.reverbWetGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    } else if (preset === 'tavern') {
      // 0.8s warm wood decay
      this.convolverNode.buffer = this.generateImpulseResponse(this.ctx, 0.8, 3.5);
      this.reverbWetGain.gain.setTargetAtTime(0.25, this.ctx.currentTime, 0.05);
    } else if (preset === 'catacomb') {
      // 2.5s stone reverb with high wet mix
      this.convolverNode.buffer = this.generateImpulseResponse(this.ctx, 2.5, 2.0);
      this.reverbWetGain.gain.setTargetAtTime(0.65, this.ctx.currentTime, 0.05);
    }
  }

  // ── Audio Context Initialization ───────────────────────────────────────────
  private async getAudioContext(): Promise<AudioContext | null> {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      this.ctx = await audioEngine.resumeContext();
      if (this.ctx) {
        // Build global Environmental Convolver Reverb chain
        this.convolverNode = this.ctx.createConvolver();
        this.reverbWetGain = this.ctx.createGain();
        this.reverbWetGain.gain.setValueAtTime(0, this.ctx.currentTime); // default dry/outdoors

        this.convolverNode.connect(this.reverbWetGain);
        this.reverbWetGain.connect(this.ctx.destination);
      }
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

  /** Update active wall geometry for per-emitter occlusion filtering. Call when map geometry changes. */
  setWalls(walls: LineSegment[]): void {
    this.wallSegments = walls;
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

    // Occlusion low-pass filter (wall-based muffle)
    const occlusionFilter = ctx.createBiquadFilter();
    occlusionFilter.type = 'lowpass';
    occlusionFilter.frequency.setValueAtTime(20000, ctx.currentTime);
    occlusionFilter.Q.setValueAtTime(0.707, ctx.currentTime);

    // Reverb send gain node connecting into the global ConvolverNode
    const reverbSendNode = ctx.createGain();
    reverbSendNode.gain.setValueAtTime(0.3, ctx.currentTime);
    if (this.convolverNode) {
      occlusionFilter.connect(reverbSendNode);
      reverbSendNode.connect(this.convolverNode);
    }

    // PannerNode: supports 3D spatial panning & directional sound cones
    let pannerNode: StereoPannerNode | PannerNode | null = null;
    if (typeof ctx.createPanner === 'function') {
      const panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'linear';
      panner.refDistance = Math.max(1, emitter.innerRadius);
      panner.maxDistance = Math.max(emitter.innerRadius + 1, emitter.outerRadius);
      panner.rolloffFactor = 1.0;

      // Configure directional sound cone if specified (e.g. dragon breath, waterfall stream)
      if (emitter.coneInnerAngle !== undefined) {
        panner.coneInnerAngle = emitter.coneInnerAngle;
        panner.coneOuterAngle = emitter.coneOuterAngle ?? (emitter.coneInnerAngle + 60);
        panner.coneOuterGain = emitter.coneOuterGain ?? 0.2;
        panner.orientationX.setValueAtTime(emitter.orientationX ?? 1, ctx.currentTime);
        panner.orientationY.setValueAtTime(emitter.orientationY ?? 0, ctx.currentTime);
        panner.orientationZ.setValueAtTime(0, ctx.currentTime);
      }

      gainNode.connect(occlusionFilter);
      occlusionFilter.connect(panner);
      panner.connect(ctx.destination);
      pannerNode = panner;
    } else if (typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(0, ctx.currentTime);
      gainNode.connect(occlusionFilter);
      occlusionFilter.connect(panner);
      panner.connect(ctx.destination);
      pannerNode = panner;
    } else {
      gainNode.connect(occlusionFilter);
      occlusionFilter.connect(ctx.destination);
    }

    const inst: ActiveNodeInstance = {
      emitterId: id,
      sourceNode: null,
      audioElement: null,
      gainNode,
      pannerNode,
      occlusionFilter,
      reverbSendNode,
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

    // ── Wall-occlusion low-pass filter ─────────────────────────────────────
    if (inst.occlusionFilter && this.wallSegments.length > 0 && listener) {
      const gridSize2 = listener.gridSize || 60;
      const radiusPx = (outer / 5) * gridSize2;
      const candidates = queryWallsInRadius(this.wallSegments, { x: listener.x, y: listener.y }, radiusPx);
      let crossings = 0;
      const ex = emitter.x, ey = emitter.y, lx = listener.x, ly = listener.y;
      const rdx = ex - lx, rdy = ey - ly;
      for (const seg of candidates) {
        if (!seg.blocksVision) continue;
        // Segment-segment intersection test
        const sdx = seg.p2.x - seg.p1.x, sdy = seg.p2.y - seg.p1.y;
        const det = rdx * sdy - rdy * sdx;
        if (Math.abs(det) < 1e-9) continue;
        const qx = seg.p1.x - lx, qy = seg.p1.y - ly;
        const t = (qx * sdy - qy * sdx) / det;
        const u = (qx * rdy - qy * rdx) / det;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) { crossings++; if (crossings >= 3) break; }
      }
      const occlusionFactor = Math.min(crossings / 3, 1);
      const cutoff = 20000 + (600 - 20000) * occlusionFactor;
      inst.occlusionFilter.frequency.setTargetAtTime(cutoff, this.ctx.currentTime, 0.05);
      // Apply additional gain penalty for wall energy absorption
      const occludedGain = targetGain * (1 - occlusionFactor * 0.6);
      inst.gainNode.gain.setTargetAtTime(occludedGain, this.ctx.currentTime, 0.05);
    }

    // Stereo Panning or 3D Directional Panning
    if (inst.pannerNode) {
      if ('positionX' in inst.pannerNode) {
        // Standard Web Audio 3D PannerNode with directional cone
        const p3d = inst.pannerNode as PannerNode;
        p3d.positionX.setTargetAtTime(emitter.x, this.ctx.currentTime, 0.05);
        p3d.positionY.setTargetAtTime(emitter.y, this.ctx.currentTime, 0.05);
        p3d.positionZ.setTargetAtTime(0, this.ctx.currentTime, 0.05);

        if (emitter.orientationX !== undefined || emitter.orientationY !== undefined) {
          p3d.orientationX.setTargetAtTime(emitter.orientationX ?? 1, this.ctx.currentTime, 0.05);
          p3d.orientationY.setTargetAtTime(emitter.orientationY ?? 0, this.ctx.currentTime, 0.05);
          p3d.orientationZ.setTargetAtTime(0, this.ctx.currentTime, 0.05);
        }
      } else if ('pan' in inst.pannerNode) {
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
