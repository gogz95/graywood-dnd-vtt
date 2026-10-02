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

export class VttClientDatabase extends Dexie {
  actors!: Table<ActivatedActor, string>;

  constructor() {
    super('vtt_actors_database');

    this.version(1).stores({
      actors: 'id, name, type, is_activated, [type+is_activated]',
    });
  }
}

export const dexieDb = new VttClientDatabase();
export { compendiumDb };
