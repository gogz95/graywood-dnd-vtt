// seedLoader.ts — First-Run Seed Auto-Loader for IndexedDB Compendium
// On IndexedDB initialization, if table counts are 0, automatically loads
// default vanilla 5e seeds from homebrew/items/ and homebrew/monsters/.

import {
  weaponsSeed,
  armorSeed,
  reagentsSeed,
  monstersSeed
} from '../homebrew/seeds';
import {
  ingestHomebrewDataset,
  convertAdaptedToCompendiumEntity
} from '../rules/homebrewIngestionEngine';
import { DEFAULT_5E_CONFIG } from '../types/campaign';
import { importCompendiumJson, getCompendiumEntities } from '../importers/compendiumImporter';
import type { Raw5eItem, Raw5eMonster } from '../types/srdHomebrew';

export interface SeedLoaderResult {
  seeded: boolean;
  itemCount: number;
  monsterCount: number;
  totalAdded: number;
  error?: string;
}

/**
 * Checks IndexedDB compendium table; if empty, loads all plain seeds.
 */
export async function autoLoadFirstRunSeeds(): Promise<SeedLoaderResult> {
  try {
    const existing = await getCompendiumEntities();
    if (existing.length > 0) {
      return {
        seeded: false,
        itemCount: existing.filter(e => e.type === 'item').length,
        monsterCount: existing.filter(e => e.type === 'creature').length,
        totalAdded: 0,
      };
    }

    // Prepare seeds
    const rawItems: Raw5eItem[] = [
      ...(weaponsSeed as unknown as Raw5eItem[]),
      ...(armorSeed as unknown as Raw5eItem[]),
      ...(reagentsSeed as unknown as Raw5eItem[]),
    ];
    const rawMonsters: Raw5eMonster[] = monstersSeed as unknown as Raw5eMonster[];

    // Ingest under standard RAW 5e ruleset by default
    const { items: adaptedItems, monsters: adaptedMonsters } = ingestHomebrewDataset(
      { items: rawItems, monsters: rawMonsters },
      DEFAULT_5E_CONFIG
    );

    const entities = [
      ...adaptedItems.map(convertAdaptedToCompendiumEntity),
      ...adaptedMonsters.map(convertAdaptedToCompendiumEntity),
    ];

    const result = await importCompendiumJson(entities);

    return {
      seeded: true,
      itemCount: adaptedItems.length,
      monsterCount: adaptedMonsters.length,
      totalAdded: result.added,
    };
  } catch (err: any) {
    console.error('Failed to auto-load first-run compendium seeds:', err);
    return {
      seeded: false,
      itemCount: 0,
      monsterCount: 0,
      totalAdded: 0,
      error: err.message || 'Seed load failure',
    };
  }
}
