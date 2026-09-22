// src/lib/services/importers/compendiumJsonImporter.ts
// Structured JSON Compendium Importer (5eTools, Open5e, Foundry)

import { compendiumDb, type CompendiumMonster } from '$lib/db/compendiumDb';
import { processSourceUnlock } from '$lib/services/unlockRegistry';

export interface NormalizedCompendiumMonster {
  id: string;
  name: string;
  cr: any;
  crNumeric: number;
  xp: number;
  hp: number;
  hpFormula: string;
  ac: number;
  source: string;
  rawJson: string;
}

export function parseCrValue(crStr: string): { crNumeric: number; xp: number } {
  const crMap: Record<string, { crNumeric: number; xp: number }> = {
    '0': { crNumeric: 0, xp: 10 },
    '1/8': { crNumeric: 0.125, xp: 25 },
    '1/4': { crNumeric: 0.25, xp: 50 },
    '1/2': { crNumeric: 0.5, xp: 100 },
    '1': { crNumeric: 1, xp: 200 },
    '2': { crNumeric: 2, xp: 450 },
    '3': { crNumeric: 3, xp: 700 },
    '4': { crNumeric: 4, xp: 1100 },
    '5': { crNumeric: 5, xp: 1800 }
  };
  return crMap[crStr] || { crNumeric: parseInt(crStr, 10) || 1, xp: 200 };
}

export async function importCompendiumJson(file: File): Promise<{ count: number; source: string }> {
  const text = await file.text();
  const json = JSON.parse(text);

  const sourceName = json.source || file.name.replace(/\.[^/.]+$/, '');
  const monsterList: any[] = json.monster || json.monsters || (Array.isArray(json) ? json : []);

  const normalized: (CompendiumMonster & NormalizedCompendiumMonster)[] = monsterList.map((m: any, idx: number) => {
    const crStr = String(m.cr?.cr || m.cr || '1');
    const { crNumeric, xp } = parseCrValue(crStr);

    return {
      id: `m_${sourceName}_${idx}_${(m.name || 'creature').toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
      name: m.name || 'Unnamed Creature',
      cr: crNumeric,
      crNumeric,
      xp,
      size: m.size?.[0] || m.size || 'Medium',
      type: m.type?.type || m.type || 'Humanoid',
      alignment: Array.isArray(m.alignment) ? m.alignment.join(' ') : m.alignment || 'Unaligned',
      hp: typeof m.hp === 'number' ? m.hp : m.hp?.average || 10,
      hpFormula: m.hp?.formula || '2d8+2',
      ac: Array.isArray(m.ac) ? m.ac[0]?.ac || m.ac[0] || 10 : m.ac || 10,
      speed: typeof m.speed === 'string' ? m.speed : (m.speed?.walk ? `${m.speed.walk} ft.` : '30 ft.'),
      str: m.str || 10,
      dex: m.dex || 10,
      con: m.con || 10,
      int: m.int || 10,
      wis: m.wis || 10,
      cha: m.cha || 10,
      actions: Array.isArray(m.action) ? m.action.map((a: any) => ({ name: a.name || '', description: a.entries?.join(' ') || '' })) : [],
      source: sourceName,
      sourceBook: sourceName,
      packageId: `pkg_${sourceName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
      origin: 'USER_IMPORT' as const,
      rawJson: JSON.stringify(m)
    };
  });

  if (normalized.length > 0) {
    await compendiumDb.monsters.bulkPut(normalized as CompendiumMonster[]);
    await processSourceUnlock(sourceName);
  }

  return { count: normalized.length, source: sourceName };
}
