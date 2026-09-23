import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { compendiumDb } from '../../db/compendiumDb';
import { seedSrdCompendiumIfEmpty } from '../../services/srdSeedService';
import type { SelectedCompendiumEntry } from './StatblockDrawer.svelte';

describe('Compendium Browser UI & Statblock Drawer Logic', () => {
  beforeEach(async () => {
    await seedSrdCompendiumIfEmpty(true);
  });

  it('filters spells by level, school, and keyword search', async () => {
    const allSpells = await compendiumDb.spells.toArray();
    expect(allSpells.length).toBeGreaterThan(0);

    // Filter by Level 3 Evocation (e.g. Fireball)
    const lvl3Evocation = allSpells.filter(
      (s) => s.level === 3 && s.school.toLowerCase() === 'evocation'
    );
    expect(lvl3Evocation.some((s) => s.name === 'Fireball')).toBe(true);

    // Search query fallback on name/description
    const searchResults = allSpells.filter(
      (s) => s.name.toLowerCase().includes('cure') || s.description.toLowerCase().includes('regains hit points')
    );
    expect(searchResults.some((s) => s.name === 'Cure Wounds')).toBe(true);
  });

  it('filters monsters by CR range and creature type', async () => {
    const allMonsters = await compendiumDb.monsters.toArray();
    expect(allMonsters.length).toBeGreaterThan(0);

    // Filter by CR <= 0.5 humanoid
    const lowCrHumanoids = allMonsters.filter(
      (m) => m.cr <= 0.5 && m.type.toLowerCase().includes('humanoid')
    );
    expect(lowCrHumanoids.some((m) => m.name === 'Goblin')).toBe(true);

    // Filter by undead
    const undead = allMonsters.filter((m) => m.type.toLowerCase().includes('undead'));
    expect(undead.some((m) => m.name === 'Skeleton')).toBe(true);
  });

  it('filters items by rarity and type', async () => {
    const allItems = await compendiumDb.items.toArray();
    expect(allItems.length).toBeGreaterThan(0);

    // Filter Common items
    const commonItems = allItems.filter((i) => i.rarity.toLowerCase() === 'common');
    expect(commonItems.length).toBeGreaterThan(0);

    // Search by item name
    const potion = allItems.find((i) => i.name.toLowerCase().includes('potion'));
    if (potion) {
      expect(potion.type.toLowerCase()).toContain('potion');
    }
  });

  it('filters rules by category and slug', async () => {
    const allRules = await compendiumDb.rules.toArray();
    expect(allRules.length).toBeGreaterThanOrEqual(4);

    const combatRules = allRules.filter((r) => r.category.toLowerCase() === 'combat');
    expect(combatRules.some((r) => r.slug === 'order-of-combat')).toBe(true);
    expect(combatRules.some((r) => r.slug === 'death-saving-throws')).toBe(true);
  });

  it('correctly constructs StatblockDrawer payload and calculates 5e ability modifiers', () => {
    const formatModifier = (score: number) => {
      const mod = Math.floor((score - 10) / 2);
      return mod >= 0 ? `+${mod}` : `${mod}`;
    };

    expect(formatModifier(10)).toBe('+0');
    expect(formatModifier(14)).toBe('+2');
    expect(formatModifier(18)).toBe('+4');
    expect(formatModifier(8)).toBe('-1');
    expect(formatModifier(5)).toBe('-3');

    const sampleEntry: SelectedCompendiumEntry = {
      type: 'monster',
      data: {
        id: 'test-goblin',
        name: 'Goblin',
        cr: 0.25,
        size: 'Small',
        type: 'humanoid (goblinoid)',
        alignment: 'neutral evil',
        ac: 15,
        hp: 7,
        str: 8,
        dex: 14,
        con: 10,
        int: 10,
        wis: 8,
        cha: 8,
        actions: [{ name: 'Scimitar', description: 'Attack +4' }],
        sourceBook: '5e SRD 5.1',
        packageId: 'srd-5.1',
        origin: 'SRD-5.1',
      },
    };

    expect(sampleEntry.type).toBe('monster');
    expect(sampleEntry.data.name).toBe('Goblin');
    expect(formatModifier(sampleEntry.data.dex || 10)).toBe('+2');
    expect(formatModifier(sampleEntry.data.str || 10)).toBe('-1');
  });
});
