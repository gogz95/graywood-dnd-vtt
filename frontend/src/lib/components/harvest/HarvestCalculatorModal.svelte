<!-- HarvestCalculatorModal.svelte — Interactive Monster Harvesting, Extraction DC, and Field Dressing -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { audioEngine } from '../../audio/AudioEngine';
  import { sessionStore } from '../../../stores/sessionStore';
  import {
    calculateHarvestDC,
    calculateDressMinutes,
    formatDressMinutes,
    getRecommendedSkill,
    generatePotentialYields,
    calculateAppraisalPayout,
    getCalendarTotalHours,
    type CreatureSize,
    type HarvestSkill,
    type HarvestYieldItem,
  } from '../../harvest/harvestEngine';

  let {
    isOpen = $bindable(false),
    combatant = null,
    onClose,
  }: {
    isOpen: boolean;
    combatant?: {
      name: string;
      is_monster?: boolean;
      hp_max?: number;
      hp_current?: number;
    } | null;
    onClose?: () => void;
  } = $props();

  const SIZES: CreatureSize[] = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];
  const SKILLS: HarvestSkill[] = ['Nature', 'Survival', 'Arcana', 'Medicine'];

  // Extraction State
  let creatureName = $state('Fell Direwolf');
  let creatureType = $state('Beast');
  let creatureCr = $state(3);
  let creatureSize = $state<CreatureSize>('Large');
  let selectedSkill = $state<HarvestSkill>('Nature');
  let skillBonus = $state(5);
  let manualRoll = $state<number | null>(null);
  let appraisalDamagePercent = $state(0); // 0% to 50% damage penalty slider
  let isHarvestCommitted = $state(false);

  // Auto-fill from selected combatant
  $effect(() => {
    if (combatant) {
      creatureName = combatant.name;
      // Infer CR and size from name or hp if available
      const norm = combatant.name.toLowerCase();
      if (norm.includes('dragon')) {
        creatureType = 'Dragon';
        creatureSize = 'Huge';
        creatureCr = 10;
        selectedSkill = 'Arcana';
      } else if (norm.includes('elemental')) {
        creatureType = 'Elemental';
        creatureSize = 'Large';
        creatureCr = 5;
        selectedSkill = 'Arcana';
      } else if (norm.includes('zombie') || norm.includes('skeleton') || norm.includes('ghoul') || norm.includes('vampire')) {
        creatureType = 'Undead';
        creatureSize = 'Medium';
        creatureCr = 3;
        selectedSkill = 'Medicine';
      } else if (norm.includes('fiend') || norm.includes('demon') || norm.includes('devil')) {
        creatureType = 'Fiend';
        creatureSize = 'Large';
        creatureCr = 6;
        selectedSkill = 'Medicine';
      } else {
        creatureType = 'Beast';
        creatureSize = combatant.hp_max && combatant.hp_max > 80 ? 'Large' : 'Medium';
        creatureCr = Math.max(1, Math.floor((combatant.hp_max ?? 30) / 15));
        selectedSkill = 'Nature';
      }
      manualRoll = null;
      isHarvestCommitted = false;
    }
  });

  // Derived Calculations
  let recommendedSkill = $derived(getRecommendedSkill(creatureType));

  let dcBySkill = $derived<Record<HarvestSkill, number>>({
    Nature: calculateHarvestDC(creatureCr, creatureSize, 'Nature', creatureType),
    Survival: calculateHarvestDC(creatureCr, creatureSize, 'Survival', creatureType),
    Arcana: calculateHarvestDC(creatureCr, creatureSize, 'Arcana', creatureType),
    Medicine: calculateHarvestDC(creatureCr, creatureSize, 'Medicine', creatureType),
  });

  let activeDc = $derived(dcBySkill[selectedSkill]);
  let dressMinutes = $derived(calculateDressMinutes(creatureSize, creatureCr));
  let formattedDressTime = $derived(formatDressMinutes(dressMinutes));

  let yields = $derived(generatePotentialYields(creatureName, creatureType, creatureCr, creatureSize));

  // Roll Evaluation
  let effectiveTotal = $derived(manualRoll !== null ? manualRoll + skillBonus : null);
  let isSuccess = $derived(effectiveTotal !== null && effectiveTotal >= activeDc);
  let isCriticalSuccess = $derived(manualRoll === 20 || (effectiveTotal !== null && effectiveTotal >= activeDc + 5));

  function rollCheck() {
    const d20 = Math.floor(Math.random() * 20) + 1;
    manualRoll = d20;
    if (d20 === 20 || d20 + skillBonus >= activeDc) {
      audioEngine.triggerSfx('sfx-dice');
    } else {
      audioEngine.triggerSfx('sfx-rest');
    }
  }

  function getCalendarHours(): number {
    try {
      const raw = localStorage.getItem('vtt_calendar_config');
      if (raw) {
        const cal = JSON.parse(raw);
        return getCalendarTotalHours(cal);
      }
    } catch {
      // fallback
    }
    return 24 * 10 + 8; // Default Day 10, 08:00
  }

  function advanceCalendarHours(minutes: number) {
    try {
      const raw = localStorage.getItem('vtt_calendar_config');
      if (raw) {
        const cal = JSON.parse(raw);
        let totalMin = cal.currentHour * 60 + cal.currentMinute + minutes;
        const daysToAdd = Math.floor(totalMin / 1440);
        totalMin = totalMin % 1440;
        cal.currentHour = Math.floor(totalMin / 60);
        cal.currentMinute = totalMin % 60;
        if (daysToAdd > 0) {
          cal.currentDay = (cal.currentDay ?? 1) + daysToAdd;
        }
        localStorage.setItem('vtt_calendar_config', JSON.stringify(cal));
        window.dispatchEvent(new CustomEvent('vtt:calendar-time-advanced', { detail: { minutes } }));
      }
    } catch {
      // ignore
    }
  }

  function commitHarvest() {
    if (!effectiveTotal || !isSuccess) return;

    const currentHour = getCalendarHours();

    // Iterate through yields and add them to party stash
    yields.forEach((y) => {
      // On regular success: collect all. On critical success: bonus yield
      const qty = isCriticalSuccess ? y.quantity + 1 : y.quantity;
      const finalVal = calculateAppraisalPayout(y.baseValueGp, appraisalDamagePercent);

      sessionStore.addItemToPartyStash({
        name: y.name,
        category: y.category,
        quantity: qty,
        weight: y.weight,
        valueGp: finalVal,
        description: `${y.description} (Harvested from ${creatureName} [CR ${creatureCr}]. Field appraisal: -${appraisalDamagePercent}%).`,
        harvestedAtHour: currentHour,
        isPreserved: false,
        isSpoiled: false,
      });
    });

    // Advance calendar by dress time
    advanceCalendarHours(dressMinutes);

    audioEngine.triggerSfx('sfx-bell');
    isHarvestCommitted = true;
    setTimeout(() => {
      closeModal();
    }, 1200);
  }

  function closeModal() {
    isOpen = false;
    onClose?.();
  }
</script>

{#if isOpen}
  <div
    class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="harvest-modal-title"
  >
    <div class="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

      <!-- Header -->
      <div class="px-5 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <span class="text-2xl">🥩</span>
          <div>
            <h3 id="harvest-modal-title" class="text-sm font-black uppercase tracking-wider text-slate-100 flex items-center gap-2">
              Monster Harvest Extraction Engine
              <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800/60">
                Aleamos Field Dressing
              </span>
            </h3>
            <p class="text-xs text-slate-400">Extract anatomical proof, elemental essences, and perishable viscera.</p>
          </div>
        </div>
        <button onclick={closeModal} class="text-slate-400 hover:text-slate-200 text-sm p-1">✕</button>
      </div>

      <!-- Body Content -->
      <div class="flex-1 overflow-y-auto p-5 space-y-5">

        <!-- 1. Target Creature & Size Configuration -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
          <div>
            <label for="creature-name-input" class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Target Name</label>
            <input
              id="creature-name-input"
              type="text"
              bind:value={creatureName}
              class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-semibold focus:outline-none focus:border-rose-500"
            />
          </div>
          <div>
            <label for="creature-size-select" class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Size Category</label>
            <select
              id="creature-size-select"
              bind:value={creatureSize}
              class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-semibold focus:outline-none focus:border-rose-500"
            >
              {#each SIZES as s}
                <option value={s}>{s}</option>
              {/each}
            </select>
          </div>
          <div>
            <label for="creature-cr-input" class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Challenge Rating (CR)</label>
            <div class="flex items-center gap-1.5">
              <input
                id="creature-cr-input"
                type="number"
                min="0"
                max="30"
                bind:value={creatureCr}
                class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono font-bold focus:outline-none focus:border-rose-500"
              />
              <span class="text-xs font-bold text-amber-400 px-2 py-1 bg-amber-950/40 rounded border border-amber-800/40 shrink-0">
                CR {creatureCr}
              </span>
            </div>
          </div>
        </div>

        <!-- 2. Extraction Skill DCs & Dress Time Metrics -->
        <div class="space-y-2">
          <div class="flex items-center justify-between text-xs">
            <span class="font-bold text-slate-300">Extraction Skill DC Matrix</span>
            <span class="text-slate-400 font-mono text-[11px] flex items-center gap-1">
              <span>⏱️ Field Dress Time:</span>
              <span class="text-amber-300 font-bold">{formattedDressTime}</span>
            </span>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {#each SKILLS as sk}
              {@const dc = dcBySkill[sk]}
              {@const isRec = sk === recommendedSkill}
              {@const isSel = sk === selectedSkill}
              <button
                type="button"
                onclick={() => selectedSkill = sk}
                class="p-2.5 rounded-xl border text-left transition-all relative {isSel
                  ? 'bg-rose-950/40 border-rose-500 text-rose-200 shadow-md shadow-rose-950/40'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'}"
              >
                <div class="flex items-center justify-between mb-1">
                  <span class="text-xs font-black">{sk}</span>
                  {#if isRec}
                    <span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/50">
                      Favored
                    </span>
                  {/if}
                </div>
                <div class="text-lg font-mono font-black {isSel ? 'text-rose-400' : 'text-slate-300'}">
                  DC {dc}
                </div>
                <div class="text-[9px] text-slate-500 mt-0.5">
                  10 + {Math.floor(creatureCr / 2)} (CR) {creatureSize === 'Tiny' ? '- 2' : creatureSize === 'Small' ? '- 1' : creatureSize === 'Large' ? '+ 1' : creatureSize === 'Huge' ? '+ 2' : creatureSize === 'Gargantuan' ? '+ 4' : '+ 0'} (Size)
                </div>
              </button>
            {/each}
          </div>
        </div>

        <!-- 3. Appraisal Penalty Slider (0% - 50% Combat Damage Deduction) -->
        <div class="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-2">
          <div class="flex items-center justify-between text-xs">
            <span class="font-bold text-slate-300 flex items-center gap-1.5">
              <span>🔥</span>
              <span>Combat Damage Appraisal Penalty</span>
              <span class="text-[10px] text-slate-500 font-normal">(Fire, Acid, or Rot trauma during battle)</span>
            </span>
            <span class="font-mono font-bold {appraisalDamagePercent > 0 ? 'text-rose-400' : 'text-emerald-400'}">
              -{appraisalDamagePercent}% Payout Deduction
            </span>
          </div>

          <input
            type="range"
            min="0"
            max="50"
            step="5"
            bind:value={appraisalDamagePercent}
            class="w-full accent-rose-500 cursor-pointer"
          />

          <div class="flex items-center justify-between text-[10px] text-slate-500 font-mono">
            <span>Pristine Hide (0%)</span>
            <span>Singed / Chipped (25%)</span>
            <span>Severe Acid / Charring (50% max)</span>
          </div>
        </div>

        <!-- 4. Extraction Check Roller -->
        <div class="p-4 rounded-xl border border-indigo-900/60 bg-indigo-950/20 space-y-3">
          <div class="flex items-center justify-between">
            <div>
              <span class="text-xs font-black uppercase text-indigo-300">Harvest Extraction Check</span>
              <p class="text-[11px] text-slate-400">Roll 1d20 + {selectedSkill} modifier vs DC {activeDc}</p>
            </div>
            <div class="flex items-center gap-2">
              <div class="flex items-center gap-1 text-xs">
                <span class="text-slate-400 font-bold">Mod:</span>
                <input
                  type="number"
                  bind:value={skillBonus}
                  class="w-12 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-center font-mono text-xs text-slate-200"
                />
              </div>
              <button
                onclick={rollCheck}
                class="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-indigo-600/30 flex items-center gap-1.5"
              >
                <span>🎲</span> Roll {selectedSkill}
              </button>
            </div>
          </div>

          <!-- Roll Result Banner -->
          {#if manualRoll !== null}
            <div class="p-3 rounded-xl border flex items-center justify-between {isSuccess
              ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-200'
              : 'bg-rose-950/40 border-rose-700/60 text-rose-200'}">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg flex items-center justify-center font-mono font-black text-lg {isSuccess ? 'bg-emerald-600 text-white' : 'bg-rose-700 text-white'}">
                  {effectiveTotal}
                </div>
                <div>
                  <div class="text-xs font-black flex items-center gap-1.5">
                    {#if isCriticalSuccess}
                      <span>✨ Critical Extraction! (+1 Bonus Quantity)</span>
                    {:else if isSuccess}
                      <span>✓ Clean Extraction Success!</span>
                    {:else}
                      <span>✕ Harvest Failed — Organs Ruptured</span>
                    {/if}
                  </div>
                  <div class="text-[10px] text-slate-400 font-mono">
                    d20 ({manualRoll}) + Mod ({skillBonus}) = {effectiveTotal} vs DC {activeDc}
                  </div>
                </div>
              </div>

              {#if !isSuccess}
                <span class="text-[10px] text-rose-400 italic">Reroll or salvage scrap</span>
              {/if}
            </div>
          {/if}
        </div>

        <!-- 5. Potential Yields Preview & 24-Hour Decay Warning -->
        <div class="space-y-2">
          <div class="flex items-center justify-between text-xs">
            <span class="font-bold text-slate-300">Extracted Reagents &amp; Proof</span>
            <span class="text-rose-400 font-bold text-[11px] flex items-center gap-1">
              <span>⏳</span>
              <span>24-Hour Decay Rule Enforced</span>
            </span>
          </div>

          <div class="space-y-1.5">
            {#each yields as y}
              {@const effectiveGp = calculateAppraisalPayout(y.baseValueGp, appraisalDamagePercent)}
              <div class="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="text-base">{y.isOrganic ? '🥩' : y.essence ? '✨' : '🛡️'}</span>
                  <div class="min-w-0">
                    <div class="flex items-center gap-1.5">
                      <span class="font-bold text-slate-200 truncate">{y.name}</span>
                      <span class="px-1.5 py-0.2 rounded text-[9px] font-semibold {y.isOrganic
                        ? 'bg-rose-950/80 text-rose-300 border border-rose-800/60'
                        : 'bg-indigo-950/80 text-indigo-300 border border-indigo-800/60'}">
                        {y.category}
                      </span>
                      {#if y.isOrganic}
                        <span class="px-1.5 py-0.2 rounded text-[8px] font-bold bg-amber-950 text-amber-300 border border-amber-800/50">
                          Decays in 24h
                        </span>
                      {/if}
                    </div>
                    <p class="text-[10px] text-slate-500 truncate">{y.description}</p>
                  </div>
                </div>

                <div class="text-right shrink-0 pl-3">
                  <div class="font-mono font-bold text-amber-300">
                    {effectiveGp} gp
                    {#if appraisalDamagePercent > 0}
                      <span class="text-[9px] text-slate-500 line-through">({y.baseValueGp} gp)</span>
                    {/if}
                  </div>
                  <div class="text-[10px] text-slate-400 font-mono">
                    Qty: <span class="text-white font-bold">{isCriticalSuccess ? y.quantity + 1 : y.quantity}</span> · {y.weight} lb
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </div>

      </div>

      <!-- Footer Actions -->
      <div class="px-5 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
        <span class="text-xs text-slate-500 font-mono">
          ⏱️ Dressing consumes <strong class="text-amber-300">{formattedDressTime}</strong> of campaign time
        </span>

        <div class="flex items-center gap-2">
          <button
            onclick={closeModal}
            class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
          >
            Cancel
          </button>

          <button
            onclick={commitHarvest}
            disabled={!isSuccess || isHarvestCommitted}
            class="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-black transition-all shadow-md shadow-emerald-600/30 flex items-center gap-1.5"
          >
            {#if isHarvestCommitted}
              <span>✓ Harvest Stashed!</span>
            {:else}
              <span>🥩 Commit Harvest to Party Stash</span>
            {/if}
          </button>
        </div>
      </div>

    </div>
  </div>
{/if}
