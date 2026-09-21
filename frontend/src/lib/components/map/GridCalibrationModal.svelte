<!-- src/lib/components/map/GridCalibrationModal.svelte -->
<script lang="ts">
  import { computeGridCalibration, type GridConfig } from '../../services/gridCalibration';

  let {
    isOpen = $bindable(false),
    onApply,
  }: {
    isOpen: boolean;
    onApply: (config: GridConfig) => void;
  } = $props();

  let p1 = $state({ x: 0, y: 0 });
  let p2 = $state({ x: 150, y: 150 });
  let unitsWide = $state(3);
  let unitsHigh = $state(3);

  function handleSave() {
    const config = computeGridCalibration({ p1, p2, gridUnitsWide: unitsWide, gridUnitsHigh: unitsHigh });
    onApply(config);
    isOpen = false;
  }
</script>

{#if isOpen}
  <div
    role="presentation"
    class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in select-none"
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-label="3-Point Grid Alignment"
      tabindex="-1"
      class="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4 text-xs"
    >
      <div class="flex items-center justify-between border-b border-slate-800 pb-2">
        <h3 class="font-bold text-slate-100 uppercase tracking-wider">3-Point Grid Alignment</h3>
        <button
          type="button"
          onclick={() => (isOpen = false)}
          class="text-slate-400 hover:text-white"
          aria-label="Close Calibration Modal"
        >
          ✕
        </button>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <label class="space-y-1 block">
          <span class="text-slate-400 text-[10px] font-semibold block">Grid Squares Wide</span>
          <input
            type="number"
            bind:value={unitsWide}
            min="1"
            class="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-100"
          />
        </label>
        <label class="space-y-1 block">
          <span class="text-slate-400 text-[10px] font-semibold block">Grid Squares High</span>
          <input
            type="number"
            bind:value={unitsHigh}
            min="1"
            class="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-100"
          />
        </label>
      </div>

      <button
        type="button"
        onclick={handleSave}
        class="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all"
      >
        Apply Grid Snapping
      </button>
    </div>
  </div>
{/if}
