import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { compendiumDb } from '../db/compendiumDb';
import { seedSrdCompendiumIfEmpty, getCompendiumStats } from './srdSeedService';

describe('5e SRD 5.1 Indexed Compendium Store & Seeding Service', () => {
  beforeEach(async () => {
    await compendiumDb.spells.clear();
    await compendiumDb.monsters.clear();
    await compendiumDb.items.clear();
    await compendiumDb.rules.clear();
    await compendiumDb.campaignFlags.clear();
  });

  it('verifies Dexie tables and compound indexes for fast filtering', async () => {
    // 1. Verify schema tables exist
    expect(compendiumDb.spells).toBeDefined();
    expect(compendiumDb.monsters).toBeDefined();
    expect(compendiumDb.items).toBeDefined();
    expect(compendiumDb.rules).toBeDefined();

    // 2. Insert records with indexed fields
    await compendiumDb.spells.put({
      id: 'spell-magic-missile',
      name: 'Magic Missile',
      level: 1,
      school: 'Evocation',
      castingTime: '1 action',
      casting_time: '1 action',
      range: '120 feet',
      components: 'V, S',
      duration: 'Instantaneous',
      concentration: false,
      ritual: false,
      description: 'Darts of force strike targets.',
      origin: 'SRD-5.1',
    });

    await compendiumDb.monsters.put({
      id: 'monster-goblin',
      name: 'Goblin',
      cr: 0.25,
      size: 'Small',
      type: 'humanoid',
      alignment: 'neutral evil',
      ac: 15,
      hp: 7,
      origin: 'SRD-5.1',
    });

    await compendiumDb.items.put({
      id: 'item-longsword',
      name: 'Longsword',
      type: 'Martial Weapon',
      rarity: 'Common',
      cost: '15 gp',
      weight: 3,
      description: 'A versatile blade.',
      origin: 'SRD-5.1',
    });

    await compendiumDb.rules.put({
      id: 'rule-combat-order',
      title: 'Order of Combat',
      category: 'Combat',
      slug: 'order-of-combat',
      content: 'Combat proceeds in rounds and turns.',
      origin: 'SRD-5.1',
    });

    // 3. Test queries using individual indexes
    const foundSpells = await compendiumDb.spells.where('level').equals(1).toArray();
    expect(foundSpells.length).toBe(1);
    expect(foundSpells[0].name).toBe('Magic Missile');
    expect(foundSpells[0].casting_time).toBe('1 action');

    const foundMonsters = await compendiumDb.monsters.where('cr').equals(0.25).toArray();
    expect(foundMonsters.length).toBe(1);
    expect(foundMonsters[0].name).toBe('Goblin');

    const foundItems = await compendiumDb.items.where('type').equals('Martial Weapon').toArray();
    expect(foundItems.length).toBe(1);
    expect(foundItems[0].name).toBe('Longsword');

    const foundRules = await compendiumDb.rules.where('category').equals('Combat').toArray();
    expect(foundRules.length).toBe(1);
    expect(foundRules[0].title).toBe('Order of Combat');

    // 4. Test compound index querying
    const compoundSpell = await compendiumDb.spells.where(['school', 'level']).equals(['Evocation', 1]).first();
    expect(compoundSpell).toBeDefined();
    expect(compoundSpell?.id).toBe('spell-magic-missile');

    const compoundMonster = await compendiumDb.monsters.where(['type', 'cr']).equals(['humanoid', 0.25]).first();
    expect(compoundMonster).toBeDefined();
    expect(compoundMonster?.id).toBe('monster-goblin');

    const compoundItem = await compendiumDb.items.where(['type', 'rarity']).equals(['Martial Weapon', 'Common']).first();
    expect(compoundItem).toBeDefined();
    expect(compoundItem?.id).toBe('item-longsword');

    const compoundRule = await compendiumDb.rules.where(['category', 'title']).equals(['Combat', 'Order of Combat']).first();
    expect(compoundRule).toBeDefined();
    expect(compoundRule?.slug).toBe('order-of-combat');
  });

  it('executes idempotent seeding without duplicating records', async () => {
    // Initial seed
    const res1 = await seedSrdCompendiumIfEmpty(true);
    expect(res1.seeded).toBe(true);
    expect(res1.spellsCount).toBeGreaterThan(0);
    expect(res1.monstersCount).toBeGreaterThan(0);
    expect(res1.itemsCount).toBeGreaterThan(0);

    const stats1 = await getCompendiumStats();
    expect(stats1.totalSpells).toBe(res1.spellsCount);
    expect(stats1.totalMonsters).toBe(res1.monstersCount);
    expect(stats1.totalItems).toBe(res1.itemsCount);

    // Second seed without force (should be idempotent no-op)
    const res2 = await seedSrdCompendiumIfEmpty(false);
    expect(res2.seeded).toBe(false);

    const stats2 = await getCompendiumStats();
    expect(stats2.totalSpells).toBe(stats1.totalSpells);
    expect(stats2.totalMonsters).toBe(stats1.totalMonsters);
    expect(stats2.totalItems).toBe(stats1.totalItems);

    // Third seed with force (should bulkPut/upsert without duplicates)
    const res3 = await seedSrdCompendiumIfEmpty(true);
    expect(res3.seeded).toBe(true);

    const stats3 = await getCompendiumStats();
    expect(stats3.totalSpells).toBe(stats1.totalSpells);
    expect(stats3.totalMonsters).toBe(stats1.totalMonsters);
    expect(stats3.totalItems).toBe(stats1.totalItems);
  });
});
