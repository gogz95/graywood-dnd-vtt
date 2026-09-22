// src/lib/services/ingest/contentClassifier.ts
// Automated zero-configuration content fingerprinter and schema normalizer for 5e content, battlemaps, and lore.

import {
  compendiumDb,
  type CompendiumMonster,
  type CompendiumSpell,
  type CompendiumItem,
  type CompendiumJournal,
} from '../../db/compendiumDb';
import { mapsDb } from '../../db/mapsDb';
import { mapLayers } from '../../stores/mapLayerStore.svelte';
import { parseDungeonScrawl } from '../../canvas/parsers/dungeonScrawlParser';
import { parseWatabouGeoJson } from '../../canvas/parsers/watabouParser';
import type { TacticalBattlemap } from '../../types/maps';

export type DetectedContentType =
  | 'monster'
  | 'spell'
  | 'item'
  | 'battlemap'
  | 'journal'
  | 'media_token'
  | 'audio'
  | 'video'
  | 'unknown';

export interface SniffResult {
  type: DetectedContentType;
  confidence: number; // 0.0 - 1.0
  format: '5etools' | 'open5e' | 'homebrewery' | 'srd_table' | 'vector_map' | 'raster_map' | 'narrative_md' | 'generic_json' | 'binary_media';
  count: number;
  extractedRecords?: {
    monsters?: CompendiumMonster[];
    spells?: CompendiumSpell[];
    items?: CompendiumItem[];
    journals?: CompendiumJournal[];
  };
}

/**
 * Sniffs raw string, object, or File to determine its 5e schema category and contents.
 */
export async function sniffAndClassify(
  content: string | object | File | Blob,
  filename = ''
): Promise<SniffResult> {
  const lowerName = filename.toLowerCase();

  // 1. Vector Map Extensions (.dd2vtt, .uvtt, .ds, .geojson)
  if (lowerName.endsWith('.dd2vtt') || lowerName.endsWith('.uvtt')) {
    return { type: 'battlemap', confidence: 1.0, format: 'vector_map', count: 1 };
  }
  if (lowerName.endsWith('.ds')) {
    return { type: 'battlemap', confidence: 1.0, format: 'vector_map', count: 1 };
  }
  if (lowerName.endsWith('.geojson')) {
    return { type: 'battlemap', confidence: 0.95, format: 'vector_map', count: 1 };
  }

  // 2. Binary / Image / Audio / Video Inspection
  if (content instanceof File || content instanceof Blob) {
    const mime = content.type.toLowerCase();
    if (mime.startsWith('audio/')) {
      return { type: 'audio', confidence: 1.0, format: 'binary_media', count: 1 };
    }
    if (mime.startsWith('video/')) {
      return { type: 'video', confidence: 1.0, format: 'binary_media', count: 1 };
    }
    if (mime.startsWith('image/')) {
      // Check dimensions if in browser
      const dims = await getImageDimensions(content);
      if (dims.width >= 1000 && dims.height >= 1000) {
        return { type: 'battlemap', confidence: 0.9, format: 'raster_map', count: 1 };
      }
      return { type: 'media_token', confidence: 0.85, format: 'binary_media', count: 1 };
    }

    // Read text content if not media
    try {
      const text = await content.text();
      return sniffTextContent(text, filename);
    } catch {
      return { type: 'unknown', confidence: 0.1, format: 'binary_media', count: 0 };
    }
  }

  if (typeof content === 'string') {
    return sniffTextContent(content, filename);
  }

  if (typeof content === 'object' && content !== null) {
    return sniffJsonObject(content, filename);
  }

  return { type: 'unknown', confidence: 0.0, format: 'generic_json', count: 0 };
}

/**
 * Sniffs parsed JSON objects and detects 5eTools, Open5e, or native schemas.
 */
function sniffJsonObject(json: any, filename: string): SniffResult {
  const sourceBook = sanitizeSourceBook(filename);

  // 5eTools format
  if (Array.isArray(json.monster)) {
    const monsters = json.monster.map((m: any) => normalize5eToolsMonster(m, sourceBook));
    return {
      type: 'monster',
      confidence: 0.99,
      format: '5etools',
      count: monsters.length,
      extractedRecords: { monsters },
    };
  }
  if (Array.isArray(json.spell)) {
    const spells = json.spell.map((s: any) => normalize5eToolsSpell(s, sourceBook));
    return {
      type: 'spell',
      confidence: 0.99,
      format: '5etools',
      count: spells.length,
      extractedRecords: { spells },
    };
  }
  if (Array.isArray(json.item)) {
    const items = json.item.map((i: any) => normalize5eToolsItem(i, sourceBook));
    return {
      type: 'item',
      confidence: 0.99,
      format: '5etools',
      count: items.length,
      extractedRecords: { items },
    };
  }

  // Open5e format (results array or single object)
  const itemsArray = Array.isArray(json.results) ? json.results : Array.isArray(json) ? json : [json];
  const first = itemsArray[0];

  if (first && typeof first === 'object') {
    // Check Monster Keys
    if (
      ('cr' in first || 'challenge_rating' in first) &&
      ('ac' in first || 'armor_class' in first || 'hit_points' in first || 'hp' in first)
    ) {
      const monsters = itemsArray.map((m: any) => normalizeOpen5eMonster(m, sourceBook));
      return {
        type: 'monster',
        confidence: 0.95,
        format: 'open5e',
        count: monsters.length,
        extractedRecords: { monsters },
      };
    }

    // Check Spell Keys
    if (
      ('school' in first || 'casting_time' in first) &&
      ('level' in first || 'level_int' in first || 'components' in first)
    ) {
      const spells = itemsArray.map((s: any) => normalizeOpen5eSpell(s, sourceBook));
      return {
        type: 'spell',
        confidence: 0.95,
        format: 'open5e',
        count: spells.length,
        extractedRecords: { spells },
      };
    }

    // Check Item Keys
    if (
      ('damage' in first || 'damage_dice' in first || 'rarity' in first) &&
      ('properties' in first || 'cost' in first || 'armor_class' in first)
    ) {
      const items = itemsArray.map((i: any) => normalizeGenericItem(i, sourceBook));
      return {
        type: 'item',
        confidence: 0.9,
        format: 'open5e',
        count: items.length,
        extractedRecords: { items },
      };
    }

    // Check UVTT / Universal VTT
    if ('resolution' in first || 'line_of_sight' in first || 'format' in first) {
      return { type: 'battlemap', confidence: 0.98, format: 'vector_map', count: 1 };
    }
  }

  return { type: 'unknown', confidence: 0.2, format: 'generic_json', count: 0 };
}

/**
 * Sniffs raw markdown text or JSON strings for statblock patterns or lore hierarchies.
 */
function sniffTextContent(text: string, filename: string): SniffResult {
  const trimmed = text.trim();

  // Try JSON parse first
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      return sniffJsonObject(parsed, filename);
    } catch {
      // Continue to markdown inspection
    }
  }

  const sourceBook = sanitizeSourceBook(filename);

  // 1. Check for Homebrewery / Markdown Monster Statblocks
  const monsterRegex = /\b(Armor Class|Hit Points|Speed|Challenge|STR\s+DEX\s+CON)\b/i;
  const isMonster = monsterRegex.test(trimmed) && (/\bActions\b/i.test(trimmed) || /\bCR\s+\d/i.test(trimmed));
  if (isMonster) {
    const monsters = parseMarkdownMonsters(trimmed, sourceBook);
    if (monsters.length > 0) {
      return {
        type: 'monster',
        confidence: 0.9,
        format: 'homebrewery',
        count: monsters.length,
        extractedRecords: { monsters },
      };
    }
  }

  // 2. Check for Spell Statblocks
  const spellRegex = /\b(1st-level|2nd-level|3rd-level|cantrip|Casting Time:|Range:|Components:|Duration:)\b/i;
  if (spellRegex.test(trimmed)) {
    const spells = parseMarkdownSpells(trimmed, sourceBook);
    if (spells.length > 0) {
      return {
        type: 'spell',
        confidence: 0.88,
        format: 'homebrewery',
        count: spells.length,
        extractedRecords: { spells },
      };
    }
  }

  // 3. Narrative Markdown (Hierarchies with #, ##, ### lacking combat statblocks)
  if (trimmed.includes('#') && !isMonster) {
    const journals = chunkNarrativeMarkdown(trimmed, sourceBook);
    if (journals.length > 0) {
      return {
        type: 'journal',
        confidence: 0.92,
        format: 'narrative_md',
        count: journals.length,
        extractedRecords: { journals },
      };
    }
  }

  return { type: 'unknown', confidence: 0.1, format: 'narrative_md', count: 0 };
}

/**
 * Executes automatic schema ingestion directly into Dexie compendiums or map stores.
 */
export async function ingestClassifiedContent(
  sniffResult: SniffResult,
  packageId = 'user-import'
): Promise<{ committedCount: number; destination: string }> {
  if (!sniffResult.extractedRecords) {
    return { committedCount: 0, destination: 'none' };
  }

  const recs = sniffResult.extractedRecords;

  if (recs.monsters && recs.monsters.length > 0) {
    const tagged = recs.monsters.map((m) => ({ ...m, packageId, origin: 'USER_IMPORT' as const }));
    await compendiumDb.monsters.bulkPut(tagged);
    return { committedCount: tagged.length, destination: 'compendiumDb.monsters' };
  }

  if (recs.spells && recs.spells.length > 0) {
    const tagged = recs.spells.map((s) => ({ ...s, packageId, origin: 'USER_IMPORT' as const }));
    await compendiumDb.spells.bulkPut(tagged);
    return { committedCount: tagged.length, destination: 'compendiumDb.spells' };
  }

  if (recs.items && recs.items.length > 0) {
    const tagged = recs.items.map((i) => ({ ...i, packageId, origin: 'USER_IMPORT' as const }));
    await compendiumDb.items.bulkPut(tagged);
    return { committedCount: tagged.length, destination: 'compendiumDb.items' };
  }

  if (recs.journals && recs.journals.length > 0) {
    const tagged = recs.journals.map((j) => ({ ...j, packageId }));
    await compendiumDb.journal.bulkPut(tagged);
    return { committedCount: tagged.length, destination: 'compendiumDb.journal' };
  }

  return { committedCount: 0, destination: 'none' };
}

// ── Normalizers ───────────────────────────────────────────────────────────────

function sanitizeSourceBook(filename: string): string {
  if (!filename) return 'User Ingestion';
  return filename.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
}

function normalize5eToolsMonster(m: any, sourceBook: string): CompendiumMonster {
  const id = `monster-${m.name?.toLowerCase().replace(/\s+/g, '-') || Math.random().toString(36).slice(2, 9)}`;
  let acVal = 10;
  if (typeof m.ac === 'number') acVal = m.ac;
  else if (Array.isArray(m.ac) && m.ac[0]) {
    acVal = typeof m.ac[0] === 'number' ? m.ac[0] : m.ac[0].ac || 10;
  }

  let hpVal = 10;
  if (typeof m.hp === 'number') hpVal = m.hp;
  else if (m.hp?.average) hpVal = m.hp.average;

  const crVal = typeof m.cr === 'string' ? (m.cr.includes('/') ? 0.5 : parseFloat(m.cr) || 1) : m.cr || 1;

  const actions = Array.isArray(m.action)
    ? m.action.map((a: any) => ({
        name: a.name || 'Action',
        description: Array.isArray(a.entries) ? a.entries.join(' ') : String(a.entries || ''),
      }))
    : [];

  return {
    id,
    name: m.name || 'Unknown Monster',
    cr: crVal,
    size: m.size ? String(m.size) : 'Medium',
    type: m.type ? (typeof m.type === 'string' ? m.type : m.type.type || 'monstrosity') : 'humanoid',
    alignment: m.alignment ? String(m.alignment) : 'unaligned',
    ac: acVal,
    hp: hpVal,
    speed: typeof m.speed === 'string' ? m.speed : m.speed?.walk ? `${m.speed.walk} ft.` : '30 ft.',
    str: m.str || 10,
    dex: m.dex || 10,
    con: m.con || 10,
    int: m.int || 10,
    wis: m.wis || 10,
    cha: m.cha || 10,
    actions,
    sourceBook: m.source || sourceBook,
    packageId: 'user-import',
    origin: 'USER_IMPORT',
  };
}

function normalizeOpen5eMonster(m: any, sourceBook: string): CompendiumMonster {
  const id = `monster-${m.slug || m.name?.toLowerCase().replace(/\s+/g, '-') || Math.random().toString(36).slice(2, 9)}`;
  const crVal = typeof m.cr === 'string' ? (m.cr.includes('/') ? 0.5 : parseFloat(m.cr) || 1) : m.cr || 1;

  const actions = Array.isArray(m.actions)
    ? m.actions.map((a: any) => ({
        name: a.name || 'Action',
        description: a.desc || '',
      }))
    : [];

  return {
    id,
    name: m.name || 'Unknown Monster',
    cr: crVal,
    size: m.size || 'Medium',
    type: m.type || 'monstrosity',
    alignment: m.alignment || 'unaligned',
    ac: m.armor_class || m.ac || 10,
    hp: m.hit_points || m.hp || 10,
    speed: typeof m.speed === 'string' ? m.speed : m.speed?.walk ? `${m.speed.walk} ft.` : '30 ft.',
    str: m.strength || m.str || 10,
    dex: m.dexterity || m.dex || 10,
    con: m.constitution || m.con || 10,
    int: m.intelligence || m.int || 10,
    wis: m.wisdom || m.wis || 10,
    cha: m.charisma || m.cha || 10,
    actions,
    sourceBook: m.document__title || sourceBook,
    packageId: 'user-import',
    origin: 'USER_IMPORT',
  };
}

function normalize5eToolsSpell(s: any, sourceBook: string): CompendiumSpell {
  const id = `spell-${s.name?.toLowerCase().replace(/\s+/g, '-') || Math.random().toString(36).slice(2, 9)}`;
  const desc = Array.isArray(s.entries) ? s.entries.join('\n\n') : String(s.entries || '');

  return {
    id,
    name: s.name || 'Unknown Spell',
    level: s.level ?? 1,
    school: s.school || 'Evocation',
    parentClass: s.classes?.fromClassList?.map((c: any) => c.name) || ['Wizard'],
    castingTime: s.time?.[0] ? `${s.time[0].number} ${s.time[0].unit}` : '1 action',
    range: s.range?.distance ? `${s.range.distance.amount} ${s.range.distance.type}` : '60 feet',
    components: s.components ? Object.keys(s.components).join(', ').toUpperCase() : 'V, S',
    duration: s.duration?.[0] ? `${s.duration[0].type}` : 'Instantaneous',
    description: desc,
    sourceBook: s.source || sourceBook,
    packageId: 'user-import',
    origin: 'USER_IMPORT',
  };
}

function normalizeOpen5eSpell(s: any, sourceBook: string): CompendiumSpell {
  const id = `spell-${s.slug || s.name?.toLowerCase().replace(/\s+/g, '-') || Math.random().toString(36).slice(2, 9)}`;

  return {
    id,
    name: s.name || 'Unknown Spell',
    level: s.level_int ?? s.level ?? 1,
    school: s.school || 'Evocation',
    parentClass: s.dnd_class ? s.dnd_class.split(',').map((c: string) => c.trim()) : ['Wizard'],
    castingTime: s.casting_time || '1 action',
    range: s.range || '60 feet',
    components: s.components || 'V, S',
    duration: s.duration || 'Instantaneous',
    description: s.desc || '',
    sourceBook: s.document__title || sourceBook,
    packageId: 'user-import',
    origin: 'USER_IMPORT',
  };
}

function normalize5eToolsItem(i: any, sourceBook: string): CompendiumItem {
  const id = `item-${i.name?.toLowerCase().replace(/\s+/g, '-') || Math.random().toString(36).slice(2, 9)}`;
  const desc = Array.isArray(i.entries) ? i.entries.join('\n\n') : String(i.entries || '');

  return {
    id,
    name: i.name || 'Unknown Item',
    type: i.type || 'Gear',
    rarity: i.rarity || 'Common',
    damage: i.dmg1 || undefined,
    armorClass: i.ac || undefined,
    properties: i.property ? (Array.isArray(i.property) ? i.property : [i.property]) : [],
    description: desc,
    weight: i.weight || undefined,
    cost: i.value ? `${i.value} cp` : undefined,
    sourceBook: i.source || sourceBook,
    packageId: 'user-import',
    origin: 'USER_IMPORT',
  };
}

function normalizeGenericItem(i: any, sourceBook: string): CompendiumItem {
  const id = `item-${i.slug || i.name?.toLowerCase().replace(/\s+/g, '-') || Math.random().toString(36).slice(2, 9)}`;

  return {
    id,
    name: i.name || 'Unknown Item',
    type: i.type || i.equipment_category || 'Gear',
    rarity: i.rarity || 'Common',
    damage: i.damage?.damage_dice || i.damage || undefined,
    armorClass: i.armor_class?.base || i.armor_class || undefined,
    properties: Array.isArray(i.properties) ? i.properties.map((p: any) => p.name || p) : [],
    description: i.desc || i.description || '',
    weight: i.weight || undefined,
    cost: typeof i.cost === 'string' ? i.cost : i.cost?.quantity ? `${i.cost.quantity} ${i.cost.unit}` : undefined,
    sourceBook: i.document__title || sourceBook,
    packageId: 'user-import',
    origin: 'USER_IMPORT',
  };
}

function parseMarkdownMonsters(text: string, sourceBook: string): CompendiumMonster[] {
  const monsters: CompendiumMonster[] = [];
  const blocks = text.split(/(?:^|\n)##\s+/).filter((b) => b.trim().length > 0);

  for (const block of blocks) {
    const lines = block.split('\n');
    const name = lines[0]?.replace(/[#*]/g, '').trim();
    if (!name) continue;

    const acMatch = block.match(/(?:Armor Class|AC)\*?\*?[:\s]+(\d+)/i);
    const hpMatch = block.match(/(?:Hit Points|HP)\*?\*?[:\s]+(\d+)/i);
    const crMatch = block.match(/(?:Challenge|CR)\*?\*?[:\s]+([\d/]+)/i);
    const typeMatch = lines[1]?.replace(/[#*_]/g, '').trim() || 'humanoid';

    const ac = acMatch ? parseInt(acMatch[1], 10) : 10;
    const hp = hpMatch ? parseInt(hpMatch[1], 10) : 10;
    const crStr = crMatch ? crMatch[1] : '1';
    const cr = crStr.includes('/') ? 0.5 : parseFloat(crStr) || 1;

    monsters.push({
      id: `monster-${name.toLowerCase().replace(/\s+/g, '-')}`,
      name,
      cr,
      size: 'Medium',
      type: typeMatch,
      alignment: 'unaligned',
      ac,
      hp,
      speed: '30 ft.',
      str: 10,
      dex: 10,
      con: 10,
      int: 10,
      wis: 10,
      cha: 10,
      actions: [{ name: 'Attack', description: 'Basic attack action.' }],
      sourceBook,
      packageId: 'user-import',
      origin: 'USER_IMPORT',
    });
  }

  return monsters;
}

function parseMarkdownSpells(text: string, sourceBook: string): CompendiumSpell[] {
  const spells: CompendiumSpell[] = [];
  const blocks = text.split(/(?:^|\n)##\s+/).filter((b) => b.trim().length > 0);

  for (const block of blocks) {
    const lines = block.split('\n');
    const name = lines[0]?.replace(/[#*]/g, '').trim();
    if (!name) continue;

    const levelMatch = block.match(/(\d+)(?:st|nd|rd|th)[-\s]level/i);
    const level = levelMatch ? parseInt(levelMatch[1], 10) : /cantrip/i.test(block) ? 0 : 1;
    const schoolMatch = block.match(/\b(abjuration|conjuration|divination|enchantment|evocation|illusion|necromancy|transmutation)\b/i);

    spells.push({
      id: `spell-${name.toLowerCase().replace(/\s+/g, '-')}`,
      name,
      level,
      school: schoolMatch ? schoolMatch[1] : 'Evocation',
      parentClass: ['Wizard'],
      castingTime: '1 action',
      range: '60 feet',
      components: 'V, S',
      duration: 'Instantaneous',
      description: block,
      sourceBook,
      packageId: 'user-import',
      origin: 'USER_IMPORT',
    });
  }

  return spells;
}

function chunkNarrativeMarkdown(text: string, sourceBook: string): CompendiumJournal[] {
  const journals: CompendiumJournal[] = [];
  const sections = text.split(/(?:^|\n)(?=#+\s+)/).filter((s) => s.trim().length > 0);

  for (const sec of sections) {
    const headerMatch = sec.match(/^#+\s+(.+)$/m);
    const title = headerMatch ? headerMatch[1].trim() : 'Untitled Note';
    const id = `journal-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;

    journals.push({
      id,
      title,
      category: 'Lore',
      content: sec.trim(),
      tags: [sourceBook],
      sourceBook,
      packageId: 'user-import',
      createdAt: Date.now(),
    });
  }

  return journals;
}

async function getImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      return resolve({ width: 0, height: 0 });
    }
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth || 0, height: img.naturalHeight || 0 });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 0, height: 0 });
    };
    img.src = url;
  });
}
