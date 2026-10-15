// frontend/src/plugins/crafting/stores/craftingStore.svelte.ts
// Svelte 5 Downtime & Alchemical Crafting Store with Entity Blackboard API

export type ElementalEssenceType = 'Fire' | 'Water' | 'Earth' | 'Air' | 'Quintessence';

export interface CraftingRecipe {
  id: string;
  name: string;
  tier: number;
  primaryEssence: ElementalEssenceType;
  secondaryEssence?: ElementalEssenceType;
  requiredPoints: number;
  baseVolatility: number; // 0 - 100 percentage
  outputItemId: string;
  description: string;
}

export interface ItemDurability {
  itemId: string;
  currentRp: number; // Resistance points
  maxRp: number;
  isBroken: boolean;
  wearLevel: number;
}

export interface CraftingBlackboardData {
  learnedRecipeIds: string[];
  essenceInventory: Record<ElementalEssenceType, number>;
  activeExperiment: {
    recipeId: string;
    progressHours: number;
    volatilityRisk: number;
  } | null;
  durabilityLedger: Record<string, ItemDurability>;
}

export const DEFAULT_RECIPES: CraftingRecipe[] = [
  {
    id: 'potion_healing',
    name: 'Potion of Healing',
    tier: 1,
    primaryEssence: 'Water',
    secondaryEssence: 'Earth',
    requiredPoints: 5,
    baseVolatility: 10,
    outputItemId: 'potion-healing-std',
    description: 'Basic restorative brew healing 2d4+2 hit points.'
  },
  {
    id: 'alchemists_fire',
    name: "Alchemist's Fire",
    tier: 1,
    primaryEssence: 'Fire',
    secondaryEssence: 'Air',
    requiredPoints: 10,
    baseVolatility: 35,
    outputItemId: 'alchemists-fire-flask',
    description: 'Volatile adhesive fluid bursting into flame upon impact.'
  },
  {
    id: 'oil_of_slipperiness',
    name: 'Oil of Slipperiness',
    tier: 2,
    primaryEssence: 'Water',
    secondaryEssence: 'Air',
    requiredPoints: 20,
    baseVolatility: 20,
    outputItemId: 'oil-slipperiness',
    description: 'Frictionless lubricant providing Freedom of Movement effect.'
  },
  {
    id: 'philosophers_tincture',
    name: "Philosopher's Tincture",
    tier: 3,
    primaryEssence: 'Quintessence',
    secondaryEssence: 'Fire',
    requiredPoints: 50,
    baseVolatility: 60,
    outputItemId: 'philosophers-tincture',
    description: 'High-tier catalyst capable of transmuting base matter and recharging magic items.'
  }
];

export class CraftingStore {
  recipes = $state<CraftingRecipe[]>([...DEFAULT_RECIPES]);
  essences = $state<Record<ElementalEssenceType, number>>({
    Fire: 5,
    Water: 5,
    Earth: 5,
    Air: 5,
    Quintessence: 1
  });
  durabilityLedger = $state<Map<string, ItemDurability>>(new Map());
  selectedRecipeId = $state<string | null>('potion_healing');

  /**
   * Pure method calculating volatility risk based on essence balance and stabilizer quality.
   */
  public calculateVolatility(
    recipe: CraftingRecipe,
    ingredients: Array<{ essence: ElementalEssenceType; quality?: number }>
  ): number {
    let volatility = recipe.baseVolatility;

    const hasPrimary = ingredients.some((i) => i.essence === recipe.primaryEssence);
    if (!hasPrimary) {
      volatility += 40;
    }

    if (recipe.secondaryEssence) {
      const hasSecondary = ingredients.some((i) => i.essence === recipe.secondaryEssence);
      if (!hasSecondary) {
        volatility += 20;
      }
    }

    for (const ing of ingredients) {
      const quality = ing.quality ?? 1.0;
      if (quality > 1.0) {
        volatility -= Math.round((quality - 1.0) * 15);
      } else if (quality < 1.0) {
        volatility += Math.round((1.0 - quality) * 20);
      }
    }

    return Math.max(0, Math.min(100, volatility));
  }

  /**
   * Pure method applying wear to an item's Resistance Points ledger.
   */
  public applyWear(itemId: string, amount: number): ItemDurability {
    const existing = this.durabilityLedger.get(itemId) ?? {
      itemId,
      currentRp: 100,
      maxRp: 100,
      isBroken: false,
      wearLevel: 0
    };

    const nextRp = Math.max(0, existing.currentRp - amount);
    const isBroken = nextRp === 0;
    const wearLevel = Math.round(((existing.maxRp - nextRp) / existing.maxRp) * 100);

    const updated: ItemDurability = {
      ...existing,
      currentRp: nextRp,
      isBroken,
      wearLevel
    };

    const nextMap = new Map(this.durabilityLedger);
    nextMap.set(itemId, updated);
    this.durabilityLedger = nextMap;

    return updated;
  }

  /**
   * Reads custom crafting state from an entity blackboard (token.metadata['crafting'] or actor.metadata['crafting']).
   */
  public readFromBlackboard(entity: { metadata?: Record<string, unknown> }): CraftingBlackboardData | null {
    if (!entity.metadata || !entity.metadata['crafting']) {
      return null;
    }
    try {
      return entity.metadata['crafting'] as CraftingBlackboardData;
    } catch {
      return null;
    }
  }

  /**
   * Writes crafting state to an entity blackboard.
   */
  public writeToBlackboard(
    entity: { metadata?: Record<string, unknown> },
    data: Partial<CraftingBlackboardData>
  ): void {
    if (!entity.metadata) {
      entity.metadata = {};
    }
    const current = (entity.metadata['crafting'] as CraftingBlackboardData) || {
      learnedRecipeIds: this.recipes.map((r) => r.id),
      essenceInventory: { ...this.essences },
      activeExperiment: null,
      durabilityLedger: Object.fromEntries(this.durabilityLedger.entries())
    };

    entity.metadata['crafting'] = {
      ...current,
      ...data
    };
  }

  public syncFromEntity(entity: { metadata?: Record<string, unknown> }): void {
    const data = this.readFromBlackboard(entity);
    if (!data) return;

    if (data.essenceInventory) {
      this.essences = { ...this.essences, ...data.essenceInventory };
    }
    if (data.durabilityLedger) {
      this.durabilityLedger = new Map(Object.entries(data.durabilityLedger));
    }
  }

  public syncToEntity(entity: { metadata?: Record<string, unknown> }): void {
    this.writeToBlackboard(entity, {
      essenceInventory: { ...this.essences },
      durabilityLedger: Object.fromEntries(this.durabilityLedger.entries())
    });
  }
}

export const craftingStore = new CraftingStore();
