<!-- BattlemapCanvas.svelte — Thin Lifecycle-Safe Coordinator for VTT Canvas Engine -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { VttCanvasEngine } from '../../canvas/VttCanvasEngine';
  import { tokenStore } from '../../stores/tokenStore.svelte';
  import { canvasStore } from '../../../stores/canvasStore.svelte';

  export type GridMode = 'square' | 'hexagonal' | 'off';

  interface Props {
    mapImageUrl?: string;
    mapWidth?: number;
    mapHeight?: number;
    initialGridSize?: number;
    initialGridColor?: string;
    initialGridOpacity?: number;
    initialGridMode?: GridMode;
    onCalibrated?: (newGridSize: number) => void;
  }

  let {
    mapImageUrl = $bindable(''),
    mapWidth = $bindable(2400),
    mapHeight = $bindable(1800),
    initialGridSize = 60,
    initialGridColor = '#6366f1',
    initialGridOpacity = 0.35,
    initialGridMode = 'square',
    onCalibrated,
  }: Props = $props();

  // Canvas element ref
  let canvasElement: HTMLCanvasElement | null = $state(null);

  // Engine instance stored in plain module-scoped variable (NOT wrapped in Svelte $state rune)
  let engine: VttCanvasEngine | null = null;
  let isDestroyed = false;
  let isReady = $state(false);

  // Synchronize grid settings into isolated GridController
  $effect(() => {
    if (!engine || !isReady || isDestroyed) return;

    const type = initialGridMode === 'off'
      ? 'none'
      : initialGridMode === 'hexagonal'
        ? 'hex_pointy'
        : 'square';

    const parsedColor = initialGridColor
      ? parseInt(initialGridColor.replace('#', ''), 16)
      : 0x6366f1;

    engine.grid.setGridConfig({
      type,
      cellSize: initialGridSize,
      color: isNaN(parsedColor) ? 0x6366f1 : parsedColor,
      alpha: initialGridOpacity,
    });
  });

  // Synchronize tokens from reactive tokenStore into isolated TokenController
  $effect(() => {
    if (!engine || !isReady || isDestroyed) return;

    const currentTokens = tokenStore.tokens;
    const activeIds = new Set(currentTokens.map((t) => t.id));

    // Remove tokens no longer present
    const existingIds = engine.tokens.getAllTokenIds();
    for (const existingId of existingIds) {
      if (!activeIds.has(existingId)) {
        engine.tokens.removeToken(existingId);
      }
    }

    // Add or update active tokens
    for (const t of currentTokens) {
      if (engine.tokens.getToken(t.id)) {
        engine.tokens.updateTokenPosition(t.id, t.x, t.y, t.elevation ?? 0);
      } else {
        engine.tokens.addToken({
          id: t.id,
          name: t.name,
          imageUrl: t.imageUrl,
          x: t.x,
          y: t.y,
          size: t.size ? t.size * initialGridSize : initialGridSize,
          elevation: t.elevation ?? 0,
          color: t.color,
        });
      }
    }
  });

  onMount(async () => {
    if (!canvasElement) return;

    // Instantiate framework-agnostic engine
    engine = new VttCanvasEngine();

    await engine.init(canvasElement);

    // Safety guard after async initialization
    if (isDestroyed) {
      engine.destroy();
      engine = null;
      return;
    }

    // Sync canvasStore DM viewport when camera moves
    engine.on('viewport:change', ({ targetX, targetY, zoomLevel }) => {
      canvasStore.setDmViewport({ x: targetX, y: targetY, zoom: zoomLevel });
    });

    isReady = true;
  });

  onDestroy(() => {
    isDestroyed = true;
    if (engine) {
      engine.destroy();
      engine = null;
    }
    canvasElement = null;
  });
</script>

<!-- Thin Coordinator Shell: Canvas viewport container -->
<div class="relative w-full h-full overflow-hidden select-none bg-slate-950 font-sans">
  <canvas
    bind:this={canvasElement}
    class="block w-full h-full outline-none touch-none"
  ></canvas>
</div>

<style>
  canvas {
    touch-action: none;
  }
</style>
