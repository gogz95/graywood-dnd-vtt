// src/lib/systems/loreCheckSystem.ts
// Active & Passive Lore Check Evaluation System

import { compendiumDb } from '../db/compendiumDb';

export interface LoreResolution {
  topic: string;
  dc: number;
  roll: number;
  total: number;
  passed: boolean;
  content: string;
}

export async function evaluateLoreCheck(
  topic: string,
  skillMod: number,
  passiveScore = 10
): Promise<LoreResolution | null> {
  const needle = topic.toLowerCase();
  const tables = await compendiumDb.ingestedTables.toArray();

  const entry = tables.find(
    (t) => t.name.toLowerCase().includes(needle) || t.category?.toLowerCase() === 'lore'
  );
  if (!entry) return null;

  const dc = 13;
  const passedPassively = passiveScore >= dc;

  const d20 = Math.floor(Math.random() * 20) + 1;
  const total = d20 + skillMod;
  const passed = passedPassively || total >= dc;

  return {
    topic: entry.name,
    dc,
    roll: d20,
    total,
    passed,
    content: passed
      ? (entry.rows && entry.rows.length > 0 ? entry.rows.flat().join(' ') : 'Verified historical account recovered.')
      : 'Conflicting rumors and unverifiable folklore.'
  };
}
