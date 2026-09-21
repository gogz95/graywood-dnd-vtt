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

// ── Generic 5e SRD Initial Seed Data ─────────────────────────────────────────
function createInitialSeedData(): { entities: LoreEntity[]; relationships: LoreRelationship[] } {
  const now = Date.now();
  const entities: LoreEntity[] = [
    {
      id: 'entity-faction-silver-hand',
      type: 'FACTION',
      name: 'The Silver Hand Mercenaries',
      summary: 'A disciplined brotherhood of veteran sellswords and shield-bearers sworn to preserve regional order.',
      bodyMarkdown: `### Overview
The **Silver Hand** represents one of the most respected free companies in the frontier marquisates. Bound by an unyielding mercenary code, they operate out of their fortified redoubt at High Sun Sanctuary.

### Hierarchy & Organization
- **Commander:** Valen the Ironheart
- **Quartermaster:** Durnan Hammerfall
- **Chief Arcanist:** Archmage Varis

### Strategic Interests
Currently contracted to defend border trade caravans from goblin raiders and monstrosities pouring forth from the @Whispering Caverns.`,
      tags: ['faction', 'mercenary', 'military', 'order'],
      attributes: {
        leader: 'Commander Valen',
        alignment: 'Lawful Neutral',
        strength: '250 veteran fighters',
        headquarters: 'High Sun Sanctuary',
      },
      createdAt: now - 86400000 * 10,
      updatedAt: now - 86400000 * 2,
    },
    {
      id: 'entity-npc-commander-valen',
      type: 'NPC',
      name: 'Commander Valen',
      summary: 'High Commander of the Silver Hand; grizzled veteran with scarred full plate and heavy greatsword.',
      bodyMarkdown: `### Combat Tactics
Valen fights in close formation, commanding his frontline with resounding battle cries. He wields a *+1 Adamantine Greatsword* and wears ceremonial plate armor emblazoned with a silver gauntlet.

### Roleplaying Details
- **Personality Trait:** "I respect only those who stand firm when shields shatter."
- **Bond:** Loyal unto death to his company officers.
- **Flaw:** Suspicious of unsanctioned foreign spellcasters.`,
      tags: ['npc', 'commander', 'warrior', 'cr-8'],
      attributes: {
        cr: 8,
        hp: 112,
        ac: 19,
        alignment: 'Lawful Neutral',
        role: 'Company Commander',
      },
      createdAt: now - 86400000 * 9,
      updatedAt: now - 86400000 * 2,
    },
    {
      id: 'entity-npc-archmage-varis',
      type: 'NPC',
      name: 'Archmage Varis',
      summary: 'Elven evoker advisor offering tactical divination and battlefield evocation to allied forces.',
      bodyMarkdown: `### Background
A master of planar abjuration and battlefield evocation who pledged his staff to the Silver Hand following the Siege of Iron Crag.

### Arcane Arsenal
Varis specializes in defensive barriers, *Wall of Force*, and precision *Chain Lightning*. He maintains an extensive library in High Sun Sanctuary.`,
      tags: ['npc', 'mage', 'spellcaster', 'cr-12'],
      attributes: {
        cr: 12,
        hp: 88,
        ac: 15,
        alignment: 'Neutral Good',
        spellSaveDc: 17,
      },
      createdAt: now - 86400000 * 8,
      updatedAt: now - 86400000 * 1,
    },
    {
      id: 'entity-loc-high-sun-sanctuary',
      type: 'LOCATION',
      name: 'High Sun Sanctuary',
      summary: 'A towering limestone bastion and temple fortress perched on a granite bluff above the river basin.',
      bodyMarkdown: `### Bastion Layout
1. **Lower Courtyard:** Stables, blacksmith forges, and supply storehouses.
2. **Keep of the Sun:** Council chamber, armory, and high battlements mounted with ballistas.
3. **Inner Sanctum:** Ancient solar chapel repurposed as an arcane retreat by Archmage Varis.`,
      tags: ['location', 'fortress', 'settlement', 'sanctuary'],
      attributes: {
        terrain: 'Granite bluff overlooking river basin',
        defenseRating: 'Tier IV Fortification',
        garrison: '120 active men-at-arms',
      },
      createdAt: now - 86400000 * 7,
      updatedAt: now - 86400000 * 2,
    },
    {
      id: 'entity-loc-whispering-caverns',
      type: 'LOCATION',
      name: 'Whispering Caverns',
      summary: 'A subterranean labyrinth rich in phosphorescent fungi and cursed subterranean ruins.',
      bodyMarkdown: `### Environment & Hazards
The cavern walls echo with ethereal murmurs that induce paranoia in travellers without psychic wards.
- **Hazards:** Brown mold patches, sheer chasms, and lurking troglodyte ambushers.
- **Key Discovery:** Hidden entrance to the vault holding the @Lost Relic of Sunpeak.`,
      tags: ['location', 'dungeon', 'underdark', 'perilous'],
      attributes: {
        dangerLevel: 'Deadly (Level 5-7 party)',
        illumination: 'Dim (Phosphorescent fungal lichen)',
      },
      createdAt: now - 86400000 * 6,
      updatedAt: now - 86400000 * 3,
    },
    {
      id: 'entity-quest-lost-relic',
      type: 'QUEST',
      name: 'The Lost Relic of Sunpeak',
      summary: 'Recover the sacred solar scepter from the subterranean heart of the Whispering Caverns.',
      bodyMarkdown: `### Quest Objectives
1. Infiltrate the deep fissures of the @Whispering Caverns.
2. Defeat or bypass the guardian chimera nesting in the lower throne.
3. Return the *Scepter of the Sunpeak* to @Commander Valen.

### Bounty & Rewards
- **2,500 GP** minted coin from the company war chest.
- Formal letter of alliance with @The Silver Hand Mercenaries.`,
      tags: ['quest', 'dungeon-crawl', 'relic', 'tier-2'],
      attributes: {
        rewardGp: 2500,
        status: 'Active',
        recommendedLevel: '5 - 7',
      },
      createdAt: now - 86400000 * 5,
      updatedAt: now - 86400000 * 1,
    },
    {
      id: 'entity-doc-treaty-silver-vale',
      type: 'DOCUMENT',
      name: 'Treaty of the Silver Vale',
      summary: 'Charter parchment ratifying jurisdiction and commercial escort tariffs across the frontier passes.',
      bodyMarkdown: `### Historical Document
*"Let it be known to all guilds and sovereign freeholders: The Silver Hand shall ensure open highways between High Sun Sanctuary and the southern trading posts, exacting a tariff no greater than five gold pieces per trade wagon."*

Signed and sealed under the solar crest.`,
      tags: ['document', 'charter', 'history', 'law'],
      attributes: {
        language: 'Common',
        era: 'Third Age',
        authenticity: 'Verified Arcane Seal',
      },
      createdAt: now - 86400000 * 4,
      updatedAt: now - 86400000 * 4,
    },
  ];

  const relationships: LoreRelationship[] = [
    {
      id: 'rel-1',
      sourceId: 'entity-npc-commander-valen',
      targetId: 'entity-faction-silver-hand',
      relationType: 'MEMBER_OF',
      notes: 'Commander Valen serves as the Grand Marshal of the company.',
    },
    {
      id: 'rel-2',
      sourceId: 'entity-faction-silver-hand',
      targetId: 'entity-loc-high-sun-sanctuary',
      relationType: 'CONTROLS',
      notes: 'Permanent garrison and command bastion.',
    },
    {
      id: 'rel-3',
      sourceId: 'entity-npc-archmage-varis',
      targetId: 'entity-faction-silver-hand',
      relationType: 'ALLIED_WITH',
      notes: 'Arcane advisor and siege consultant.',
    },
    {
      id: 'rel-4',
      sourceId: 'entity-npc-archmage-varis',
      targetId: 'entity-loc-high-sun-sanctuary',
      relationType: 'LOCATED_IN',
      notes: 'Resides in the Solar Observatory atop the keep.',
    },
    {
      id: 'rel-5',
      sourceId: 'entity-faction-silver-hand',
      targetId: 'entity-loc-whispering-caverns',
      relationType: 'ENEMY_OF',
      notes: 'Raiding parties routinely emerge from the cavern depths to assault patrols.',
    },
    {
      id: 'rel-6',
      sourceId: 'entity-quest-lost-relic',
      targetId: 'entity-loc-whispering-caverns',
      relationType: 'LOCATED_IN',
      notes: 'The ancient scepter is believed locked in the lower subterranean shrine.',
    },
  ];

  return { entities, relationships };
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
    }

    // 3. Asynchronously hydrate/sync from IndexedDB if available
    idb.loadAll().then(idbData => {
      if (idbData && idbData.entities.length > 0) {
        this.entities = idbData.entities;
        this.relationships = idbData.relationships;
        if (!this.activeEntityId || !this.entities.some(e => e.id === this.activeEntityId)) {
          this.activeEntityId = this.entities[0]?.id || null;
        }
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
   * Reset to initial generic 5e seed data.
   */
  resetToDefaultSeed() {
    const seed = createInitialSeedData();
    this.entities = seed.entities;
    this.relationships = seed.relationships;
    this.activeEntityId = seed.entities[0].id;
    this.persist();
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

