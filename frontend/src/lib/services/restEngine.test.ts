// frontend/src/lib/services/restEngine.test.ts
// Validates the 5e Short/Long Rest automation: mechanical recovery rules,
// Dexie persistence, and the Dexie <-> RestActor adapter round-trip.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// chatStore pulls in heavy audio/websocket singletons; stub it for isolation.
vi.mock('../stores/chatStore.svelte', () => ({
  chatStore: { sendMessage: vi.fn() },
}));

import { dexieDb, type ActivatedActor } from '../db/dexieDb';
import {
  executeLongRest,
  executeShortRest,
  loadPartyRestActors,
  fromActivatedActor,
  toActivatedActor,
} from './restEngine';

function makeFighter(overrides: Partial<ActivatedActor> = {}): ActivatedActor {
  return {
    id: 'hero-fighter',
    name: 'Kaela',
    type: 'fighter',
    is_activated: 1,
    provenance: { file_rel: 'party.json', page: 1 },
    level: 5,
    current_hp: 5,
    max_hp: 15,
    temp_hp: 4,
    hit_dice_current: 1,
    hit_dice_max: 5,
    hit_die_size: 10,
    exhaustion: 2,
    death_saves: { successes: 1, failures: 2 },
    spell_slots: [
      { level: 1, total: 4, used: 3 },
      { level: 2, total: 3, used: 1 },
    ],
    pact_magic: { level: 3, total: 2, used: 2 },
    features: [
      { id: 'second-wind', name: 'Second Wind', uses: 0, maxUses: 1, recharge: 'short_rest' },
      { id: 'action-surge', name: 'Action Surge', uses: 0, maxUses: 1, recharge: 'short_rest' },
      { id: 'indomitable', name: 'Indomitable', uses: 0, maxUses: 1, recharge: 'long_rest' },
      { id: 'daily-boon', name: 'Daily Boon', uses: 0, maxUses: 1, recharge: 'daily' },
      { id: 'permanent', name: 'Always On', uses: 0, maxUses: 1, recharge: 'none' },
    ],
    mechanics: {
      ac: 18,
      hp: 5,
      speed: '30 ft.',
      stats: { str: 16, dex: 14, con: 16, int: 10, wis: 12, cha: 8 },
    },
    ...overrides,
  };
}

describe('restEngine — 5e rest automation', () => {
  beforeEach(async () => {
    await dexieDb.actors.clear();
  });

  it('executeLongRest restores HP, slots, hit dice, features and exhaustion, then persists', async () => {
    await dexieDb.actors.put(makeFighter());

    const party = await loadPartyRestActors();
    expect(party).toHaveLength(1);

    const result = await executeLongRest(party);
    const updated = result.updatedActors[0];

    // HP restored to max, temp HP cleared, death saves reset.
    expect(updated.hp.current).toBe(15);
    expect(updated.hp.temp).toBe(0);
    expect(updated.deathSaves).toEqual({ successes: 0, failures: 0 });

    // Hit Dice: max(1, floor(level / 2)) = max(1, floor(5/2)) = 2 regained, clamped to 5.
    expect(result.hitDiceRecovered).toBe(2);
    expect(updated.hitDice.current).toBe(3);

    // Exhaustion decremented by 1.
    expect(updated.exhaustion).toBe(1);
    expect(result.exhaustionReduced).toBe(1);

    // Spell slots (levels 1-9 + Pact Magic) fully refilled.
    expect(result.slotsRestored).toBe(3 + 1 + 2);
    expect(updated.spellSlots.every((s) => s.used === 0)).toBe(true);
    expect(updated.pactMagic?.used).toBe(0);

    // short_rest / long_rest / daily features recharged; 'none' left untouched.
    expect(result.featuresRecharged).toBe(4);
    expect(updated.features.find((f) => f.id === 'second-wind')?.uses).toBe(1);
    expect(updated.features.find((f) => f.id === 'indomitable')?.uses).toBe(1);
    expect(updated.features.find((f) => f.id === 'daily-boon')?.uses).toBe(1);
    expect(updated.features.find((f) => f.id === 'permanent')?.uses).toBe(0);

    // Persisted to Dexie (mechanics mirror + flat backend mirror).
    const stored = await dexieDb.actors.get('hero-fighter');
    expect(stored?.current_hp).toBe(15);
    expect(stored?.mechanics?.hp).toBe(15);
    expect(stored?.mechanics?.hit_dice_current).toBe(3);

    // HP summary metric matches the 5 -> 15 recovery.
    expect(result.hpRestored).toBe(10);
  });

  it('executeShortRest spends a hit die, heals die + CON, and refreshes short-rest abilities', async () => {
    await dexieDb.actors.put(makeFighter());

    const [actor] = await loadPartyRestActors();
    // CON 16 => +3 modifier, manual roll of 7 => 10 healing (5 -> 15, capped at max).
    const result = await executeShortRest(actor, 1, [7]);

    expect(result.rollDetails).toEqual([7]);
    expect(result.diceSpent).toBe(1);
    expect(result.hpRecovered).toBe(10);
    expect(result.actor.hp.current).toBe(15);
    expect(result.actor.hitDice.current).toBe(0);

    // Only short-rest cooldown features refresh.
    expect(result.featuresRecharged).toBe(2);
    expect(result.actor.features.find((f) => f.id === 'second-wind')?.uses).toBe(1);
    expect(result.actor.features.find((f) => f.id === 'action-surge')?.uses).toBe(1);
    expect(result.actor.features.find((f) => f.id === 'indomitable')?.uses).toBe(0);

    // Pact Magic recovers on a Short Rest.
    expect(result.pactSlotsRestored).toBe(2);
    expect(result.actor.pactMagic?.used).toBe(0);

    const stored = await dexieDb.actors.get('hero-fighter');
    expect(stored?.current_hp).toBe(15);
    expect(stored?.hit_dice_current).toBe(0);
  });


  it('executeShortRest is a no-op when no Hit Dice remain', async () => {
    await dexieDb.actors.put(makeFighter({ hit_dice_current: 0 }));

    const [actor] = await loadPartyRestActors();
    const result = await executeShortRest(actor, 3);

    expect(result.diceSpent).toBe(0);
    expect(result.hpRecovered).toBe(0);
    expect(result.rollDetails).toEqual([]);
  });

  it('long rest leaves dead actors untouched', async () => {
    const fighter = makeFighter();
    fighter.mechanics.is_dead = true;
    await dexieDb.actors.put(fighter);

    const party = await loadPartyRestActors();
    expect(party[0].isDead).toBe(true);

    const result = await executeLongRest(party);
    expect(result.hpRestored).toBe(0);
    expect(result.updatedActors[0].hp.current).toBe(5);
    expect(result.updatedActors[0].exhaustion).toBe(2);
  });

  it('fromActivatedActor / toActivatedActor round-trips rest state', () => {
    const original = fromActivatedActor(makeFighter());
    const restored = fromActivatedActor(toActivatedActor(original));

    expect(restored.hp).toEqual(original.hp);
    expect(restored.hitDice).toEqual(original.hitDice);
    expect(restored.exhaustion).toBe(original.exhaustion);
    expect(restored.spellSlots).toEqual(original.spellSlots);
    expect(restored.pactMagic).toEqual(original.pactMagic);
    expect(restored.level).toBe(original.level);
    expect(restored.con).toBe(16);
  });

});
