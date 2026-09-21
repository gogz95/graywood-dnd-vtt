<!-- src/lib/components/canvas/FogToolbar.svelte -->
<!-- DM Tactical Canvas Overlay for Manual Fog-of-War Editing Tools -->
<script lang="ts">
  import { fogBrushEngine, type FogToolMode } from '$lib/canvas/fogBrushEngine';

  interface Props {
    activeMapId: string | null;
  }

  let { activeMapId }: Props = $props();

  let activeMode = $state<FogToolMode>('reveal_brush');
  let brushRadius = $state<number>(60);
  let showConfirmReset = $state<boolean>(false);
  let showConfirmClear = $state<boolean>(false);

  $effect(() => {
    fogBrushEngine.setActiveMapId(activeMapId);
  });

  function setMode(mode: FogToolMode) {
    activeMode = mode;
    fogBrushEngine.setMode(mode);
  }

  function handleRadiusChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const val = parseInt(target.value, 10);
    brushRadius = val;
    fogBrushEngine.setBrushRadius(val);
  }

  async function handleResetAll() {
    await fogBrushEngine.hideAll();
    showConfirmReset = false;
  }

  async function handleClearAll() {
    await fogBrushEngine.revealAll();
    showConfirmClear = false;
  }
</script>

<div class="flex items-center gap-2 bg-slate-900/95 backdrop-blur border border-slate-700/80 rounded-lg p-2 shadow-2xl text-slate-200 select-none text-xs">
  <span class="font-bold text-amber-400/90 flex items-center gap-1.5 px-2 py-1 bg-amber-950/40 rounded border border-amber-800/40">
    <span>🌫️</span>
    <span>FOG TOOLS</span>
  </span>

  <div class="h-5 w-px bg-slate-700"></div>

  <!-- Tool Selectors -->
  <div class="flex items-center gap-1">
    <button
      class="px-2.5 py-1.5 rounded flex items-center gap-1.5 font-medium transition-colors {activeMode === 'reveal_brush'
        ? 'bg-emerald-600 text-white shadow'
        : 'hover:bg-slate-800 text-slate-300'}"
      onclick={() => setMode('reveal_brush')}
      title="Reveal Brush"
    >
      <span>🖌️</span>
      <span>Reveal</span>
    </button>

    <button
      class="px-2.5 py-1.5 rounded flex items-center gap-1.5 font-medium transition-colors {activeMode === 'hide_brush'
        ? 'bg-rose-600 text-white shadow'
        : 'hover:bg-slate-800 text-slate-300'}"
      onclick={() => setMode('hide_brush')}
      title="Hide Brush"
    >
      <span>🌑</span>
      <span>Shroud</span>
    </button>

    <button
      class="px-2.5 py-1.5 rounded flex items-center gap-1.5 font-medium transition-colors {activeMode === 'reveal_polygon'
        ? 'bg-emerald-700 text-white shadow'
        : 'hover:bg-slate-800 text-slate-300'}"
      onclick={() => setMode('reveal_polygon')}
      title="Reveal Polygon"
    >
      <span>📐</span>
      <span>Poly Reveal</span>
    </button>

    <button
      class="px-2.5 py-1.5 rounded flex items-center gap-1.5 font-medium transition-colors {activeMode === 'hide_polygon'
        ? 'bg-rose-700 text-white shadow'
        : 'hover:bg-slate-800 text-slate-300'}"
      onclick={() => setMode('hide_polygon')}
      title="Hide Polygon"
    >
      <span>📐</span>
      <span>Poly Shroud</span>
    </button>
  </div>

  <div class="h-5 w-px bg-slate-700"></div>

  <!-- Brush Size Slider -->
  <div class="flex items-center gap-2 px-2">
    <span class="text-slate-400 font-mono text-[11px] w-12 text-right">{brushRadius}px</span>
    <input
      type="range"
      min="20"
      max="200"
      step="5"
      value={brushRadius}
      oninput={handleRadiusChange}
      class="w-24 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
      title="Brush Radius (20px - 200px)"
    />
    <!-- Live Cursor Preview Icon -->
    <div
      class="rounded-full border border-amber-400/80 bg-amber-400/20 flex items-center justify-center shrink-0"
      style="width: {Math.max(12, Math.min(26, brushRadius / 4))}px; height: {Math.max(12, Math.min(26, brushRadius / 4))}px;"
      title="Brush Radius Preview"
    ></div>
  </div>

  <div class="h-5 w-px bg-slate-700"></div>

  <!-- Global Actions -->
  <div class="flex items-center gap-1">
    {#if showConfirmClear}
      <div class="flex items-center gap-1 bg-emerald-950/60 p-1 rounded border border-emerald-700">
        <span class="text-[11px] text-emerald-300">Reveal all?</span>
        <button
          onclick={handleClearAll}
          class="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold"
        >
          Yes
        </button>
        <button
          onclick={() => (showConfirmClear = false)}
          class="px-1.5 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 text-[11px]"
        >
          No
        </button>
      </div>
    {:else}
      <button
        onclick={() => (showConfirmClear = true)}
        class="px-2 py-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-emerald-400 transition-colors"
        title="Clear All Fog (Reveal entire map)"
      >
        Clear All
      </button>
    {/if}

    {#if showConfirmReset}
      <div class="flex items-center gap-1 bg-rose-950/60 p-1 rounded border border-rose-700">
        <span class="text-[11px] text-rose-300">Shroud all?</span>
        <button
          onclick={handleResetAll}
          class="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold"
        >
          Yes
        </button>
        <button
          onclick={() => (showConfirmReset = false)}
          class="px-1.5 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 text-[11px]"
        >
          No
        </button>
      </div>
    {:else}
      <button
        onclick={() => (showConfirmReset = true)}
        class="px-2 py-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-rose-400 transition-colors"
        title="Reset All Fog (Shroud entire map)"
      >
        Reset All
      </button>
    {/if}
  </div>
</div>
