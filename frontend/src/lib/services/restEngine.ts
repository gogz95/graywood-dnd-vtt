// src/lib/services/restEngine.ts
// 5e SRD Short & Long Rest Engine
// Short Rest: Spend Hit Dice (1dHD + CON mod per die) to recover HP.
// Long Rest: Recover all HP to max, clear temp HP, recover max(1, floor(totalHD / 2)) Hit Dice, reset spell slots.
// Dispatches REST_COMPLETED via systemBus to sync /play companions and session logs.

import { systemBus } from './systemBus';
import { chatStore } from '../stores/chatStore.svelte';

export interface RestableCharacter {
  id: string;
  name: string;
  hpCurrent: number;
  hpMax: number;
  tempHp?: number;
  con: number;
  level: number;
  hitDiceCurrent: number;
  hitDiceMax: number;
  hitDieSize?: number; // e.g. 6 (Wizard), 8 (Rogue/Cleric), 10 (Fighter), 12 (Barbarian)
  spellSlots?: Array<{ level: number; total: number; used: number }>;
}

export interface ShortRestResult {
  updatedCharacter: RestableCharacter;
  hpRecovered: number;
  diceSpent: number;
  rollDetails: number[];
  summary: string;
}

export interface LongRestResult {
  updatedCharacter: RestableCharacter;
  hpRecovered: number;
  hitDiceRecovered: number;
  summary: string;
}

/**
 * Executes a 5e Short Rest, spending 1 or more available Hit Dice.
 */
export function executeShortRest(
  char: RestableCharacter,
  diceToSpend: number = 1,
  manualRolls?: number[]
): ShortRestResult {
  const actualDice = Math.max(0, Math.min(diceToSpend, char.hitDiceCurrent));
  if (actualDice === 0) {
    return {
      updatedCharacter: { ...char },
      hpRecovered: 0,
      diceSpent: 0,
      rollDetails: [],
      summary: `${char.name} has no available Hit Dice to spend.`,
    };
  }

  const conMod = Math.floor(((char.con ?? 10) - 10) / 2);
  const dieSize = char.hitDieSize || 8;
  const rollDetails: number[] = [];
  let totalHealing = 0;

  for (let i = 0; i < actualDice; i++) {
    const rawRoll = manualRolls && manualRolls[i] !== undefined
      ? manualRolls[i]
      : Math.floor(Math.random() * dieSize) + 1;

    rollDetails.push(rawRoll);
    const healForDie = Math.max(0, rawRoll + conMod);
    totalHealing += healForDie;
  }

  const prevHp = char.hpCurrent;
  const nextHp = Math.min(char.hpMax, prevHp + totalHealing);
  const hpRecovered = nextHp - prevHp;
  const nextHd = char.hitDiceCurrent - actualDice;

  const updatedCharacter: RestableCharacter = {
    ...char,
    hpCurrent: nextHp,
    hitDiceCurrent: nextHd,
  };

  const summary = `🌿 **${char.name}** completed a Short Rest: spent ${actualDice}d${dieSize} (+${conMod * actualDice} CON), recovering **${hpRecovered} HP** (${nextHp}/${char.hpMax} HP, ${nextHd}/${char.hitDiceMax} HD remaining).`;

  chatStore.sendMessage(summary, 'System');

  systemBus.emit('REST_COMPLETED', {
    characterId: char.id,
    restType: 'short',
    hpRestored: hpRecovered,
    hdSpent: actualDice,
  });

  return {
    updatedCharacter,
    hpRecovered,
    diceSpent: actualDice,
    rollDetails,
    summary,
  };
}

/**
 * Executes a 5e Long Rest, recovering all HP, resetting spell slots, and restoring up to half total Hit Dice.
 */
export function executeLongRest(char: RestableCharacter): LongRestResult {
  const prevHp = char.hpCurrent;
  const hpRecovered = Math.max(0, char.hpMax - prevHp);

  // 5e SRD: Regain spent Hit Dice up to max(1, floor(totalHD / 2))
  const hdRecoveryAllowance = Math.max(1, Math.floor(char.hitDiceMax / 2));
  const currentHd = char.hitDiceCurrent;
  const nextHd = Math.min(char.hitDiceMax, currentHd + hdRecoveryAllowance);
  const hitDiceRecovered = nextHd - currentHd;

  // Reset all spell slots
  const nextSlots = char.spellSlots
    ? char.spellSlots.map((s) => ({ ...s, used: 0 }))
    : [];

  const updatedCharacter: RestableCharacter = {
    ...char,
    hpCurrent: char.hpMax,
    tempHp: 0,
    hitDiceCurrent: nextHd,
    spellSlots: nextSlots,
  };

  const summary = `✨ **${char.name}** completed a Long Rest: restored **${hpRecovered} HP** to max, cleared temporary HP, regained **${hitDiceRecovered} Hit Dice** (${nextHd}/${char.hitDiceMax}), and restored all spell slots.`;

  chatStore.sendMessage(summary, 'System');

  systemBus.emit('REST_COMPLETED', {
    characterId: char.id,
    restType: 'long',
    hpRestored: hpRecovered,
    hdRecovered: hitDiceRecovered,
  });

  return {
    updatedCharacter,
    hpRecovered,
    hitDiceRecovered,
    summary,
  };
}
