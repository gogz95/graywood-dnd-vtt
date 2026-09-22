// src/lib/services/statblockActionResolver.ts
// Monster Statblock Action Resolver: regex parsing and one-click chat execution

import { processChatInput } from '$lib/services/chatCommandService';
import { audioEngine } from '$lib/services/audioEngine';

export interface ParsedAction {
  name: string;
  description: string;
  toHit: number | null;
  damageFormula: string | null;
  damageType: string | null;
}

export function parseMonsterAction(name: string, desc: string): ParsedAction {
  const hitMatch = desc.match(/([+-]\d+)\s+to\s+hit/i);
  const dmgMatch = desc.match(/hit:\s*\d+\s*\(([^)]+)\)\s*([a-z]+)?\s*damage/i);

  return {
    name,
    description: desc,
    toHit: hitMatch ? parseInt(hitMatch[1], 10) : null,
    damageFormula: dmgMatch ? dmgMatch[1].replace(/\s+/g, '') : null,
    damageType: dmgMatch && dmgMatch[2] ? dmgMatch[2] : null
  };
}

export async function executeMonsterAction(actorName: string, action: ParsedAction) {
  if (action.toHit !== null) {
    audioEngine.playDiceClatter();
    const d20 = Math.floor(Math.random() * 20) + 1;
    const total = d20 + action.toHit;
    await processChatInput(
      `${actorName} strikes with ${action.name}! (1d20${action.toHit >= 0 ? '+' : ''}${action.toHit} = ${total})`,
      actorName
    );
  }

  if (action.damageFormula) {
    await processChatInput(`/r ${action.damageFormula}`, actorName);
  } else if (action.toHit === null) {
    await processChatInput(`${actorName} uses ${action.name}: ${action.description}`, actorName);
  }
}
