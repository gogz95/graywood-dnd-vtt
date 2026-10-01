// frontend/src/lib/services/auraEngine.ts
// 5e Token Aura Interaction Engine: Paladin Protection, Spirit Guardians & Movement Penalties

import type { TokenAuraConfig } from '../canvas/vfx/TokenAuraLayer';

export interface EvaluatedToken {
  id: string;
  name: string;
  x: number; // grid col
  y: number; // grid row
  isPlayer: boolean;
  sizeInCells?: number;
}

export interface AuraEvaluationResult {
  activeSaveBonus: number;
  movementMultiplier: number;
  triggeredHostileAuras: Array<{
    auraId: string;
    auraName: string;
    emitterId: string;
    emitterName: string;
    damageFormula?: string;
    movementPenaltyMultiplier?: number;
  }>;
  appliedBeneficialAuras: Array<{
    auraId: string;
    auraName: string;
    emitterId: string;
    emitterName: string;
    bonus: number;
  }>;
}

/**
 * Evaluates all aura interactions for a moving token against active aura emitters on the board.
 */
export function evaluateTokenAuraInteractions(
  movingToken: EvaluatedToken,
  allTokens: EvaluatedToken[],
  activeAuras: TokenAuraConfig[],
  feetPerGridCell: number = 5.0
): AuraEvaluationResult {
  let totalSaveBonus = 0;
  let movementMultiplier = 1.0;
  const triggeredHostile: AuraEvaluationResult['triggeredHostileAuras'] = [];
  const appliedBeneficial: AuraEvaluationResult['appliedBeneficialAuras'] = [];

  const movingCenterX = movingToken.x + (movingToken.sizeInCells || 1) / 2;
  const movingCenterY = movingToken.y + (movingToken.sizeInCells || 1) / 2;

  for (const aura of activeAuras) {
    const emitter = allTokens.find((t) => t.id === aura.tokenId);
    if (!emitter) continue;

    // Self check: token is inside its own aura
    const isSelf = emitter.id === movingToken.id;
    const isAlly = isSelf || emitter.isPlayer === movingToken.isPlayer;

    const emitterCenterX = emitter.x + (emitter.sizeInCells || 1) / 2;
    const emitterCenterY = emitter.y + (emitter.sizeInCells || 1) / 2;

    const distanceCells = Math.hypot(movingCenterX - emitterCenterX, movingCenterY - emitterCenterY);
    const distanceFeet = distanceCells * feetPerGridCell;

    if (distanceFeet <= aura.radiusFeet + 0.1) {
      if (isAlly && aura.isBeneficialToAllies) {
        const bonus = aura.saveBonus || 0;
        totalSaveBonus = Math.max(totalSaveBonus, bonus);
        appliedBeneficial.push({
          auraId: aura.id,
          auraName: aura.name,
          emitterId: emitter.id,
          emitterName: emitter.name,
          bonus,
        });
      } else if (!isAlly && aura.isHostileToEnemies) {
        // Enemy in Spirit Guardians or hostile ward
        const penalty = aura.movementPenaltyMultiplier ?? 0.5;
        movementMultiplier = Math.min(movementMultiplier, penalty);

        triggeredHostile.push({
          auraId: aura.id,
          auraName: aura.name,
          emitterId: emitter.id,
          emitterName: emitter.name,
          damageFormula: aura.damageFormula,
          movementPenaltyMultiplier: penalty,
        });
      }
    }
  }

  return {
    activeSaveBonus: totalSaveBonus,
    movementMultiplier,
    triggeredHostileAuras: triggeredHostile,
    appliedBeneficialAuras: appliedBeneficial,
  };
}
