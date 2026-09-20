// src/lib/db/sourceStore.ts
// Local Source Database for NotebookLM-style grounded search & chunking

export interface SourceDocument {
  id: string;
  name: string;
  type: 'md' | 'txt' | 'pdf' | 'json';
  sizeBytes: number;
  dateAdded: number;
  isEnabled: boolean;
  rawContent: string;
}

export interface SourceChunk {
  id: string;
  docId: string;
  docName: string;
  chunkIndex: number;
  sectionHeader: string;
  text: string;
}

const DB_NAME = 'aleamos_source_engine_db';
const DB_VERSION = 1;
const STORE_DOCUMENTS = 'documents';
const STORE_CHUNKS = 'chunks';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB is not supported in this environment'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_DOCUMENTS)) {
        const docStore = db.createObjectStore(STORE_DOCUMENTS, { keyPath: 'id' });
        docStore.createIndex('isEnabled', 'isEnabled', { unique: false });
        docStore.createIndex('dateAdded', 'dateAdded', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
        const chunkStore = db.createObjectStore(STORE_CHUNKS, { keyPath: 'id' });
        chunkStore.createIndex('docId', 'docId', { unique: false });
        chunkStore.createIndex('chunkIndex', 'chunkIndex', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveDocumentWithChunks(doc: SourceDocument, chunks: SourceChunk[]): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_DOCUMENTS, STORE_CHUNKS], 'readwrite');
    const docStore = tx.objectStore(STORE_DOCUMENTS);
    const chunkStore = tx.objectStore(STORE_CHUNKS);

    docStore.put(doc);
    for (const chunk of chunks) {
      chunkStore.put(chunk);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllDocuments(): Promise<SourceDocument[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DOCUMENTS, 'readonly');
    const store = tx.objectStore(STORE_DOCUMENTS);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function getDocumentById(id: string): Promise<SourceDocument | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DOCUMENTS, 'readonly');
    const store = tx.objectStore(STORE_DOCUMENTS);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function setDocumentEnabled(id: string, isEnabled: boolean): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DOCUMENTS, 'readwrite');
    const store = tx.objectStore(STORE_DOCUMENTS);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const doc = getReq.result as SourceDocument | undefined;
      if (doc) {
        doc.isEnabled = isEnabled;
        store.put(doc);
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteDocumentAndChunks(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_DOCUMENTS, STORE_CHUNKS], 'readwrite');
    const docStore = tx.objectStore(STORE_DOCUMENTS);
    const chunkStore = tx.objectStore(STORE_CHUNKS);

    docStore.delete(id);

    // Delete associated chunks
    const chunkIndex = chunkStore.index('docId');
    const keyRange = IDBKeyRange.only(id);
    const cursorReq = chunkIndex.openCursor(keyRange);

    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getChunksByDocId(docId: string): Promise<SourceChunk[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CHUNKS, 'readonly');
    const store = tx.objectStore(STORE_CHUNKS);
    const index = store.index('docId');
    const request = index.getAll(IDBKeyRange.only(docId));

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllChunksForEnabledDocs(): Promise<SourceChunk[]> {
  const docs = await getAllDocuments();
  const enabledDocIds = new Set(docs.filter(d => d.isEnabled).map(d => d.id));

  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CHUNKS, 'readonly');
    const store = tx.objectStore(STORE_CHUNKS);
    const request = store.getAll();

    request.onsuccess = () => {
      const allChunks = (request.result || []) as SourceChunk[];
      resolve(allChunks.filter(c => enabledDocIds.has(c.docId)));
    };
    request.onerror = () => reject(request.error);
  });
}
