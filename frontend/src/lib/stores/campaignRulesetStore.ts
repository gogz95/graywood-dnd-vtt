// campaignRulesetStore.ts — Reactive Store for Active Campaign Ruleset & Feature Flags

import { writable, get } from 'svelte/store';
import {
  type CampaignRulesetConfig,
  type CampaignFeatures,
  DEFAULT_5E_CONFIG,
  ALEAMOS_CAMPAIGN_CONFIG,
  PRESET_CAMPAIGN_CONFIGS,
} from '../types/campaign';

const STORAGE_RULESET_KEY = 'vtt_campaign_ruleset_config';

function loadInitialRuleset(): CampaignRulesetConfig {
  if (typeof localStorage === 'undefined') return ALEAMOS_CAMPAIGN_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_RULESET_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CampaignRulesetConfig;
      if (parsed && parsed.id && parsed.features) {
        return parsed;
      }
    }
  } catch {
    // fallback
  }
  return ALEAMOS_CAMPAIGN_CONFIG;
}

export const activeCampaignRulesetStore = writable<CampaignRulesetConfig>(loadInitialRuleset());

// Auto-persist changes
activeCampaignRulesetStore.subscribe((config) => {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_RULESET_KEY, JSON.stringify(config));
    } catch {
      // ignore
    }
  }
});

export function setCampaignRuleset(config: CampaignRulesetConfig): void {
  activeCampaignRulesetStore.set(config);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('vtt:campaign-ruleset-changed', { detail: config })
    );
  }
}

export function setCampaignRulesetById(id: string): void {
  const matched = PRESET_CAMPAIGN_CONFIGS.find((p) => p.id === id);
  if (matched) {
    setCampaignRuleset(matched);
  }
}

export function toggleFeatureFlag(key: keyof CampaignFeatures, enabled?: boolean): void {
  activeCampaignRulesetStore.update((curr) => {
    const currentVal = curr.features[key];
    const nextVal = enabled !== undefined ? enabled : !currentVal;
    const updated: CampaignRulesetConfig = {
      ...curr,
      features: {
        ...curr.features,
        [key]: nextVal,
      },
    };

    // If any custom feature is toggled on, ensure isHomebrewActive is true
    const hasAnyCustom = Object.values(updated.features).some(Boolean);
    updated.isHomebrewActive = hasAnyCustom;

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('vtt:campaign-ruleset-changed', { detail: updated })
      );
    }

    return updated;
  });
}

export function resetToDefault5e(): void {
  setCampaignRuleset(DEFAULT_5E_CONFIG);
}

export function resetToAleamos(): void {
  setCampaignRuleset(ALEAMOS_CAMPAIGN_CONFIG);
}
