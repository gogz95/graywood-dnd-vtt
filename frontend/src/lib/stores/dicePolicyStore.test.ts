// frontend/src/lib/stores/dicePolicyStore.test.ts
// Vitest suite — tri-mode dice policy branches (imports pure logic, no Svelte runes).

import { describe, it, expect } from 'vitest';
import { isDigitalDiceEnabled, createPolicyState } from './dicePolicyStore.logic';

const USER = 'player-1';

// ── Branch 1: full_in_person ─────────────────────────────────────────────────
describe('full_in_person policy', () => {
  it('always returns false regardless of clientLocalPref=true', () => {
    const s = createPolicyState({ tablePolicy: 'full_in_person', clientLocalPrefDigital: true });
    expect(isDigitalDiceEnabled(s, USER)).toBe(false);
  });

  it('always returns false when clientLocalPref=false', () => {
    const s = createPolicyState({ tablePolicy: 'full_in_person', clientLocalPrefDigital: false });
    expect(isDigitalDiceEnabled(s, USER)).toBe(false);
  });
});

// ── Branch 2: full_digital ───────────────────────────────────────────────────
describe('full_digital policy', () => {
  it('returns true when clientLocalPrefDigital=true', () => {
    const s = createPolicyState({ tablePolicy: 'full_digital', clientLocalPrefDigital: true });
    expect(isDigitalDiceEnabled(s, USER)).toBe(true);
  });

  it('returns false when clientLocalPrefDigital=false', () => {
    const s = createPolicyState({ tablePolicy: 'full_digital', clientLocalPrefDigital: false });
    expect(isDigitalDiceEnabled(s, USER)).toBe(false);
  });

  it('ignores player-level overrides — clientLocalPref governs', () => {
    const s = createPolicyState({
      tablePolicy: 'full_digital',
      clientLocalPrefDigital: false,
      playerOverrides: { [USER]: true }, // override present but must be ignored
    });
    expect(isDigitalDiceEnabled(s, USER)).toBe(false);
  });
});

// ── Branch 3: selective ───────────────────────────────────────────────────────
describe('selective policy', () => {
  it('uses playerOverride=true even when clientLocalPref=false', () => {
    const s = createPolicyState({
      tablePolicy: 'selective',
      clientLocalPrefDigital: false,
      playerOverrides: { [USER]: true },
    });
    expect(isDigitalDiceEnabled(s, USER)).toBe(true);
  });

  it('uses playerOverride=false even when clientLocalPref=true', () => {
    const s = createPolicyState({
      tablePolicy: 'selective',
      clientLocalPrefDigital: true,
      playerOverrides: { [USER]: false },
    });
    expect(isDigitalDiceEnabled(s, USER)).toBe(false);
  });

  it('falls back to clientLocalPref=true when no override', () => {
    const s = createPolicyState({ tablePolicy: 'selective', clientLocalPrefDigital: true });
    expect(isDigitalDiceEnabled(s, USER)).toBe(true);
  });

  it('falls back to clientLocalPref=false when no override', () => {
    const s = createPolicyState({ tablePolicy: 'selective', clientLocalPrefDigital: false });
    expect(isDigitalDiceEnabled(s, USER)).toBe(false);
  });

  it('different users have independent overrides', () => {
    const s = createPolicyState({
      tablePolicy: 'selective',
      clientLocalPrefDigital: false,
      playerOverrides: { 'player-a': true, 'player-b': false },
    });
    expect(isDigitalDiceEnabled(s, 'player-a')).toBe(true);
    expect(isDigitalDiceEnabled(s, 'player-b')).toBe(false);
    expect(isDigitalDiceEnabled(s, 'player-c')).toBe(false); // fallback
  });
});
