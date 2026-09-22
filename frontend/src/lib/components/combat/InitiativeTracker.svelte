<!-- src/lib/components/combat/InitiativeTracker.svelte -->
<script lang="ts">
  import { combatStore } from '$lib/stores/combatStore.svelte';

  let manualInputs = $state<Record<string, number>>({});

  function updateScore(tokenId: string) {
    const val = manualInputs[tokenId];
    if (typeof val === 'number') {
      combatStore.setInitiative(tokenId, val);
    }
  }
</script>

<div class="fixed top-16 left-4 z-40 w-72 bg-slate-950/95 border border-slate-800 rounded-2xl p-3 shadow-2xl backdrop-blur-md text-xs space-y-3 select-none">
  <div class="flex items-center justify-between border-b border-slate-800 pb-2">
    <div>
      <h3 class="font-bold text-slate-100 uppercase tracking-wider text-[11px]">Combat Deck</h3>
      {#if combatStore.isActive}
        <span class="text-[10px] text-amber-400 font-semibold font-mono">Round {combatStore.round}</span>
      {/if}
    </div>

    {#if !combatStore.isActive}
      <button
        type="button"
        onclick={() => combatStore.startCombat()}
        class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-[10px] transition-colors"
      >
        Roll &amp; Start
      </button>
    {:else}
      <button
        type="button"
        onclick={() => combatStore.endCombat()}
        class="px-2 py-0.5 bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 font-semibold rounded text-[10px]"
      >
        End
      </button>
    {/if}
  </div>

  {#if combatStore.isActive}
    <div class="max-h-64 overflow-y-auto space-y-1.5 pr-1">
      {#each combatStore.combatants as combatant, index (combatant.tokenId)}
        <div
          class="flex items-center justify-between p-2 rounded-xl border transition-all {index === combatStore.turnIndex ? 'bg-indigo-950/60 border-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.25)]' : 'bg-slate-900/60 border-slate-800/80'}"
        >
          <div class="flex items-center gap-2 overflow-hidden">
            <span class="font-mono text-[10px] font-bold text-slate-500 w-4">{index + 1}</span>
            <div class="truncate">
              <div class="font-bold text-slate-200 truncate">{combatant.name}</div>
              <div class="text-[9px] text-slate-400 font-mono">HP: {combatant.hp}/{combatant.maxHp}</div>
            </div>
          </div>

          <div class="flex items-center gap-1.5">
            <input
              type="number"
              bind:value={manualInputs[combatant.tokenId]}
              placeholder={String(combatant.initiative)}
              onchange={() => updateScore(combatant.tokenId)}
              class="w-10 bg-slate-950 border border-slate-700 rounded px-1 py-0.5 text-center font-mono text-[10px] text-slate-200"
            />
          </div>
        </div>
      {/each}
    </div>

    <div class="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
      <button
        type="button"
        onclick={() => combatStore.previousTurn()}
        class="py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-semibold rounded-lg text-[10px]"
      >
        ◀ Prev Turn
      </button>
      <button
        type="button"
        onclick={() => combatStore.nextTurn()}
        class="py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-[10px]"
      >
        Next Turn ▶
      </button>
    </div>
  {:else}
    <div class="text-center py-4 text-slate-500 text-[11px]">
      Combat is idle. Click "Roll &amp; Start" to populate tokens into turn order.
    </div>
  {/if}
</div>
