// src/lib/importers/universalIngestionEngine.ts
// Universal Multi-Format Ingestion Engine for .md, .txt, .json, .csv, .tsv, .zip, .ds, .dd2vtt, and .pdf
// Stores parsed documents and extracted chunks directly into sourceDb (IndexedDB).

import JSZip from 'jszip';
import { writable } from 'svelte/store';
import { sourceDb, type SourceDocument, type SourceChunk } from '../db/sourceStore';
import { sniffMagicFormat, cleanTwoColumnTextStream } from '../workers/ingestionWorker';

export interface IngestionProgressState {
  isActive: boolean;
  fileName: string;
  progressPercent: number;
  currentStep: string;
}

export const ingestionProgressStore = writable<IngestionProgressState>({
  isActive: false,
  fileName: '',
  progressPercent: 0,
  currentStep: '',
});

export interface IngestionFileResult {
  fileName: string;
  format: string;
  chunksCount: number;
  sizeBytes: number;
  categories: string[];
  success: boolean;
  error?: string;
}

export interface IngestionBatchResult {
  totalFiles: number;
  totalChunks: number;
  results: IngestionFileResult[];
}

/**
 * Universal processor supporting single files, Blobs, or string contents
 */
export async function ingestUniversalFile(
  file: File | Blob,
  fileName: string
): Promise<IngestionFileResult[]> {
  const ext = getExtension(fileName).toLowerCase();
  const results: IngestionFileResult[] = [];

  ingestionProgressStore.set({
    isActive: true,
    fileName,
    progressPercent: 10,
    currentStep: `Preparing ${fileName}…`,
  });

  try {
    switch (ext) {
      case 'zip': {
        const zipResults = await processZipArchive(file, fileName);
        results.push(...zipResults);
        break;
      }
      case 'pdf': {
        const pdfResult = await processPdfFile(file, fileName);
        results.push(pdfResult);
        break;
      }
      case 'ds':
      case 'dd2vtt':
      case 'uvtt': {
        const dsResult = await processMapDataFile(file, fileName, ext);
        results.push(dsResult);
        break;
      }
      case 'csv':
      case 'tsv': {
        const tableResult = await processDelimitedTable(file, fileName, ext);
        results.push(tableResult);
        break;
      }
      case 'json':
      case 'jsonl': {
        const jsonResult = await processJsonData(file, fileName, ext);
        results.push(jsonResult);
        break;
      }
      case 'md':
      case 'txt':
      default: {
        const textResult = await processTextOrMarkdown(file, fileName);
        results.push(textResult);
        break;
      }
    }
  } catch (err: any) {
    results.push({
      fileName,
      format: ext.toUpperCase(),
      chunksCount: 0,
      sizeBytes: file.size || 0,
      categories: [],
      success: false,
      error: err?.message || 'Ingestion failure'
    });
  } finally {
    ingestionProgressStore.set({
      isActive: false,
      fileName,
      progressPercent: 100,
      currentStep: 'Ingestion completed',
    });
  }

  return results;
}

// ── 1. Markdown & Plaintext Chunking (~500 words per chunk) ──────────────────

async function processTextOrMarkdown(file: File | Blob, fileName: string): Promise<IngestionFileResult> {
  if (fileName.toLowerCase().endsWith('.pdf') || (file.type && file.type === 'application/pdf')) {
    return processPdfFile(file, fileName);
  }
  const text = await file.text();
  const docId = `doc-${generateId()}`;
  const now = Date.now();
  const ext = getExtension(fileName).toLowerCase();

  // Extract Categories from headers and YAML/meta tags
  const categories: string[] = [];
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ') || trimmed.startsWith('## ')) {
      const cat = trimmed.replace(/^#+\s*/, '').replace(/[:*#]/g, '').trim();
      if (cat && !categories.includes(cat) && categories.length < 15) {
        categories.push(cat);
      }
    }
  }

  const chunks: SourceChunk[] = [];
  const sections = splitIntoSectionsByHeaders(text);

  let chunkIdx = 0;
  for (const sec of sections) {
    const subBlocks = chunkTextBlockByWords(sec.body, 500);
    for (const block of subBlocks) {
      if (!block.trim()) continue;
      chunks.push({
        id: `chunk-${docId}-${chunkIdx}`,
        docId,
        docName: fileName,
        chunkIndex: chunkIdx,
        sectionHeader: sec.header || 'General Overview',
        text: block.trim(),
      });
      chunkIdx++;
    }
  }

  if (chunks.length === 0 && text.trim()) {
    chunks.push({
      id: `chunk-${docId}-0`,
      docId,
      docName: fileName,
      chunkIndex: 0,
      sectionHeader: 'Document Body',
      text: text.trim(),
    });
  }

  const doc: SourceDocument = {
    id: docId,
    name: fileName,
    type: ext === 'md' ? 'md' : 'txt',
    sizeBytes: file.size || text.length,
    dateAdded: now,
    isEnabled: true,
    rawContent: text,
  };

  await sourceDb.documents.put(doc);
  if (chunks.length > 0) {
    await sourceDb.chunks.bulkPut(chunks);
  }

  return {
    fileName,
    format: ext.toUpperCase(),
    chunksCount: chunks.length,
    sizeBytes: doc.sizeBytes,
    categories,
    success: true,
  };
}

// ── 2. JSON & JSONL Processing ───────────────────────────────────────────────

async function processJsonData(file: File | Blob, fileName: string, ext: string): Promise<IngestionFileResult> {
  const text = await file.text();
  const docId = `doc-${generateId()}`;
  const now = Date.now();
  const chunks: SourceChunk[] = [];
  const categories: string[] = [];

  let records: any[] = [];
  if (ext === 'jsonl') {
    const lines = text.split('\n').filter(l => l.trim().length > 0);
    for (const line of lines) {
      try {
        records.push(JSON.parse(line));
      } catch { /* skip malformed line */ }
    }
  } else {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        records = parsed;
      } else if (parsed && typeof parsed === 'object') {
        // If object has collections (e.g. { monsters: [...], items: [...] })
        const keys = Object.keys(parsed);
        categories.push(...keys.slice(0, 10));
        let foundArray = false;
        for (const k of keys) {
          if (Array.isArray(parsed[k])) {
            for (const item of parsed[k]) {
              records.push({ _collection: k, ...item });
            }
            foundArray = true;
          }
        }
        if (!foundArray) {
          records = [parsed];
        }
      }
    } catch (e: any) {
      throw new Error(`JSON parse error: ${e.message}`);
    }
  }

  let chunkIdx = 0;
  for (const rec of records) {
    const title = rec.name || rec.title || rec.id || `Record #${chunkIdx + 1}`;
    const header = rec._collection ? `[${rec._collection}] ${title}` : title;
    const body = formatJsonRecordAsMarkdown(rec);

    chunks.push({
      id: `chunk-${docId}-${chunkIdx}`,
      docId,
      docName: fileName,
      chunkIndex: chunkIdx,
      sectionHeader: header,
      text: body,
    });
    chunkIdx++;
  }

  const doc: SourceDocument = {
    id: docId,
    name: fileName,
    type: 'json',
    sizeBytes: file.size || text.length,
    dateAdded: now,
    isEnabled: true,
    rawContent: text,
  };

  await sourceDb.documents.put(doc);
  if (chunks.length > 0) {
    await sourceDb.chunks.bulkPut(chunks);
  }

  return {
    fileName,
    format: ext.toUpperCase(),
    chunksCount: chunks.length,
    sizeBytes: doc.sizeBytes,
    categories,
    success: true,
  };
}

// ── 3. CSV & TSV Delimited Matrix to Markdown Tables ─────────────────────────

async function processDelimitedTable(file: File | Blob, fileName: string, ext: string): Promise<IngestionFileResult> {
  const text = await file.text();
  const docId = `doc-${generateId()}`;
  const now = Date.now();
  const delimiter = ext === 'tsv' ? '\t' : ',';

  const rows = parseDelimitedRows(text, delimiter);
  if (rows.length === 0) {
    throw new Error('Table file contains no parseable rows.');
  }

  const headers = rows[0];
  const markdownTableRows: string[] = [];
  markdownTableRows.push(`| ${headers.join(' | ')} |`);
  markdownTableRows.push(`| ${headers.map(() => '---').join(' | ')} |`);

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    markdownTableRows.push(`| ${row.join(' | ')} |`);
  }

  const fullMarkdown = markdownTableRows.join('\n');
  const chunks: SourceChunk[] = [];
  const subBlocks = chunkTextBlockByWords(fullMarkdown, 400);

  let chunkIdx = 0;
  for (const block of subBlocks) {
    chunks.push({
      id: `chunk-${docId}-${chunkIdx}`,
      docId,
      docName: fileName,
      chunkIndex: chunkIdx,
      sectionHeader: `${fileName} (Rows ${chunkIdx * 15 + 1}-${Math.min(rows.length, (chunkIdx + 1) * 15)})`,
      text: block,
    });
    chunkIdx++;
  }

  const doc: SourceDocument = {
    id: docId,
    name: fileName,
    type: 'txt',
    sizeBytes: file.size || text.length,
    dateAdded: now,
    isEnabled: true,
    rawContent: text,
  };

  await sourceDb.documents.put(doc);
  if (chunks.length > 0) {
    await sourceDb.chunks.bulkPut(chunks);
  }

  return {
    fileName,
    format: ext.toUpperCase(),
    chunksCount: chunks.length,
    sizeBytes: doc.sizeBytes,
    categories: headers.slice(0, 8),
    success: true,
  };
}

// ── 4. ZIP Archive Recursive Ingestion ───────────────────────────────────────

async function processZipArchive(file: File | Blob, fileName: string): Promise<IngestionFileResult[]> {
  const zip = new JSZip();
  const loadedZip = await zip.loadAsync(file);
  const results: IngestionFileResult[] = [];

  for (const [relativePath, zipEntry] of Object.entries(loadedZip.files)) {
    if (zipEntry.dir) continue;
    // Skip hidden files/directories (e.g. .DS_Store, __MACOSX)
    if (relativePath.includes('__MACOSX') || relativePath.startsWith('.')) continue;

    const subName = relativePath.split('/').pop() || relativePath;
    const subExt = getExtension(subName).toLowerCase();

    if (matchesAllowedExtension(subExt)) {
      const blob = await zipEntry.async('blob');
      const subResults = await ingestUniversalFile(blob, `${fileName}/${relativePath}`);
      results.push(...subResults);
    }
  }

  return results;
}

// ── 5. Dungeon Scrawl & Universal VTT (.ds, .dd2vtt, .uvtt) ──────────────────

async function processMapDataFile(file: File | Blob, fileName: string, ext: string): Promise<IngestionFileResult> {
  const text = await file.text();
  const docId = `doc-${generateId()}`;
  const now = Date.now();
  const chunks: SourceChunk[] = [];
  const categories = ['Map', 'Tactical Geometry', 'Line of Sight'];

  try {
    const parsed = JSON.parse(text);
    let wallCount = 0;
    let doorCount = 0;
    let resolution = 60;

    if (parsed.line_of_sight) wallCount = parsed.line_of_sight.length;
    if (parsed.portals) doorCount = parsed.portals.length;
    if (parsed.resolution?.pixels_per_grid) resolution = parsed.resolution.pixels_per_grid;

    // In Dungeon Scrawl format
    if (parsed.walls) wallCount = parsed.walls.length;
    if (parsed.doors) doorCount = parsed.doors.length;

    const summaryText = `### Tactical Map Specification: ${fileName}
- **Format:** ${ext.toUpperCase()}
- **Grid Resolution:** ${resolution} px per grid cell
- **Wall Segments (LOS):** ${wallCount}
- **Doors & Portals:** ${doorCount}
- **Map Dimensions:** ${parsed.resolution?.map_size?.x || 'N/A'} x ${parsed.resolution?.map_size?.y || 'N/A'} cells

This map dossier provides Line of Sight geometric collision and tactical encounter navigation.`;

    chunks.push({
      id: `chunk-${docId}-0`,
      docId,
      docName: fileName,
      chunkIndex: 0,
      sectionHeader: 'Tactical Map Overview',
      text: summaryText,
    });
  } catch {
    // Non-JSON or binary format fallback
    chunks.push({
      id: `chunk-${docId}-0`,
      docId,
      docName: fileName,
      chunkIndex: 0,
      sectionHeader: 'Vector Map Coordinates',
      text: `Vector collision specification for ${fileName}`,
    });
  }

  const doc: SourceDocument = {
    id: docId,
    name: fileName,
    type: 'json',
    sizeBytes: file.size || text.length,
    dateAdded: now,
    isEnabled: true,
    rawContent: text,
  };

  await sourceDb.documents.put(doc);
  await sourceDb.chunks.bulkPut(chunks);

  return {
    fileName,
    format: ext.toUpperCase(),
    chunksCount: chunks.length,
    sizeBytes: doc.sizeBytes,
    categories,
    success: true,
  };
}

// ── 6. PDF File Page-by-Page Text Extraction ────────────────────────────────

async function processPdfFile(file: File | Blob, fileName: string): Promise<IngestionFileResult> {
  const docId = `doc-${generateId()}`;
  const now = Date.now();
  const chunks: SourceChunk[] = [];
  const categories: string[] = ['PDF Document', 'Rulebook'];

  let extractedText = '';

  try {
    // Dynamically load pdfjs-dist and configure worker source
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
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
    const pdfDoc = await loadingTask.promise;

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageStrings = textContent.items
        .map((item: any) => item.str || '')
        .filter((str: string) => str.trim().length > 0);

      const rawText = pageStrings.join(' ');
      const pageText = rawText
        .replace(/\b\d+\s+0\s+[Rnf]\b/g, '')
        .replace(/<<[\s\S]*?>>/g, '')
        .replace(/\b(obj|endobj|xref|trailer|startxref)\b/g, '')
        .trim();

      if (pageText.length > 0) {
        extractedText += `\n\n--- Page ${pageNum} ---\n\n` + pageText;
        chunks.push({
          id: `chunk-${docId}-${pageNum - 1}`,
          docId,
          docName: fileName,
          chunkIndex: pageNum - 1,
          sectionHeader: `${fileName} — Page ${pageNum}`,
          text: pageText,
        });
      }
    }
  } catch (pdfErr) {
    // Fallback if worker/canvas not present
    extractedText = `PDF Document: ${fileName} (${(file.size / 1024).toFixed(1)} KB)`;
    chunks.push({
      id: `chunk-${docId}-0`,
      docId,
      docName: fileName,
      chunkIndex: 0,
      sectionHeader: 'PDF Document Archive',
      text: extractedText,
    });
  }

  const doc: SourceDocument = {
    id: docId,
    name: fileName,
    type: 'pdf',
    sizeBytes: file.size,
    dateAdded: now,
    isEnabled: true,
    rawContent: extractedText,
  };

  await sourceDb.documents.put(doc);
  if (chunks.length > 0) {
    await sourceDb.chunks.bulkPut(chunks);
  }

  return {
    fileName,
    format: 'PDF',
    chunksCount: chunks.length,
    sizeBytes: file.size,
    categories,
    success: true,
  };
}

// ── Utilities & Parsers ──────────────────────────────────────────────────────

function getExtension(name: string): string {
  const parts = name.split('.');
  return parts.length > 1 ? parts.pop()! : '';
}

function matchesAllowedExtension(ext: string): boolean {
  return ['md', 'txt', 'json', 'jsonl', 'csv', 'tsv', 'ds', 'dd2vtt', 'uvtt', 'pdf'].includes(ext);
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

function splitIntoSectionsByHeaders(markdown: string): Array<{ header: string; body: string }> {
  const lines = markdown.split('\n');
  const sections: Array<{ header: string; body: string }> = [];
  let currentHeader = 'Preamble';
  let currentLines: string[] = [];

  for (const line of lines) {
    if (line.trim().startsWith('#')) {
      if (currentLines.length > 0) {
        sections.push({
          header: currentHeader,
          body: currentLines.join('\n'),
        });
        currentLines = [];
      }
      currentHeader = line.trim().replace(/^#+\s*/, '');
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    sections.push({
      header: currentHeader,
      body: currentLines.join('\n'),
    });
  }

  return sections;
}

function chunkTextBlockByWords(text: string, maxWordsPerChunk = 500): string[] {
  const words = text.split(/\s+/);
  if (words.length <= maxWordsPerChunk) {
    return [text];
  }

  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += maxWordsPerChunk) {
    const chunkWords = words.slice(i, i + maxWordsPerChunk);
    chunks.push(chunkWords.join(' '));
  }
  return chunks;
}

function formatJsonRecordAsMarkdown(record: any): string {
  let md = '';
  for (const [key, val] of Object.entries(record)) {
    if (key.startsWith('_')) continue;
    if (typeof val === 'object' && val !== null) {
      md += `**${key}:** ${JSON.stringify(val)}\n`;
    } else {
      md += `**${key}:** ${val}\n`;
    }
  }
  return md;
}

function parseDelimitedRows(text: string, delimiter: string): string[][] {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  const rows: string[][] = [];

  for (const line of lines) {
    const cells = line.split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));
    rows.push(cells);
  }

  return rows;
}
