<!-- src/lib/components/combat/InitiativeRibbon.svelte -->
<!-- Tactical Combat Initiative Ribbon: Displays sorted combatants, turn pointer, round tracker, and turn progression -->

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { combatTurnStore, type CombatTurnSync } from '../../../stores/websocketStore';
  import { sessionStore } from '../../../stores/sessionStore';
  import { audioEngine } from '../../audio/AudioEngine';

  let {
    isDm = true,
    compact = false
  }: {
    isDm?: boolean;
    compact?: boolean;
  } = $props();

  let liveCombat = $derived($combatTurnStore);

  function handleNextTurn() {
    sessionStore.nextCombatTurn();
    audioEngine.triggerSfx('sfx-sword');
  }

  function handlePrevTurn() {
    sessionStore.prevCombatTurn();
    audioEngine.triggerSfx('sfx-click');
  }
</script>

{#if liveCombat && liveCombat.combatants && liveCombat.combatants.length > 0}
  {@const activeIdx = liveCombat.current_turn_index % liveCombat.combatants.length}
  {@const activeCombatant = liveCombat.combatants[activeIdx]}

  <div
    class="w-full bg-slate-950/90 backdrop-blur-md border-b border-slate-800 px-4 py-2 flex items-center justify-between gap-3 text-xs select-none shadow-xl z-20"
  >
    <!-- Left: Round Counter & Controls -->
    <div class="flex items-center gap-2 shrink-0">
      <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-indigo-950/80 border border-indigo-500/40 text-indigo-200 font-mono font-black text-xs shadow-sm">
        <span>⚔️</span>
        <span>RND {liveCombat.round}</span>
      </div>

      {#if isDm}
        <div class="flex items-center gap-1">
          <button
            type="button"
            onclick={handlePrevTurn}
            class="px-2 py-1 bg-slate-900 hover:bg-slate-800 active:scale-95 border border-slate-800 rounded-lg text-slate-300 font-bold transition-all"
            title="Step Back to Previous Turn"
          >
            ◀
          </button>
          <button
            type="button"
            onclick={handleNextTurn}
            class="px-3 py-1 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 active:scale-95 text-slate-950 font-black rounded-lg shadow-md shadow-amber-600/30 transition-all flex items-center gap-1"
            title="Advance to Next Turn (ticks condition timers)"
          >
            <span>NEXT TURN</span>
            <span>▶</span>
          </button>
        </div>
      {/if}
    </div>

    <!-- Center: Horizontal Initiative Strip -->
    <div class="flex-1 flex items-center gap-2 overflow-x-auto py-1 px-2 scrollbar-thin">
      {#each liveCombat.combatants as combatant, idx}
        {@const isActive = idx === activeIdx}
        {@const isOnDeck = idx === (activeIdx + 1) % liveCombat.combatants.length}

        <div
          class="flex items-center gap-2 px-3 py-1 rounded-xl border transition-all shrink-0 {isActive
            ? 'bg-amber-950/80 border-amber-500 text-amber-100 shadow-md shadow-amber-500/20 scale-105 animate-pulse'
            : isOnDeck
            ? 'bg-indigo-950/40 border-indigo-600/40 text-slate-300'
            : 'bg-slate-900/60 border-slate-800/80 text-slate-400 opacity-75'}"
        >
          <!-- Initiative Number Pip -->
          <span
            class="px-1.5 py-0.2 rounded font-mono font-bold text-[10px] {isActive
              ? 'bg-amber-500 text-slate-950'
              : 'bg-slate-950 text-slate-400 border border-slate-800'}"
          >
            {combatant.initiative}
          </span>

          <!-- Name & Tag -->
          <div class="flex items-center gap-1">
            <span class="font-bold text-xs truncate max-w-[110px]">
              {combatant.is_hidden && !isDm ? 'Unknown Threat' : combatant.name}
            </span>
            {#if isActive}
              <span class="px-1 py-0.2 rounded bg-amber-500 text-slate-950 font-black text-[8px] uppercase">
                ACTIVE
              </span>
            {:else if isOnDeck}
              <span class="px-1 py-0.2 rounded bg-indigo-800/60 text-indigo-200 font-bold text-[8px] uppercase">
                ON DECK
              </span>
            {/if}
          </div>

          <!-- HP Indicator -->
          {#if combatant.hp_percent !== undefined}
            <div class="w-8 h-1.5 rounded-full bg-slate-950 overflow-hidden border border-slate-800">
              <div
                class="h-full transition-all {combatant.hp_percent <= 25 ? 'bg-rose-500' : combatant.hp_percent <= 50 ? 'bg-amber-500' : 'bg-emerald-500'}"
                style="width: {combatant.hp_percent}%"
              ></div>
            </div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Right: Active Creature Summary -->
    {#if activeCombatant}
      <div class="hidden md:flex items-center gap-2 shrink-0 border-l border-slate-800 pl-3">
        <span class="text-[10px] uppercase font-bold text-slate-500">Current:</span>
        <span class="font-black text-amber-300 text-xs truncate max-w-[130px]">
          {activeCombatant.name}
        </span>
      </div>
    {/if}
  </div>
{/if}
