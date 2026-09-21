// src/lib/rules/phase2RulesEngine.test.ts
// Unit test suite verifying Master Remediation Phase 2:
// 1. Modular Homebrew Rules Engine (default OFF, persistence, toggles, manifest export/import)
// 2. Character Generator Bounds (Point Buy 8-15, Standard Array, 4d6 boundaries, Lvl 1 cap of 20, subclass milestones)
// 3. Pristine Starting Equipment (100% durability condition, zero fractured/broken flags)
// 4. Heuristic Rule Detection Scanner

import { describe, it, expect, beforeEach } from 'vitest';
import { rulesEngine } from '../stores/rulesEngine.svelte';
import {
  POINT_BUY_COST_TABLE,
  POINT_BUY_TOTAL_POINTS,
  validatePointBuy,
  validateStandardArray,
  validateRolledStats,
  clampLevel1Score,
  getSubclassForLevel,
  generateStartingEquipment,
} from '../services/characterGenerator';
import { detectHomebrewRules } from '../importers/ruleDetector';

describe('Phase 2: Modular Homebrew Rules Engine', () => {
  beforeEach(() => {
    rulesEngine.resetToBaseline();
  });

  it('initializes with all homebrew systems dormant and defaulted to false', () => {
    expect(rulesEngine.isEnabled('enableBlackOrbRoster')).toBe(false);
    expect(rulesEngine.isEnabled('enableDurabilitySystem')).toBe(false);
    expect(rulesEngine.isEnabled('enableTriStatInitiative')).toBe(false);
    expect(rulesEngine.isEnabled('enableCustomCalendars')).toBe(false);
  });

  it('allows toggling and enabling/disabling modular systems', () => {
    expect(rulesEngine.isEnabled('enableDurabilitySystem')).toBe(false);
    rulesEngine.toggleModule('enableDurabilitySystem');
    expect(rulesEngine.isEnabled('enableDurabilitySystem')).toBe(true);

    rulesEngine.disableModule('enableDurabilitySystem');
    expect(rulesEngine.isEnabled('enableDurabilitySystem')).toBe(false);

    rulesEngine.enableModule('enableDurabilitySystem', 'Campaign Sourcebook');
    expect(rulesEngine.isEnabled('enableDurabilitySystem')).toBe(true);
  });

  it('exports and imports ruleset manifests correctly', () => {
    rulesEngine.enableModule('enableBlackOrbRoster', 'Test Source');
    rulesEngine.enableModule('enableTriStatInitiative', 'Test Source');

    const manifestJson = rulesEngine.exportManifest();
    const parsed = JSON.parse(manifestJson);
    expect(parsed.modules.find((m: any) => m.id === 'enableBlackOrbRoster')?.enabled).toBe(true);
    expect(parsed.modules.find((m: any) => m.id === 'enableTriStatInitiative')?.enabled).toBe(true);
    expect(parsed.modules.find((m: any) => m.id === 'enableDurabilitySystem')?.enabled).toBe(false);

    // Reset and re-import
    rulesEngine.resetToBaseline();
    expect(rulesEngine.isEnabled('enableBlackOrbRoster')).toBe(false);

    const importSuccess = rulesEngine.importManifest(manifestJson);
    expect(importSuccess).toBe(true);
    expect(rulesEngine.isEnabled('enableBlackOrbRoster')).toBe(true);
    expect(rulesEngine.isEnabled('enableTriStatInitiative')).toBe(true);
    expect(rulesEngine.isEnabled('enableDurabilitySystem')).toBe(false);
  });
});

describe('Phase 2: Ability Score Bounds & Point Buy Constraints', () => {
  it('enforces Point Buy score bounds strictly between 8 and 15', () => {
    expect(POINT_BUY_COST_TABLE[8]).toBe(0);
    expect(POINT_BUY_COST_TABLE[15]).toBe(9);
    expect(POINT_BUY_COST_TABLE[7]).toBeUndefined();
    expect(POINT_BUY_COST_TABLE[16]).toBeUndefined();

    // Standard baseline 8,8,8,8,8,8 costs 0 points
    const resBase = validatePointBuy({ str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 });
    expect(resBase.valid).toBe(true);
    expect(resBase.spent).toBe(0);
    expect(resBase.remaining).toBe(POINT_BUY_TOTAL_POINTS);

    // 15, 15, 15, 8, 8, 8 costs 9 + 9 + 9 = 27 points
    const resMax = validatePointBuy({ str: 15, dex: 15, con: 15, int: 8, wis: 8, cha: 8 });
    expect(resMax.valid).toBe(true);
    expect(resMax.spent).toBe(POINT_BUY_TOTAL_POINTS);
    expect(resMax.remaining).toBe(0);

    // Exceeding 15 should be invalid
    const resOver = validatePointBuy({ str: 16, dex: 10, con: 10, int: 10, wis: 10, cha: 10 });
    expect(resOver.valid).toBe(false);
  });

  it('strictly validates assignments to the Standard Array set [15, 14, 13, 12, 10, 8]', () => {
    const validScores = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };
    expect(validateStandardArray(validScores).valid).toBe(true);

    const invalidScores = { str: 15, dex: 15, con: 13, int: 12, wis: 10, cha: 8 };
    expect(validateStandardArray(invalidScores).valid).toBe(false);

    const nonStandardValue = { str: 18, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };
    expect(validateStandardArray(nonStandardValue).valid).toBe(false);
  });

  it('enforces rolled stat boundary between 3 and 18', () => {
    expect(validateRolledStats({ str: 3, dex: 18, con: 10, int: 12, wis: 14, cha: 8 }).valid).toBe(true);
    expect(validateRolledStats({ str: 2, dex: 18, con: 10, int: 12, wis: 14, cha: 8 }).valid).toBe(false);
    expect(validateRolledStats({ str: 19, dex: 18, con: 10, int: 12, wis: 14, cha: 8 }).valid).toBe(false);
  });

  it('clamps level 1 ability scores to a hard cap of 20', () => {
    expect(clampLevel1Score(18)).toBe(18);
    expect(clampLevel1Score(20)).toBe(20);
    expect(clampLevel1Score(22)).toBe(20); // Clamped
  });

  it('enforces 5e subclass level milestones', () => {
    // Classes receiving subclass at level 1
    expect(getSubclassForLevel('Cleric', 'Life Domain', 1)).toBe('Life Domain');
    expect(getSubclassForLevel('Sorcerer', 'Draconic Bloodline', 1)).toBe('Draconic Bloodline');
    expect(getSubclassForLevel('Warlock', 'The Fiend', 1)).toBe('The Fiend');

    // Classes receiving subclass at level 2
    expect(getSubclassForLevel('Wizard', 'School of Evocation', 1)).toBeUndefined();
    expect(getSubclassForLevel('Wizard', 'School of Evocation', 2)).toBe('School of Evocation');
    expect(getSubclassForLevel('Druid', 'Circle of the Moon', 1)).toBeUndefined();
    expect(getSubclassForLevel('Druid', 'Circle of the Moon', 2)).toBe('Circle of the Moon');

    // Classes receiving subclass at level 3
    expect(getSubclassForLevel('Fighter', 'Champion', 1)).toBeUndefined();
    expect(getSubclassForLevel('Fighter', 'Champion', 2)).toBeUndefined();
    expect(getSubclassForLevel('Fighter', 'Champion', 3)).toBe('Champion');

    expect(getSubclassForLevel('Paladin', 'Oath of Devotion', 1)).toBeUndefined();
    expect(getSubclassForLevel('Paladin', 'Oath of Devotion', 3)).toBe('Oath of Devotion');

    expect(getSubclassForLevel('Rogue', 'Thief', 1)).toBeUndefined();
    expect(getSubclassForLevel('Rogue', 'Thief', 3)).toBe('Thief');
  });
});

describe('Phase 2: Pristine Starting Equipment Generation', () => {
  it('generates pristine starting equipment with 100% full durability condition and zero fractured penalties', () => {
    const fighterGear = generateStartingEquipment('Fighter');
    expect(fighterGear.length).toBeGreaterThan(0);

    for (const item of fighterGear) {
      expect(item.currentRp).toBe(item.maxRp);
      expect(item.isBroken).toBe(false);
      expect(item.sunderPenalty).toBe(0);
    }

    const chainMail = fighterGear.find(i => i.name.includes('Chain Mail'));
    expect(chainMail).toBeDefined();
    expect(chainMail!.currentRp).toBe(25);
    expect(chainMail!.maxRp).toBe(25);
    expect(chainMail!.isBroken).toBe(false);
    expect(chainMail!.sunderPenalty).toBe(0);
  });
});

describe('Phase 2: Heuristic Rule Detection Scanner', () => {
  it('detects homebrew rules from parsed text chunks and extracts snippet previews', () => {
    const textChunks = [
      'The knight strapped on their breastplate with 25 resistance points, bracing against any impending sunder strike.',
      'In this campaign, we use a 10-day decade calendar cycle across the realm.',
      'Characters placed into the temporal black orb are veiled in stasis.',
    ];

    const results = detectHomebrewRules(textChunks);
    expect(results.length).toBeGreaterThanOrEqual(3);

    const durabilityResult = results.find(r => r.ruleId === 'enableDurabilitySystem');
    expect(durabilityResult).toBeDefined();
    expect(durabilityResult?.matchCount).toBeGreaterThan(0);
    expect(durabilityResult?.snippet.length).toBeGreaterThan(0);

    const calendarResult = results.find(r => r.ruleId === 'enableCustomCalendars');
    expect(calendarResult).toBeDefined();
    expect(calendarResult?.matchCount).toBeGreaterThan(0);

    const blackOrbResult = results.find(r => r.ruleId === 'enableBlackOrbRoster');
    expect(blackOrbResult).toBeDefined();
    expect(blackOrbResult?.matchCount).toBeGreaterThan(0);
  });
});
