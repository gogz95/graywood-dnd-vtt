// src/lib/stores/bestiaryStore.svelte.ts
// Bestiary Compendium Store & Reactive Filtering Engine backed by IndexedDB compendiumDb.monsters

import { compendiumDb, type CompendiumMonster } from '../db/compendiumDb';
import type { ActiveCombatant, SavedEncounter } from '../../types/combat';

export class BestiaryStore {
  searchQuery = $state('');
  selectedCr = $state('all');
  selectedType = $state('all');
  selectedSize = $state('all');
  activeMonster = $state<CompendiumMonster | null>(null);
  allMonsters = $state<CompendiumMonster[]>([]);
  isLoading = $state(false);

  constructor() {
    if (typeof window !== 'undefined') {
      this.init();
    }
  }

  async init(): Promise<void> {
    this.isLoading = true;
    try {
      await compendiumDb.ensureSrdBaseline();
      const list = await compendiumDb.monsters.toArray();
      this.allMonsters = list;
    } catch (err) {
      console.warn('Failed to initialize bestiary store from compendiumDb:', err);
    } finally {
      this.isLoading = false;
    }
  }

  filteredMonsters = $derived.by(() => {
    let result = this.allMonsters;

    // Search text filter
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase().trim();
      result = result.filter(m =>
        m.name.toLowerCase().includes(q) ||
        m.type.toLowerCase().includes(q) ||
        (m.size && m.size.toLowerCase().includes(q))
      );
    }

    // CR filter
    if (this.selectedCr !== 'all') {
      const crVal = parseFloat(this.selectedCr);
      result = result.filter(m => {
        if (this.selectedCr === '1/8') return Math.abs(m.cr - 0.125) < 0.01;
        if (this.selectedCr === '1/4') return Math.abs(m.cr - 0.25) < 0.01;
        if (this.selectedCr === '1/2') return Math.abs(m.cr - 0.5) < 0.01;
        return !isNaN(crVal) && Math.abs(m.cr - crVal) < 0.01;
      });
    }

    // Creature Type filter
    if (this.selectedType !== 'all') {
      const targetType = this.selectedType.toLowerCase();
      result = result.filter(m => m.type.toLowerCase().includes(targetType));
    }

    // Size filter
    if (this.selectedSize !== 'all') {
      const targetSize = this.selectedSize.toLowerCase();
      result = result.filter(m => m.size && m.size.toLowerCase() === targetSize);
    }

    return result;
  });

  selectMonster(id: string): void {
    const found = this.allMonsters.find(m => m.id === id);
    if (found) {
      this.activeMonster = found;
    } else {
      compendiumDb.monsters.get(id).then(m => {
        if (m) this.activeMonster = m;
      });
    }
  }

  quickAddToEncounter(monster: CompendiumMonster | any): void {
    if (!monster) return;

    let encounters: Record<string, SavedEncounter> = {};
    let activeId = localStorage.getItem('vtt_active_encounter_id') || '';
    try {
      const raw = localStorage.getItem('vtt_encounters');
      if (raw) encounters = JSON.parse(raw);
    } catch {}

    if (!activeId || !encounters[activeId]) {
      const keys = Object.keys(encounters);
      if (keys.length > 0) {
        activeId = keys[0];
      } else {
        activeId = `enc-${Date.now()}`;
        encounters[activeId] = {
          encounter: {
            id: activeId,
            name: 'Quick Encounter',
            round: 1,
            current_turn_index: 0,
            is_active: false
          },
          combatants: []
        };
        localStorage.setItem('vtt_active_encounter_id', activeId);
      }
    }

    const dexScore = monster.dex ?? 10;
    const dexMod = Math.floor((dexScore - 10) / 2);
    const initiative = Math.floor(Math.random() * 20) + 1 + dexMod;

    const newCombatant: ActiveCombatant = {
      id: `comb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      encounter_id: activeId,
      token_id: '',
      name: monster.name,
      initiative,
      hp_current: monster.hp || 20,
      hp_max: monster.hp || 20,
      temp_hp: 0,
      ac: monster.ac || 10,
      is_monster: true,
      monster_compendium_id: monster.id || null,
      multiattack_profile: null,
      conditions: [],
      scores: {
        dex: dexScore,
        int: monster.int ?? 10,
        wis: monster.wis ?? 10
      }
    };

    encounters[activeId].combatants = [...encounters[activeId].combatants, newCombatant];
    localStorage.setItem('vtt_encounters', JSON.stringify(encounters));

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vtt:encounters-updated'));
    }
  }
}

export const bestiaryStore = new BestiaryStore();

// Export helper encounterStore bridge for 1-click combatant ingestion
export const encounterStore = {
  addCombatant(monster: any) {
    bestiaryStore.quickAddToEncounter(monster);
  }
};
