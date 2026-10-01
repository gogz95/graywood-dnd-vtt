// frontend/src/lib/services/combatEngine.ts
// 5e SRD Combat Engine: Damage Affinity Multipliers, Automated Concentration Triggers, and Effect Timers

export type DamageAffinity = 'immunity' | 'resistance' | 'vulnerability' | 'none';

export interface CreatureDamageAffinities {
  immunities?: string[];
  resistances?: string[];
  vulnerabilities?: string[];
}

export interface DamageEntry {
  type: string;
  amount: number;
}

export interface ResolvedDamageEntry {
  type: string;
  raw: number;
  applied: number;
  affinity: DamageAffinity;
  multiplier: number;
}

export interface DamageResolutionResult {
  totalRawDamage: number;
  totalAppliedDamage: number;
  entries: ResolvedDamageEntry[];
}

/**
 * Returns the 5e SRD mathematical affinity multiplier:
 * - Immunity: 0.0x
 * - Resistance: 0.5x
 * - Vulnerability: 2.0x
 * - None: 1.0x
 */
export function getAffinityMultiplier(affinity: DamageAffinity): number {
  switch (affinity) {
    case 'immunity':
      return 0.0;
    case 'resistance':
      return 0.5;
    case 'vulnerability':
      return 2.0;
    case 'none':
    default:
      return 1.0;
  }
}

/**
 * Evaluates creature affinity for a given damage type string.
 */
export function evaluateCreatureAffinity(
  damageType: string,
  affinities?: CreatureDamageAffinities
): DamageAffinity {
  if (!affinities) return 'none';

  const normalized = damageType.toLowerCase().trim();

  if (affinities.immunities?.some((imm) => imm.toLowerCase().trim() === normalized)) {
    return 'immunity';
  }
  if (affinities.resistances?.some((res) => res.toLowerCase().trim() === normalized)) {
    return 'resistance';
  }
  if (affinities.vulnerabilities?.some((vuln) => vuln.toLowerCase().trim() === normalized)) {
    return 'vulnerability';
  }

  return 'none';
}

/**
 * Calculates applied damage for a single damage value and affinity:
 * AppliedDamage = floor(RawDamage * Multiplier)
 */
export function calculateAppliedDamage(rawDamage: number, affinity: DamageAffinity): number {
  const mult = getAffinityMultiplier(affinity);
  return Math.floor(rawDamage * mult);
}

/**
 * Resolves an array of damage entries against a target's damage affinities.
 */
export function resolveDamageMatrix(
  damageEntries: DamageEntry[],
  targetAffinities?: CreatureDamageAffinities
): DamageResolutionResult {
  let totalRaw = 0;
  let totalApplied = 0;
  const entries: ResolvedDamageEntry[] = [];

  for (const entry of damageEntries) {
    totalRaw += entry.amount;
    const affinity = evaluateCreatureAffinity(entry.type, targetAffinities);
    const multiplier = getAffinityMultiplier(affinity);
    const applied = Math.floor(entry.amount * multiplier);
    totalApplied += applied;

    entries.push({
      type: entry.type,
      raw: entry.amount,
      applied,
      affinity,
      multiplier,
    });
  }

  return {
    totalRawDamage: totalRaw,
    totalAppliedDamage: totalApplied,
    entries,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// CONCENTRATION ENGINE (5e SRD 5.1)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Computes official 5e SRD Concentration DC:
 * DC = max(10, floor(damageTaken / 2))
 */
export function calculateConcentrationDc(damageTaken: number): number {
  return Math.max(10, Math.floor(damageTaken / 2));
}

export interface ConcentrationCheckPrompt {
  required: boolean;
  actorId: string;
  actorName: string;
  dc: number;
  damageTaken: number;
  formula: string;
}

/**
 * Determines whether a concentration check is required when taking damage.
 */
export function evaluateConcentrationTrigger(
  actor: { id: string; name: string; conditions?: string[] },
  damageTaken: number
): ConcentrationCheckPrompt | null {
  if (damageTaken <= 0) return null;

  const isConcentrating = actor.conditions?.some(
    (c) => c.toLowerCase().trim() === 'concentrating'
  );

  if (!isConcentrating) return null;

  const dc = calculateConcentrationDc(damageTaken);
  return {
    required: true,
    actorId: actor.id,
    actorName: actor.name,
    dc,
    damageTaken,
    formula: `DC ${dc} CON Save (max(10, floor(${damageTaken} / 2)))`,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// ACTIVE EFFECT & SPELL DURATION TURN CYCLE ENGINE
// ═════════════════════════════════════════════════════════════════════════════

export interface ActiveSpellBuff {
  id: string;
  name: string;
  casterId?: string;
  targetId?: string;
  durationRounds: number; // Decremented each turn/round cycle
  conditionTag?: string; // Associated condition (e.g. 'Blessed', 'Invisible', 'Bane')
}

export interface TurnCycleResult {
  remainingBuffs: ActiveSpellBuff[];
  expiredBuffs: ActiveSpellBuff[];
  updatedConditions: string[];
}

/**
 * Advances active spell and buff durations on a combat turn cycle.
 * Automatically decrements durationRounds, removes expired buffs, and purges expired condition tags.
 */
export function advanceTurnBuffDurations(
  currentBuffs: ActiveSpellBuff[],
  targetConditions: string[]
): TurnCycleResult {
  const remainingBuffs: ActiveSpellBuff[] = [];
  const expiredBuffs: ActiveSpellBuff[] = [];
  const expiredTags = new Set<string>();

  for (const buff of currentBuffs) {
    const nextDuration = buff.durationRounds - 1;
    if (nextDuration <= 0) {
      expiredBuffs.push(buff);
      if (buff.conditionTag) {
        expiredTags.add(buff.conditionTag.toLowerCase());
      }
    } else {
      remainingBuffs.push({ ...buff, durationRounds: nextDuration });
    }
  }

  // Remove expired condition tags from actor's active conditions
  const updatedConditions = targetConditions.filter(
    (cond) => !expiredTags.has(cond.toLowerCase().trim())
  );

  return {
    remainingBuffs,
    expiredBuffs,
    updatedConditions,
  };
}
