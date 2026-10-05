// frontend/src/setupTests.ts
// Global Vitest setup: register an in-memory IndexedDB so Dexie-backed modules
// (compendiumStore, dexieDb, etc.) can initialize under the Node test runtime.
import 'fake-indexeddb/auto';
import { afterAll } from 'vitest';
import { dexieDb } from './lib/db/dexieDb';

for (const api of ['indexedDB', 'IDBKeyRange', 'IDBTransaction'] as const) {
  if (!(api in globalThis) || (globalThis as Record<string, unknown>)[api] == null) {
    throw new Error(`[setupTests] fake-indexeddb failed to register globalThis.${api}`);
  }
}

// Release the shared Dexie connection at the end of each test file to avoid
// blocked upgrades / lock leaks between suites sharing a worker.
afterAll(() => {
  if (dexieDb?.isOpen()) {
    dexieDb.close();
  }
});
