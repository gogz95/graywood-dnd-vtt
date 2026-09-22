// src/lib/services/unlockRegistry.ts
// Automated unlock registry mapping sourcebooks to restricted system flags

import { compendiumDb } from '../db/compendiumDb';

export interface SourceUnlockDefinition {
  sourceKeywords: string[];
  flags: string[];
  label: string;
}

export const KNOWN_SOURCE_UNLOCKS: Record<string, SourceUnlockDefinition> = {
  xanathar: {
    sourceKeywords: ['xanathar', 'xge'],
    flags: ['crafting_essences', 'complex_traps', 'tool_proficiencies'],
    label: "Xanathar's Guide to Everything"
  },
  tasha: {
    sourceKeywords: ['tasha', 'tce'],
    flags: ['sidekicks', 'group_patrons', 'parashaunt_puzzles'],
    label: "Tasha's Cauldron of Everything"
  },
  strongholds: {
    sourceKeywords: ['stronghold', 'followers', 'mcdm'],
    flags: ['bastion_facilities', 'stronghold_upgrades', 'warfare_units'],
    label: 'Strongholds & Followers'
  },
  monsters_multiverse: {
    sourceKeywords: ['multiverse', 'motm', 'mpmm'],
    flags: ['lineage_flexibility', 'monstrous_races'],
    label: 'Monsters of the Multiverse'
  }
};

export async function processSourceUnlock(sourceName: string): Promise<string[]> {
  const lower = sourceName.toLowerCase();
  const unlockedFlags: string[] = [];

  for (const [key, def] of Object.entries(KNOWN_SOURCE_UNLOCKS)) {
    const matched = def.sourceKeywords.some((kw) => lower.includes(kw));
    if (matched) {
      unlockedFlags.push(...def.flags);
      unlockedFlags.push(`source_${key}`);
    }
  }

  if (unlockedFlags.length > 0 && typeof window !== 'undefined' && compendiumDb.campaignFlags) {
    try {
      const records = unlockedFlags.map((flag) => ({
        key: flag,
        value: true
      }));
      await compendiumDb.campaignFlags.bulkPut(records);
      window.dispatchEvent(new CustomEvent('vtt:source-unlocked', { detail: { source: sourceName, flags: unlockedFlags } }));
    } catch (err) {
      console.warn('Failed to persist unlock flags to Dexie:', err);
    }
  }

  return unlockedFlags;
}

export async function isFeatureUnlocked(flag: string): Promise<boolean> {
  if (typeof window === 'undefined' || !compendiumDb.campaignFlags) return true;
  try {
    const record = await compendiumDb.campaignFlags.get(flag);
    return record?.value === true;
  } catch {
    return false;
  }
}
