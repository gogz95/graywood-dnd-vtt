// compendiumImporter.ts — 5e SRD Batch Importer & IndexedDB Compendium Database
// Parses diverse open-source 5e JSON datasets (SRD, 5e-bits, Open5e) into normalized workstation entities

export interface CompendiumEntity {
  id: string;
  name: string;
  type: 'creature' | 'spell' | 'item';
  description: string;
  source: 'srd' | 'imported';

  // Creature / Monster fields
  size?: string;
  creatureType?: string;
  alignment?: string;
  cr?: number;
  ac?: number;
  hp?: number;
  hitDice?: string;
  speed?: string | number;
  str?: number;
  dex?: number;
  con?: number;
  int?: number;
  wis?: number;
  cha?: number;
  savingThrows?: string;
  skills?: string;
  damageResistances?: string;
  damageImmunities?: string;
  conditionImmunities?: string;
  senses?: string;
  traits?: { name: string; desc: string }[];
  actions?: { name: string; desc: string }[];
  legendaryActions?: { name: string; desc: string }[];

  // Spell fields
  level?: number;
  school?: string;
  castingTime?: string;
  range?: string;
  components?: string;
  duration?: string;
  higherLevels?: string;

  // Item fields
  category?: string;
  rarity?: string;
  cost?: string;
  weight?: number;
  properties?: string[];
  requiresAttunement?: boolean;
}

const DB_NAME = 'vtt_compendium_db';
const DB_VERSION = 2;
const STORE_NAME = 'compendium_store';
const CUSTOM_ITEMS_STORE = 'custom_items';

function openCompendiumDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('name', 'name', { unique: false });
        store.createIndex('type', 'type', { unique: false });
        store.createIndex('cr', 'cr', { unique: false });
        store.createIndex('level', 'level', { unique: false });
      }
      if (!db.objectStoreNames.contains(CUSTOM_ITEMS_STORE)) {
        const customStore = db.createObjectStore(CUSTOM_ITEMS_STORE, { keyPath: 'id' });
        customStore.createIndex('name', 'name', { unique: false });
        customStore.createIndex('type', 'type', { unique: false });
        customStore.createIndex('rarity', 'rarity', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Normalizes an arbitrary raw JSON object (from SRD, Open5e, 5e-bits, or custom) into a standard CompendiumEntity.
 */
export function normalizeEntity(raw: Record<string, unknown>, defaultType?: 'creature' | 'spell' | 'item'): CompendiumEntity | null {
  if (!raw || typeof raw !== 'object') return null;

  const rawName = String(raw.name || raw.title || raw.Name || '').trim();
  if (!rawName) return null;

  // Determine entity type
  let entityType: 'creature' | 'spell' | 'item' = defaultType || 'creature';
  const typeHint = String(raw.type || raw.category || raw.document__slug || '').toLowerCase();

  if (typeHint.includes('spell') || raw.level !== undefined || raw.school !== undefined) {
    entityType = 'spell';
  } else if (typeHint.includes('item') || typeHint.includes('weapon') || typeHint.includes('armor') || raw.rarity !== undefined || raw.cost !== undefined) {
    entityType = 'item';
  } else if (typeHint.includes('monster') || typeHint.includes('creature') || raw.challenge_rating !== undefined || raw.cr !== undefined || raw.hit_points !== undefined) {
    entityType = 'creature';
  }

  const id = `comp-${entityType}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const description = String(raw.description || raw.desc || raw.details || raw.text || '').trim();

  const entity: CompendiumEntity = {
    id,
    name: rawName,
    type: entityType,
    description: description || `${rawName} (${entityType})`,
    source: 'imported',
  };

  if (entityType === 'creature') {
    entity.size = String(raw.size || raw.Size || 'Medium');
    entity.creatureType = String(raw.creature_type || raw.type_detail || raw.type || 'humanoid');
    entity.alignment = String(raw.alignment || 'unaligned');

    // Challenge Rating (handling fractions like "1/2", "1/4")
    const rawCr = raw.cr ?? raw.challenge_rating;
    if (typeof rawCr === 'number') {
      entity.cr = rawCr;
    } else if (typeof rawCr === 'string') {
      if (rawCr === '1/8') entity.cr = 0.125;
      else if (rawCr === '1/4') entity.cr = 0.25;
      else if (rawCr === '1/2') entity.cr = 0.5;
      else entity.cr = parseFloat(rawCr) || 0;
    }

    // Armor Class
    const rawAc = raw.ac ?? raw.armor_class;
    if (typeof rawAc === 'number') entity.ac = rawAc;
    else if (Array.isArray(rawAc) && rawAc[0] && typeof rawAc[0].value === 'number') entity.ac = rawAc[0].value;
    else if (typeof rawAc === 'string') entity.ac = parseInt(rawAc, 10) || 10;
    else entity.ac = 10;

    // Hit Points
    const rawHp = raw.hp ?? raw.hit_points;
    if (typeof rawHp === 'number') entity.hp = rawHp;
    else if (typeof rawHp === 'string') entity.hp = parseInt(rawHp, 10) || 10;
    else entity.hp = 10;

    entity.hitDice = String(raw.hit_dice || '');
    entity.speed = typeof raw.speed === 'string' ? raw.speed : (raw.speed && typeof raw.speed === 'object' ? JSON.stringify(raw.speed) : '30 ft.');

    // Ability scores
    entity.str = typeof raw.strength === 'number' ? raw.strength : typeof raw.str === 'number' ? raw.str : 10;
    entity.dex = typeof raw.dexterity === 'number' ? raw.dexterity : typeof raw.dex === 'number' ? raw.dex : 10;
    entity.con = typeof raw.constitution === 'number' ? raw.constitution : typeof raw.con === 'number' ? raw.con : 10;
    entity.int = typeof raw.intelligence === 'number' ? raw.intelligence : typeof raw.int === 'number' ? raw.int : 10;
    entity.wis = typeof raw.wisdom === 'number' ? raw.wisdom : typeof raw.wis === 'number' ? raw.wis : 10;
    entity.cha = typeof raw.charisma === 'number' ? raw.charisma : typeof raw.cha === 'number' ? raw.cha : 10;

    entity.damageResistances = String(raw.damage_resistances || '');
    entity.damageImmunities = String(raw.damage_immunities || '');
    entity.conditionImmunities = String(raw.condition_immunities || '');
    entity.senses = String(raw.senses || '');

    // Traits & Actions parsing
    if (Array.isArray(raw.special_abilities || raw.traits)) {
      const traitsArr = (raw.special_abilities || raw.traits) as Record<string, unknown>[];
      entity.traits = traitsArr.map(t => ({ name: String(t.name || ''), desc: String(t.desc || '') }));
    }
    if (Array.isArray(raw.actions)) {
      const actionsArr = raw.actions as Record<string, unknown>[];
      entity.actions = actionsArr.map(a => ({ name: String(a.name || ''), desc: String(a.desc || '') }));
    }
    if (Array.isArray(raw.legendary_actions)) {
      const legArr = raw.legendary_actions as Record<string, unknown>[];
      entity.legendaryActions = legArr.map(l => ({ name: String(l.name || ''), desc: String(l.desc || '') }));
    }
  } else if (entityType === 'spell') {
    entity.level = typeof raw.level === 'number' ? raw.level : (typeof raw.level === 'string' ? parseInt(raw.level, 10) : 0);
    entity.school = String(raw.school || (raw.school_detail ? (raw.school_detail as any).name : 'Evocation'));
    entity.castingTime = String(raw.casting_time || raw.cast_time || '1 action');
    entity.range = String(raw.range || '60 ft');
    entity.components = String(raw.components || 'V, S');
    entity.duration = String(raw.duration || 'Instantaneous');
    entity.higherLevels = String(raw.higher_level || raw.higher_levels || '');
  } else if (entityType === 'item') {
    entity.category = String(raw.category || raw.equipment_category || raw.item_type || 'Adventuring Gear');
    entity.rarity = String(raw.rarity || 'Common');
    entity.cost = String(raw.cost || (raw.cost_cp ? `${(raw.cost_cp as number) / 100} gp` : '1 gp'));
    entity.weight = typeof raw.weight === 'number' ? raw.weight : (typeof raw.weight === 'string' ? parseFloat(raw.weight) || 1.0 : 1.0);
    entity.requiresAttunement = Boolean(raw.requires_attunement || raw.attunement);
    if (Array.isArray(raw.properties)) {
      entity.properties = raw.properties.map(p => typeof p === 'string' ? p : String((p as any).name || ''));
    }
  }

  return entity;
}

/**
 * Batch parses any JSON dataset and saves the normalized entities into IndexedDB.
 */
export async function importCompendiumJson(data: unknown): Promise<{ added: number; errors: number }> {
  const items = Array.isArray(data) ? data : [data];
  const normalizedEntities: CompendiumEntity[] = [];
  let errors = 0;

  for (const item of items) {
    if (item && typeof item === 'object') {
      const entity = normalizeEntity(item as Record<string, unknown>);
      if (entity) {
        normalizedEntities.push(entity);
      } else {
        errors++;
      }
    } else {
      errors++;
    }
  }

  if (normalizedEntities.length === 0) {
    return { added: 0, errors };
  }

  const db = await openCompendiumDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  for (const ent of normalizedEntities) {
    store.put(ent);
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return { added: normalizedEntities.length, errors };
}

/**
 * Retrieves all stored entities from IndexedDB, optionally filtered by type.
 */
export async function getCompendiumEntities(type?: 'creature' | 'spell' | 'item'): Promise<CompendiumEntity[]> {
  try {
    const db = await openCompendiumDb();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    const all: CompendiumEntity[] = await new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });

    if (type) {
      return all.filter(e => e.type === type);
    }
    return all;
  } catch {
    return [];
  }
}

/**
 * Performs search and filtering on compendium entities.
 */
export async function searchCompendium(query: string, type?: string): Promise<CompendiumEntity[]> {
  const all = await getCompendiumEntities();
  const cleanQ = query.trim().toLowerCase();

  return all.filter(item => {
    const matchType = !type || type === 'all' || item.type === type;
    if (!matchType) return false;
    if (!cleanQ) return true;

    return item.name.toLowerCase().includes(cleanQ) || item.description.toLowerCase().includes(cleanQ);
  });
}

/**
 * Deletes a single entity from the compendium.
 */
export async function deleteCompendiumEntity(id: string): Promise<void> {
  const db = await openCompendiumDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).delete(id);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Clears all imported entities from the compendium store.
 */
export async function clearCompendiumStore(): Promise<void> {
  const db = await openCompendiumDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).clear();
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
