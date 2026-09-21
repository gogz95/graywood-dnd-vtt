// src/lib/services/storageMonitor.ts
// IndexedDB Quota Monitor & Storage Health Diagnostics
// Coordinates storage warnings via systemBus and provides cleanup optimizations

import { systemBus } from './systemBus';
import { mapsDb } from '../db/mapsDb';
import { compendiumDb } from '../db/compendiumDb';
import { journalDb } from '../db/journalDb';

export interface StorageEstimateResult {
  usageBytes: number;
  quotaBytes: number;
  usagePercent: number;
}

export interface StorageBreakdownResult {
  estimate: StorageEstimateResult;
  mapsCount: number;
  atlasCount: number;
  journalCount: number;
  monstersCount: number;
  spellsCount: number;
}

export async function getStorageEstimate(): Promise<StorageEstimateResult> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      const usagePercent = quota > 0 ? (usage / quota) * 100 : 0;

      if (usagePercent >= 80) {
        systemBus.emit('STORAGE_QUOTA_WARNING', {
          usageBytes: usage,
          quotaBytes: quota,
          usagePercent,
        });
      }

      return {
        usageBytes: usage,
        quotaBytes: quota,
        usagePercent,
      };
    } catch {
      // ignore
    }
  }

  return {
    usageBytes: 0,
    quotaBytes: 0,
    usagePercent: 0,
  };
}

export async function getStorageBreakdown(): Promise<StorageBreakdownResult> {
  const estimate = await getStorageEstimate();
  const [mapsCount, atlasCount, journalCount, monstersCount, spellsCount] = await Promise.all([
    mapsDb.tacticalMaps.count().catch(() => 0),
    mapsDb.atlasMaps.count().catch(() => 0),
    journalDb.journals.count().catch(() => 0),
    compendiumDb.monsters.count().catch(() => 0),
    compendiumDb.spells.count().catch(() => 0),
  ]);

  return {
    estimate,
    mapsCount,
    atlasCount,
    journalCount,
    monstersCount,
    spellsCount,
  };
}

export async function optimizeStorage(): Promise<{ freedItems: number }> {
  let freed = 0;

  try {
    // 1. Clean unlinked/empty texture blobs or orphan tokens
    const maps = await mapsDb.tacticalMaps.toArray();
    for (const map of maps) {
      if (map.tokens && map.tokens.length > 0) {
        const validTokens = map.tokens.filter((t) => t && t.tokenId);
        if (validTokens.length !== map.tokens.length) {
          await mapsDb.tacticalMaps.update(map.id, { tokens: validTokens, updatedAt: Date.now() });
          freed++;
        }
      }
    }

    // 2. Clean temporary caches in browser cache storage if available
    if (typeof caches !== 'undefined') {
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        if (name.includes('temp') || name.includes('preview')) {
          await caches.delete(name);
          freed++;
        }
      }
    }
  } catch {
    // ignore cleanup errors
  }

  return { freedItems: freed };
}
