// frontend/src/plugins/dnd-beyond/services/ddbNormalizer.ts
// D&D Beyond Schema Normalizer & Host Media Mirror

import type { CoreActor } from '$lib/types/coreModels';
import { uploadAsset } from '$lib/services/assetUpload';
import { dexieDb } from '$lib/db/dexieDb';

const STAT_NAMES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
type StatKey = (typeof STAT_NAMES)[number];

const SKILL_MAP: Record<string, StatKey> = {
  acrobatics: 'dex',
  'animal-handling': 'wis',
  arcana: 'int',
  athletics: 'str',
  deception: 'cha',
  history: 'int',
  insight: 'wis',
  intimidation: 'cha',
  investigation: 'int',
  medicine: 'wis',
  nature: 'int',
  perception: 'wis',
  performance: 'cha',
  persuasion: 'cha',
  religion: 'int',
  'sleight-of-hand': 'dex',
  stealth: 'dex',
  survival: 'wis'
};

/**
 * Fetches remote avatar and uploads it to local Host storage for offline LAN play.
 */
export async function mirrorRemoteAvatar(
  remoteUrl: string,
  characterId: string
): Promise<string> {
  if (!remoteUrl) return '';

  try {
    let response: Response;
    try {
      response = await fetch(remoteUrl);
    } catch {
      // Fallback via local backend proxy if CORS blocked
      response = await fetch(`/api/proxy?url=${encodeURIComponent(remoteUrl)}`);
    }

    if (!response.ok) {
      return remoteUrl;
    }

    const blob = await response.blob();
    const ext = blob.type.includes('webp') ? 'webp' : blob.type.includes('jpeg') ? 'jpg' : 'png';
    const file = new File([blob], `ddb_${characterId}_avatar.${ext}`, {
      type: blob.type || 'image/png'
    });

    const localUrl = await uploadAsset(file, 'tokens');
    return localUrl;
  } catch (err) {
    console.warn('[ddbNormalizer] Media mirror failed, retaining remote URL:', err);
    return remoteUrl;
  }
}

/**
 * Normalizes D&D Beyond character data into canonical CoreActor format.
 */
export async function normalizeDdbCharacter(rawDdb: any): Promise<CoreActor> {
  const char = rawDdb.character || rawDdb.data || rawDdb;
  const characterId = String(char.id || `ddb_${Date.now()}`);

  // 1. Calculate Level & Proficiency Bonus
  const classes = Array.isArray(char.classes) ? char.classes : [];
  const totalLevel = classes.reduce((sum: number, c: any) => sum + (c.level || 1), 0) || 1;
  const profBonus = Math.floor((totalLevel - 1) / 4) + 2;

  // 2. Flatten all modifier lists
  const allModifiers: any[] = [];
  if (char.modifiers && typeof char.modifiers === 'object') {
    for (const key of Object.keys(char.modifiers)) {
      if (Array.isArray(char.modifiers[key])) {
        allModifiers.push(...char.modifiers[key]);
      }
    }
  }

  // 3. Compute final Ability Scores & Modifiers
  const abilityScores: Record<StatKey, number> = {
    str: 10,
    dex: 10,
    con: 10,
    int: 10,
    wis: 10,
    cha: 10
  };

  const abilityModifiers: Record<StatKey, number> = {
    str: 0,
    dex: 0,
    con: 0,
    int: 0,
    wis: 0,
    cha: 0
  };

  const statList = Array.isArray(char.stats) ? char.stats : [];
  const bonusStats = Array.isArray(char.bonusStats) ? char.bonusStats : [];
  const overrideStats = Array.isArray(char.overrideStats) ? char.overrideStats : [];

  for (let i = 0; i < 6; i++) {
    const key = STAT_NAMES[i];
    const statId = i + 1;

    const baseVal = statList.find((s: any) => s.id === statId)?.value ?? 10;
    const bonusVal = bonusStats.find((s: any) => s.id === statId)?.value ?? 0;
    const overrideVal = overrideStats.find((s: any) => s.id === statId)?.value;

    let score = baseVal + bonusVal;

    // Additional bonuses from modifiers
    for (const mod of allModifiers) {
      if (mod.type === 'bonus' && mod.subType === `${key}-score`) {
        score += mod.value || 0;
      }
    }

    // Set overrides (e.g., Gauntlets of Ogre Power)
    for (const mod of allModifiers) {
      if (mod.type === 'set' && mod.subType === `${key}-score`) {
        const setVal = mod.value || 0;
        if (setVal > score) score = setVal;
      }
    }

    if (typeof overrideVal === 'number' && overrideVal > 0) {
      score = overrideVal;
    }

    abilityScores[key] = score;
    abilityModifiers[key] = Math.floor((score - 10) / 2);
  }

  // 4. Hit Points Calculation
  const conMod = abilityModifiers.con;
  const baseHp = char.baseHitPoints || 10 + (totalLevel - 1) * 6;
  const bonusHp = char.bonusHitPoints || 0;
  const hpMax = Math.max(1, baseHp + conMod * totalLevel + bonusHp);
  const removedHp = char.removedHitPoints || 0;
  const hpCurrent = Math.max(0, hpMax - removedHp);
  const hpTemp = char.temporaryHitPoints || 0;

  // 5. Armor Class Calculation
  const dexMod = abilityModifiers.dex;
  let baseAc = 10 + dexMod;
  let hasArmor = false;
  let shieldBonus = 0;

  const inventory = Array.isArray(char.inventory) ? char.inventory : [];
  for (const item of inventory) {
    if (item.equipped && item.definition) {
      const def = item.definition;
      if (def.filterType === 'Armor') {
        const armorType = (def.type || '').toLowerCase();
        const armorAc = def.armorClass || 10;

        if (armorType.includes('shield')) {
          shieldBonus += armorAc || 2;
        } else if (armorType.includes('heavy')) {
          baseAc = armorAc;
          hasArmor = true;
        } else if (armorType.includes('medium')) {
          baseAc = armorAc + Math.min(2, dexMod);
          hasArmor = true;
        } else {
          // Light armor
          baseAc = armorAc + dexMod;
          hasArmor = true;
        }
      }
    }
  }

  // Unarmored Defense (Barbarian: CON, Monk: WIS)
  if (!hasArmor) {
    const classNames = classes.map((c: any) => (c.definition?.name || '').toLowerCase());
    if (classNames.includes('barbarian')) {
      baseAc = Math.max(baseAc, 10 + dexMod + abilityModifiers.con);
    } else if (classNames.includes('monk')) {
      baseAc = Math.max(baseAc, 10 + dexMod + abilityModifiers.wis);
    }
  }

  let acBonus = 0;
  for (const mod of allModifiers) {
    if (mod.type === 'bonus' && (mod.subType === 'armor-class' || mod.subType === 'ac')) {
      acBonus += mod.value || 0;
    }
  }

  const effectiveAc = baseAc + shieldBonus + acBonus;

  // 6. Speed & Initiative
  let speedFt = char.race?.weightSpeeds?.normal?.walk || 30;
  for (const mod of allModifiers) {
    if (mod.type === 'bonus' && (mod.subType === 'speed' || mod.subType === 'unarmored-movement')) {
      speedFt += mod.value || 0;
    }
  }

  let initiativeMod = dexMod;
  for (const mod of allModifiers) {
    if (mod.type === 'bonus' && mod.subType === 'initiative') {
      initiativeMod += mod.value || 0;
    }
  }

  // 7. Normalized Saving Throws
  const savingThrows: Record<StatKey, { modifier: number; proficient: boolean }> = {} as any;
  for (const key of STAT_NAMES) {
    const isProf = allModifiers.some(
      (m) => m.type === 'proficiency' && m.subType === `${key}-saving-throws`
    );
    savingThrows[key] = {
      proficient: isProf,
      modifier: abilityModifiers[key] + (isProf ? profBonus : 0)
    };
  }

  // 8. Normalized Skill Proficiencies
  const skills: Record<string, { modifier: number; proficient: boolean; expertise: boolean }> = {};
  for (const [skillName, attr] of Object.entries(SKILL_MAP)) {
    const isProf = allModifiers.some(
      (m) => m.type === 'proficiency' && m.subType === skillName
    );
    const isExpert = allModifiers.some(
      (m) => m.type === 'expertise' && m.subType === skillName
    );
    const skillBonus = isExpert ? profBonus * 2 : isProf ? profBonus : 0;
    skills[skillName] = {
      proficient: isProf || isExpert,
      expertise: isExpert,
      modifier: abilityModifiers[attr] + skillBonus
    };
  }

  // 9. Normalized Actions & Attack Formulas
  const actions: Array<{ name: string; attackBonus: string; damage: string; type: string }> = [];
  for (const item of inventory) {
    if (item.equipped && item.definition?.filterType === 'Weapon') {
      const def = item.definition;
      const isFinesse = def.properties?.some((p: any) => p.name === 'Finesse');
      const isRanged = def.attackType === 2;
      const statMod = isRanged || (isFinesse && dexMod > abilityModifiers.str)
        ? dexMod
        : abilityModifiers.str;
      const atkTotal = profBonus + statMod;
      const dmgDice = def.damage?.diceString || '1d6';

      actions.push({
        name: def.name,
        attackBonus: `1d20 + ${atkTotal}`,
        damage: `${dmgDice} + ${statMod}`,
        type: 'attack'
      });
    }
  }

  // 10. Avatar Mirroring
  const remoteAvatar =
    char.avatarUrl || char.decorations?.avatarUrl || char.frameAvatarUrl || '';
  const localAvatar = remoteAvatar ? await mirrorRemoteAvatar(remoteAvatar, characterId) : '';

  // 11. Assemble Canonical CoreActor
  const actor: CoreActor = {
    id: `actor_${characterId}`,
    name: char.name || 'D&D Beyond Adventurer',
    type: 'character',
    vitals: {
      hpCurrent,
      hpMax,
      hpTemp,
      ac: effectiveAc,
      speedFt,
      initiativeMod,
      conditions: (char.conditions || []).map((c: any) => c.name || String(c))
    },
    sheetData: {
      ddbId: characterId,
      level: totalLevel,
      classes: classes.map((c: any) => ({
        name: c.definition?.name || 'Adventurer',
        level: c.level || 1
      })),
      avatarUrl: localAvatar,
      proficiencyBonus: profBonus,
      abilityScores,
      abilityModifiers,
      savingThrows,
      skills,
      spellSlots: char.spellSlots || [],
      actions
    }
  };

  return actor;
}

/**
 * Reactive Core Actor Store with Svelte 5 Runes & Dexie Persistence.
 */
export class ActorStore {
  actors = $state<Record<string, CoreActor>>({});

  setActor(actor: CoreActor): void {
    this.actors[actor.id] = actor;

    dexieDb.actors.put({
      id: actor.id,
      name: actor.name,
      type: actor.type,
      current_hp: actor.vitals.hpCurrent,
      max_hp: actor.vitals.hpMax,
      temp_hp: actor.vitals.hpTemp,
      updated_at: Date.now(),
      mechanics: {
        ac: actor.vitals.ac,
        speed: `${actor.vitals.speedFt} ft`,
        stats: actor.sheetData?.abilityScores as any
      }
    });
  }

  getActor(id: string): CoreActor | undefined {
    return this.actors[id];
  }

  getAll(): CoreActor[] {
    return Object.values(this.actors);
  }
}

export const actorStore = new ActorStore();
