// aleamosRules.test.ts — Unit tests for Aleamos Table Mechanics & Rules Automation
// Tests: Tri-Stat Initiative, 0-HP Anti-Heal-Scumming Exhaustion, RP Durability & Sunder, QR Code Generation.

import {
  calculateTriStatInitiative,
  applyHpMutationWithExhaustionCheck,
  calculateEquipmentDurability,
  EXHAUSTION_PENALTIES,
} from '../../stores/sessionStore';
import { generateQrCodeSvg } from '../utils/qrcode';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`Assertion Failed: ${message} (expected ${String(expected)}, got ${String(actual)})`);
  }
}

export function runAleamosRulesTests(): void {
  console.log('--- Running Aleamos Core Rules Test Suite ---');

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. TRI-STAT INITIATIVE ENGINE
  // Formula: max(DEX_modifier, INT_modifier, WIS_modifier)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    // Case 1A: DEX dominant (DEX 18 -> +4, INT 12 -> +1, WIS 14 -> +2)
    const res1 = calculateTriStatInitiative({ dex: 18, int: 12, wis: 14 });
    assertEqual(res1.bonus, 4, 'Tri-Stat Initiative: DEX 18 should yield +4');
    assertEqual(res1.bestStat, 'DEX', 'Tri-Stat Initiative: bestStat should be DEX');
    assertEqual(res1.label, '+4 (DEX)', 'Tri-Stat Initiative: label should be "+4 (DEX)"');

    // Case 1B: INT dominant (Wizard with DEX 10 -> +0, INT 20 -> +5, WIS 12 -> +1)
    const res2 = calculateTriStatInitiative({ dex: 10, int: 20, wis: 12 });
    assertEqual(res2.bonus, 5, 'Tri-Stat Initiative: INT 20 should yield +5');
    assertEqual(res2.bestStat, 'INT', 'Tri-Stat Initiative: bestStat should be INT');
    assertEqual(res2.label, '+5 (INT)', 'Tri-Stat Initiative: label should be "+5 (INT)"');

    // Case 1C: WIS dominant (Cleric with DEX 14 -> +2, INT 10 -> +0, WIS 18 -> +4)
    const res3 = calculateTriStatInitiative({ dex: 14, int: 10, wis: 18 });
    assertEqual(res3.bonus, 4, 'Tri-Stat Initiative: WIS 18 should yield +4');
    assertEqual(res3.bestStat, 'WIS', 'Tri-Stat Initiative: bestStat should be WIS');
    assertEqual(res3.label, '+4 (WIS)', 'Tri-Stat Initiative: label should be "+4 (WIS)"');

    // Case 1D: Negative / Zero modifiers (DEX 8 -> -1, INT 8 -> -1, WIS 8 -> -1)
    const res4 = calculateTriStatInitiative({ dex: 8, int: 8, wis: 8 });
    assertEqual(res4.bonus, -1, 'Tri-Stat Initiative: all 8s should yield -1');
    assertEqual(res4.label, '-1 (DEX)', 'Tri-Stat Initiative: label should be "-1 (DEX)"');
    console.log('  ✔ Tri-Stat Initiative tests passed');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. 0-HP EXHAUSTION TRIGGER ("ANTI-HEAL-SCUMMING")
  // ═══════════════════════════════════════════════════════════════════════════
  {
    // Case 2A: Falling from 15 HP to 0 HP triggers Exhaustion level 1
    const drop1 = applyHpMutationWithExhaustionCheck(15, -20, 30, 0);
    assertEqual(drop1.nextHp, 0, 'HP should clamp to 0');
    assertEqual(drop1.nextExhaustion, 1, 'Exhaustion should increment to 1');
    assertEqual(drop1.exhaustionTriggered, true, 'exhaustionTriggered should be true');

    // Case 2B: Taking damage while already at 0 HP does NOT trigger additional exhaustion
    const drop2 = applyHpMutationWithExhaustionCheck(0, -5, 30, 1);
    assertEqual(drop2.nextHp, 0, 'HP remains at 0');
    assertEqual(drop2.nextExhaustion, 1, 'Exhaustion should stay at 1 while already downed');
    assertEqual(drop2.exhaustionTriggered, false, 'exhaustionTriggered should be false');

    // Case 2C: Healing from 0 HP to 5 HP does NOT increment exhaustion
    const heal1 = applyHpMutationWithExhaustionCheck(0, 5, 30, 1);
    assertEqual(heal1.nextHp, 5, 'HP increases to 5');
    assertEqual(heal1.nextExhaustion, 1, 'Exhaustion stays at 1 upon revival');
    assertEqual(heal1.exhaustionTriggered, false, 'exhaustionTriggered should be false on heal');

    // Case 2D: Second downing (Anti-Heal-Scumming active): 5 HP drops back to 0 -> Exhaustion level 2
    const drop3 = applyHpMutationWithExhaustionCheck(5, -10, 30, 1);
    assertEqual(drop3.nextHp, 0, 'HP drops to 0');
    assertEqual(drop3.nextExhaustion, 2, 'Exhaustion increments to 2 on second downing');
    assertEqual(drop3.exhaustionTriggered, true, 'exhaustionTriggered should be true on second downing');

    // Case 2E: Cap at level 6 (Death)
    const dropCap = applyHpMutationWithExhaustionCheck(1, -10, 30, 6);
    assertEqual(dropCap.nextExhaustion, 6, 'Exhaustion cannot exceed level 6');

    // Verify Exhaustion Penalties Dictionary
    assert(EXHAUSTION_PENALTIES[1].includes('Disadvantage on ability checks'), 'Exhaustion 1 description');
    assert(EXHAUSTION_PENALTIES[2].includes('Speed halved'), 'Exhaustion 2 description');
    assert(EXHAUSTION_PENALTIES[6].includes('Death'), 'Exhaustion 6 description');
    console.log('  ✔ 0-HP Anti-Heal-Scumming Exhaustion tests passed');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. EQUIPMENT RESISTANCE POINTS (RP) & SUNDER TRACKER
  // ═══════════════════════════════════════════════════════════════════════════
  {
    // Case 3A: Pristine equipment (5/5 RP)
    const weaponPristine = calculateEquipmentDurability({ currentRp: 5, maxRp: 5 });
    assertEqual(weaponPristine.isBroken, false, 'Pristine item should not be broken');
    assertEqual(weaponPristine.effectivePenalty, 0, 'Pristine item should have 0 penalty');
    assertEqual(weaponPristine.percent, 100, 'Pristine item should have 100% durability');
    assertEqual(weaponPristine.statusLabel, 'Pristine', 'Status should be Pristine');

    // Case 3B: Worn equipment (1/5 RP = 20%)
    const armorWorn = calculateEquipmentDurability({ current_rp: 1, max_rp: 5 });
    assertEqual(armorWorn.isBroken, false, 'Worn item (1 RP) is not broken');
    assertEqual(armorWorn.effectivePenalty, 0, 'Worn item has 0 penalty');
    assertEqual(armorWorn.percent, 20, 'Worn item has 20% durability');
    assertEqual(armorWorn.statusLabel, 'Worn', 'Status should be Worn');

    // Case 3C: Sundered / Fractured equipment (0/5 RP)
    const weaponBroken = calculateEquipmentDurability({ currentRp: 0, maxRp: 5 });
    assertEqual(weaponBroken.isBroken, true, '0 RP item must be broken');
    assertEqual(weaponBroken.effectivePenalty, -1, '0 RP item must incur -1 penalty');
    assertEqual(weaponBroken.percent, 0, '0 RP item has 0% durability');
    assert(weaponBroken.statusLabel.includes('Fractured (-1 Penalty)'), 'Status should denote Fractured with penalty');

    // Case 3D: Negative RP clamped to 0
    const overDamaged = calculateEquipmentDurability({ current_rp: -3, max_rp: 5 });
    assertEqual(overDamaged.isBroken, true, 'Negative RP item must be broken');
    assertEqual(overDamaged.effectivePenalty, -1, 'Negative RP item penalty is -1');
    assertEqual(overDamaged.percent, 0, 'Negative RP clamped to 0%');
    console.log('  ✔ Equipment Durability & Sunder tests passed');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. OFFLINE PURE-TYPESCRIPT QR CODE GENERATOR
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const url = 'http://192.168.1.150:5173/play?pin=8492';
    const svg = generateQrCodeSvg(url, 200);

    assert(typeof svg === 'string', 'QR Code output must be string');
    assert(svg.startsWith('<svg'), 'QR Code must be valid SVG starting with <svg');
    assert(svg.endsWith('</svg>'), 'QR Code must end with </svg>');
    assert(svg.includes('viewBox="0 0 200 200"'), 'QR Code must match requested viewBox dimension');
    assert(svg.includes('<rect'), 'QR Code SVG must contain renderable rect elements');
    console.log('  ✔ Pure TypeScript QR Code generator tests passed');
  }

  console.log('All Aleamos rules & systems tests passed successfully! 🎉');
}

import { describe, it } from 'vitest';

describe('Aleamos Core Rules & Systems', () => {
  it('passes all tri-stat, HP, durability, and QR code tests', () => {
    runAleamosRulesTests();
  });
});
