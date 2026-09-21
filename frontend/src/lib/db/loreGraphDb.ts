// src/lib/db/loreGraphDb.ts
// Native IndexedDB persistence engine for Relational Lore Graph with strict zero-mock guarantees

export interface DbLoreEntity {
  id: string;
  name: string;
  type: string;
  category?: string;
  summary: string;
  detailsMarkdown?: string;
  tags: string[];
  attributes: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

export interface DbLoreRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: string;
  description?: string;
  weight?: number;
}

const DB_NAME = 'vtt_lore_graph_db';
const DB_VERSION = 1;

export const PURGED_MOCK_NAMES = [
  'The Silver Hand Mercenaries',
  'Commander Valen',
  'Archmage Varis',
  'High Sun Sanctuary',
  'Whispering Caverns',
  'The Lost Relic of Sunpeak',
  'Treaty of the Silver Vale'
];

let dbPromise: Promise<IDBDatabase> | null = null;

export function getLoreDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB not supported'));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
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
      req.onsuccess = async () => {
        const db = req.result;
        await sanitizePurgedMockRecords(db);
        resolve(db);
      };
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

export async function sanitizePurgedMockRecords(db: IDBDatabase): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(['entities', 'relationships'], 'readwrite');
      const entityStore = tx.objectStore('entities');
      const req = entityStore.openCursor();
      const mockIdsToDelete = new Set<string>();

      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const item = cursor.value as DbLoreEntity;
          const isMock =
            PURGED_MOCK_NAMES.includes(item.name) ||
            item.id.startsWith('entity-faction-silver-hand') ||
            item.id.startsWith('entity-npc-commander-valen') ||
            item.id.startsWith('entity-npc-archmage-varis') ||
            item.id.startsWith('entity-loc-high-sun-sanctuary') ||
            item.id.startsWith('entity-loc-whispering-caverns') ||
            item.id.startsWith('entity-quest-lost-relic') ||
            item.id.startsWith('entity-doc-treaty-silver-vale');

          if (isMock) {
            mockIdsToDelete.add(item.id);
            cursor.delete();
          }
          cursor.continue();
        } else {
          // Clean matching relationships
          if (mockIdsToDelete.size > 0) {
            const relStore = tx.objectStore('relationships');
            const relReq = relStore.openCursor();
            relReq.onsuccess = (re) => {
              const relCursor = (re.target as IDBRequest<IDBCursorWithValue>).result;
              if (relCursor) {
                const rel = relCursor.value as DbLoreRelationship;
                if (mockIdsToDelete.has(rel.sourceId) || mockIdsToDelete.has(rel.targetId)) {
                  relCursor.delete();
                }
                relCursor.continue();
              }
            };
          }
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve(); // Non-blocking safe recovery
    } catch {
      resolve();
    }
  });
}
