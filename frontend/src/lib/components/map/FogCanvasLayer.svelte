<!-- src/lib/components/map/FogCanvasLayer.svelte -->
<!-- Dynamic Fog of War & Line of Sight Masking Canvas Layer -->

<script lang="ts">
  import { onMount } from 'svelte';
  import { renderFogMask, type VisionSource } from '$lib/services/fogOfWarService';

  let {
    width = 4000,
    height = 3000,
    sources = [],
    isGmView = false,
  }: {
    width?: number;
    height?: number;
    sources?: VisionSource[];
    isGmView?: boolean;
  } = $props();

  let canvasEl = $state<HTMLCanvasElement | null>(null);

  function updateMask() {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;
    renderFogMask(ctx, width, height, sources, isGmView);
  }

  $effect(() => {
    // Re-render whenever dimensions, sources, or GM view toggle change
    const _w = width;
    const _h = height;
    const _s = sources;
    const _gm = isGmView;
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
