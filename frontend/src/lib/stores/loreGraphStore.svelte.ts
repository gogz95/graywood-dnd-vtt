// loreGraphStore.svelte.ts — In-Memory & IndexedDB Relational Lore Graph Database
// Embedded entity-relationship store supporting bidirectional queries, cascading CRUD, and tag search.

export type EntityType = 'NPC' | 'FACTION' | 'LOCATION' | 'QUEST' | 'DOCUMENT';

export type RelationType = 'ALLIED_WITH' | 'ENEMY_OF' | 'LOCATED_IN' | 'MEMBER_OF' | 'CONTROLS';

export interface LoreEntity {
  id: string;
  type: EntityType;
  name: string;
  summary: string;
  bodyMarkdown: string;
  tags: string[];
  attributes: Record<string, string | number | boolean>;
  discovered?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface LoreRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: RelationType;
  notes?: string;
}

export interface LinkedEntityRecord {
  entity: LoreEntity;
  relation: LoreRelationship;
  direction: 'outgoing' | 'incoming';
}

const DB_NAME = 'vtt_lore_graph_db';
const DB_VERSION = 1;
const STORAGE_ENTITIES_KEY = 'vtt_lore_entities';
const STORAGE_RELATIONSHIPS_KEY = 'vtt_lore_relationships';

// ── Mock Data Purge Definition ───────────────────────────────────────────────
const PURGED_MOCK_NAMES = new Set([
  'The Silver Hand Mercenaries',
  'Commander Valen',
  'Archmage Varis',
  'High Sun Sanctuary',
  'Whispering Caverns',
  'The Lost Relic of Sunpeak',
  'Treaty of the Silver Vale'
]);

function isPurgedMockEntity(e: LoreEntity): boolean {
  if (!e || !e.name) return true;
  return PURGED_MOCK_NAMES.has(e.name) ||
    e.id.startsWith('entity-faction-silver-hand') ||
    e.id.startsWith('entity-npc-commander-valen') ||
    e.id.startsWith('entity-npc-archmage-varis') ||
    e.id.startsWith('entity-loc-high-sun-sanctuary') ||
    e.id.startsWith('entity-loc-whispering-caverns') ||
    e.id.startsWith('entity-quest-lost-relic') ||
    e.id.startsWith('entity-doc-treaty-silver-vale');
}

// ── IndexedDB Engine Helper ──────────────────────────────────────────────────
class LoreIndexedDBEngine {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(new Error('IndexedDB not supported in this environment'));
    }
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = (e.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains('entities')) {
            const store = db.createObjectStore('entities', { keyPath: 'id' });
            store.createIndex('by_type', 'type', { unique: false });
          }
          if (!db.objectStoreNames.contains('relationships')) {
            const store = db.createObjectStore('relationships', { keyPath: 'id' });
            store.createIndex('by_source', 'sourceId', { unique: false });
            store.createIndex('by_target', 'targetId', { unique: false });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return this.dbPromise;
  }

  async saveAll(entities: LoreEntity[], relationships: LoreRelationship[]): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(['entities', 'relationships'], 'readwrite');
      const entStore = tx.objectStore('entities');
      const relStore = tx.objectStore('relationships');

      entStore.clear();
      relStore.clear();

      for (const ent of entities) entStore.put(ent);
      for (const rel of relationships) relStore.put(rel);

      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // Fallback handled by localStorage
    }
  }

  async loadAll(): Promise<{ entities: LoreEntity[]; relationships: LoreRelationship[] } | null> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(['entities', 'relationships'], 'readonly');
      const entStore = tx.objectStore('entities');
      const relStore = tx.objectStore('relationships');

      const entReq = entStore.getAll();
      const relReq = relStore.getAll();

      return new Promise((resolve, reject) => {
        tx.oncomplete = () => {
          resolve({
            entities: entReq.result || [],
            relationships: relReq.result || [],
          });
        };
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      return null;
    }
  }
}

const idb = new LoreIndexedDBEngine();

// ── Svelte 5 Reactive Lore Graph Class ───────────────────────────────────────
class LoreGraphStore {
  entities = $state<LoreEntity[]>([]);
  relationships = $state<LoreRelationship[]>([]);
  activeEntityId = $state<string | null>(null);
  searchQuery = $state<string>('');
  selectedTypeFilter = $state<EntityType | 'ALL'>('ALL');
  selectedTagFilter = $state<string | null>(null);
  isLoaded = $state<boolean>(false);

  constructor() {
    this.init();
  }

  private init() {
    // 1. Try loading from synchronous localStorage first for instantaneous UI rendering
    let loadedEntities: LoreEntity[] = [];
    let loadedRelationships: LoreRelationship[] = [];

    try {
      if (typeof localStorage !== 'undefined') {
        const rawE = localStorage.getItem(STORAGE_ENTITIES_KEY);
        const rawR = localStorage.getItem(STORAGE_RELATIONSHIPS_KEY);
        if (rawE) loadedEntities = JSON.parse(rawE);
        if (rawR) loadedRelationships = JSON.parse(rawR);
      }
    } catch { /* ignore parse error */ }

    // Purge any residual mock entities
    loadedEntities = loadedEntities.filter(e => !isPurgedMockEntity(e));
    const validIds = new Set(loadedEntities.map(e => e.id));
    loadedRelationships = loadedRelationships.filter(r => validIds.has(r.sourceId) && validIds.has(r.targetId));

    if (loadedEntities.length > 0) {
      this.entities = loadedEntities;
      this.relationships = loadedRelationships;
      this.activeEntityId = loadedEntities[0]?.id || null;
      this.isLoaded = true;
    } else {
      this.entities = [];
      this.relationships = [];
      this.activeEntityId = null;
      this.isLoaded = true;
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(STORAGE_ENTITIES_KEY);
        localStorage.removeItem(STORAGE_RELATIONSHIPS_KEY);
      }
    }

    // 2. Asynchronously hydrate/sync from IndexedDB if available and purge legacy mock data
    idb.loadAll().then(idbData => {
      if (idbData && idbData.entities.length > 0) {
        const cleanedEntities = idbData.entities.filter(e => !isPurgedMockEntity(e));
        const cleanIds = new Set(cleanedEntities.map(e => e.id));
        const cleanedRel = idbData.relationships.filter(r => cleanIds.has(r.sourceId) && cleanIds.has(r.targetId));

        this.entities = cleanedEntities;
        this.relationships = cleanedRel;
        if (!this.activeEntityId || !this.entities.some(e => e.id === this.activeEntityId)) {
          this.activeEntityId = this.entities[0]?.id || null;
        }
        this.persist();
      }
    }).catch(() => {});
  }

  private persist() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_ENTITIES_KEY, JSON.stringify(this.entities));
        localStorage.setItem(STORAGE_RELATIONSHIPS_KEY, JSON.stringify(this.relationships));
      }
    } catch { /* quota / SSR safe */ }

    idb.saveAll(this.entities, this.relationships).catch(() => {});
  }

  // ── Entity CRUD ────────────────────────────────────────────────────────────

  addEntity(data: Omit<LoreEntity, 'id' | 'createdAt' | 'updatedAt'>): LoreEntity {
    const id = `entity-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = Date.now();
    const newEntity: LoreEntity = {
      ...data,
      id,
      tags: data.tags || [],
      attributes: data.attributes || {},
      createdAt: now,
      updatedAt: now,
    };
    this.entities = [...this.entities, newEntity];
    this.activeEntityId = id;
    this.persist();
    return newEntity;
  }

  updateEntity(id: string, updates: Partial<Omit<LoreEntity, 'id' | 'createdAt'>>): LoreEntity | null {
    let found = false;
    this.entities = this.entities.map(e => {
      if (e.id === id) {
        found = true;
        return {
          ...e,
          ...updates,
          updatedAt: Date.now(),
        };
      }
      return e;
    });
    if (found) {
      this.persist();
      return this.getEntityById(id) || null;
    }
    return null;
  }

  deleteEntity(id: string): boolean {
    const countBefore = this.entities.length;
    this.entities = this.entities.filter(e => e.id !== id);
    if (this.entities.length < countBefore) {
      // Cascade delete relationships involving this entity
      this.relationships = this.relationships.filter(r => r.sourceId !== id && r.targetId !== id);
      if (this.activeEntityId === id) {
        this.activeEntityId = this.entities[0]?.id || null;
      }
      this.persist();
      return true;
    }
    return false;
  }

  // ── Relationship CRUD ──────────────────────────────────────────────────────

  addRelationship(data: Omit<LoreRelationship, 'id'>): LoreRelationship {
    const id = `rel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newRel: LoreRelationship = {
      ...data,
      id,
    };
    this.relationships = [...this.relationships, newRel];
    this.persist();
    return newRel;
  }

  removeRelationship(relId: string): boolean {
    const countBefore = this.relationships.length;
    this.relationships = this.relationships.filter(r => r.id !== relId);
    if (this.relationships.length < countBefore) {
      this.persist();
      return true;
    }
    return false;
  }

  // ── Relational Queries ─────────────────────────────────────────────────────

  getEntityById(id: string): LoreEntity | undefined {
    return this.entities.find(e => e.id === id);
  }

  /**
   * Retrieves all linked entities for a given active record with directionality.
   */
  getLinkedEntities(entityId: string): LinkedEntityRecord[] {
    const result: LinkedEntityRecord[] = [];

    for (const r of this.relationships) {
      if (r.sourceId === entityId) {
        const target = this.getEntityById(r.targetId);
        if (target) {
          result.push({ entity: target, relation: r, direction: 'outgoing' });
        }
      } else if (r.targetId === entityId) {
        const source = this.getEntityById(r.sourceId);
        if (source) {
          result.push({ entity: source, relation: r, direction: 'incoming' });
        }
      }
    }

    return result;
  }

  getRelationshipsForEntity(entityId: string): LoreRelationship[] {
    return this.relationships.filter(r => r.sourceId === entityId || r.targetId === entityId);
  }

  getEntitiesByType(type: EntityType): LoreEntity[] {
    return this.entities.filter(e => e.type === type);
  }

  getDiscoveredEntities(): LoreEntity[] {
    return this.entities.filter(e => e.discovered === true || e.discovered === undefined);
  }

  getEntitiesByTag(tag: string): LoreEntity[] {
    return this.entities.filter(e => e.tags.includes(tag.toLowerCase()));
  }

  getAllTags(): string[] {
    const set = new Set<string>();
    for (const e of this.entities) {
      for (const t of e.tags) {
        set.add(t.toLowerCase());
      }
    }
    return Array.from(set).sort();
  }

  /**
   * Search entities by text query, category pill, and optional tag.
   */
  searchEntities(
    query = this.searchQuery,
    typeFilter = this.selectedTypeFilter,
    tagFilter = this.selectedTagFilter
  ): LoreEntity[] {
    const q = query.trim().toLowerCase();
    return this.entities.filter(e => {
      // Type filter
      if (typeFilter !== 'ALL' && e.type !== typeFilter) return false;

      // Tag filter
      if (tagFilter && !e.tags.includes(tagFilter.toLowerCase())) return false;

      // Text query
      if (q) {
        const nameMatch = e.name.toLowerCase().includes(q);
        const summaryMatch = e.summary.toLowerCase().includes(q);
        const tagMatch = e.tags.some(t => t.toLowerCase().includes(q));
        const bodyMatch = e.bodyMarkdown.toLowerCase().includes(q);
        return nameMatch || summaryMatch || tagMatch || bodyMatch;
      }

      return true;
    });
  }

  /**
   * Returns matching entities for '@mention' autocomplete autocompletion.
   */
  getMentionSuggestions(prefix: string): LoreEntity[] {
    const clean = prefix.replace(/^@/, '').toLowerCase().trim();
    if (!clean) return this.entities.slice(0, 8);
    return this.entities
      .filter(e => e.name.toLowerCase().includes(clean))
      .slice(0, 8);
  }

  /**
   * Hard reset clearing all lore entities and relationships.
   */
  clearAll() {
    this.entities = [];
    this.relationships = [];
    this.activeEntityId = null;
    this.persist();
  }
}

export const loreGraphStore = new LoreGraphStore();
export const loreStore = loreGraphStore;

