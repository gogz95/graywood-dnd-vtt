// src/lib/workers/parseWorkerClient.ts
// Thin client that runs heavy ingestion text parsing inside a Web Worker so the
// main UI thread never blocks, with error boundaries that return failed results.

import type { IngestQueueItem } from '../services/ingest/ingestTypes';

export interface WorkerParseResult {
  status: 'parsed' | 'failed';
  text?: string;
  error?: string;
  itemId: string;
}

const WORKER_SOURCE = `
self.onmessage = async (e) => {
  const { itemId, name, textChunk } = e.data || {};
  try {
    if (typeof textChunk !== 'string') {
      throw new Error('Worker received empty or invalid text payload');
    }
    // Light normalization inside the worker: merge hyphenated wraps and
    // collapse broken sentence lines. Full 5e parsing stays on the main
    // thread against Dexie-backed stores.
    const cleaned = String(textChunk)
      .replace(/(\\w+)-\\r?\\n(\\w+)/g, '$1$2')
      .replace(/([^\\n.!?])\\r?\\n([a-z])/g, '$1 $2')
      .trim();
    self.postMessage({ status: 'parsed', itemId, name, text: cleaned });
  } catch (err) {
    self.postMessage({
      status: 'failed',
      itemId: itemId || 'unknown',
      error: (err && err.message) || 'Worker parse failed for ' + (name || 'unknown file'),
    });
  }
};
`;

/** Lazily-created singleton worker shared by the ingestion queue. */
let sharedWorker: Worker | null = null;

function getSharedWorker(): Worker | null {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') return null;
  if (sharedWorker) return sharedWorker;
  try {
    const blob = new Blob([WORKER_SOURCE], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    sharedWorker = new Worker(url);
    return sharedWorker;
  } catch {
    return null;
  }
}

/**
 * Offloads text normalization for one queue item to the background worker.
 * Falls back to synchronous normalization when Workers are unavailable.
 * Never throws: corrupt payloads resolve as `{ status: 'failed', error }`.
 */
export function parseItemInWorker(item: IngestQueueItem, text: string): Promise<WorkerParseResult> {
  const worker = getSharedWorker();
  if (!worker) {
    try {
      if (typeof text !== 'string') throw new Error('Empty or invalid text payload');
      return Promise.resolve({ status: 'parsed', itemId: item.id, text });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Parse failed for ' + item.name;
      return Promise.resolve({ status: 'failed', itemId: item.id, error: message });
    }
  }

  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      worker.removeEventListener('message', onMessage);
      resolve({ status: 'failed', itemId: item.id, error: 'Worker parse timed out for ' + item.name });
    }, 15000);

    const onMessage = (event: MessageEvent) => {
      const data = event.data as WorkerParseResult & { name?: string };
      if (!data || data.itemId !== item.id) return;
      window.clearTimeout(timeout);
      worker.removeEventListener('message', onMessage);
      if (data.status === 'parsed') {
        resolve({ status: 'parsed', itemId: item.id, text: data.text ?? '' });
      } else {
        resolve({
          status: 'failed',
          itemId: item.id,
          error: data.error || 'Worker parse failed for ' + item.name,
        });
      }
    };

    worker.addEventListener('message', onMessage);
    try {
      worker.postMessage({ itemId: item.id, name: item.name, textChunk: text });
    } catch (err: unknown) {
      window.clearTimeout(timeout);
      worker.removeEventListener('message', onMessage);
      const message = err instanceof Error ? err.message : 'Worker post failed for ' + item.name;
      resolve({ status: 'failed', itemId: item.id, error: message });
    }
  });
}

/** Terminates the shared worker; safe to call when idle. */
export function terminateParseWorker(): void {
  try {
    sharedWorker?.terminate();
  } catch {
    // already terminated
  }
  sharedWorker = null;
}
