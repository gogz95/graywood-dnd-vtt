// src/lib/services/ingestPipeline.ts
// Pipeline binding batch ingestion to bestiary and compendium synchronization

import { compendiumDb, type CompendiumMonster } from '../db/compendiumDb';
import { bestiaryStore } from '../stores/bestiaryStore.svelte';
import { compendiumStore } from '../stores/compendiumStore.svelte';

export interface IngestMonstersOptions {
  source?: string;
  sourceBook?: string;
}

export async function ingestMonstersBatch(
  monsters: CompendiumMonster[],
  options?: IngestMonstersOptions
): Promise<number> {
  if (!monsters || monsters.length === 0) return 0;

  const prepared = monsters.map(m => ({
    ...m,
    origin: m.origin || options?.source || 'USER_IMPORT',
    sourceBook: m.sourceBook || options?.sourceBook || options?.source || 'Imported Source'
  }));

  await compendiumDb.monsters.bulkPut(prepared);
  await notifyMonstersUpdated();

  return prepared.length;
}

export async function notifyMonstersUpdated(): Promise<void> {
  await bestiaryStore.refreshFromDb?.();
  await compendiumStore.refreshFromDb?.();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('compendium:monsters-updated'));
    window.dispatchEvent(new CustomEvent('compendium:data-synchronized'));
  }
}
