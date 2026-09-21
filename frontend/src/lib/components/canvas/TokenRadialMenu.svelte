<!-- src/lib/components/canvas/TokenRadialMenu.svelte -->
<script lang="ts">
  let {
    x,
    y,
    hp,
    maxHp,
    onDeltaHp,
    onToggleCondition,
    onClose,
  }: {
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    onDeltaHp: (delta: number) => void;
    onToggleCondition: (cond: string) => void;
    onClose: () => void;
  } = $props();

  const conditions = ['Prone', 'Stunned', 'Blessed', 'Concentrating'];
</script>

<div 
  class="fixed z-50 -translate-x-1/2 -translate-y-1/2 select-none pointer-events-auto"
  style="left: {x}px; top: {y}px;"
>
  <div class="relative w-48 h-48 rounded-full border border-slate-700 bg-slate-950/90 backdrop-blur-md shadow-2xl flex flex-col items-center justify-center p-2">
    <div class="text-center mb-1">
      <span class="font-mono font-black text-sm text-slate-100">{hp}</span>
      <span class="text-[9px] text-slate-500">/ {maxHp}</span>
    </div>

    <div class="flex items-center gap-1 mb-2">
      <button
        type="button"
        onclick={() => onDeltaHp(-5)}
        class="px-1.5 py-0.5 rounded bg-rose-950/80 hover:bg-rose-900 border border-rose-700/60 text-rose-300 font-mono text-[10px] font-bold"
      >
        -5
      </button>
      <button
        type="button"
        onclick={() => onDeltaHp(-1)}
        class="px-1.5 py-0.5 rounded bg-rose-950/80 hover:bg-rose-900 border border-rose-700/60 text-rose-300 font-mono text-[10px] font-bold"
      >
        -1
      </button>
      <button
        type="button"
        onclick={() => onDeltaHp(1)}
        class="px-1.5 py-0.5 rounded bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-300 font-mono text-[10px] font-bold"
      >
        +1
      </button>
      <button
        type="button"
        onclick={() => onDeltaHp(5)}
        class="px-1.5 py-0.5 rounded bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-300 font-mono text-[10px] font-bold"
      >
        +5
      </button>
    </div>

    <div class="flex flex-wrap justify-center gap-1 max-w-[140px]">
      {#each conditions as cond}
        <button 
          type="button"
          onclick={() => onToggleCondition(cond)}
          class="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[8px] font-semibold border border-slate-700"
        >
          {cond}
        </button>
      {/each}
    </div>

    <button
      type="button"
      onclick={onClose}
      aria-label="Close Radial Menu"
      class="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-slate-900 border border-slate-700 text-slate-400 hover:text-white text-xs flex items-center justify-center"
    >
      ✕
    </button>
  </div>
</div>
