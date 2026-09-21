# Client Storage & Reactive Store Architecture

Graywood VTT implements an offline-first, client-side persistence and hydration architecture powered by **Dexie.js** (IndexedDB) integrated with Svelte 5 reactive runes.

---

## 1. Dexie Database Schema Layout

To prevent namespace collision with Dexie's built-in accessor property `Dexie.prototype.tables`, roll tables and custom compendium tables are explicitly namespaced under `ingestedTables`.

### Compendium Schema Definition (`frontend/src/lib/db/compendiumDb.ts`)

```typescript
import Dexie, { type Table } from 'dexie';
import type { Monster, Spell, Item, IngestedTable } from '../types/compendium';

export class CompendiumDatabase extends Dexie {
  monsters!: Table<Monster, string>;
  spells!: Table<Spell, string>;
  items!: Table<Item, string>;
  ingestedTables!: Table<IngestedTable, number>;

  constructor() {
    super('CompendiumDb');
    this.version(2).stores({
      monsters: 'id, name, cr, type, source',
      spells: 'id, name, level, school, source',
      items: 'id, name, type, rarity, source',
      ingestedTables: '++id, name, category, source'
    });
  }
}

export const compendiumDb = new CompendiumDatabase();
```

---

## 2. Reactive Hydration Loop & Event Dispatch

Client components never poll IndexedDB. When source material is ingested via `dualEngineIngest` or the universal ingestion pipeline, data is committed transactionally and broadcast across the frontend through custom DOM events.

```
┌─────────────────────────┐
│ Ingestion Pipeline      │
│ (Universal / Dual-Mode) │
└───────────┬─────────────┘
            │ 1. Atomic Transaction
            ▼
┌─────────────────────────┐
│ Dexie compendiumDb      │
│ (IndexedDB Collections) │
└───────────┬─────────────┘
            │ 2. Direct Reactive Store Update
            ▼
┌──────────────────────────────────────────────┐
│ Svelte 5 Stores                              │
│ • bestiaryStore.refreshFromDb()              │
│ • compendiumStore.refreshFromDb()            │
└───────────┬──────────────────────────────────┘
            │ 3. Dispatch System Event
            ▼
┌──────────────────────────────────────────────┐
│ Window Event Bus                             │
│ window.dispatchEvent(                        │
│   new CustomEvent(                           │
│     'compendium:data-synchronized'           │
│   )                                          │
│ )                                            │
└───────────┬──────────────────────────────────┘
            │ 4. OnMount / $effect Listener
            ▼
┌──────────────────────────────────────────────┐
│ Consuming Views (Svelte 5 Runes)             │
│ • CompendiumBrowser.svelte                   │
│ • FullBestiaryView.svelte                    │
│ • CompendiumDrawer.svelte                    │
│ (Triggers instant UI re-render with 0 reload)│
└──────────────────────────────────────────────┘
```

### Batch Commit & Broadcast Pattern

```typescript
// Transactional write to avoid partial reads
await compendiumDb.transaction(
  'rw',
  [compendiumDb.monsters, compendiumDb.spells, compendiumDb.ingestedTables],
  async () => {
    if (monstersToSave.length > 0) await compendiumDb.monsters.bulkPut(monstersToSave);
    if (spellsToSave.length > 0) await compendiumDb.spells.bulkPut(spellsToSave);
    if (tablesToSave.length > 0) await compendiumDb.ingestedTables.bulkAdd(tablesToSave);
  }
);

// Hydrate in-memory stores
await bestiaryStore.refreshFromDb?.();
await compendiumStore.refreshFromDb?.();

// Dispatch system synchronization event to active views
if (typeof window !== 'undefined') {
  window.dispatchEvent(new CustomEvent('compendium:monsters-updated'));
  window.dispatchEvent(new CustomEvent('compendium:data-synchronized'));
}
```

### Component Consumption via Svelte 5

Components listen for the lifecycle signal without manual poll intervals or full route reloads:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { compendiumStore } from '$lib/stores/compendiumStore.svelte';

  onMount(() => {
    const reload = () => {
      compendiumStore.refreshFromDb();
    };

    window.addEventListener('compendium:data-synchronized', reload);
    return () => {
      window.removeEventListener('compendium:data-synchronized', reload);
    };
  });
</script>
```
