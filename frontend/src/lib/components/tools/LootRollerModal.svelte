<!-- frontend/src/lib/components/tools/LootRollerModal.svelte -->
<!-- Single-Creature Pickpocket & Body Loot Roller with CR-Scaled Tables -->

<script lang="ts">
  import { inventoryStore, currencyStore } from '$lib/stores/characterStore';
  import type { InventoryItem } from '../../../types/character';

  export type CrTier = 'cr_0_4' | 'cr_5_10' | 'cr_11_16' | 'cr_17_plus';

  let {
    isOpen = false,
    tokenName = 'Fallen Foe',
    initialCr = 'cr_0_4' as CrTier,
    onClose,
  }: {
    isOpen: boolean;
    tokenName?: string;
    initialCr?: CrTier;
    onClose: () => void;
  } = $props();

  let selectedCr = $state<CrTier>('cr_0_4');
  let targetName = $state('Fallen Foe');

  $effect(() => {
    selectedCr = initialCr;
    targetName = tokenName;
  });

  interface LootResult {
    coins: { cp: number; sp: number; gp: number; pp: number };
    items: Array<{
      name: string;
      category: 'key' | 'trinket' | 'potion' | 'valuable';
      weightLbs: number;
      valueCp: number;
    }>;
    rolledAt: number;
  }

  let currentLoot = $state<LootResult | null>(null);
  let isTransferred = $state(false);

  function rollDie(sides: number): number {
    return Math.floor(Math.random() * sides) + 1;
  }

  function rollDice(count: number, sides: number): number {
    let total = 0;
    for (let i = 0; i < count; i++) {
      total += rollDie(sides);
    }
    return total;
  }

  const CR_ITEM_TABLES: Record<
    CrTier,
    Array<{ name: string; category: 'key' | 'trinket' | 'potion' | 'valuable'; weightLbs: number; valueCp: number }>
  > = {
    cr_0_4: [
      { name: 'Bent Brass Gate Key', category: 'key', weightLbs: 0.1, valueCp: 10 },
      { name: 'Carved Bone Dice Set', category: 'trinket', weightLbs: 0.1, valueCp: 25 },
      { name: 'Potion of Healing', category: 'potion', weightLbs: 0.5, valueCp: 5000 },
      { name: 'Tallow Candle & Striker', category: 'trinket', weightLbs: 0.2, valueCp: 5 },
      { name: 'Engraved Copper Locket', category: 'valuable', weightLbs: 0.3, valueCp: 500 },
      { name: 'Vial of Black Adder Venom', category: 'potion', weightLbs: 0.2, valueCp: 20000 },
    ],
    cr_5_10: [
      { name: 'Ornate Silver Skeleton Key', category: 'key', weightLbs: 0.2, valueCp: 250 },
      { name: 'Potion of Greater Healing', category: 'potion', weightLbs: 0.5, valueCp: 20000 },
      { name: 'Vial of Antitoxin', category: 'potion', weightLbs: 0.2, valueCp: 5000 },
      { name: 'Pouch of Aromatic Saffron Spices', category: 'valuable', weightLbs: 0.5, valueCp: 1500 },
      { name: 'Carved Obsidian Gryphon Figurine', category: 'valuable', weightLbs: 1.0, valueCp: 10000 },
      { name: 'Silver Signet Ring with Bloodstone', category: 'valuable', weightLbs: 0.1, valueCp: 7500 },
    ],
    cr_11_16: [
      { name: 'Runic Astral Vault Key', category: 'key', weightLbs: 0.2, valueCp: 2500 },
      { name: 'Potion of Superior Healing', category: 'potion', weightLbs: 0.5, valueCp: 50000 },
      { name: 'Pouch of Crushed Star Sapphires', category: 'valuable', weightLbs: 0.4, valueCp: 100000 },
      { name: 'Platinum Brooch set with Fire Opal', category: 'valuable', weightLbs: 0.2, valueCp: 250000 },
      { name: 'Elixir of Health', category: 'potion', weightLbs: 0.5, valueCp: 40000 },
      { name: 'Spell Scroll (3rd Level)', category: 'valuable', weightLbs: 0.1, valueCp: 30000 },
    ],
    cr_17_plus: [
      { name: 'Abyssal Voidstone Key', category: 'key', weightLbs: 0.5, valueCp: 50000 },
      { name: 'Potion of Supreme Healing', category: 'potion', weightLbs: 0.5, valueCp: 150000 },
      { name: 'Astral Diamond (Flawless)', category: 'valuable', weightLbs: 0.1, valueCp: 1000000 },
      { name: 'Ring of Spell Storing Shard', category: 'valuable', weightLbs: 0.1, valueCp: 350000 },
      { name: 'Crown of Ancient Dragonlords Fragment', category: 'valuable', weightLbs: 1.5, valueCp: 500000 },
    ],
  };

  function rollLoot(): void {
    isTransferred = false;
    let cp = 0;
    let sp = 0;
    let gp = 0;
    let pp = 0;

    if (selectedCr === 'cr_0_4') {
      cp = rollDice(2, 6) * 10;
      sp = rollDice(1, 6) * 5;
      gp = rollDice(1, 4);
    } else if (selectedCr === 'cr_5_10') {
      sp = rollDice(4, 6) * 10;
      gp = rollDice(2, 6) * 10;
    } else if (selectedCr === 'cr_11_16') {
      gp = rollDice(4, 6) * 100;
      pp = rollDice(1, 6) * 10;
    } else {
      gp = rollDice(8, 6) * 100;
      pp = rollDice(3, 6) * 10;
    }

    const table = CR_ITEM_TABLES[selectedCr];
    // Roll 1 to 2 random items
    const itemCount = Math.random() > 0.4 ? 2 : 1;
    const items: LootResult['items'] = [];
    const shuffled = [...table].sort(() => Math.random() - 0.5);

    for (let i = 0; i < Math.min(itemCount, shuffled.length); i++) {
      items.push(shuffled[i]);
    }

    currentLoot = {
      coins: { cp, sp, gp, pp },
      items,
      rolledAt: Date.now(),
    };
  }

  function transferToPartyInventory(): void {
    if (!currentLoot || isTransferred) return;

    // Convert total coins to Concord Sovereigns approximation (1 sovereign ~ 100 cp)
    const totalCp =
      currentLoot.coins.cp +
      currentLoot.coins.sp * 10 +
      currentLoot.coins.gp * 100 +
      currentLoot.coins.pp * 1000;
    const sovereignsToAdd = Math.floor(totalCp / 100);

    if (sovereignsToAdd > 0) {
      currencyStore.update((curr) => ({
        ...curr,
        concord_sovereigns: curr.concord_sovereigns + sovereignsToAdd,
        updated_at: Date.now(),
      }));
    }

    const newItems: InventoryItem[] = currentLoot.items.map((it, idx) => ({
      id: `loot_${Date.now()}_${idx}`,
      character_id: 'party',
      name: it.name,
      quantity: 1,
      weight_lbs: it.weightLbs,
      current_rp: 20,
      max_rp: 20,
      is_preserved: true,
      harvest_timestamp: null,
      base_value_cp: it.valueCp,
      is_spoiled: false,
    }));

    inventoryStore.update((inv) => [...inv, ...newItems]);
    isTransferred = true;
  }
</script>

{#if isOpen}
  <div
    class="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
    role="dialog"
    aria-modal="true"
    aria-labelledby="loot-modal-title"
  >
    <div
      class="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col"
    >
      <!-- Header -->
      <div class="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
        <div class="flex items-center gap-2">
          <span class="text-xl">🗡️</span>
          <h2 id="loot-modal-title" class="font-bold text-sm text-slate-100 uppercase tracking-wider">
            Pickpocket & Body Loot
          </h2>
        </div>
        <button
          type="button"
          onclick={onClose}
          class="text-slate-400 hover:text-slate-200 transition-colors text-lg"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <!-- Controls -->
      <div class="p-4 space-y-3 text-xs bg-slate-950/40 border-b border-slate-800">
        <div>
          <label for="loot-target-name" class="block text-[10px] text-slate-400 uppercase font-semibold mb-1">
            Target Token:
          </label>
          <input
            id="loot-target-name"
            type="text"
            bind:value={targetName}
            class="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 font-semibold outline-none focus:border-amber-500"
          />
        </div>

        <div>
          <label for="loot-cr-tier" class="block text-[10px] text-slate-400 uppercase font-semibold mb-1">
            Challenge Rating (CR):
          </label>
          <select
            id="loot-cr-tier"
            bind:value={selectedCr}
            class="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 outline-none font-medium"
          >
            <option value="cr_0_4">CR 0–4 (Minions, Guards, Bandits)</option>
            <option value="cr_5_10">CR 5–10 (Elites, Chieftains, Cultists)</option>
            <option value="cr_11_16">CR 11–16 (Warlords, Vampires, Mages)</option>
            <option value="cr_17_plus">CR 17+ (Dragons, Archmages, Fiends)</option>
          </select>
        </div>

        <button
          type="button"
          onclick={rollLoot}
          class="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow"
        >
          <span>🎲</span>
          <span>Search Pockets / Loot Body</span>
        </button>
      </div>

      <!-- Loot Results Area -->
      <div class="p-4 space-y-3 text-xs flex-1 min-h-[160px] flex flex-col justify-center">
        {#if currentLoot}
          <div class="space-y-3 animate-in fade-in duration-150">
            <!-- Coin breakdown -->
            <div class="bg-slate-800/80 rounded-xl p-3 border border-slate-700/60">
              <div class="text-[10px] uppercase font-bold text-slate-400 mb-1.5">Pocket Change:</div>
              <div class="grid grid-cols-4 gap-2 text-center">
                {#if currentLoot.coins.pp > 0}
                  <div class="bg-slate-900/80 rounded-lg py-1 border border-slate-700">
                    <span class="block text-slate-400 text-[10px]">PP</span>
                    <span class="font-mono font-bold text-indigo-300">{currentLoot.coins.pp}</span>
                  </div>
                {/if}
                <div class="bg-slate-900/80 rounded-lg py-1 border border-slate-700">
                  <span class="block text-slate-400 text-[10px]">GP</span>
                  <span class="font-mono font-bold text-amber-400">{currentLoot.coins.gp}</span>
                </div>
                <div class="bg-slate-900/80 rounded-lg py-1 border border-slate-700">
                  <span class="block text-slate-400 text-[10px]">SP</span>
                  <span class="font-mono font-bold text-slate-300">{currentLoot.coins.sp}</span>
                </div>
                <div class="bg-slate-900/80 rounded-lg py-1 border border-slate-700">
                  <span class="block text-slate-400 text-[10px]">CP</span>
                  <span class="font-mono font-bold text-amber-600">{currentLoot.coins.cp}</span>
                </div>
              </div>
            </div>

            <!-- Recovered Items -->
            <div class="bg-slate-800/80 rounded-xl p-3 border border-slate-700/60 space-y-1.5">
              <div class="text-[10px] uppercase font-bold text-slate-400 mb-1">Items Recovered:</div>
              {#each currentLoot.items as item}
                <div class="flex items-center justify-between text-[11px] text-slate-200 py-0.5 border-b border-slate-700/40 last:border-0">
                  <span class="flex items-center gap-1.5">
                    <span>
                      {item.category === 'key' ? '🗝️' : item.category === 'potion' ? '🧪' : item.category === 'valuable' ? '💎' : '🎲'}
                    </span>
                    <span class="font-medium">{item.name}</span>
                  </span>
                  <span class="text-slate-400 text-[10px] font-mono">
                    {item.valueCp >= 100 ? `${Math.floor(item.valueCp / 100)} gp` : `${item.valueCp} cp`}
                  </span>
                </div>
              {/each}
            </div>

            <!-- Transfer Button -->
            <button
              type="button"
              onclick={transferToPartyInventory}
              disabled={isTransferred}
              class="w-full py-2 {isTransferred ? 'bg-emerald-700 text-emerald-100' : 'bg-indigo-600 hover:bg-indigo-500 text-white'} font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow"
            >
              {#if isTransferred}
                <span>✓ Appended to Party Inventory</span>
              {:else}
                <span>📦 Append to Party Inventory</span>
              {/if}
            </button>
          </div>
        {:else}
          <div class="text-center text-slate-500 py-6 text-xs space-y-1">
            <div class="text-3xl mb-1">💰</div>
            <div>Select CR tier and click <strong>Search Pockets</strong></div>
            <div class="text-[10px] text-slate-600">Generates pocket change, keys, trinkets & potions</div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
