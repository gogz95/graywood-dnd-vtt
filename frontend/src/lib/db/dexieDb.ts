// frontend/src/lib/db/dexieDb.ts
// Decoupled Core Dexie.js Client Database with Headless Fallback

import Dexie, { type Table } from 'dexie';
import { compendiumDb } from './compendiumDb';

// Headless Vitest / Node polyfill for Svelte 5 runes in .ts files
if (typeof (globalThis as any).$state === 'undefined') {
  (globalThis as any).$state = (v: any) => v;
}

export interface CoreSceneRecord {
  id: string;
  name: string;
  type: string;
  gridSize?: number;
  scaleFeet?: number;
  assetUrl?: string;
}

export interface CoreTokenRecord {
  id: string;
  sceneId: string;
  actorId?: string;
  x?: number;
  y?: number;
  elevation?: number;
  metadata?: Record<string, unknown>;
}

export interface CoreEncounterRecord {
  id: string;
  sceneId: string;
  isActive: boolean;
  round?: number;
  currentTurnIndex?: number;
}

export interface ActivatedActor {
  id: string;
  name: string;
  type: string;
  is_activated?: number; // 0 | 1
  provenance?: {
    file_rel: string;
    page: number;
  };
  mechanics?: {
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
  token_asset?: string;
  updated_at?: number;
  level?: number;
  current_hp?: number;
  max_hp?: number;
  temp_hp?: number;
  hit_dice_current?: number;
  hit_dice_max?: number;
  hit_die_size?: number;
  exhaustion?: number;
  death_saves?: { successes: number; failures: number };
  spell_slots?: Array<{ level: number; total: number; used: number }>;
  pact_magic?: { level: number; total: number; used: number };
  features?: Array<{
    id: string;
    name: string;
    uses: number;
    maxUses: number;
    recharge: 'short_rest' | 'long_rest' | 'daily' | 'none';
  }>;
}

export interface RollableTable {
  id: string;
  name: string;
  formula: string;
  provenance: {
    source_type: string;
    source_file_rel: string;
    page_number?: number;
  };
  entries: Array<{
    range: [number, number];
    text: string;
    linked_entity_id?: string;
  }>;
}

export interface CompendiumItemRecord {
  id: string;
  name: string;
  type: string;
  rarity?: string;
  cost?: string;
  weight?: number;
  description?: string;
  sourceBook?: string;
  packageId?: string;
  origin?: 'SRD-5.1' | 'USER_IMPORT';
  mechanics?: Record<string, unknown>;
}

export interface CompendiumSpellRecord {
  id: string;
  name: string;
  level: number;
  school: string;
  castingTime?: string;
  casting_time?: string;
  range?: string;
  components?: string;
  duration?: string;
  description: string;
  sourceBook?: string;
  packageId?: string;
  origin?: 'SRD-5.1' | 'USER_IMPORT';
}

export class VttClientDatabase extends Dexie {
  scenes!: Table<CoreSceneRecord, string>;
  tokens!: Table<CoreTokenRecord, string>;
  actors!: Table<ActivatedActor, string>;
  encounters!: Table<CoreEncounterRecord, string>;
  items!: Table<CompendiumItemRecord, string>;
  spells!: Table<CompendiumSpellRecord, string>;
  rollableTables!: Table<RollableTable, string>;

  constructor() {
    super('vtt_actors_database');

    // Core VTT schema restricted to essential entities + compendium tables
    this.version(1).stores({
      scenes: 'id, name, type',
      tokens: 'id, sceneId, actorId',
      actors: 'id, name, type',
      encounters: 'id, sceneId, isActive',
      items: 'id, name, type, rarity, origin',
      spells: 'id, name, level, school, origin',
      rollableTables: 'id, name, formula'
    });

    this.version(2).stores({
      scenes: 'id, name, type',
      tokens: 'id, sceneId, actorId',
      actors: 'id, name, type, is_activated, [type+is_activated]',
      encounters: 'id, sceneId, isActive',
      items: 'id, name, type, rarity, origin',
      spells: 'id, name, level, school, origin',
      rollableTables: 'id, name, formula'
    });
  }
}

// ── Headless In-Memory Adapter ──────────────────────────────────────────────
class InMemoryTable<T = any> {
  private store = new Map<string, T>();

  async get(id: string): Promise<T | undefined> {
    return this.store.get(id);
  }

  async put(item: T, key?: string): Promise<string> {
    const id = key ?? (item as any).id ?? `item-${Date.now()}`;
    this.store.set(id, item);
    return id;
  }

  async bulkPut(items: T[]): Promise<void> {
    for (const item of items) {
      const id = (item as any).id ?? `item-${Date.now()}`;
      this.store.set(id, item);
    }
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  async toArray(): Promise<T[]> {
    return Array.from(this.store.values());
  }

  async count(): Promise<number> {
    return this.store.size;
  }

  where(index: string) {
    return {
      equals: (val: any) => ({
        toArray: async () =>
          Array.from(this.store.values()).filter((item: any) => item[index] === val)
      })
    };
  }
}

function createInMemoryDatabase(): VttClientDatabase {
  return {
    scenes: new InMemoryTable<CoreSceneRecord>(),
    tokens: new InMemoryTable<CoreTokenRecord>(),
    actors: new InMemoryTable<ActivatedActor>(),
    encounters: new InMemoryTable<CoreEncounterRecord>(),
    items: new InMemoryTable<CompendiumItemRecord>(),
    spells: new InMemoryTable<CompendiumSpellRecord>(),
    rollableTables: new InMemoryTable<RollableTable>(),
    isOpen: () => true,
    close: () => {},
    open: async () => {},
    delete: async () => {}
  } as unknown as VttClientDatabase;
}

export const dexieDb: VttClientDatabase =
  typeof indexedDB !== 'undefined'
    ? new VttClientDatabase()
    : createInMemoryDatabase();

export { compendiumDb };
