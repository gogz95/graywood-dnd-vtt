<script lang="ts">
  // Scene3D.svelte — 3D Isometric WebGL/Hardware Canvas Viewport for TV Spectator Display
  import { onMount, onDestroy } from 'svelte';
  import type { MapSceneData } from '$lib/types/viewport';
  import type { TokenCoordinates } from '$lib/types/coreModels';
  import MiniaturesAndDice from './MiniaturesAndDice.svelte';

  interface Token3D extends TokenCoordinates {
    id?: string;
    name?: string;
    color?: string;
    sizeCells?: number;
    // Lerp state
    currX?: number;
    currY?: number;
    currElev?: number;
  }

  interface Props {
    scene?: MapSceneData;
    tokens?: any[];
    isDmView?: boolean;
  }

  let {
    scene = {
      id: 'default-scene',
      name: 'Tactical Battlemat',
      type: 'tactical_3d',
      grid: { type: 'square', size: 50, scaleFeet: 5 }
    },
    tokens = [],
    isDmView = false
  }: Props = $props();

  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let animId: number | null = null;
  let bgImage: HTMLImageElement | null = null;

  // Active smooth-lerp token cache: id -> Token3D
  const lerpTokens = new Map<string, Token3D>();

  // Lighting & Sun angles
  const sunDir = { x: 0.6, y: -0.8, z: 0.4 };
  const sunLen = Math.hypot(sunDir.x, sunDir.y, sunDir.z);
  const normSun = { x: sunDir.x / sunLen, y: sunDir.y / sunLen, z: sunDir.z / sunLen };

  // Load ground texture if specified
  $effect(() => {
    const url = scene.assetUrl;
    if (url) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = url;
      img.onload = () => {
        bgImage = img;
      };
    } else {
      bgImage = null;
    }
  });

  // Strict visibility culling for TV display: never leak hidden monsters when isDmView is false
  let visibleTokens = $derived(
    tokens.filter((t) => isDmView || (t.isVisible !== false && !t.hidden))
  );

  // Synchronize target token coordinates into lerp state
  $effect(() => {
    const activeIds = new Set<string>();

    for (const raw of visibleTokens) {
      const id = raw.id ?? raw.instance_id ?? `token-${raw.gridX}-${raw.gridY}`;
      activeIds.add(id);

      const targetGridX = raw.gridX ?? (raw.x !== undefined ? raw.x / (scene.grid?.size || 50) : 0);
      const targetGridY = raw.gridY ?? (raw.y !== undefined ? raw.y / (scene.grid?.size || 50) : 0);
      const targetElev = raw.elevationFt ?? raw.elevation ?? 0;
      const targetOffsetX = raw.offsetX ?? 0;
      const targetOffsetY = raw.offsetY ?? 0;

      const existing = lerpTokens.get(id);
      if (existing) {
        existing.gridX = targetGridX;
        existing.gridY = targetGridY;
        existing.offsetX = targetOffsetX;
        existing.offsetY = targetOffsetY;
        existing.elevationFt = targetElev;
        existing.name = raw.name ?? existing.name;
        existing.color = raw.color ?? existing.color;
      } else {
        lerpTokens.set(id, {
          id,
          gridX: targetGridX,
          gridY: targetGridY,
          offsetX: targetOffsetX,
          offsetY: targetOffsetY,
          elevationFt: targetElev,
          name: raw.name ?? 'Token',
          color: raw.color ?? '#38bdf8',
          currX: targetGridX + targetOffsetX,
          currY: targetGridY + targetOffsetY,
          currElev: targetElev
        });
      }
    }

    // Prune removed tokens
    for (const [id] of lerpTokens) {
      if (!activeIds.has(id)) {
        lerpTokens.delete(id);
      }
    }
  });

  onMount(() => {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    let lastTime = performance.now();

    const render = (time: number) => {
      const dt = Math.min(0.1, (time - lastTime) / 1000);
      lastTime = time;

      const width = canvasEl!.clientWidth;
      const height = canvasEl!.clientHeight;

      if (canvasEl!.width !== width || canvasEl!.height !== height) {
        canvasEl!.width = width;
        canvasEl!.height = height;
      }

      ctx.clearRect(0, 0, width, height);

      // Camera: 45-degree isometric perspective tilt looking at scene center
      const cellSize = scene.grid?.size || 50;
      const mapWidth = 24 * cellSize;
      const mapHeight = 16 * cellSize;

      const centerX = width / 2;
      const centerY = height / 2 + 50;
      const zoom = Math.min(width / (mapWidth * 1.4), height / (mapHeight * 1.4)) * 1.1;

      // 3D Isometric projection matrix (45 deg pitch, 45 deg yaw)
      const cosAngle = Math.cos(Math.PI / 6); // 30 deg isometric angle for ideal TV visibility
      const sinAngle = Math.sin(Math.PI / 6);
      const elevationScale = zoom * 1.4;

      const project3D = (worldX: number, worldY: number, elevFt: number) => {
        const relX = worldX - mapWidth / 2;
        const relY = worldY - mapHeight / 2;
        const screenX = centerX + (relX - relY) * cosAngle * zoom;
        const screenY = centerY + (relX + relY) * sinAngle * zoom - (elevFt * elevationScale);
        return { x: screenX, y: screenY };
      };

      // 1. Ground Plane (scene.assetUrl or procedurally shaded stone)
      const p0 = project3D(0, 0, 0);
      const p1 = project3D(mapWidth, 0, 0);
      const p2 = project3D(mapWidth, mapHeight, 0);
      const p3 = project3D(0, mapHeight, 0);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.closePath();

      if (bgImage && bgImage.complete && bgImage.naturalWidth > 0) {
        ctx.fillStyle = '#0f172a';
        ctx.fill();
        ctx.clip();
        // Transform draw image onto isometric plane
        ctx.drawImage(bgImage, p0.x - (p1.x - p0.x) / 2, p0.y, (p1.x - p3.x) * 1.5, (p2.y - p0.y) * 1.2);
      } else {
        // Ambient battlemat fill
        const groundGrad = ctx.createLinearGradient(p0.x, p0.y, p2.x, p2.y);
        groundGrad.addColorStop(0, '#1e293b');
        groundGrad.addColorStop(1, '#0f172a');
        ctx.fillStyle = groundGrad;
        ctx.fill();
      }

      ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
      ctx.lineWidth = 1;

      // 2. Grid lines overlay mapped directly to scene.grid.size
      if (scene.grid?.type !== 'none') {
        // Vertical grid lines
        for (let gx = 0; gx <= mapWidth; gx += cellSize) {
          const start = project3D(gx, 0, 0);
          const end = project3D(gx, mapHeight, 0);
          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(end.x, end.y);
          ctx.stroke();
        }
        // Horizontal grid lines
        for (let gy = 0; gy <= mapHeight; gy += cellSize) {
          const start = project3D(0, gy, 0);
          const end = project3D(mapWidth, gy, 0);
          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(end.x, end.y);
          ctx.stroke();
        }
      }
      ctx.restore();

      // 3. Tokens: Lerp positions and render cylindrical 3D miniature bases with soft sun shadows
      const tokenRadius = (cellSize * 0.42) * zoom;
      const baseHeight = 16 * zoom;

      // Sort tokens by depth (relX + relY) so foreground renders over background
      const sortedTokens = Array.from(lerpTokens.values()).sort((a, b) => {
        const depthA = (a.currX ?? a.gridX) + (a.currY ?? a.gridY);
        const depthB = (b.currX ?? b.gridX) + (b.currY ?? b.gridY);
        return depthA - depthB;
      });

      for (const tok of sortedTokens) {
        // Lerp step
        const targetX = tok.gridX + (tok.offsetX || 0);
        const targetY = tok.gridY + (tok.offsetY || 0);
        const targetElev = tok.elevationFt || 0;

        tok.currX = (tok.currX ?? targetX) + (targetX - (tok.currX ?? targetX)) * Math.min(1, dt * 10);
        tok.currY = (tok.currY ?? targetY) + (targetY - (tok.currY ?? targetY)) * Math.min(1, dt * 10);
        tok.currElev = (tok.currElev ?? targetElev) + (targetElev - (tok.currElev ?? targetElev)) * Math.min(1, dt * 10);

        const worldPxX = tok.currX * cellSize;
        const worldPxY = tok.currY * cellSize;

        // Ground shadow projection (sun angled)
        const groundPos = project3D(worldPxX, worldPxY, 0);
        const shadowOffset = (tok.currElev || 0) * 0.4 * zoom;

        ctx.save();
        ctx.beginPath();
        ctx.ellipse(
          groundPos.x + normSun.x * (12 * zoom + shadowOffset),
          groundPos.y + normSun.z * (8 * zoom + shadowOffset),
          tokenRadius * 1.1,
          tokenRadius * 0.55,
          0,
          0,
          Math.PI * 2
        );
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.filter = 'blur(4px)';
        ctx.fill();
        ctx.restore();

        // Elevated Miniature Base (Cylinder)
        const basePos = project3D(worldPxX, worldPxY, tok.currElev);

        // Cylinder body
        ctx.save();
        const cylGrad = ctx.createLinearGradient(
          basePos.x - tokenRadius,
          basePos.y,
          basePos.x + tokenRadius,
          basePos.y
        );
        cylGrad.addColorStop(0, '#0f172a');
        cylGrad.addColorStop(0.4, '#334155');
        cylGrad.addColorStop(1, '#090d16');

        ctx.fillStyle = cylGrad;
        ctx.beginPath();
        ctx.ellipse(basePos.x, basePos.y, tokenRadius, tokenRadius * 0.5, 0, 0, Math.PI);
        ctx.lineTo(basePos.x + tokenRadius, basePos.y - baseHeight);
        ctx.ellipse(basePos.x, basePos.y - baseHeight, tokenRadius, tokenRadius * 0.5, 0, Math.PI, 0, true);
        ctx.lineTo(basePos.x - tokenRadius, basePos.y);
        ctx.closePath();
        ctx.fill();

        // Top base cap / miniature coin ring
        ctx.beginPath();
        ctx.ellipse(basePos.x, basePos.y - baseHeight, tokenRadius, tokenRadius * 0.5, 0, 0, Math.PI * 2);
        const topGrad = ctx.createRadialGradient(
          basePos.x - tokenRadius * 0.3,
          basePos.y - baseHeight - tokenRadius * 0.2,
          2,
          basePos.x,
          basePos.y - baseHeight,
          tokenRadius
        );
        topGrad.addColorStop(0, tok.color || '#38bdf8');
        topGrad.addColorStop(1, '#0f172a');
        ctx.fillStyle = topGrad;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Name tag / elevation pill
        if (tok.name) {
          ctx.font = 'bold 11px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
          const textWidth = ctx.measureText(tok.name).width;
          ctx.fillRect(basePos.x - textWidth / 2 - 6, basePos.y - baseHeight - 24, textWidth + 12, 16);
          ctx.fillStyle = '#f8fafc';
          ctx.fillText(tok.name, basePos.x, basePos.y - baseHeight - 12);

          if (tok.currElev > 0) {
            ctx.fillStyle = '#f59e0b';
            ctx.font = 'bold 9px system-ui, sans-serif';
            ctx.fillText(`+${Math.round(tok.currElev)}ft`, basePos.x, basePos.y - baseHeight - 28);
          }
        }
        ctx.restore();
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  });

  onDestroy(() => {
    if (animId) cancelAnimationFrame(animId);
  });
</script>

<div class="relative w-full h-full bg-slate-950 overflow-hidden select-none">
  <canvas
    bind:this={canvasEl}
    class="w-full h-full block cursor-grab active:cursor-grabbing"
  ></canvas>

  <MiniaturesAndDice tokens={visibleTokens} cellSize={scene.grid?.size || 50} {isDmView} />

  <div class="absolute bottom-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-700/60 backdrop-blur-md text-xs font-medium text-slate-300 shadow-lg pointer-events-none">
    <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
    <span>3D Spectator Display</span>
    <span class="text-slate-500 font-mono">| {scene.grid?.scaleFeet || 5}ft/cell</span>
  </div>
</div>
