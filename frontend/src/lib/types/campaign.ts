// campaign.ts — Campaign Feature-Flag Manifest & Ruleset Override Configurations

export interface CampaignFeatures {
  enableRegionalDialects: boolean;       // Maps Common/Dwarvish to regional dialects
  enableCustomCurrencies: boolean;       // Re-indexes GP to Concord Sovereigns & Gilionite Trade Bars
  enableCurrencyAssayFee: boolean;       // Injects foreign bullion clipping fees (10%)
  enableContrabandTaxonomy: boolean;     // Categorizes items into Legal Tiers I-IV
  enableDurabilityRp: boolean;           // Computes weapon/armor Resistance Points (RP) & Sunder
  enableOrganDecayTimer: boolean;        // Injects 24-hour decay countdown to unpreserved viscera
  enableElementalEssenceMatrix: boolean; // Categorizes reagents into the 28 elemental essence matrix
}

export interface CampaignRulesetConfig {
  id: string;
  name: string;
  isHomebrewActive: boolean;
  description?: string;
  features: CampaignFeatures;
}

export const DEFAULT_5E_CONFIG: CampaignRulesetConfig = {
  id: 'standard_5e',
  name: 'Standard 5e (RAW)',
  isHomebrewActive: false,
  description: 'Pure vanilla 5e rules according to the official System Reference Document (SRD). No custom setting mechanics or local currencies.',
  features: {
    enableRegionalDialects: false,
    enableCustomCurrencies: false,
    enableCurrencyAssayFee: false,
    enableContrabandTaxonomy: false,
    enableDurabilityRp: false,
    enableOrganDecayTimer: false,
    enableElementalEssenceMatrix: false
  }
};

export const ALEAMOS_CAMPAIGN_CONFIG: CampaignRulesetConfig = {
  id: 'aleamos_archipelago',
  name: 'Aleamos Archipelago (Homebrew Active)',
  isHomebrewActive: true,
  description: 'Full Aleamos table rules: Concord Sovereigns, Gilionite Trade Bars, foreign bullion assay fees, Legal Tiers I-IV, 24-hr organ decay, and 28-essence alchemy.',
  features: {
    enableRegionalDialects: true,
    enableCustomCurrencies: true,
    enableCurrencyAssayFee: true,
    enableContrabandTaxonomy: true,
    enableDurabilityRp: true,
    enableOrganDecayTimer: true,
    enableElementalEssenceMatrix: true
  }
};

export const PRESET_CAMPAIGN_CONFIGS: CampaignRulesetConfig[] = [
  DEFAULT_5E_CONFIG,
  ALEAMOS_CAMPAIGN_CONFIG,
];
