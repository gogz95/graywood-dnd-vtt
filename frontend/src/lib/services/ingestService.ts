// src/lib/services/ingestService.ts
// Tauri IPC wrappers for campaign crawling, PDF compilation, and Dexie compendium replication

import { dexieDb, type ActivatedActor, type RollableTable, type CompendiumItemRecord, type CompendiumSpellRecord } from '../db/dexieDb';
import { compendiumDb, type CompendiumMonster } from '../db/compendiumDb';
import { compendiumStore } from '../stores/compendiumStore.svelte';
import { notifyMonstersUpdated } from './ingestPipeline';
import type { IngestScanResult } from './ingest/ingestTypes';

export interface IngestPdfResult {
  monsters_count: number;
  spells_count: number;
  items_count: number;
  tables_count: number;
}

export interface HydratedEntityRecord {
  id: string;
  entity_type: string;
  name: string;
  is_activated: number;
  provenance: {
    file_rel?: string;
    page?: number;
    [key: string]: unknown;
  };
  data: {
    ac?: number;
    hp?: number;
    speed?: string;
    stats?: {
      str: number;
      dex: number;
      con: number;
      int: number;
      wis: number;
      cha: number;
    };
    attack_bonus?: number;
    damage_formula?: string;
    cr?: string;
    [key: string]: unknown;
  };
}

export interface HydratedWorkspaceData {
  entities: HydratedEntityRecord[];
  tables: RollableTable[];
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
}

function getTauri() {
  return typeof window !== 'undefined' ? (window as any).__TAURI__ : null;
}

/**
 * Invokes native directory crawler with ignore filters.
 */
export async function scanIngestDirectory(targetPath?: string): Promise<IngestScanResult | null> {
  const tauri = getTauri();
  if (isTauri() && tauri?.core?.invoke) {
    return await tauri.core.invoke('scan_ingest_directory', {
      target_path: targetPath || null,
    });
  }
  return null;
}

/**
 * Invokes native PDF compiler and table extractor on the active campaign workspace.
 */
export async function ingestPdf(filePath: string): Promise<IngestPdfResult | null> {
  const tauri = getTauri();
  if (isTauri() && tauri?.core?.invoke) {
    return await tauri.core.invoke('ingest_pdf', {
      filePath,
    });
  }
  return null;
}

/**
 * Pulls all hydrated entities and rollable tables from .graywood/index.sqlite.
 */
export async function getHydratedEntities(): Promise<HydratedWorkspaceData | null> {
  const tauri = getTauri();
  if (isTauri() && tauri?.core?.invoke) {
    return await tauri.core.invoke('get_hydrated_entities');
  }
  return null;
}

/**
 * Synchronizes hydrated SQLite records into Dexie tables (`actors`, `items`, `spells`, `tables`)
 * and refreshes reactive compendiumStore.
 */
export async function syncHydratedToDexie(): Promise<{
  actorsCount: number;
  spellsCount: number;
  itemsCount: number;
  tablesCount: number;
}> {
  const data = await getHydratedEntities();
  if (!data) {
    return { actorsCount: 0, spellsCount: 0, itemsCount: 0, tablesCount: 0 };
  }

  const actorsToPut: ActivatedActor[] = [];
  const monstersToCompendium: CompendiumMonster[] = [];
  const spellsToPut: CompendiumSpellRecord[] = [];
  const itemsToPut: CompendiumItemRecord[] = [];

  for (const entity of data.entities) {
    const typeLower = (entity.entity_type || '').toLowerCase();
    const sourceBook = entity.provenance?.file_rel || 'Compiled Sourcebook';

    if (typeLower === 'spell') {
      spellsToPut.push({
        id: entity.id,
        name: entity.name,
        level: (entity.data?.level as number) || 1,
        school: (entity.data?.school as string) || 'Universal',
        description: (entity.data?.description as string) || `Compiled from ${sourceBook}`,
        sourceBook,
        packageId: 'compiled-sourcebook',
        origin: 'USER_IMPORT',
      });
    } else if (typeLower === 'item' || typeLower === 'equipment') {
      itemsToPut.push({
        id: entity.id,
        name: entity.name,
        type: (entity.data?.type as string) || 'Equipment',
        rarity: (entity.data?.rarity as string) || 'Common',
        description: (entity.data?.description as string) || `Compiled from ${sourceBook}`,
        sourceBook,
        packageId: 'compiled-sourcebook',
        origin: 'USER_IMPORT',
        mechanics: entity.data,
      });
    } else {
      // Default to monster / actor
      const actor: ActivatedActor = {
        id: entity.id,
        name: entity.name,
        type: entity.entity_type || 'monster',
        is_activated: entity.is_activated,
        provenance: {
          file_rel: entity.provenance?.file_rel || '',
          page: entity.provenance?.page || 1,
        },
        mechanics: entity.data || {},
        token_asset: `graywood-asset://localhost/.graywood/cache/tokens/${entity.id}.webp`,
        updated_at: Date.now(),
      };
      actorsToPut.push(actor);

      const crNum = parseFloat((entity.data?.cr as string) || '1') || 1;
      const stats = entity.data?.stats || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };

      monstersToCompendium.push({
        id: entity.id,
        name: entity.name,
        cr: crNum,
        size: 'Medium',
        type: entity.entity_type || 'humanoid',
        alignment: 'unaligned',
        ac: entity.data?.ac || 10,
        hp: entity.data?.hp || 10,
        speed: entity.data?.speed || '30 ft.',
        str: stats.str,
        dex: stats.dex,
        con: stats.con,
        int: stats.int,
        wis: stats.wis,
        cha: stats.cha,
        actions: entity.data?.damage_formula
          ? [{ name: 'Attack', description: `+${entity.data?.attack_bonus || 0} to hit, damage: ${entity.data?.damage_formula}` }]
          : [],
        sourceBook,
        packageId: 'compiled-sourcebook',
        origin: 'USER_IMPORT',
      });
    }
  }

  // 1. Commit into dexieDb
  if (actorsToPut.length > 0) {
    await dexieDb.actors.bulkPut(actorsToPut);
  }
  if (spellsToPut.length > 0) {
    await dexieDb.spells.bulkPut(spellsToPut);
  }
  if (itemsToPut.length > 0) {
    await dexieDb.items.bulkPut(itemsToPut);
  }
  if (data.tables && data.tables.length > 0) {
    await dexieDb.rollableTables.bulkPut(data.tables);
  }

  // 2. Commit into compendiumDb for UI compendium browser
  if (monstersToCompendium.length > 0) {
    await compendiumDb.monsters.bulkPut(monstersToCompendium);
  }
  if (spellsToPut.length > 0) {
    await compendiumDb.spells.bulkPut(
      spellsToPut.map((s) => ({
        id: s.id,
        name: s.name,
        level: s.level,
        school: s.school,
        castingTime: s.castingTime || '1 action',
        casting_time: s.casting_time || '1 action',
        range: s.range || '30 ft.',
        components: s.components || 'V, S',
        duration: s.duration || 'Instantaneous',
        description: s.description,
        sourceBook: s.sourceBook || 'Compiled Sourcebook',
        packageId: s.packageId || 'compiled-sourcebook',
        origin: s.origin || 'USER_IMPORT',
      }))
    );
  }
  if (itemsToPut.length > 0) {
    await compendiumDb.items.bulkPut(
      itemsToPut.map((it) => ({
        id: it.id,
        name: it.name,
        type: it.type,
        rarity: it.rarity || 'Common',
        description: it.description || '',
        sourceBook: it.sourceBook || 'Compiled Sourcebook',
        packageId: it.packageId || 'compiled-sourcebook',
        origin: it.origin || 'USER_IMPORT',
      }))
    );
  }
  if (data.tables && data.tables.length > 0) {
    const mappedTables = data.tables.map((t, idx) => ({
      id: idx + 1,
      name: t.name,
      category: 'Encounter',
      source: t.provenance?.source_file_rel || 'Compiled Sourcebook',
      headers: ['Range', 'Result'],
      rows: t.entries.map((e) => [`${e.range[0]}-${e.range[1]}`, e.text]),
    }));
    await compendiumDb.ingestedTables.bulkPut(mappedTables);
  }

  // 3. Refresh live compendium stores
  await compendiumStore.refreshFromDb();
  await notifyMonstersUpdated();

  return {
    actorsCount: actorsToPut.length,
    spellsCount: spellsToPut.length,
    itemsCount: itemsToPut.length,
    tablesCount: data.tables ? data.tables.length : 0,
  };
}
