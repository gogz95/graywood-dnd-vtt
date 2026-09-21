// src/lib/services/dualEngineIngest.ts
// Dual-Engine Ingestion Architecture: Mode A (Deterministic) vs Mode B (LLM) with automatic offline fallback

import { compendiumDb } from '../db/compendiumDb';
import type { IngestedTable, IngestResult } from '../types/compendium';
import { bestiaryStore } from '../stores/bestiaryStore.svelte';
import { compendiumStore } from '../stores/compendiumStore.svelte';
import { parseMonstersFromText, parseSpellsFromText } from '../importers/pdfRuleExtractor';

export type IngestionMode = 'deterministic' | 'llm' | 'auto';

export interface IngestOptions {
  mode?: IngestionMode;
  sourceName?: string;
  category?: string;
  ollamaUrl?: string;
  model?: string;
}

/**
 * Mode A: Deterministic Parser using Regex & GFM table/entity heuristics
 */
export function parseDeterministic(rawText: string, sourceName: string = 'Imported Source'): IngestResult {
  const normalized = rawText.replace(/\r\n/g, '\n');
  const packageId = sourceName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'imported';

  // 1. Extract GFM Pipe Tables
  const tables: IngestedTable[] = [];
  const tableRegex = /((?:^[ \t]*\|[^\n]+\|[ \t]*(?:\n|$))+)/gm;
  let match: RegExpExecArray | null;
  let tableCounter = 1;

  while ((match = tableRegex.exec(normalized)) !== null) {
    const rawTable = match[1].trim();
    const lines = rawTable.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length >= 2) {
      const parseCells = (rowStr: string): string[] => {
        return rowStr.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      };

      const headers = parseCells(lines[0]);
      const hasSeparator = /^\|?([ \t]*:?-+:?[ \t]*\|)+[ \t]*:?-+:?[ \t]*\|?$/.test(lines[1]);
      const bodyLines = hasSeparator ? lines.slice(2) : lines.slice(1);
      const rows = bodyLines.map(parseCells);

      // Check context before table for title/dice formula
      const precedingText = normalized.slice(Math.max(0, match.index - 200), match.index);
      const titleMatch = precedingText.match(/(?:^|\n)(?:#{1,6}\s+)?([^\n]+)\n*$/);
      const tableName = titleMatch ? titleMatch[1].replace(/^[#\s*_-]+|[#\s*_-]+$/g, '').trim() : `Table ${tableCounter}`;

      // Detect dice formula in headers or table name (e.g. "d100", "d20", "1d6")
      const diceMatch = (tableName + ' ' + headers.join(' ')).match(/\b(d\d+|1?d[468]|1?d10|1?d12|1?d20|1?d100)\b/i);

      tables.push({
        name: tableName || `Table ${tableCounter}`,
        category: 'Roll Table',
        source: sourceName,
        headers,
        rows,
        diceFormula: diceMatch ? diceMatch[1].toLowerCase() : undefined,
        rawMarkdown: rawTable
      });
      tableCounter++;
    }
  }

  // 2. Extract Monsters & Spells using standard SRD heuristic parsers
  const monsters = parseMonstersFromText(normalized, sourceName, packageId);
  const spells = parseSpellsFromText(normalized, sourceName, packageId);
  const items: any[] = [];

  return { monsters, spells, items, tables };
}

/**
 * Mode B: LLM-assisted Parser querying Ollama with automatic offline fallback to Mode A
 */
export async function parseWithLlm(
  rawText: string,
  sourceName: string = 'Imported Source',
  ollamaUrl: string = 'http://127.0.0.1:11434',
  model: string = 'qwen2.5:7b'
): Promise<IngestResult> {
  const prompt = `You are a D&D 5e data extraction engine.
Parse the following raw text into a JSON object matching this exact schema:
{
  "monsters": [],
  "spells": [],
  "items": [],
  "tables": [
    {
      "name": "Table Name",
      "category": "Random Encounter / Loot / etc",
      "headers": ["d20", "Result"],
      "rows": [["1", "Option A"], ["2", "Option B"]],
      "diceFormula": "d20"
    }
  ]
}
Return pure JSON ONLY with no explanations or markdown backticks.

Raw Text:
${rawText.slice(0, 4000)}`;

  try {
    const res = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        format: 'json',
        options: { temperature: 0.1 }
      })
    });

    if (res.ok) {
      const data = await res.json() as { response: string };
      const parsed = JSON.parse(data.response);
      if (parsed && typeof parsed === 'object') {
        return {
          monsters: Array.isArray(parsed.monsters) ? parsed.monsters : [],
          spells: Array.isArray(parsed.spells) ? parsed.spells : [],
          items: Array.isArray(parsed.items) ? parsed.items : [],
          tables: (Array.isArray(parsed.tables) ? parsed.tables : []).map((t: any) => ({
            ...t,
            source: sourceName
          }))
        };
      }
    }
  } catch {
    // Ollama unreachable / error -> seamlessly fall through to Mode A
  }

  // Automatic offline fallback
  return parseDeterministic(rawText, sourceName);
}

/**
 * Master Ingest Pipeline: Parses with Mode A or Mode B, commits Dexie batch transaction,
 * hydrates reactive stores, and triggers synchronisation signals.
 */
export async function executeIngestion(
  rawText: string,
  options: IngestOptions = {}
): Promise<IngestResult> {
  const sourceName = options.sourceName || 'Imported Source';
  let result: IngestResult;

  if (options.mode === 'llm') {
    result = await parseWithLlm(rawText, sourceName, options.ollamaUrl, options.model);
  } else {
    result = parseDeterministic(rawText, sourceName);
  }

  // Batch Transaction to Dexie compendiumDb
  const tablesToSave = result.tables;
  const monstersToSave = result.monsters;
  const spellsToSave = result.spells;

  await compendiumDb.transaction('rw', [compendiumDb.monsters, compendiumDb.spells, compendiumDb.ingestedTables], async () => {
    if (monstersToSave.length > 0) {
      await compendiumDb.monsters.bulkPut(monstersToSave);
    }
    if (spellsToSave.length > 0) {
      await compendiumDb.spells.bulkPut(spellsToSave);
    }
    if (tablesToSave.length > 0) {
      await compendiumDb.ingestedTables.bulkAdd(tablesToSave);
    }
  });

  // Hydrate reactive stores & dispatch system synchronisation events
  await bestiaryStore.refreshFromDb?.();
  await compendiumStore.refreshFromDb?.();

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('compendium:monsters-updated'));
    window.dispatchEvent(new CustomEvent('compendium:data-synchronized'));
  }

  return result;
}
