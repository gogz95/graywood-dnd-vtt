<!-- VisionFogLayer.svelte — Dynamic Lighting, 2D Raycast Line-of-Sight & Fog of War Engine -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { canvasStore } from '../../../stores/canvasStore.svelte';
  import { tokenStore, type VttToken } from '../../stores/tokenStore.svelte';
  import type { WallSegment, DoorPrimitive } from '../../canvas/parsers/dungeonScrawlParser';

  // ── Types ──────────────────────────────────────────────────────────────────
  export type FogTool = 'auto_vision' | 'reveal_brush' | 'hide_brush' | 'polygon_reveal';

  export interface Point2D {
    x: number;
    y: number;
  }

  interface Props {
    mapWidth?: number;
    mapHeight?: number;
    gridSize?: number;
    zoom?: number;
    panX?: number;
    panY?: number;
    isGmView?: boolean;
    activeTool?: FogTool;
    brushRadiusFt?: number; // 5ft to 30ft
    onFogChanged?: () => void;
  }

  let {
    mapWidth = 2400,
    mapHeight = 1800,
    gridSize = 60,
    zoom = 1.0,
    panX = 0,
    panY = 0,
    isGmView = $bindable(false),
    activeTool = $bindable('auto_vision'),
    brushRadiusFt = $bindable(15),
    onFogChanged,
  }: Props = $props();

  // ── Canvases ───────────────────────────────────────────────────────────────
  let displayCanvas = $state<HTMLCanvasElement | null>(null);
  let previewCanvas = $state<HTMLCanvasElement | null>(null);

  // Persistent Explored Memory Texture (offscreen)
  let exploredCanvas: HTMLCanvasElement | null = null;
  let exploredCtx: CanvasRenderingContext2D | null = null;

  // ── Manual Tool Interaction State ──────────────────────────────────────────
  let isPainting = false;
  let currentCursorWorld = $state<Point2D | null>(null);
  let polygonPoints = $state<Point2D[]>([]);

  // Toast feedback
  let toastMsg = $state<string | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  function showToast(msg: string) {
    toastMsg = msg;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastMsg = null;
    }, 2800);
  }

  // ── Coordinate Conversions ─────────────────────────────────────────────────
  function screenToWorld(clientX: number, clientY: number): Point2D {
    if (!displayCanvas) return { x: 0, y: 0 };
    const rect = displayCanvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return {
      x: (sx - panX) / zoom,
      y: (sy - panY) / zoom,
    };
  }

  // ── 2D Raycasting Line-of-Sight Algorithm ───────────────────────────────────
  interface LineSegment {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }

  function getActiveVisionWalls(): LineSegment[] {
    const segments: LineSegment[] = [];

    // 1. Map walls
    const walls = canvasStore.walls || [];
    for (const w of walls) {
      if (w.x1 !== undefined && w.y1 !== undefined && w.x2 !== undefined && w.y2 !== undefined) {
        segments.push({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 });
      }
    }

    // 2. Closed doors act as vision blockers
    const doors = canvasStore.doors || [];
    for (const d of doors) {
      if (d.state !== 'OPEN') {
        segments.push({ x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2 });
      }
    }

    return segments;
  }

  function raySegmentIntersect(
    ox: number,
    oy: number,
    dx: number,
    dy: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): { x: number; y: number; t: number } | null {
    const sx = x2 - x1;
    const sy = y2 - y1;
    const det = dx * sy - dy * sx;
    if (Math.abs(det) < 1e-9) return null;

    const qx = x1 - ox;
    const qy = y1 - oy;
    const t = (qx * sy - qy * sx) / det;
    const u = (qx * dy - qy * dx) / det;

    if (t >= 0 && u >= 0 && u <= 1) {
      return {
        x: ox + t * dx,
        y: oy + t * dy,
        t,
      };
    }
    return null;
  }

  function computeVisionPolygon(
    originX: number,
    originY: number,
    radiusPx: number,
    walls: LineSegment[]
  ): Point2D[] {
    if (radiusPx <= 0) return [];

    const rawAngles = new Set<number>();
    const epsilon = 0.0001; // Angular offset for vertex corner penetration

    // Circular perimeter samples
    const numSamples = 24;
    for (let i = 0; i < numSamples; i++) {
      rawAngles.add((i / numSamples) * Math.PI * 2 - Math.PI);
    }

    // Endpoint rays with ±epsilon offsets
    const rSq = radiusPx * radiusPx;
    for (const w of walls) {
      const d1 = (w.x1 - originX) ** 2 + (w.y1 - originY) ** 2;
      const d2 = (w.x2 - originX) ** 2 + (w.y2 - originY) ** 2;

      if (d1 <= rSq * 1.5 || d2 <= rSq * 1.5) {
        const a1 = Math.atan2(w.y1 - originY, w.x1 - originX);
        const a2 = Math.atan2(w.y2 - originY, w.x2 - originX);

        rawAngles.add(a1);
        rawAngles.add(a1 - epsilon);
        rawAngles.add(a1 + epsilon);

        rawAngles.add(a2);
        rawAngles.add(a2 - epsilon);
        rawAngles.add(a2 + epsilon);
      }
    }

    interface HitPoint {
      x: number;
      y: number;
      angle: number;
    }

    const hits: HitPoint[] = [];

    for (const angle of rawAngles) {
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);

      let closestT = radiusPx;
      let hitX = originX + dx * radiusPx;
      let hitY = originY + dy * radiusPx;

      for (const w of walls) {
        const hit = raySegmentIntersect(originX, originY, dx, dy, w.x1, w.y1, w.x2, w.y2);
        if (hit && hit.t < closestT) {
          closestT = hit.t;
          hitX = hit.x;
          hitY = hit.y;
        }
      }

      hits.push({ x: hitX, y: hitY, angle });
    }

    // Sort counter-clockwise to form a closed convex/concave polygon
    hits.sort((a, b) => a.angle - b.angle);

    return hits.map((h) => ({ x: h.x, y: h.y }));
  }

  // ── Persistent Explored Canvas Management ──────────────────────────────────
  function initExploredCanvas() {
    if (typeof document === 'undefined') return;
    if (!exploredCanvas) {
      exploredCanvas = document.createElement('canvas');
    }
    exploredCanvas.width = mapWidth;
    exploredCanvas.height = mapHeight;
    exploredCtx = exploredCanvas.getContext('2d');

    // Default: Initialized to pitch black shroud (unexplored)
    if (exploredCtx) {
      exploredCtx.fillStyle = '#000000';
      exploredCtx.fillRect(0, 0, mapWidth, mapHeight);
    }
  }

  export function resetAllFog() {
    if (!exploredCtx) return;
    exploredCtx.globalCompositeOperation = 'source-over';
    exploredCtx.fillStyle = '#000000';
    exploredCtx.fillRect(0, 0, mapWidth, mapHeight);
    showToast('Reset fog: Entire map shrouded');
    renderFog();
    onFogChanged?.();
  }

  export function revealEntireMap() {
    if (!exploredCtx) return;
    exploredCtx.clearRect(0, 0, mapWidth, mapHeight);
    showToast('Revealed entire map');
    renderFog();
    onFogChanged?.();
  }

  // ── Render Fog Passes ──────────────────────────────────────────────────────
  export function renderFog() {
    if (!displayCanvas || !exploredCtx || !exploredCanvas) return;
    const ctx = displayCanvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, mapWidth, mapHeight);

    // 1. Gather active player tokens for dynamic vision
    const playerTokens = tokenStore.tokens.filter((t) => t.isPlayer && t.isRevealed !== false);
    const activeVisionTokens = playerTokens.length > 0 ? playerTokens : tokenStore.tokens.filter((t) => t.isRevealed !== false);

    const walls = getActiveVisionWalls();
    const activePolygons: Point2D[][] = [];

    // 2. Compute 2D Raycast Vision Polygons & Carve into Explored Memory
    for (const tok of activeVisionTokens) {
      const radiusPx = ((tok as any).sightRadiusFeet || 60) * (gridSize / 5);
      const poly = computeVisionPolygon(tok.x, tok.y, radiusPx, walls);
      if (poly.length >= 3) {
        activePolygons.push(poly);

        // Permanently carve into explored memory
        exploredCtx.save();
        exploredCtx.globalCompositeOperation = 'destination-out';
        exploredCtx.beginPath();
        exploredCtx.moveTo(poly[0].x, poly[0].y);
        for (let i = 1; i < poly.length; i++) {
          exploredCtx.lineTo(poly[i].x, poly[i].y);
        }
        exploredCtx.closePath();
        exploredCtx.fill();
        exploredCtx.restore();
      }
    }

    // 3. Render Shroud Layers on displayCanvas
    // Base Dimmed Shroud for Explored Areas (alpha 0.45, or 0.25 in GM View)
    ctx.save();
    ctx.fillStyle = '#000000';
    ctx.globalAlpha = isGmView ? 0.25 : 0.45;
    ctx.fillRect(0, 0, mapWidth, mapHeight);

    // Unexplored Shroud overlay (brings unexplored areas to alpha 0.85, or 0.5 in GM View)
    ctx.globalAlpha = isGmView ? 0.25 : 0.4;
    ctx.drawImage(exploredCanvas, 0, 0);

    // 4. Punch 100% Transparent Hole for Active Player Line of Sight (alpha 0.0)
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = 1.0;
    for (const poly of activePolygons) {
      ctx.beginPath();
      ctx.moveTo(poly[0].x, poly[0].y);
      for (let i = 1; i < poly.length; i++) {
        ctx.lineTo(poly[i].x, poly[i].y);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    renderPreview();
  }

  // ── Manual Tool Preview Render ─────────────────────────────────────────────
  function renderPreview() {
    if (!previewCanvas) return;
    const pctx = previewCanvas.getContext('2d');
    if (!pctx) return;

    pctx.clearRect(0, 0, mapWidth, mapHeight);

    const brushPx = (brushRadiusFt / 5) * gridSize;

    // Brush Outline Preview
    if (
      (activeTool === 'reveal_brush' || activeTool === 'hide_brush') &&
      currentCursorWorld
    ) {
      pctx.save();
      pctx.beginPath();
      pctx.arc(currentCursorWorld.x, currentCursorWorld.y, brushPx, 0, Math.PI * 2);
      pctx.strokeStyle = activeTool === 'reveal_brush' ? '#38bdf8' : '#ef4444';
      pctx.lineWidth = 2 / zoom;
      pctx.setLineDash([4, 4]);
      pctx.stroke();

      pctx.fillStyle = activeTool === 'reveal_brush' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(239, 68, 68, 0.15)';
      pctx.fill();
      pctx.restore();
    }

    // Polygon Reveal In-Progress Preview
    if (activeTool === 'polygon_reveal' && polygonPoints.length > 0) {
      pctx.save();
      pctx.beginPath();
      pctx.moveTo(polygonPoints[0].x, polygonPoints[0].y);
      for (let i = 1; i < polygonPoints.length; i++) {
        pctx.lineTo(polygonPoints[i].x, polygonPoints[i].y);
      }
      if (currentCursorWorld) {
        pctx.lineTo(currentCursorWorld.x, currentCursorWorld.y);
      }
      pctx.strokeStyle = '#38bdf8';
      pctx.lineWidth = 2 / zoom;
      pctx.setLineDash([6, 6]);
      pctx.stroke();

      // Vertex markers
      for (const pt of polygonPoints) {
        pctx.beginPath();
        pctx.arc(pt.x, pt.y, 4 / zoom, 0, Math.PI * 2);
        pctx.fillStyle = '#38bdf8';
        pctx.fill();
      }
      pctx.restore();
    }
  }

  // ── Manual Pointer Handlers ────────────────────────────────────────────────
  function applyBrushAt(pt: Point2D) {
    if (!exploredCtx) return;
    const brushPx = (brushRadiusFt / 5) * gridSize;

    exploredCtx.save();
    if (activeTool === 'reveal_brush') {
      exploredCtx.globalCompositeOperation = 'destination-out';
      exploredCtx.beginPath();
      exploredCtx.arc(pt.x, pt.y, brushPx, 0, Math.PI * 2);
      exploredCtx.fill();
    } else if (activeTool === 'hide_brush') {
      exploredCtx.globalCompositeOperation = 'source-over';
      exploredCtx.fillStyle = '#000000';
      exploredCtx.beginPath();
      exploredCtx.arc(pt.x, pt.y, brushPx, 0, Math.PI * 2);
      exploredCtx.fill();
    }
    exploredCtx.restore();
    renderFog();
  }

  function finishPolygonReveal() {
    if (!exploredCtx || polygonPoints.length < 3) {
      polygonPoints = [];
      renderPreview();
      return;
    }

    exploredCtx.save();
    exploredCtx.globalCompositeOperation = 'destination-out';
    exploredCtx.beginPath();
    exploredCtx.moveTo(polygonPoints[0].x, polygonPoints[0].y);
    for (let i = 1; i < polygonPoints.length; i++) {
      exploredCtx.lineTo(polygonPoints[i].x, polygonPoints[i].y);
    }
    exploredCtx.closePath();
    exploredCtx.fill();
    exploredCtx.restore();

    showToast(`Revealed polygon area (${polygonPoints.length} vertices)`);
    polygonPoints = [];
    renderFog();
    onFogChanged?.();
  }

  function handlePointerDown(e: PointerEvent) {
    if (activeTool === 'auto_vision' || e.button !== 0) return;
    e.stopPropagation();

    const worldPt = screenToWorld(e.clientX, e.clientY);

    if (activeTool === 'reveal_brush' || activeTool === 'hide_brush') {
      isPainting = true;
      applyBrushAt(worldPt);
    } else if (activeTool === 'polygon_reveal') {
      polygonPoints = [...polygonPoints, worldPt];
      renderPreview();
    }
  }

  function handlePointerMove(e: PointerEvent) {
    if (activeTool === 'auto_vision') return;
    const worldPt = screenToWorld(e.clientX, e.clientY);
    currentCursorWorld = worldPt;

    if (isPainting && (activeTool === 'reveal_brush' || activeTool === 'hide_brush')) {
      applyBrushAt(worldPt);
    } else {
      renderPreview();
    }
  }

  function handlePointerUp(e: PointerEvent) {
    if (isPainting) {
      isPainting = false;
      onFogChanged?.();
    }
  }

  function handleDblClick(e: MouseEvent) {
    if (activeTool === 'polygon_reveal' && polygonPoints.length >= 3) {
      e.stopPropagation();
      finishPolygonReveal();
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && activeTool === 'polygon_reveal' && polygonPoints.length >= 3) {
      finishPolygonReveal();
    }
    if (e.key === 'Escape' && activeTool === 'polygon_reveal') {
      polygonPoints = [];
      renderPreview();
    }
  }

  // ── Lifecycle Hooks ────────────────────────────────────────────────────────
  onMount(() => {
    initExploredCanvas();
    renderFog();
    window.addEventListener('keydown', handleKeyDown);
  });

  onDestroy(() => {
    if (toastTimer) clearTimeout(toastTimer);
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', handleKeyDown);
    }
  });

  // Watch reactive changes
  $effect(() => {
    const _w = mapWidth;
    const _h = mapHeight;
    initExploredCanvas();
    renderFog();
  });

  $effect(() => {
    // Re-render fog when tokens move or walls/doors change
    const _toks = tokenStore.tokens.map((t) => `${t.id}-${t.x}-${t.y}`);
    const _walls = canvasStore.walls.length;
    const _doors = canvasStore.doors.map((d) => `${d.id}-${d.state}`).join(',');
    const _gm = isGmView;
    renderFog();
  });
</script>

<!-- ── World-Coordinate Fog Canvas Layer ────────────────────────────────────── -->
<div
  class="absolute inset-0 overflow-hidden {activeTool !== 'auto_vision' ? 'pointer-events-auto' : 'pointer-events-none'}"
  style="transform: matrix({zoom}, 0, 0, {zoom}, {panX}, {panY}); transform-origin: 0 0;"
  onpointerdown={handlePointerDown}
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
  ondblclick={handleDblClick}
  role="region"
  aria-label="Fog of War Layer"
>
  <!-- Display Fog Layer -->
  <canvas
    bind:this={displayCanvas}
    width={mapWidth}
    height={mapHeight}
    class="absolute inset-0 block w-full h-full"
  ></canvas>

  <!-- Interactive DM Tool Preview Layer -->
  <canvas
    bind:this={previewCanvas}
    width={mapWidth}
    height={mapHeight}
    class="absolute inset-0 block w-full h-full pointer-events-none"
  ></canvas>
</div>

<!-- ── Floating DM Fog & Lighting Toolbar ───────────────────────────────────── -->
<div class="absolute bottom-6 left-6 z-40 flex items-center gap-2 pointer-events-auto font-sans text-xs">
  <div class="flex items-center gap-1.5 p-1.5 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl shadow-2xl">
    <!-- Auto Vision vs Manual Tools -->
    <div class="flex items-center bg-slate-950/80 rounded-lg p-0.5 border border-slate-800">
      <button
        type="button"
        class="px-2.5 py-1 rounded-md font-semibold transition-all {activeTool === 'auto_vision' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}"
        onclick={() => { activeTool = 'auto_vision'; polygonPoints = []; renderPreview(); }}
        title="Dynamic 2D Raycast Vision based on Token Line-of-Sight & UVTT Walls"
      >
        Auto Vision
      </button>
      <button
        type="button"
        class="px-2.5 py-1 rounded-md font-semibold transition-all {activeTool === 'reveal_brush' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}"
        onclick={() => { activeTool = 'reveal_brush'; polygonPoints = []; renderPreview(); }}
        title="Circular Reveal Brush"
      >
        Reveal Brush
      </button>
      <button
        type="button"
        class="px-2.5 py-1 rounded-md font-semibold transition-all {activeTool === 'hide_brush' ? 'bg-rose-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}"
        onclick={() => { activeTool = 'hide_brush'; polygonPoints = []; renderPreview(); }}
        title="Circular Hide / Conceal Brush"
      >
        Hide Brush
      </button>
      <button
        type="button"
        class="px-2.5 py-1 rounded-md font-semibold transition-all {activeTool === 'polygon_reveal' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}"
        onclick={() => { activeTool = 'polygon_reveal'; }}
        title="Polygon Reveal Tool: Click points to define area, double click or press Enter to unmask"
      >
        Polygon
      </button>
    </div>

    <!-- Brush Radius Slider (5ft to 30ft) -->
    {#if activeTool === 'reveal_brush' || activeTool === 'hide_brush'}
      <div class="flex items-center gap-1.5 px-2 border-l border-slate-800">
        <span class="text-[10px] uppercase font-bold text-slate-400">Radius</span>
        <input
          type="range"
          min="5"
          max="30"
          step="5"
          bind:value={brushRadiusFt}
          class="w-14 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
        />
        <span class="text-[10px] font-mono text-cyan-300 w-8">{brushRadiusFt} ft</span>
      </div>
    {/if}

    <!-- Polygon Apply Button -->
    {#if activeTool === 'polygon_reveal' && polygonPoints.length >= 3}
      <button
        type="button"
        class="px-2 py-1 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-lg transition-colors animate-pulse"
        onclick={finishPolygonReveal}
      >
        Apply ({polygonPoints.length}pts)
      </button>
    {/if}

    <!-- Quick Actions: Reset & Reveal -->
    <div class="flex items-center gap-1 px-2 border-l border-slate-800">
      <button
        type="button"
        class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md font-medium text-xs transition-colors"
        onclick={revealEntireMap}
        title="Reveal entire map (Clear all fog)"
      >
        Reveal Map
      </button>
      <button
        type="button"
        class="px-2 py-1 bg-slate-800 hover:bg-rose-900/60 text-slate-300 hover:text-rose-300 rounded-md font-medium text-xs transition-colors"
        onclick={resetAllFog}
        title="Reset all fog (Shroud entire map in black)"
      >
        Reset Fog
      </button>
    </div>

    <!-- GM View Shroud Toggle -->
    <div class="px-2 border-l border-slate-800">
      <button
        type="button"
        class="px-2 py-1 rounded-md font-medium text-xs transition-colors {isGmView ? 'bg-purple-900/80 text-purple-200 border border-purple-600/60' : 'text-slate-400 hover:text-slate-200'}"
        onclick={() => { isGmView = !isGmView; }}
        title="Toggle GM View (Semi-transparent dimmed fog overlay so DM can see through shroud)"
      >
        {isGmView ? 'GM View: ON' : 'GM View'}
      </button>
    </div>
  </div>
</div>

<!-- Toast Feedback -->
{#if toastMsg}
  <div class="fixed top-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-slate-900/95 border border-indigo-500/70 text-indigo-200 text-xs font-semibold rounded-xl shadow-2xl backdrop-blur-md pointer-events-none animate-fade-in">
    {toastMsg}
  </div>
{/if}
