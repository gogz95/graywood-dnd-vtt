// frontend/src/lib/db/dexieDb.ts
// Unified Dexie.js Client Database supporting Compendium and Activated Actors

import Dexie, { type Table } from 'dexie';
import { compendiumDb } from './compendiumDb';

export interface ActivatedActor {
  id: string;
  name: string;
  type: string;
  is_activated: number; // 0 | 1
  provenance: {
    file_rel: string;
    page: number;
  };
  mechanics: {
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
  actors!: Table<ActivatedActor, string>;
  items!: Table<CompendiumItemRecord, string>;
  spells!: Table<CompendiumSpellRecord, string>;
  rollableTables!: Table<RollableTable, string>;

  constructor() {
    super('vtt_actors_database');

    this.version(1).stores({
      actors: 'id, name, type, is_activated, [type+is_activated]',
    });

    this.version(2).stores({
      actors: 'id, name, type, is_activated, [type+is_activated]',
      items: 'id, name, type, rarity, origin',
      spells: 'id, name, level, school, origin',
      rollableTables: 'id, name, formula',
    });
  }
}

export const dexieDb = new VttClientDatabase();
export { compendiumDb };
