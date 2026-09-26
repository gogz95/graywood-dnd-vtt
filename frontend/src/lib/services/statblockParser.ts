// statblockParser.ts — 5e Monster & Spell Statblock Heuristic Parser
// Digests raw pasted text from PDFs, websites, and digital books into structured CompendiumMonster objects.

import type { CompendiumMonster } from '../db/compendiumDb';

// ── Structured Action ──────────────────────────────────────────────────────
export interface ParsedAction {
  name: string;
  description: string;
  attackType?: 'melee' | 'ranged';
  attackBonus?: number;
  damageFormula?: string;
}

// ── Full parsed result ─────────────────────────────────────────────────────
export interface ParsedStatblock {
  name: string;
  size: string;
  type: string;
  alignment: string;
  ac: number;
  acNote: string;
  hp: number;
  hitDice: string;
  speed: Record<string, string>; // { walk: '30 ft.', fly: '60 ft.', ... }
  str: number; dex: number; con: number;
  int: number; wis: number; cha: number;
  savingThrows: Record<string, number>;
  skills: Record<string, number>;
  damageResistances: string[];
  damageImmunities: string[];
  conditionImmunities: string[];
  damageVulnerabilities: string[];
  senses: string;
  languages: string;
  cr: number;
  proficiencyBonus: number;
  traits: ParsedAction[];
  actions: ParsedAction[];
  bonusActions: ParsedAction[];
  reactions: ParsedAction[];
  legendaryActions: ParsedAction[];
  // Validation flags
  missing: string[];
}

// ── Utility ────────────────────────────────────────────────────────────────
function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

function crToProficiency(cr: number): number {
  if (cr < 1)  return 2;
  if (cr <= 4)  return 2;
  if (cr <= 8)  return 3;
  if (cr <= 12) return 4;
  if (cr <= 16) return 5;
  if (cr <= 20) return 6;
  if (cr <= 24) return 7;
  if (cr <= 28) return 8;
  return 9;
}

function parseCr(raw: string): number {
  const s = raw.trim();
  if (s === '1/8') return 0.125;
  if (s === '1/4') return 0.25;
  if (s === '1/2') return 0.5;
  return parseFloat(s) || 0;
}

function splitIntoBlocks(text: string): Record<string, string> {
  // Normalise line endings and strip double spaces
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const blocks: Record<string, string> = { _header: '' };
  let current = '_header';

  const SECTION_HEADERS = [
    'ACTIONS', 'BONUS ACTIONS', 'BONUS ACTION',
    'REACTIONS', 'REACTION',
    'LEGENDARY ACTIONS', 'LEGENDARY ACTION',
    'LAIR ACTIONS', 'LAIR ACTION',
    'MYTHIC ACTIONS', 'VILLAIN ACTIONS',
  ];

  for (const line of lines) {
    const upper = line.trim().toUpperCase();
    if (SECTION_HEADERS.includes(upper)) {
      current = upper;
      blocks[current] = '';
    } else {
      blocks[current] = (blocks[current] ?? '') + line + '\n';
    }
  }
  return blocks;
}

/** Split a section block into individual ability/action entries. */
function parseEntries(block: string): ParsedAction[] {
  if (!block?.trim()) return [];

  const entries: ParsedAction[] = [];
  // Each action typically starts with a bold/italicized name or "Name (recharge X-Y)." pattern
  // We split on lines that start with a capitalized word followed by a period, comma, or parenthesis
  const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);

  let current: { name: string; desc: string[] } | null = null;

  for (const line of lines) {
    // Detect action name: starts with a word and ends with a period before space (or has parenthetical)
    const nameMatch = line.match(/^([A-ZÀÁÂ][A-Za-zàáâ' \-]+?)(\s*\([^)]+\))?\.\s+(.*)$/) ||
                      line.match(/^([A-ZÀÁÂ][A-Za-zàáâ' \-]+?)(\s*\([^)]+\))?$/) ||
                      // Handle italic markers (**Name.** desc)
                      line.match(/^\*{1,2}([A-ZÀÁÂ][A-Za-zàáâ' \-]+?\.?)\*{1,2}\s*(.*)?$/);

    const isLikelySectionHeader = /^(actions|traits|reactions|bonus actions?|legendary actions?)$/i.test(line);
    const isAbilityScoreLine = /^\d{1,2}\s*\([+-]\d+\)/.test(line);
    const isRollupLine = /^(str|dex|con|int|wis|cha)\s+\d/i.test(line);

    if (isLikelySectionHeader || isAbilityScoreLine || isRollupLine) continue;

    if (nameMatch && nameMatch[1] && nameMatch[1].length > 1 && nameMatch[1].length < 60) {
      if (current) entries.push(finalizeEntry(current));
      const suffix = nameMatch[3] ?? nameMatch[2] ?? '';
      current = { name: nameMatch[1].replace(/\.$/, '').trim(), desc: suffix ? [suffix] : [] };
    } else if (current) {
      current.desc.push(line);
    }
  }
  if (current) entries.push(finalizeEntry(current));
  return entries;
}

function finalizeEntry(e: { name: string; desc: string[] }): ParsedAction {
  const desc = e.desc.join(' ').trim();
  const result: ParsedAction = { name: e.name, description: desc };

  // Detect attack type
  if (/melee weapon attack|melee spell attack/i.test(desc)) result.attackType = 'melee';
  else if (/ranged weapon attack|ranged spell attack/i.test(desc)) result.attackType = 'ranged';

  // Extract to-hit bonus
  const hitMatch = desc.match(/([+-]\d+)\s+to\s+hit/i);
  if (hitMatch) result.attackBonus = parseInt(hitMatch[1], 10);

  // Extract damage formula
  const dmgMatch = desc.match(/\(([0-9]+d[0-9]+(?:\s*[+-]\s*\d+)?)\)\s+\w+\s+damage/i) ||
                   desc.match(/([0-9]+d[0-9]+(?:\s*[+-]\s*\d+)?)\s+\w+\s+damage/i);
  if (dmgMatch) result.damageFormula = dmgMatch[1].replace(/\s+/g, '');

  return result;
}

// ── Main Parser ────────────────────────────────────────────────────────────
export function parseStatblock(rawText: string): ParsedStatblock {
  const text = rawText.replace(/\u2019/g, "'").replace(/\u2013/g, '-').replace(/\u2014/g, '—');
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const blocks = splitIntoBlocks(text);
  const header = blocks['_header'] ?? '';
  const headerLines = header.split('\n').map((l) => l.trim()).filter(Boolean);

  const missing: string[] = [];
  const result: ParsedStatblock = {
    name: '', size: '', type: '', alignment: '',
    ac: 0, acNote: '', hp: 0, hitDice: '',
    speed: {}, str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
    savingThrows: {}, skills: {},
    damageResistances: [], damageImmunities: [], conditionImmunities: [],
    damageVulnerabilities: [], senses: '', languages: '',
    cr: 0, proficiencyBonus: 2,
    traits: [], actions: [], bonusActions: [], reactions: [], legendaryActions: [],
    missing,
  };

  // ── 1. Name: first non-empty line before size/type line ───────────────────
  result.name = headerLines[0] ?? '';

  // ── 2. Size / Type / Alignment ─────────────────────────────────────────────
  const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];
  const sizeRegex = new RegExp(`(${SIZES.join('|')})\\s+([\\w\\s]+?)(?:,\\s*(.+))?$`, 'i');
  for (const line of headerLines.slice(1, 5)) {
    const m = line.match(sizeRegex);
    if (m) {
      result.size = m[1];
      result.type = m[2].trim().replace(/,$/, '');
      result.alignment = m[3]?.trim() ?? '';
      break;
    }
  }
  if (!result.size) missing.push('size / type / alignment');

  // ── 3. Armor Class ─────────────────────────────────────────────────────────
  const acMatch = header.match(/Armor\s+Class\s+(\d+)\s*(?:\(([^)]+)\))?/i);
  if (acMatch) {
    result.ac = parseInt(acMatch[1], 10);
    result.acNote = acMatch[2]?.trim() ?? '';
  } else missing.push('armor class');

  // ── 4. Hit Points ──────────────────────────────────────────────────────────
  const hpMatch = header.match(/Hit\s+Points\s+(\d+)\s*(?:\(([^)]+)\))?/i);
  if (hpMatch) {
    result.hp = parseInt(hpMatch[1], 10);
    result.hitDice = hpMatch[2]?.trim() ?? '';
  } else missing.push('hit points');

  // ── 5. Speed ───────────────────────────────────────────────────────────────
  const speedMatch = header.match(/Speed\s+(.+)/i);
  if (speedMatch) {
    const speedStr = speedMatch[1];
    // walk (default), fly, swim, climb, burrow
    const modes = ['fly', 'swim', 'climb', 'burrow'];
    // Extract explicit modes
    for (const mode of modes) {
      const mRx = new RegExp(`${mode}\\s+(\\d+\\s*ft\\.?)`, 'i');
      const mm = speedStr.match(mRx);
      if (mm) result.speed[mode] = mm[1].trim();
    }
    // Walk speed: first number ft. before any mode keyword
    const walkMatch = speedStr.match(/^(\d+\s*ft\.?)/i);
    if (walkMatch) result.speed.walk = walkMatch[1].trim();
    if (!result.speed.walk && !result.speed.fly) result.speed.walk = speedStr.trim();
  } else missing.push('speed');

  // ── 6. Ability Scores ──────────────────────────────────────────────────────
  // Format A: single line "STR DEX CON INT WIS CHA\n10 (+0) 14 (+2) ..."
  // Format B: pairs "STR 10 (+0)" per line
  const STATS: Array<keyof Pick<ParsedStatblock, 'str'|'dex'|'con'|'int'|'wis'|'cha'>> =
    ['str', 'dex', 'con', 'int', 'wis', 'cha'];
  const LABELS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

  // Try compact six-number block after labels
  const abilityBlock = header.match(
    /STR\s+DEX\s+CON\s+INT\s+WIS\s+CHA[\s\S]*?(\d+)\s*\([+-]\d+\)\s*(\d+)\s*\([+-]\d+\)\s*(\d+)\s*\([+-]\d+\)\s*(\d+)\s*\([+-]\d+\)\s*(\d+)\s*\([+-]\d+\)\s*(\d+)\s*\([+-]\d+\)/i
  );
  if (abilityBlock) {
    for (let i = 0; i < 6; i++) {
      (result as any)[STATS[i]] = parseInt(abilityBlock[i + 1], 10);
    }
  } else {
    // Try individual label lines
    for (let i = 0; i < 6; i++) {
      const rx = new RegExp(`${LABELS[i]}\\s+(\\d+)`, 'i');
      const m = header.match(rx);
      if (m) (result as any)[STATS[i]] = parseInt(m[1], 10);
    }
    // Check if any are still default 10 AND weren't found
    const found = STATS.filter((s) => (result as any)[s] !== 10);
    if (found.length === 0) missing.push('ability scores');
  }

  // ── 7. Saving Throws ───────────────────────────────────────────────────────
  const savMatch = header.match(/Saving\s+Throws\s+(.+)/i);
  if (savMatch) {
    const parts = savMatch[1].split(/,\s*/);
    for (const p of parts) {
      const m = p.trim().match(/([A-Za-z]{3})\s+([+-]\d+)/);
      if (m) result.savingThrows[m[1].toUpperCase()] = parseInt(m[2], 10);
    }
  }

  // ── 8. Skills ──────────────────────────────────────────────────────────────
  const skillMatch = header.match(/Skills\s+(.+)/i);
  if (skillMatch) {
    const parts = skillMatch[1].split(/,\s*/);
    for (const p of parts) {
      const m = p.trim().match(/([A-Za-z\s]+?)\s+([+-]\d+)/);
      if (m) result.skills[m[1].trim()] = parseInt(m[2], 10);
    }
  }

  // ── 9. Damage Resistances / Immunities / Vulnerabilities ──────────────────
  const parseList = (label: string): string[] => {
    const rx = new RegExp(`${label}\\s+(.+)`, 'i');
    const m = header.match(rx);
    if (!m) return [];
    return m[1].split(/;\s*|,\s*(?![^(]*\))/).map((s) => s.trim()).filter(Boolean);
  };

  result.damageResistances   = parseList('Damage\\s+Resistances?');
  result.damageImmunities    = parseList('Damage\\s+Immunities?');
  result.conditionImmunities = parseList('Condition\\s+Immunities?');
  result.damageVulnerabilities = parseList('Damage\\s+Vulnerabilities?');

  // ── 10. Senses & Languages ────────────────────────────────────────────────
  const sensesMatch = header.match(/Senses\s+(.+)/i);
  result.senses = sensesMatch ? sensesMatch[1].trim() : '';
  if (!result.senses) missing.push('senses');

  const langMatch = header.match(/Languages?\s+(.+)/i);
  result.languages = langMatch ? langMatch[1].trim() : '';
  if (!result.languages) missing.push('languages');

  // ── 11. Challenge Rating ───────────────────────────────────────────────────
  const crMatch = header.match(/Challenge\s+([\d/]+)/i);
  if (crMatch) {
    result.cr = parseCr(crMatch[1]);
    result.proficiencyBonus = crToProficiency(result.cr);
  } else missing.push('challenge rating');

  // ── 12. Traits (header block, before ACTIONS section) ─────────────────────
  // Traits appear after the CR line
  const crLineIdx = headerLines.findIndex((l) => /^Challenge/i.test(l));
  const traitBlock = crLineIdx >= 0 ? headerLines.slice(crLineIdx + 1).join('\n') : '';
  result.traits = parseEntries(traitBlock);

  // ── 13. Actions ───────────────────────────────────────────────────────────
  result.actions = parseEntries(blocks['ACTIONS'] ?? blocks['ACTION'] ?? '');

  // ── 14. Bonus Actions ─────────────────────────────────────────────────────
  result.bonusActions = parseEntries(blocks['BONUS ACTIONS'] ?? blocks['BONUS ACTION'] ?? '');

  // ── 15. Reactions ─────────────────────────────────────────────────────────
  result.reactions = parseEntries(blocks['REACTIONS'] ?? blocks['REACTION'] ?? '');

  // ── 16. Legendary Actions ─────────────────────────────────────────────────
  result.legendaryActions = parseEntries(blocks['LEGENDARY ACTIONS'] ?? blocks['LEGENDARY ACTION'] ?? '');

  if (!result.name) missing.push('name');

  return result;
}

// ── Convert to CompendiumMonster ────────────────────────────────────────────
export function parsedToMonster(parsed: ParsedStatblock): CompendiumMonster {
  const speedStr = Object.entries(parsed.speed)
    .map(([k, v]) => k === 'walk' ? v : `${k} ${v}`)
    .join(', ');

  const savesStr = Object.entries(parsed.savingThrows)
    .map(([k, v]) => `${k} ${v >= 0 ? '+' : ''}${v}`)
    .join(', ');

  const skillsStr = Object.entries(parsed.skills)
    .map(([k, v]) => `${k} ${v >= 0 ? '+' : ''}${v}`)
    .join(', ');

  return {
    id: `import-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: parsed.name || 'Unnamed Creature',
    cr: parsed.cr,
    size: parsed.size,
    type: parsed.type,
    alignment: parsed.alignment,
    ac: parsed.ac,
    hp: parsed.hp,
    hitDice: parsed.hitDice,
    speed: speedStr,
    str: parsed.str, dex: parsed.dex, con: parsed.con,
    int: parsed.int, wis: parsed.wis, cha: parsed.cha,
    savingThrows: savesStr,
    skills: skillsStr,
    senses: parsed.senses,
    languages: parsed.languages,
    traits: parsed.traits.map(({ name, description }) => ({ name, description })),
    actions: parsed.actions.map(({ name, description }) => ({ name, description })),
    legendary_actions: parsed.legendaryActions.map(({ name, description }) => ({ name, description })),
    sourceBook: 'Homebrew Import',
    packageId: 'homebrew',
    origin: 'USER_IMPORT',
  };
}
