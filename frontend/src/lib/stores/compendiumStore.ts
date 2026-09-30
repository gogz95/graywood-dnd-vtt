// compendiumStore.ts — Custom Items Manager & IndexedDB Persistence
// Manages manual DM item creation, storage in IndexedDB table 'custom_items', and reactive store access.

import { writable } from 'svelte/store';
import type { CustomItemDefinition } from '../types/item';

const DB_NAME = 'vtt_compendium_db';
const DB_VERSION = 2;
const CUSTOM_ITEMS_STORE = 'custom_items';
const STORAGE_FALLBACK_KEY = 'vtt_custom_items';

let inMemoryCustomItems: CustomItemDefinition[] = [];
export const customItemsStore = writable<CustomItemDefinition[]>([]);

function openCustomItemsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('compendium_store')) {
        const store = db.createObjectStore('compendium_store', { keyPath: 'id' });
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

function loadFromLocalStorage(): CustomItemDefinition[] {
  if (typeof localStorage === 'undefined' || !localStorage?.getItem) return inMemoryCustomItems;
  try {
    const raw = localStorage.getItem(STORAGE_FALLBACK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        inMemoryCustomItems = parsed;
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return inMemoryCustomItems;
}

function saveToLocalStorage(items: CustomItemDefinition[]): void {
  inMemoryCustomItems = items;
  if (typeof localStorage === 'undefined' || !localStorage?.setItem) return;
  try {
    localStorage.setItem(STORAGE_FALLBACK_KEY, JSON.stringify(items));
  } catch {
    // storage quota
  }
}

/**
 * Loads all custom items from IndexedDB 'custom_items' table with in-memory / localStorage fallback.
 */
export async function getCustomItems(): Promise<CustomItemDefinition[]> {
  try {
    const db = await openCustomItemsDb();
    return new Promise((resolve) => {
      const tx = db.transaction([CUSTOM_ITEMS_STORE], 'readonly');
      const store = tx.objectStore(CUSTOM_ITEMS_STORE);
      const req = store.getAll();

      req.onsuccess = () => {
        const items = (req.result || []) as CustomItemDefinition[];
        if (items.length > 0) {
          inMemoryCustomItems = items;
        }
        customItemsStore.set(inMemoryCustomItems);
        saveToLocalStorage(inMemoryCustomItems);
        resolve(inMemoryCustomItems);
      };
      req.onerror = () => {
        const fallback = loadFromLocalStorage();
        customItemsStore.set(fallback);
        resolve(fallback);
      };
    });
  } catch {
    const fallback = loadFromLocalStorage();
    customItemsStore.set(fallback);
    return fallback;
  }
}

/**
 * Adds a new custom item definition to the IndexedDB 'custom_items' table.
 */
export async function addCustomItem(item: CustomItemDefinition): Promise<CustomItemDefinition> {
  const normalizedItem: CustomItemDefinition = {
    ...item,
    id: item.id || `custom-item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    source: 'custom',
    createdAt: item.createdAt || Date.now(),
  };

  try {
    const db = await openCustomItemsDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([CUSTOM_ITEMS_STORE], 'readwrite');
      const store = tx.objectStore(CUSTOM_ITEMS_STORE);
      const req = store.put(normalizedItem);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // IndexedDB not available — handled gracefully by in-memory/localStorage
  }

  // Update in-memory store and localStorage
  const filtered = inMemoryCustomItems.filter((i) => i.id !== normalizedItem.id);
  inMemoryCustomItems = [normalizedItem, ...filtered];
  saveToLocalStorage(inMemoryCustomItems);
  customItemsStore.set(inMemoryCustomItems);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('vtt:custom-item-added', { detail: normalizedItem })
    );
  }

  return normalizedItem;
}

/**
 * Saves an item into compendium storage (IndexedDB + Dexie compendiumDb + SQLite API).
 */
export async function saveCompendiumItem(item: CustomItemDefinition): Promise<CustomItemDefinition> {
  const saved = await addCustomItem(item);
  try {
    const { compendiumDb } = await import('../db/compendiumDb');
    await compendiumDb.items.put({
      id: saved.id,
      name: saved.name,
      type: saved.type,
      rarity: saved.rarity,
      attunement: saved.requiresAttunement ? 'Requires Attunement' : undefined,
      damage: saved.damageFormula,
      armorClass: saved.acBonus,
      properties: saved.properties,
      description: saved.description,
      weight: saved.weight,
      cost: `${saved.costGp || 0} gp`,
      sourceBook: 'Compendium Store',
      packageId: 'custom-items',
      origin: 'USER_IMPORT'
    });
  } catch (err) {
    console.warn('[compendiumStore] Dexie items sync error:', err);
  }

  if (typeof fetch !== 'undefined') {
    try {
      await fetch('/api/compendium/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: saved.id,
          name: saved.name,
          type: saved.type,
          rarity: saved.rarity,
          cost_gp: saved.costGp || 0,
          weight: saved.weight,
          description: saved.description,
          source: 'Compendium Store'
        })
      });
    } catch {
      // offline fallback
    }
  }

  return saved;
}

/**
 * Filters loaded custom items by type, rarity, and query search string.
 */
export async function queryCustomItems(filter?: {
  type?: string;
  rarity?: string;
  search?: string;
}): Promise<CustomItemDefinition[]> {
  const items = await getCustomItems();
  if (!filter) return items;
  return items.filter((item) => {
    if (filter.type && item.type.toLowerCase() !== filter.type.toLowerCase()) return false;
    if (filter.rarity && item.rarity.toLowerCase() !== filter.rarity.toLowerCase()) return false;
    if (filter.search) {
      const q = filter.search.toLowerCase();
      if (!item.name.toLowerCase().includes(q) && !item.description.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Deletes a custom item by ID from IndexedDB 'custom_items' table.
 */
export async function deleteCustomItem(id: string): Promise<boolean> {
  try {
    const db = await openCustomItemsDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([CUSTOM_ITEMS_STORE], 'readwrite');
      const store = tx.objectStore(CUSTOM_ITEMS_STORE);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // handled gracefully
  }

  inMemoryCustomItems = inMemoryCustomItems.filter((i) => i.id !== id);
  saveToLocalStorage(inMemoryCustomItems);
  customItemsStore.set(inMemoryCustomItems);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('vtt:custom-items-updated', { detail: { id, deleted: true } })
    );
  }

  return true;
}

/**
 * Clears all custom items from IndexedDB.
 */
export async function clearCustomItems(): Promise<void> {
  try {
    const db = await openCustomItemsDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([CUSTOM_ITEMS_STORE], 'readwrite');
      const store = tx.objectStore(CUSTOM_ITEMS_STORE);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // ignore
  }

  inMemoryCustomItems = [];
  saveToLocalStorage([]);
  customItemsStore.set([]);
}

// Initial bootstrap load in browser
if (typeof window !== 'undefined') {
  getCustomItems().catch(() => {});
}
