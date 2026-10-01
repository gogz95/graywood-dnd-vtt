// frontend/src/lib/canvas/weatherParticleLayer.ts
// High-Performance Weather Particle Overlay Engine: Rain, Snow, and Dense Fog
// Automatically flags 5e Wisdom (Perception) sight-based checks with Disadvantage during heavy precipitation/fog.

export type WeatherEffectType = 'none' | 'rain' | 'snow' | 'fog';

export interface WeatherConfig {
  type: WeatherEffectType;
  intensity: number; // 0.0 - 1.0
  speed: number; // multiplier, default 1.0
  windAngle?: number; // in radians, default Math.PI / 4
}

export interface RainParticle {
  x: number;
  y: number;
  speed: number;
  length: number;
  alpha: number;
}

export interface SnowParticle {
  x: number;
  y: number;
  radius: number;
  speedY: number;
  wobbleSpeed: number;
  wobbleAmp: number;
  phase: number;
  alpha: number;
}

export interface FogParticle {
  x: number;
  y: number;
  radius: number;
  speedX: number;
  speedY: number;
  alpha: number;
}

/**
 * Evaluates whether current atmospheric weather conditions impose Disadvantage
 * on visual Wisdom (Perception) checks according to 5e SRD 5.1 rules (Lightly/Heavily Obscured):
 * - Heavy Rain (intensity >= 0.60): Disadvantage
 * - Dense Fog (intensity >= 0.40): Disadvantage
 */
export function hasVisualPerceptionDisadvantage(
  weatherType: WeatherEffectType | string,
  intensity: number = 1.0
): boolean {
  const norm = weatherType.toLowerCase().trim();
  if (norm === 'rain' && intensity >= 0.6) {
    return true;
  }
  if (norm === 'fog' && intensity >= 0.4) {
    return true;
  }
  if (norm === 'snow' && intensity >= 0.75) {
    return true;
  }
  return false;
}

/**
 * Returns human-readable mechanical perception penalty description.
 */
export function getPerceptionDisadvantageReason(
  weatherType: WeatherEffectType | string,
  intensity: number = 1.0
): string | null {
  if (!hasVisualPerceptionDisadvantage(weatherType, intensity)) {
    return null;
  }
  const norm = weatherType.toLowerCase().trim();
  if (norm === 'rain') {
    return 'Heavy torrential downpour heavily obscures vision (Disadvantage on visual Perception checks)';
  }
  if (norm === 'fog') {
    return 'Dense rolling fog imposes visual obstruction (Disadvantage on visual Perception checks)';
  }
  if (norm === 'snow') {
    return 'Blinding blizzard conditions obscure line of sight (Disadvantage on visual Perception checks)';
  }
  return null;
}

export class WeatherParticleLayer {
  private width = 800;
  private height = 600;
  private config: WeatherConfig = { type: 'none', intensity: 0, speed: 1 };
  private rainDrops: RainParticle[] = [];
  private snowFlakes: SnowParticle[] = [];
  private fogPuffs: FogParticle[] = [];

  constructor(width = 800, height = 600) {
    this.resize(width, height);
  }

  public resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.reseedParticles();
  }

  public setWeather(config: Partial<WeatherConfig>): void {
    this.config = { ...this.config, ...config };
    this.reseedParticles();
  }

  public getPerceptionDisadvantage(): boolean {
    return hasVisualPerceptionDisadvantage(this.config.type, this.config.intensity);
  }

  private reseedParticles(): void {
    const { type, intensity } = this.config;
    this.rainDrops = [];
    this.snowFlakes = [];
    this.fogPuffs = [];

    if (type === 'none' || intensity <= 0) return;

    if (type === 'rain') {
      const count = Math.floor(250 * intensity);
      for (let i = 0; i < count; i++) {
        this.rainDrops.push({
          x: Math.random() * this.width,
          y: Math.random() * this.height,
          speed: 18 + Math.random() * 12,
          length: 12 + Math.random() * 10,
          alpha: 0.3 + Math.random() * 0.4,
        });
      }
    } else if (type === 'snow') {
      const count = Math.floor(150 * intensity);
      for (let i = 0; i < count; i++) {
        this.snowFlakes.push({
          x: Math.random() * this.width,
          y: Math.random() * this.height,
          radius: 1.5 + Math.random() * 2.5,
          speedY: 1.2 + Math.random() * 2.0,
          wobbleSpeed: 1.5 + Math.random() * 2.0,
          wobbleAmp: 10 + Math.random() * 15,
          phase: Math.random() * Math.PI * 2,
          alpha: 0.5 + Math.random() * 0.4,
        });
      }
    } else if (type === 'fog') {
      const count = Math.floor(35 * intensity);
      for (let i = 0; i < count; i++) {
        this.fogPuffs.push({
          x: Math.random() * this.width,
          y: Math.random() * this.height,
          radius: 80 + Math.random() * 120,
          speedX: (Math.random() - 0.5) * 0.4,
          speedY: (Math.random() - 0.5) * 0.2,
          alpha: 0.08 + Math.random() * 0.12,
        });
      }
    }
  }

  public update(dtSeconds: number = 0.016): void {
    const { type, speed } = this.config;
    if (type === 'none') return;

    const rate = speed * (dtSeconds * 60);

    if (type === 'rain') {
      for (const d of this.rainDrops) {
        d.y += d.speed * rate;
        d.x -= 2 * rate;
        if (d.y > this.height) {
          d.y = -d.length;
          d.x = Math.random() * (this.width + 100);
        }
        if (d.x < -20) {
          d.x = this.width + 20;
        }
      }
    } else if (type === 'snow') {
      for (const s of this.snowFlakes) {
        s.phase += s.wobbleSpeed * dtSeconds;
        s.y += s.speedY * rate;
        s.x += Math.sin(s.phase) * (s.wobbleAmp * dtSeconds * 3);
        if (s.y > this.height) {
          s.y = -s.radius * 2;
          s.x = Math.random() * this.width;
        }
        if (s.x < 0) s.x = this.width;
        if (s.x > this.width) s.x = 0;
      }
    } else if (type === 'fog') {
      for (const p of this.fogPuffs) {
        p.x += p.speedX * rate;
        p.y += p.speedY * rate;
        if (p.x - p.radius > this.width) p.x = -p.radius;
        if (p.x + p.radius < 0) p.x = this.width + p.radius;
        if (p.y - p.radius > this.height) p.y = -p.radius;
        if (p.y + p.radius < 0) p.y = this.height + p.radius;
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    const { type, intensity } = this.config;
    if (type === 'none' || intensity <= 0) return;

    ctx.save();

    if (type === 'rain') {
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.65)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (const d of this.rainDrops) {
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - 2, d.y + d.length);
      }
      ctx.stroke();
    } else if (type === 'snow') {
      for (const s of this.snowFlakes) {
        ctx.fillStyle = `rgba(255, 255, 255, ${s.alpha})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (type === 'fog') {
      for (const p of this.fogPuffs) {
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
        grad.addColorStop(0, `rgba(226, 232, 240, ${p.alpha * intensity})`);
        grad.addColorStop(0.6, `rgba(203, 213, 225, ${p.alpha * intensity * 0.5})`);
        grad.addColorStop(1, 'rgba(203, 213, 225, 0)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }
}
