// frontend/src/setupTests.ts
// Global Vitest setup: register an in-memory IndexedDB so Dexie-backed modules
// (compendiumStore, dexieDb, etc.) can initialize under the Node test runtime.
import 'fake-indexeddb/auto';
