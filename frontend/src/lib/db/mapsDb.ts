// src/lib/db/mapsDb.ts
// Persistent Map Database powered by Dexie.js (IndexedDB)
// Stores tactical battlemaps and overland world atlas maps

import Dexie, { type Table } from 'dexie';
import type { TacticalBattlemap, WorldAtlasMap } from '../types/maps';

export class MapsDatabase extends Dexie {
  tacticalMaps!: Table<TacticalBattlemap, string>;
  atlasMaps!: Table<WorldAtlasMap, string>;

  constructor() {
    super('VttMapsDatabase');

    this.version(1).stores({
      tacticalMaps: 'id, name, type, createdAt, updatedAt',
      atlasMaps: 'id, name, type, createdAt, updatedAt',
    });
  }
}

export const mapsDb = new MapsDatabase();
