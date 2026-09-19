export interface SettlementQuarter {
  name: string;
  role: string;
}

export interface SettlementDemographics {
  human_percentage: number;
  coastal_dwarf_percentage: number;
  halfling_gnome_percentage: number;
  half_elf_percentage: number;
  tiefling_other_percentage: number;
  permanent_residents: number;
  transient_sailors_merchants: number;
  primary_languages: string[];
  major_quarters: SettlementQuarter[];
}

export interface PrecursorStrata {
  level: number;
  name: string;
  danger: string;
  relics: string;
}

export interface PrecursorUnderRuins {
  title: string;
  origin: string;
  access_points: string[];
  depth_strata: PrecursorStrata[];
  current_dm_hooks: string[];
}

export interface RegulatedCurrencies {
  domestic_tender: string;
  foreign_tender: string;
}

export interface EconomicEnforcement {
  mandatory_assay_tariff_percentage: number;
  regulated_currencies: RegulatedCurrencies;
  assay_rules: string;
  banking_hours: string;
  currency_exchange_standard: string;
}

export interface WeaponPeaceBonding {
  rule: string;
  bonding_method: string;
  penalty_for_broken_seal: string;
}

export interface MunicipalLaws {
  weapon_peace_bonding: WeaponPeaceBonding;
  contraband_laws: string[];
}

export interface SettlementProfile {
  id: string;
  name: string;
  region: string;
  population_count: number;
  demographics_json: string;
  governance_title: string;
  governance_details: string;
  security_posture: string;
  precursor_under_ruins_json: string;
  economic_enforcement_json: string;
  municipal_laws_json: string;
  created_at: number;
}

export interface SettlementContract {
  id: string;
  settlement_id: string;
  title: string;
  category: 'Exploration' | 'Hunt' | 'Protection' | 'Resource Gathering' | 'Find' | string;
  target_location: string;
  description: string;
  reward_gold: number;
  reward_rp: number;
  min_level: number;
  expiration_days: number;
  is_completed: boolean;
  created_at: number;
}
