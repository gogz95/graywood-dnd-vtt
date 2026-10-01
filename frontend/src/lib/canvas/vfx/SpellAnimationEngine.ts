// frontend/src/lib/canvas/vfx/SpellAnimationEngine.ts
// Quadratic Bezier Projectiles, Particle Explosions, & Camera Screen-Shake Trauma Engine

export interface Point2D {
  x: number;
  y: number;
}

export type SpellVfxProfile = 'fireball' | 'magic_missile' | 'eldritch_blast' | 'lightning_bolt';

export interface ProjectileVfxConfig {
  id: string;
  profile: SpellVfxProfile;
  start: Point2D;
  target: Point2D;
  durationMs: number;
  curvature?: number; // Distance offset for Bezier control point perpendicular to flight path
  spiralFrequency?: number; // Used for Magic Missile erratic arcs
  color?: string;
  sparkColor?: string;
  size?: number;
  impactTrauma?: number; // 0.0 to 1.0 camera trauma impulse on impact
}

export interface BurstParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
}

/**
 * Computes a 2D position along a quadratic Bezier trajectory:
 * B(t) = (1 - t)^2 * P0 + 2 * (1 - t) * t * P1 + t^2 * P2,  t in [0, 1]
 */
export function quadraticBezierPoint(
  p0: Point2D,
  p1: Point2D,
  p2: Point2D,
  t: number
): Point2D {
  const clampedT = Math.max(0, Math.min(1, t));
  const invT = 1 - clampedT;

  const x = invT * invT * p0.x + 2 * invT * clampedT * p1.x + clampedT * clampedT * p2.x;
  const y = invT * invT * p0.y + 2 * invT * clampedT * p1.y + clampedT * clampedT * p2.y;

  return { x, y };
}

/**
 * Calculates a control point P1 offset perpendicularly from the chord midpoint P0 -> P2.
 */
export function calculateBezierControlPoint(
  p0: Point2D,
  p2: Point2D,
  curvature: number = 80
): Point2D {
  const midX = (p0.x + p2.x) / 2;
  const midY = (p0.y + p2.y) / 2;

  const dx = p2.x - p0.x;
  const dy = p2.y - p0.y;
  const dist = Math.hypot(dx, dy);

  if (dist === 0) return { x: midX, y: midY };

  // Normal vector perpendicular to trajectory
  const nx = -dy / dist;
  const ny = dx / dist;

  return {
    x: midX + nx * curvature,
    y: midY + ny * curvature,
  };
}

/**
 * Camera Screen-Shake Trauma System:
 * Employs quadratic trauma decay (trauma = max(0, trauma - dt * decay))
 * yielding realistic nonlinear damping for heavy impacts.
 */
export class CameraScreenShake {
  public trauma: number = 0.0;
  public maxOffsetPx: number = 24.0;
  public maxRotationRad: number = 0.045; // ~2.5 degrees
  public decayRate: number = 1.65; // Units of trauma dissipated per second

  public addTrauma(amount: number): void {
    this.trauma = Math.min(1.0, this.trauma + amount);
  }

  public update(dtSeconds: number): {
    offsetX: number;
    offsetY: number;
    rotationRad: number;
  } {
    if (this.trauma <= 0) {
      return { offsetX: 0, offsetY: 0, rotationRad: 0 };
    }

    this.trauma = Math.max(0, this.trauma - dtSeconds * this.decayRate);
    if (this.trauma <= 0) {
      return { offsetX: 0, offsetY: 0, rotationRad: 0 };
    }

    // Nonlinear squaring ensures strong hits feel jarring while small tremors taper smoothly
    const shake = this.trauma * this.trauma;

    // High-frequency pseudo-random sample
    const noiseX = (Math.random() - 0.5) * 2;
    const noiseY = (Math.random() - 0.5) * 2;
    const noiseRot = (Math.random() - 0.5) * 2;

    return {
      offsetX: this.maxOffsetPx * shake * noiseX,
      offsetY: this.maxOffsetPx * shake * noiseY,
      rotationRad: this.maxRotationRad * shake * noiseRot,
    };
  }
}

export class SpellAnimationEngine {
  public activeProjectiles: Array<{
    config: ProjectileVfxConfig;
    p1: Point2D;
    elapsedMs: number;
    trail: Point2D[];
  }> = [];

  public activeBursts: BurstParticle[] = [];
  public cameraShake: CameraScreenShake = new CameraScreenShake();

  public fireSpellProjectile(config: ProjectileVfxConfig): void {
    const curvature = config.curvature ?? (config.profile === 'fireball' ? 65 : config.profile === 'magic_missile' ? -90 : 0);
    const p1 = calculateBezierControlPoint(config.start, config.target, curvature);

    this.activeProjectiles.push({
      config,
      p1,
      elapsedMs: 0,
      trail: [],
    });
  }

  public triggerImpactExplosion(
    x: number,
    y: number,
    color: string = '#f97316',
    count: number = 40
  ): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 8;
      this.activeBursts.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 2 + Math.random() * 4,
        color,
        alpha: 1.0,
        life: 0,
        maxLife: 0.35 + Math.random() * 0.45,
      });
    }
  }

  public update(dtSeconds: number): void {
    const dtMs = dtSeconds * 1000;

    // 1. Update Projectiles
    const remainingProjectiles: typeof this.activeProjectiles = [];

    for (const proj of this.activeProjectiles) {
      proj.elapsedMs += dtMs;
      const t = Math.min(1.0, proj.elapsedMs / proj.config.durationMs);

      let currentPos = quadraticBezierPoint(proj.config.start, proj.p1, proj.config.target, t);

      // Magic missile erratic spiral perturbation
      if (proj.config.profile === 'magic_missile') {
        const spiralFreq = proj.config.spiralFrequency ?? 24;
        const spiralAmp = Math.sin(t * Math.PI) * 16;
        currentPos.x += Math.sin(t * spiralFreq) * spiralAmp;
        currentPos.y += Math.cos(t * spiralFreq) * spiralAmp;
      }

      proj.trail.push(currentPos);
      if (proj.trail.length > 18) {
        proj.trail.shift();
      }

      if (t >= 1.0) {
        // Target arrival: trigger impact explosion & camera trauma
        const burstColor = proj.config.sparkColor || (proj.config.profile === 'eldritch_blast' ? '#10b981' : proj.config.profile === 'magic_missile' ? '#a855f7' : '#f97316');
        this.triggerImpactExplosion(proj.config.target.x, proj.config.target.y, burstColor, 45);

        if (proj.config.impactTrauma) {
          this.cameraShake.addTrauma(proj.config.impactTrauma);
        } else if (proj.config.profile === 'fireball') {
          this.cameraShake.addTrauma(0.65);
        }
      } else {
        remainingProjectiles.push(proj);
      }
    }
    this.activeProjectiles = remainingProjectiles;

    // 2. Update Burst Particles
    const remainingBursts: BurstParticle[] = [];
    for (const p of this.activeBursts) {
      p.life += dtSeconds;
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.alpha = Math.max(0, 1.0 - p.life / p.maxLife);

      if (p.life < p.maxLife) {
        remainingBursts.push(p);
      }
    }
    this.activeBursts = remainingBursts;
  }

  public render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    // Additive blending for luminous energy VFX
    ctx.globalCompositeOperation = 'lighter';

    // 1. Render Projectiles & Trails
    for (const proj of this.activeProjectiles) {
      if (proj.trail.length < 2) continue;

      const profileColor = proj.config.color || (proj.config.profile === 'eldritch_blast' ? '#10b981' : proj.config.profile === 'magic_missile' ? '#c084fc' : '#fb923c');

      // Trail ribbon
      ctx.lineWidth = proj.config.size || 4;
      ctx.lineCap = 'round';
      ctx.strokeStyle = profileColor;
      ctx.beginPath();
      ctx.moveTo(proj.trail[0].x, proj.trail[0].y);
      for (let i = 1; i < proj.trail.length; i++) {
        ctx.lineTo(proj.trail[i].x, proj.trail[i].y);
      }
      ctx.stroke();

      // Projectile head spark
      const head = proj.trail[proj.trail.length - 1];
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(head.x, head.y, (proj.config.size || 4) * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. Render Burst Explosion Particles
    for (const p of this.activeBursts) {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
