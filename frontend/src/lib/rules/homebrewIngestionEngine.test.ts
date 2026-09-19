import { describe, it, expect } from 'vitest';
import {
  translateLanguageToDialect,
  translateLanguagesForMonster,
  calculateCurrencyBreakdown,
  classifyContrabandTier,
  calculateDurabilityRp,
  calculateOrganDecay,
  calculateOrganDecayTimer,
  mapElementalEssenceTag,
  inferReagentEssenceTag,
  adaptItemForCampaign,
  adaptMonsterForCampaign,
  ingestHomebrewDataset,
  convertAdaptedToCompendiumEntity,
  convertAdaptedToPartyStashItem,
  REGIONAL_DIALECT_MAP
} from './homebrewIngestionEngine';
import { DEFAULT_5E_CONFIG, ALEAMOS_CAMPAIGN_CONFIG } from '../types/campaign';
import type { Raw5eItem, Raw5eMonster } from '../types/srdHomebrew';

describe('Homebrew Ingestion Engine - Pure 5e vs Aleamos Adaptation', () => {
  // Sample Raw 5e Test Items
  const rawBroadsword: Raw5eItem = {
    id: 'srd-broadsword',
    name: 'Broadsword',
    type: 'Weapon',
    costGp: 15,
    weightLbs: 3,
    rarity: 'Common',
    description: 'A double-edged military blade.',
    damage: '1d8',
    damageType: 'slashing',
    properties: ['Martial', 'Versatile (1d10)'],
    isPerishable: false,
  };

  const rawPlateArmor: Raw5eItem = {
    id: 'srd-plate',
    name: 'Plate Armor',
    type: 'Armor',
    costGp: 1500,
    weightLbs: 65,
    rarity: 'Common',
    description: 'Interlocking metal plates covering the entire body.',
    ac: 18,
    isPerishable: false,
  };

  const rawWyvernVenom: Raw5eItem = {
    id: 'srd-wyvern-venom-gland',
    name: 'Wyvern Venom Gland',
    type: 'Reagent',
    costGp: 200,
    weightLbs: 1.5,
    rarity: 'Rare',
    description: 'Extracted venom sac from a mature wyvern stinger.',
    isPerishable: true,
  };

  // Sample Raw 5e Monster
  const rawOgre: Raw5eMonster = {
    id: 'srd-ogre',
    name: 'Ogre',
    size: 'Large',
    type: 'giant',
    cr: 2,
    hp: 59,
    ac: 11,
    languages: ['Common', 'Giant'],
    traits: [{ name: 'Smash', desc: 'Powerful swings' }],
    actions: [{ name: 'Greatclub', desc: 'Hit: 13 bludgeoning damage' }],
  };

  describe('1. Regional Dialects Translation', () => {
    it('preserves RAW vanilla languages when dialect translation is disabled', () => {
      expect(translateLanguageToDialect('Common', false)).toBe('Common');
      expect(translateLanguageToDialect('Dwarvish', false)).toBe('Dwarvish');
      expect(translateLanguagesForMonster(['Common', 'Giant'], false)).toEqual(['Common', 'Giant']);
    });

    it('translates standard languages to Aleamos regional dialects when enabled', () => {
      expect(translateLanguageToDialect('Common', true)).toBe('Old Concord / Vaelic Common');
      expect(translateLanguageToDialect('Dwarvish', true)).toBe('Gilionite Stone-Canto');
      expect(translateLanguageToDialect('Elvish', true)).toBe('Ay-Modlahd High Sylvan');
      expect(translateLanguageToDialect('Undercommon', true)).toBe('Rucean Deep-Patois');
      expect(translateLanguageToDialect('Unknown Dialect', true)).toBe('Unknown Dialect');

      const translated = translateLanguagesForMonster(rawOgre.languages, true);
      expect(translated).toContain('Old Concord / Vaelic Common');
      expect(translated).toContain('Jotun-Runemarked');
    });

    it('contains full dialect mapping entries for major 5e languages', () => {
      expect(REGIONAL_DIALECT_MAP['Draconic']).toBe('Wyrm-Tongue (Aethelgard)');
      expect(REGIONAL_DIALECT_MAP['Goblin']).toBe('Fen-Goblin Skitter');
      expect(REGIONAL_DIALECT_MAP['Celestial']).toBe('Solar Canticle');
      expect(REGIONAL_DIALECT_MAP['Infernal']).toBe('Ashen Script');
    });
  });

  describe('2. Currency Re-Indexing & Bullion Assay Fee', () => {
    it('returns raw GP without fee in vanilla 5e RAW config', () => {
      const breakdown = calculateCurrencyBreakdown(150, DEFAULT_5E_CONFIG);
      expect(breakdown.rawGp).toBe(150);
      expect(breakdown.sovereignGp).toBe(150);
      expect(breakdown.tradeBars50Gp).toBe(0);
      expect(breakdown.sunDisks10Gp).toBe(0);
      expect(breakdown.assayFeeDeductedGp).toBe(0);
      expect(breakdown.netValueGp).toBe(150);
      expect(breakdown.formattedDisplay).toBe('150 GP');
    });

    it('computes Trade Bars, Sun Disks, Sovereigns, and 10% Assay Fee in Aleamos config', () => {
      // 125 GP = 2 Trade Bars (100) + 2 Sun Disks (20) + 5 Sovereigns (5)
      const breakdown = calculateCurrencyBreakdown(125, ALEAMOS_CAMPAIGN_CONFIG);
      expect(breakdown.rawGp).toBe(125);
      expect(breakdown.tradeBars50Gp).toBe(2);
      expect(breakdown.sunDisks10Gp).toBe(2);
      expect(breakdown.assayFeeDeductedGp).toBe(12.5);
      expect(breakdown.netValueGp).toBe(112.5);
      expect(breakdown.formattedDisplay).toBe('2 Trade Bars, 2 Sun Disks, 5 Sovereigns');
    });

    it('handles exact multiples of Trade Bars and Sun Disks', () => {
      const breakdown50 = calculateCurrencyBreakdown(50, ALEAMOS_CAMPAIGN_CONFIG);
      expect(breakdown50.tradeBars50Gp).toBe(1);
      expect(breakdown50.sunDisks10Gp).toBe(0);
      expect(breakdown50.assayFeeDeductedGp).toBe(5);
      expect(breakdown50.netValueGp).toBe(45);

      const breakdown10 = calculateCurrencyBreakdown(10, ALEAMOS_CAMPAIGN_CONFIG);
      expect(breakdown10.tradeBars50Gp).toBe(0);
      expect(breakdown10.sunDisks10Gp).toBe(1);
      expect(breakdown10.assayFeeDeductedGp).toBe(1);
      expect(breakdown10.netValueGp).toBe(9);
    });
  });

  describe('3. Contraband Taxonomy', () => {
    it('defaults to Tier I: Unrestricted when disabled', () => {
      const res = classifyContrabandTier(rawWyvernVenom, false);
      expect(res.tier).toBe('Tier I: Unrestricted');
    });

    it('classifies lethal venom reagents as Tier III: Restricted Contraband in Aleamos', () => {
      const res = classifyContrabandTier(rawWyvernVenom, true);
      expect(res.tier).toBe('Tier III: Restricted Contraband');
    });

    it('classifies black orb / cursed relics as Tier IV: Proscribed & Treasonous in Aleamos', () => {
      const cursedItem: Raw5eItem = {
        id: 'black-orb',
        name: 'Extracted Black Orb',
        type: 'Reagent',
        costGp: 5000,
        weightLbs: 5,
        rarity: 'Legendary',
        description: 'Pulsing void extract core from a shadow aberration.',
        isPerishable: false,
      };
      const res = classifyContrabandTier(cursedItem, true);
      expect(res.tier).toBe('Tier IV: Proscribed & Treasonous');
    });

    it('classifies martial weapons as Tier II: Guild Regulated in Aleamos', () => {
      const res = classifyContrabandTier(rawBroadsword, true);
      expect(res.tier).toBe('Tier II: Guild Regulated');
    });
  });

  describe('4. Durability & Resistance Points (RP)', () => {
    it('does not compute RP when durability feature is disabled', () => {
      const rp = calculateDurabilityRp(rawBroadsword, false);
      expect(rp).toBeUndefined();
    });

    it('computes correct weapon RP based on rarity and calculates sunder threshold', () => {
      const commonWep = calculateDurabilityRp(rawBroadsword, true);
      expect(commonWep).toBeDefined();
      expect(commonWep?.maxRp).toBe(15);
      expect(commonWep?.currentRp).toBe(15);
      expect(commonWep?.sunderThreshold).toBe(3); // floor(15 * 0.25) = 3

      const rareWep = calculateDurabilityRp({ ...rawBroadsword, rarity: 'Rare' }, true);
      expect(rareWep?.maxRp).toBe(25);
      expect(rareWep?.sunderThreshold).toBe(6); // floor(25 * 0.25) = 6
    });

    it('computes correct armor RP based on armor classification', () => {
      const plateRp = calculateDurabilityRp(rawPlateArmor, true);
      expect(plateRp).toBeDefined();
      expect(plateRp?.maxRp).toBe(30);
      expect(plateRp?.sunderThreshold).toBe(7); // floor(30 * 0.25) = 7
    });
  });

  describe('5. Organ & Viscera Decay Timers', () => {
    it('returns fresh without countdown when decay timer is disabled', () => {
      const decay = calculateOrganDecay(rawWyvernVenom, false);
      expect(decay.decayState).toBe('fresh');
      expect(decay.decayHoursRemaining).toBeUndefined();
    });

    it('injects 24-hour decay countdown for perishable reagents when enabled', () => {
      const decay = calculateOrganDecay(rawWyvernVenom, true);
      expect(decay.decayState).toBe('fresh');
      expect(decay.decayHoursRemaining).toBe(24);
      expect(decay.harvestTimestamp).toBeGreaterThan(0);
    });

    it('does not decay non-perishable items like steel weapons', () => {
      const decay = calculateOrganDecay(rawBroadsword, true);
      expect(decay.decayState).toBe('preserved');
      expect(decay.decayHoursRemaining).toBeUndefined();
    });
  });

  describe('6. 28-Essence Alchemy Matrix Mapping', () => {
    it('returns undefined when essence matrix is disabled', () => {
      expect(inferReagentEssenceTag(rawWyvernVenom, false)).toBeUndefined();
    });

    it('maps biological items to accurate essence tags when enabled', () => {
      expect(inferReagentEssenceTag(rawWyvernVenom, true)).toBe('Toxic (Venom)');

      const fireGland: Raw5eItem = {
        id: 'fire-gland',
        name: 'Fire Beetle Gland',
        type: 'Reagent',
        costGp: 10,
        weightLbs: 0.5,
        rarity: 'Common',
        description: 'Luminescent core radiating intense warmth.',
        isPerishable: true,
      };
      expect(inferReagentEssenceTag(fireGland, true)).toBe('Pyretic (Fire)');

      const trollBlood: Raw5eItem = {
        id: 'troll-blood',
        name: 'Vial of Troll Blood',
        type: 'Reagent',
        costGp: 45,
        weightLbs: 0.5,
        rarity: 'Uncommon',
        description: 'Coagulating viscous blood with regenerative cell matter.',
        isPerishable: true,
      };
      expect(inferReagentEssenceTag(trollBlood, true)).toBe('Vital / Sanguine (Blood)');
    });
  });

  describe('7. Full Adaptation Pipeline & Ingestion', () => {
    it('keeps raw item unmodified when running under RAW 5e config', () => {
      const adapted = adaptItemForCampaign(rawBroadsword, DEFAULT_5E_CONFIG);
      expect(adapted.maxRp).toBeUndefined();
      expect(adapted.essenceTag).toBeUndefined();
      expect(adapted.currency?.formattedDisplay).toBe('15 GP');
      expect(adapted.contrabandTier).toBeUndefined();
    });

    it('augments raw item with all Aleamos mechanics under Aleamos config', () => {
      const adapted = adaptItemForCampaign(rawBroadsword, ALEAMOS_CAMPAIGN_CONFIG);
      expect(adapted.maxRp).toBe(15);
      expect(adapted.currentRp).toBe(15);
      expect(adapted.sunderThreshold).toBe(3);
      expect(adapted.contrabandTier).toBe('Tier II: Guild Regulated');
      expect(adapted.currency?.formattedDisplay).toBe('1 Sun Disk, 5 Sovereigns');
      expect(adapted.currency?.assayFeeDeductedGp).toBe(1.5);
      expect(adapted.currency?.netValueGp).toBe(13.5);
    });

    it('adapts monsters with regional dialects under Aleamos config', () => {
      const adapted = adaptMonsterForCampaign(rawOgre, ALEAMOS_CAMPAIGN_CONFIG);
      expect(adapted.regionalLanguages).toContain('Old Concord / Vaelic Common');
      expect(adapted.regionalLanguages).toContain('Jotun-Runemarked');
    });

    it('batch ingests raw datasets cleanly', () => {
      const dataset = {
        items: [rawBroadsword, rawPlateArmor, rawWyvernVenom],
        monsters: [rawOgre],
      };

      const result = ingestHomebrewDataset(dataset, ALEAMOS_CAMPAIGN_CONFIG);
      expect(result.items.length).toBe(3);
      expect(result.monsters.length).toBe(1);
      expect(result.summary.totalItems).toBe(3);
      expect(result.summary.isHomebrewActive).toBe(true);
    });

    it('converts adapted models to CompendiumEntity and PartyStashItem correctly', () => {
      const adaptedItem = adaptItemForCampaign(rawWyvernVenom, ALEAMOS_CAMPAIGN_CONFIG);

      // CompendiumEntity
      const entity = convertAdaptedToCompendiumEntity(adaptedItem);
      expect(entity.name).toBe('Wyvern Venom Gland');
      expect(entity.type).toBe('item');
      expect(entity.description).toContain('[Tier III: Restricted Contraband]');
      expect(entity.description).toContain('[Essence: Toxic (Venom)]');
      expect(entity.description).toContain('[Decay: 24h]');
      expect(entity.description).toContain('[Assay Fee: 10% (-20 GP)]');

      // PartyStashItem
      const stash = convertAdaptedToPartyStashItem(adaptedItem);
      expect(stash.name).toBe('Wyvern Venom Gland');
      expect(stash.valueGp).toBe(180); // 200 - 20 fee
      expect(stash.essence).toBe('Toxic (Venom)');
      expect(stash.isPreserved).toBe(false);
      expect(stash.isSpoiled).toBe(false);
    });
  });
});
