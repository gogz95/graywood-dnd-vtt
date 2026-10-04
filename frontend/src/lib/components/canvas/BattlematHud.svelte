<!-- frontend/src/lib/components/canvas/BattlematHud.svelte -->
<!-- Tactical Battlemat Drawing & Vector Tool HUD, bound directly to canvasToolStore -->

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    activeCanvasTool,
    canvasToolSettings,
    canvasToolStore,
    type CanvasTool,
  } from '../../stores/canvasToolStore';
  import { canvasStore } from '../../../stores/canvasStore.svelte';

  interface Props {
    class?: string;
  }

  let { class: className = '' }: Props = $props();

  let tool = $state<CanvasTool>('select');
  let settings = $state(canvasToolStore.getSettings());

  let unsubscribeTool: (() => void) | null = null;
  let unsubscribeSettings: (() => void) | null = null;

  onMount(() => {
    unsubscribeTool = activeCanvasTool.subscribe((val) => {
      tool = val;
    });
    unsubscribeSettings = canvasToolSettings.subscribe((val) => {
      settings = val;
    });
  });

  onDestroy(() => {
    if (unsubscribeTool) unsubscribeTool();
    if (unsubscribeSettings) unsubscribeSettings();
  });

  function select(t: CanvasTool) {
    canvasToolStore.setTool(t);
  }

  function toggleGridSnap() {
    canvasToolStore.updateSettings({ snapToGrid: !settings.snapToGrid });
  }

  function toggleWallsVisibility() {
    canvasToolStore.updateSettings({ wallsVisible: !settings.wallsVisible });
  }

  function handleRevealAllFog() {
    canvasStore.revealAllFog();
  }

  function handleResetFog() {
    canvasStore.clearFog();
  }

  function handleClearWalls() {
    if (confirm('Clear all vector walls on current battlemat?')) {
      canvasStore.clearWalls();
    }
  }
</script>

<div
  class="flex items-center gap-1.5 bg-slate-900/95 border border-slate-700/80 rounded-2xl p-1.5 shadow-2xl backdrop-blur select-none text-xs pointer-events-auto {className}"
  role="toolbar"
  aria-label="Battlemat Vector Drawing and Wall Tools"
>
  <!-- 1. Select / Pan Tool -->
  <button
    type="button"
    onclick={() => select('select')}
    class="px-2.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 {tool === 'select' ? 'bg-indigo-600 text-white shadow' : 'text-slate-300 hover:bg-slate-800'}"
    title="Pan & Token Select (V)"
  >
    <span>👆</span>
    <span>Select</span>
  </button>

  <div class="h-4 w-[1px] bg-slate-800 mx-0.5"></div>

  <!-- 2. Wall Line Tool -->
  <button
    type="button"
    onclick={() => select('wall')}
    class="px-2.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 {tool === 'wall' ? 'bg-amber-600 text-slate-950 shadow font-black' : 'text-slate-300 hover:bg-slate-800'}"
    title="Straight Wall Vector (Blocks Line of Sight)"
  >
    <span>🧱</span>
    <span>Wall Line</span>
  </button>

  <!-- 3. Polygon Wall Tool -->
  <button
    type="button"
    onclick={() => select('polygon')}
    class="px-2.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 {tool === 'polygon' ? 'bg-amber-600 text-slate-950 shadow font-black' : 'text-slate-300 hover:bg-slate-800'}"
    title="Dynamic Polygon Wall Enclosure"
  >
    <span>🔷</span>
    <span>Polygon</span>
  </button>

  <!-- 4. Freehand Brush Tool -->
  <button
    type="button"
    onclick={() => select('brush')}
    class="px-2.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 {tool === 'brush' ? 'bg-indigo-600 text-white shadow' : 'text-slate-300 hover:bg-slate-800'}"
    title="Freehand Vector Brush"
  >
    <span>✏️</span>
    <span>Brush</span>
  </button>

  <div class="h-4 w-[1px] bg-slate-800 mx-0.5"></div>

  <!-- 5. Reveal Fog Tool -->
  <button
    type="button"
    onclick={() => select('fog_reveal')}
    class="px-2.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 {tool === 'fog_reveal' ? 'bg-emerald-600 text-white shadow' : 'text-slate-300 hover:bg-slate-800'}"
    title="Carve Fog of War (Reveal Area)"
  >
    <span>👁️</span>
    <span>Reveal Fog</span>
  </button>

  <!-- 6. Conceal Fog Tool -->
  <button
    type="button"
    onclick={() => select('fog_shroud')}
    class="px-2.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 {tool === 'fog_shroud' ? 'bg-rose-700 text-white shadow' : 'text-slate-300 hover:bg-slate-800'}"
    title="Conceal Area (Re-shroud in Fog)"
  >
    <span>🌫️</span>
    <span>Shroud</span>
  </button>

  <div class="h-4 w-[1px] bg-slate-800 mx-0.5"></div>

  <!-- Snapping & Visibility Controls -->
  <button
    type="button"
    onclick={toggleGridSnap}
    class="px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors {settings.snapToGrid ? 'bg-indigo-950/80 border-indigo-500/50 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400'}"
    title="Toggle Grid Snapping for Wall Endpoints"
  >
    Snap: {settings.snapToGrid ? 'ON' : 'OFF'}
  </button>

  <button
    type="button"
    onclick={toggleWallsVisibility}
    class="px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors {settings.wallsVisible ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300' : 'bg-slate-800 border-slate-700 text-slate-400'}"
    title="Toggle Visual Wall Vectors Overlay"
  >
    Walls: {settings.wallsVisible ? 'ON' : 'OFF'}
  </button>

  <div class="h-4 w-[1px] bg-slate-800 mx-0.5"></div>

  <!-- Global Fog & Wall Actions -->
  <div class="flex items-center gap-1">
    <button
      type="button"
      onclick={handleRevealAllFog}
      class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-bold"
      title="Reveal all battlemat fog cells"
    >
      Reveal All
    </button>
    <button
      type="button"
      onclick={handleResetFog}
      class="px-2 py-1 bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-300 rounded-lg text-[10px] font-bold"
      title="Reset and re-shroud entire map"
    >
      Reset Fog
    </button>
    <button
      type="button"
      onclick={handleClearWalls}
      class="p-1 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
      title="Clear All Wall Vectors"
    >
      🗑️
    </button>
  </div>
</div>
