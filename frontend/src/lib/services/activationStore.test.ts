import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { dexieDb, type ActivatedActor } from '../db/dexieDb';
import { ActivationStore } from './activationStore';

describe('ActivationStore & Dexie Actors hydration', () => {
  beforeEach(async () => {
    await dexieDb.actors.clear();
  });

  it('stores and retrieves activated actors from Dexie', async () => {
    const store = new ActivationStore();

    const sampleActor: ActivatedActor = {
      id: 'srd_goblin',
      name: 'Goblin',
      type: 'monster',
      is_activated: 1,
      provenance: {
        file_rel: 'Sourcebooks/MonsterManual.pdf',
        page: 166,
      },
      mechanics: {
        ac: 15,
        hp: 7,
        cr: '1/4',
        speed: '30 ft.',
        stats: {
          str: 8,
          dex: 14,
          con: 10,
          int: 10,
          wis: 8,
          cha: 8,
        },
      },
      token_asset: 'graywood-asset://localhost/.graywood/cache/tokens/srd_goblin.webp',
    };

    await dexieDb.actors.put(sampleActor);
    const loaded = await store.loadActivatedActors();

    expect(loaded.length).toBe(1);
    expect(loaded[0].id).toBe('srd_goblin');
    expect(loaded[0].name).toBe('Goblin');
    expect(loaded[0].is_activated).toBe(1);
    expect(loaded[0].provenance.page).toBe(166);

    const hit = await store.getActor('srd_goblin');
    expect(hit).toBeDefined();
    expect(hit?.mechanics.ac).toBe(15);
  });
});
