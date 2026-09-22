<!-- src/lib/components/map/FogCanvasLayer.svelte -->
<!-- Dynamic Fog of War & Line of Sight Masking Canvas Layer -->

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { renderFogMask, type VisionSource } from '$lib/services/fogOfWarService';
  import { tickFogAnimation, resetFogAnimationClock } from '$lib/canvas/raycastVisionEngine';
  import { wallStore, type WallSegment } from '$lib/stores/wallStore.svelte';
  import { fogOfWarLayer } from '$lib/canvas/fogOfWarLayer';

  let {
    width = 4000,
    height = 3000,
    sources = [],
    isGmView = false,
    walls,
    fogAnimated = false,
  }: {
    width?: number;
    height?: number;
    sources?: VisionSource[];
    isGmView?: boolean;
    walls?: WallSegment[];
    /** When true, drives a per-frame RAF loop updating fog animation time uniforms. */
    fogAnimated?: boolean;
  } = $props();

  let canvasEl = $state<HTMLCanvasElement | null>(null);

  // ── Fog static render ─────────────────────────────────────────────────────
  function updateMask() {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;
    const activeWalls = walls || wallStore.walls;
    renderFogMask(ctx, width, height, sources, isGmView, activeWalls);
  }

  // Re-render whenever dimensions, sources, walls, or GM view toggle change
  $effect(() => {
    const _w = width;
    const _h = height;
    const _s = sources;
    const _gm = isGmView;
    const _walls = walls || wallStore.walls;
    updateMask();
  });

  // ── Fog animation RAF loop ────────────────────────────────────────────────
  let rafId: number | null = null;
  let lastTs = 0;

  function animationTick(ts: number) {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) { rafId = null; return; }

    const delta = lastTs === 0 ? 16 : ts - lastTs;
    lastTs = ts;

    tickFogAnimation(ctx, width, height, delta);
    rafId = requestAnimationFrame(animationTick);
  }

  function startAnimation() {
    if (rafId !== null) return;
    lastTs = 0;
    resetFogAnimationClock();
    rafId = requestAnimationFrame(animationTick);
  }

  function stopAnimation() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    lastTs = 0;
    // Redraw static mask without animation overlay
    updateMask();
  }

  // React to fogAnimated prop toggle
  $effect(() => {
    if (fogAnimated) {
      startAnimation();
    } else {
      stopAnimation();
    }
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  onMount(() => {
    // Initialise the FogOfWarLayer RenderTexture to this raster map's dimensions
    fogOfWarLayer.initForMap(width, height, true);
    updateMask();
  });

  onDestroy(() => {
    stopAnimation();
  });
</script>

<canvas
  bind:this={canvasEl}
  {width}
  {height}
  class="absolute inset-0 pointer-events-none select-none transition-opacity duration-300 z-20"
></canvas>
