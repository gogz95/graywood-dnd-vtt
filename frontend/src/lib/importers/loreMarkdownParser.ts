// src/lib/importers/loreMarkdownParser.ts
// Settings-based Grounded Markdown/Txt Lore Ingestion & Purge Engine

import { sourceDb, type SourceDocument, type SourceChunk } from '../db/sourceStore';

export interface LoreSection {
  primaryCategory: string; // From # Header 1
  subTopic: string;        // From ## Header 2 or ### Header 3
  level: number;
  content: string;
  dialectMarkers: string[];
  essenceTags: string[];
  economicRules: string[];
}

export interface IngestionResult {
  docId: string;
  docName: string;
  categoriesFound: string[];
  sectionsCount: number;
  chunksCount: number;
  purgedMockCount: number;
}

const KNOWN_DIALECTS = [
  'Old Concord',
  'Vaelic Common',
  'Gilionite Stone-Canto',
  'Vaelic Island-Canto',
  'Rucean Tide-Cant',
  'Archipelago Coastal Dialect'
];

const KNOWN_ESSENCES = [
  'Solar Aether', 'Lunar Mercury', 'Chthonic Salt', 'Abyssal Sulfur',
  'Gilionite Basalt', 'Vaelic Pearl', 'Rucean Brine', 'Shadow Pitch'
];

export function parseMarkdownLoreSections(text: string, defaultCategory: string = 'General Lore'): LoreSection[] {
  const lines = text.split(/\r?\n/);
  const sections: LoreSection[] = [];

  let currentCategory = defaultCategory;
  let currentSubTopic = 'Overview';
  let currentLevel = 1;
  let currentContentLines: string[] = [];

  function flushSection() {
    const content = currentContentLines.join('\n').trim();
    if (content.length > 0) {
      // Extract dialect markers, essence tags, economic rules
      const dialectMarkers = KNOWN_DIALECTS.filter(d =>
        new RegExp(`\\b${d}\\b`, 'i').test(content)
      );
      const essenceTags = KNOWN_ESSENCES.filter(e =>
        new RegExp(`\\b${e}\\b`, 'i').test(content)
      );
      const economicRules: string[] = [];
      const sovereignMatch = content.match(/\d+[\s]*(?:Concord Sovereigns?|Sovereigns?|gp|Sun Disks?|Trade Bars?)/gi);
      if (sovereignMatch) {
        economicRules.push(...sovereignMatch.map(s => s.trim()));
      }
      if (/durability\s*rp|sunder\s*threshold/i.test(content)) {
        economicRules.push('Durability RP / Sunder Rules');
      }
      if (/10-day\s*decades?|decades?\s*window/i.test(content)) {
        economicRules.push('10-Day Decade Calendar Rule');
      }

      sections.push({
        primaryCategory: currentCategory,
        subTopic: currentSubTopic,
        level: currentLevel,
        content,
        dialectMarkers,
        essenceTags,
        economicRules: Array.from(new Set(economicRules))
      });
    }
    currentContentLines = [];
  }

  for (const line of lines) {
    const h1Match = line.match(/^#\s+(.+)$/);
    const h2Match = line.match(/^##\s+(.+)$/);
    const h3Match = line.match(/^###\s+(.+)$/);

    if (h1Match) {
      flushSection();
      currentCategory = h1Match[1].trim();
      currentSubTopic = 'Introduction & Overview';
      currentLevel = 1;
    } else if (h2Match) {
      flushSection();
      currentSubTopic = h2Match[1].trim();
      currentLevel = 2;
    } else if (h3Match) {
      flushSection();
      currentSubTopic = h3Match[1].trim();
      currentLevel = 3;
    } else {
      currentContentLines.push(line);
    }
  }

  flushSection();
  return sections;
}

export async function ingestMarkdownLore(
  fileName: string,
  rawContent: string,
  purgeMockData: boolean = true
): Promise<IngestionResult> {
  let purgedMockCount = 0;

  if (purgeMockData) {
    const existingDocs = await sourceDb.documents.toArray();
    for (const doc of existingDocs) {
      const lower = doc.name.toLowerCase();
      if (
        lower.includes('mock') ||
        lower.includes('placeholder') ||
        lower.includes('mockup-lore') ||
        lower.includes('dummy') ||
        lower.includes('sample-lore')
      ) {
        await sourceDb.documents.delete(doc.id);
        purgedMockCount++;
      }
    }
  }

  const sections = parseMarkdownLoreSections(rawContent, fileName.replace(/\.[^/.]+$/, ''));
  const categories = Array.from(new Set(sections.map(s => s.primaryCategory)));

  const docId = `doc-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const sourceDoc: SourceDocument = {
    id: docId,
    name: fileName,
    type: fileName.endsWith('.txt') ? 'txt' : 'md',
    sizeBytes: new Blob([rawContent]).size,
    dateAdded: Date.now(),
    isEnabled: true,
    rawContent
  };

  const chunks: SourceChunk[] = [];
  let chunkIdx = 0;

  for (const section of sections) {
    // Split long sections into chunks of ~1200 characters with header context
    const headerPrefix = `[Category: ${section.primaryCategory} > ${section.subTopic}]\n`;
    const fullText = `${headerPrefix}${section.content}`;

    if (fullText.length <= 1500) {
      chunks.push({
        id: `chunk-${docId}-${chunkIdx++}`,
        docId,
        docName: fileName,
        chunkIndex: chunkIdx,
        sectionHeader: `${section.primaryCategory} - ${section.subTopic}`,
        text: fullText
      });
    } else {
      // Chunk into paragraphs
      const paragraphs = section.content.split(/\n\s*\n/);
      let currentChunkText = headerPrefix;

      for (const para of paragraphs) {
        if ((currentChunkText + '\n\n' + para).length > 1500 && currentChunkText.length > headerPrefix.length) {
          chunks.push({
            id: `chunk-${docId}-${chunkIdx++}`,
            docId,
            docName: fileName,
            chunkIndex: chunkIdx,
            sectionHeader: `${section.primaryCategory} - ${section.subTopic}`,
            text: currentChunkText.trim()
          });
          currentChunkText = headerPrefix + para;
        } else {
          currentChunkText += (currentChunkText === headerPrefix ? '' : '\n\n') + para;
        }
      }

      if (currentChunkText.trim().length > headerPrefix.length) {
        chunks.push({
          id: `chunk-${docId}-${chunkIdx++}`,
          docId,
          docName: fileName,
          chunkIndex: chunkIdx,
          sectionHeader: `${section.primaryCategory} - ${section.subTopic}`,
          text: currentChunkText.trim()
        });
      }
    }
  }

  await sourceDb.documents.put(sourceDoc);
  if (chunks.length > 0) {
    await sourceDb.chunks.bulkPut(chunks);
  }

  return {
    docId,
    docName: fileName,
    categoriesFound: categories,
    sectionsCount: sections.length,
    chunksCount: chunks.length,
    purgedMockCount
  };
}
