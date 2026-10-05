// src/lib/services/srdSeedService.ts
// Pure 5e SRD 5.1 Auto-Seeding Routine for Dexie Compendium

import {
  compendiumDb,
  SRD_RULES,
  type CompendiumMonster,
  type CompendiumSpell,
  type CompendiumItem,
  type CompendiumRule
} from '../db/compendiumDb';


export interface SrdSeedResult {
  seeded: boolean;
  monstersCount: number;
  spellsCount: number;
  itemsCount: number;
  rulesCount?: number;
  reason: string;
}

export interface CompendiumStats {
  totalSpells: number;
  totalMonsters: number;
  totalItems: number;
  totalRules?: number;
}

/**
 * Checks Dexie compendium database. If tables are empty or clean campaign creation is detected,
 * populates Dexie with the static 5e SRD 5.1 baseline seed without overwriting existing custom homebrew.
 * Ingestion is fully idempotent via bulkPut / upsert.
 */
export async function seedSrdCompendiumIfEmpty(force = false): Promise<SrdSeedResult> {
  try {
    const currentMonsters = await compendiumDb.monsters.count();
    const currentSpells = await compendiumDb.spells.count();
    const currentItems = await compendiumDb.items.count();
    const currentRules = compendiumDb.rules ? await compendiumDb.rules.count() : 0;

    const isEmpty = currentMonsters === 0 && currentSpells === 0 && currentItems === 0;

    if (!force && !isEmpty) {
      return {
        seeded: false,
        monstersCount: currentMonsters,
        spellsCount: currentSpells,
        itemsCount: currentItems,
        rulesCount: currentRules,
        reason: 'Compendium already populated; existing user entities preserved non-destructively.',
      };
    }

    // Populate missing tables transactionally
    const { default: srdSeedData } = await import('../data/srdCompendiumSeed.json');

    await compendiumDb.transaction(
      'rw',
      [compendiumDb.monsters, compendiumDb.spells, compendiumDb.items, compendiumDb.rules, compendiumDb.campaignFlags],
      async () => {
        if (currentMonsters === 0 || force) {
          await compendiumDb.monsters.bulkPut(srdSeedData.monsters as unknown as CompendiumMonster[]);
        }
        if (currentSpells === 0 || force) {
          const normalizedSpells: CompendiumSpell[] = (srdSeedData.spells as any[]).map((s) => ({
            ...s,
            casting_time: s.casting_time || s.castingTime,
            concentration: s.concentration ?? s.duration?.toLowerCase().includes('concentration') ?? false,
            ritual: s.ritual ?? false,
          }));
          await compendiumDb.spells.bulkPut(normalizedSpells);
        }
        if (currentItems === 0 || force) {
          await compendiumDb.items.bulkPut(srdSeedData.items as unknown as CompendiumItem[]);
        }
        if (currentRules === 0 || force) {
          await compendiumDb.rules.bulkPut(SRD_RULES);
        }

        await compendiumDb.campaignFlags.put({
          key: 'package:srd-5.1-core',
          value: {
            id: 'srd-5.1-core',
            name: 'System Reference Document 5.1 (Core)',
            version: '5.1.0',
            sourceBook: 'SRD 5.1',
            importedAt: new Date().toISOString(),
            monsterCount: srdSeedData.monsters.length,
            spellCount: srdSeedData.spells.length,
            classCount: 0,
          }
        });
      }
    );

    // If running in Tauri, also invoke native seed_compendium_baseline
    if (typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)) {
      try {
        const tauri = (window as any).__TAURI__;
        if (tauri?.core?.invoke) {
          await tauri.core.invoke('seed_compendium_baseline');
        }
      } catch (nativeErr) {
        console.warn('[srdSeedService] Native SQLite baseline seeding warning:', nativeErr);
      }
    }

    const finalMonsters = await compendiumDb.monsters.count();
    const finalSpells = await compendiumDb.spells.count();
    const finalItems = await compendiumDb.items.count();
    const finalRules = compendiumDb.rules ? await compendiumDb.rules.count() : 0;

    return {
      seeded: true,
      monstersCount: finalMonsters,
      spellsCount: finalSpells,
      itemsCount: finalItems,
      rulesCount: finalRules,
      reason: 'Successfully seeded 5e SRD 5.1 core monsters, spells, and items.',
    };
  } catch (err) {
    console.error('Failed to seed 5e SRD compendium baseline:', err);
    return {
      seeded: false,
      monstersCount: 0,
      spellsCount: 0,
      itemsCount: 0,
      rulesCount: 0,
      reason: err instanceof Error ? err.message : 'Unknown database seeding error',
    };
  }
}

/**
 * Explicit one-click seeder for Universal Ingest modal CTA.
 * Force-populates Dexie compendium and SQLite index with full 5e SRD baseline.
 */
export async function seedFullSrdCompendium(): Promise<SrdSeedResult> {
  return await seedSrdCompendiumIfEmpty(true);
}

/**
 * Returns simple compendium record counts for spells, monsters, items, and rules.
 */
export async function getCompendiumStats(): Promise<CompendiumStats> {
  const [totalSpells, totalMonsters, totalItems, totalRules] = await Promise.all([
    compendiumDb.spells.count(),
    compendiumDb.monsters.count(),
    compendiumDb.items.count(),
    compendiumDb.rules ? compendiumDb.rules.count() : 0,
  ]);

  return { totalSpells, totalMonsters, totalItems, totalRules };
}

// ── Static CC-BY-4.0 SRD JSON bundle hydration (/data/srd/*.json) ─────────────

export type SrdHydrationPhase = 'idle' | 'checking' | 'fetching' | 'normalizing' | 'persisting' | 'done' | 'error';

export interface SrdHydrationStatus {
  phase: SrdHydrationPhase;
  isLoading: boolean;
  progress: number; // 0..1
  message: string;
  error: string | null;
  counts: { monsters: number; spells: number; items: number };
}

type SrdHydrationListener = (status: SrdHydrationStatus) => void;

/** Live hydration status snapshot; UI binds via `onSrdHydrationStatus`. */
export const srdHydrationStatus: SrdHydrationStatus = {
  phase: 'idle',
  isLoading: false,
  progress: 0,
  message: '',
  error: null,
  counts: { monsters: 0, spells: 0, items: 0 },
};

const hydrationListeners = new Set<SrdHydrationListener>();

/** Registers a status listener (invoked immediately). Returns an unsubscribe fn. */
export function onSrdHydrationStatus(listener: SrdHydrationListener): () => void {
  hydrationListeners.add(listener);
  listener({ ...srdHydrationStatus, counts: { ...srdHydrationStatus.counts } });
  return () => hydrationListeners.delete(listener);
}

function setHydrationStatus(patch: Partial<SrdHydrationStatus>): void {
  Object.assign(srdHydrationStatus, patch);
  const snapshot = { ...srdHydrationStatus, counts: { ...srdHydrationStatus.counts } };
  for (const l of hydrationListeners) {
    try {
      l(snapshot);
    } catch (e) {
      console.warn('[srdSeedService] Hydration listener error:', e);
    }
  }
}

let activeHydration: Promise<{ monsters: number; spells: number; items: number }> | null = null;

function slugify(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toText(v: unknown): string {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(toText).filter(Boolean).join('\n\n');
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return toText(o.name ?? o.value ?? o.desc ?? '');
  }
  return String(v).replace(/<\/?[^>]+>/g, '').trim();
}

function toNum(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (Array.isArray(v)) return toNum(v[0], fallback);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return toNum(o.value ?? o.ac ?? o.armor_class, fallback);
  }
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

function toCr(v: unknown): string {
  if (v == null || v === '') return '0';
  if (typeof v === 'number') {
    if (v === 0.125) return '1/8';
    if (v === 0.25) return '1/4';
    if (v === 0.5) return '1/2';
    return String(v);
  }
  return String(v).trim();
}

function toSpeed(v: unknown): string {
  if (v == null) return '30 ft.';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => (k === 'walk' ? String(val) : `${k} ${String(val)}`))
      .join(', ');
  }
  return String(v);
}

interface SrdFeature {
  name: string;
  desc: string;
  attack_bonus?: number;
  damage_dice?: string;
}

function toFeatures(v: unknown): SrdFeature[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((f) => f && typeof f === 'object')
    .map((f) => {
      const o = f as Record<string, unknown>;
      const out: SrdFeature = { name: toText(o.name), desc: toText(o.desc ?? o.description) };
      if (o.attack_bonus != null) out.attack_bonus = toNum(o.attack_bonus);
      if (typeof o.damage_dice === 'string') out.damage_dice = o.damage_dice;
      return out;
    })
    .filter((f) => f.name.length > 0);
}

function normalizeSrdMonster(raw: Record<string, unknown>) {
  const name = toText(raw.name);
  return {
    id: `srd-${slugify(name)}`,
    name,
    size: toText(raw.size) || 'Medium',
    type: [toText(raw.type), raw.subtype ? `(${toText(raw.subtype)})` : ''].filter(Boolean).join(' ') || 'beast',
    alignment: toText(raw.alignment) || 'unaligned',
    ac: toNum(raw.armor_class ?? raw.ac, 10),
    hp: toNum(raw.hit_points ?? raw.hp, 1),
    hitDice: toText(raw.hit_dice),
    cr: toCr(raw.challenge_rating ?? raw.cr),
    speed: toSpeed(raw.speed),
    str: toNum(raw.strength ?? raw.str, 10),
    dex: toNum(raw.dexterity ?? raw.dex, 10),
    con: toNum(raw.constitution ?? raw.con, 10),
    int: toNum(raw.intelligence ?? raw.int, 10),
    wis: toNum(raw.wisdom ?? raw.wis, 10),
    cha: toNum(raw.charisma ?? raw.cha, 10),
    senses: toText(raw.senses),
    languages: toText(raw.languages),
    actions: toFeatures(raw.actions),
    traits: toFeatures(raw.special_abilities ?? raw.traits),
    legendaryActions: toFeatures(raw.legendary_actions),
    sourceBook: 'SRD 5.1',
    origin: 'SRD-5.1',
  };
}

function toSpellLevel(raw: Record<string, unknown>): number {
  if (typeof raw.level_int === 'number') return raw.level_int;
  if (typeof raw.level === 'number') return raw.level;
  const s = String(raw.level ?? '').toLowerCase();
  if (s.includes('cantrip')) return 0;
  return Math.max(0, Math.min(9, toNum(s, 0)));
}

function toComponents(raw: Record<string, unknown>): string {
  const base = Array.isArray(raw.components) ? raw.components.join(', ') : toText(raw.components);
  const material = toText(raw.material);
  return material && !base.includes('(') ? `${base} (${material})` : base;
}

function isYes(v: unknown): boolean {
  return v === true || String(v ?? '').toLowerCase() === 'yes';
}

function normalizeSrdSpell(raw: Record<string, unknown>) {
  const name = toText(raw.name);
  const duration = toText(raw.duration);
  const castingTime = toText(raw.casting_time ?? raw.castingTime);
  const higher = toText(raw.higher_level);
  const description = [toText(raw.desc ?? raw.description), higher ? `At Higher Levels. ${higher}` : '']
    .filter(Boolean)
    .join('\n\n');
  return {
    id: `srd-${slugify(name)}`,
    name,
    level: toSpellLevel(raw),
    school: toText(raw.school) || 'Evocation',
    castingTime,
    casting_time: castingTime,
    range: toText(raw.range),
    components: toComponents(raw),
    duration,
    description,
    concentration: isYes(raw.concentration) || duration.toLowerCase().includes('concentration'),
    ritual: isYes(raw.ritual),
    sourceBook: 'SRD 5.1',
    origin: 'SRD-5.1',
  };
}

function normalizeSrdItem(raw: Record<string, unknown>) {
  const name = toText(raw.name);
  const type =
    toText(raw.type ?? raw.equipment_category ?? raw.gear_category ?? raw.category) || 'Adventuring Gear';
  return {
    id: `srd-${slugify(name)}`,
    name,
    type,
    rarity: toText(raw.rarity) || 'Common',
    description: toText(raw.desc ?? raw.description),
    sourceBook: 'SRD 5.1',
    origin: 'SRD-5.1',
  };
}

async function fetchSrdBundle(url: string): Promise<Record<string, unknown>[]> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[srdSeedService] SRD bundle ${url} unavailable (HTTP ${res.status}).`);
      return [];
    }
    const json: unknown = await res.json();
    const list = Array.isArray(json)
      ? json
      : Array.isArray((json as { results?: unknown })?.results)
        ? (json as { results: unknown[] }).results
        : [];
    return list.filter((e): e is Record<string, unknown> => !!e && typeof e === 'object' && 'name' in e);
  } catch (err) {
    console.warn(`[srdSeedService] Failed to fetch/parse SRD bundle ${url}:`, err);
    return [];
  }
}

function dedupeById<T extends { id: string; name: string }>(rows: T[]): T[] {
  const map = new Map<string, T>();
  for (const r of rows) if (r.id !== 'srd-' && r.name) map.set(r.id, r);
  return Array.from(map.values());
}

async function runSrdHydration(force: boolean): Promise<{ monsters: number; spells: number; items: number }> {
  setHydrationStatus({ phase: 'checking', isLoading: true, progress: 0.05, message: 'Checking compendium…', error: null });

  const existingMonsters = await compendiumDb.monsters.count();
  if (existingMonsters > 50 && !force) {
    const counts = {
      monsters: existingMonsters,
      spells: await compendiumDb.spells.count(),
      items: await compendiumDb.items.count(),
    };
    setHydrationStatus({ phase: 'done', isLoading: false, progress: 1, message: 'Compendium already hydrated.', counts });
    return counts;
  }

  setHydrationStatus({ phase: 'fetching', progress: 0.15, message: 'Fetching SRD 5.1 bundles…' });
  const [rawMonsters, rawSpells, rawItems] = await Promise.all([
    fetchSrdBundle('/data/srd/monsters.json'),
    fetchSrdBundle('/data/srd/spells.json'),
    fetchSrdBundle('/data/srd/items.json'),
  ]);

  if (rawMonsters.length + rawSpells.length + rawItems.length === 0) {
    throw new Error('No SRD bundles found under /data/srd/ (monsters.json, spells.json, items.json).');
  }

  setHydrationStatus({ phase: 'normalizing', progress: 0.5, message: 'Normalizing SRD entries…' });
  const normalizedMonsters = dedupeById(rawMonsters.map(normalizeSrdMonster));
  const normalizedSpells = dedupeById(rawSpells.map(normalizeSrdSpell));
  const normalizedItems = dedupeById(rawItems.map(normalizeSrdItem));

  setHydrationStatus({
    phase: 'persisting',
    progress: 0.75,
    message: `Persisting ${normalizedMonsters.length} monsters, ${normalizedSpells.length} spells, ${normalizedItems.length} items…`,
  });

  await compendiumDb.transaction('rw', [compendiumDb.monsters, compendiumDb.spells, compendiumDb.items], async () => {
    if (normalizedMonsters.length) {
      await compendiumDb.monsters.bulkPut(normalizedMonsters as unknown as CompendiumMonster[]);
    }
    if (normalizedSpells.length) {
      await compendiumDb.spells.bulkPut(normalizedSpells as unknown as CompendiumSpell[]);
    }
    if (normalizedItems.length) {
      await compendiumDb.items.bulkPut(normalizedItems as unknown as CompendiumItem[]);
    }
  });

  const counts = {
    monsters: await compendiumDb.monsters.count(),
    spells: await compendiumDb.spells.count(),
    items: await compendiumDb.items.count(),
  };
  setHydrationStatus({
    phase: 'done',
    isLoading: false,
    progress: 1,
    message: `SRD 5.1 hydrated: ${counts.monsters} monsters, ${counts.spells} spells, ${counts.items} items.`,
    counts,
  });
  return counts;
}

/**
 * Bulk-hydrates the Dexie compendium from static CC-BY-4.0 SRD 5.1 JSON bundles.
 * Skips re-fetch when >50 monsters already exist unless `force` is set.
 * Concurrent calls share the in-flight hydration.
 */
export async function hydrateSrdCompendium(force = false): Promise<{ monsters: number; spells: number; items: number }> {
  if (activeHydration) return activeHydration;
  activeHydration = runSrdHydration(force)
    .catch((err) => {
      const msg = err instanceof Error ? err.message : 'Unknown SRD hydration error';
      console.error('[srdSeedService] SRD hydration failed:', err);
      setHydrationStatus({ phase: 'error', isLoading: false, progress: 0, message: msg, error: msg });
      throw err;
    })
    .finally(() => {
      activeHydration = null;
    });
  return activeHydration;
}
