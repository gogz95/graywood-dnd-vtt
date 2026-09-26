// frontend/src/lib/dice/types.ts
// Unified Roll Data Contract. No runtime code — types only.

export type RollSource = 'digital' | 'manual';
export type RollVisibility = 'public' | 'gm' | 'blind' | 'self';
export type TableDicePolicy = 'full_digital' | 'selective' | 'full_in_person';

export interface RollModifier {
  label: string;
  value: number;
}

export interface DieResult {
  sides: number;
  value: number;
  discarded?: boolean;
}

export interface RollResult {
  id: string;
  timestamp: number;
  rollerId: string;
  rollerName: string;
  source: RollSource;
  visibility: RollVisibility;
  purpose: string;
  formula: string;
  dice: DieResult[];
  modifiers: RollModifier[];
  situationalDeltas: RollModifier[];
  baseTotal: number;
  finalTotal: number;
}
