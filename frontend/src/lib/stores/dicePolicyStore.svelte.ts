// frontend/src/lib/stores/dicePolicyStore.svelte.ts
// Tri-mode dice policy store using Svelte 5 Runes.
// For headless (Vitest) testing import dicePolicyStore.logic.ts directly.

import type { TableDicePolicy } from '$lib/dice/types';

// ── Rune-backed state ────────────────────────────────────────────────────────
let tablePolicy = $state<TableDicePolicy>('full_digital');
let playerOverrides = $state<Record<string, boolean>>({});
let clientLocalPrefDigital = $state<boolean>(true);

// ── Derived: tri-mode boolean hierarchy ─────────────────────────────────────
function isDigitalDiceEnabled(userId: string): boolean {
  if (tablePolicy === 'full_in_person') return false;
  if (tablePolicy === 'full_digital') return clientLocalPrefDigital;
  return playerOverrides[userId] ?? clientLocalPrefDigital;
}

export const dicePolicyStore = {
  get tablePolicy() { return tablePolicy; },
  get playerOverrides() { return playerOverrides; },
  get clientLocalPrefDigital() { return clientLocalPrefDigital; },

  setTablePolicy(p: TableDicePolicy) { tablePolicy = p; },
  setPlayerOverride(userId: string, enabled: boolean) { playerOverrides[userId] = enabled; },
  removePlayerOverride(userId: string) { delete playerOverrides[userId]; },
  setClientLocalPref(digital: boolean) { clientLocalPrefDigital = digital; },

  isDigitalDiceEnabled,
};
