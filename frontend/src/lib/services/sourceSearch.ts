// src/lib/services/sourceSearch.ts
// Grounded Source Search Engine querying only enabled documents

import { getAllChunksForEnabledDocs, type SourceChunk } from '../db/sourceStore';

export interface SearchResultMatch {
  chunkId: string;
  docId: string;
  docName: string;
  sectionHeader: string;
  fullText: string;
  snippet: string;
  score: number;
}

/**
 * Extracts a highlighted contextual snippet (~160 chars) around matched search terms
 */
export function extractContextualSnippet(text: string, terms: string[]): string {
  if (!text) return '';
  const lower = text.toLowerCase();

  let firstIndex = -1;
  for (const term of terms) {
    const idx = lower.indexOf(term.toLowerCase());
    if (idx !== -1 && (firstIndex === -1 || idx < firstIndex)) {
      firstIndex = idx;
    }
  }

  if (firstIndex === -1) {
    return text.length > 180 ? text.slice(0, 180) + '…' : text;
  }

  const start = Math.max(0, firstIndex - 60);
  const end = Math.min(text.length, firstIndex + 120);

  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';

  return prefix + text.slice(start, end).trim() + suffix;
}

/**
 * Executes a fast, multi-term keyword search over all enabled document chunks
 */
export async function searchGroundedSources(query: string): Promise<SearchResultMatch[]> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  const terms = trimmed.split(/\s+/).filter(t => t.length > 1);
  if (terms.length === 0) return [];

  const chunks = await getAllChunksForEnabledDocs();
  const matches: SearchResultMatch[] = [];

  for (const chunk of chunks) {
    const lowerText = chunk.text.toLowerCase();
    const lowerHeader = chunk.sectionHeader.toLowerCase();

    let score = 0;
    let matchedAllTerms = true;

    for (const term of terms) {
      let termMatches = 0;

      // Header matches give high priority bonus
      if (lowerHeader.includes(term)) {
        score += 15;
        termMatches++;
      }

      // Count term occurrences in chunk text
      let pos = 0;
      while ((pos = lowerText.indexOf(term, pos)) !== -1) {
        termMatches++;
        score += 3;
        pos += term.length;
      }

      if (termMatches === 0) {
        matchedAllTerms = false;
      }
    }

    if (matchedAllTerms || score >= 6) {
      const snippet = extractContextualSnippet(chunk.text, terms);
      matches.push({
        chunkId: chunk.id,
        docId: chunk.docId,
        docName: chunk.docName,
        sectionHeader: chunk.sectionHeader,
        fullText: chunk.text,
        snippet,
        score
      });
    }
  }

  // Sort descending by score
  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, 30);
}
