// frontend/src/lib/stores/dicePolicyStore.logic.ts
// Pure-TS (no Svelte runes) dice policy engine — testable with Vitest headlessly.

import type { TableDicePolicy } from '$lib/dice/types';

export interface DicePolicyState {
  tablePolicy: TableDicePolicy;
  playerOverrides: Record<string, boolean>;
  clientLocalPrefDigital: boolean;
}

/**
 * Evaluates whether digital dice are enabled for `userId` given the current
 * policy state. This is the pure tri-mode logic, extracted from the Svelte store.
 *
 * Precedence:
 *  1. full_in_person → always false.
 *  2. full_digital   → returns clientLocalPrefDigital.
 *  3. selective      → playerOverrides[userId] ?? clientLocalPrefDigital.
 */
export function isDigitalDiceEnabled(
  state: DicePolicyState,
  userId: string,
): boolean {
  if (state.tablePolicy === 'full_in_person') return false;
  if (state.tablePolicy === 'full_digital') return state.clientLocalPrefDigital;
  return state.playerOverrides[userId] ?? state.clientLocalPrefDigital;
}

/** Factory: creates a mutable policy state object with sensible defaults. */
export function createPolicyState(
  overrides?: Partial<DicePolicyState>,
): DicePolicyState {
  return {
    tablePolicy: 'full_digital',
    playerOverrides: {},
    clientLocalPrefDigital: true,
    ...overrides,
  };
}
