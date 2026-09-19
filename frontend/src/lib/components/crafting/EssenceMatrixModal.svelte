<script lang="ts">
  import { onMount } from 'svelte';
  import type { ElementalEssence, ItemSocket, CraftingEvaluation } from '../../../types/crafting';
  import { dispatchSoundEvent } from '../../audio/soundboardBridge';
  import Icons from '../../../components/Icons.svelte';

  export interface CraftableEquipment {
    id: string;
    name: string;
    type: 'weapon' | 'armor';
    max_sockets: number; // 1-2 for weapons, 1-3 for armor
    base_ac_or_damage: string;
  }

  let {
    isOpen = $bindable(false),
    onClose,
  }: {
    isOpen: boolean;
    onClose?: () => void;
  } = $props();

  const SAMPLE_ITEMS: CraftableEquipment[] = [
    { id: 'eq-longsword', name: 'Valyrian Steel Longsword', type: 'weapon', max_sockets: 2, base_ac_or_damage: '1d8 Slashing' },
    { id: 'eq-greatsword', name: 'Runic Zweihander', type: 'weapon', max_sockets: 2, base_ac_or_damage: '2d6 Slashing' },
    { id: 'eq-crossbow', name: 'Heavy Siege Crossbow', type: 'weapon', max_sockets: 1, base_ac_or_damage: '1d10 Piercing' },
    { id: 'eq-plate', name: 'Bulwark Full Plate', type: 'armor', max_sockets: 3, base_ac_or_damage: '18 Base AC' },
    { id: 'eq-cuirass', name: 'Dunewarden Chainmail', type: 'armor', max_sockets: 2, base_ac_or_damage: '16 Base AC' },
    { id: 'eq-leather', name: 'Shadow-Stalker Studded Leather', type: 'armor', max_sockets: 2, base_ac_or_damage: '12 + Dex AC' },
  ];

  let selectedItem = $state<CraftableEquipment>(SAMPLE_ITEMS[0]);
  let essences = $state<ElementalEssence[]>([]);
  let slottedEssenceIds = $state<(string | null)[]>([null, null]);
  let hasAlchemicalLab = $state(true); // Player Stronghold facility state
  let essenceSearch = $state('');
  let activeCategory = $state('All');
  let isSaving = $state(false);
  let feedbackMessage: { text: string; isError: boolean } | null = $state(null);

  const CATEGORIES = [
    'All',
    'Primary Elemental',
    'Para-Elemental',
    'Quasi-Elemental',
    'Planar Arcane',
    'Alchemical',
  ];

  onMount(async () => {
    await fetchEssences();
  });

  async function fetchEssences() {
    try {
      const res = await fetch('/api/crafting/essences');
      if (res.ok) {
        const data = await res.json();
        essences = data.essences;
      }
    } catch (err) {
      console.error('Failed fetching elemental essences:', err);
    }
  }

  // Adjust slots when item changes
  $effect(() => {
    const currentSlots = slottedEssenceIds;
    if (currentSlots.length !== selectedItem.max_sockets) {
      const newSlots: (string | null)[] = [];
      for (let i = 0; i < selectedItem.max_sockets; i++) {
        newSlots.push(currentSlots[i] ?? null);
      }
      slottedEssenceIds = newSlots;
    }
  });

  // Derived active slotted essences
  let activeSlottedEssences = $derived(
    slottedEssenceIds
      .map((id) => (id ? essences.find((e) => e.id === id) ?? null : null))
      .filter((e): e is ElementalEssence => e !== null)
  );

  // Crafting Math Engine (Strict full formula implementation):
  // Base cost: 10 points for the 1st ingredient, 15 points for each additional ingredient.
  // Stability Check: Breaches exceeding 25 total ingredient points require an owned Stronghold Alchemical Laboratory facility.
  let evaluation = $derived<CraftingEvaluation>(() => {
    const count = activeSlottedEssences.length;
    const totalPoints = count === 0 ? 0 : 10 + (count - 1) * 15;
    const requiresLab = totalPoints > 25;

    let isStable = true;
    let volatilityRisk = 0;

    if (requiresLab) {
      if (!hasAlchemicalLab) {
        isStable = false;
        volatilityRisk = Math.min(100, (totalPoints - 25) * 10);
      }
    }

    const weaponBonuses: string[] = [];
    const armorReductions: string[] = [];

    for (const ess of activeSlottedEssences) {
      weaponBonuses.push(`+${ess.weapon_bonus_dice} ${ess.weapon_damage_type}`);
      const red = ess.armor_reduction_type === 'PB'
        ? `PB Reduction vs ${ess.armor_damage_type}`
        : `Full Resistance to ${ess.armor_damage_type}`;
      armorReductions.push(red);
    }

    let summary = 'Matrix Empty: Insert elemental essences into item sockets.';
    if (count > 0) {
      if (!isStable) {
        summary = `CRITICAL VOLATILITY (${totalPoints} pts): Exceeds 25 points without an active Stronghold Alchemical Laboratory! ${volatilityRisk}% failure risk on weapon strike or armor impact.`;
      } else if (requiresLab) {
        summary = `Complex Resonance (${totalPoints} pts): Stabilized by Stronghold Alchemical Laboratory containment field.`;
      } else {
        summary = `Stable Matrix (${totalPoints} pts): Standard field containment intact.`;
      }
    }

    return {
      total_ingredient_points: totalPoints,
      is_stable: isStable,
      requires_alchemical_lab: requiresLab,
      volatility_risk_percent: volatilityRisk,
      projected_weapon_damage_bonuses: weaponBonuses,
      projected_armor_reductions: armorReductions,
      summary_message: summary,
    };
  });

  function slotEssenceIntoIndex(essenceId: string, socketIndex: number) {
    if (socketIndex >= slottedEssenceIds.length) return;
    const updated = [...slottedEssenceIds];
    updated[socketIndex] = essenceId;
    slottedEssenceIds = updated;
    dispatchSoundEvent('potion');
  }

  function unslotIndex(socketIndex: number) {
    if (socketIndex >= slottedEssenceIds.length) return;
    const updated = [...slottedEssenceIds];
    updated[socketIndex] = null;
    slottedEssenceIds = updated;
    dispatchSoundEvent('item_broken');
  }

  function handleAutoSlot(essence: ElementalEssence) {
    const emptyIndex = slottedEssenceIds.findIndex((id) => id === null);
    if (emptyIndex !== -1) {
      slotEssenceIntoIndex(essence.id, emptyIndex);
    } else {
      // Overwrite first socket if full
      slotEssenceIntoIndex(essence.id, 0);
    }
  }

  function handleDragStartEssence(e: DragEvent, essence: ElementalEssence) {
    if (!e.dataTransfer) return;
    e.dataTransfer.setData('application/json', JSON.stringify({ essenceId: essence.id }));
    e.dataTransfer.effectAllowed = 'copy';
  }

  function handleDropOnSocket(e: DragEvent, socketIndex: number) {
    e.preventDefault();
    if (!e.dataTransfer) return;
    const raw = e.dataTransfer.getData('application/json');
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      if (data.essenceId) {
        slotEssenceIntoIndex(data.essenceId, socketIndex);
      }
    } catch (err) {
      console.error('Error parsing dropped essence:', err);
    }
  }

  async function handleCommitCrafting() {
    isSaving = true;
    feedbackMessage = null;
    try {
      for (let idx = 0; idx < slottedEssenceIds.length; idx++) {
        await fetch('/api/crafting/socket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            item_id: selectedItem.id,
            socket_index: idx,
            essence_id: slottedEssenceIds[idx],
          }),
        });
      }
      dispatchSoundEvent('critical_hit');
      feedbackMessage = {
        text: `Successfully infused ${selectedItem.name} with ${activeSlottedEssences.length} elemental essences.`,
        isError: false,
      };
    } catch (err) {
      feedbackMessage = {
        text: `Socketing failure: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    } finally {
      isSaving = false;
    }
  }

  let filteredEssences = $derived(
    essences.filter((e) => {
      const matchCat = activeCategory === 'All' || e.category.includes(activeCategory);
      const matchSearch =
        e.name.toLowerCase().includes(essenceSearch.toLowerCase()) ||
        e.weapon_damage_type.toLowerCase().includes(essenceSearch.toLowerCase()) ||
        e.armor_damage_type.toLowerCase().includes(essenceSearch.toLowerCase());
      return matchCat && matchSearch;
    })
  );
</script>

{#if isOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md">
    <div class="bg-dark-900 border border-dark-700/90 rounded-3xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
      <!-- Header -->
      <div class="px-6 py-4 bg-dark-950 border-b border-dark-800 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Icons name="sparkles" size={22} />
          </div>
          <div>
            <h2 class="text-base font-black text-slate-100 uppercase tracking-tight">
              Component Slot &amp; Essence Crafting Matrix
            </h2>
            <p class="text-xs text-slate-400">
              Infuse weapons (1-2 sockets) and armor (1-3 sockets) with primordial essences.
            </p>
          </div>
        </div>

        <button
          onclick={() => {
            isOpen = false;
            if (onClose) onClose();
          }}
          class="w-8 h-8 rounded-xl bg-dark-800 hover:bg-dark-700 border border-dark-700 text-slate-300 flex items-center justify-center text-sm font-bold transition-colors"
        >
          &times;
        </button>
      </div>

      <!-- Main Body: Two Columns -->
      <div class="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <!-- Left Column: Equipment & Sockets (5 cols) -->
        <div class="lg:col-span-5 space-y-5">
          <!-- Item Selection -->
          <div class="bg-dark-950/80 border border-dark-800 rounded-2xl p-4">
            <label for="crafting-equipment-select" class="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-2">
              Select Base Equipment
            </label>
            <select
              id="crafting-equipment-select"
              bind:value={selectedItem}
              class="w-full bg-dark-900 border border-dark-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-100 focus:outline-none focus:border-amber-500"
            >
              {#each SAMPLE_ITEMS as item}
                <option value={item}>
                  {item.name} ({item.type === 'weapon' ? 'Weapon' : 'Armor'} &bull; {item.max_sockets} Sockets &bull; {item.base_ac_or_damage})
                </option>
              {/each}
            </select>

            <div class="mt-3 flex items-center justify-between text-xs text-slate-400">
              <span>Category: <strong class="text-slate-200 capitalize">{selectedItem.type}</strong></span>
              <span>Capacity: <strong class="text-amber-400">{selectedItem.max_sockets} Sockets</strong></span>
              <span>Base: <strong class="text-slate-200">{selectedItem.base_ac_or_damage}</strong></span>
            </div>
          </div>

          <!-- Socket Slots -->
          <div class="bg-dark-950/80 border border-dark-800 rounded-2xl p-4">
            <h3 class="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center justify-between">
              <span>Equipment Sockets ({slottedEssenceIds.length})</span>
              <span class="text-[10px] text-slate-500">Drag or click essences to slot</span>
            </h3>

            <div class="space-y-3">
              {#each slottedEssenceIds as essenceId, idx}
                {@const slotted = essenceId ? essences.find((e) => e.id === essenceId) : null}
                <div
                  role="region"
                  aria-label={`Socket Slot ${idx + 1}`}
                  ondragover={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
                  }}
                  ondrop={(e) => handleDropOnSocket(e, idx)}
                  class="rounded-xl p-3 border transition-all {
                    slotted
                      ? 'bg-dark-900 border-amber-500/60 shadow-md shadow-amber-500/10'
                      : 'bg-dark-900/40 border-dashed border-dark-700 hover:border-dark-600'
                  }"
                >
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2.5">
                      <div class="w-8 h-8 rounded-lg flex items-center justify-center font-mono font-bold text-xs {
                        slotted ? 'bg-amber-500 text-black' : 'bg-dark-800 text-slate-500 border border-dark-700'
                      }">
                        S{idx + 1}
                      </div>

                      <div>
                        {#if slotted}
                          <div class="flex items-center gap-1.5">
                            <span class="font-bold text-xs text-slate-100">{slotted.name}</span>
                            <span class="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px] font-bold">
                              {slotted.ingredient_points} pts
                            </span>
                          </div>
                          <p class="text-[10px] text-slate-400 mt-0.5">
                            {#if selectedItem.type === 'weapon'}
                              +{slotted.weapon_bonus_dice} {slotted.weapon_damage_type} Damage
                            {:else}
                              {slotted.armor_reduction_type === 'PB' ? 'PB' : 'Full'} {slotted.armor_damage_type} Reduction
                            {/if}
                          </p>
                        {:else}
                          <span class="text-xs text-slate-500 italic">Empty Socket (Drop essence here)</span>
                        {/if}
                      </div>
                    </div>

                    {#if slotted}
                      <button
                        onclick={() => unslotIndex(idx)}
                        class="p-1 rounded-lg hover:bg-dark-800 text-slate-400 hover:text-red-400 transition-colors"
                        aria-label="Remove slotted essence"
                      >
                        <Icons name="alert-triangle" size={14} />
                      </button>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          </div>

          <!-- Stability & Crafting Math Engine Results -->
          <div class="bg-dark-950/80 border border-dark-800 rounded-2xl p-4 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Matrix Math &amp; Stability
              </span>
              <span class="font-mono text-xs font-black {
                evaluation.is_stable ? 'text-emerald-400' : 'text-red-400 animate-pulse'
              }">
                {evaluation.total_ingredient_points} / 25 Max Safe Points
              </span>
            </div>

            <!-- Stability Progress Gauge -->
            <div class="w-full h-2.5 rounded-full bg-dark-900 border border-dark-700 overflow-hidden">
              <div
                class="h-full rounded-full transition-all duration-300 {
                  evaluation.total_ingredient_points <= 10
                    ? 'bg-emerald-500'
                    : evaluation.total_ingredient_points <= 25
                    ? 'bg-amber-500'
                    : 'bg-red-600'
                }"
                style="width: {Math.min(100, (evaluation.total_ingredient_points / 40) * 100)}%"
              ></div>
            </div>

            <!-- Stronghold Facility Check Toggle -->
            <div class="flex items-center justify-between pt-1 text-xs">
              <span class="text-slate-400">Stronghold Alchemical Laboratory:</span>
              <button
                onclick={() => (hasAlchemicalLab = !hasAlchemicalLab)}
                class="px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all {
                  hasAlchemicalLab
                    ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
                    : 'bg-dark-900 border-dark-700 text-slate-400'
                }"
              >
                {hasAlchemicalLab ? 'Owned (Tier 1)' : 'Not Owned'}
              </button>
            </div>

            <!-- Status Banner -->
            <p class="text-[11px] leading-relaxed p-2.5 rounded-xl border {
              evaluation.is_stable
                ? 'bg-dark-900/90 border-dark-700 text-slate-300'
                : 'bg-red-950/80 border-red-500/80 text-red-200'
            }">
              {evaluation.summary_message}
            </p>

            <!-- Projected Stats Summary -->
            {#if activeSlottedEssences.length > 0}
              <div class="p-2.5 bg-dark-900 rounded-xl border border-dark-750 text-xs space-y-1">
                <span class="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                  Projected Infusion Bonuses
                </span>
                {#if selectedItem.type === 'weapon'}
                  {#each evaluation.projected_weapon_damage_bonuses as bonus}
                    <div class="text-slate-200 font-semibold flex items-center gap-1">
                      <Icons name="sword" size={12} class="text-amber-400" /> {bonus}
                    </div>
                  {/each}
                {:else}
                  {#each evaluation.projected_armor_reductions as red}
                    <div class="text-slate-200 font-semibold flex items-center gap-1">
                      <Icons name="shield" size={12} class="text-blue-400" /> {red}
                    </div>
                  {/each}
                {/if}
              </div>
            {/if}

            <!-- Commit Button -->
            <button
              onclick={handleCommitCrafting}
              disabled={isSaving || activeSlottedEssences.length === 0}
              class="w-full py-2.5 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:opacity-50 text-black font-black uppercase tracking-wider text-xs rounded-xl transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
            >
              {#if isSaving}
                <Icons name="refresh" size={16} class="animate-spin" /> Infusing Matrix...
              {:else}
                <Icons name="check" size={16} /> Seal &amp; Infuse Sockets
              {/if}
            </button>

            {#if feedbackMessage}
              <div class="p-2 rounded-xl text-xs font-semibold text-center border {
                feedbackMessage.isError
                  ? 'bg-red-950 border-red-500 text-red-200'
                  : 'bg-emerald-950 border-emerald-500 text-emerald-200'
              }">
                {feedbackMessage.text}
              </div>
            {/if}
          </div>
        </div>

        <!-- Right Column: 28 Elemental Essences Catalog (7 cols) -->
        <div class="lg:col-span-7 flex flex-col space-y-4">
          <div class="bg-dark-950/80 border border-dark-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <h3 class="text-xs font-black text-slate-100 uppercase tracking-wider">
                Elemental Essences Catalog (28)
              </h3>
              <p class="text-[11px] text-slate-400">
                Formula: 10 pts first ingredient &bull; +15 pts per additional ingredient
              </p>
            </div>

            <input
              type="text"
              aria-label="Filter elemental essences by name or damage type"
              bind:value={essenceSearch}
              class="px-3 py-1.5 bg-dark-900 border border-dark-700 rounded-xl text-xs text-slate-200 w-full sm:w-48 focus:outline-none focus:border-amber-500"
            />
          </div>

          <!-- Category Filters -->
          <div class="flex items-center gap-1.5 overflow-x-auto pb-1">
            {#each CATEGORIES as cat}
              <button
                onclick={() => (activeCategory = cat)}
                class="px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all {
                  activeCategory === cat
                    ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                    : 'bg-dark-900 hover:bg-dark-800 text-slate-400 border border-dark-800'
                }"
              >
                {cat}
              </button>
            {/each}
          </div>

          <!-- Essences Grid -->
          <div class="flex-1 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-3 pr-1 max-h-[500px]">
            {#each filteredEssences as ess}
              <div
                draggable="true"
                role="button"
                tabindex="0"
                ondragstart={(e) => handleDragStartEssence(e, ess)}
                class="bg-dark-950/80 border border-dark-800 hover:border-amber-500/60 rounded-xl p-3 flex flex-col justify-between transition-all cursor-grab active:cursor-grabbing group shadow-sm select-none"
              >
                <div>
                  <div class="flex items-start justify-between gap-1 mb-1">
                    <h4 class="font-bold text-xs text-slate-100 group-hover:text-amber-400 transition-colors">
                      {ess.name}
                    </h4>
                    <span class="px-1.5 py-0.5 rounded bg-dark-800 border border-dark-700 text-amber-300 font-mono text-[10px] font-bold">
                      {ess.ingredient_points} pts
                    </span>
                  </div>

                  <span class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                    {ess.category} &bull; Tier {ess.tier}
                  </span>

                  <p class="text-[11px] text-slate-400 line-clamp-2 leading-relaxed mb-2">
                    {ess.description}
                  </p>
                </div>

                <div class="pt-2 border-t border-dark-850 flex items-center justify-between text-[11px]">
                  <span class="text-slate-300 font-mono">
                    W: <strong class="text-amber-300">+{ess.weapon_bonus_dice} {ess.weapon_damage_type}</strong>
                  </span>
                  <button
                    onclick={() => handleAutoSlot(ess)}
                    class="px-2 py-0.5 bg-dark-800 hover:bg-amber-500 hover:text-black border border-dark-700 rounded text-[10px] font-bold text-slate-300 transition-colors"
                  >
                    + Slot
                  </button>
                </div>
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}
