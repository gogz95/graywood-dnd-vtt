<script lang="ts">
  import Icons from './Icons.svelte';

  let {
    currentRp = 0,
    maxRp = 10,
    itemName = 'Equipment',
    onUpdateRp,
  }: {
    currentRp: number;
    maxRp: number;
    itemName: string;
    onUpdateRp?: (newRp: number) => void;
  } = $props();

  let rpPercent = $derived(
    maxRp > 0 ? Math.max(0, Math.min(100, Math.round((currentRp / maxRp) * 100))) : 0
  );

  let isDepleted = $derived(currentRp === 0);

  function modifyRp(delta: number) {
    if (onUpdateRp) {
      const updated = Math.max(0, Math.min(maxRp, currentRp + delta));
      onUpdateRp(updated);
    }
  }
</script>

<div
  class="rounded-xl p-3 transition-all duration-200 {
    isDepleted
      ? 'border-2 border-red-600 bg-red-950/40 shadow-lg shadow-red-950/50'
      : 'border border-dark-700 bg-dark-900/60'
  }"
>
  <div class="flex items-center justify-between text-xs mb-1.5">
    <div class="flex items-center gap-1.5">
      <Icons
        name="sword"
        size={14}
        class={isDepleted ? 'text-red-400 animate-pulse' : 'text-blue-400'}
      />
      <span class="font-bold text-slate-200">
        {itemName}
      </span>
      <span class="text-[10px] text-slate-400 uppercase font-mono tracking-wider">Durability (RP)</span>
    </div>

    <div class="font-mono text-xs font-bold {isDepleted ? 'text-red-400' : 'text-slate-300'}">
      {currentRp} / {maxRp} RP
    </div>
  </div>

  <!-- RP Durability Bar -->
  <div class="w-full h-2 rounded-full bg-dark-950 overflow-hidden mb-2 border border-dark-700/80">
    <div
      class="h-full transition-all duration-300 rounded-full {
        isDepleted
          ? 'bg-red-600 w-0'
          : rpPercent > 50
          ? 'bg-cyan-500'
          : rpPercent > 20
          ? 'bg-amber-500'
          : 'bg-red-500'
      }"
      style="width: {rpPercent}%"
    ></div>
  </div>

  <!-- Depleted Warning Banner -->
  {#if isDepleted}
    <div class="flex items-center gap-2 p-2 bg-red-950/80 border border-red-500/50 rounded-lg text-red-300 text-xs font-semibold animate-pulse mb-2">
      <Icons name="alert-triangle" size={16} class="text-red-400 shrink-0" />
      <span>CRITICAL: Durability Exhausted (0 RP) — Item Fractured!</span>
    </div>
  {/if}

  <!-- Quick Durability Adjustment -->
  <div class="flex items-center justify-end gap-1.5 text-[11px]">
    <span class="text-slate-500 text-[10px] mr-1">Tune RP:</span>
    <button
      onclick={() => modifyRp(-5)}
      class="px-2 py-0.5 bg-dark-800 hover:bg-dark-700 border border-dark-600 rounded text-slate-300 transition-colors font-mono font-bold"
      title="Suffer 5 RP wear"
    >
      -5
    </button>
    <button
      onclick={() => modifyRp(-1)}
      class="px-2 py-0.5 bg-dark-800 hover:bg-dark-700 border border-dark-600 rounded text-slate-300 transition-colors font-mono font-bold"
      title="Suffer 1 RP wear"
    >
      -1
    </button>
    <button
      onclick={() => modifyRp(1)}
      class="px-2 py-0.5 bg-dark-800 hover:bg-dark-700 border border-dark-600 rounded text-slate-300 transition-colors font-mono font-bold"
      title="Repair 1 RP"
    >
      +1
    </button>
    <button
      onclick={() => modifyRp(5)}
      class="px-2 py-0.5 bg-dark-800 hover:bg-dark-700 border border-dark-600 rounded text-slate-300 transition-colors font-mono font-bold"
      title="Repair 5 RP"
    >
      +5
    </button>
  </div>
</div>
