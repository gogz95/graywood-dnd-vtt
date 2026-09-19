<!-- AlchemyWorkbench.svelte — Full Aleamos 28-Essence Alchemy Lab & Workbench -->
<script lang="ts">
  import { onMount } from 'svelte';
  import {
    ESSENCE_REGISTRY,
    ESSENCE_MATRIX_RECIPES,
    lookupEssenceCombination,
    calculateIngredientPoints,
    calculateWorkHours,
    requiresStrongholdLab,
    type ElementalType,
    type AlchemyRecipe,
    type EssenceDefinition,
  } from './alchemyMatrix';
  import { sessionStore, type PartyStashItem } from '../../../stores/sessionStore';
  import { audioEngine } from '../../audio/AudioEngine';

  // State
  let slotA = $state<ElementalType | null>('FIRE');
  let slotB = $state<ElementalType | null>('EARTH');
  let auxiliaryCount = $state<number>(0); // additional botanicals / stabilizers
  let hasStrongholdLab = $state<boolean>(false);
  let isBrewing = $state<boolean>(false);
  let brewSuccessMessage = $state<string | null>(null);

  // Check stronghold facilities from localStorage
  function checkStrongholdFacilities() {
    try {
      const raw = localStorage.getItem('vtt_stronghold_state');
      if (raw) {
        const data = JSON.parse(raw);
        hasStrongholdLab = Boolean(data.facilities?.includes('alchemy_lab'));
      }
    } catch {
      hasStrongholdLab = false;
    }
  }

  onMount(() => {
    checkStrongholdFacilities();
    const handleFacilityUpdate = () => checkStrongholdFacilities();
    window.addEventListener('vtt:stronghold-updated', handleFacilityUpdate);
    return () => {
      window.removeEventListener('vtt:stronghold-updated', handleFacilityUpdate);
    };
  });

  // Total ingredients slotted
  let totalIngredients = $derived(
    (slotA ? 1 : 0) + (slotB ? 1 : 0) + auxiliaryCount
  );

  let totalIngredientPoints = $derived(
    calculateIngredientPoints(totalIngredients)
  );

  let workHours = $derived(
    calculateWorkHours(totalIngredientPoints)
  );

  let needsLab = $derived(
    requiresStrongholdLab(totalIngredientPoints)
  );

  let isBlockedByLab = $derived(
    needsLab && !hasStrongholdLab
  );

  // Evaluated recipe
  let activeRecipe = $derived<AlchemyRecipe | null>(
    slotA && slotB ? lookupEssenceCombination(slotA, slotB) : null
  );

  function clearCrucible() {
    slotA = null;
    slotB = null;
    auxiliaryCount = 0;
    brewSuccessMessage = null;
  }

  function handleSlotSelect(slot: 'A' | 'B', type: ElementalType) {
    if (slot === 'A') slotA = type;
    else slotB = type;
    audioEngine.triggerSfx('sfx-dice');
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
  }

  function handleDropSlot(e: DragEvent, slot: 'A' | 'B') {
    e.preventDefault();
    const type = e.dataTransfer?.getData('application/essence-type') as ElementalType;
    if (type && ESSENCE_REGISTRY[type]) {
      handleSlotSelect(slot, type);
    }
  }

  function handleDragStartEssence(e: DragEvent, type: ElementalType) {
    e.dataTransfer?.setData('application/essence-type', type);
  }

  function brewConcoction() {
    if (!activeRecipe || isBlockedByLab) return;

    isBrewing = true;
    audioEngine.triggerSfx('sfx-spell');

    setTimeout(() => {
      // 1. Add brewed potion/bomb to party stash
      const item: Partial<PartyStashItem> & { name: string } = {
        name: activeRecipe.name,
        category: activeRecipe.category,
        quantity: 1,
        weight: 0.5,
        description: `${activeRecipe.description} [${activeRecipe.damage ? activeRecipe.damage + ' | ' : ''}${activeRecipe.saveDc ? 'DC ' + activeRecipe.saveDc + ' ' + activeRecipe.saveType + ' | ' : ''}${activeRecipe.radiusFeet ? activeRecipe.radiusFeet + 'ft radius | ' : ''}Rarity: ${activeRecipe.rarity}]`,
        valueGp: activeRecipe.valueGp,
      };

      sessionStore.addItemToPartyStash(item);

      // 2. Advance calendar hours if calendar storage exists
      try {
        const rawCal = localStorage.getItem('vtt_calendar_config');
        if (rawCal) {
          const cal = JSON.parse(rawCal);
          cal.currentHour = (cal.currentHour + workHours) % 24;
          if (cal.currentHour < workHours) {
            cal.currentDay += 1;
          }
          localStorage.setItem('vtt_calendar_config', JSON.stringify(cal));
        }
      } catch {
        // ignore
      }

      brewSuccessMessage = `Successfully brewed ${activeRecipe.name}! Deposited into Party Stash. Advanced campaign by ${workHours} hours.`;
      isBrewing = false;
      audioEngine.triggerSfx('sfx-secret');
    }, 600);
  }
</script>

<div class="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden select-none">

  <!-- Header -->
  <header class="px-6 py-3.5 border-b border-slate-800 bg-slate-900/80 shrink-0 flex items-center justify-between">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-rose-500/20 border border-amber-500/30 flex items-center justify-center text-xl shadow-md">
        ⚗️
      </div>
      <div>
        <h1 class="text-base font-black text-slate-100 uppercase tracking-wide flex items-center gap-2">
          <span>Alchemy Lab &amp; Essence Matrix</span>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-indigo-950 text-indigo-300 border border-indigo-700/60 font-mono">
            28-Essence Engine
          </span>
        </h1>
        <p class="text-xs text-slate-400">
          Combine harvested monster essences and elemental reagents to formulate bombs, toxins, and elixirs.
        </p>
      </div>
    </div>

    <!-- Stronghold Lab Status Indicator -->
    <div class="flex items-center gap-2">
      <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold {hasStrongholdLab
        ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700/50'
        : 'bg-amber-950/60 text-amber-300 border-amber-700/50'}">
        <span>{hasStrongholdLab ? '🏰 Stronghold Lab Owned' : '🏕️ Field Camp Kit (≤25 Pts Only)'}</span>
      </div>
      <button
        onclick={clearCrucible}
        class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
      >
        Clear Crucible
      </button>
    </div>
  </header>

  <!-- Main Grid -->
  <div class="flex-1 flex min-h-0 overflow-hidden">

    <!-- Left: Essence Palette -->
    <aside class="w-80 border-r border-slate-800 bg-slate-900/40 flex flex-col shrink-0 p-4 space-y-3 overflow-y-auto">
      <div class="flex items-center justify-between">
        <h2 class="text-xs font-bold uppercase tracking-wider text-slate-400">Elemental Reagents (8)</h2>
        <span class="text-[10px] text-slate-500">Drag or Click to Slot</span>
      </div>

      <div class="grid grid-cols-1 gap-2">
        {#each Object.values(ESSENCE_REGISTRY) as ess}
          <div
            role="button"
            tabindex="0"
            draggable="true"
            ondragstart={(e) => handleDragStartEssence(e, ess.type)}
            onclick={() => {
              if (!slotA) slotA = ess.type;
              else if (!slotB) slotB = ess.type;
              else slotB = ess.type;
              audioEngine.triggerSfx('sfx-dice');
            }}
            onkeydown={(e) => { if (e.key === 'Enter') handleSlotSelect('A', ess.type); }}
            class="p-2.5 rounded-xl border transition-all cursor-pointer flex items-center gap-3 bg-slate-900/80 border-slate-800 hover:border-slate-700 hover:bg-slate-850 group"
          >
            <div class="w-8 h-8 rounded-lg flex items-center justify-center text-lg shrink-0 border {ess.bgBadge} {ess.borderBadge}">
              {ess.symbol}
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold {ess.textColor} group-hover:brightness-110">{ess.name}</span>
                <span class="text-[9px] font-mono uppercase text-slate-500">{ess.type}</span>
              </div>
              <p class="text-[10px] text-slate-500 truncate mt-0.5">{ess.sourceDescription}</p>
            </div>
          </div>
        {/each}
      </div>

      <!-- Formula reference box -->
      <div class="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1.5 text-[11px] text-slate-400">
        <div class="font-bold text-slate-300 uppercase text-[10px] tracking-wider">Aleamos Crafting Rules</div>
        <div class="flex justify-between">
          <span>First Ingredient:</span>
          <span class="font-mono text-indigo-300 font-bold">10 pts</span>
        </div>
        <div class="flex justify-between">
          <span>Each Extra Ingredient:</span>
          <span class="font-mono text-indigo-300 font-bold">+15 pts</span>
        </div>
        <div class="flex justify-between">
          <span>Work Session:</span>
          <span class="font-mono text-amber-300 font-bold">4 hrs / 25 pts</span>
        </div>
        <div class="flex justify-between">
          <span>Camp Limit:</span>
          <span class="font-mono text-emerald-400 font-bold">≤ 25 pts</span>
        </div>
        <div class="flex justify-between">
          <span>Complex (>25 pts):</span>
          <span class="font-mono text-rose-400 font-bold">Requires Lab</span>
        </div>
      </div>
    </aside>

    <!-- Center: Interactive Reaction Crucible -->
    <main class="flex-1 flex flex-col p-6 overflow-y-auto space-y-6">

      <!-- Slots Container -->
      <div class="flex items-center justify-center gap-6 py-6 px-4 rounded-3xl bg-slate-900/50 border border-slate-800 relative overflow-hidden">
        
        <!-- Slot A -->
        <div
          role="region"
          aria-label="Catalyst Slot A"
          ondragover={handleDragOver}
          ondrop={(e) => handleDropSlot(e, 'A')}
          class="flex flex-col items-center gap-2"
        >
          <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Primary Catalyst (Slot A)</span>
          <div class="w-28 h-28 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center p-3 text-center transition-all {slotA
            ? 'border-indigo-500 bg-indigo-950/30'
            : 'border-slate-700 bg-slate-950/60 hover:border-slate-600'}">
            {#if slotA}
              {@const ess = ESSENCE_REGISTRY[slotA]}
              <span class="text-3xl mb-1">{ess.symbol}</span>
              <span class="text-xs font-bold {ess.textColor} truncate w-full">{ess.name}</span>
              <button
                onclick={() => slotA = null}
                class="mt-1 text-[9px] text-rose-400 hover:text-rose-300 uppercase font-semibold"
              >
                Remove
              </button>
            {:else}
              <span class="text-2xl text-slate-600 mb-1">➕</span>
              <span class="text-[10px] text-slate-500 font-semibold">Drop Reagent</span>
            {/if}
          </div>
        </div>

        <!-- Synthesis Operator -->
        <div class="flex flex-col items-center justify-center px-2">
          <span class="text-2xl font-black text-slate-600">+</span>
          <span class="text-[9px] font-mono text-slate-600 uppercase mt-1">Synthesis</span>
        </div>

        <!-- Slot B -->
        <div
          role="region"
          aria-label="Reagent Slot B"
          ondragover={handleDragOver}
          ondrop={(e) => handleDropSlot(e, 'B')}
          class="flex flex-col items-center gap-2"
        >
          <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Secondary Reagent (Slot B)</span>
          <div class="w-28 h-28 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center p-3 text-center transition-all {slotB
            ? 'border-indigo-500 bg-indigo-950/30'
            : 'border-slate-700 bg-slate-950/60 hover:border-slate-600'}">
            {#if slotB}
              {@const ess = ESSENCE_REGISTRY[slotB]}
              <span class="text-3xl mb-1">{ess.symbol}</span>
              <span class="text-xs font-bold {ess.textColor} truncate w-full">{ess.name}</span>
              <button
                onclick={() => slotB = null}
                class="mt-1 text-[9px] text-rose-400 hover:text-rose-300 uppercase font-semibold"
              >
                Remove
              </button>
            {:else}
              <span class="text-2xl text-slate-600 mb-1">➕</span>
              <span class="text-[10px] text-slate-500 font-semibold">Drop Reagent</span>
            {/if}
          </div>
        </div>

        <!-- Auxiliary Stabilizer Counter -->
        <div class="w-px h-24 bg-slate-800 mx-2"></div>

        <div class="flex flex-col items-center gap-2">
          <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Auxiliary Stabilizers</span>
          <div class="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl p-1.5">
            <button
              onclick={() => { if (auxiliaryCount > 0) auxiliaryCount--; }}
              class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold flex items-center justify-center"
            >
              -
            </button>
            <span class="w-8 text-center font-mono font-bold text-sm text-indigo-300">+{auxiliaryCount}</span>
            <button
              onclick={() => auxiliaryCount++}
              class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold flex items-center justify-center"
            >
              +
            </button>
          </div>
          <span class="text-[9px] text-slate-500">+15 pts each</span>
        </div>

      </div>

      <!-- Result Card -->
      {#if activeRecipe}
        <div class="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl space-y-4">
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-2xl bg-indigo-950 border border-indigo-700/60 flex items-center justify-center text-2xl shadow-md">
                {activeRecipe.icon}
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <h3 class="text-lg font-black text-slate-100">{activeRecipe.name}</h3>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-indigo-950 text-indigo-300 border-indigo-700/50">
                    {activeRecipe.category}
                  </span>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-800 text-slate-300 border border-slate-700">
                    {activeRecipe.rarity}
                  </span>
                </div>
                <p class="text-xs text-slate-400 mt-0.5">{activeRecipe.description}</p>
              </div>
            </div>

            <!-- Value Badge -->
            <div class="text-right">
              <span class="text-base font-black text-amber-300 font-mono">{activeRecipe.valueGp} gp</span>
              <div class="text-[10px] text-slate-500 uppercase font-bold">Standard Value</div>
            </div>
          </div>

          <!-- Technical Specs Grid -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-800/80 text-xs">
            <div class="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
              <span class="text-[10px] font-bold uppercase text-slate-500 block">Total Points</span>
              <span class="text-sm font-bold font-mono text-indigo-300">{totalIngredientPoints} pts</span>
            </div>
            <div class="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
              <span class="text-[10px] font-bold uppercase text-slate-500 block">Crafting Time</span>
              <span class="text-sm font-bold font-mono text-amber-300">{workHours} Hours</span>
            </div>
            <div class="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
              <span class="text-[10px] font-bold uppercase text-slate-500 block">Potency / Damage</span>
              <span class="text-sm font-bold text-rose-300 truncate block">{activeRecipe.damage || activeRecipe.duration || 'Special'}</span>
            </div>
            <div class="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
              <span class="text-[10px] font-bold uppercase text-slate-500 block">Save DC / Radius</span>
              <span class="text-sm font-bold text-sky-300 truncate block">
                {activeRecipe.saveDc ? `DC ${activeRecipe.saveDc} ${activeRecipe.saveType}` : 'No Save'}
                {activeRecipe.radiusFeet ? ` (${activeRecipe.radiusFeet}ft)` : ''}
              </span>
            </div>
          </div>

          <!-- Warnings & Constraints -->
          {#if isBlockedByLab}
            <div class="p-3 rounded-2xl bg-rose-950/60 border border-rose-700/60 text-xs text-rose-300 flex items-center gap-2 font-semibold">
              <span>⚠️</span>
              <span>Complex Brew ({totalIngredientPoints} pts): Exceeds 25 points. Requires an owned Stronghold Alchemical Laboratory to stabilize!</span>
            </div>
          {:else if needsLab}
            <div class="p-3 rounded-2xl bg-emerald-950/60 border border-emerald-700/60 text-xs text-emerald-300 flex items-center gap-2 font-semibold">
              <span>✅</span>
              <span>Complex Brew ({totalIngredientPoints} pts): Stabilized by your Stronghold Alchemical Laboratory.</span>
            </div>
          {:else}
            <div class="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-400 flex items-center gap-2 font-semibold">
              <span>🏕️</span>
              <span>Simple Brew ({totalIngredientPoints} pts): Safe to formulate in field camp or portable alchemy kit.</span>
            </div>
          {/if}

          <!-- Success Message -->
          {#if brewSuccessMessage}
            <div class="p-3 rounded-2xl bg-emerald-950 border border-emerald-500 text-xs text-emerald-200 font-bold flex items-center gap-2">
              <span>✨</span>
              <span>{brewSuccessMessage}</span>
            </div>
          {/if}

          <!-- Brew Button -->
          <div class="flex items-center justify-end pt-2">
            <button
              onclick={brewConcoction}
              disabled={isBlockedByLab || isBrewing}
              class="px-6 py-3 rounded-2xl bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 disabled:opacity-40 text-white font-black text-sm uppercase tracking-wide transition-all shadow-xl shadow-rose-950/50 flex items-center gap-2"
            >
              <span>{isBrewing ? '⚗️ Formulating...' : '🔥 Brew Concoction'}</span>
            </button>
          </div>
        </div>
      {:else}
        <div class="flex-1 flex flex-col items-center justify-center text-center p-12 text-slate-600 border border-dashed border-slate-800 rounded-3xl">
          <span class="text-4xl mb-2">⚗️</span>
          <p class="text-sm font-semibold text-slate-400">Crucible Incomplete</p>
          <p class="text-xs max-w-sm mt-1">Select a Primary Catalyst and a Secondary Reagent from the palette to evaluate the reaction product.</p>
        </div>
      {/if}

    </main>

  </div>

</div>
