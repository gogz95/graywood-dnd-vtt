// frontend/src/lib/canvas/vfx/ImpactVfxEngine.ts
// Natural 20 / Natural 1 Screen Ripples, Trauma Impulse & Web Audio Combat Sensory Engine

import { onDiceRollEvaluated, type ParsedRollResult } from '../../services/diceParser';
import { CameraScreenShake } from './SpellAnimationEngine';
import { audioStemMixer } from '../../services/audioStemMixer';

/**
 * GLSL Fragment Shader: Natural 20 Golden Radial Shockwave Ripple
 * Expands outward across 600ms with smooth Hermite wave distortion and golden chromatic glow.
 */
export const NAT20_SHOCKWAVE_FRAG_SHADER = `
precision mediump float;

varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform vec2 uCenter;          // Normalized shockwave origin (0.0 to 1.0)
uniform float uProgress;       // Shockwave expansion progress (0.0 to 1.0 over 600ms)
uniform float uAspect;         // Viewport aspect ratio (width / height)
uniform float uWaveWidth;      // Shockwave ring thickness (e.g. 0.08)
uniform float uWaveStrength;   // Refraction distortion strength (e.g. 0.035)

void main(void) {
    vec2 uv = vTextureCoord;
    vec2 diff = uv - uCenter;
    diff.x *= uAspect;
    float dist = length(diff);

    // Shockwave expands to max radius of 1.2
    float currentRadius = uProgress * 1.2;
    float halfWidth = uWaveWidth * 0.5;

    // Hermite ring falloff envelope
    float ringMask = smoothstep(currentRadius - halfWidth, currentRadius, dist)
                   - smoothstep(currentRadius, currentRadius + halfWidth, dist);

    // Fade out as progress approaches 1.0
    float fade = 1.0 - smoothstep(0.6, 1.0, uProgress);
    float distortion = ringMask * uWaveStrength * fade;

    // Displace UVs radially outward
    vec2 dir = dist > 0.0001 ? normalize(diff) : vec2(0.0);
    dir.x /= uAspect;
    vec2 displacedUv = uv - dir * distortion;

    vec4 color = texture2D(uSampler, displacedUv);

    // Golden luminous wave crest: RGB(245, 158, 11) -> (0.96, 0.62, 0.04)
    vec3 goldColor = vec3(0.98, 0.78, 0.15);
    color.rgb += goldColor * (ringMask * fade * 0.45);

    gl_FragColor = color;
}
`;

/**
 * GLSL Fragment Shader: Natural 1 Screen Desaturation Flash & Red Chromatic Aberration
 * Momentary 250ms desaturation with subtle red channel chromatic aberration pass.
 */
export const NAT1_DESATURATION_FRAG_SHADER = `
precision mediump float;

varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform float uIntensity;      // Desaturation & aberration intensity (0.0 to 1.0)
uniform vec2 uAberrationOffset;// Red chromatic split offset (e.g. vec2(0.005, 0.0))

void main(void) {
    vec2 uv = vTextureCoord;

    // Chromatic aberration: shift red channel outward
    float r = texture2D(uSampler, uv + uAberrationOffset * uIntensity).r;
    float g = texture2D(uSampler, uv).g;
    float b = texture2D(uSampler, uv - uAberrationOffset * (uIntensity * 0.5)).b;
    float a = texture2D(uSampler, uv).a;

    vec3 rgb = vec3(r, g, b);

    // NTSC perceptual luminance: Y = 0.299 R + 0.587 G + 0.114 B
    float luminance = dot(rgb, vec3(0.299, 0.587, 0.114));

    // Flash desaturation down to 0.0 saturation at peak
    vec3 desaturated = mix(rgb, vec3(luminance), uIntensity);

    // Subtle red atmospheric oppression tint
    vec3 redTint = vec3(luminance * 1.15, luminance * 0.85, luminance * 0.85);
    vec3 finalColor = mix(desaturated, redTint, uIntensity * 0.25);

    gl_FragColor = vec4(finalColor, a);
}
`;

export interface Nat20ShockwaveState {
  active: boolean;
  centerX: number;
  centerY: number;
  elapsedMs: number;
  durationMs: number;
}

export interface Nat1FlashState {
  active: boolean;
  elapsedMs: number;
  durationMs: number;
}

export class ImpactVfxEngine {
  public cameraShake: CameraScreenShake;
  public nat20Wave: Nat20ShockwaveState = {
    active: false,
    centerX: 0.5,
    centerY: 0.5,
    elapsedMs: 0,
    durationMs: 600,
  };
  public nat1Flash: Nat1FlashState = {
    active: false,
    elapsedMs: 0,
    durationMs: 250,
  };

  private unsubscribeRollListener: (() => void) | null = null;
  private audioCtx: AudioContext | null = null;

  constructor(cameraShake?: CameraScreenShake) {
    this.cameraShake = cameraShake || new CameraScreenShake();
    this.initRollListener();
  }

  private initRollListener(): void {
    this.unsubscribeRollListener = onDiceRollEvaluated((result: ParsedRollResult) => {
      if (result.isCritical && !this.nat20Wave.active) {
        this.triggerNat20Shockwave(result.tokenCoordinates);
        audioStemMixer.triggerSidechainDucking();
      } else if (result.isFumble && !this.nat1Flash.active) {
        this.triggerNat1Glitch();
        audioStemMixer.triggerSubBassThud();
      }
    });
  }

  public destroy(): void {
    if (this.unsubscribeRollListener) {
      this.unsubscribeRollListener();
      this.unsubscribeRollListener = null;
    }
  }

  /**
   * Natural 20 Trigger:
   * - 600ms golden radial shockwave
   * - Camera trauma impulse of +0.30
   * - High-harmonic synthesized chime SFX via Web Audio
   * - Sidechain audio ducking
   */
  public triggerNatural20(originX = 0.5, originY = 0.5): void {
    this.nat20Wave = {
      active: true,
      centerX: originX,
      centerY: originY,
      elapsedMs: 0,
      durationMs: 600,
    };

    // Camera trauma impulse +0.30
    this.cameraShake.addTrauma(0.30);

    // Audio effects
    this.synthesizeNat20Chime();
    audioStemMixer.triggerCombatImpactDucking();
  }

  public triggerNat20Shockwave(tokenCoordinates?: { x: number; y: number } | [number, number]): void {
    let ox = 0.5;
    let oy = 0.5;
    if (tokenCoordinates) {
      if (Array.isArray(tokenCoordinates)) {
        ox = tokenCoordinates[0];
        oy = tokenCoordinates[1];
      } else if (typeof tokenCoordinates.x === 'number' && typeof tokenCoordinates.y === 'number') {
        ox = tokenCoordinates.x;
        oy = tokenCoordinates.y;
      }
    }
    this.triggerNatural20(ox, oy);
  }

  /**
   * Natural 1 Trigger:
   * - 250ms momentary screen desaturation flash (0.0 saturation) + red chromatic aberration
   * - Low-frequency cinematic sub-bass thud (60Hz sine sweep down to 30Hz)
   * - Sidechain audio ducking
   */
  public triggerNatural1(): void {
    this.nat1Flash = {
      active: true,
      elapsedMs: 0,
      durationMs: 250,
    };

    // Sub-bass thud
    this.synthesizeNat1SubBassThud();
    audioStemMixer.triggerCombatImpactDucking();
  }

  public triggerNat1Glitch(): void {
    this.triggerNatural1();
  }

  public static triggerNat20Shockwave(tokenCoordinates?: { x: number; y: number } | [number, number]): void {
    impactVfxEngine.triggerNat20Shockwave(tokenCoordinates);
  }

  public static triggerNat1Glitch(): void {
    impactVfxEngine.triggerNat1Glitch();
  }

  public update(dtSeconds: number): {
    nat20Progress: number;
    nat1Intensity: number;
    cameraJitter: { offsetX: number; offsetY: number; rotationRad: number };
  } {
    const dtMs = dtSeconds * 1000;

    // Update Nat 20 Shockwave
    let nat20Progress = 0;
    if (this.nat20Wave.active) {
      this.nat20Wave.elapsedMs += dtMs;
      nat20Progress = Math.min(1.0, this.nat20Wave.elapsedMs / this.nat20Wave.durationMs);
      if (nat20Progress >= 1.0) {
        this.nat20Wave.active = false;
      }
    }

    // Update Nat 1 Flash (bell curve: fast rise, smooth fade over 250ms)
    let nat1Intensity = 0;
    if (this.nat1Flash.active) {
      this.nat1Flash.elapsedMs += dtMs;
      const p = Math.min(1.0, this.nat1Flash.elapsedMs / this.nat1Flash.durationMs);
      // Sinusoidal bell curve peak at mid-duration
      nat1Intensity = Math.sin(p * Math.PI);
      if (p >= 1.0) {
        this.nat1Flash.active = false;
      }
    }

    // Update camera trauma decay
    const cameraJitter = this.cameraShake.update(dtSeconds);

    return {
      nat20Progress,
      nat1Intensity,
      cameraJitter,
    };
  }

  /**
   * Synthesizes high-harmonic chime SFX (C6, E6, G6 triad decay) via Web Audio
   */
  public synthesizeNat20Chime(): void {
    if (typeof window === 'undefined') return;
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;

    try {
      if (!this.audioCtx) {
        this.audioCtx = new AC();
      }
      const ctx = this.audioCtx;
      const now = ctx.currentTime;

      // High triad frequencies: C6 (1046.5Hz), E6 (1318.5Hz), G6 (1567.98Hz), B6 (1975.53Hz)
      const freqs = [1046.5, 1318.5, 1567.98, 1975.53];
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.25, now);
      masterGain.connect(ctx.destination);

      for (const f of freqs) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now);

        // Exponential decay envelope over 1.2s
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(now);
        osc.stop(now + 1.2);
      }
    } catch (err) {
      console.warn('[ImpactVfxEngine] Chime synthesis failed:', err);
    }
  }

  /**
   * Synthesizes low-frequency cinematic sub-bass thud (60Hz down to 30Hz) via Web Audio
   */
  public synthesizeNat1SubBassThud(): void {
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
      // Pitch drop: 60Hz down to 30Hz over 0.35s
      osc.frequency.setValueAtTime(60, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.35);

      // Thud envelope: punchy attack, decaying floor
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.45);
    } catch (err) {
      console.warn('[ImpactVfxEngine] Sub-bass thud synthesis failed:', err);
    }
  }

  /**
   * Canvas 2D fallback renderer for Natural 20 golden radial shockwave ring
   */
  public renderCanvasShockwave(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ): void {
    if (!this.nat20Wave.active) return;

    const progress = Math.min(1.0, this.nat20Wave.elapsedMs / this.nat20Wave.durationMs);
    const maxRadius = Math.max(width, height) * 0.75;
    const radius = progress * maxRadius;
    const alpha = (1.0 - progress) * 0.75;

    ctx.save();
    ctx.beginPath();
    ctx.arc(
      this.nat20Wave.centerX * width,
      this.nat20Wave.centerY * height,
      radius,
      0,
      Math.PI * 2
    );
    ctx.strokeStyle = `rgba(245, 158, 11, ${alpha})`;
    ctx.lineWidth = 14 * (1.0 - progress);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(
      this.nat20Wave.centerX * width,
      this.nat20Wave.centerY * height,
      radius * 0.94,
      0,
      Math.PI * 2
    );
    ctx.strokeStyle = `rgba(251, 191, 36, ${alpha * 0.6})`;
    ctx.lineWidth = 6 * (1.0 - progress);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Canvas 2D fallback renderer for Natural 1 desaturation flash & red tint
   */
  public renderCanvasFumbleFlash(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ): void {
    if (!this.nat1Flash.active) return;

    const p = Math.min(1.0, this.nat1Flash.elapsedMs / this.nat1Flash.durationMs);
    const intensity = Math.sin(p * Math.PI);

    ctx.save();
    // Momentary dark red overlay
    ctx.fillStyle = `rgba(153, 27, 27, ${intensity * 0.28})`;
    ctx.fillRect(0, 0, width, height);

    // Subtle dark vignetting
    const grad = ctx.createRadialGradient(
      width / 2, height / 2, Math.min(width, height) * 0.2,
      width / 2, height / 2, Math.max(width, height) * 0.7
    );
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(1, `rgba(0, 0, 0, ${intensity * 0.45})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
}

export const impactVfxEngine = new ImpactVfxEngine();
