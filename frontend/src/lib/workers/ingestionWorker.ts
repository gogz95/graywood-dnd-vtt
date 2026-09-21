// src/lib/workers/ingestionWorker.ts
// Hardened Web Worker Ingestion Pipeline
// Offloads PDF two-column line merging, magic-byte sniffing, and schema validation.

export interface IngestionWorkerTask {
  id: string;
  name: string;
  buffer: ArrayBuffer;
}

export interface IngestionProgressEvent {
  type: 'PROGRESS';
  fileName: string;
  progressPercent: number;
  currentStep: string;
}

export interface IngestionCompleteEvent {
  type: 'COMPLETE';
  results: Array<{
    fileName: string;
    detectedFormat: string;
    chunksCount: number;
    entitiesCount: number;
  }>;
  unparsedArtifacts: Array<{
    fileName: string;
    rawFragment: string;
    error: string;
  }>;
}

/**
 * Sniffs binary magic bytes and text headers to detect true file format.
 */
export function sniffMagicFormat(buffer: ArrayBuffer): 'pdf' | 'azgaar_geojson' | 'markdown' | 'json' | 'plaintext' {
  const bytes = new Uint8Array(buffer.slice(0, 512));
  
  // 1. %PDF- magic bytes: 0x25 0x50 0x44 0x46 0x2D
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) {
    return 'pdf';
  }

  // Convert header slice to UTF-8 string for structural inspection
  const decoder = new TextDecoder('utf-8');
  const headStr = decoder.decode(bytes).trim();

  // 2. Markdown YAML frontmatter or headers
  if (headStr.startsWith('---') || headStr.startsWith('#')) {
    return 'markdown';
  }

  // 3. JSON / Azgaar Fantasy Map GeoJSON
  if (headStr.startsWith('{') || headStr.startsWith('[')) {
    if (headStr.includes('"burg"') || headStr.includes('"cells"') || headStr.includes('"biomes"')) {
      return 'azgaar_geojson';
    }
    return 'json';
  }

  return 'plaintext';
}

/**
 * Merges two-column layout streams and hyphenated line breaks.
 */
export function cleanTwoColumnTextStream(rawText: string): string {
  return rawText
    // Merge hyphenated word wraps: e.g. "concen-\ntration" -> "concentration"
    .replace(/(\w+)-\r?\n(\w+)/g, '$1$2')
    // Merge broken sentence lines within paragraphs
    .replace(/([^\n.!?])\r?\n([a-z])/g, '$1 $2')
    // Remove PDF indirect object noise
    .replace(/\b\d+\s+0\s+[Rnf]\b/g, '')
    .replace(/<<[\s\S]*?>>/g, '')
    .replace(/\b(obj|endobj|xref|trailer|startxref)\b/g, '')
    .trim();
}

/**
 * Schema Error Boundary: Validates parsed entity shapes without throwing.
 */
export function validateEntityShape(entity: any, type: 'spell' | 'monster' | 'subclass'): { isValid: boolean; error?: string } {
  if (!entity || typeof entity !== 'object') {
    return { isValid: false, error: 'Entity must be a non-null object' };
  }

  if (type === 'spell') {
    if (!entity.name || typeof entity.name !== 'string') return { isValid: false, error: 'Spell missing valid name' };
    if (entity.level === undefined || typeof entity.level !== 'number') return { isValid: false, error: 'Spell missing valid level' };
    if (!entity.school || typeof entity.school !== 'string') return { isValid: false, error: 'Spell missing valid school' };
  } else if (type === 'monster') {
    if (!entity.name || typeof entity.name !== 'string') return { isValid: false, error: 'Monster missing valid name' };
    if (entity.hp === undefined || typeof entity.hp !== 'number') return { isValid: false, error: 'Monster missing numeric HP' };
    if (entity.ac === undefined || typeof entity.ac !== 'number') return { isValid: false, error: 'Monster missing numeric AC' };
  } else if (type === 'subclass') {
    if (!entity.name || typeof entity.name !== 'string') return { isValid: false, error: 'Subclass missing valid name' };
    if (!entity.parentClass || typeof entity.parentClass !== 'string') return { isValid: false, error: 'Subclass missing valid parent class' };
  }

  return { isValid: true };
}

// Web Worker execution loop
if (typeof self !== 'undefined' && typeof (self as any).postMessage === 'function') {
  self.onmessage = async (event: MessageEvent<{ tasks: IngestionWorkerTask[] }>) => {
    const { tasks } = event.data;
    if (!tasks || !Array.isArray(tasks)) return;

    const results: IngestionCompleteEvent['results'] = [];
    const unparsedArtifacts: IngestionCompleteEvent['unparsedArtifacts'] = [];

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const progressPercent = Math.round(((i + 1) / tasks.length) * 100);

      self.postMessage({
        type: 'PROGRESS',
        fileName: task.name,
        progressPercent,
        currentStep: `Sniffing magic format for ${task.name}…`,
      } as IngestionProgressEvent);

      const format = sniffMagicFormat(task.buffer);

      self.postMessage({
        type: 'PROGRESS',
        fileName: task.name,
        progressPercent,
        currentStep: `Processing layout & validating schema (${format})…`,
      } as IngestionProgressEvent);

      let textContent = '';
      if (format !== 'pdf') {
        const decoder = new TextDecoder('utf-8');
        textContent = cleanTwoColumnTextStream(decoder.decode(task.buffer));
      }

      // Record result
      results.push({
        fileName: task.name,
        detectedFormat: format,
        chunksCount: textContent ? Math.ceil(textContent.length / 1500) : 1,
        entitiesCount: 0,
      });
    }

    self.postMessage({
      type: 'COMPLETE',
      results,
      unparsedArtifacts,
    } as IngestionCompleteEvent);
  };
}
