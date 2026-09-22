<!-- src/lib/components/map/FogCanvasLayer.svelte -->
<!-- Dynamic Fog of War & Line of Sight Masking Canvas Layer -->

<script lang="ts">
  import { onMount } from 'svelte';
  import { renderFogMask, type VisionSource } from '$lib/services/fogOfWarService';
  import { wallStore, type WallSegment } from '$lib/stores/wallStore.svelte';

  let {
    width = 4000,
    height = 3000,
    sources = [],
    isGmView = false,
    walls,
  }: {
    width?: number;
    height?: number;
    sources?: VisionSource[];
    isGmView?: boolean;
    walls?: WallSegment[];
  } = $props();

  let canvasEl = $state<HTMLCanvasElement | null>(null);

  function updateMask() {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;
    const activeWalls = walls || wallStore.walls;
    renderFogMask(ctx, width, height, sources, isGmView, activeWalls);
  }

  $effect(() => {
    // Re-render whenever dimensions, sources, walls, or GM view toggle change
    const _w = width;
    const _h = height;
    const _s = sources;
    const _gm = isGmView;
    const _walls = walls || wallStore.walls;
    updateMask();
  });

  onMount(() => {
    updateMask();
  });
</script>

<canvas
  bind:this={canvasEl}
  {width}
  {height}
  class="absolute inset-0 pointer-events-none select-none transition-opacity duration-300 z-20"
></canvas>
