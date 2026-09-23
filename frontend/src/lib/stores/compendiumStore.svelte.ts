// src/lib/stores/compendiumStore.svelte.ts
// Svelte 5 Reactive Compendium Store managing Dexie live queries, package manifests, and dynamic search.

import { liveQuery, type Subscription } from 'dexie';
import {
  compendiumDb,
  type CompendiumSpell,
  type CompendiumSubclass,
  type CompendiumMonster,
  type CompendiumFacility,
  type CompendiumItem,
  type CompendiumJournal,
  type CompendiumRule
} from '../db/compendiumDb';
import type { IngestedTable } from '../types/compendium';
import { extractAndStoreCompendiumSource, type ExtractionResult } from '../importers/pdfRuleExtractor';

export interface PackageSummary {
  packageId: string;
  sourceBook: string;
  origin: 'SRD-5.1' | 'USER_IMPORT';
  spellCount: number;
  subclassCount: number;
  monsterCount: number;
  facilityCount: number;
  itemCount: number;
}

class CompendiumStore {
  // Svelte 5 runes for reactive state
  spells = $state<CompendiumSpell[]>([]);
  subclasses = $state<CompendiumSubclass[]>([]);
  monsters = $state<CompendiumMonster[]>([]);
  facilities = $state<CompendiumFacility[]>([]);
  items = $state<CompendiumItem[]>([]);
  journal = $state<CompendiumJournal[]>([]);
  rules = $state<CompendiumRule[]>([]);
  tables = $state<IngestedTable[]>([]);
  packages = $state<PackageSummary[]>([]);
  isLoading = $state(true);

  // Reactive counters bound directly to live state
  monsterCount = $derived(this.monsters.length);
  spellCount = $derived(this.spells.length);
  itemCount = $derived(this.items.length);
  journalCount = $derived(this.journal.length);
  ruleCount = $derived(this.rules.length);

  private subs: Subscription[] = [];

  constructor() {
    this.init();
  }

  private async init() {
    await compendiumDb.ensureSrdBaseline();

    // Subscribe to live queries for each table
    const spellsSub = liveQuery(() => compendiumDb.spells.toArray()).subscribe({
      next: (val) => {
        this.spells = val;
        this.updatePackageSummaries();
      },
      error: (err) => console.warn('Compendium spells liveQuery error:', err)
    });

    const subSub = liveQuery(() => compendiumDb.subclasses.toArray()).subscribe({
      next: (val) => {
        this.subclasses = val;
        this.updatePackageSummaries();
      },
      error: (err) => console.warn('Compendium subclasses liveQuery error:', err)
    });

    const monsterSub = liveQuery(() => compendiumDb.monsters.toArray()).subscribe({
      next: (val) => {
        this.monsters = val;
        this.updatePackageSummaries();
      },
      error: (err) => console.warn('Compendium monsters liveQuery error:', err)
    });

    const facilitySub = liveQuery(() => compendiumDb.facilities.toArray()).subscribe({
      next: (val) => {
        this.facilities = val;
        this.updatePackageSummaries();
      },
      error: (err) => console.warn('Compendium facilities liveQuery error:', err)
    });

    const itemsSub = liveQuery(() => compendiumDb.items.toArray()).subscribe({
      next: (val) => {
        this.items = val;
        this.updatePackageSummaries();
      },
      error: (err) => console.warn('Compendium items liveQuery error:', err)
    });

    const journalSub = liveQuery(() => compendiumDb.journal.toArray()).subscribe({
      next: (val) => {
        this.journal = val;
        this.isLoading = false;
      },
      error: (err) => console.warn('Compendium journal liveQuery error:', err)
    });

    const rulesSub = liveQuery(() => compendiumDb.rules.toArray()).subscribe({
      next: (val) => {
        this.rules = val;
      },
      error: (err) => console.warn('Compendium rules liveQuery error:', err)
    });

    this.subs = [spellsSub, subSub, monsterSub, facilitySub, itemsSub, journalSub, rulesSub];
  }

  async refreshFromDb(): Promise<void> {
    try {
      this.monsters = await compendiumDb.monsters.toArray();
      if ('spells' in compendiumDb) {
        this.spells = await compendiumDb.spells.toArray();
      }
      if ('subclasses' in compendiumDb) {
        this.subclasses = await compendiumDb.subclasses.toArray();
      }
      if ('facilities' in compendiumDb) {
        this.facilities = await compendiumDb.facilities.toArray();
      }
      if ('ingestedTables' in compendiumDb) {
        this.tables = await compendiumDb.ingestedTables.toArray();
      }
      this.updatePackageSummaries();
    } catch (err) {
      console.warn('Failed to refresh compendiumStore from DB:', err);
    }
  }

  private updatePackageSummaries() {
    const pkgMap = new Map<string, PackageSummary>();

    // Scan all tables
    for (const s of this.spells) {
      if (!pkgMap.has(s.packageId)) {
        pkgMap.set(s.packageId, {
          packageId: s.packageId,
          sourceBook: s.sourceBook,
          origin: s.origin,
          spellCount: 0,
          subclassCount: 0,
          monsterCount: 0,
          facilityCount: 0,
          itemCount: 0
        });
      }
      pkgMap.get(s.packageId)!.spellCount++;
    }

    for (const sub of this.subclasses) {
      if (!pkgMap.has(sub.packageId)) {
        pkgMap.set(sub.packageId, {
          packageId: sub.packageId,
          sourceBook: sub.sourceBook,
          origin: sub.origin,
          spellCount: 0,
          subclassCount: 0,
          monsterCount: 0,
          facilityCount: 0,
          itemCount: 0
        });
      }
      pkgMap.get(sub.packageId)!.subclassCount++;
    }

    for (const m of this.monsters) {
      if (!pkgMap.has(m.packageId)) {
        pkgMap.set(m.packageId, {
          packageId: m.packageId,
          sourceBook: m.sourceBook,
          origin: m.origin,
          spellCount: 0,
          subclassCount: 0,
          monsterCount: 0,
          facilityCount: 0,
          itemCount: 0
        });
      }
      pkgMap.get(m.packageId)!.monsterCount++;
    }

    for (const f of this.facilities) {
      if (!pkgMap.has(f.packageId)) {
        pkgMap.set(f.packageId, {
          packageId: f.packageId,
          sourceBook: f.sourceBook,
          origin: f.origin,
          spellCount: 0,
          subclassCount: 0,
          monsterCount: 0,
          facilityCount: 0,
          itemCount: 0
        });
      }
      pkgMap.get(f.packageId)!.facilityCount++;
    }

    for (const item of this.items) {
      if (!pkgMap.has(item.packageId)) {
        pkgMap.set(item.packageId, {
          packageId: item.packageId,
          sourceBook: item.sourceBook,
          origin: item.origin,
          spellCount: 0,
          subclassCount: 0,
          monsterCount: 0,
          facilityCount: 0,
          itemCount: 0
        });
      }
      pkgMap.get(item.packageId)!.itemCount++;
    }

    this.packages = Array.from(pkgMap.values()).sort((a, b) => {
      if (a.origin === 'SRD-5.1') return -1;
      if (b.origin === 'SRD-5.1') return 1;
      return a.sourceBook.localeCompare(b.sourceBook);
    });
  }

  // ── Reactive Query Helpers ─────────────────────────────────────────────────

  getSpellsByClass(className: string): CompendiumSpell[] {
    const c = className.toLowerCase();
    return this.spells.filter((s) => s.parentClass?.some((pc) => pc.toLowerCase() === c));
  }

  getSubclassesForClass(className: string): CompendiumSubclass[] {
    const c = className.toLowerCase();
    return this.subclasses.filter((s) => s.parentClass.toLowerCase() === c);
  }

  searchMonsters(query: string): CompendiumMonster[] {
    const q = query.trim().toLowerCase();
    if (!q) return this.monsters;
    return this.monsters.filter((m) => m.name.toLowerCase().includes(q) || m.type.toLowerCase().includes(q));
  }

  getFacilitiesByCategory(category?: string): CompendiumFacility[] {
    if (!category) return this.facilities;
    return this.facilities.filter((f) => f.category.toLowerCase() === category.toLowerCase());
  }

  // ── Mutations & Package Lifecycle ──────────────────────────────────────────

  async importSourceFile(fileOrText: File | Blob | string, fileName: string): Promise<ExtractionResult> {
    return await extractAndStoreCompendiumSource(fileOrText, fileName);
  }

  async purgePackage(packageId: string): Promise<{
    deletedSpells: number;
    deletedSubclasses: number;
    deletedMonsters: number;
    deletedFacilities: number;
  }> {
    return await compendiumDb.purgePackage(packageId);
  }

  destroy() {
    for (const sub of this.subs) {
      sub.unsubscribe();
    }
  }
}

export const compendiumStore = new CompendiumStore();
