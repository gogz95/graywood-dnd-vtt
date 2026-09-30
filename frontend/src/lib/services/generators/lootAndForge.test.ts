// src/lib/services/generators/lootAndForge.test.ts
import { describe, it, expect } from 'vitest';
import {
  generateIndividualTreasure,
  generateTreasureHoard,
  generateLoot,
  parseCrBracket,
  rollDice
} from './lootGenerator';
import {
  forgeMagicItem,
  WEAPON_TEMPLATES,
  ARMOR_TEMPLATES,
  WONDROUS_TEMPLATES
} from './magicItemForge';
import {
  saveCompendiumItem,
  queryCustomItems,
  getCustomItems
} from '../../stores/compendiumStore';

describe('Phase 12: Procedural Loot Table Engine', () => {
  it('correctly maps CR values to standard 5e brackets', () => {
    expect(parseCrBracket(0)).toBe('0-4');
    expect(parseCrBracket(4)).toBe('0-4');
    expect(parseCrBracket(5)).toBe('5-10');
    expect(parseCrBracket(10)).toBe('5-10');
    expect(parseCrBracket(11)).toBe('11-16');
    expect(parseCrBracket(16)).toBe('11-16');
    expect(parseCrBracket(17)).toBe('17+');
    expect(parseCrBracket(24)).toBe('17+');
  });

  it('rolls dice algebra correctly', () => {
    const seeded = () => 0.5; // (floor(0.5 * 6) + 1) = 4
    const result = rollDice(3, 6, 10, seeded);
    expect(result).toBe(120); // 3 * 4 * 10
  });

  it('generates individual treasure across all CR brackets', () => {
    const brackets = [1, 7, 13, 20];
    for (const cr of brackets) {
      const loot = generateIndividualTreasure(cr);
      expect(loot.isHoard).toBe(false);
      expect(loot.coins.totalGpEquivalent).toBeGreaterThan(0);
      expect(loot.totalValueGp).toBe(loot.coins.totalGpEquivalent);
    }
  });

  it('generates treasure hoards with coins, gemstones, art, and magic items', () => {
    const hoard = generateTreasureHoard(8, undefined, 2);
    expect(hoard.isHoard).toBe(true);
    expect(hoard.crBracket).toBe('5-10');
    expect(hoard.coins.gp).toBeGreaterThan(0);
    expect(hoard.magicItems.length).toBe(2);
    expect(hoard.totalValueGp).toBeGreaterThan(0);

    for (const val of hoard.valuables) {
      expect(['gemstone', 'art']).toContain(val.type);
      expect(val.denominationGp).toBeGreaterThan(0);
      expect(val.count).toBeGreaterThan(0);
      expect(val.totalGp).toBe(val.count * val.denominationGp);
    }
  });

  it('produces deterministic loot results when seeded', () => {
    const loot1 = generateLoot({ cr: 5, isHoard: true, seed: 42 });
    const loot2 = generateLoot({ cr: 5, isHoard: true, seed: 42 });

    expect(loot1.totalValueGp).toBe(loot2.totalValueGp);
    expect(loot1.coins.gp).toBe(loot2.coins.gp);
  });
});

describe('Phase 12: Procedural Magic Item Forge', () => {
  it('synthesizes custom magic weapons, armor, and wondrous items', () => {
    const weapon = forgeMagicItem({ type: 'weapon', seed: 101 });
    expect(weapon.type).toBe('weapon');
    expect(weapon.damageFormula).toBeTruthy();
    expect(weapon.costGp).toBeGreaterThan(0);

    const armor = forgeMagicItem({ type: 'armor', seed: 202 });
    expect(armor.type).toBe('armor');
    expect(armor.acBonus).toBeGreaterThan(0);

    const wondrous = forgeMagicItem({ type: 'wondrous', seed: 303 });
    expect(wondrous.type).toBe('wondrous');
  });

  it('respects rarity constraints and computes attunement', () => {
    const commonItem = forgeMagicItem({ maxRarity: 'Common', seed: 555 });
    expect(commonItem.rarity).toBe('Common');

    const rareItem = forgeMagicItem({ minRarity: 'Rare', seed: 777 });
    expect(['Rare', 'Very Rare', 'Legendary', 'Artifact']).toContain(rareItem.rarity);
    expect(typeof rareItem.requiresAttunement).toBe('boolean');
  });

  it('persists forged items to compendium storage', async () => {
    const forged = forgeMagicItem({ seed: 999 });
    const saved = await saveCompendiumItem(forged);

    expect(saved.id).toBe(forged.id);
    expect(saved.name).toBe(forged.name);

    const queried = await queryCustomItems({ search: forged.name });
    expect(queried.length).toBeGreaterThanOrEqual(1);
    expect(queried.some(i => i.id === forged.id)).toBe(true);
  });
});
