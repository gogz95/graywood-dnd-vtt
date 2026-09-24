<!-- src/lib/components/projector/TabletopCalibrationOverlay.svelte -->
<!-- Physical TV / Tabletop Display Calibration Wizard & Display Optimization Overlay (Svelte 5 Runes) -->

<script lang="ts">
  import { canvasStore } from '../../../stores/canvasStore.svelte';

  export type ScreenRotation = 0 | 90 | 180 | 270;

  interface Props {
    isOpen?: boolean;
    rotation?: ScreenRotation;
    onClose?: () => void;
    onRotationChanged?: (rotation: ScreenRotation) => void;
  }

  let {
    isOpen = $bindable(false),
    rotation = $bindable(0),
    onClose,
    onRotationChanged,
  }: Props = $props();

  const STORAGE_PPI_KEY = 'vtt_projector_physical_ppi';
  const STORAGE_ROTATION_KEY = 'vtt_projector_rotation';

  function getStoredPpi(): number {
    if (typeof localStorage === 'undefined') return 96;
    try {
      const val = localStorage.getItem(STORAGE_PPI_KEY);
      return val ? Math.max(40, Math.min(240, Number(val))) : 96;
    } catch {
      return 96;
    }
  }

  let ppi = $state<number>(getStoredPpi());

  export function applyPpi(val: number) {
    ppi = Math.max(40, Math.min(240, val));
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_PPI_KEY, String(ppi));
      } catch {}
    }

    // Scale battle mat so 1 grid square (e.g. 60px) equals 1 real-world inch
    const targetZoom = ppi / (canvasStore.gridSize || 60);
    canvasStore.setProjectorViewport({
      ...canvasStore.projectorViewport,
      zoom: Math.max(0.1, Math.min(4.0, targetZoom)),
    });
  }

  function handleSetRotation(r: ScreenRotation) {
    rotation = r;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_ROTATION_KEY, String(r));
      } catch {}
    }
    onRotationChanged?.(r);
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    onclick={() => { isOpen = false; onClose?.(); }}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="w-full max-w-sm bg-slate-900 border border-indigo-500/60 rounded-3xl p-5 shadow-2xl flex flex-col text-slate-100 cursor-default animate-in zoom-in-95 duration-200"
      onclick={(e) => e.stopPropagation()}
      role="document"
    >
      <!-- Header -->
      <div class="flex items-center justify-between pb-3 border-b border-slate-800">
        <div class="flex items-center gap-2">
          <span class="text-lg">📐</span>
          <div>
            <h2 class="text-sm font-black text-white">Tabletop TV Calibration</h2>
            <p class="text-[10px] text-indigo-400 font-mono">1 Grid Square = 1 Real Inch</p>
          </div>
        </div>
        <button
          type="button"
          onclick={() => { isOpen = false; onClose?.(); }}
          class="p-1 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
          aria-label="Close Calibration Overlay"
        >
          ✕
        </button>
      </div>

      <!-- Instructions -->
      <p class="text-[11px] text-slate-400 my-3 leading-relaxed">
        Place a physical 1-inch miniature base or ruler on your TV glass. Adjust the slider until the virtual box matches your miniature exactly.
      </p>

      <!-- 1-Inch Virtual Miniature Base Visualizer -->
      <div class="flex flex-col items-center justify-center my-2 p-4 bg-slate-950/90 border border-slate-800 rounded-2xl relative">
        <div
          class="flex flex-col items-center justify-center border-2 border-dashed border-cyan-400 bg-cyan-950/30 text-cyan-300 font-mono font-bold text-center select-none shadow-lg shadow-cyan-950/50 transition-all duration-75"
          style="width: {ppi}px; height: {ppi}px;"
        >
          <span class="text-[11px] font-black">1.0 INCH</span>
          <span class="text-[9px] text-cyan-400/80">(25.4 mm)</span>
        </div>
        <div class="mt-2.5 text-[10px] font-mono text-slate-500 flex items-center gap-2">
          <span>{ppi} px/inch</span>
          <span>•</span>
          <span class="text-indigo-400">Zoom: {(ppi / (canvasStore.gridSize || 60)).toFixed(2)}x</span>
        </div>
      </div>

      <!-- PPI Slider -->
      <div class="my-3 space-y-1.5">
        <div class="flex items-center justify-between text-xs">
          <span class="text-slate-400 font-medium">Physical TV PPI</span>
          <span class="font-mono font-bold text-cyan-400">{ppi} PPI</span>
        </div>
        <input
          type="range"
          min="45"
          max="160"
          step="1"
          bind:value={ppi}
          oninput={() => applyPpi(ppi)}
          class="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
        />
        <div class="flex justify-between text-[9px] font-mono text-slate-600">
          <span>45 PPI (Large 1080p TV)</span>
          <span>160 PPI (High-Density)</span>
        </div>
      </div>

      <!-- Common TV Screen Presets -->
      <div class="space-y-1.5 pt-2 border-t border-slate-800">
        <span class="text-[10px] uppercase font-bold text-slate-400 block">TV & Display Presets</span>
        <div class="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            class="py-1 px-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-xl text-[10px] font-medium transition-colors"
            onclick={() => applyPpi(69)}
          >
            32" 1080p (~69 PPI)
          </button>
          <button
            type="button"
            class="py-1 px-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-xl text-[10px] font-medium transition-colors"
            onclick={() => applyPpi(80)}
          >
            55" 4K (~80 PPI)
          </button>
          <button
            type="button"
            class="py-1 px-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-xl text-[10px] font-medium transition-colors"
            onclick={() => applyPpi(96)}
          >
            Standard Monitor (96 PPI)
          </button>
          <button
            type="button"
            class="py-1 px-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-xl text-[10px] font-medium transition-colors"
            onclick={() => applyPpi(102)}
          >
            43" 4K (~102 PPI)
          </button>
        </div>
      </div>

      <!-- TV Screen Orientation (0°, 90°, 180°, 270°) -->
      <div class="space-y-1.5 pt-3 mt-3 border-t border-slate-800">
        <div class="flex items-center justify-between">
          <span class="text-[10px] uppercase font-bold text-slate-400">TV Orientation</span>
          <span class="text-[10px] font-mono text-indigo-400 font-bold">{rotation}°</span>
        </div>
        <div class="grid grid-cols-4 gap-1.5">
          {#each [0, 90, 180, 270] as r}
            <button
              type="button"
              onclick={() => handleSetRotation(r as ScreenRotation)}
              class="py-1.5 rounded-xl text-xs font-mono font-bold transition-all border {rotation === r ? 'bg-indigo-600 text-white border-indigo-400 shadow-sm' : 'bg-slate-800/80 text-slate-400 border-slate-700/60 hover:text-slate-200'}"
            >
              {r}°
            </button>
          {/each}
        </div>
      </div>

      <!-- Done Button -->
      <div class="pt-4 mt-2">
        <button
          type="button"
          onclick={() => { isOpen = false; onClose?.(); }}
          class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/30 transition-all"
        >
          Save & Lock Scale
        </button>
      </div>
    </div>
  </div>
{/if}
