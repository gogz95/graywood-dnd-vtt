// frontend/src/lib/stores/projectorStore.ts
// Canonical-path re-export shim: the implementation lives in
// `./projectorStore.svelte.ts` (Svelte 5 runes module). This file exists so
// imports via either `projectorStore` or `projectorStore.svelte` resolve to
// the same curtain + camera-lock state.
export * from './projectorStore.svelte';
