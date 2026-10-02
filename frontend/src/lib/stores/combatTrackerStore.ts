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
  public get activeCombatant(): Combatant | null {
    return combatStore.activeCombatant;
  }

  public get onDeckCombatant(): Combatant | null {
    return combatStore.onDeckCombatant;
  }

  public get activeCombatantId(): string | null {
    return combatStore.activeCombatant?.tokenId ?? null;
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
  }

  public previousTurn(): void {
    combatStore.previousTurn();
  }

  public startCombat(): void {
    combatStore.startCombat();
  }

  public endCombat(): void {
    combatStore.endCombat();
  }
}

export const combatTrackerStore = new CombatTrackerStoreAdapter();
