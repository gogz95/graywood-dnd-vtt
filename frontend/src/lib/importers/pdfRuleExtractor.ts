// src/lib/importers/pdfRuleExtractor.ts
// In-browser client-side 5e rule & entity extractor leveraging pdfjs-dist and regex heuristics.
// Ingests PDFs, markdown, or text sourcebooks, extracting Spells, Subclasses, Facilities, and Monsters.
// Inserts into compendiumDb with origin: 'USER_IMPORT' and packageId, then evaluates detectHomebrewRules.

import {
  compendiumDb,
  type CompendiumSpell,
  type CompendiumSubclass,
  type CompendiumMonster,
  type CompendiumFacility
} from '../db/compendiumDb';
import { detectHomebrewRules, type RuleDetectionResult } from './ruleDetector';
import { notifyMonstersUpdated } from '../services/ingestPipeline';

import type { IngestedTable } from '../types/compendium';

export interface ExtractionResult {
  packageId: string;
  sourceName: string;
  spellsExtracted: CompendiumSpell[];
  subclassesExtracted: CompendiumSubclass[];
  monstersExtracted: CompendiumMonster[];
  facilitiesExtracted: CompendiumFacility[];
  tablesExtracted: IngestedTable[];
  detectedHomebrewRules: RuleDetectionResult[];
  rawChunks: string[];
}

export function slugifyPackageName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.[^/.]+$/, '') // remove extension
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'custom-package';
}

/**
 * Parses raw text from a PDF file using pdfjs-dist
 */
export async function extractPdfTextPages(file: File | Blob | ArrayBuffer | Uint8Array): Promise<string[]> {
  const pdfjsLib = await import('pdfjs-dist');
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url
      ).toString();
    } catch {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '4.0.379'}/build/pdf.worker.min.mjs`;
    }
  }

  let buffer: Uint8Array;
  if (file instanceof Uint8Array) {
    buffer = file;
  } else if (file instanceof ArrayBuffer) {
    buffer = new Uint8Array(file);
  } else {
    const arrayBuffer = await file.arrayBuffer();
    buffer = new Uint8Array(arrayBuffer);
  }

  const loadingTask = pdfjsLib.getDocument({ data: buffer });
  const pdfDoc = await loadingTask.promise;
  const pagesText: string[] = [];

  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageStrings = textContent.items
      .map((item: any) => item.str || '')
      .filter((str: string) => str.trim().length > 0);

    const rawText = pageStrings.join(' ');
    const cleanText = rawText
      .replace(/\b\d+\s+0\s+[Rnf]\b/g, '')
      .replace(/<<[\s\S]*?>>/g, '')
      .replace(/\b(obj|endobj|xref|trailer|startxref)\b/g, '')
      .trim();

    if (cleanText.length > 0) {
      pagesText.push(cleanText);
    }
  }

  return pagesText;
}

/**
 * Heuristically parses structured 5e Spells from text
 */
export function parseSpellsFromText(text: string, sourceName: string, packageId: string): CompendiumSpell[] {
  const spells: CompendiumSpell[] = [];

  // Match pattern: Spell Name\n[Level] [School]\nCasting Time: ...
  const spellRegex = /(?:^|\n)([A-Z][A-Za-z\s'-]{2,30})\n(?:([1-9]|cantrip)(?:st|nd|rd|th)?[- ]level\s+([a-z]+)|([a-z]+)\s+cantrip)\b[\s\S]*?(?=Casting Time:\s*([^\n]+))[\s\S]*?(?=Range:\s*([^\n]+))[\s\S]*?(?=Components:\s*([^\n]+))[\s\S]*?(?=Duration:\s*([^\n]+))([\s\S]*?)(?=(?:\n[A-Z][A-Za-z\s'-]{2,30}\n(?:[1-9]|cantrip)|$))/gi;

  let match: RegExpExecArray | null;
  while ((match = spellRegex.exec(text)) !== null) {
    const name = match[1]?.trim();
    const levelStr = (match[2] || (match[4] ? '0' : '1')).toLowerCase();
    const level = levelStr.includes('cantrip') ? 0 : parseInt(levelStr, 10) || 1;
    const school = (match[3] || match[4] || 'Evocation').trim();
    const castingTime = match[5]?.trim() || '1 action';
    const range = match[6]?.trim() || '60 feet';
    const components = match[7]?.trim() || 'V, S';
    const duration = match[8]?.trim() || 'Instantaneous';
    const descRaw = match[9]?.trim() || '';

    if (name && name.length < 35 && !name.includes('Chapter') && !name.includes('Table')) {
      spells.push({
        id: `spell-${packageId}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        name,
        level,
        school: school.charAt(0).toUpperCase() + school.slice(1),
        parentClass: inferParentClasses(name, descRaw),
        castingTime,
        range,
        components,
        duration,
        description: descRaw.slice(0, 1000),
        sourceBook: sourceName,
        packageId,
        origin: 'USER_IMPORT'
      });
    }
  }

  return spells;
}

function inferParentClasses(spellName: string, desc: string): string[] {
  const classes: string[] = [];
  const lower = `${spellName} ${desc}`.toLowerCase();
  const all5eClasses = ['Bard', 'Cleric', 'Druid', 'Paladin', 'Ranger', 'Sorcerer', 'Warlock', 'Wizard'];

  for (const c of all5eClasses) {
    if (lower.includes(c.toLowerCase())) {
      classes.push(c);
    }
  }

  return classes.length > 0 ? classes : ['Wizard', 'Sorcerer'];
}

/**
 * Heuristically parses structured 5e Subclasses from text
 */
export function parseSubclassesFromText(text: string, sourceName: string, packageId: string): CompendiumSubclass[] {
  const subclasses: CompendiumSubclass[] = [];
  const classPatterns = [
    { parentClass: 'Fighter', regex: /(?:Martial Archetype|Fighter Archetype|Fighter Subclass)[\s:\n]+([A-Z][A-Za-z\s'-]{2,30})/gi },
    { parentClass: 'Wizard', regex: /(?:Arcane Tradition|Wizard Tradition|Wizard Subclass)[\s:\n]+(?:School of\s+)?([A-Z][A-Za-z\s'-]{2,30})/gi },
    { parentClass: 'Rogue', regex: /(?:Roguish Archetype|Rogue Archetype|Rogue Subclass)[\s:\n]+([A-Z][A-Za-z\s'-]{2,30})/gi },
    { parentClass: 'Cleric', regex: /(?:Divine Domain|Cleric Domain|Cleric Subclass)[\s:\n]+([A-Z][A-Za-z\s'-]{2,30})/gi },
    { parentClass: 'Paladin', regex: /(?:Sacred Oath|Paladin Oath|Paladin Subclass)[\s:\n]+(?:Oath of\s+)?([A-Z][A-Za-z\s'-]{2,30})/gi },
    { parentClass: 'Warlock', regex: /(?:Otherworldly Patron|Warlock Patron|Warlock Subclass)[\s:\n]+([A-Z][A-Za-z\s'-]{2,30})/gi },
    { parentClass: 'Sorcerer', regex: /(?:Sorcerous Origin|Sorcerer Subclass)[\s:\n]+([A-Z][A-Za-z\s'-]{2,30})/gi },
    { parentClass: 'Bard', regex: /(?:Bard College|College of|Bard Subclass)[\s:\n]+([A-Z][A-Za-z\s'-]{2,30})/gi },
    { parentClass: 'Druid', regex: /(?:Druid Circle|Circle of|Druid Subclass)[\s:\n]+([A-Z][A-Za-z\s'-]{2,30})/gi },
    { parentClass: 'Barbarian', regex: /(?:Primal Path|Barbarian Path|Barbarian Subclass)[\s:\n]+(?:Path of the\s+)?([A-Z][A-Za-z\s'-]{2,30})/gi },
    { parentClass: 'Monk', regex: /(?:Monastic Tradition|Monk Subclass)[\s:\n]+(?:Way of the\s+)?([A-Z][A-Za-z\s'-]{2,30})/gi },
    { parentClass: 'Ranger', regex: /(?:Ranger Archetype|Ranger Conclave|Ranger Subclass)[\s:\n]+([A-Z][A-Za-z\s'-]{2,30})/gi }
  ];

  for (const { parentClass, regex } of classPatterns) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const rawName = match[1]?.trim();
      if (rawName && rawName.length < 35 && !rawName.includes('Table') && !rawName.includes('Feature')) {
        const name = rawName.startsWith('School of') || rawName.startsWith('Oath of') || rawName.startsWith('Way of')
          ? rawName
          : `${parentClass === 'Wizard' ? 'School of ' : parentClass === 'Paladin' ? 'Oath of ' : ''}${rawName}`;

        subclasses.push({
          id: `subclass-${packageId}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          parentClass,
          name,
          featuresByLevel: {
            3: [`${name} Primary Archetype Feature`],
            7: [`${name} Utility Specialization`],
            10: [`${name} Advanced Mastery`],
            15: [`${name} Pinnacle Execution`]
          },
          sourceBook: sourceName,
          packageId,
          origin: 'USER_IMPORT'
        });
      }
    }
  }

  return subclasses;
}

/**
 * Heuristically parses Stronghold/Bastion Facilities from text
 */
export function parseFacilitiesFromText(text: string, sourceName: string, packageId: string): CompendiumFacility[] {
  const facilities: CompendiumFacility[] = [];
  const facilityRegex = /(?:(?:Facility|Room|Stronghold Upgrade):\s*)?([A-Z][A-Za-z '-]{2,30})\b[\s\S]*?(?:Category:\s*([A-Za-z]+)\b)?[\s\S]*?(?:Cost|Gold):\s*([0-9,]+)\s*(?:gp|gold)[\s\S]*?(?:Time|Build Time|Build Days|Days):\s*([0-9]+)\s*days?([\s\S]*?)(?=(?:Facility|Room|Stronghold Upgrade):|\n[A-Z][A-Za-z '-]{2,30}\n(?:Category|Cost):|$)/gi;

  let match: RegExpExecArray | null;
  while ((match = facilityRegex.exec(text)) !== null) {
    const name = match[1]?.trim();
    const explicitCategory = match[2]?.trim();
    const goldCost = parseInt(match[3]?.replace(/,/g, '') || '1000', 10) || 1000;
    const buildDays = parseInt(match[4] || '30', 10) || 30;
    const benefits = match[5]?.trim().slice(0, 500) || 'Provides stronghold defensive and operational utility.';

    if (name && name.length < 35 && !name.includes('Chapter') && !name.includes('Table')) {
      let category: CompendiumFacility['category'] = 'Military';
      if (explicitCategory && ['Crafting', 'Military', 'Arcane', 'Commerce', 'Espionage'].includes(explicitCategory)) {
        category = explicitCategory as CompendiumFacility['category'];
      } else {
        const lower = `${name} ${benefits}`.toLowerCase();
        if (lower.includes('magic') || lower.includes('scroll') || lower.includes('arcane')) category = 'Arcane';
        else if (lower.includes('forge') || lower.includes('craft') || lower.includes('smith')) category = 'Crafting';
        else if (lower.includes('market') || lower.includes('trade') || lower.includes('vault')) category = 'Commerce';
        else if (lower.includes('shadow') || lower.includes('spy') || lower.includes('scout')) category = 'Espionage';
      }

      facilities.push({
        id: `facility-${packageId}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        name,
        category,
        goldCost,
        buildDays,
        benefits,
        sourceBook: sourceName,
        packageId,
        origin: 'USER_IMPORT'
      });
    }
  }

  return facilities;
}

/**
 * Heuristically parses Monster stat blocks from text
 */
export function parseMonstersFromText(text: string, sourceName: string, packageId: string): CompendiumMonster[] {
  const monsters: CompendiumMonster[] = [];

  // Match: Monster Name \n Armor Class [AC] \n Hit Points [HP]
  const monsterRegex = /(?:^|\n)([A-Z][A-Za-z\s'-]{2,30})\n(?:(Tiny|Small|Medium|Large|Huge|Gargantuan)\s+([a-z\s(),]+),\s+([a-z\s]+))\b[\s\S]*?Armor Class\s+([0-9]{1,2})[\s\S]*?Hit Points\s+([0-9]{1,4})[\s\S]*?Speed\s+([0-9a-z\s,.]+)[\s\S]*?Challenge\s+([0-9/]+)/gi;

  let match: RegExpExecArray | null;
  while ((match = monsterRegex.exec(text)) !== null) {
    const name = match[1]?.trim();
    const size = match[2]?.trim() || 'Medium';
    const type = match[3]?.trim() || 'Humanoid';
    const alignment = match[4]?.trim() || 'Neutral';
    const ac = parseInt(match[5], 10) || 10;
    const hp = parseInt(match[6], 10) || 10;
    const speed = match[7]?.trim() || '30 ft.';
    const crStr = match[8]?.trim() || '1';
    let cr = 1;
    if (crStr === '1/8') cr = 0.125;
    else if (crStr === '1/4') cr = 0.25;
    else if (crStr === '1/2') cr = 0.5;
    else cr = parseFloat(crStr) || 1;

    if (name && name.length < 35 && !name.includes('Table') && !name.includes('Figure')) {
      monsters.push({
        id: `monster-${packageId}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        name,
        cr,
        size,
        type,
        alignment,
        ac,
        hp,
        speed,
        str: 10,
        dex: 10,
        con: 10,
        int: 10,
        wis: 10,
        cha: 10,
        actions: [
          { name: 'Attack', description: `Standard creature attack roll with AC ${ac}.` }
        ],
        sourceBook: sourceName,
        packageId,
        origin: 'USER_IMPORT'
      });
    }
  }

  return monsters;
}

/**
 * Master In-Browser Extraction Pipeline:
 * Ingests a file/blob/text, extracts spells, subclasses, monsters, and facilities,
 * bulk inserts them into compendiumDb, and tests for modular homebrew rules.
 */
export async function extractAndStoreCompendiumSource(
  fileOrText: File | Blob | string,
  fileName: string
): Promise<ExtractionResult> {
  const packageId = slugifyPackageName(fileName);
  let chunks: string[] = [];

  if (typeof fileOrText === 'string') {
    chunks = [fileOrText];
  } else if (fileName.endsWith('.pdf')) {
    chunks = await extractPdfTextPages(fileOrText);
  } else {
    const text = await fileOrText.text();
    chunks = [text];
  }

  const fullText = chunks.join('\n\n');

  // Extract entities
  const spellsExtracted = parseSpellsFromText(fullText, fileName, packageId);
  const subclassesExtracted = parseSubclassesFromText(fullText, fileName, packageId);
  const facilitiesExtracted = parseFacilitiesFromText(fullText, fileName, packageId);
  const monstersExtracted = parseMonstersFromText(fullText, fileName, packageId);

  // Extract GFM pipe tables
  const tablesExtracted: IngestedTable[] = [];
  const tableRegex = /((?:^[ \t]*\|[^\n]+\|[ \t]*(?:\n|$))+)/gm;
  let tableMatch: RegExpExecArray | null;
  let tableIdx = 1;
  while ((tableMatch = tableRegex.exec(fullText)) !== null) {
    const rawTable = tableMatch[1].trim();
    const lines = rawTable.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length >= 2) {
      const parseCells = (rowStr: string): string[] => {
        return rowStr.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      };
      const headers = parseCells(lines[0]);
      const hasSeparator = /^\|?([ \t]*:?-+:?[ \t]*\|)+[ \t]*:?-+:?[ \t]*\|?$/.test(lines[1]);
      const bodyLines = hasSeparator ? lines.slice(2) : lines.slice(1);
      const rows = bodyLines.map(parseCells);
      const precedingText = fullText.slice(Math.max(0, tableMatch.index - 200), tableMatch.index);
      const titleMatch = precedingText.match(/(?:^|\n)(?:#{1,6}\s+)?([^\n]+)\n*$/);
      const name = titleMatch ? titleMatch[1].replace(/^[#\s*_-]+|[#\s*_-]+$/g, '').trim() : `Table ${tableIdx}`;
      const diceMatch = (name + ' ' + headers.join(' ')).match(/\b(d\d+|1?d[468]|1?d10|1?d12|1?d20|1?d100)\b/i);

      tablesExtracted.push({
        name: name || `Table ${tableIdx}`,
        category: 'Roll Table',
        source: fileName,
        headers,
        rows,
        diceFormula: diceMatch ? diceMatch[1].toLowerCase() : undefined,
        rawMarkdown: rawTable
      });
      tableIdx++;
    }
  }

  // Bulk persist to compendiumDb
  if (spellsExtracted.length > 0) {
    await compendiumDb.spells.bulkPut(spellsExtracted);
  }
  if (subclassesExtracted.length > 0) {
    await compendiumDb.subclasses.bulkPut(subclassesExtracted);
  }
  if (facilitiesExtracted.length > 0) {
    await compendiumDb.facilities.bulkPut(facilitiesExtracted);
  }
  if (monstersExtracted.length > 0) {
    await compendiumDb.monsters.bulkPut(monstersExtracted);
  }
  if (tablesExtracted.length > 0 && 'tables' in compendiumDb) {
    await compendiumDb.tables.bulkAdd(tablesExtracted);
  }

  await notifyMonstersUpdated();

  // Scan text chunks with Phase 2 heuristic detector
  const detectedHomebrewRules = detectHomebrewRules(chunks);

  return {
    packageId,
    sourceName: fileName,
    spellsExtracted,
    subclassesExtracted,
    monstersExtracted,
    facilitiesExtracted,
    tablesExtracted,
    detectedHomebrewRules,
    rawChunks: chunks
  };
}
