<!-- src/lib/components/canvas/TokenRadialMenu.svelte -->
<!-- Viewport-Anchored Token Radial Menu bound to token world coordinates through PixiJS camera projection matrix -->

<script lang="ts">
  import { tacticalViewport } from '../../services/canvas/tacticalViewportService.svelte';

  let {
    worldX = 0,
    worldY = 0,
    x,
    y,
    hp = 20,
    maxHp = 20,
    conditions: activeConditions = [],
    onDeltaHp = () => {},
    onToggleCondition = () => {},
    onClose = () => {},
  }: {
    worldX?: number;
    worldY?: number;
    x?: number;
    y?: number;
    hp?: number;
    maxHp?: number;
    conditions?: string[];
    onDeltaHp?: (delta: number) => void;
    onToggleCondition?: (cond: string) => void;
    onClose?: () => void;
  } = $props();

  const standardConditions = ['Prone', 'Blinded', 'Concentrating', 'Poisoned', 'Stunned', 'Blessed'];

  // Dynamically project world coordinates through the PixiJS camera projection matrix
  const screenPos = $derived.by(() => {
    if (worldX !== undefined && worldY !== undefined && (worldX !== 0 || worldY !== 0)) {
      return tacticalViewport.worldToScreen(worldX, worldY);
    }
    if (x !== undefined && y !== undefined) {
      return { x, y };
    }
    return { x: 0, y: 0 };
  });

  const menuScale = $derived(Math.max(0.75, Math.min(1.35, tacticalViewport.zoom)));
</script>

<!-- Anchored Radial HUD Wrapper with Camera Projection -->
<div
  class="fixed z-50 select-none pointer-events-auto transition-transform duration-75 ease-out"
  style="left: {screenPos.x}px; top: {screenPos.y}px; transform: translate(-50%, -50%) scale({menuScale}); transform-origin: center center;"
  role="dialog"
  aria-label="Token Radial Action Menu"
>
  <div class="relative w-52 h-52 rounded-full border border-slate-700/90 bg-slate-950/92 backdrop-blur-md shadow-2xl flex flex-col items-center justify-center p-2.5">
    <!-- HP Display -->
    <div class="text-center mb-1">
      <span class="font-mono font-black text-sm text-slate-100">{hp}</span>
      <span class="text-[9px] text-slate-500 font-mono">/ {maxHp} HP</span>
    </div>

    <!-- Quick HP Delta Buttons -->
    <div class="flex items-center gap-1 mb-2">
      <button
        type="button"
        onclick={() => onDeltaHp(-5)}
        class="px-1.5 py-0.5 rounded bg-rose-950/80 hover:bg-rose-900 border border-rose-700/60 text-rose-300 font-mono text-[10px] font-bold transition-all active:scale-90"
        title="Decrease HP by 5"
      >
        -5
      </button>
      <button
        type="button"
        onclick={() => onDeltaHp(-1)}
        class="px-1.5 py-0.5 rounded bg-rose-950/80 hover:bg-rose-900 border border-rose-700/60 text-rose-300 font-mono text-[10px] font-bold transition-all active:scale-90"
        title="Decrease HP by 1"
      >
        -1
      </button>
      <button
        type="button"
        onclick={() => onDeltaHp(1)}
        class="px-1.5 py-0.5 rounded bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-300 font-mono text-[10px] font-bold transition-all active:scale-90"
        title="Increase HP by 1"
      >
        +1
      </button>
      <button
        type="button"
        onclick={() => onDeltaHp(5)}
        class="px-1.5 py-0.5 rounded bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-300 font-mono text-[10px] font-bold transition-all active:scale-90"
        title="Increase HP by 5"
      >
        +5
      </button>
    </div>

    <!-- 5e Condition Toggles -->
    <div class="flex flex-wrap justify-center gap-1 max-w-[150px]">
      {#each standardConditions as cond}
        {@const isActive = activeConditions.includes(cond)}
        <button
          type="button"
          onclick={() => onToggleCondition(cond)}
          class="px-1.5 py-0.5 rounded text-[8px] font-semibold border transition-all active:scale-95 {isActive
            ? 'bg-rose-600 border-rose-400 text-white font-bold shadow-xs'
            : 'bg-slate-800 hover:bg-slate-750 text-slate-300 border-slate-700'}"
        >
          {cond}
        </button>
      {/each}
    </div>

    <!-- Close Button -->
    <button
      type="button"
      onclick={onClose}
      aria-label="Close Radial Menu"
      class="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-slate-900 border border-slate-700 text-slate-400 hover:text-white text-xs flex items-center justify-center transition-colors shadow-md"
    >
      ✕
    </button>
  </div>
</div>
