// frontend/src/lib/stores/combatTrackerStore.ts
// Combat Tracker Store Adapter providing activeCombatant reactivity and token turn hooks

import { combatStore, type Combatant } from './combatStore.svelte';

export interface CombatTrackerState {
  isActive: boolean;
  round: number;
  turnIndex: number;
  activeCombatantId: string | null;
  combatants: Combatant[];
}

export class CombatTrackerStoreAdapter {
  private activeIdListeners = new Set<(id: string | null) => void>();
  private currentActiveId: string | null = null;

  public get activeCombatant(): Combatant | null {
    return combatStore.activeCombatant;
  }

  public get onDeckCombatant(): Combatant | null {
    return combatStore.onDeckCombatant;
  }

  public get activeCombatantId(): string | null {
    return combatStore.activeCombatant?.tokenId ?? null;
  }

  public subscribe(run: (activeId: string | null) => void): () => void {
    run(this.activeCombatantId);
    this.activeIdListeners.add(run);
    return () => {
      this.activeIdListeners.delete(run);
    };
  }

  public notifyListeners(): void {
    const id = this.activeCombatantId;
    if (id !== this.currentActiveId) {
      this.currentActiveId = id;
      for (const listener of this.activeIdListeners) {
        try {
          listener(id);
        } catch (err) {
          console.error('[CombatTrackerStore] listener error:', err);
        }
      }
    }
  }

  public get isActive(): boolean {
    return combatStore.isActive;
  }

  public get round(): number {
    return combatStore.round;
  }

  public get turnIndex(): number {
    return combatStore.turnIndex;
  }

  public get combatants(): Combatant[] {
    return combatStore.combatants;
  }

  public nextTurn(): void {
    combatStore.nextTurn();
    this.notifyListeners();
  }

  public previousTurn(): void {
    combatStore.previousTurn();
    this.notifyListeners();
  }

  public startCombat(): void {
    combatStore.startCombat();
    this.notifyListeners();
  }

  public endCombat(): void {
    combatStore.endCombat();
    this.notifyListeners();
  }
}

export const combatTrackerStore = new CombatTrackerStoreAdapter();

