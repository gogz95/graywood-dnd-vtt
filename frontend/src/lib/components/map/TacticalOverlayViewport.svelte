<!-- src/lib/components/map/TacticalOverlayViewport.svelte -->
<!-- Overarching transform wrapper binding screen-space DOM/SVG overlays to PixiJS camera transforms -->

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { tacticalViewport } from '$lib/services/canvas/tacticalViewportService.svelte';

  let {
    width = 1200,
    height = 800,
    children,
  }: {
    width?: number;
    height?: number;
    children?: Snippet;
  } = $props();
</script>

<div
  class="absolute inset-0 pointer-events-none overflow-hidden select-none"
  style="touch-action: none;"
>
  <div
    class="absolute top-0 left-0 pointer-events-auto"
    style="width: {width}px; height: {height}px; transform: {tacticalViewport.transformStyle}; transform-origin: 0 0;"
  >
    {@render children?.()}
  </div>
</div>
