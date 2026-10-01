// src/lib/db/mapsDb.ts
// Persistent Map Database powered by Dexie.js (IndexedDB)
// Stores tactical battlemaps, overland atlas maps, and hierarchical atlas nodes/pins

import Dexie, { type Table } from 'dexie';
import type { TacticalBattlemap, WorldAtlasMap } from '../types/maps';

// ─── Atlas Schema Types ──────────────────────────────────────────────────────

export type AtlasUnit = 'miles' | 'km' | 'leagues';
export type AtlasPinTargetType = 'atlas_map' | 'battlemap_scene' | 'journal_entry';

export interface AtlasMapNode {
  id: string;
  name: string;
  /** null = root world map */
  parentId: string | null;
  imageUrl: string;
  /** Display width of the source image in px */
  imageWidthPx: number;
  /** Display height of the source image in px */
  imageHeightPx: number;
  pixelsPerUnit: number;
  unit: AtlasUnit;
  breadcrumb: string[];   // e.g. ['World', 'Continent', 'Kingdom']
  createdAt: number;
  updatedAt: number;
}

export interface AtlasPin {
  id: string;
  atlasMapId: string;
  label: string;
  description?: string;
  /** Normalized [0.0 – 1.0] relative to image width */
  x: number;
  /** Normalized [0.0 – 1.0] relative to image height */
  y: number;
  targetType: AtlasPinTargetType;
  /** ID of the linked atlas_map / battlemap_scene / journal_entry */
  targetId: string;
  iconEmoji?: string;
  createdAt: number;
}

// ─── Database Class ───────────────────────────────────────────────────────────

export class MapsDatabase extends Dexie {
  tacticalMaps!: Table<TacticalBattlemap, string>;
  atlasMaps!: Table<WorldAtlasMap, string>;
  atlasNodes!: Table<AtlasMapNode, string>;
  atlasPins!: Table<AtlasPin, string>;

  constructor() {
    super('VttMapsDatabase');

    this.version(1).stores({
      tacticalMaps: 'id, name, type, createdAt, updatedAt',
      atlasMaps: 'id, name, type, createdAt, updatedAt',
    });

    this.version(2).stores({
      tacticalMaps: 'id, name, type, createdAt, updatedAt',
      atlasMaps: 'id, name, type, createdAt, updatedAt',
      atlasNodes: 'id, parentId, name, createdAt, updatedAt',
      atlasPins: 'id, atlasMapId, targetType, targetId, createdAt',
    });
  }
}

export const mapsDb = new MapsDatabase();

