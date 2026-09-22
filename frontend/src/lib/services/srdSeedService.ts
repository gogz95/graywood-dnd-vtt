// src/lib/services/srdSeedService.ts
// Pure 5e SRD 5.1 Auto-Seeding Routine for Dexie Compendium

import { compendiumDb, type CompendiumMonster, type CompendiumSpell, type CompendiumItem } from '../db/compendiumDb';
import srdSeedData from '../data/srdCompendiumSeed.json';

export interface SrdSeedResult {
  seeded: boolean;
  monstersCount: number;
  spellsCount: number;
  itemsCount: number;
  reason: string;
}

/**
 * Checks Dexie compendium database. If tables are empty or clean campaign creation is detected,
 * populates Dexie with the static 5e SRD 5.1 baseline seed without overwriting existing custom homebrew.
 */
export async function seedSrdCompendiumIfEmpty(force = false): Promise<SrdSeedResult> {
  try {
    const currentMonsters = await compendiumDb.monsters.count();
    const currentSpells = await compendiumDb.spells.count();
    const currentItems = await compendiumDb.items.count();

    const isEmpty = currentMonsters === 0 && currentSpells === 0 && currentItems === 0;

    if (!force && !isEmpty) {
      return {
        seeded: false,
        monstersCount: currentMonsters,
        spellsCount: currentSpells,
        itemsCount: currentItems,
        reason: 'Compendium already populated; existing user entities preserved non-destructively.',
      };
    }

    // Populate missing tables transactionally
    await compendiumDb.transaction(
      'rw',
      [compendiumDb.monsters, compendiumDb.spells, compendiumDb.items, compendiumDb.campaignFlags],
      async () => {
        if (currentMonsters === 0 || force) {
          await compendiumDb.monsters.bulkPut(srdSeedData.monsters as unknown as CompendiumMonster[]);
        }
        if (currentSpells === 0 || force) {
          await compendiumDb.spells.bulkPut(srdSeedData.spells as unknown as CompendiumSpell[]);
        }
        if (currentItems === 0 || force) {
          await compendiumDb.items.bulkPut(srdSeedData.items as unknown as CompendiumItem[]);
        }

        await compendiumDb.campaignFlags.put({
          key: 'package:srd-5.1-core',
          value: {
            id: 'srd-5.1-core',
            name: 'System Reference Document 5.1 (Core)',
            version: '5.1.0',
            sourceBook: 'SRD 5.1',
            importedAt: new Date().toISOString(),
            monsterCount: srdSeedData.monsters.length,
            spellCount: srdSeedData.spells.length,
            classCount: 0,
          }
        });
      }
    );

    const finalMonsters = await compendiumDb.monsters.count();
    const finalSpells = await compendiumDb.spells.count();
    const finalItems = await compendiumDb.items.count();

    return {
      seeded: true,
      monstersCount: finalMonsters,
      spellsCount: finalSpells,
      itemsCount: finalItems,
      reason: 'Successfully seeded 5e SRD 5.1 core monsters, spells, and items.',
    };
  } catch (err) {
    console.error('Failed to seed 5e SRD compendium baseline:', err);
    return {
      seeded: false,
      monstersCount: 0,
      spellsCount: 0,
      itemsCount: 0,
      reason: err instanceof Error ? err.message : 'Unknown database seeding error',
    };
  }
}
