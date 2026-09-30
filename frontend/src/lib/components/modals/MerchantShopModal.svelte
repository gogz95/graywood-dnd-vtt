<!-- frontend/src/lib/components/modals/MerchantShopModal.svelte -->
<!-- Procedural 5e Merchant Shop Generator & Transaction Drawer (the-dms-marketplace pattern) -->

<script lang="ts">
  import { get } from 'svelte/store';
  import type { CustomItemDefinition, ItemType, ItemRarity } from '../../types/item';
  import { characterStore, inventoryStore, currencyStore } from '../../../stores/characterStore';
  import type { InventoryItem, Character } from '../../types/character';
  import { generateName } from '../../services/generators/markovNameGen';
  import { forgeMagicItem } from '../../services/generators/magicItemForge';

  export type ShopType = 'Blacksmith' | 'Herbalist/Alchemist' | 'General Store' | 'Arcane Emissary';
  export type SettlementTier = 'Village' | 'Town' | 'City';

  export interface MerchantProfile {
    name: string;
    shopName: string;
    shopType: ShopType;
    settlement: SettlementTier;
    disposition: string;
  }

  export interface ShopInventoryItem extends CustomItemDefinition {
    stock: number;
    finalPriceGp: number;
  }

  let { isOpen = $bindable(false) }: { isOpen?: boolean } = $props();

  let shopType = $state<ShopType>('Blacksmith');
  let settlement = $state<SettlementTier>('Town');
  let markupMultiplier = $state<number>(1.0);
  let searchQuery = $state<string>('');
  let statusMessage = $state<string | null>(null);
  let isPurchasing = $state<boolean>(false);

  // Merchant info & inventory
  let merchant = $state<MerchantProfile>(generateMerchantProfile('Blacksmith', 'Town'));
  let inventory = $state<ShopInventoryItem[]>([]);

  export function open() {
    isOpen = true;
    if (inventory.length === 0) {
      regenerateShop();
    }
  }

  export function close() {
    isOpen = false;
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  function generateMerchantProfile(type: ShopType, tier: SettlementTier): MerchantProfile {
    const ownerName = generateName('common', 4, 10);
    const shopNames: Record<ShopType, string[]> = {
      Blacksmith: ['The Iron Anvil', 'Sunder & Spark Forge', 'Gilded Crucible', 'Bellows & Steel Works'],
      'Herbalist/Alchemist': ['Brimstone & Elixirs', 'Verdant Mortar Pharmacy', 'The Distilled Willow', 'Alembic & Herbarium'],
      'General Store': ['Wayfarer’s Provisions', 'The Sundry Crate', 'Crossroads Outpost', 'Parchment & Packs'],
      'Arcane Emissary': ['The Astral Arcanum', 'Glyph & Relic Vault', 'The Gilded Grimoire', 'Sanctum Curiosities']
    };

    const dispositions = [
      'Firm negotiator who taps a brass balance scale when pricing goods.',
      'Garrulous merchant who shares local rumors and offers mulled cider.',
      'Gruff veteran who inspects every coin with a keen magnifying lens.',
      'Shrewd broker who claims everything in stock came from fallen knights.',
      'Humble artisan who takes genuine pride in flawless toolcraft.'
    ];

    const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

    return {
      name: ownerName,
      shopName: pick(shopNames[type]),
      shopType: type,
      settlement: tier,
      disposition: pick(dispositions)
    };
  }

  function generateStandardItems(type: ShopType): Array<Partial<CustomItemDefinition>> {
    switch (type) {
      case 'Blacksmith':
        return [
          { name: 'Longsword', type: 'weapon', category: 'Martial Melee', rarity: 'Common', weight: 3, costGp: 15, damageFormula: '1d8', damageType: 'slashing', description: 'Sturdy carbon-steel blade with a wrapped leather hilt.' },
          { name: 'Shortsword', type: 'weapon', category: 'Martial Melee', rarity: 'Common', weight: 2, costGp: 10, damageFormula: '1d6', damageType: 'piercing', description: 'Double-edged thrusting sword.' },
          { name: 'Battleaxe', type: 'weapon', category: 'Martial Melee', rarity: 'Common', weight: 4, costGp: 10, damageFormula: '1d8', damageType: 'slashing', description: 'Broad bearded axe designed for breaking defenses.' },
          { name: 'Greatsword', type: 'weapon', category: 'Martial Melee', rarity: 'Common', weight: 6, costGp: 50, damageFormula: '2d6', damageType: 'slashing', description: 'Two-handed heavy blade.' },
          { name: 'Shield', type: 'armor', category: 'Shield', rarity: 'Common', weight: 6, costGp: 10, acBonus: 2, description: 'Iron-rimmed oak heater shield (+2 AC).' },
          { name: 'Chain Shirt', type: 'armor', category: 'Medium Armor', rarity: 'Common', weight: 20, costGp: 50, acBonus: 13, description: 'Interlocking metal rings worn between layers of clothing.' },
          { name: 'Breastplate', type: 'armor', category: 'Medium Armor', rarity: 'Common', weight: 20, costGp: 400, acBonus: 14, description: 'Fitted metal chest plate with leather straps.' },
          { name: 'Whetstone & Oil', type: 'gear', category: 'Maintenance', rarity: 'Common', weight: 1, costGp: 1, description: 'Keeps edged weapons sharp and rust-free.' }
        ];
      case 'Herbalist/Alchemist':
        return [
          { name: 'Potion of Healing', type: 'potion', category: 'Consumable', rarity: 'Common', weight: 0.5, costGp: 50, description: 'Magical red liquid. Regains 2d4 + 2 hit points when consumed.' },
          { name: 'Antitoxin', type: 'potion', category: 'Consumable', rarity: 'Common', weight: 0.5, costGp: 50, description: 'Grants advantage on saving throws against poison for 1 hour.' },
          { name: 'Alchemist’s Fire (flask)', type: 'gear', category: 'Explosive', rarity: 'Common', weight: 1, costGp: 50, description: 'Sticky, adhesive fluid that ignites on contact with air (1d4 fire/round).' },
          { name: 'Herbalism Kit', type: 'gear', category: 'Tools', rarity: 'Common', weight: 3, costGp: 5, description: 'Pouches, clippers, pestle and mortar for gathering and concocting salves.' },
          { name: 'Healer’s Kit', type: 'gear', category: 'Medical', rarity: 'Common', weight: 3, costGp: 5, description: 'Ten uses. Bandages, salves, and splints to stabilize dying creatures without a check.' },
          { name: 'Vial of Pure Spring Water', type: 'ingredient', category: 'Crafting', rarity: 'Common', weight: 0.2, costGp: 2, description: 'Alchemically distilled water used as a solvent.' }
        ];
      case 'General Store':
        return [
          { name: 'Hempen Rope (50 feet)', type: 'gear', category: 'Adventuring Gear', rarity: 'Common', weight: 10, costGp: 1, description: 'Strong twisted fiber rope with 2 HP.' },
          { name: 'Torch (bundle of 5)', type: 'gear', category: 'Illumination', rarity: 'Common', weight: 5, costGp: 1, description: 'Burns for 1 hour, shedding bright light in a 20-foot radius.' },
          { name: 'Rations (1 day)', type: 'gear', category: 'Provisions', rarity: 'Common', weight: 2, costGp: 0.5, description: 'Dry provisions: jerky, dried fruit, hardtack, and nuts.' },
          { name: 'Backpack', type: 'gear', category: 'Container', rarity: 'Common', weight: 5, costGp: 2, description: 'Can hold 1 cubic foot or 30 pounds of gear.' },
          { name: 'Bedroll', type: 'gear', category: 'Camp Gear', rarity: 'Common', weight: 7, costGp: 1, description: 'Wool blanket and waterproof oiled canvas.' },
          { name: 'Crowbar', type: 'gear', category: 'Tools', rarity: 'Common', weight: 5, costGp: 2, description: 'Grants advantage on Strength checks where leverage applies.' },
          { name: 'Tinderbox', type: 'gear', category: 'Utility', rarity: 'Common', weight: 1, costGp: 0.5, description: 'Flint, fire steel, and tinder used to ignite fires.' }
        ];
      case 'Arcane Emissary':
        return [
          { name: 'Spell Scroll (1st Level: Shield)', type: 'scroll', category: 'Scroll', rarity: 'Common', weight: 0.1, costGp: 75, description: 'Contains the arcane formula for the Shield reaction spell.' },
          { name: 'Spell Scroll (2nd Level: Misty Step)', type: 'scroll', category: 'Scroll', rarity: 'Uncommon', weight: 0.1, costGp: 200, description: 'Teleport up to 30 feet to an unoccupied space you can see.' },
          { name: 'Component Pouch', type: 'gear', category: 'Spellcasting Focus', rarity: 'Common', weight: 2, costGp: 25, description: 'Holds all material components without specific gold costs.' },
          { name: 'Arcane Focus (Crystal)', type: 'gear', category: 'Spellcasting Focus', rarity: 'Common', weight: 1, costGp: 10, description: 'A faceted quartz prism channeled to cast arcane spells.' }
        ];
    }
  }

  function regenerateShop() {
    merchant = generateMerchantProfile(shopType, settlement);

    const baseList = generateStandardItems(shopType);
    const result: ShopInventoryItem[] = [];

    // Settlement item limits
    let standardCount = 5;
    let magicCount = 1;
    let maxMagicRarity: ItemRarity = 'Uncommon';

    if (settlement === 'Village') {
      standardCount = 4;
      magicCount = 1;
      maxMagicRarity = 'Common';
    } else if (settlement === 'Town') {
      standardCount = 7;
      magicCount = 3;
      maxMagicRarity = 'Rare';
    } else {
      // City
      standardCount = 10;
      magicCount = 6;
      maxMagicRarity = 'Very Rare';
    }

    // Add standard goods
    for (let i = 0; i < Math.min(standardCount, baseList.length); i++) {
      const item = baseList[i];
      const baseCost = item.costGp || 10;
      result.push({
        id: `shop-item-${Date.now()}-${i}`,
        name: item.name || 'Standard Item',
        type: item.type || 'gear',
        category: item.category || 'General',
        rarity: item.rarity || 'Common',
        weight: item.weight || 1,
        costGp: baseCost,
        finalPriceGp: Math.max(1, Math.round(baseCost * markupMultiplier)),
        description: item.description || '',
        damageFormula: item.damageFormula,
        damageType: item.damageType,
        acBonus: item.acBonus,
        source: 'srd',
        stock: Math.floor(Math.random() * 5) + 1
      });
    }

    // Add procedurally forged magic items
    for (let m = 0; m < magicCount; m++) {
      const forged = forgeMagicItem({
        maxRarity: maxMagicRarity,
        type: shopType === 'Blacksmith' ? (Math.random() > 0.5 ? 'weapon' : 'armor') : (shopType === 'Arcane Emissary' ? 'wondrous' : undefined)
      });
      const baseCost = forged.costGp || 100;
      result.push({
        ...forged,
        stock: 1,
        finalPriceGp: Math.max(1, Math.round(baseCost * markupMultiplier))
      });
    }

    inventory = result;
    statusMessage = `Restocked "${merchant.shopName}" with ${inventory.length} items.`;
    setTimeout(() => {
      statusMessage = null;
    }, 3000);
  }

  function updatePricesForMarkup() {
    inventory = inventory.map((item) => ({
      ...item,
      finalPriceGp: Math.max(1, Math.round((item.costGp || 10) * markupMultiplier))
    }));
  }

  async function handlePurchase(item: ShopInventoryItem) {
    if (item.stock <= 0) {
      statusMessage = `"${item.name}" is out of stock.`;
      return;
    }

    isPurchasing = true;
    try {
      const currentChar = get(characterStore);
      const price = item.finalPriceGp;

      if (currentChar) {
        // Compute current character gold equivalent
        const wallet = currentChar.currency || { cp: 0, sp: 0, gp: 0, pp: 0 };
        const totalCharGold = (wallet.gp || 0) + (wallet.pp || 0) * 10 + (wallet.sp || 0) / 10 + (wallet.cp || 0) / 100;

        if (totalCharGold < price) {
          statusMessage = `Insufficient funds: ${currentChar.name} has ~${Math.floor(totalCharGold)} GP, but item costs ${price} GP.`;
          isPurchasing = false;
          return;
        }

        // Deduct from GP / currency
        let remainingToDeduct = price;
        let newGp = wallet.gp || 0;
        let newPp = wallet.pp || 0;

        if (newGp >= remainingToDeduct) {
          newGp -= remainingToDeduct;
        } else {
          remainingToDeduct -= newGp;
          newGp = 0;
          const ppNeeded = Math.ceil(remainingToDeduct / 10);
          newPp = Math.max(0, newPp - ppNeeded);
          newGp += (ppNeeded * 10) - remainingToDeduct;
        }

        characterStore.update((c) => (c ? { ...c, currency: { ...wallet, gp: newGp, pp: newPp } } : null));

        // Deduct in currencyStore as well if applicable
        currencyStore.update((curr) => ({
          ...curr,
          concord_sovereigns: Math.max(0, curr.concord_sovereigns - price),
          updated_at: Date.now()
        }));

        // Add to inventoryStore
        const newInvItem: InventoryItem = {
          id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          character_id: currentChar.id,
          name: item.name,
          quantity: 1,
          weight_lbs: item.weight,
          current_rp: item.currentRp || 40,
          max_rp: item.maxRp || 40,
          is_preserved: true,
          harvest_timestamp: null,
          base_value_cp: price * 100,
          is_spoiled: false
        };

        inventoryStore.update((inv) => [newInvItem, ...inv]);

        // Decrement shop stock
        item.stock -= 1;
        statusMessage = `Purchased "${item.name}" for ${price} GP! Transferred to ${currentChar.name}'s sheet.`;
      } else {
        // DM guest buy
        item.stock -= 1;
        statusMessage = `Acquired "${item.name}" for ${price} GP (Direct DM Transfer).`;
      }

      setTimeout(() => {
        statusMessage = null;
      }, 4000);
    } catch (err) {
      statusMessage = 'Transaction failed.';
    } finally {
      isPurchasing = false;
    }
  }

  let filteredInventory = $derived(
    inventory.filter((item) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q) || item.rarity.toLowerCase().includes(q);
    })
  );
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if isOpen}
  <div class="shop-backdrop" onclick={close} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="shop-window"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label="Merchant Marketplace"
      tabindex="-1"
    >
      <!-- Shop Header -->
      <div class="shop-header">
        <div class="header-titles">
          <div class="shop-icon">⚖️</div>
          <div>
            <h2>{merchant.shopName}</h2>
            <span class="subtitle">{merchant.shopType} • {merchant.name}, Proprietor ({merchant.settlement})</span>
          </div>
        </div>
        <button class="close-btn" onclick={close} title="Close (Esc)">×</button>
      </div>

      <!-- Merchant Lore Ribbon -->
      <div class="merchant-ribbon">
        <span class="ribbon-label">Merchant Disposition:</span>
        <span class="ribbon-text">{merchant.disposition}</span>
      </div>

      <!-- Controls Toolbar -->
      <div class="shop-toolbar">
        <div class="toolbar-item">
          <label for="shop-type-select">Shop Specialization</label>
          <select id="shop-type-select" bind:value={shopType} onchange={regenerateShop}>
            <option value="Blacksmith">Blacksmith (Weapons & Armor)</option>
            <option value="Herbalist/Alchemist">Herbalist / Alchemist (Potions & Reagents)</option>
            <option value="General Store">General Store (Adventuring Supplies)</option>
            <option value="Arcane Emissary">Arcane Emissary (Scrolls & Relics)</option>
          </select>
        </div>

        <div class="toolbar-item">
          <label for="shop-settlement-select">Settlement Economy</label>
          <select id="shop-settlement-select" bind:value={settlement} onchange={regenerateShop}>
            <option value="Village">Village (Modest, up to 100 GP)</option>
            <option value="Town">Town (Prosperous, up to 2,500 GP)</option>
            <option value="City">Metropolis (Extensive, Relics)</option>
          </select>
        </div>

        <div class="toolbar-item">
          <label for="shop-markup-select">Haggling / Markup</label>
          <select
            id="shop-markup-select"
            bind:value={markupMultiplier}
            onchange={updatePricesForMarkup}
          >
            <option value={0.8}>Friendly / Favored (80% Cost)</option>
            <option value={1.0}>Fair Market (100% Cost)</option>
            <option value={1.2}>Scarce / Tense (120% Cost)</option>
            <option value={1.5}>Extortion / Crisis (150% Cost)</option>
          </select>
        </div>

        <button class="restock-btn" onclick={regenerateShop} title="Reroll merchant inventory">
          🔄 Restock Shop
        </button>
      </div>

      <!-- Status Banner -->
      {#if statusMessage}
        <div class="status-banner">
          <span>{statusMessage}</span>
        </div>
      {/if}

      <!-- Search & Filters -->
      <div class="search-bar">
        <input
          type="text"
          placeholder="Filter merchandise by name, rarity, category..."
          bind:value={searchQuery}
        />
        <span class="inventory-count">{filteredInventory.length} item(s)</span>
      </div>

      <!-- Inventory Table Body -->
      <div class="inventory-scroll">
        <div class="items-grid">
          {#each filteredInventory as item}
            <div class="item-card {item.rarity.toLowerCase().replace(' ', '-')}">
              <div class="item-header">
                <div class="item-name-group">
                  <h4 class="item-name">{item.name}</h4>
                  <span class="item-meta">{item.category} • {item.rarity}</span>
                </div>
                <div class="item-price-badge">
                  <span class="price-val">{item.finalPriceGp}</span>
                  <span class="price-unit">GP</span>
                </div>
              </div>

              <p class="item-desc">{item.description}</p>

              {#if item.properties && item.properties.length > 0}
                <div class="property-tags">
                  {#each item.properties as prop}
                    <span class="tag">{prop}</span>
                  {/each}
                  {#if item.requiresAttunement}
                    <span class="tag attune">Attunement</span>
                  {/if}
                </div>
              {/if}

              <div class="item-footer">
                <span class="stock-label">Stock: <strong>{item.stock}</strong></span>
                <button
                  class="buy-btn"
                  onclick={() => handlePurchase(item)}
                  disabled={item.stock <= 0 || isPurchasing}
                >
                  {item.stock <= 0 ? 'Sold Out' : 'Sell to Actor'}
                </button>
              </div>
            </div>
          {/each}
        </div>
      </div>

      <!-- Footer -->
      <div class="shop-modal-footer">
        <div class="char-status">
          {#if $characterStore}
            <span>Active Actor: <strong>{$characterStore.name}</strong> • Funds: <strong>{$characterStore.currency?.gp || 0} GP</strong></span>
          {:else}
            <span class="guest-text">No active character sheet selected. Items will be transferred in DM mode.</span>
          {/if}
        </div>
        <button class="close-footer-btn" onclick={close}>Done</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .shop-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
  }

  .shop-window {
    width: 100%;
    max-width: 900px;
    max-height: 90vh;
    background: #11141b;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.6);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: #e2e8f0;
    font-family: inherit;
  }

  .shop-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    background: rgba(255, 255, 255, 0.03);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .header-titles {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .shop-icon {
    font-size: 1.6rem;
  }

  .header-titles h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
    color: #f8fafc;
  }

  .subtitle {
    font-size: 0.8rem;
    color: #94a3b8;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    border-radius: 6px;
  }

  .close-btn:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.1);
  }

  .merchant-ribbon {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1.25rem;
    background: rgba(99, 102, 241, 0.1);
    border-bottom: 1px solid rgba(99, 102, 241, 0.2);
    font-size: 0.82rem;
  }

  .ribbon-label {
    font-weight: 600;
    color: #818cf8;
    text-transform: uppercase;
    font-size: 0.72rem;
  }

  .ribbon-text {
    color: #c7d2fe;
    font-style: italic;
  }

  .shop-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 0.75rem;
    padding: 0.75rem 1.25rem;
    background: rgba(15, 23, 42, 0.6);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .toolbar-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: 1;
    min-width: 140px;
  }

  .toolbar-item label {
    font-size: 0.7rem;
    font-weight: 600;
    color: #94a3b8;
    text-transform: uppercase;
  }

  .toolbar-item select {
    background: #1e293b;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    color: #f1f5f9;
    padding: 0.4rem 0.6rem;
    font-size: 0.82rem;
    outline: none;
  }

  .restock-btn {
    background: #334155;
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #f8fafc;
    padding: 0.45rem 0.85rem;
    font-size: 0.82rem;
    font-weight: 600;
    border-radius: 6px;
    cursor: pointer;
    height: 32px;
  }

  .restock-btn:hover {
    background: #475569;
  }

  .status-banner {
    background: rgba(34, 197, 94, 0.15);
    border-bottom: 1px solid rgba(34, 197, 94, 0.3);
    color: #4ade80;
    padding: 0.45rem 1.25rem;
    font-size: 0.82rem;
    font-weight: 500;
  }

  .search-bar {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.6rem 1.25rem;
    background: rgba(255, 255, 255, 0.02);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .search-bar input {
    flex: 1;
    background: #0f172a;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 6px;
    padding: 0.45rem 0.75rem;
    color: #f1f5f9;
    font-size: 0.85rem;
    outline: none;
  }

  .search-bar input:focus {
    border-color: #6366f1;
  }

  .inventory-count {
    font-size: 0.78rem;
    color: #94a3b8;
  }

  .inventory-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 1.25rem;
  }

  .items-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 0.85rem;
  }

  .item-card {
    background: #1a1e29;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 0.85rem;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 0.6rem;
  }

  .item-card.uncommon { border-color: rgba(34, 197, 94, 0.3); }
  .item-card.rare { border-color: rgba(59, 130, 246, 0.35); }
  .item-card.very-rare { border-color: rgba(168, 85, 247, 0.4); }
  .item-card.legendary { border-color: rgba(245, 158, 11, 0.5); }

  .item-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .item-name {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 700;
    color: #f8fafc;
  }

  .item-meta {
    font-size: 0.72rem;
    color: #94a3b8;
  }

  .item-price-badge {
    background: rgba(234, 179, 8, 0.15);
    border: 1px solid rgba(234, 179, 8, 0.3);
    border-radius: 6px;
    padding: 0.2rem 0.5rem;
    display: flex;
    align-items: baseline;
    gap: 0.2rem;
    flex-shrink: 0;
  }

  .price-val {
    font-weight: 700;
    color: #facc15;
    font-size: 0.9rem;
  }

  .price-unit {
    font-size: 0.68rem;
    color: #ca8a04;
    font-weight: 600;
  }

  .item-desc {
    margin: 0;
    font-size: 0.78rem;
    color: #cbd5e1;
    line-height: 1.35;
    max-height: 4rem;
    overflow-y: auto;
  }

  .property-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  .tag {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    padding: 0.15rem 0.4rem;
    font-size: 0.68rem;
    color: #94a3b8;
  }

  .tag.attune {
    background: rgba(168, 85, 247, 0.15);
    border-color: rgba(168, 85, 247, 0.3);
    color: #c084fc;
  }

  .item-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 0.4rem;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }

  .stock-label {
    font-size: 0.75rem;
    color: #94a3b8;
  }

  .buy-btn {
    background: #4f46e5;
    border: 1px solid #6366f1;
    color: #ffffff;
    padding: 0.3rem 0.75rem;
    font-size: 0.78rem;
    font-weight: 600;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .buy-btn:hover:not(:disabled) {
    background: #4338ca;
  }

  .buy-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .shop-modal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1.25rem;
    background: rgba(255, 255, 255, 0.02);
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .char-status {
    font-size: 0.8rem;
    color: #94a3b8;
  }

  .guest-text {
    font-style: italic;
    color: #64748b;
  }

  .close-footer-btn {
    background: #334155;
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #f8fafc;
    padding: 0.35rem 0.9rem;
    border-radius: 6px;
    font-size: 0.82rem;
    cursor: pointer;
  }
</style>
