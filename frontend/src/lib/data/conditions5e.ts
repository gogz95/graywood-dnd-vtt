// frontend/src/lib/data/conditions5e.ts
// 5e SRD 5.1 Condition Definitions & Mechanical Rules Dictionary

export interface ConditionDefinition5e {
  id: string;
  name: string;
  icon: string;
  summary: string;
  bulletPoints: string[];
  source: 'SRD 5.1';
}

export const CONDITIONS_5E: Record<string, ConditionDefinition5e> = {
  Blinded: {
    id: 'blinded',
    name: 'Blinded',
    icon: '👁️‍🗨️',
    summary: "A blinded creature can't see and automatically fails any ability check that requires sight.",
    bulletPoints: [
      "Automatically fails any ability check that requires sight.",
      "Attack rolls against the creature have advantage.",
      "The creature's attack rolls have disadvantage."
    ],
    source: 'SRD 5.1'
  },
  Charmed: {
    id: 'charmed',
    name: 'Charmed',
    icon: '💖',
    summary: "A charmed creature can't attack the charmer or target the charmer with harmful abilities or magical effects.",
    bulletPoints: [
      "Cannot attack the charmer or target the charmer with harmful abilities or magical effects.",
      "The charmer has advantage on any ability check to interact socially with the creature."
    ],
    source: 'SRD 5.1'
  },
  Deafened: {
    id: 'deafened',
    name: 'Deafened',
    icon: '🔇',
    summary: "A deafened creature can't hear and automatically fails any ability check that requires hearing.",
    bulletPoints: [
      "Automatically fails any ability check that requires hearing."
    ],
    source: 'SRD 5.1'
  },
  Frightened: {
    id: 'frightened',
    name: 'Frightened',
    icon: '😱',
    summary: "A frightened creature has disadvantage on ability checks and attack rolls while the source of its fear is within line of sight.",
    bulletPoints: [
      "Disadvantage on ability checks and attack rolls while the source of its fear is within line of sight.",
      "The creature can't willingly move closer to the source of its fear."
    ],
    source: 'SRD 5.1'
  },
  Grappled: {
    id: 'grappled',
    name: 'Grappled',
    icon: '🤼',
    summary: "A grappled creature's speed becomes 0, and it can't benefit from any bonus to its speed.",
    bulletPoints: [
      "Speed becomes 0, and it cannot benefit from any bonus to its speed.",
      "The condition ends if the grappler is incapacitated.",
      "The condition ends if an effect removes the grappled creature from the reach of the grappler or grappling effect."
    ],
    source: 'SRD 5.1'
  },
  Incapacitated: {
    id: 'incapacitated',
    name: 'Incapacitated',
    icon: '💫',
    summary: "An incapacitated creature can't take actions or reactions.",
    bulletPoints: [
      "Cannot take actions or reactions."
    ],
    source: 'SRD 5.1'
  },
  Invisible: {
    id: 'invisible',
    name: 'Invisible',
    icon: '👻',
    summary: "An invisible creature is impossible to see without the aid of magic or a special sense.",
    bulletPoints: [
      "Heavily obscured for the purpose of hiding; location can be detected by noises or tracks.",
      "Attack rolls against the creature have disadvantage.",
      "The creature's attack rolls have advantage."
    ],
    source: 'SRD 5.1'
  },
  Paralyzed: {
    id: 'paralyzed',
    name: 'Paralyzed',
    icon: '🛑',
    summary: "A paralyzed creature is incapacitated and can't move or speak.",
    bulletPoints: [
      "Incapacitated and cannot move or speak.",
      "Automatically fails Strength and Dexterity saving throws.",
      "Attack rolls against the creature have advantage.",
      "Any attack that hits the creature is a critical hit if the attacker is within 5 feet."
    ],
    source: 'SRD 5.1'
  },
  Petrified: {
    id: 'petrified',
    name: 'Petrified',
    icon: '🗿',
    summary: "A petrified creature is transformed, along with any nonmagical object it is wearing or carrying, into a solid inanimate substance.",
    bulletPoints: [
      "Weight increases by a factor of ten, and creature ceases aging.",
      "Incapacitated, cannot move or speak, and is unaware of its surroundings.",
      "Attack rolls against the creature have advantage.",
      "Automatically fails Strength and Dexterity saving throws.",
      "Has resistance to all damage.",
      "Immune to poison and disease, although poison or disease already in its system is suspended."
    ],
    source: 'SRD 5.1'
  },
  Poisoned: {
    id: 'poisoned',
    name: 'Poisoned',
    icon: '🧪',
    summary: "A poisoned creature has disadvantage on attack rolls and ability checks.",
    bulletPoints: [
      "Disadvantage on attack rolls.",
      "Disadvantage on ability checks."
    ],
    source: 'SRD 5.1'
  },
  Prone: {
    id: 'prone',
    name: 'Prone',
    icon: '🛌',
    summary: "A prone creature's only movement option is to crawl, unless it stands up and thereby ends the condition.",
    bulletPoints: [
      "Only movement option is to crawl (costs 1 extra foot per foot moved), unless it stands up.",
      "Standing up costs half of the creature's speed.",
      "The creature has disadvantage on attack rolls.",
      "An attack roll against the creature has advantage if the attacker is within 5 feet.",
      "Otherwise, the attack roll has disadvantage."
    ],
    source: 'SRD 5.1'
  },
  Restrained: {
    id: 'restrained',
    name: 'Restrained',
    icon: '⛓️',
    summary: "A restrained creature's speed becomes 0, and it can't benefit from any bonus to its speed.",
    bulletPoints: [
      "Speed becomes 0, and it cannot benefit from any bonus to its speed.",
      "Attack rolls against the creature have advantage.",
      "The creature's attack rolls have disadvantage.",
      "The creature has disadvantage on Dexterity saving throws."
    ],
    source: 'SRD 5.1'
  },
  Stunned: {
    id: 'stunned',
    name: 'Stunned',
    icon: '⚡',
    summary: "A stunned creature is incapacitated, can't move, and can speak only falteringly.",
    bulletPoints: [
      "Incapacitated, cannot move, and can speak only falteringly.",
      "Automatically fails Strength and Dexterity saving throws.",
      "Attack rolls against the creature have advantage."
    ],
    source: 'SRD 5.1'
  },
  Unconscious: {
    id: 'unconscious',
    name: 'Unconscious',
    icon: '💀',
    summary: "An unconscious creature is incapacitated, can't move or speak, and is unaware of its surroundings.",
    bulletPoints: [
      "Incapacitated, cannot move or speak, and is unaware of its surroundings.",
      "Drops whatever it's holding and falls prone.",
      "Automatically fails Strength and Dexterity saving throws.",
      "Attack rolls against the creature have advantage.",
      "Any attack that hits the creature is a critical hit if the attacker is within 5 feet."
    ],
    source: 'SRD 5.1'
  },
  Exhaustion: {
    id: 'exhaustion',
    name: 'Exhaustion',
    icon: '⏳',
    summary: "Exhaustion is measured in six cumulative levels of debilitating physiological fatigue.",
    bulletPoints: [
      "Level 1: Disadvantage on ability checks.",
      "Level 2: Speed halved.",
      "Level 3: Disadvantage on attack rolls and saving throws.",
      "Level 4: Hit point maximum halved.",
      "Level 5: Speed reduced to 0.",
      "Level 6: Death.",
      "Finishing a Long Rest reduces exhaustion level by 1, provided the creature has food and drink."
    ],
    source: 'SRD 5.1'
  },
};

/**
 * Normalizes input condition string (e.g. "Exhaustion 2" or "prone") and returns full SRD 5.1 rule definition.
 */
export function getCondition5e(rawName: string): ConditionDefinition5e {
  if (!rawName) {
    return {
      id: 'unknown',
      name: 'Unknown Condition',
      icon: '⚠️',
      summary: 'Status condition affecting tactical performance.',
      bulletPoints: ['Effect governed by custom spell or campaign rule.'],
      source: 'SRD 5.1'
    };
  }

  // Handle exhaustion variants (e.g. "Exhaustion (2)", "Exhaustion 3")
  if (/^exhaustion/i.test(rawName)) {
    const match = rawName.match(/\d+/);
    const level = match ? parseInt(match[0], 10) : null;
    const base = CONDITIONS_5E.Exhaustion;
    if (level !== null && level >= 1 && level <= 6) {
      return {
        ...base,
        name: `Exhaustion (Level ${level})`,
        summary: `Level ${level} Exhaustion: ${base.bulletPoints[level - 1]} (all prior levels apply).`,
      };
    }
    return base;
  }

  const baseKey = Object.keys(CONDITIONS_5E).find(
    (k) => k.toLowerCase() === rawName.trim().split(' ')[0].toLowerCase()
  );

  if (baseKey && CONDITIONS_5E[baseKey]) {
    return CONDITIONS_5E[baseKey];
  }

  return {
    id: rawName.toLowerCase().replace(/\s+/g, '-'),
    name: rawName,
    icon: '⚠️',
    summary: `${rawName} status condition.`,
    bulletPoints: ['Effect governed by custom spell, feature, or campaign rule.'],
    source: 'SRD 5.1'
  };
}
