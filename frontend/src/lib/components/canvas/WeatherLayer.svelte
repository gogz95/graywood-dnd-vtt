<!-- WeatherLayer.svelte — PixiJS v8 GPU Particle Weather Engine -->
<!-- Renders Rain, Snow, Fog, or Embers particle emitters above the token layer -->

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Container, Graphics, Application, Ticker } from 'pixi.js';
  import { vttTimeStore, type WeatherMode } from '../../stores/timeStore.svelte';

  interface Props {
    pixiApp: Application | null;
    parentContainer: Container | null;
    zoom?: number;
    panX?: number;
    panY?: number;
  }

  let { pixiApp, parentContainer, zoom = 1, panX = 0, panY = 0 }: Props = $props();

  // ── Internal state ─────────────────────────────────────────────────────────
  let weatherContainer: Container | null = null;
  let particles: Particle[] = [];
  let ticker: Ticker | null = null;
  let canvasW = 0;
  let canvasH = 0;

  interface Particle {
    g: Graphics;
    x: number;
    y: number;
    vx: number;
    vy: number;
    alpha: number;
    alphaVel: number;  // for fog pulsing
    size: number;
    rotation: number;
    rotationSpeed: number;
    life: number;
    maxLife: number;
  }

  // ── Particle config per mode ───────────────────────────────────────────────
  const MODE_CONFIG: Record<WeatherMode, {
    count: number;
    color: number;
    minSize: number;
    maxSize: number;
    vxRange: [number, number];
    vyRange: [number, number];
    alphaRange: [number, number];
    shape: 'line' | 'circle' | 'flake' | 'ember';
  }> = {
    none:   { count: 0,   color: 0xffffff, minSize: 2,  maxSize: 4,   vxRange: [0, 0],    vyRange: [0, 0],     alphaRange: [0, 0],     shape: 'circle' },
    rain:   { count: 350, color: 0x93c5fd, minSize: 12, maxSize: 28,  vxRange: [-1, 1],   vyRange: [14, 22],   alphaRange: [0.45, 0.80], shape: 'line'   },
    snow:   { count: 200, color: 0xe0f2fe, minSize: 3,  maxSize: 7,   vxRange: [-1.5, 1.5], vyRange: [1.5, 4], alphaRange: [0.65, 0.95], shape: 'flake'  },
    fog:    { count: 18,  color: 0x94a3b8, minSize: 90, maxSize: 200, vxRange: [0.2, 0.7], vyRange: [0, 0],    alphaRange: [0.06, 0.18], shape: 'circle' },
    embers: { count: 80,  color: 0xf97316, minSize: 2,  maxSize: 5,   vxRange: [-2, 2],   vyRange: [-5, -1],   alphaRange: [0.60, 1.00], shape: 'ember'  },
  };

  function rand(min: number, max: number) {
    return min + Math.random() * (max - min);
  }

  function spawnParticle(mode: WeatherMode, existingG?: Graphics): Particle {
    const cfg = MODE_CONFIG[mode];
    const g = existingG ?? new Graphics();
    const size = rand(cfg.minSize, cfg.maxSize);

    const x = rand(-50, canvasW + 50);
    const y = mode === 'rain' || mode === 'snow' ? rand(-100, -10)
             : mode === 'embers' ? rand(canvasH * 0.4, canvasH + 30)
             : rand(-50, canvasH + 50);

    const alpha = rand(cfg.alphaRange[0], cfg.alphaRange[1]);
    const vx = rand(cfg.vxRange[0], cfg.vxRange[1]);
    const vy = rand(cfg.vyRange[0], cfg.vyRange[1]);
    const life = rand(120, 280);

    drawParticle(g, mode, size, alpha, cfg.color);
    g.position.set(x, y);
    g.alpha = alpha;

    return {
      g, x, y, vx, vy,
      alpha, alphaVel: (Math.random() - 0.5) * 0.002,
      size, rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.05,
      life, maxLife: life,
    };
  }

  function drawParticle(g: Graphics, mode: WeatherMode, size: number, alpha: number, color: number) {
    g.clear();
    if (mode === 'rain') {
      g.moveTo(0, 0).lineTo(0, size).stroke({ color, alpha: 1, width: 1.5 });
    } else if (mode === 'snow' || mode === 'flake' as any) {
      // 6-arm snowflake
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        const arm = size * 0.9;
        g.moveTo(0, 0)
         .lineTo(Math.cos(angle) * arm, Math.sin(angle) * arm)
         .stroke({ color, alpha: 1, width: 1 });
        // Branch
        const bLen = arm * 0.4;
        const bx = Math.cos(angle) * arm * 0.5;
        const by = Math.sin(angle) * arm * 0.5;
        g.moveTo(bx, by)
         .lineTo(bx + Math.cos(angle + Math.PI / 4) * bLen, by + Math.sin(angle + Math.PI / 4) * bLen)
         .stroke({ color, alpha: 0.7, width: 0.8 });
      }
    } else if (mode === 'fog') {
      g.circle(0, 0, size).fill({ color, alpha: 1 });
    } else if (mode === 'embers') {
      g.circle(0, 0, size).fill({ color: 0xfef3c7, alpha: 1 });
      g.circle(0, 0, size * 0.5).fill({ color: 0xf97316, alpha: 1 });
    }
  }

  function buildParticles(mode: WeatherMode) {
    if (!weatherContainer) return;
    // Remove old
    weatherContainer.removeChildren().forEach((c) => { try { c.destroy({ children: true }); } catch {} });
    particles = [];

    if (mode === 'none') return;

    const cfg = MODE_CONFIG[mode];
    for (let i = 0; i < cfg.count; i++) {
      // Stagger starting positions vertically
      const p = spawnParticle(mode);
      if (mode === 'rain' || mode === 'snow') {
        p.y = rand(-canvasH, canvasH);
        p.g.position.y = p.y;
      }
      weatherContainer.addChild(p.g);
      particles.push(p);
    }
  }

  function tick(delta: number) {
    if (!pixiApp || !weatherContainer) return;
    const mode = vttTimeStore.weather;
    if (mode === 'none') return;

    const cfg = MODE_CONFIG[mode];
    const w = pixiApp.renderer.width / (window.devicePixelRatio || 1);
    const h = pixiApp.renderer.height / (window.devicePixelRatio || 1);

    for (const p of particles) {
      // Embers drift with sinusoidal horizontal sway
      if (mode === 'embers') {
        p.x += p.vx * delta + Math.sin(p.life * 0.08) * 0.6;
      } else {
        p.x += p.vx * delta;
      }
      p.y += p.vy * delta;
      p.life -= delta;

      if (mode === 'snow') {
        p.rotation += p.rotationSpeed;
        p.g.rotation = p.rotation;
        // Slight horizontal drift oscillation
        p.x += Math.sin(p.life * 0.04) * 0.35;
      }

      if (mode === 'fog') {
        // Fog blobs pulse alpha
        p.alpha += p.alphaVel;
        if (p.alpha < cfg.alphaRange[0] || p.alpha > cfg.alphaRange[1]) p.alphaVel *= -1;
        p.g.alpha = Math.max(0, Math.min(1, p.alpha));
      }

      p.g.position.set(p.x, p.y);

      // Fade out near end of life
      const lifeRatio = p.life / p.maxLife;
      if (lifeRatio < 0.15 && mode !== 'fog') {
        p.g.alpha = p.alpha * (lifeRatio / 0.15);
      }

      // Respawn if out of bounds or life exhausted
      const oob = p.x < -200 || p.x > w + 200 || p.y > h + 50 || p.y < -200 || p.life <= 0;
      if (oob) {
        const fresh = spawnParticle(mode, p.g);
        p.x = fresh.x; p.y = fresh.y;
        p.vx = fresh.vx; p.vy = fresh.vy;
        p.alpha = fresh.alpha;
        p.life = fresh.maxLife; p.maxLife = fresh.maxLife;
        p.rotation = fresh.rotation;
        p.g.position.set(p.x, p.y);
        p.g.alpha = p.alpha;
      }
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  onMount(() => {
    if (!pixiApp || !parentContainer) return;

    weatherContainer = new Container();
    weatherContainer.zIndex = 9000; // above everything
    weatherContainer.interactiveChildren = false;
    parentContainer.addChild(weatherContainer);

    canvasW = pixiApp.renderer.width / (window.devicePixelRatio || 1);
    canvasH = pixiApp.renderer.height / (window.devicePixelRatio || 1);

    buildParticles(vttTimeStore.weather);

    ticker = pixiApp.ticker;
    ticker.add(tick);
  });

  onDestroy(() => {
    if (ticker) ticker.remove(tick);
    if (weatherContainer) {
      weatherContainer.removeChildren().forEach((c) => { try { c.destroy({ children: true }); } catch {} });
      try { weatherContainer.destroy({ children: true }); } catch {}
      weatherContainer = null;
    }
    particles = [];
  });

  // ── Reactively rebuild when weather mode changes ───────────────────────────
  $effect(() => {
    const mode = vttTimeStore.weather;
    if (weatherContainer && pixiApp) {
      canvasW = pixiApp.renderer.width / (window.devicePixelRatio || 1);
      canvasH = pixiApp.renderer.height / (window.devicePixelRatio || 1);
      buildParticles(mode);
    }
  });

  // Position the weather container so it's always screen-space, not world-space
  $effect(() => {
    if (weatherContainer) {
      // Counter the world container's transform so weather fills the screen
      weatherContainer.position.set(-panX / zoom, -panY / zoom);
      weatherContainer.scale.set(1 / zoom);
    }
  });
</script>
<!-- WeatherLayer renders purely to PixiJS canvas — no DOM output needed -->
