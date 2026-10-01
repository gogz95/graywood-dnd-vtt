// frontend/src/lib/services/combatLoopEngine.ts
// 5e Combat Loop Automations: Initiative Sieve, Lair Count 20, Legendary Action Economy & Flanking Geometry

export interface CombatLoopEntity {
  id: string;
  tokenId: string;
  name: string;
  initiative: number;
  dexMod: number;
  bonus?: number;
  isBoss?: boolean;
  hasLairActions?: boolean;
  legendaryActionsMax?: number;
  legendaryActionsRemaining?: number;
  isLairEntry?: boolean;
}

export interface FlankingResult {
  isFlanking: boolean;
  angleDegrees: number;
  allyId?: string;
  allyName?: string;
  reason: string;
}

/**
 * Rolls automated initiative for all unassigned tokens:
 * Initiative = 1d20 + DEX mod + Bonus
 * Automatically injects a Lair Action slot fixed at count 20 (losing all ties) if a boss with lair actions is present.
 */
export function rollAutomatedInitiative(
  entities: CombatLoopEntity[],
  forceRoll: boolean = false
): CombatLoopEntity[] {
  let hasLair = false;
  const rolled: CombatLoopEntity[] = [];

  for (const ent of entities) {
    if (ent.isLairEntry) continue; // Will be re-evaluated
    if (ent.hasLairActions) hasLair = true;

    let init = ent.initiative;
    if (forceRoll || init === 0) {
      const d20 = Math.floor(Math.random() * 20) + 1;
      init = d20 + ent.dexMod + (ent.bonus ?? 0);
    }

    const bossMax = ent.isBoss ? (ent.legendaryActionsMax ?? 3) : 0;
    rolled.push({
      ...ent,
      initiative: init,
      legendaryActionsMax: bossMax,
      legendaryActionsRemaining: bossMax,
    });
  }

  // Sort descending by initiative, ties broken by DEX mod
  rolled.sort((a, b) => {
    if (b.initiative !== a.initiative) {
      return b.initiative - a.initiative;
    }
    return b.dexMod - a.dexMod;
  });

  // Inject Lair Action slot at initiative count 20 (loses all ties per 5e rules)
  if (hasLair) {
    // Find index of first entity whose initiative is less than 20
    let insertIdx = rolled.findIndex((e) => e.initiative < 20);
    if (insertIdx === -1) {
      insertIdx = rolled.length; // All entities rolled >= 20
    }

    const lairSlot: CombatLoopEntity = {
      id: `lair_action_${Date.now()}`,
      tokenId: 'lair',
      name: '⚡ Lair Action',
      initiative: 20,
      dexMod: -99, // Guarantees losing ties
      isLairEntry: true,
    };

    rolled.splice(insertIdx, 0, lairSlot);
  }

  return rolled;
}

/**
 * Resets a boss entity's Legendary Actions to maximum at the start of their turn.
 */
export function resetBossLegendaryActions(boss: CombatLoopEntity): CombatLoopEntity {
  const max = boss.legendaryActionsMax ?? 3;
  return {
    ...boss,
    legendaryActionsRemaining: max,
  };
}

/**
 * Evaluates whether any Boss has an opportunity to take a Legendary Action.
 * Per 5e SRD rules: A legendary creature can take legendary actions only at the end of another creature's turn.
 */
export function checkLegendaryActionOpportunity(
  completedTurnEntityId: string,
  allCombatants: CombatLoopEntity[]
): { canAct: boolean; eligibleBosses: CombatLoopEntity[]; promptText?: string } {
  const eligibleBosses = allCombatants.filter(
    (c) =>
      c.isBoss &&
      c.id !== completedTurnEntityId &&
      (c.legendaryActionsRemaining ?? 0) > 0
  );

  if (eligibleBosses.length === 0) {
    return { canAct: false, eligibleBosses: [] };
  }

  const bossNames = eligibleBosses.map((b) => `${b.name} (${b.legendaryActionsRemaining} pts left)`).join(', ');
  return {
    canAct: true,
    eligibleBosses,
    promptText: `Legendary Action Window: ${bossNames} may spend Legendary Action points now.`,
  };
}

/**
 * Detects 5e DMG Flanking geometry:
 * For Attacker (A1), Target (T), and Ally (A2):
 * Computes angle θ = ∠(A1, T, A2).
 * If 135° <= θ <= 225° and both A1 and A2 are within 5ft melee reach of T,
 * grants Advantage (Flanking).
 */
export function checkFlankingAdvantage(
  attacker: { id: string; name: string; x: number; y: number },
  target: { id: string; name: string; x: number; y: number },
  allies: Array<{ id: string; name: string; x: number; y: number; isEnemy?: boolean; isConscious?: boolean }>,
  meleeReachCells: number = 1.5 // 5ft orthogonal (1.0) or diagonal (~1.414)
): FlankingResult {
  const v1x = attacker.x - target.x;
  const v1y = attacker.y - target.y;
  const distAttacker = Math.hypot(v1x, v1y);

  if (distAttacker > meleeReachCells) {
    return {
      isFlanking: false,
      angleDegrees: 0,
      reason: 'Attacker is not within 5ft melee reach of target',
    };
  }

  for (const ally of allies) {
    if (ally.id === attacker.id) continue;
    if (ally.isEnemy === true) continue;
    if (ally.isConscious === false) continue;

    const v2x = ally.x - target.x;
    const v2y = ally.y - target.y;
    const distAlly = Math.hypot(v2x, v2y);

    if (distAlly > meleeReachCells) continue;

    // Dot product: v1 · v2
    const dot = v1x * v2x + v1y * v2y;
    const mag1 = Math.hypot(v1x, v1y);
    const mag2 = Math.hypot(v2x, v2y);

    if (mag1 === 0 || mag2 === 0) continue;

    // Angle theta in radians and degrees
    const cosTheta = Math.max(-1.0, Math.min(1.0, dot / (mag1 * mag2)));
    const angleRad = Math.acos(cosTheta);
    const angleDeg = (angleRad * 180) / Math.PI;

    // DMG Rule: Flanking angle must be at least 135° across the target
    if (angleDeg >= 135.0 && angleDeg <= 225.0) {
      return {
        isFlanking: true,
        angleDegrees: Math.round(angleDeg),
        allyId: ally.id,
        allyName: ally.name,
        reason: `Flanking Advantage: Allied with ${ally.name} at opposite angle (${Math.round(angleDeg)}°)`,
      };
    }
  }

  return {
    isFlanking: false,
    angleDegrees: 0,
    reason: 'No qualifying ally in flanking position (135°–225° opposite)',
  };
}
