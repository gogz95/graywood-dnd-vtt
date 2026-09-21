// src/lib/services/combatResolution.ts
// Tactical Combat Resolution: Attack vs. AC, Target Damage Application & Concentration Checks (Requirements 10, 12, 13)

import { canvasStore, type CanvasToken } from '../../stores/canvasStore.svelte';
import { targetingStore } from '../stores/targetingStore.svelte';
import { chatStore } from '../stores/chatStore.svelte';
import { automationSettings } from '../stores/automationSettings.svelte';
import { physicalDiceService, promptManualRoll } from './physicalDiceService.svelte';
import { audioEngine } from '../audio/AudioEngine';
import { calculateCover, type CoverResult } from '../mechanics/coverCalculator';

export interface AttackResolutionResult {
  isTargeted: boolean;
  targetId?: string;
  targetName?: string;
  targetAc?: number;
  isHit?: boolean;
  isCrit?: boolean;
  summaryText: string;
  badgeClass: string;
}

/**
 * Compares an attack roll against the currently targeted token's AC.
 */
export function resolveAttackAgainstTarget(
  totalAttackRoll: number,
  isNatural20: boolean = false,
  attackerId?: string
): AttackResolutionResult {
  const targetId = targetingStore.activeTargetTokenId;
  if (!targetId) {
    return {
      isTargeted: false,
      summaryText: '',
      badgeClass: '',
    };
  }

  const token = canvasStore.tokens.find(t => t.id === targetId);
  const baseAc = token?.ac || 10;
  const targetName = token?.name || 'Target';

  // Calculate Ray-cast Cover against attacker
  const attackerTokenId = attackerId || canvasStore.activeTokenId;
  const attacker = attackerTokenId ? canvasStore.tokens.find(t => t.id === attackerTokenId) : undefined;

  let coverResult: CoverResult | null = null;
  if (attacker && token) {
    const wallsAsMapWalls = canvasStore.walls.map((w, idx) => ({
      id: `w-${idx}`,
      p1: { x: (w as any).p1?.x ?? (w as any).x1 ?? 0, y: (w as any).p1?.y ?? (w as any).y1 ?? 0 },
      p2: { x: (w as any).p2?.x ?? (w as any).x2 ?? 0, y: (w as any).p2?.y ?? (w as any).y2 ?? 0 },
      type: 'wall' as const,
    }));
    coverResult = calculateCover(attacker, token, wallsAsMapWalls, canvasStore.tokens, canvasStore.gridSize);
  }

  if (coverResult && !coverResult.canTarget) {
    return {
      isTargeted: true,
      targetId,
      targetName,
      targetAc: baseAc + coverResult.acBonus,
      isHit: false,
      isCrit: false,
      summaryText: `🛡️ Attack Blocked! Target has Total Cover.`,
      badgeClass: 'bg-slate-900 text-slate-400 border border-slate-700',
    };
  }

  const effectiveAc = baseAc + (coverResult?.acBonus || 0);
  const coverLabel = coverResult && coverResult.coverType !== 'none' ? ` [${coverResult.description}]` : '';

  if (isNatural20) {
    return {
      isTargeted: true,
      targetId,
      targetName,
      targetAc: effectiveAc,
      isHit: true,
      isCrit: true,
      summaryText: `⭐ CRITICAL HIT! (${totalAttackRoll} vs AC ${effectiveAc}${coverLabel})`,
      badgeClass: 'bg-amber-500 text-slate-950 font-black',
    };
  }

  const isHit = totalAttackRoll >= effectiveAc;
  return {
    isTargeted: true,
    targetId,
    targetName,
    targetAc: effectiveAc,
    isHit,
    isCrit: false,
    summaryText: isHit
      ? `🎯 Hit! (${totalAttackRoll} vs AC ${effectiveAc}${coverLabel})`
      : `🛡️ Miss! (${totalAttackRoll} vs AC ${effectiveAc}${coverLabel})`,
    badgeClass: isHit
      ? 'bg-emerald-900/80 text-emerald-200 border border-emerald-500/50'
      : 'bg-rose-950/80 text-rose-300 border border-rose-800/50',
  };
}

/**
 * Applies damage to a token, depleting temporary HP first before decreasing primary HP.
 * Prevents HP from dropping below 0 and automatically checks Concentration if applicable.
 */
export async function applyDamageToToken(
  tokenId: string,
  damageAmount: number
): Promise<{
  previousHp: number;
  nextHp: number;
  tempHpDepleted: number;
  concentrationBroken: boolean;
}> {
  const token = canvasStore.tokens.find(t => t.id === tokenId);
  if (!token) {
    throw new Error(`Token with ID ${tokenId} not found.`);
  }

  const damage = Math.max(0, Math.floor(damageAmount));
  const previousHp = token.hp;
  const currentTempHp = token.tempHp || 0;

  let tempHpDepleted = 0;
  let remainingDamage = damage;

  if (currentTempHp > 0) {
    tempHpDepleted = Math.min(currentTempHp, damage);
    remainingDamage = damage - tempHpDepleted;
  }

  const nextTempHp = Math.max(0, currentTempHp - tempHpDepleted);
  const nextHp = Math.max(0, previousHp - remainingDamage);

  let nextConditions = [...token.conditions];
  let concentrationBroken = false;

  // 1. Concentration Check Check
  if (token.conditions.includes('Concentrating') && damage > 0) {
    const dc = Math.max(10, Math.floor(damage / 2));
    if (automationSettings.shouldAutoRoll('autoRollConcentration')) {
      const conMod = 2; // Standard default CON bonus
      const d20 = Math.floor(Math.random() * 20) + 1;
      const totalSave = d20 + conMod;
      const passed = totalSave >= dc;

      chatStore.roll(`1d20+${conMod}`, {
        label: `${token.name}: Concentration Save (DC ${dc})`,
        actorName: token.name,
        actionType: 'save',
        explicitTerms: [
          { label: '1d20', value: d20 },
          { label: 'CON Mod', value: conMod },
        ],
      });

      if (!passed) {
        concentrationBroken = true;
        nextConditions = nextConditions.filter(c => c !== 'Concentrating');
        chatStore.sendMessage(`⚡ **${token.name}** lost Concentration (Rolled ${totalSave} vs DC ${dc})!`, 'System');
      }
    } else {
      try {
        const manualSave = await physicalDiceService.promptManualRoll({
          title: 'Concentration Saving Throw',
          formula: '1d20 + CON',
          dc,
          actorName: token.name,
          actionType: 'save',
        });
        if (manualSave < dc) {
          concentrationBroken = true;
          nextConditions = nextConditions.filter(c => c !== 'Concentrating');
          chatStore.sendMessage(`⚡ **${token.name}** lost Concentration (Rolled ${manualSave} vs DC ${dc})!`, 'System');
        }
      } catch {
        // User cancelled prompt
      }
    }
  }

  // 2. Dying / 0 HP State
  if (nextHp === 0 && previousHp > 0) {
    if (!nextConditions.includes('Dying (0 HP)')) {
      nextConditions.push('Dying (0 HP)');
    }
    if (!nextConditions.includes('Unconscious')) {
      nextConditions.push('Unconscious');
    }
    audioEngine.triggerSfx('sfx-player-down');
    chatStore.sendMessage(`💀 **${token.name}** has fallen to 0 HP and is now **Dying**!`, 'System');
  }

  // 3. Update Canvas Token
  canvasStore.updateToken(token.id, {
    hp: nextHp,
    tempHp: nextTempHp,
    conditions: nextConditions,
  });

  // 4. Update Party Roster persistence if PC
  if (typeof localStorage !== 'undefined') {
    try {
      const rawRoster = localStorage.getItem('vtt_party_roster');
      if (rawRoster) {
        const roster = JSON.parse(rawRoster);
        const updatedRoster = roster.map((m: any) =>
          m.id === token.id || m.name.toLowerCase() === token.name.toLowerCase()
            ? { ...m, hpCurrent: nextHp, tempHp: nextTempHp, conditions: nextConditions }
            : m
        );
        localStorage.setItem('vtt_party_roster', JSON.stringify(updatedRoster));
        window.dispatchEvent(new CustomEvent('vtt:roster-updated'));
      }
    } catch {
      // ignore
    }

    // 5. Update Encounter Dashboard state if combat active
    try {
      const rawEnc = localStorage.getItem('vtt_encounters');
      if (rawEnc) {
        const encData = JSON.parse(rawEnc);
        for (const encId of Object.keys(encData)) {
          if (encData[encId]?.combatants) {
            encData[encId].combatants = encData[encId].combatants.map((c: any) =>
              c.id === token.id || c.name.toLowerCase() === token.name.toLowerCase()
                ? { ...c, hp_current: nextHp, conditions: nextConditions }
                : c
            );
          }
        }
        localStorage.setItem('vtt_encounters', JSON.stringify(encData));
      }
    } catch {
      // ignore
    }
  }

  audioEngine.triggerSfx('sfx-sword');
  return { previousHp, nextHp, tempHpDepleted, concentrationBroken };
}
