<script lang="ts">
  // CreateItemModal.svelte — DM Manual Custom Item Creation & Dispatch
  // Allows DM to forge custom weapons, armor, reagents, and wondrous items with Durability RP,
  // Perishable timestamps, and Essence tags, then inject directly into Compendium, Collaborative Stash, or Player Packs.

  import { onMount } from 'svelte';
  import type { CustomItemDefinition, ItemType, ItemRarity } from '../../types/item';
  import { addCustomItem } from '../../stores/compendiumStore';
  import { sessionStore } from '../../../stores/sessionStore';
  import { audioEngine } from '../../audio/AudioEngine';

  let {
    isOpen = $bindable(false),
    onItemCreated = undefined
  }: {
    isOpen?: boolean;
    onItemCreated?: (item: CustomItemDefinition) => void;
  } = $props();

  interface PartyMemberOption {
    id: string;
    name: string;
    class: string;
    level: number;
    playerName?: string;
  }

  // Form State
  let name = $state('');
  let type = $state<ItemType>('weapon');
  let category = $state('Weapon (Martial)');
  let rarity = $state<ItemRarity>('Uncommon');
  let weight = $state(3.0);
  let costGp = $state(150);
  let description = $state('');

  // Combat stats
  let attackBonus = $state(1);
  let damageFormula = $state('1d8+1');
  let damageType = $state('slashing');
  let acBonus = $state(2);

  // Aleamos House Rules (Durability RP, Decay, Essences)
  let maxRp = $state(20);
  let currentRp = $state(20);
  let isPerishable = $state(false);
  let essenceTag = $state('None');

  // Destination injection target
  let destination = $state<'compendium' | 'stash' | 'player'>('stash');
  let selectedPlayerId = $state('');
  let partyMembers = $state<PartyMemberOption[]>([]);
  let isSubmitting = $state(false);
  let validationError = $state('');

  const ALEAMOS_ESSENCES = [
    'None',
    'Pyretic (Fire)',
    'Glacial (Cold)',
    'Voltaic (Lightning)',
    'Toxic (Venom)',
    'Crystalline (Resonance)',
    'Aetheric (Force)',
    'Umbral (Necrotic)',
    'Solar (Radiant)',
    'Verdant (Flora)',
    'Chitinous (Beast)',
    'Telluric (Earth)',
    'Sovereign (Arcane)'
  ];

  function loadPartyMembers() {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem('vtt_party_roster');
      if (raw) {
        const parsed = JSON.parse(raw) as PartyMemberOption[];
        partyMembers = parsed.filter(m => !(m as any).isOrbSealed);
        if (partyMembers.length > 0 && !selectedPlayerId) {
          selectedPlayerId = partyMembers[0].id;
        }
      }
    } catch {
      partyMembers = [];
    }
  }

  $effect(() => {
    if (isOpen) {
      loadPartyMembers();
      validationError = '';
    }
  });

  // Auto-adjust default category when item type changes
  function handleTypeChange(newType: ItemType) {
    type = newType;
    if (newType === 'weapon') {
      category = 'Weapon (Martial)';
      maxRp = 20;
      currentRp = 20;
    } else if (newType === 'armor') {
      category = 'Armor (Medium)';
      maxRp = 25;
      currentRp = 25;
    } else if (newType === 'potion') {
      category = 'Potion';
      weight = 0.5;
      maxRp = 5;
      currentRp = 5;
    } else if (newType === 'scroll') {
      category = 'Scroll';
      weight = 0.1;
      maxRp = 5;
      currentRp = 5;
    } else if (newType === 'ingredient') {
      category = 'Alchemy Reagent';
      weight = 0.5;
      isPerishable = true;
    } else if (newType === 'wondrous') {
      category = 'Wondrous Item';
      maxRp = 30;
      currentRp = 30;
    } else {
      category = 'Adventuring Gear';
    }
  }

  async function handleCreateItem() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      validationError = 'Item name is required.';
      return;
    }

    isSubmitting = true;
    validationError = '';

    const newItem: CustomItemDefinition = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: trimmedName,
      type,
      category,
      rarity,
      weight: Math.max(0.1, Number(weight) || 1.0),
      costGp: Math.max(0, Number(costGp) || 0),
      description: description.trim() || `${rarity} ${category}`,
      currentRp: Math.max(0, Number(currentRp) || 0),
      maxRp: Math.max(1, Number(maxRp) || 1),
      attackBonus: type === 'weapon' ? Number(attackBonus) || 0 : undefined,
      damageFormula: type === 'weapon' ? damageFormula.trim() || '1d6' : undefined,
      damageType: type === 'weapon' ? damageType.trim() || 'bludgeoning' : undefined,
      acBonus: type === 'armor' ? Number(acBonus) || 0 : undefined,
      isPerishable,
      harvestTimestamp: isPerishable ? Math.floor(Date.now() / 1000) : null,
      essenceTag: essenceTag !== 'None' ? essenceTag : undefined,
      source: 'custom',
      createdAt: Date.now(),
    };

    try {
      // 1. Always save to IndexedDB table 'custom_items'
      await addCustomItem(newItem);

      // 2. Dispatch to designated target
      if (destination === 'stash') {
        sessionStore.addItemToCollaborativeStash({
          id: newItem.id,
          name: newItem.name,
          category: newItem.category,
          quantity: 1,
          weight: newItem.weight,
          description: newItem.description,
          valueGp: newItem.costGp,
          isPreserved: !newItem.isPerishable,
          essence: newItem.essenceTag,
          harvestedAtHour: isPerishable ? Math.floor(Date.now() / 3600000) : undefined,
        });
        audioEngine.triggerSfx('sfx-rest');
      } else if (destination === 'player' && selectedPlayerId) {
        sessionStore.addItemToPlayerPack(selectedPlayerId, newItem);
        audioEngine.triggerSfx('sfx-sword');
      } else {
        audioEngine.triggerSfx('sfx-secret');
      }

      if (onItemCreated) {
        onItemCreated(newItem);
      }

      // Reset form
      name = '';
      description = '';
      isOpen = false;
    } catch (err: any) {
      console.error('Failed to create custom item:', err);
      validationError = err.message || 'Failed to persist custom item.';
    } finally {
      isSubmitting = false;
    }
  }
</script>

{#if isOpen}
  <div
    role="presentation"
    class="fixed inset-0 bg-black/75 backdrop-blur-md z-[60] flex items-center justify-center p-4"
    onclick={(e) => { if (e.target === e.currentTarget) isOpen = false; }}
  >
    <div class="w-full max-w-2xl bg-slate-900 border border-amber-600/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">

      <!-- Header -->
      <div class="px-6 py-4 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-xl">
            ⚒️
          </div>
          <div>
            <h2 class="text-base font-black text-slate-100 uppercase tracking-wide">Forge Custom Item</h2>
            <p class="text-xs text-slate-400">Manual creation with Durability RP, Decay timers, and direct dispatch</p>
          </div>
        </div>
        <button
          onclick={() => isOpen = false}
          class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-sm transition-colors"
        >
          ✕
        </button>
      </div>

      <!-- Error Alert -->
      {#if validationError}
        <div class="bg-rose-950/80 border-b border-rose-800/80 px-6 py-2.5 text-xs font-bold text-rose-300 shrink-0">
          ⚠️ {validationError}
        </div>
      {/if}

      <!-- Form Body (Scrollable) -->
      <div class="p-6 overflow-y-auto space-y-5 text-xs text-slate-300">

        <!-- 1. Basic Metadata -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="space-y-1 md:col-span-2">
            <label for="item-name" class="font-bold text-slate-200">Item Name *</label>
            <input
              id="item-name"
              type="text"
              bind:value={name}
              placeholder="e.g. Moon-Silver Broadsword, Elixir of False Dawn..."
              class="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-slate-100 font-semibold placeholder:text-slate-600 focus:outline-none"
            />
          </div>

          <div class="space-y-1">
            <label for="item-type" class="font-bold text-slate-200">Item Type</label>
            <select
              id="item-type"
              value={type}
              onchange={(e) => handleTypeChange((e.target as HTMLSelectElement).value as ItemType)}
              class="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-slate-100 focus:outline-none"
            >
              <option value="weapon">⚔️ Weapon</option>
              <option value="armor">🛡️ Armor / Shield</option>
              <option value="potion">🧪 Potion / Elixir</option>
              <option value="scroll">📜 Scroll / Parchment</option>
              <option value="wondrous">✨ Wondrous Item</option>
              <option value="ingredient">🌿 Alchemy Ingredient</option>
              <option value="gear">🎒 Adventuring Gear</option>
            </select>
          </div>

          <div class="space-y-1">
            <label for="item-category" class="font-bold text-slate-200">Category / Subtype</label>
            <input
              id="item-category"
              type="text"
              bind:value={category}
              placeholder="e.g. Martial Melee, Heavy Armor, Wondrous"
              class="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-slate-100 placeholder:text-slate-600 focus:outline-none"
            />
          </div>

          <div class="space-y-1">
            <label for="item-rarity" class="font-bold text-slate-200">Rarity</label>
            <select
              id="item-rarity"
              bind:value={rarity}
              class="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-slate-100 focus:outline-none"
            >
              <option value="Common">Common (White)</option>
              <option value="Uncommon">Uncommon (Green)</option>
              <option value="Rare">Rare (Blue)</option>
              <option value="Very Rare">Very Rare (Purple)</option>
              <option value="Legendary">Legendary (Orange)</option>
              <option value="Artifact">Artifact (Gold)</option>
            </select>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div class="space-y-1">
              <label for="item-weight" class="font-bold text-slate-200">Weight (lbs)</label>
              <input
                id="item-weight"
                type="number"
                step="0.1"
                min="0.1"
                bind:value={weight}
                class="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-slate-100 focus:outline-none"
              />
            </div>
            <div class="space-y-1">
              <label for="item-cost" class="font-bold text-slate-200">Cost (GP)</label>
              <input
                id="item-cost"
                type="number"
                min="0"
                bind:value={costGp}
                class="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-slate-100 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <!-- 2. Weapon or Armor Specific Fields -->
        {#if type === 'weapon'}
          <div class="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3">
            <div class="font-bold text-amber-400 flex items-center gap-1.5">
              <span>⚔️</span> Weapon Combat Profile
            </div>
            <div class="grid grid-cols-3 gap-3">
              <div class="space-y-1">
                <label for="weapon-bonus" class="text-[11px] text-slate-400">Attack Bonus</label>
                <input
                  id="weapon-bonus"
                  type="number"
                  bind:value={attackBonus}
                  class="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none font-mono"
                />
              </div>
              <div class="space-y-1">
                <label for="weapon-damage" class="text-[11px] text-slate-400">Damage Formula</label>
                <input
                  id="weapon-damage"
                  type="text"
                  bind:value={damageFormula}
                  placeholder="1d8+1"
                  class="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none font-mono"
                />
              </div>
              <div class="space-y-1">
                <label for="weapon-type" class="text-[11px] text-slate-400">Damage Type</label>
                <input
                  id="weapon-type"
                  type="text"
                  bind:value={damageType}
                  placeholder="slashing"
                  class="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none"
                />
              </div>
            </div>
          </div>
        {:else if type === 'armor'}
          <div class="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3">
            <div class="font-bold text-indigo-400 flex items-center gap-1.5">
              <span>🛡️</span> Armor Defensive Profile
            </div>
            <div class="w-1/2 space-y-1">
              <label for="armor-ac-bonus" class="text-[11px] text-slate-400">AC Bonus Provided</label>
              <input
                id="armor-ac-bonus"
                type="number"
                bind:value={acBonus}
                class="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none font-mono"
              />
            </div>
          </div>
        {/if}

        <!-- 3. Aleamos Mechanics: Durability RP, Perishable Decay & Essence -->
        <div class="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3">
          <div class="font-bold text-amber-300 flex items-center justify-between">
            <span class="flex items-center gap-1.5">🛡️ Durability &amp; Aleamos Matrix</span>
            <span class="text-[10px] text-slate-500 font-mono">Anti-Sunder &amp; Decay System</span>
          </div>

          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div class="space-y-1">
              <label for="durability-current" class="text-[11px] text-slate-400">Current RP</label>
              <input
                id="durability-current"
                type="number"
                min="0"
                bind:value={currentRp}
                class="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none font-mono"
              />
            </div>

            <div class="space-y-1">
              <label for="durability-max" class="text-[11px] text-slate-400">Max RP</label>
              <input
                id="durability-max"
                type="number"
                min="1"
                bind:value={maxRp}
                class="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none font-mono"
              />
            </div>

            <div class="space-y-1">
              <label for="essence-tag" class="text-[11px] text-slate-400">Essence Tag</label>
              <select
                id="essence-tag"
                bind:value={essenceTag}
                class="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none text-xs"
              >
                {#each ALEAMOS_ESSENCES as ess}
                  <option value={ess}>{ess}</option>
                {/each}
              </select>
            </div>

            <div class="space-y-1 flex flex-col justify-end">
              <label class="flex items-center gap-2 cursor-pointer pb-2">
                <input
                  type="checkbox"
                  bind:checked={isPerishable}
                  class="rounded bg-slate-900 border-slate-700 text-amber-500 focus:ring-0"
                />
                <span class="text-[11px] text-slate-300 font-bold">Perishable Decay</span>
              </label>
            </div>
          </div>
        </div>

        <!-- 4. Description -->
        <div class="space-y-1">
          <label for="item-desc" class="font-bold text-slate-200">Description &amp; Magical Lore</label>
          <textarea
            id="item-desc"
            bind:value={description}
            rows="3"
            placeholder="Engravings, attunement prerequisites, spell effects, or physical appearance..."
            class="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl p-3 text-slate-100 placeholder:text-slate-600 focus:outline-none resize-y"
          ></textarea>
        </div>

        <!-- 5. Destination Selector (Direct Dispatch) -->
        <div class="p-3.5 bg-indigo-950/30 border border-indigo-900/50 rounded-xl space-y-3">
          <div class="font-bold text-indigo-300 flex items-center justify-between">
            <span class="flex items-center gap-1.5">🚀 Dispatch Destination</span>
            <span class="text-[10px] text-indigo-400">Instant synchronized deposit</span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
            <button
              type="button"
              onclick={() => destination = 'stash'}
              class="p-2.5 rounded-xl border text-left transition-all {destination === 'stash' ? 'bg-indigo-600/30 border-indigo-500 text-white shadow-sm' : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'}"
            >
              <div class="font-bold text-xs flex items-center gap-1.5">
                <span>📦</span> Collaborative Stash
              </div>
              <div class="text-[10px] text-slate-400 mt-0.5">Shared party loot vault</div>
            </button>

            <button
              type="button"
              onclick={() => destination = 'player'}
              class="p-2.5 rounded-xl border text-left transition-all {destination === 'player' ? 'bg-amber-600/30 border-amber-500 text-white shadow-sm' : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'}"
            >
              <div class="font-bold text-xs flex items-center gap-1.5">
                <span>🎒</span> Player Pack
              </div>
              <div class="text-[10px] text-slate-400 mt-0.5">Direct into personal sheet</div>
            </button>

            <button
              type="button"
              onclick={() => destination = 'compendium'}
              class="p-2.5 rounded-xl border text-left transition-all {destination === 'compendium' ? 'bg-slate-800 border-slate-600 text-white shadow-sm' : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'}"
            >
              <div class="font-bold text-xs flex items-center gap-1.5">
                <span>🏛️</span> Compendium Only
              </div>
              <div class="text-[10px] text-slate-400 mt-0.5">Save for future reference</div>
            </button>
          </div>

          {#if destination === 'player'}
            <div class="space-y-1.5 pt-1">
              <label for="target-player" class="font-bold text-slate-300 text-[11px]">Select Active Party Member Pack:</label>
              {#if partyMembers.length === 0}
                <div class="p-2 rounded-lg bg-rose-950/40 border border-rose-900/50 text-[11px] text-rose-300">
                  No active characters detected in party roster.
                </div>
              {:else}
                <select
                  id="target-player"
                  bind:value={selectedPlayerId}
                  class="w-full bg-slate-950 border border-amber-500/60 rounded-xl px-3 py-2 text-slate-100 font-bold focus:outline-none"
                >
                  {#each partyMembers as member}
                    <option value={member.id}>
                      {member.name} ({member.class} Lvl {member.level}) {member.playerName ? `— ${member.playerName}` : ''}
                    </option>
                  {/each}
                </select>
              {/if}
            </div>
          {/if}
        </div>

      </div>

      <!-- Footer Buttons -->
      <div class="px-6 py-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between shrink-0">
        <button
          type="button"
          onclick={() => isOpen = false}
          class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
        >
          Cancel
        </button>

        <button
          type="button"
          disabled={isSubmitting || (destination === 'player' && !selectedPlayerId)}
          onclick={handleCreateItem}
          class="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 text-xs font-black shadow-lg shadow-amber-600/20 transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-1.5"
        >
          <span>⚒️</span>
          <span>{isSubmitting ? 'Forging Item...' : 'Forge & Dispatch Item'}</span>
        </button>
      </div>

    </div>
  </div>
{/if}
