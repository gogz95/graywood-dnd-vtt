<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { inventoryStore, toggleItemPreserved } from '../stores/characterStore';
  import { rulesEngine } from '../lib/stores/rulesEngine.svelte';
  import ResistancePointsBar from './ResistancePointsBar.svelte';
  import Icons from './Icons.svelte';
  import type { InventoryItem } from '../types/character';

  let nowSec = $state(Math.floor(Date.now() / 1000));
  let timerInterval: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    timerInterval = setInterval(() => {
      nowSec = Math.floor(Date.now() / 1000);
    }, 1000);
  });

  onDestroy(() => {
    if (timerInterval) {
      clearInterval(timerInterval);
    }
  });

  function formatTimeRemaining(harvestTimestamp: number): {
    text: string;
    isExpired: boolean;
  } {
    const expireTimestamp = harvestTimestamp + 86400; // 24-hour harvest window
    const diff = expireTimestamp - nowSec;

    if (diff <= 0) {
      return { text: '00:00:00', isExpired: true };
    }

    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    const seconds = diff % 60;

    const pad = (n: number) => n.toString().padStart(2, '0');
    return {
      text: `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`,
      isExpired: false,
    };
  }

  function handleRpChange(itemId: string, newRp: number) {
    inventoryStore.update((items) =>
      items.map((i) => (i.id === itemId ? { ...i, current_rp: newRp } : i))
    );
  }
</script>

<div class="space-y-4">
  <!-- Section Title -->
  <div class="flex items-center justify-between">
    <h2 class="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
      <Icons name="sword" size={16} class="text-amber-400" /> Equipment & Reagents
    </h2>
    <span class="text-xs text-slate-400 font-mono">
      {$inventoryStore.length} Items
    </span>
  </div>

  <!-- Items List -->
  <div class="space-y-3">
    {#each $inventoryStore as item}
      {@const isPerishable = item.harvest_timestamp !== null}
      {@const countdown = isPerishable ? formatTimeRemaining(item.harvest_timestamp!) : null}
      {@const isSpoiledNow = item.is_spoiled || (isPerishable && !item.is_preserved && countdown?.isExpired)}

      <div
        class="rounded-2xl p-4 transition-all duration-200 border {
          isSpoiledNow
            ? 'border-amber-500/80 bg-amber-950/30 text-amber-200 shadow-lg shadow-amber-950/40'
            : item.current_rp === 0 && item.max_rp > 0
            ? 'border-red-600/80 bg-red-950/20'
            : 'border-dark-700/80 bg-dark-900/80'
        }"
      >
        <!-- Item Header: Name, Quantity, Value -->
        <div class="flex items-start justify-between gap-2 mb-2">
          <div>
            <div class="flex items-center gap-2">
              <h3 class="font-bold text-sm text-slate-100">
                {item.name}
              </h3>
              {#if item.quantity > 1}
                <span class="px-1.5 py-0.2 rounded bg-dark-800 border border-dark-600 text-slate-300 text-xs font-mono font-bold">
                  &times;{item.quantity}
                </span>
              {/if}
            </div>
            <div class="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
              <span>{item.weight_lbs} lbs</span>
              <span>&bull;</span>
              <span class="font-mono {isSpoiledNow ? 'text-amber-400 font-bold' : ''}">
                {item.base_value_cp} CP
                {#if isSpoiledNow}
                  (50% Value)
                {/if}
              </span>
            </div>
          </div>

          <!-- Badges: Preservation & Spoilage Status -->
          <div class="flex flex-col items-end gap-1 shrink-0">
            {#if isSpoiledNow}
              <!-- Prominent Amber Spoiled Badge -->
              <span class="px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-500 text-amber-300 text-[11px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm shadow-amber-500/20">
                <Icons name="alert-triangle" size={12} class="text-amber-400" />
                Spoiled (50% Value)
              </span>
            {:else if isPerishable}
              {#if item.is_preserved}
                <span class="px-2 py-0.5 rounded-full bg-blue-950/80 border border-blue-500/50 text-blue-300 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                  <Icons name="check" size={10} /> Preserved Safe
                </span>
              {:else if countdown}
                <!-- Real-Time Countdown Badge -->
                <span class="px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/60 text-emerald-300 text-[11px] font-mono font-bold flex items-center gap-1.5 animate-pulse">
                  <Icons name="clock" size={12} class="text-emerald-400" />
                  {countdown.text}
                </span>
              {/if}
            {/if}

            <!-- Preservation Toggle Button -->
            {#if isPerishable && !isSpoiledNow}
              <button
                onclick={() => toggleItemPreserved(item.id)}
                class="text-[10px] text-slate-400 hover:text-slate-200 underline mt-1"
              >
                {item.is_preserved ? 'Remove Preservation' : 'Apply Preservative Salve'}
              </button>
            {/if}
          </div>
        </div>

        <!-- Resistance Points Durability Bar for Equipment (Modular Homebrew) -->
        {#if rulesEngine.isEnabled('enableDurabilitySystem') && item.max_rp > 0}
          <div class="mt-3 pt-3 border-t border-dark-800">
            <ResistancePointsBar
              currentRp={item.current_rp}
              maxRp={item.max_rp}
              itemName={item.name}
              onUpdateRp={(newRp) => handleRpChange(item.id, newRp)}
            />
          </div>
        {/if}
      </div>
    {/each}
  </div>
</div>
