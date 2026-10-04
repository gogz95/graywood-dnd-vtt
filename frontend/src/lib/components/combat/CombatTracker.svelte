<!-- frontend/src/lib/components/combat/CombatTracker.svelte -->
<!-- Tactical Combat Tracker with Condition Tooltips, Turn Breathing Hooks, and 5e Mechanics -->

<script lang="ts">
  import { combatStore, type Combatant } from '$lib/stores/combatStore.svelte';
  import { combatTrackerStore } from '$lib/stores/combatTrackerStore';
  import ConditionBadgeTooltip from './ConditionBadgeTooltip.svelte';

  interface Props {
    compact?: boolean;
    onSelectCombatant?: (combatant: Combatant) => void;
  }

  let { compact = false, onSelectCombatant }: Props = $props();

  const standardConditions = [
    'Blinded',
    'Charmed',
    'Deafened',
    'Frightened',
    'Grappled',
    'Incapacitated',
    'Invisible',
    'Paralyzed',
    'Petrified',
    'Poisoned',
    'Prone',
    'Restrained',
    'Stunned',
    'Unconscious',
    'Exhaustion',
    'Concentrating',
  ];

  let selectedTokenId = $state<string | null>(null);
  let manualInitiatives = $state<Record<string, number>>({});

  function handleInitiativeChange(tokenId: string) {
    const val = manualInitiatives[tokenId];
    if (typeof val === 'number') {
      combatStore.setInitiative(tokenId, val);
    }
  }

  function toggleCombatantCondition(combatant: Combatant, condition: string) {
    const exists = combatant.conditions.includes(condition);
    combatant.conditions = exists
      ? combatant.conditions.filter((c) => c !== condition)
      : [...combatant.conditions, condition];
  }
</script>

<div
  class="bg-slate-950/95 border border-slate-800 rounded-2xl p-4 shadow-2xl backdrop-blur-xl text-xs space-y-3.5 select-none text-slate-200"
>
  <!-- Header Bar -->
  <div class="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
    <div class="flex items-center gap-2">
      <span class="text-sm">⚔️</span>
      <h3 class="font-bold text-slate-100 uppercase tracking-wider text-[11px]">Combat Tracker</h3>
      {#if combatTrackerStore.isActive}
        <span class="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-bold">
          Round {combatTrackerStore.round}
        </span>
      {/if}
    </div>

    {#if !combatTrackerStore.isActive}
      <button
        type="button"
        onclick={() => combatTrackerStore.startCombat()}
        class="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold rounded-lg text-[10px] transition-all shadow-md shadow-emerald-950"
      >
        Roll &amp; Start
      </button>
    {:else}
      <div class="flex items-center gap-1.5">
        <button
          type="button"
          onclick={() => combatTrackerStore.endCombat()}
          class="px-2.5 py-0.5 bg-rose-950/80 hover:bg-rose-900 border border-rose-800/80 text-rose-300 font-semibold rounded text-[10px] transition-colors"
        >
          End Combat
        </button>
      </div>
    {/if}
  </div>

  <!-- Combatants List -->
  {#if combatTrackerStore.isActive}
    <div class="max-h-80 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
      {#each combatTrackerStore.combatants as combatant, index (combatant.tokenId)}
        {@const isActive = index === combatTrackerStore.turnIndex}
        {@const isSelected = selectedTokenId === combatant.tokenId}

        <div
          class="p-2.5 rounded-xl border transition-all {isActive
            ? 'bg-amber-950/40 border-amber-500/80 shadow-[0_0_15px_rgba(245,158,11,0.2)] ring-1 ring-amber-500/40'
            : isSelected
            ? 'bg-indigo-950/40 border-indigo-600/60'
            : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700'}"
        >
          <!-- Combatant Top Row -->
          <div class="flex items-center justify-between gap-2">
            <div
              class="flex items-center gap-2 min-w-0 cursor-pointer"
              role="button"
              tabindex="0"
              onclick={() => {
                selectedTokenId = combatant.tokenId;
                onSelectCombatant?.(combatant);
              }}
              onkeydown={(e) => e.key === 'Enter' && (selectedTokenId = combatant.tokenId)}
            >
              <span class="font-mono text-[10px] font-bold text-slate-500 w-4">{index + 1}</span>
              <div class="truncate">
                <div class="font-bold text-slate-100 truncate flex items-center gap-1.5">
                  <span>{combatant.name}</span>
                  {#if isActive}
                    <span class="px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 font-black text-[8px] uppercase tracking-wider">
                      ACTIVE
                    </span>
                  {/if}
                </div>
                <div class="text-[10px] text-slate-400 font-mono mt-0.5">
                  HP: <span class="font-bold text-slate-200">{combatant.hp}</span> / {combatant.maxHp}
                </div>
              </div>
            </div>

            <!-- Initiative Input -->
            <div class="flex items-center gap-1 shrink-0">
              <input
                type="number"
                bind:value={manualInitiatives[combatant.tokenId]}
                placeholder={String(combatant.initiative)}
                onchange={() => handleInitiativeChange(combatant.tokenId)}
                class="w-11 bg-slate-950 border border-slate-700/80 rounded px-1.5 py-0.5 text-center font-mono text-[10px] text-slate-200 focus:border-amber-500 focus:outline-none"
                title="Initiative Score"
              />
            </div>
          </div>

          <!-- Active Conditions with SRD Tooltips -->
          {#if combatant.conditions && combatant.conditions.length > 0}
            <div class="flex flex-wrap items-center gap-1 mt-2 pt-1.5 border-t border-slate-800/50">
              {#each combatant.conditions as cond}
                <ConditionBadgeTooltip
                  condition={cond}
                  compact={true}
                  active={true}
                  onclick={() => toggleCombatantCondition(combatant, cond)}
                />
              {/each}
            </div>
          {/if}

          <!-- Condition Quick Toggle Selector for Selected/Active Combatant -->
          {#if isSelected || isActive}
            <div class="mt-2 pt-2 border-t border-slate-800/60">
              <div class="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Toggle Conditions:
              </div>
              <div class="flex flex-wrap gap-1">
                {#each standardConditions as stdCond}
                  {@const hasCondition = combatant.conditions.includes(stdCond)}
                  <ConditionBadgeTooltip
                    condition={stdCond}
                    compact={true}
                    active={hasCondition}
                    onclick={() => toggleCombatantCondition(combatant, stdCond)}
                  />
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Turn Navigation Controls -->
    <div class="grid grid-cols-2 gap-2 pt-2.5 border-t border-slate-800">
      <button
        type="button"
        onclick={() => combatTrackerStore.previousTurn()}
        class="py-1.5 px-3 bg-slate-900 hover:bg-slate-800 active:scale-95 border border-slate-700 text-slate-300 font-semibold rounded-lg text-[10px] transition-all"
      >
        ◀ Prev Turn
      </button>
      <button
        type="button"
        onclick={() => combatTrackerStore.nextTurn()}
        class="py-1.5 px-3 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-bold rounded-lg text-[10px] transition-all shadow-md shadow-indigo-950"
      >
        Next Turn ▶
      </button>
    </div>
  {:else}
    <div class="text-center py-6 text-slate-500 text-[11px] border border-dashed border-slate-800 rounded-xl">
      Combat is idle. Click "Roll &amp; Start" to populate scene tokens into turn order.
    </div>
  {/if}
</div>
