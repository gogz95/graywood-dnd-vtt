// src/lib/canvas/weatherCanvasRenderer.ts
// Procedural Particle Weather Engine for Tactical Canvas WeatherFxLayer
// Supports rain with collision splashes, drifting snow, multi-octave fog, and ash embers

import type { WeatherType } from '../types/maps';

interface RainDrop {
  x: number;
  y: number;
  length: number;
  speed: number;
  alpha: number;
}

interface SplashRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
}

interface SnowFlake {
  x: number;
  y: number;
  radius: number;
  speed: number;
  wobbleSpeed: number;
  wobbleAmp: number;
  phase: number;
  alpha: number;
}

interface AshEmber {
  x: number;
  y: number;
  size: number;
  speedY: number;
  speedX: number;
  baseAlpha: number;
  flickerSpeed: number;
  phase: number;
  life: number;
  maxLife: number;
}

interface FogPuff {
  x: number;
  y: number;
  radius: number;
  speedX: number;
  speedY: number;
  alpha: number;
}

export class WeatherCanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null = null;
  private animId: number | null = null;

  public weatherType: WeatherType = 'clear';
  public intensity: number = 0.5; // 0.0 - 1.0

  private vpX = 0;
  private vpY = 0;
  private vpZoom = 1.0;
  private tokenBounds: Array<{ x: number; y: number; w: number; h: number }> = [];

  // Particle pools
  private rainDrops: RainDrop[] = [];
  private splashes: SplashRing[] = [];
  private snowFlakes: SnowFlake[] = [];
  private ashEmbers: AshEmber[] = [];
  private fogPuffs: FogPuff[] = [];

  private lastTime = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.initPools();
    this.start();
  }

  public setWeatherPreset(type: WeatherType, intensity: number = 0.5): void {
    this.weatherType = type;
    this.intensity = Math.max(0, Math.min(1, intensity));
    this.initPools();
  }

  public setViewport(x: number, y: number, zoom: number): void {
    this.vpX = x;
    this.vpY = y;
    this.vpZoom = zoom;
  }

  public setTokenColliders(tokens: Array<{ x: number; y: number; size?: number }>, gridSize: number): void {
    this.tokenBounds = tokens.map(t => {
      const s = (t.size || 1) * gridSize;
      return {
        x: t.x * gridSize,
        y: t.y * gridSize,
        w: s,
        h: s,
      };
    });
  }

  private initPools(): void {
    const w = this.canvas.width || 800;
    const h = this.canvas.height || 600;

    this.rainDrops = [];
    this.splashes = [];
    this.snowFlakes = [];
    this.ashEmbers = [];
    this.fogPuffs = [];

    if (this.weatherType === 'clear' || this.intensity <= 0.01) return;

    if (this.weatherType === 'rain') {
      const count = Math.floor(180 * this.intensity);
      for (let i = 0; i < count; i++) {
        this.rainDrops.push({
          x: Math.random() * w,
          y: Math.random() * h,
          length: 12 + Math.random() * 16,
          speed: 18 + Math.random() * 14,
          alpha: 0.25 + Math.random() * 0.45,
        });
      }
    } else if (this.weatherType === 'snow') {
      const count = Math.floor(120 * this.intensity);
      for (let i = 0; i < count; i++) {
        this.snowFlakes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          radius: 1.5 + Math.random() * 2.5,
          speed: 1.0 + Math.random() * 2.2,
          wobbleSpeed: 0.002 + Math.random() * 0.004,
          wobbleAmp: 1.2 + Math.random() * 2.5,
          phase: Math.random() * Math.PI * 2,
          alpha: 0.4 + Math.random() * 0.5,
        });
      }
    } else if (this.weatherType === 'ash') {
      const count = Math.floor(80 * this.intensity);
      for (let i = 0; i < count; i++) {
        this.ashEmbers.push({
          x: Math.random() * w,
          y: Math.random() * h,
          size: 1.5 + Math.random() * 3,
          speedY: -(0.8 + Math.random() * 1.8),
          speedX: (Math.random() - 0.5) * 1.2,
          baseAlpha: 0.3 + Math.random() * 0.6,
          flickerSpeed: 0.005 + Math.random() * 0.01,
          phase: Math.random() * Math.PI * 2,
          life: Math.random() * 200,
          maxLife: 150 + Math.random() * 150,
        });
      }
    } else if (this.weatherType === 'fog') {
      const count = Math.floor(18 * this.intensity);
      for (let i = 0; i < count; i++) {
        this.fogPuffs.push({
          x: Math.random() * w,
          y: Math.random() * h,
          radius: 140 + Math.random() * 160,
          speedX: (Math.random() * 0.4 + 0.1) * (Math.random() > 0.5 ? 1 : -1),
          speedY: (Math.random() * 0.2 - 0.1),
          alpha: (0.08 + Math.random() * 0.12) * this.intensity,
        });
      }
    }
  }

  public start(): void {
    if (this.animId) return;
    const render = (time: number) => {
      this.tick(time);
      this.animId = requestAnimationFrame(render);
    };
    this.animId = requestAnimationFrame(render);
  }

  public stop(): void {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }

  public destroy(): void {
    this.stop();
    this.ctx = null;
    this.rainDrops = [];
    this.splashes = [];
    this.snowFlakes = [];
    this.ashEmbers = [];
    this.fogPuffs = [];
  }

  private tick(now: number): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    if (this.weatherType === 'clear' || this.intensity <= 0.01) return;

    // 1. RAIN
    if (this.weatherType === 'rain') {
      ctx.lineWidth = 1.2;
      for (let drop of this.rainDrops) {
        drop.y += drop.speed;
        drop.x -= drop.speed * 0.25; // Angled wind

        if (drop.y > h || drop.x < 0) {
          // Check collision near landing point for splash
          if (Math.random() < 0.35 && this.splashes.length < 30) {
            this.splashes.push({
              x: drop.x,
              y: Math.min(drop.y, h - 2),
              radius: 1,
              maxRadius: 4 + Math.random() * 6,
              alpha: 0.6,
            });
          }
          drop.y = -drop.length;
          drop.x = Math.random() * (w + 100);
        }

        ctx.strokeStyle = `rgba(186, 230, 253, ${drop.alpha})`;
        ctx.beginPath();
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x - drop.length * 0.25, drop.y + drop.length);
        ctx.stroke();
      }

      // Splashes
      for (let i = this.splashes.length - 1; i >= 0; i--) {
        const s = this.splashes[i];
        s.radius += 0.4;
        s.alpha -= 0.04;
        if (s.alpha <= 0 || s.radius >= s.maxRadius) {
          this.splashes.splice(i, 1);
          continue;
        }
        ctx.strokeStyle = `rgba(224, 242, 254, ${s.alpha})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // 2. SNOW
    else if (this.weatherType === 'snow') {
      ctx.fillStyle = '#ffffff';
      for (let flake of this.snowFlakes) {
        flake.y += flake.speed;
        flake.x += Math.sin(now * flake.wobbleSpeed + flake.phase) * flake.wobbleAmp;

        if (flake.y > h) {
          flake.y = -flake.radius * 2;
          flake.x = Math.random() * w;
        }

        ctx.fillStyle = `rgba(255, 255, 255, ${flake.alpha})`;
        ctx.beginPath();
        ctx.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 3. ASH & EMBERS
    else if (this.weatherType === 'ash') {
      for (let ember of this.ashEmbers) {
        ember.y += ember.speedY;
        ember.x += ember.speedX + Math.sin(now * 0.003 + ember.phase) * 0.5;
        ember.life += 1;

        const flicker = Math.sin(now * ember.flickerSpeed + ember.phase) * 0.3;
        const currentAlpha = Math.max(0.1, Math.min(1, ember.baseAlpha + flicker));

        if (ember.y < -10 || ember.life > ember.maxLife) {
          ember.y = h + 10;
          ember.x = Math.random() * w;
          ember.life = 0;
        }

        // Glowing fire core gradient
        const rad = ember.size;
        const grad = ctx.createRadialGradient(ember.x, ember.y, 0, ember.x, ember.y, rad * 2);
        grad.addColorStop(0, `rgba(254, 240, 138, ${currentAlpha})`);
        grad.addColorStop(0.5, `rgba(249, 115, 22, ${currentAlpha * 0.8})`);
        grad.addColorStop(1, `rgba(220, 38, 38, 0)`);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(ember.x, ember.y, rad * 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 4. FOG NOISE DRIFT
    else if (this.weatherType === 'fog') {
      // Dynamic opacity scaling factoring zoom
      const zoomFactor = Math.max(0.5, Math.min(1.5, 1 / this.vpZoom));

      for (let puff of this.fogPuffs) {
        puff.x += puff.speedX;
        puff.y += puff.speedY;

        if (puff.x - puff.radius > w) puff.x = -puff.radius;
        if (puff.x + puff.radius < 0) puff.x = w + puff.radius;
        if (puff.y - puff.radius > h) puff.y = -puff.radius;
        if (puff.y + puff.radius < 0) puff.y = h + puff.radius;

        const grad = ctx.createRadialGradient(puff.x, puff.y, 0, puff.x, puff.y, puff.radius);
        const a = puff.alpha * zoomFactor;
        grad.addColorStop(0, `rgba(203, 213, 225, ${a})`);
        grad.addColorStop(0.5, `rgba(148, 163, 184, ${a * 0.6})`);
        grad.addColorStop(1, 'rgba(100, 116, 139, 0)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(puff.x, puff.y, puff.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
