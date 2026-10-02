<!-- frontend/src/lib/components/navigation/ProjectorCalibrationModal.svelte -->
<!-- Physical 1-Inch Grid Calibration Tool: Direct Diagonal or Drag-to-Resize Miniature Match -->

<script lang="ts">
  import { calculatePhysicalPpi, calculateOneInchScaleZoom } from '$lib/canvas/viewportEngine';
  import { projectorStore } from '$lib/stores/projectorStore.svelte';
  import { canvasStore } from '../../../stores/canvasStore.svelte';

  interface Props {
    isOpen?: boolean;
    onClose?: () => void;
  }

  let { isOpen = $bindable(false), onClose }: Props = $props();

  // Mode: 'diagonal' (Option A) vs 'miniature' (Option B)
  let mode = $state<'diagonal' | 'miniature'>('diagonal');

  // Option A Inputs
  let diagonalInches = $state(55);
  let resWidth = $state(3840);
  let resHeight = $state(2160);

  // Computed Option A PPI
  let calculatedDiagonalPpi = $derived(
    calculatePhysicalPpi(resWidth, resHeight, diagonalInches)
  );

  // Option B Interactive Drag-to-Resize square size in pixels
  let miniaturePx = $state(
    typeof localStorage !== 'undefined'
      ? Number(localStorage.getItem('vtt_projector_physical_ppi')) || 80
      : 80
  );

  let isDraggingResize = $state(false);
  let dragStartX = 0;
  let dragStartSize = 80;

  function handleResizePointerDown(e: PointerEvent) {
    isDraggingResize = true;
    dragStartX = e.clientX;
    dragStartSize = miniaturePx;
    (e.target as HTMLElement)?.setPointerCapture(e.pointerId);
  }

  function handleResizePointerMove(e: PointerEvent) {
    if (!isDraggingResize) return;
    const delta = e.clientX - dragStartX;
    miniaturePx = Math.max(30, Math.min(250, Math.round(dragStartSize + delta)));
  }

  function handleResizePointerUp(e: PointerEvent) {
    if (isDraggingResize) {
      isDraggingResize = false;
      try {
        (e.target as HTMLElement)?.releasePointerCapture(e.pointerId);
      } catch {}
    }
  }

  // Active effective PPI depending on tab
  let effectivePpi = $derived(
    mode === 'diagonal' ? calculatedDiagonalPpi : miniaturePx
  );

  let effectiveZoom = $derived(
    calculateOneInchScaleZoom(effectivePpi, canvasStore.gridSize || 60)
  );

  function applyAndSaveCalibration() {
    projectorStore.setPhysicalPpi(effectivePpi);
    // Lock canvas zoom to 1-inch physical scale
    canvasStore.setProjectorViewport({
      ...canvasStore.projectorViewport,
      zoom: effectiveZoom,
    });
    isOpen = false;
    onClose?.();
  }

  function applyPreset(diag: number, w: number, h: number) {
    diagonalInches = diag;
    resWidth = w;
    resHeight = h;
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-200"
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label="Projector Physical 1-Inch Grid Calibration"
    onclick={() => { isOpen = false; onClose?.(); }}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="w-full max-w-md bg-slate-900 border border-amber-500/50 rounded-3xl p-6 shadow-2xl flex flex-col text-slate-100 cursor-default animate-in zoom-in-95 duration-200"
      onclick={(e) => e.stopPropagation()}
      role="document"
    >
      <!-- Header -->
      <div class="flex items-center justify-between pb-4 border-b border-slate-800">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-xl">
            📐
          </div>
          <div>
            <h2 class="text-base font-bold text-white tracking-wide">TV Physical 1-Inch Calibration</h2>
            <p class="text-xs text-amber-400 font-mono">1 Grid Square = 1.0 Real Inch (25.4mm)</p>
          </div>
        </div>
        <button
          type="button"
          onclick={() => { isOpen = false; onClose?.(); }}
          class="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          aria-label="Close Calibration Modal"
        >
          ✕
        </button>
      </div>

      <!-- Mode Selector Tabs -->
      <div class="grid grid-cols-2 gap-2 my-4 p-1 bg-slate-950 rounded-2xl border border-slate-800">
        <button
          type="button"
          class="py-2 rounded-xl text-xs font-bold transition-all {mode === 'diagonal' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-slate-200'}"
          onclick={() => mode = 'diagonal'}
        >
          Option A: Screen Specs
        </button>
        <button
          type="button"
          class="py-2 rounded-xl text-xs font-bold transition-all {mode === 'miniature' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-slate-200'}"
          onclick={() => mode = 'miniature'}
        >
          Option B: Miniature Match
        </button>
      </div>

      {#if mode === 'diagonal'}
        <!-- Option A: Diagonal & Resolution -->
        <div class="space-y-4">
          <p class="text-xs text-slate-400 leading-relaxed">
            Enter your display's physical diagonal and native resolution to calculate exact hardware pixels-per-inch:
            <span class="font-mono text-amber-400 block mt-1">PPI = √(W² + H²) / Diagonal</span>
          </p>

          <div class="grid grid-cols-3 gap-3">
            <div>
              <label for="diag-in" class="text-[10px] uppercase font-bold text-slate-400 block mb-1">Diagonal (in)</label>
              <input
                id="diag-in"
                type="number"
                min="10"
                max="120"
                step="0.5"
                bind:value={diagonalInches}
                class="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm font-mono text-white text-center focus:border-amber-500 outline-none"
              />
            </div>
            <div>
              <label for="res-w" class="text-[10px] uppercase font-bold text-slate-400 block mb-1">Width (px)</label>
              <input
                id="res-w"
                type="number"
                min="640"
                max="7680"
                step="1"
                bind:value={resWidth}
                class="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm font-mono text-white text-center focus:border-amber-500 outline-none"
              />
            </div>
            <div>
              <label for="res-h" class="text-[10px] uppercase font-bold text-slate-400 block mb-1">Height (px)</label>
              <input
                id="res-h"
                type="number"
                min="480"
                max="4320"
                step="1"
                bind:value={resHeight}
                class="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm font-mono text-white text-center focus:border-amber-500 outline-none"
              />
            </div>
          </div>

          <!-- Quick Presets -->
          <div class="space-y-1.5 pt-2">
            <span class="text-[10px] uppercase font-bold text-slate-500 block">Common Presets</span>
            <div class="grid grid-cols-3 gap-2">
              <button
                type="button"
                class="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-[11px] font-mono text-slate-300 transition-colors"
                onclick={() => applyPreset(55, 3840, 2160)}
              >
                55" 4K TV
              </button>
              <button
                type="button"
                class="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-[11px] font-mono text-slate-300 transition-colors"
                onclick={() => applyPreset(43, 3840, 2160)}
              >
                43" 4K TV
              </button>
              <button
                type="button"
                class="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-[11px] font-mono text-slate-300 transition-colors"
                onclick={() => applyPreset(32, 1920, 1080)}
              >
                32" 1080p TV
              </button>
            </div>
          </div>
        </div>
      {:else}
        <!-- Option B: Miniature Match Drag-to-Resize -->
        <div class="space-y-4 flex flex-col items-center">
          <p class="text-xs text-slate-400 text-center leading-relaxed">
            Place a physical 1-inch (25.4mm) miniature base or ruler onto the glass. Drag the handle until the glowing box matches your mini base exactly:
          </p>

          <div class="relative flex items-center justify-center p-6 bg-slate-950 rounded-2xl border border-slate-800 w-full min-h-[180px]">
            <div
              class="relative flex flex-col items-center justify-center border-2 border-amber-400 bg-amber-950/20 text-amber-300 rounded shadow-lg shadow-amber-950/50"
              style="width: {miniaturePx}px; height: {miniaturePx}px;"
            >
              <span class="text-[10px] font-black uppercase tracking-wider">1.0 Inch</span>
              <span class="text-[8px] text-amber-400/80 font-mono">25.4 mm</span>

              <!-- Drag Resize Handle -->
              <div
                class="absolute -right-3 -bottom-3 w-6 h-6 rounded-full bg-amber-500 hover:bg-amber-400 active:scale-125 cursor-se-resize shadow-md flex items-center justify-center text-slate-950 text-xs font-black transition-transform"
                role="slider"
                tabindex="0"
                aria-label="Drag to resize calibration square"
                aria-valuenow={miniaturePx}
                aria-valuemin={30}
                aria-valuemax={250}
                onpointerdown={handleResizePointerDown}
                onpointermove={handleResizePointerMove}
                onpointerup={handleResizePointerUp}
              >
                ↔
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- Calculated Calibration Summary Banner -->
      <div class="my-5 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
        <div>
          <span class="text-[10px] uppercase font-bold text-amber-400 block">Calculated Density</span>
          <span class="text-xl font-black font-mono text-white">{effectivePpi} <span class="text-xs font-normal text-slate-400">PPI</span></span>
        </div>
        <div class="text-right">
          <span class="text-[10px] uppercase font-bold text-amber-400 block">Required Zoom</span>
          <span class="text-xl font-black font-mono text-amber-300">{effectiveZoom.toFixed(2)}x</span>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex items-center gap-3">
        <button
          type="button"
          onclick={() => { isOpen = false; onClose?.(); }}
          class="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onclick={applyAndSaveCalibration}
          class="flex-1 py-3 bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-amber-500/30 transition-all"
        >
          Lock to 1-Inch Scale
        </button>
      </div>
    </div>
  </div>
{/if}
