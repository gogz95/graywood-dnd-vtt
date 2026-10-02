// frontend/src/lib/services/dndRulesEngine.ts
// 5e SRD Condition Definitions & Concise Mechanical Rule Summaries

export interface ConditionRuleSummary {
  name: string;
  icon: string;
  summary: string;
  mechanics: string[];
}

export const SRD_CONDITIONS: Record<string, ConditionRuleSummary> = {
  Blinded: {
    name: 'Blinded',
    icon: '👁️‍🗨️',
    summary: 'Auto-fails sight checks; disadvantage on attacks; enemy attacks have advantage.',
    mechanics: [
      'Automatically fails any ability check requiring sight.',
      'Attack rolls against the creature have advantage; creature’s attack rolls have disadvantage.',
    ],
  },
  Charmed: {
    name: 'Charmed',
    icon: '💖',
    summary: 'Cannot harm charmer; charmer has advantage on social ability checks.',
    mechanics: [
      'Cannot attack the charmer or target charmer with harmful abilities or magical effects.',
      'Charmer has advantage on any ability check to interact socially with the creature.',
    ],
  },
  Concentrating: {
    name: 'Concentrating',
    icon: '🧠',
    summary: 'Maintaining spell effect; must make CON save on damage (DC 10 or half damage).',
    mechanics: [
      'Taking damage triggers a CON save (DC 10 or half damage taken, whichever is higher).',
      'Incapacitated or killed breaks concentration immediately.',
    ],
  },
  Deafened: {
    name: 'Deafened',
    icon: '🔇',
    summary: 'Cannot hear; automatically fails any ability check requiring hearing.',
    mechanics: [
      'Automatically fails any ability check that requires hearing.',
    ],
  },
  Frightened: {
    name: 'Frightened',
    icon: '😱',
    summary: 'Disadvantage on checks/attacks while source is in LoS; speed reduced to 0 toward source.',
    mechanics: [
      'Disadvantage on ability checks and attack rolls while source of fear is in line of sight.',
      'The creature cannot willingly move closer to the source of its fear.',
    ],
  },
  Grappled: {
    name: 'Grappled',
    icon: '🤼',
    summary: 'Speed becomes 0; condition ends if grappler is incapacitated or displaced.',
    mechanics: [
      'Speed becomes 0, and it cannot benefit from any bonus to its speed.',
      'Condition ends if the grappler becomes incapacitated or if moved away.',
    ],
  },
  Incapacitated: {
    name: 'Incapacitated',
    icon: '💫',
    summary: 'Cannot take actions, bonus actions, or reactions.',
    mechanics: [
      'An incapacitated creature cannot take actions or reactions.',
    ],
  },
  Invisible: {
    name: 'Invisible',
    icon: '👻',
    summary: 'Impossible to see without aid; attacks have advantage; enemy attacks have disadvantage.',
    mechanics: [
      'Attacks against creature have disadvantage; creature attacks have advantage.',
      'Can only be detected by noise, tracks, or special senses.',
    ],
  },
  Paralyzed: {
    name: 'Paralyzed',
    icon: '🛑',
    summary: 'Incapacitated; auto-fail STR/DEX saves; attacks within 5ft are auto-crits.',
    mechanics: [
      'Incapacitated and cannot move or speak. Automatically fails STR and DEX saves.',
      'Attacks against creature have advantage; any attack that hits within 5ft is an automatic critical hit.',
    ],
  },
  Petrified: {
    name: 'Petrified',
    icon: '🗿',
    summary: 'Transformed into solid inanimate substance; weight x10; immune to poison/disease.',
    mechanics: [
      'Incapacitated, cannot move/speak, unaware of surroundings. Auto-fails STR and DEX saves.',
      'Has resistance to all damage; immune to poison and disease.',
    ],
  },
  Poisoned: {
    name: 'Poisoned',
    icon: '🧪',
    summary: 'Disadvantage on attack rolls and ability checks.',
    mechanics: [
      'Disadvantage on attack rolls and ability checks.',
    ],
  },
  Prone: {
    name: 'Prone',
    icon: '🛌',
    summary: 'Crawling only; disadvantage on attacks; enemy attacks within 5ft have advantage.',
    mechanics: [
      'Disadvantage on attack rolls. Attack rolls within 5ft have advantage; beyond 5ft have disadvantage.',
      'Must spend half speed to stand up.',
    ],
  },
  Restrained: {
    name: 'Restrained',
    icon: '⛓️',
    summary: 'Speed 0; disadvantage on DEX saves; attacks have disadvantage; enemy attacks have advantage.',
    mechanics: [
      'Speed becomes 0. Attack rolls against creature have advantage; creature attacks have disadvantage.',
      'The creature has disadvantage on Dexterity saving throws.',
    ],
  },
  Stunned: {
    name: 'Stunned',
    icon: '⚡',
    summary: 'Incapacitated; auto-fail STR/DEX saves; enemy attacks have advantage.',
    mechanics: [
      'Incapacitated, cannot move, can speak only falteringly.',
      'Auto-fails STR and DEX saving throws. Attack rolls against the creature have advantage.',
    ],
  },
  Unconscious: {
    name: 'Unconscious',
    icon: '💀',
    summary: 'Incapacitated, drops held items, falls prone; auto-crits within 5ft.',
    mechanics: [
      'Incapacitated, drops held items, falls prone. Auto-fails STR and DEX saves.',
      'Attacks have advantage; any hit within 5ft is an automatic critical hit.',
    ],
  },
};

/**
 * Returns concise mechanical rule summary for a condition.
 */
export function getConditionSummary(conditionName: string): ConditionRuleSummary {
  const base = conditionName.split(' ')[0];
  return (
    SRD_CONDITIONS[base] || {
      name: conditionName,
      icon: '⚠️',
      summary: 'Status condition affecting tactical performance.',
      mechanics: ['Effect governed by custom spell or campaign rule.'],
    }
  );
}
