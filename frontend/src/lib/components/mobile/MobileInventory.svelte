<!-- src/lib/components/mobile/MobileInventory.svelte -->
<!-- Mobile Equipment & Inventory Management with Quick Attack Triggers & Currency Tracker (Svelte 5 Runes) -->

<script lang="ts">
  export interface InventoryItem {
    id: string;
    name: string;
    type: 'weapon' | 'armor' | 'potion' | 'gear' | 'tool';
    quantity: number;
    equipped?: boolean;
    damage?: string; // e.g. "1d8+3"
    attackBonus?: number; // e.g. 5 for +5 to hit
    armorClass?: number; // e.g. 16 for chain mail
    weight?: number; // in lbs
    rarity?: string;
  }

  export interface Currency {
    cp: number;
    sp: number;
    ep: number;
    gp: number;
    pp: number;
  }

  interface Props {
    characterName: string;
    socket: WebSocket | null;
    items?: InventoryItem[];
    currency?: Currency;
    onAttackRoll?: (weaponName: string, attackFormula: string, damageFormula?: string) => void;
    onInventoryChanged?: (items: InventoryItem[], currency: Currency) => void;
  }

  let {
    characterName,
    socket,
    items = $bindable([
      {
        id: 'item-longsword',
        name: 'Longsword +1',
        type: 'weapon',
        quantity: 1,
        equipped: true,
        damage: '1d8+3',
        attackBonus: 5,
        weight: 3,
        rarity: 'Uncommon',
      },
      {
        id: 'item-shortbow',
        name: 'Shortbow',
        type: 'weapon',
        quantity: 1,
        equipped: true,
        damage: '1d6+2',
        attackBonus: 4,
        weight: 2,
        rarity: 'Common',
      },
      {
        id: 'item-chainmail',
        name: 'Chain Mail',
        type: 'armor',
        quantity: 1,
        equipped: true,
        armorClass: 16,
        weight: 55,
        rarity: 'Common',
      },
      {
        id: 'item-healing-potion',
        name: 'Potion of Healing',
        type: 'potion',
        quantity: 3,
        equipped: false,
        damage: '2d4+2',
        weight: 0.5,
        rarity: 'Common',
      },
      {
        id: 'item-torch',
        name: 'Torch',
        type: 'gear',
        quantity: 5,
        equipped: false,
        weight: 1,
      },
      {
        id: 'item-rope',
        name: 'Hempen Rope (50 ft)',
        type: 'gear',
        quantity: 1,
        equipped: false,
        weight: 10,
      },
    ]),
    currency = $bindable({
      cp: 14,
      sp: 25,
      ep: 0,
      gp: 120,
      pp: 2,
    }),
    onAttackRoll,
    onInventoryChanged,
  }: Props = $props();

  let activeCategory = $state<'all' | 'weapons' | 'armor' | 'consumables'>('all');
  let searchQuery = $state('');

  // Derived filtered items
  let filteredItems = $derived.by(() => {
    let list = items;
    if (activeCategory === 'weapons') {
      list = list.filter((i) => i.type === 'weapon');
    } else if (activeCategory === 'armor') {
      list = list.filter((i) => i.type === 'armor');
    } else if (activeCategory === 'consumables') {
      list = list.filter((i) => i.type === 'potion' || i.type === 'gear');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((i) => i.name.toLowerCase().includes(q));
    }
    return list;
  });

  // Total encumbrance
  let totalWeight = $derived(
    items.reduce((sum, item) => sum + (item.weight || 0) * item.quantity, 0)
  );

  function toggleEquip(itemId: string) {
    const item = items.find((i) => i.id === itemId);
    if (item) {
      item.equipped = !item.equipped;
      items = [...items];
      onInventoryChanged?.(items, currency);
    }
  }

  function adjustQuantity(itemId: string, delta: number) {
    const item = items.find((i) => i.id === itemId);
    if (item) {
      item.quantity = Math.max(0, item.quantity + delta);
      if (item.quantity === 0) {
        items = items.filter((i) => i.id !== itemId);
      } else {
        items = [...items];
      }
      onInventoryChanged?.(items, currency);
    }
  }

  function executeAttack(item: InventoryItem) {
    const atkBonus = item.attackBonus ?? 0;
    const sign = atkBonus >= 0 ? '+' : '';
    const atkFormula = `1d20${sign}${atkBonus}`;
    const dmgFormula = item.damage;

    // Send Attack Roll over WebSocket
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: 'RollDice',
          expression: atkFormula,
          character_name: `${characterName} (${item.name} Attack)`,
        })
      );

      // If damage formula present, roll damage as well
      if (dmgFormula) {
        setTimeout(() => {
          if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(
              JSON.stringify({
                type: 'RollDice',
                expression: dmgFormula,
                character_name: `${characterName} (${item.name} Damage)`,
              })
            );
          }
        }, 300);
      }
    }

    onAttackRoll?.(item.name, atkFormula, dmgFormula);
  }

  function adjustCurrency(coin: keyof Currency, delta: number) {
    currency[coin] = Math.max(0, currency[coin] + delta);
    currency = { ...currency };
    onInventoryChanged?.(items, currency);
  }
</script>

<div class="flex flex-col h-full space-y-4">
  <!-- ── CURRENCY WALLET (CP, SP, EP, GP, PP) ──────────────────────────────── -->
  <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 shadow-xl">
    <div class="flex items-center justify-between mb-2">
      <div class="flex items-center gap-1.5">
        <span class="text-sm">🪙</span>
        <h2 class="text-xs font-black uppercase tracking-wider text-slate-200">Coin Pouch</h2>
      </div>
      <span class="text-[10px] font-mono text-slate-400">Total Encumbrance: {totalWeight.toFixed(1)} lbs</span>
    </div>

    <div class="grid grid-cols-5 gap-1.5 text-center">
      {#each [
        { key: 'cp', label: 'CP', color: 'text-amber-600 bg-amber-950/40 border-amber-800/40' },
        { key: 'sp', label: 'SP', color: 'text-slate-300 bg-slate-800/40 border-slate-700/50' },
        { key: 'ep', label: 'EP', color: 'text-zinc-400 bg-zinc-800/40 border-zinc-700/50' },
        { key: 'gp', label: 'GP', color: 'text-amber-300 bg-amber-900/40 border-amber-600/50' },
        { key: 'pp', label: 'PP', color: 'text-cyan-300 bg-cyan-950/40 border-cyan-700/50' },
      ] as coin}
        {@const cKey = coin.key as keyof Currency}
        <div class="rounded-xl border {coin.color} p-1.5 flex flex-col justify-between">
          <span class="text-[9px] font-black uppercase">{coin.label}</span>
          <span class="text-xs font-mono font-black my-0.5">{currency[cKey]}</span>
          <div class="flex items-center justify-center gap-1 mt-0.5">
            <button
              type="button"
              onclick={() => adjustCurrency(cKey, -1)}
              class="w-4 h-4 rounded bg-slate-900/80 text-[10px] font-bold text-slate-400 hover:text-white"
            >
              -
            </button>
            <button
              type="button"
              onclick={() => adjustCurrency(cKey, 1)}
              class="w-4 h-4 rounded bg-slate-900/80 text-[10px] font-bold text-slate-400 hover:text-white"
            >
              +
            </button>
          </div>
        </div>
      {/each}
    </div>
  </div>

  <!-- ── CATEGORY TABS & SEARCH ────────────────────────────────────────────── -->
  <div class="space-y-2">
    <div class="relative">
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Filter equipment & items..."
        class="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium"
      />
      <span class="absolute left-3 top-2.5 text-xs text-slate-500">🔍</span>
    </div>

    <div class="flex items-center gap-1.5 text-[10px]">
      <button
        type="button"
        onclick={() => activeCategory = 'all'}
        class="flex-1 py-1 rounded-lg font-bold transition-all {activeCategory === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'}"
      >
        All
      </button>
      <button
        type="button"
        onclick={() => activeCategory = 'weapons'}
        class="flex-1 py-1 rounded-lg font-bold transition-all {activeCategory === 'weapons' ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'}"
      >
        Weapons
      </button>
      <button
        type="button"
        onclick={() => activeCategory = 'armor'}
        class="flex-1 py-1 rounded-lg font-bold transition-all {activeCategory === 'armor' ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'}"
      >
        Armor
      </button>
      <button
        type="button"
        onclick={() => activeCategory = 'consumables'}
        class="flex-1 py-1 rounded-lg font-bold transition-all {activeCategory === 'consumables' ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'}"
      >
        Gear
      </button>
    </div>
  </div>

  <!-- ── INVENTORY ITEMS LIST ──────────────────────────────────────────────── -->
  <div class="flex-1 overflow-y-auto space-y-2 pr-0.5">
    {#if filteredItems.length === 0}
      <div class="text-center py-8 text-slate-500 text-xs">
        No inventory items in this view.
      </div>
    {:else}
      {#each filteredItems as item}
        <div class="bg-slate-900/80 border {item.equipped ? 'border-indigo-500/50 bg-indigo-950/20' : 'border-slate-800'} rounded-2xl p-3 transition-all flex flex-col gap-2 shadow-md">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onclick={() => toggleEquip(item.id)}
                class="w-5 h-5 rounded-lg border flex items-center justify-center text-[10px] transition-all {item.equipped ? 'bg-indigo-600 border-indigo-400 text-white shadow-sm' : 'bg-slate-950 border-slate-700 text-slate-500'}"
                title="Toggle Equipped state"
              >
                {item.equipped ? '✓' : ''}
              </button>
              <div class="min-w-0">
                <div class="flex items-center gap-1.5">
                  <span class="font-bold text-xs text-slate-100 truncate">{item.name}</span>
                  {#if item.equipped}
                    <span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-900/80 text-indigo-300 border border-indigo-700/60 font-mono">
                      EQUIPPED
                    </span>
                  {/if}
                </div>
                <div class="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                  <span class="capitalize">{item.type}</span>
                  {#if item.weight}
                    <span>•</span>
                    <span>{(item.weight * item.quantity).toFixed(1)} lbs</span>
                  {/if}
                </div>
              </div>
            </div>

            <!-- Quantity Stepper -->
            <div class="flex items-center gap-1.5 bg-slate-950 px-2 py-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onclick={() => adjustQuantity(item.id, -1)}
                class="w-4 h-4 rounded text-slate-400 hover:text-white text-xs font-bold"
              >
                -
              </button>
              <span class="text-xs font-mono font-bold text-slate-200 min-w-[14px] text-center">
                {item.quantity}
              </span>
              <button
                type="button"
                onclick={() => adjustQuantity(item.id, 1)}
                class="w-4 h-4 rounded text-slate-400 hover:text-white text-xs font-bold"
              >
                +
              </button>
            </div>
          </div>

          <!-- Quick Action Buttons for Equipped Weapons / Potions -->
          {#if item.type === 'weapon'}
            <div class="flex items-center gap-2 pt-1 border-t border-slate-800/80">
              <div class="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                <span>To Hit: <strong class="text-emerald-400">{item.attackBonus !== undefined ? (item.attackBonus >= 0 ? `+${item.attackBonus}` : item.attackBonus) : '+0'}</strong></span>
                <span>•</span>
                <span>Dmg: <strong class="text-rose-400">{item.damage || '1d8'}</strong></span>
              </div>
              <button
                type="button"
                onclick={() => executeAttack(item)}
                class="ml-auto px-3 py-1 bg-rose-900/80 hover:bg-rose-800 text-rose-200 border border-rose-700/60 rounded-xl text-xs font-bold shadow-md transition-all active:scale-95 flex items-center gap-1.5"
              >
                <span>⚔️</span>
                <span>Attack</span>
              </button>
            </div>
          {:else if item.damage && item.type === 'potion'}
            <div class="flex items-center justify-between pt-1 border-t border-slate-800/80">
              <span class="text-[10px] text-slate-400 font-mono">Heals: <strong class="text-emerald-400">{item.damage}</strong></span>
              <button
                type="button"
                onclick={() => executeAttack(item)}
                class="px-3 py-1 bg-emerald-900/80 hover:bg-emerald-800 text-emerald-200 border border-emerald-700/60 rounded-xl text-xs font-bold shadow-md transition-all active:scale-95 flex items-center gap-1.5"
              >
                <span>🧪</span>
                <span>Drink</span>
              </button>
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</div>
