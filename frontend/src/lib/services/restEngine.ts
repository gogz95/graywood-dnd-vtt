// src/lib/services/restEngine.ts
// 5e SRD Short & Long Rest Engine (party-wide, Dexie + Tauri IPC aware)
//
// Short Rest: spend Hit Dice (1dHD + CON mod per die) to recover HP, then refresh
//             short-rest class features and Warlock Pact Magic slots.
// Long Rest:  restore HP to max, clear temp HP, regain max(1, floor(level / 2))
//             Hit Dice, refill every spell slot (levels 1-9 + Pact Magic),
//             recharge short/long/daily class features, and reduce exhaustion by 1.
//
// Both flows persist the updated actors to Dexie (`dexieDb.actors.bulkPut`) and invoke
// the `sync_party_rest_recovery` Tauri command so the Rust backend mirrors the new
// state into campaign SQLite and broadcasts it to connected companion phones.
// A `REST_COMPLETED` event is emitted on the system bus for session-log consumers.

import { systemBus } from './systemBus';
import { chatStore } from '../stores/chatStore.svelte';
import { dexieDb, type ActivatedActor } from '../db/dexieDb';

// ── Canonical rest actor shape ─────────────────────────────────────────────
export interface ActorHitPoints {
  current: number;
  max: number;
  temp: number;
}

export interface ActorHitDice {
  current: number;
  total: number;
  dieSize: number;
}

export interface ActorDeathSaves {
  successes: number;
  failures: number;
}

/** Cooldown cadence that governs when a class feature refills. */
export type FeatureRecharge = 'short_rest' | 'long_rest' | 'daily' | 'none';

export interface ActorFeature {
  id: string;
  name: string;
  uses: number;
  maxUses: number;
  recharge: FeatureRecharge;
}

export interface ActorSpellSlotPool {
  level: number;
  total: number;
  used: number;
}

export interface ActorPactMagic {
  level: number;
  total: number;
  used: number;
}

/**
 * Framework-agnostic, mutable-in-practice snapshot of everything a 5e rest
 * touches. Built from a Dexie `ActivatedActor` record via {@link fromActivatedActor}
 * and written back through {@link toActivatedActor}.
 */
export interface RestActor {
  id: string;
  name: string;
  level: number;
  /** Constitution score — the resting modifier is derived as `floor((con - 10) / 2)`. */
  con: number;
  /** When `true`, long rests leave the actor untouched. */
  isDead: boolean;
  hp: ActorHitPoints;
  hitDice: ActorHitDice;
  deathSaves: ActorDeathSaves;
  exhaustion: number;
  spellSlots: ActorSpellSlotPool[];
  pactMagic?: ActorPactMagic;
  features: ActorFeature[];
  /** Original Dexie record, retained for loss-less persistence round-trips. */
  source?: ActivatedActor;
}

export interface ShortRestResult {
  actor: RestActor;
  hpRecovered: number;
  diceSpent: number;
  rollDetails: number[];
  featuresRecharged: number;
  pactSlotsRestored: number;
  summary: string;
}

export interface LongRestResult {
  restType: 'long';
  updatedActors: RestActor[];
  hpRestored: number;
  hitDiceRecovered: number;
  slotsRestored: number;
  featuresRecharged: number;
  exhaustionReduced: number;
  summary: string;
}

// ── Small coercion helpers ─────────────────────────────────────────────────
function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function firstNum(values: unknown[], fallback: number): number {
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return fallback;
}

/** 5e ability modifier: `floor((score - 10) / 2)`. */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** Infer a hit die size from a class or actor type label. */
export function inferHitDieSize(label: string | undefined): number {
  const cls = (label ?? '').toLowerCase();
  if (cls.includes('barbarian')) return 12;
  if (cls.includes('fighter') || cls.includes('paladin') || cls.includes('ranger')) return 10;
  if (cls.includes('sorcerer') || cls.includes('wizard')) return 6;
  return 8; // Cleric, Druid, Monk, Rogue, Warlock, Bard
}

// ── Dexie <-> RestActor adapters ───────────────────────────────────────────
/**
 * Coerces a stored `ActivatedActor` record into the canonical {@link RestActor}
 * shape, applying sensible 5e defaults when the stored record is sparse.
 */
export function fromActivatedActor(actor: ActivatedActor): RestActor {
  const mech = (actor.mechanics ?? {}) as Record<string, unknown>;
  const stats = (mech.stats ?? {}) as Record<string, unknown>;

  const level = firstNum([actor.level, mech.level], 1);
  const hpMax = firstNum([actor.max_hp, mech.hp_max, mech.hp], 10);
  const hpCurrent = firstNum([actor.current_hp, mech.hp_current, mech.hp], hpMax);
  const temp = firstNum([actor.temp_hp, mech.temp_hp], 0);

  const hdTotal = firstNum([actor.hit_dice_max, mech.hit_dice_max], Math.max(1, level));
  const hdCurrent = firstNum([actor.hit_dice_current, mech.hit_dice_current], hdTotal);
  const dieSize = firstNum([actor.hit_die_size, mech.hit_die_size], inferHitDieSize(actor.type));

  const deathSavesRaw = (actor.death_saves ?? mech.death_saves) as Partial<ActorDeathSaves> | undefined;
  const slotsRaw = (actor.spell_slots ?? mech.spell_slots) as ActorSpellSlotPool[] | undefined;
  const pactRaw = (actor.pact_magic ?? mech.pact_magic) as ActorPactMagic | undefined;
  const featuresRaw = (actor.features ?? mech.features) as ActorFeature[] | undefined;

  return {
    id: actor.id,
    name: actor.name,
    level,
    con: firstNum([stats.con], 10),
    isDead: mech.is_dead === true || mech.status === 'dead',
    hp: { current: hpCurrent, max: hpMax, temp },
    hitDice: { current: hdCurrent, total: hdTotal, dieSize },
    deathSaves: {
      successes: num(deathSavesRaw?.successes, 0),
      failures: num(deathSavesRaw?.failures, 0),
    },
    exhaustion: firstNum([actor.exhaustion, mech.exhaustion], 0),
    spellSlots: Array.isArray(slotsRaw)
      ? slotsRaw.map((s) => ({ level: num(s.level, 0), total: num(s.total, 0), used: num(s.used, 0) }))
      : [],
    pactMagic: pactRaw
      ? { level: num(pactRaw.level, 5), total: num(pactRaw.total, 0), used: num(pactRaw.used, 0) }
      : undefined,
    features: Array.isArray(featuresRaw)
      ? featuresRaw.map((f) => ({
          id: f.id,
          name: f.name,
          uses: num(f.uses, 0),
          maxUses: num(f.maxUses, 0),
          recharge: (f.recharge ?? 'none') as FeatureRecharge,
        }))
      : [],
    source: actor,
  };
}

/**
 * Serializes a {@link RestActor} back into an `ActivatedActor` record for Dexie.
 * The authoritative values live under `mechanics.*`; a flat mirror is also written
 * to the record root so the Rust backend can update the campaign `characters` table.
 */
export function toActivatedActor(actor: RestActor): ActivatedActor {
  const base: ActivatedActor = actor.source
    ? { ...actor.source }
    : {
        id: actor.id,
        name: actor.name,
        type: 'character',
        is_activated: 1,
        provenance: { file_rel: '', page: 0 },
        mechanics: {},
      };

  const mechanics = { ...(base.mechanics ?? {}) } as Record<string, unknown>;
  mechanics.hp = actor.hp.current;
  mechanics.hp_max = actor.hp.max;
  mechanics.temp_hp = actor.hp.temp;
  mechanics.hit_dice_current = actor.hitDice.current;
  mechanics.hit_dice_max = actor.hitDice.total;
  mechanics.hit_die_size = actor.hitDice.dieSize;
  mechanics.level = actor.level;
  mechanics.exhaustion = actor.exhaustion;
  mechanics.death_saves = { ...actor.deathSaves };
  if (actor.spellSlots.length) mechanics.spell_slots = actor.spellSlots.map((s) => ({ ...s }));
  if (actor.pactMagic) mechanics.pact_magic = { ...actor.pactMagic };
  if (actor.features.length) mechanics.features = actor.features.map((f) => ({ ...f }));

  return {
    ...base,
    id: actor.id,
    name: actor.name,
    level: actor.level,
    current_hp: actor.hp.current,
    max_hp: actor.hp.max,
    temp_hp: actor.hp.temp,
    hit_dice_current: actor.hitDice.current,
    hit_dice_max: actor.hitDice.total,
    hit_die_size: actor.hitDice.dieSize,
    exhaustion: actor.exhaustion,
    death_saves: { ...actor.deathSaves },
    mechanics,
    updated_at: Date.now(),
  };
}

/** Loads every activation-flagged party actor from Dexie as canonical rest actors. */
export async function loadPartyRestActors(): Promise<RestActor[]> {
  try {
    const records = await dexieDb.actors.toArray();
    return records.map(fromActivatedActor);
  } catch (err) {
    console.warn('[restEngine] Failed to load party actors from Dexie:', err);
    return [];
  }
}

// ── Persistence & backend IPC ─────────────────────────────────────────────
/**
 * Safe Tauri IPC bridge. Resolves `undefined` in browser / test runtimes rather
 * than throwing, mirroring the defensive `invoke` pattern used across the codebase.
 */
async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T | undefined> {
  if (typeof window === 'undefined') return undefined;

  const win = window as unknown as {
    __TAURI__?: { core?: { invoke: <R>(c: string, a?: unknown) => Promise<R> } };
    __TAURI_INTERNALS__?: { invoke: <R>(c: string, a?: unknown) => Promise<R> };
  };
  const invokeFn = win.__TAURI__?.core?.invoke || win.__TAURI_INTERNALS__?.invoke;
  if (typeof invokeFn !== 'function') return undefined;

  try {
    return await invokeFn<T>(cmd, args);
  } catch (err) {
    console.warn(`[restEngine] Tauri IPC "${cmd}" failed:`, err);
    return undefined;
  }
}

/**
 * Persists the updated party to local Dexie storage via `db.actors.bulkPut`, then
 * invokes the registered `sync_party_rest_recovery` Tauri command (payload
 * `{ rest_type, updated_actors }`) so the Rust backend mirrors the new state into
 * campaign SQLite and broadcasts `HpUpdate` / `PARTY_STATE_UPDATED` over WebSocket
 * to connected companion phones.
 *
 * @returns the number of persisted actor records.
 */
export async function syncRestState(
  restType: 'short' | 'long',
  actors: RestActor[]
): Promise<number> {
  if (actors.length === 0) return 0;
  const records = actors.map((a) => toActivatedActor(a));

  try {
    await dexieDb.actors.bulkPut(records);
  } catch (err) {
    console.warn('[restEngine] Failed to persist rest state to Dexie:', err);
  }

  await invokeTauri<number>('sync_party_rest_recovery', {
    payload: { rest_type: restType, updated_actors: records },
  });

  return records.length;
}

// ── Short Rest ─────────────────────────────────────────────────────────────
/**
 * Executes a 5e Short Rest for a single actor: spends Hit Dice, recovers
 * `dieRoll + CON modifier` HP per die (clamped to max HP), refreshes short-rest
 * cooldown features and Warlock Pact Magic slots, then persists and broadcasts.
 *
 * @param actor       canonical rest actor
 * @param spentDice   number of Hit Dice to expend (clamped to the available pool)
 * @param manualRolls optional pre-rolled die results (used for UI preview parity)
 */
export async function executeShortRest(
  actor: RestActor,
  spentDice: number = 1,
  manualRolls?: number[]
): Promise<ShortRestResult> {
  const dieSize = actor.hitDice.dieSize || 8;
  const actualDice = Math.max(0, Math.min(spentDice, actor.hitDice.current));

  if (actualDice === 0) {
    const summary = `🌿 **${actor.name}** has no available Hit Dice to spend.`;
    chatStore.sendMessage(summary, 'System');
    return {
      actor: { ...actor },
      hpRecovered: 0,
      diceSpent: 0,
      rollDetails: [],
      featuresRecharged: 0,
      pactSlotsRestored: 0,
      summary,
    };
  }

  const conMod = abilityModifier(actor.con);
  const rollDetails: number[] = [];
  let totalHealing = 0;

  for (let i = 0; i < actualDice; i++) {
    const raw = manualRolls && manualRolls[i] !== undefined
      ? Math.max(1, Math.min(dieSize, Math.floor(manualRolls[i])))
      : Math.floor(Math.random() * dieSize) + 1;
    rollDetails.push(raw);
    totalHealing += Math.max(0, raw + conMod);
  }

  const nextHp = Math.min(actor.hp.max, actor.hp.current + totalHealing);
  const hpRecovered = Math.max(0, nextHp - actor.hp.current);

  // Refresh short-rest cooldown abilities (Action Surge, Second Wind, Ki, Channel Divinity...).
  let featuresRecharged = 0;
  const nextFeatures = actor.features.map((feature) => {
    if (feature.recharge === 'short_rest') {
      if (feature.uses < feature.maxUses) featuresRecharged += 1;
      return { ...feature, uses: feature.maxUses };
    }
    return { ...feature };
  });

  // Warlock Pact Magic slots recover on a Short Rest.
  let pactSlotsRestored = 0;
  let nextPact = actor.pactMagic;
  if (actor.pactMagic) {
    pactSlotsRestored = Math.max(0, actor.pactMagic.used);
    nextPact = { ...actor.pactMagic, used: 0 };
  }

  const updated: RestActor = {
    ...actor,
    hp: { ...actor.hp, current: nextHp },
    hitDice: { ...actor.hitDice, current: actor.hitDice.current - actualDice },
    features: nextFeatures,
    pactMagic: nextPact,
  };

  const sign = conMod >= 0 ? '+' : '';
  const summary =
    `🌿 **${actor.name}** completed a Short Rest: spent ${actualDice}d${dieSize} (${sign}${conMod} CON) ` +
    `recovering **${hpRecovered} HP** (${nextHp}/${actor.hp.max} HP, ${updated.hitDice.current}/${actor.hitDice.total} HD remaining).` +
    (featuresRecharged ? ` ${featuresRecharged} feature(s) recharged.` : '') +
    (pactSlotsRestored ? ` ${pactSlotsRestored} Pact slot(s) restored.` : '');

  chatStore.sendMessage(summary, 'System');
  await syncRestState('short', [updated]);

  systemBus.emit('REST_COMPLETED', {
    characterId: actor.id,
    restType: 'short',
    hpRestored: hpRecovered,
    hdSpent: actualDice,
  });

  return {
    actor: updated,
    hpRecovered,
    diceSpent: actualDice,
    rollDetails,
    featuresRecharged,
    pactSlotsRestored,
    summary,
  };
}


// ── Long Rest ──────────────────────────────────────────────────────────────
/**
 * Executes a 5e Long Rest for the whole party. Non-dead actors have HP restored to
 * max, temp HP cleared, death saves reset, Hit Dice recovered by
 * `max(1, floor(level / 2))` (clamped to the total pool), all spell slots (1-9 and
 * Pact Magic) refilled, short/long/daily class features reset, and exhaustion
 * reduced by 1.
 *
 * @param partyActors canonical rest actors for every party member
 */
export async function executeLongRest(partyActors: RestActor[]): Promise<LongRestResult> {
  let hpRestored = 0;
  let hitDiceRecovered = 0;
  let slotsRestored = 0;
  let featuresRecharged = 0;
  let exhaustionReduced = 0;

  const hpPerActor: number[] = [];

  const updatedActors: RestActor[] = partyActors.map((actor) => {
    // Dead actors are left untouched.
    if (actor.isDead) {
      hpPerActor.push(0);
      return { ...actor };
    }

    const actorHpRestored = Math.max(0, actor.hp.max - actor.hp.current);
    hpRestored += actorHpRestored;
    hpPerActor.push(actorHpRestored);

    // Regain spent Hit Dice: max(1, floor(level / 2)), clamped to the total pool.
    const allowance = Math.max(1, Math.floor((actor.level || 1) / 2));
    const nextHd = Math.min(actor.hitDice.total, actor.hitDice.current + allowance);
    hitDiceRecovered += nextHd - actor.hitDice.current;

    // Refill every expended spell slot (levels 1-9 + Pact Magic).
    let restored = 0;
    const nextSlots = actor.spellSlots.map((slot) => {
      restored += Math.max(0, slot.used);
      return { ...slot, used: 0 };
    });
    let nextPact = actor.pactMagic;
    if (actor.pactMagic) {
      restored += Math.max(0, actor.pactMagic.used);
      nextPact = { ...actor.pactMagic, used: 0 };
    }
    slotsRestored += restored;

    // Recharge short-rest, long-rest, and daily class features.
    let recharged = 0;
    const nextFeatures = actor.features.map((feature) => {
      if (
        feature.recharge === 'short_rest' ||
        feature.recharge === 'long_rest' ||
        feature.recharge === 'daily'
      ) {
        if (feature.uses < feature.maxUses) recharged += 1;
        return { ...feature, uses: feature.maxUses };
      }
      return { ...feature };
    });
    featuresRecharged += recharged;

    const nextExhaustion = actor.exhaustion > 0 ? actor.exhaustion - 1 : 0;
    if (actor.exhaustion > 0) exhaustionReduced += 1;

    return {
      ...actor,
      hp: { current: actor.hp.max, max: actor.hp.max, temp: 0 },
      hitDice: { ...actor.hitDice, current: nextHd },
      deathSaves: { successes: 0, failures: 0 },
      exhaustion: nextExhaustion,
      spellSlots: nextSlots,
      pactMagic: nextPact,
      features: nextFeatures,
    };
  });

  await syncRestState('long', updatedActors);

  const summary =
    `✨ The party completed a Long Rest: restored **${hpRestored} HP**, regained **${hitDiceRecovered} Hit Dice**, ` +
    `refilled **${slotsRestored} spell slot(s)**, recharged **${featuresRecharged} class feature(s)**, ` +
    `and reduced exhaustion on **${exhaustionReduced}** member(s).`;
  chatStore.sendMessage(summary, 'System');

  updatedActors.forEach((actor, index) => {
    systemBus.emit('REST_COMPLETED', {
      characterId: actor.id,
      restType: 'long',
      hpRestored: hpPerActor[index] ?? 0,
    });
  });

  return {
    restType: 'long',
    updatedActors,
    hpRestored,
    hitDiceRecovered,
    slotsRestored,
    featuresRecharged,
    exhaustionReduced,
    summary,
  };
}

