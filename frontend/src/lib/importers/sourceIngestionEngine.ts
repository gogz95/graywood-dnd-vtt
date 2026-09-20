// src/lib/importers/sourceIngestionEngine.ts
// Ingestion engine for Markdown, TXT, and PDF files with ~500-word header-bound chunking

import type { SourceDocument, SourceChunk } from '../db/sourceStore';

/**
 * Extracts raw textual content from an ArrayBuffer of a PDF file using
 * native stream decoding without requiring heavy external dependencies.
 */
export function extractTextFromPdfBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const textDecoder = new TextDecoder('latin1');
  const rawString = textDecoder.decode(bytes);

  const extractedBlocks: string[] = [];

  // Match PDF text streams /BT ... /ET blocks
  const btRegex = /BT[\s\S]*?ET/g;
  let match: RegExpExecArray | null;

  while ((match = btRegex.exec(rawString)) !== null) {
    const stream = match[0];
    // Match literal strings: (text) Tj or [(text) 12 (more)] TJ
    const tjRegex = /\(([^)]*)\)\s*Tj/g;
    let tjMatch: RegExpExecArray | null;
    let blockText = '';

    while ((tjMatch = tjRegex.exec(stream)) !== null) {
      blockText += tjMatch[1] + ' ';
    }

    const tjArrayRegex = /\[(.*?)\]\s*TJ/g;
    let tjArrMatch: RegExpExecArray | null;
    while ((tjArrMatch = tjArrayRegex.exec(stream)) !== null) {
      const inner = tjArrMatch[1];
      const innerStrings = inner.match(/\(([^)]*)\)/g);
      if (innerStrings) {
        blockText += innerStrings.map(s => s.slice(1, -1)).join('') + ' ';
      }
    }

    if (blockText.trim()) {
      extractedBlocks.push(blockText.trim());
    }
  }

  if (extractedBlocks.length === 0) {
    // Fallback: extract any printable strings longer than 4 chars
    const fallbackLines = rawString
      .replace(/[^\x20-\x7E\n]/g, ' ')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 10 && !l.startsWith('%') && !l.includes('endobj'));
    return fallbackLines.slice(0, 500).join('\n');
  }

  return extractedBlocks.join('\n\n');
}

/**
 * Chunk raw document text into ~500-word blocks keyed to markdown headers
 */
export function chunkDocumentText(
  docId: string,
  docName: string,
  rawContent: string,
  targetWordCount = 500
): SourceChunk[] {
  if (!rawContent || !rawContent.trim()) return [];

  const lines = rawContent.split(/\r?\n/);
  const chunks: SourceChunk[] = [];

  let currentHeader = 'Introduction / Overview';
  let currentWords: string[] = [];
  let chunkIndex = 0;

  function flushChunk() {
    if (currentWords.length === 0) return;
    chunks.push({
      id: `${docId}-chunk-${chunkIndex}`,
      docId,
      docName,
      chunkIndex,
      sectionHeader: currentHeader,
      text: currentWords.join(' ')
    });
    chunkIndex++;
    currentWords = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // Check for markdown headers (#, ##, ###) or page break dividers
    if (trimmed.startsWith('#') || trimmed.startsWith('---') || trimmed === '\f') {
      if (currentWords.length >= targetWordCount * 0.4) {
        flushChunk();
      }
      if (trimmed.startsWith('#')) {
        currentHeader = trimmed.replace(/^#+\s*/, '') || currentHeader;
      }
      continue;
    }

    const words = trimmed.split(/\s+/).filter(Boolean);
    currentWords.push(...words);

    if (currentWords.length >= targetWordCount) {
      flushChunk();
    }
  }

  flushChunk();
  return chunks;
}

/**
 * Ingest a File object from browser drag & drop or file picker
 */
export async function ingestFileToDocument(file: File): Promise<{ doc: SourceDocument; chunks: SourceChunk[] }> {
  const extension = file.name.split('.').pop()?.toLowerCase() || 'txt';
  let rawContent = '';
  let docType: 'md' | 'txt' | 'pdf' | 'json' = 'txt';

  if (extension === 'md') {
    docType = 'md';
    rawContent = await file.text();
  } else if (extension === 'pdf') {
    docType = 'pdf';
    const buffer = await file.arrayBuffer();
    rawContent = extractTextFromPdfBuffer(buffer);
  } else if (extension === 'json') {
    docType = 'json';
    rawContent = await file.text();
  } else {
    docType = 'txt';
    rawContent = await file.text();
  }

  const docId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const chunks = chunkDocumentText(docId, file.name, rawContent);

  const doc: SourceDocument = {
    id: docId,
    name: file.name,
    type: docType,
    sizeBytes: file.size,
    dateAdded: Date.now(),
    isEnabled: true,
    rawContent
  };

  return { doc, chunks };
}
