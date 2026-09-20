// src/lib/rules/unifiedMasterEngines.test.ts
// Unit tests for Unified Character Schema, Source Ingestion & Search, and Procedural Contracts

import { describe, it, expect } from 'vitest';
import {
  calculateModifier,
  calculateProficiencyBonus,
  createDefaultCharacter,
  performShortRest,
  performLongRest,
  type Character
} from '../types/character';
import {
  chunkDocumentText,
  extractTextFromPdfBuffer
} from '../importers/sourceIngestionEngine';
import { extractContextualSnippet } from '../services/sourceSearch';
import { generateProceduralContract } from '../data/handoutTables';

describe('Unified Master Implementation Engines', () => {

  describe('1. Unified Character Data Schema & Rest Mechanics', () => {
    it('calculates 5e ability modifiers correctly', () => {
      expect(calculateModifier(10)).toBe(0);
      expect(calculateModifier(11)).toBe(0);
      expect(calculateModifier(12)).toBe(1);
      expect(calculateModifier(14)).toBe(2);
      expect(calculateModifier(16)).toBe(3);
      expect(calculateModifier(18)).toBe(4);
      expect(calculateModifier(20)).toBe(5);
      expect(calculateModifier(8)).toBe(-1);
      expect(calculateModifier(7)).toBe(-2);
      expect(calculateModifier(1)).toBe(-5);
    });

    it('calculates proficiency bonus according to character level', () => {
      expect(calculateProficiencyBonus(1)).toBe(2);
      expect(calculateProficiencyBonus(4)).toBe(2);
      expect(calculateProficiencyBonus(5)).toBe(3);
      expect(calculateProficiencyBonus(8)).toBe(3);
      expect(calculateProficiencyBonus(9)).toBe(4);
      expect(calculateProficiencyBonus(13)).toBe(5);
      expect(calculateProficiencyBonus(17)).toBe(6);
      expect(calculateProficiencyBonus(20)).toBe(6);
    });

    it('creates default character with standard 18 skills and durability pieces', () => {
      const char = createDefaultCharacter('char-1', 'Gareth of Oakhaven', 'Fighter', 5);
      expect(char.id).toBe('char-1');
      expect(char.level).toBe(5);
      expect(char.abilities.str.score).toBe(16);
      expect(char.abilities.str.modifier).toBe(3);
      expect(Object.keys(char.skills).length).toBe(18);
      expect(char.skills.Athletics.tier).toBe('proficient');
      expect(char.equipmentDurability.length).toBeGreaterThanOrEqual(3);
    });

    it('executes Short Rest spending hit dice and restoring RP on tool check success', () => {
      const char = createDefaultCharacter('char-1', 'Gareth', 'Fighter', 5);
      char.hitDice.current = 5;
      char.equipmentDurability[0].currentRp = 10;
      char.equipmentDurability[0].maxRp = 15;

      const rested = performShortRest(char, 2, true);
      expect(rested.hitDice.current).toBe(3);
      // Restores up to 5 RP on success
      expect(rested.equipmentDurability[0].currentRp).toBe(15);
    });

    it('executes Long Rest resetting HP, spell slots, toxicity, and clearing 1 exhaustion', () => {
      const char = createDefaultCharacter('char-1', 'Gareth', 'Wizard', 5);
      char.currentHp = 4;
      char.maxHp = 30;
      char.tempHp = 5;
      char.exhaustionLevel = 2;
      char.manaPotionsDrunkLongRest = 2;
      char.hitDice.current = 1;
      char.spellcasting.slots[1] = { current: 0, max: 4 };

      const rested = performLongRest(char);
      expect(rested.currentHp).toBe(30);
      expect(rested.tempHp).toBe(0);
      expect(rested.exhaustionLevel).toBe(1); // Clears 1 level
      expect(rested.manaPotionsDrunkLongRest).toBe(0); // Resets toxicity
      expect(rested.spellcasting.slots[1].current).toBe(4); // Resets spell slots
      expect(rested.hitDice.current).toBeGreaterThan(1); // Restored half max
    });
  });

  describe('2. Source Ingestion Engine & Grounded Search', () => {
    it('chunks markdown text into header-bound blocks', () => {
      const sampleMarkdown = `# Chapter 1: Combat
In the heat of battle, a warrior must strike with precision and resolve.
Each combat round represents approximately six seconds in the game world.

## Section 1.1: Actions in Combat
When you take your action on your turn, you can make one of several actions.
Attack, Cast a Spell, Dash, Disengage, Dodge, Help, Hide, Ready, Search, Use an Object.

# Chapter 2: Spellcasting
Magic permeates the fantasy realms, manifesting through arcane formulae or divine devotion.`;

      const chunks = chunkDocumentText('doc-test-1', 'Rulebook.md', sampleMarkdown, 20);
      expect(chunks.length).toBeGreaterThanOrEqual(2);
      expect(chunks[0].docName).toBe('Rulebook.md');
      expect(chunks[0].sectionHeader).toBeDefined();
    });

    it('extracts contextual snippet highlighting search terms', () => {
      const fullText = 'The ancient dragon slumbered atop a mountain of concord sovereigns and silver disks. Few adventurers dared enter the cavern without potent fire resistance wards.';
      const snippet = extractContextualSnippet(fullText, ['dragon', 'concord']);
      expect(snippet.toLowerCase()).toContain('dragon');
      expect(snippet.toLowerCase()).toContain('concord');
    });

    it('handles empty text and extracts fallback safely', () => {
      expect(extractContextualSnippet('', ['test'])).toBe('');
      const emptyChunks = chunkDocumentText('doc-empty', 'empty.txt', '');
      expect(emptyChunks).toEqual([]);
    });
  });

  describe('3. Procedural Adventurers Guild Contract Generator', () => {
    it('generates valid contracts across all 5 classifications', () => {
      const classifications = ['Exploration', 'Hunt', 'Protection', 'Resource Gathering', 'Find'] as const;
      for (const cat of classifications) {
        const contract = generateProceduralContract(cat);
        expect(contract.classification).toBe(cat);
        expect(contract.title).toBeDefined();
        expect(contract.commissioner).toBeDefined();
        expect(contract.escrowRewardGp).toBeGreaterThan(0);
        expect(contract.deadlineDecades).toBeGreaterThanOrEqual(1);
        expect(contract.perils.length).toBeGreaterThanOrEqual(1);
        expect(contract.markdownContent).toContain('ADVENTURERS GUILD OFFICIAL CONTRACT');
        expect(contract.dmNotes).toContain('Secret DM Context:');
      }
    });
  });

});
