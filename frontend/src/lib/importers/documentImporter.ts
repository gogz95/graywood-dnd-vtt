// documentImporter.ts — Production-Ready Semantic Document Chunker & IndexedDB Vector/RAG Store
// Preserves markdown header paths (# Heading > ## Subheading) and tracks token estimates

export interface TextChunk {
  id: string;
  documentId: string;
  documentTitle: string;
  headerPath: string; // e.g., "Combat Rules > Actions > Attack"
  content: string;
  tokenEstimate: number;
  timestamp: number;
}

export interface KnowledgeDocument {
  id: string;
  title: string;
  fileName: string;
  fileSize: number;
  totalChunks: number;
  timestamp: number;
}

const DB_NAME = 'vtt_knowledge_db';
const DB_VERSION = 1;
const STORE_DOCS = 'knowledge_documents';
const STORE_CHUNKS = 'knowledge_chunks';

/**
 * Splits raw document text into overlapping semantic blocks while tracking
 * markdown header breadcrumb hierarchy (# Chapter > ## Section > ### Subsection).
 */
export function chunkText(
  rawText: string,
  chunkSize = 500,
  overlap = 50,
  documentId = 'doc-temp',
  documentTitle = 'Document'
): TextChunk[] {
  if (!rawText || !rawText.trim()) return [];

  const lines = rawText.split('\n');
  const chunks: TextChunk[] = [];

  let currentHeaderH1 = '';
  let currentHeaderH2 = '';
  let currentHeaderH3 = '';

  let currentBlock = '';
  let chunkIndex = 0;

  function getCurrentHeaderPath(): string {
    const parts = [currentHeaderH1, currentHeaderH2, currentHeaderH3].filter(Boolean);
    return parts.length > 0 ? parts.join(' > ') : documentTitle;
  }

  function flushCurrentBlock() {
    const trimmed = currentBlock.trim();
    if (!trimmed) return;

    // Word count ~ 0.75 tokens per word; simple approximation
    const wordCount = trimmed.split(/\s+/).length;
    const tokenEstimate = Math.ceil(wordCount * 1.3);

    chunks.push({
      id: `${documentId}-chunk-${chunkIndex++}`,
      documentId,
      documentTitle,
      headerPath: getCurrentHeaderPath(),
      content: trimmed,
      tokenEstimate,
      timestamp: Date.now(),
    });

    // Handle overlap by preserving the tail words of the current block
    if (overlap > 0 && currentBlock.length > overlap) {
      const words = trimmed.split(/\s+/);
      const overlapWords = words.slice(-Math.min(words.length, Math.ceil(overlap / 5))).join(' ');
      currentBlock = overlapWords + '\n\n';
    } else {
      currentBlock = '';
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Check for markdown headers
    const h1Match = trimmedLine.match(/^#\s+(.+)$/);
    const h2Match = trimmedLine.match(/^##\s+(.+)$/);
    const h3Match = trimmedLine.match(/^###\s+(.+)$/);

    if (h1Match) {
      if (currentBlock.trim().length >= chunkSize / 2) {
        flushCurrentBlock();
      }
      currentHeaderH1 = h1Match[1].trim();
      currentHeaderH2 = '';
      currentHeaderH3 = '';
      currentBlock += (currentBlock ? '\n' : '') + line;
      continue;
    }

    if (h2Match) {
      if (currentBlock.trim().length >= chunkSize / 2) {
        flushCurrentBlock();
      }
      currentHeaderH2 = h2Match[1].trim();
      currentHeaderH3 = '';
      currentBlock += (currentBlock ? '\n' : '') + line;
      continue;
    }

    if (h3Match) {
      if (currentBlock.trim().length >= chunkSize / 2) {
        flushCurrentBlock();
      }
      currentHeaderH3 = h3Match[1].trim();
      currentBlock += (currentBlock ? '\n' : '') + line;
      continue;
    }

    // Append standard line
    currentBlock += (currentBlock ? '\n' : '') + line;

    // If block exceeds configured chunkSize, flush chunk
    if (currentBlock.length >= chunkSize) {
      flushCurrentBlock();
    }
  }

  // Final flush for remaining content
  if (currentBlock.trim().length > 0) {
    flushCurrentBlock();
  }

  return chunks;
}

/**
 * Opens or initializes the IndexedDB knowledge base.
 */
function openKnowledgeDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_DOCS)) {
        db.createObjectStore(STORE_DOCS, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
        const chunkStore = db.createObjectStore(STORE_CHUNKS, { keyPath: 'id' });
        chunkStore.createIndex('documentId', 'documentId', { unique: false });
        chunkStore.createIndex('headerPath', 'headerPath', { unique: false });
        chunkStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Ingests a file (.md, .txt, .json) into IndexedDB documents and semantic chunks.
 */
export async function ingestDocument(file: File): Promise<KnowledgeDocument> {
  const text = await file.text();
  const documentId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const title = file.name.replace(/\.[^/.]+$/, '');

  let rawContent = text;
  // If JSON, pretty print or serialize text fields
  if (file.name.endsWith('.json')) {
    try {
      const parsed = JSON.parse(text);
      rawContent = JSON.stringify(parsed, null, 2);
    } catch {
      rawContent = text;
    }
  }

  const chunks = chunkText(rawContent, 500, 50, documentId, title);

  const docRecord: KnowledgeDocument = {
    id: documentId,
    title,
    fileName: file.name,
    fileSize: file.size,
    totalChunks: chunks.length,
    timestamp: Date.now(),
  };

  const db = await openKnowledgeDb();
  const tx = db.transaction([STORE_DOCS, STORE_CHUNKS], 'readwrite');
  const docStore = tx.objectStore(STORE_DOCS);
  const chunkStore = tx.objectStore(STORE_CHUNKS);

  docStore.put(docRecord);
  for (const chunk of chunks) {
    chunkStore.put(chunk);
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return docRecord;
}

/**
 * Returns all ingested documents in the knowledge base.
 */
export async function getDocuments(): Promise<KnowledgeDocument[]> {
  try {
    const db = await openKnowledgeDb();
    const tx = db.transaction(STORE_DOCS, 'readonly');
    const store = tx.objectStore(STORE_DOCS);

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

/**
 * Deletes a document and purges all of its associated chunks from IndexedDB.
 */
export async function deleteDocument(documentId: string): Promise<void> {
  const db = await openKnowledgeDb();
  const tx = db.transaction([STORE_DOCS, STORE_CHUNKS], 'readwrite');
  const docStore = tx.objectStore(STORE_DOCS);
  const chunkStore = tx.objectStore(STORE_CHUNKS);

  docStore.delete(documentId);

  const index = chunkStore.index('documentId');
  const request = index.openKeyCursor(IDBKeyRange.only(documentId));

  request.onsuccess = () => {
    const cursor = request.result;
    if (cursor) {
      chunkStore.delete(cursor.primaryKey);
      cursor.continue();
    }
  };

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Wipes all documents and chunks from the knowledge base.
 */
export async function clearKnowledgeBase(): Promise<void> {
  const db = await openKnowledgeDb();
  const tx = db.transaction([STORE_DOCS, STORE_CHUNKS], 'readwrite');
  tx.objectStore(STORE_DOCS).clear();
  tx.objectStore(STORE_CHUNKS).clear();

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Performs full-text and keyword score-ranked retrieval over stored chunks
 * to supply grounded RAG context directly to the Rules Archivist LLM queries.
 */
export async function searchChunks(query: string, limit = 5): Promise<TextChunk[]> {
  if (!query || !query.trim()) return [];

  const queryTerms = query
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2);

  if (queryTerms.length === 0) return [];

  try {
    const db = await openKnowledgeDb();
    const tx = db.transaction(STORE_CHUNKS, 'readonly');
    const store = tx.objectStore(STORE_CHUNKS);

    const allChunks: TextChunk[] = await new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });

    if (allChunks.length === 0) return [];

    // Calculate keyword relevance score for each chunk
    const scoredChunks = allChunks.map(chunk => {
      const contentLower = chunk.content.toLowerCase();
      const headerLower = chunk.headerPath.toLowerCase();
      let score = 0;

      for (const term of queryTerms) {
        // Higher weight for header path matches
        if (headerLower.includes(term)) {
          score += 5;
        }

        // Exact term occurrences in content
        const matches = contentLower.split(term).length - 1;
        score += matches * 1.5;
      }

      return { chunk, score };
    });

    return scoredChunks
      .filter(sc => sc.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(sc => sc.chunk);
  } catch (err) {
    console.error('Error searching knowledge chunks:', err);
    return [];
  }
}
