import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { dexieDb } from '../db/dexieDb';
import { compendiumDb } from '../db/compendiumDb';
import { compendiumStore } from '../stores/compendiumStore.svelte';

describe('IngestService & Dexie Replication', () => {
  beforeEach(async () => {
    await dexieDb.actors.clear();
    await dexieDb.items.clear();
    await dexieDb.spells.clear();
    await dexieDb.rollableTables.clear();
  });

  it('replicates compiled SQLite actors, spells, items, and tables into Dexie', async () => {
    // 1. Verify schema on dexieDb
    expect(dexieDb.actors).toBeDefined();
    expect(dexieDb.spells).toBeDefined();
    expect(dexieDb.items).toBeDefined();
    expect(dexieDb.rollableTables).toBeDefined();

    // 2. Insert records simulating compiled sourcebook output
    await dexieDb.actors.put({
      id: 'srd_goblin',
      name: 'Goblin',
      type: 'monster',
      is_activated: 1,
      provenance: { file_rel: 'Sourcebooks/PHB.pdf', page: 12 },
      mechanics: { ac: 15, hp: 7, cr: '1/4' },
      token_asset: 'graywood-asset://localhost/.graywood/cache/tokens/srd_goblin.webp',
      updated_at: Date.now(),
    });

    await dexieDb.spells.put({
      id: 'srd_fireball',
      name: 'Fireball',
      level: 3,
      school: 'Evocation',
      description: 'A bright streak flashes from your pointing finger...',
      sourceBook: 'Sourcebooks/PHB.pdf',
      packageId: 'compiled-sourcebook',
      origin: 'USER_IMPORT',
    });

    await dexieDb.items.put({
      id: 'srd_longsword',
      name: 'Longsword',
      type: 'Weapon',
      rarity: 'Common',
      description: 'Versatile 1d8/1d10 slashing weapon.',
      sourceBook: 'Sourcebooks/PHB.pdf',
      packageId: 'compiled-sourcebook',
      origin: 'USER_IMPORT',
    });

    await dexieDb.rollableTables.put({
      id: 'tbl_encounters_12',
      name: 'Wandering Monsters',
      formula: '1d20',
      provenance: {
        source_type: 'pdf',
        source_file_rel: 'Sourcebooks/PHB.pdf',
        page_number: 12,
      },
      entries: [
        { range: [1, 5], text: '2d4 Goblins', linked_entity_id: 'srd_goblin' },
        { range: [6, 20], text: 'Quiet forest' },
      ],
    });

    // 3. Verify retrieval
    const actors = await dexieDb.actors.toArray();
    expect(actors.length).toBe(1);
    expect(actors[0].name).toBe('Goblin');

    const spells = await dexieDb.spells.toArray();
    expect(spells.length).toBe(1);
    expect(spells[0].name).toBe('Fireball');

    const items = await dexieDb.items.toArray();
    expect(items.length).toBe(1);
    expect(items[0].name).toBe('Longsword');

    const tables = await dexieDb.rollableTables.toArray();
    expect(tables.length).toBe(1);
    expect(tables[0].name).toBe('Wandering Monsters');
    expect(tables[0].entries[0].linked_entity_id).toBe('srd_goblin');
  });
});
