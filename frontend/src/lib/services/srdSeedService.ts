// src/lib/services/srdSeedService.ts
// Pure 5e SRD 5.1 Auto-Seeding Routine for Dexie Compendium

import {
  compendiumDb,
  SRD_RULES,
  type CompendiumMonster,
  type CompendiumSpell,
  type CompendiumItem,
  type CompendiumRule
} from '../db/compendiumDb';


export interface SrdSeedResult {
  seeded: boolean;
  monstersCount: number;
  spellsCount: number;
  itemsCount: number;
  rulesCount?: number;
  reason: string;
}

export interface CompendiumStats {
  totalSpells: number;
  totalMonsters: number;
  totalItems: number;
  totalRules?: number;
}

/**
 * Checks Dexie compendium database. If tables are empty or clean campaign creation is detected,
 * populates Dexie with the static 5e SRD 5.1 baseline seed without overwriting existing custom homebrew.
 * Ingestion is fully idempotent via bulkPut / upsert.
 */
export async function seedSrdCompendiumIfEmpty(force = false): Promise<SrdSeedResult> {
  try {
    const currentMonsters = await compendiumDb.monsters.count();
    const currentSpells = await compendiumDb.spells.count();
    const currentItems = await compendiumDb.items.count();
    const currentRules = compendiumDb.rules ? await compendiumDb.rules.count() : 0;

    const isEmpty = currentMonsters === 0 && currentSpells === 0 && currentItems === 0;

    if (!force && !isEmpty) {
      return {
        seeded: false,
        monstersCount: currentMonsters,
        spellsCount: currentSpells,
        itemsCount: currentItems,
        rulesCount: currentRules,
        reason: 'Compendium already populated; existing user entities preserved non-destructively.',
      };
    }

    // Populate missing tables transactionally
    const { default: srdSeedData } = await import('../data/srdCompendiumSeed.json');

    await compendiumDb.transaction(
      'rw',
      [compendiumDb.monsters, compendiumDb.spells, compendiumDb.items, compendiumDb.rules, compendiumDb.campaignFlags],
      async () => {
        if (currentMonsters === 0 || force) {
          await compendiumDb.monsters.bulkPut(srdSeedData.monsters as unknown as CompendiumMonster[]);
        }
        if (currentSpells === 0 || force) {
          const normalizedSpells: CompendiumSpell[] = (srdSeedData.spells as any[]).map((s) => ({
            ...s,
            casting_time: s.casting_time || s.castingTime,
            concentration: s.concentration ?? s.duration?.toLowerCase().includes('concentration') ?? false,
            ritual: s.ritual ?? false,
          }));
          await compendiumDb.spells.bulkPut(normalizedSpells);
        }
        if (currentItems === 0 || force) {
          await compendiumDb.items.bulkPut(srdSeedData.items as unknown as CompendiumItem[]);
        }
        if (currentRules === 0 || force) {
          await compendiumDb.rules.bulkPut(SRD_RULES);
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
    const finalRules = compendiumDb.rules ? await compendiumDb.rules.count() : 0;

    return {
      seeded: true,
      monstersCount: finalMonsters,
      spellsCount: finalSpells,
      itemsCount: finalItems,
      rulesCount: finalRules,
      reason: 'Successfully seeded 5e SRD 5.1 core monsters, spells, and items.',
    };
  } catch (err) {
    console.error('Failed to seed 5e SRD compendium baseline:', err);
    return {
      seeded: false,
      monstersCount: 0,
      spellsCount: 0,
      itemsCount: 0,
      rulesCount: 0,
      reason: err instanceof Error ? err.message : 'Unknown database seeding error',
    };
  }
}

/**
 * Returns simple compendium record counts for spells, monsters, items, and rules.
 */
export async function getCompendiumStats(): Promise<CompendiumStats> {
  const [totalSpells, totalMonsters, totalItems, totalRules] = await Promise.all([
    compendiumDb.spells.count(),
    compendiumDb.monsters.count(),
    compendiumDb.items.count(),
    compendiumDb.rules ? compendiumDb.rules.count() : 0,
  ]);

  return { totalSpells, totalMonsters, totalItems, totalRules };
}
