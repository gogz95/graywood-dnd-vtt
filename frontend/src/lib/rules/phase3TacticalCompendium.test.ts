// frontend/src/lib/rules/phase3TacticalCompendium.test.ts
// Phase 3 Verification Test Suite: Compendium Ingestion Engine, Tactical Parity, Fog of War & Dice Log

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { compendiumDb, ensureSrdBaseline } from '../db/compendiumDb';
import {
  parseSpellsFromText,
  parseSubclassesFromText,
  parseFacilitiesFromText,
  parseMonstersFromText,
} from '../importers/pdfRuleExtractor';
import { FogOfWarLayer } from '../canvas/fogOfWarLayer';
import { renderTacticalToken, type RenderableToken } from '../canvas/tokenRenderer';
import { chatStore } from '../stores/chatStore.svelte';

describe('Phase 3: Dynamic Compendium Database & Local Extraction Engine', () => {
  it('initializes compendiumDb and seeds standard SRD 5.1 spells and subclasses', async () => {
    await ensureSrdBaseline();

    const spells = await compendiumDb.spells.where('origin').equals('SRD-5.1').toArray();
    expect(spells.length).toBeGreaterThan(0);
    expect(spells.some(s => s.name === 'Fireball')).toBe(true);
    expect(spells.some(s => s.name === 'Cure Wounds')).toBe(true);

    const subclasses = await compendiumDb.subclasses.where('origin').equals('SRD-5.1').toArray();
    expect(subclasses.length).toBeGreaterThan(0);
    expect(subclasses.some(sc => sc.name === 'Champion' && sc.parentClass === 'Fighter')).toBe(true);

    const monsters = await compendiumDb.monsters.where('origin').equals('SRD-5.1').toArray();
    expect(monsters.length).toBeGreaterThan(0);
    expect(monsters.some(m => m.name === 'Goblin')).toBe(true);

    const items = await compendiumDb.items.toArray();
    expect(items.length).toBeGreaterThan(0);
    expect(items.some(it => it.name === 'Longsword')).toBe(true);
  });

  it('verifies idempotent seeding without creating duplicate records', async () => {
    await ensureSrdBaseline();
    const initialSpells = await compendiumDb.spells.count();
    const initialMonsters = await compendiumDb.monsters.count();
    const initialItems = await compendiumDb.items.count();

    // Call baseline again
    await ensureSrdBaseline();

    expect(await compendiumDb.spells.count()).toBe(initialSpells);
    expect(await compendiumDb.monsters.count()).toBe(initialMonsters);
    expect(await compendiumDb.items.count()).toBe(initialItems);
  });

  it('verifies indexing performance across name, level, CR, school, and item type', async () => {
    await ensureSrdBaseline();

    const t0 = performance.now();
    const fireball = await compendiumDb.spells.where('name').equals('Fireball').first();
    const lvl1Spells = await compendiumDb.spells.where('level').equals(1).toArray();
    const evocationSpells = await compendiumDb.spells.where('school').equals('Evocation').toArray();
    const cr025Monsters = await compendiumDb.monsters.where('cr').equals(0.25).toArray();
    const weapons = await compendiumDb.items.where('type').equals('Weapon').toArray();
    const t1 = performance.now();

    expect(fireball).toBeDefined();
    expect(fireball?.level).toBe(3);
    expect(lvl1Spells.length).toBeGreaterThan(0);
    expect(evocationSpells.length).toBeGreaterThan(0);
    expect(cr025Monsters.length).toBeGreaterThan(0);
    expect(weapons.length).toBeGreaterThan(0);
    expect(t1 - t0).toBeLessThan(100); // <100ms querying across indexes
  });

  it('unloader function purgePackage purges only user-imported records without affecting SRD baseline', async () => {
    await ensureSrdBaseline();

    // Insert user imported custom package
    await compendiumDb.spells.add({
      id: 'custom-spell-1',
      name: 'Shadow Nova',
      level: 4,
      school: 'Evocation',
      castingTime: '1 action',
      range: '60 feet',
      components: 'V, S',
      duration: 'Instantaneous',
      description: 'A burst of dark necrotic energy.',
      parentClass: 'Wizard',
      sourceBook: 'Tome of Shadows',
      packageId: 'tome-of-shadows',
      origin: 'USER_IMPORT',
    });

    const initialSrdCount = await compendiumDb.spells.where('origin').equals('SRD-5.1').count();

    // Purge user package
    const result = await compendiumDb.purgePackage('tome-of-shadows');
    expect(result.deletedSpells).toBe(1);

    // Verify user record removed
    const customSpell = await compendiumDb.spells.get('custom-spell-1');
    expect(customSpell).toBeUndefined();

    // Verify SRD records unharmed
    const finalSrdCount = await compendiumDb.spells.where('origin').equals('SRD-5.1').count();
    expect(finalSrdCount).toBe(initialSrdCount);
  });

  it('in-browser text extractor correctly parses spells, subclasses, monsters and facilities', () => {
    const rawSpellText = `
Lightning Strike
3rd-level evocation
Casting Time: 1 action
Range: 120 feet
Components: V, S, M (a piece of copper wire)
Duration: Instantaneous
A bright streak of electricity arcs from your finger. Each creature in a 100-foot line must make a Dexterity save.
Classes: Sorcerer, Wizard
`;
    const spells = parseSpellsFromText(rawSpellText, 'Custom Spells Book', 'custom-book');
    expect(spells.length).toBe(1);
    expect(spells[0].name).toBe('Lightning Strike');
    expect(spells[0].level).toBe(3);
    expect(spells[0].school).toBe('Evocation');
    expect(spells[0].parentClass).toContain('Sorcerer');

    const rawSubclassText = `
Fighter Subclass: Eldritch Knight
3rd Level
Weapon Bond: You learn a ritual that creates a magical bond between yourself and one weapon.
7th Level
War Magic: When you use your action to cast a cantrip, you can make one weapon attack as a bonus action.
`;
    const subclasses = parseSubclassesFromText(rawSubclassText, 'Custom Martial Guide', 'custom-guide');
    expect(subclasses.length).toBe(1);
    expect(subclasses[0].name).toBe('Eldritch Knight');
    expect(subclasses[0].parentClass).toBe('Fighter');
    expect(Object.keys(subclasses[0].featuresByLevel).length).toBeGreaterThan(0);

    const rawMonsterText = `
Cave Troll
Large giant, chaotic evil
Armor Class 15 (natural armor)
Hit Points 84 (8d10 + 40)
Speed 30 ft.
STR 18 (+4) DEX 13 (+1) CON 20 (+5) INT 7 (-2) WIS 9 (-1) CHA 7 (-2)
Challenge 5
Actions
Multiattack. The troll makes three attacks: one with its bite and two with its claws.
Claw. Melee Weapon Attack: +7 to hit, reach 5 ft., one target. Hit: 11 (2d6 + 4) slashing damage.
`;
    const monsters = parseMonstersFromText(rawMonsterText, 'Monsters of the Depths', 'depths-book');
    expect(monsters.length).toBe(1);
    expect(monsters[0].name).toBe('Cave Troll');
    expect(monsters[0].cr).toBe(5);
    expect(monsters[0].ac).toBe(15);
    expect(monsters[0].hp).toBe(84);
    expect(monsters[0].actions.length).toBeGreaterThan(0);

    const rawFacilityText = `
Armory
Category: Military
Cost: 2500 gp
Build Time: 45 days
Special: Grants defenders advantage on initiative checks during siege defenses.
`;
    const facilities = parseFacilitiesFromText(rawFacilityText, 'Bastion Builder Codex', 'bastion-codex');
    expect(facilities.length).toBe(1);
    expect(facilities[0].name).toBe('Armory');
    expect(facilities[0].category).toBe('Military');
    expect(facilities[0].goldCost).toBe(2500);
    expect(facilities[0].buildDays).toBe(45);
  });
});

describe('Phase 3: Dual-Layer Fog of War Engine', () => {
  it('manages vector polygon and circular brush reveals and synchronizes state', () => {
    const fow = new FogOfWarLayer(1920, 1080);
    expect(fow.getRevealedPolygons().length).toBe(0);

    // Reveal polygon
    fow.revealPolygon([
      { x: 100, y: 100 },
      { x: 300, y: 100 },
      { x: 300, y: 300 },
      { x: 100, y: 300 },
    ], false);
    expect(fow.getRevealedPolygons().length).toBe(1);

    // Reveal brush
    fow.revealBrush(400, 400, 50, false);
    expect(fow.getRevealedBrushes().length).toBe(1);
    expect(fow.getRevealedBrushes()[0].radius).toBe(50);

    // Export and import state
    const state = fow.exportState();
    expect(state.operations.length).toBe(2); // revealPolygon, revealBrush

    const secondaryFow = new FogOfWarLayer(1920, 1080);
    secondaryFow.loadState(state);
    expect(secondaryFow.getRevealedPolygons().length).toBe(1);
    expect(secondaryFow.getRevealedBrushes().length).toBe(1);

    // Conceal
    fow.concealPolygon([
      { x: 100, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 200 },
    ], false);
    expect(fow.getConcealedPolygons().length).toBe(1);
  });
});

describe('Phase 3: Token Condition Rings & Radial Auras', () => {
  it('renders token condition rings and radial auras without throwing errors', () => {
    // Create a mock canvas context
    const mockCtx = {
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      closePath: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      fillText: () => {},
      measureText: () => ({ width: 40 }),
      drawImage: () => {},
      setLineDash: () => {},
      clip: () => {},
      fillRect: () => {},
    } as unknown as CanvasRenderingContext2D;

    const token: RenderableToken = {
      id: 'tok-1',
      name: 'Valeros',
      x: 5,
      y: 5,
      size: 1,
      hp: 20,
      maxHp: 20,
      isPlayer: true,
      conditions: ['Prone', 'Poisoned'],
      aura: {
        radiusFeet: 10,
        color: 'rgba(59, 130, 246, 0.25)',
        opacity: 0.25,
      },
    };

    expect(() => {
      renderTacticalToken(mockCtx, token, 64, 1.0, 0, false);
    }).not.toThrow();
  });
});

describe('Phase 3: Universal Dice Roller & Interactive Session Chat Log', () => {
  beforeEach(() => {
    chatStore.clear();
  });

  it('evaluates dice formula and formats exact arithmetic breakdown', () => {
    const breakdown = chatStore.evaluateFormula('1d20 + 3 + 2', [
      { label: 'DEX', value: 3 },
      { label: 'Prof', value: 2 },
    ]);

    expect(breakdown.terms.length).toBe(3);
    expect(breakdown.total).toBeGreaterThanOrEqual(1 + 3 + 2);
    expect(breakdown.total).toBeLessThanOrEqual(20 + 3 + 2);
    expect(breakdown.formattedBreakdown).toMatch(/\[1d20 \(\d+\) \+ 3 \(DEX\) \+ 2 \(Prof\)\] = \d+/);
  });

  it('distinguishes public rolls and secret DM whispers', () => {
    const publicMsg = chatStore.roll('1d20+5', { label: 'Longsword Attack', actorName: 'Valeros', isSecret: false });
    expect(publicMsg.channel).toBe('public');
    expect(publicMsg.sender).toBe('Valeros');

    const secretMsg = chatStore.roll('1d20+3', { label: 'Stealth Check', actorName: 'DM', isSecret: true });
    expect(secretMsg.channel).toBe('whisper');
    expect(secretMsg.sender).toBe('DM');
  });

  it('processes slash commands (/r, /gmroll, /w)', () => {
    // /r public roll
    chatStore.sendMessage('/r 2d6+4 # Greatsword', 'Paladin');
    const rollMsg = chatStore.messages[chatStore.messages.length - 1];
    expect(rollMsg.roll).toBeDefined();
    expect(rollMsg.rollLabel).toBe('Greatsword');
    expect(rollMsg.channel).toBe('public');

    // /gmroll secret roll
    chatStore.sendMessage('/gmroll 1d20+2 # Secret Perception', 'DM');
    const gmMsg = chatStore.messages[chatStore.messages.length - 1];
    expect(gmMsg.roll).toBeDefined();
    expect(gmMsg.channel).toBe('whisper');

    // /w whisper message
    chatStore.sendMessage('/w Rogue You notice a tripwire across the threshold', 'DM');
    const whisperMsg = chatStore.messages[chatStore.messages.length - 1];
    expect(whisperMsg.channel).toBe('whisper');
    expect(whisperMsg.text).toContain('(To Rogue)');
  });
});
