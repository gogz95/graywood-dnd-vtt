// src/lib/types/compendium.ts
// Normalized Compendium Data Structures for Table Ingestion & Multi-Source Compendiums

export interface IngestedTable {
  id?: number;
  name: string;
  category: string;
  source: string;
  headers: string[];
  rows: string[][];
  diceFormula?: string;
  rawMarkdown?: string;
}

export interface IngestResult {
  monsters: any[];
  spells: any[];
  items: any[];
  tables: IngestedTable[];
}
