// src/lib/importers/universalIngestionEngine.ts
// Universal Multi-Format Ingestion Engine for .dd2vtt, .uvtt, .pdf, .md, .txt, .geojson, raster maps & media.
// Parses tactical geometry, tokens, 5e statblocks, lore chunks, and routes assets to campaign storage.

import JSZip from 'jszip';
import { writable } from 'svelte/store';
import { sourceDb, type SourceDocument, type SourceChunk } from '../db/sourceStore';
import { compendiumDb } from '../db/compendiumDb';
import { mapsDb } from '../db/mapsDb';
import { parseDeterministic } from '../services/dualEngineIngest';
import { notifyMonstersUpdated } from '../services/ingestPipeline';
import { saveCampaignAsset, base64ToBlob } from '../services/assetStorageService';
import type { TacticalBattlemap, WorldAtlasMap, MapWall } from '../types/maps';

// ── Strict TypeScript Interfaces for UVTT / dd2vtt Payloads ──────────────────

export interface UVTTPoint {
  x: number;
  y: number;
}

export interface UVTTResolution {
  map_origin?: UVTTPoint;
  map_size?: UVTTPoint;
  pixels_per_grid?: number;
}

export interface UVTTPortal {
  position: UVTTPoint;
  bounds: UVTTPoint[];
  rotation?: number;
  closed?: boolean;
  freestanding?: boolean;
}

export interface UVTTLight {
  position: UVTTPoint;
  range: number;
  intensity: number;
  color: string;
  shadows?: boolean;
}

export interface UVTTPayload {
  format: number | string;
  resolution: UVTTResolution;
  line_of_sight?: UVTTPoint[][];
  portals?: UVTTPortal[];
  lights?: UVTTLight[];
  image?: string; // Base64 encoded PNG or WebP
  environment?: {
    baked_lighting?: boolean;
    ambient_light?: string;
  };
}

// ── Ingestion Result & Report Interfaces ──────────────────────────────────────

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
  assetUrl?: string;
  error?: string;
  metadata?: Record<string, any>;
}

export interface UniversalIngestionReport {
  totalFiles: number;
  mapsExtracted: number;
  tokensExtracted: number;
  loreChunksCreated: number;
  statblocksExtracted: number;
  successful: string[];
  failed: string[];
  fileResults: IngestionFileResult[];
}

// ── Dispatcher: ingestFiles & ingestUniversalFile ─────────────────────────────

/**
 * Extensible parser dispatcher accepting single File or array of Files.
 * Routes based on extension to specialized parsers and returns an ingestion report.
 */
export async function ingestFiles(
  files: File | File[] | Blob | Blob[],
  names?: string | string[]
): Promise<UniversalIngestionReport> {
  const fileList = Array.isArray(files) ? files : [files];
  const nameList = names
    ? (Array.isArray(names) ? names : [names])
    : fileList.map((f, i) => (f instanceof File ? f.name : `file_${i + 1}`));

  const report: UniversalIngestionReport = {
    totalFiles: fileList.length,
    mapsExtracted: 0,
    tokensExtracted: 0,
    loreChunksCreated: 0,
    statblocksExtracted: 0,
    successful: [],
    failed: [],
    fileResults: [],
  };

  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    const fileName = nameList[i] || (file instanceof File ? file.name : `asset_${i + 1}`);

    const percent = Math.round(((i + 1) / fileList.length) * 100);
    ingestionProgressStore.set({
      isActive: true,
      fileName,
      progressPercent: percent,
      currentStep: `Ingesting ${fileName} (${i + 1}/${fileList.length})…`,
    });

    try {
      const results = await ingestUniversalFile(file, fileName);
      for (const res of results) {
        report.fileResults.push(res);
        if (res.success) {
          if (!report.successful.includes(res.fileName)) {
            report.successful.push(res.fileName);
          }
          report.loreChunksCreated += res.chunksCount;

          if (['UVTT', 'DD2VTT', 'DS', 'GEOJSON', 'MAP'].includes(res.format.toUpperCase())) {
            report.mapsExtracted++;
          } else if (res.categories.includes('Token')) {
            report.tokensExtracted++;
          }

          if (res.metadata?.statblocksCount) {
            report.statblocksExtracted += res.metadata.statblocksCount;
          }
        } else {
          report.failed.push(`${res.fileName}: ${res.error || 'Unknown error'}`);
        }
      }
    } catch (err: any) {
      report.failed.push(`${fileName}: ${err?.message || 'Ingestion failed'}`);
      report.fileResults.push({
        fileName,
        format: getExtension(fileName).toUpperCase() || 'UNKNOWN',
        chunksCount: 0,
        sizeBytes: file.size || 0,
        categories: [],
        success: false,
        error: err?.message || 'Dispatcher failure',
      });
    }
  }

  ingestionProgressStore.set({
    isActive: false,
    fileName: '',
    progressPercent: 100,
    currentStep: 'Batch ingestion complete',
  });

  return report;
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
      case 'zip':
      case 'vttbundle': {
        const zipResults = await processZipArchive(file, fileName);
        results.push(...zipResults);
        break;
      }
      case 'dd2vtt':
      case 'uvtt': {
        const uvttResult = await processUvttMapFile(file, fileName, ext);
        results.push(uvttResult);
        break;
      }
      case 'geojson': {
        const geoResult = await processGeoJsonMap(file, fileName);
        results.push(geoResult);
        break;
      }
      case 'ds': {
        const dsResult = await processDungeonScrawlFile(file, fileName);
        results.push(dsResult);
        break;
      }
      case 'pdf': {
        const pdfResult = await processPdfFile(file, fileName);
        results.push(pdfResult);
        break;
      }
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'webp': {
        const imgResult = await processImageMedia(file, fileName, ext);
        results.push(imgResult);
        break;
      }
      case 'mp3':
      case 'wav':
      case 'ogg':
      case 'flac':
      case 'm4a': {
        const audioResult = await processAudioMedia(file, fileName, ext);
        results.push(audioResult);
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
      error: err?.message || 'Ingestion failure',
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

// ── 1. UVTT / dd2vtt Map Parser (.dd2vtt, .uvtt) ─────────────────────────────

async function processUvttMapFile(
  file: File | Blob,
  fileName: string,
  ext: string
): Promise<IngestionFileResult> {
  const text = await file.text();
  const baseName = fileName.replace(/\.[^/.]+$/, '');
  const docId = `map-doc-${generateId()}`;
  const now = Date.now();

  let payload: UVTTPayload;
  try {
    payload = JSON.parse(text);
  } catch (err: any) {
    return {
      fileName,
      format: ext.toUpperCase(),
      chunksCount: 0,
      sizeBytes: file.size || text.length,
      categories: ['Map', 'UVTT'],
      success: false,
      error: `Failed to parse map JSON: ${err?.message || 'Invalid syntax'}`,
    };
  }

  const gridPitch = payload.resolution?.pixels_per_grid || 70;
  const offsetX = payload.resolution?.map_origin?.x || 0;
  const offsetY = payload.resolution?.map_origin?.y || 0;
  const mapSize = payload.resolution?.map_size || { x: 20, y: 20 };

  // 1. Line-of-sight wall segments
  const walls: MapWall[] = [];
  const los = payload.line_of_sight || [];
  for (let i = 0; i < los.length; i++) {
    const poly = los[i];
    if (Array.isArray(poly)) {
      for (let j = 0; j < poly.length - 1; j++) {
        const p1 = poly[j];
        const p2 = poly[j + 1];
        walls.push({
          id: `uvtt-wall-${now}-${i}-${j}`,
          p1: { x: p1.x * gridPitch, y: p1.y * gridPitch },
          p2: { x: p2.x * gridPitch, y: p2.y * gridPitch },
          type: 'wall',
        });
      }
    }
  }

  // 2. Portals / Doors
  const portals = payload.portals || [];
  for (let i = 0; i < portals.length; i++) {
    const port = portals[i];
    if (port.bounds && port.bounds.length >= 2) {
      walls.push({
        id: `uvtt-door-${now}-${i}`,
        p1: { x: port.bounds[0].x * gridPitch, y: port.bounds[0].y * gridPitch },
        p2: { x: port.bounds[1].x * gridPitch, y: port.bounds[1].y * gridPitch },
        type: port.closed ? 'door_closed' : 'door_open',
      });
    }
  }

  // 3. Ambient lights
  const lights = payload.lights || [];

  // 4. Extract and persist map image to campaign `maps/`
  let imageBlob: Blob | undefined;
  let savedImageUrl: string | undefined;

  if (payload.image) {
    try {
      imageBlob = base64ToBlob(payload.image, 'image/png');
      const saveImgRes = await saveCampaignAsset('maps', `${baseName}.png`, imageBlob);
      if (saveImgRes.success) {
        savedImageUrl = saveImgRes.url;
      }
    } catch {
      // Non-blocking image conversion fallback
    }
  }

  // 5. Persist JSON sidecar to campaign `maps/`
  const sidecarData = {
    format: payload.format,
    resolution: payload.resolution,
    line_of_sight: payload.line_of_sight,
    portals: payload.portals,
    lights: payload.lights,
  };
  await saveCampaignAsset('maps', `${baseName}.uvtt.json`, JSON.stringify(sidecarData, null, 2));

  // 6. Store in Dexie mapsDb
  const tacticalMap: TacticalBattlemap = {
    id: `map-${generateId()}`,
    name: baseName,
    type: 'tactical',
    createdAt: now,
    updatedAt: now,
    grid: {
      type: 'square',
      sizePx: gridPitch,
      offsetX: offsetX * gridPitch,
      offsetY: offsetY * gridPitch,
      opacity: 0.35,
      color: '#6366f1',
    },
    lighting: {
      ambientDarkness: 0,
      tintColor: '#ffffff',
    },
    fogOfWar: {
      revealedPolygons: [],
      concealedPolygons: [],
    },
    walls,
    tokens: [],
    textureBlob: imageBlob,
  };
  await mapsDb.tacticalMaps.put(tacticalMap);

  // 7. Store summary chunk in sourceDb
  const summaryText = `### Tactical Map: ${baseName}
- **Format:** ${ext.toUpperCase()}
- **Grid Resolution:** ${gridPitch} px per cell
- **Offset:** (${offsetX}, ${offsetY})
- **Dimensions:** ${mapSize.x} x ${mapSize.y} cells
- **Line of Sight Walls:** ${walls.filter((w) => w.type === 'wall').length}
- **Portals & Doors:** ${portals.length}
- **Ambient Light Emitters:** ${lights.length}`;

  const chunk: SourceChunk = {
    id: `chunk-${docId}-0`,
    docId,
    docName: fileName,
    chunkIndex: 0,
    sectionHeader: 'Tactical Map Overview',
    text: summaryText,
  };

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
  await sourceDb.chunks.bulkPut([chunk]);

  return {
    fileName,
    format: ext.toUpperCase(),
    chunksCount: 1,
    sizeBytes: file.size || text.length,
    categories: ['Map', 'Tactical Geometry', 'Line of Sight'],
    success: true,
    assetUrl: savedImageUrl,
    metadata: {
      mapName: baseName,
      width: mapSize.x,
      height: mapSize.y,
      gridPitch,
      wallsCount: walls.length,
      lightsCount: lights.length,
      portalsCount: portals.length,
      sidecarName: `${baseName}.uvtt.json`,
      imageName: `${baseName}.png`,
    },
  };
}

// ── 2. Vector Geographic Map Parser (.geojson) ──────────────────────────────

async function processGeoJsonMap(file: File | Blob, fileName: string): Promise<IngestionFileResult> {
  const text = await file.text();
  const baseName = fileName.replace(/\.[^/.]+$/, '');
  const docId = `atlas-doc-${generateId()}`;
  const now = Date.now();

  let geoData: any;
  try {
    geoData = JSON.parse(text);
  } catch (err: any) {
    return {
      fileName,
      format: 'GEOJSON',
      chunksCount: 0,
      sizeBytes: file.size || text.length,
      categories: ['Map', 'GeoJSON'],
      success: false,
      error: `Failed to parse GeoJSON: ${err?.message || 'Invalid JSON syntax'}`,
    };
  }

  const features = Array.isArray(geoData.features) ? geoData.features : [];
  const featureTypes = new Set<string>();
  for (const f of features) {
    if (f.geometry?.type) featureTypes.add(f.geometry.type);
  }

  // Persist GeoJSON to `maps/`
  await saveCampaignAsset('maps', `${baseName}.geojson`, text);

  // Store in mapsDb.atlasMaps
  const atlasRecord: WorldAtlasMap = {
    id: `atlas-${generateId()}`,
    name: baseName,
    type: 'atlas',
    createdAt: now,
    updatedAt: now,
    scale: {
      unitsPerPixel: 1,
      unitName: 'miles',
    },
    poiPins: [],
  };
  await mapsDb.atlasMaps.put(atlasRecord);

  // Store documentation chunks in sourceDb
  const summaryText = `### Geographic Atlas Map: ${baseName}
- **Format:** GeoJSON Vector Atlas
- **Total Features:** ${features.length}
- **Geometry Types:** ${Array.from(featureTypes).join(', ') || 'Polygon, MultiPolygon'}
- **Source:** Regional vector geographic boundary data.`;

  const chunk: SourceChunk = {
    id: `chunk-${docId}-0`,
    docId,
    docName: fileName,
    chunkIndex: 0,
    sectionHeader: 'Regional Geography',
    text: summaryText,
  };

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
  await sourceDb.chunks.bulkPut([chunk]);

  return {
    fileName,
    format: 'GEOJSON',
    chunksCount: 1,
    sizeBytes: file.size || text.length,
    categories: ['Map', 'World Atlas', 'Geography'],
    success: true,
    metadata: {
      featureCount: features.length,
    },
  };
}

// ── 3. Dungeon Scrawl Parser (.ds) ──────────────────────────────────────────

async function processDungeonScrawlFile(file: File | Blob, fileName: string): Promise<IngestionFileResult> {
  const text = await file.text();
  const baseName = fileName.replace(/\.[^/.]+$/, '');
  const docId = `ds-doc-${generateId()}`;
  const now = Date.now();

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch (err: any) {
    return {
      fileName,
      format: 'DS',
      chunksCount: 0,
      sizeBytes: file.size || text.length,
      categories: ['Map', 'Dungeon Scrawl'],
      success: false,
      error: `Failed to parse Dungeon Scrawl JSON: ${err?.message || 'Invalid syntax'}`,
    };
  }

  const wallsCount = parsed.walls?.length || 0;
  const doorsCount = parsed.doors?.length || 0;
  const gridSize = parsed.gridSize || 60;

  // Persist sidecar to `maps/`
  await saveCampaignAsset('maps', `${baseName}.ds.json`, text);

  const doc: SourceDocument = {
    id: docId,
    name: fileName,
    type: 'json',
    sizeBytes: file.size || text.length,
    dateAdded: now,
    isEnabled: true,
    rawContent: text,
  };

  const chunk: SourceChunk = {
    id: `chunk-${docId}-0`,
    docId,
    docName: fileName,
    chunkIndex: 0,
    sectionHeader: 'Dungeon Scrawl Map',
    text: `Dungeon Scrawl Map: ${baseName}. Grid: ${gridSize}px, Walls: ${wallsCount}, Doors: ${doorsCount}.`,
  };

  await sourceDb.documents.put(doc);
  await sourceDb.chunks.bulkPut([chunk]);

  return {
    fileName,
    format: 'DS',
    chunksCount: 1,
    sizeBytes: file.size || text.length,
    categories: ['Map', 'Dungeon Scrawl'],
    success: true,
    metadata: { wallsCount, doorsCount, gridSize },
  };
}

// ── 4. Markdown & Plaintext Chunking & 5e Statblock Ingestion ────────────────

async function processTextOrMarkdown(file: File | Blob, fileName: string): Promise<IngestionFileResult> {
  if (fileName.toLowerCase().endsWith('.pdf') || (file.type && file.type === 'application/pdf')) {
    return processPdfFile(file, fileName);
  }

  const text = await file.text();
  const docId = `doc-${generateId()}`;
  const now = Date.now();
  const ext = getExtension(fileName).toLowerCase();

  // Save raw note into `Ingest/Source material/`
  await saveCampaignAsset('Ingest/Source material', fileName, file);

  // 1. Extract Categories from headers
  const categories: string[] = ['Lore', ext.toUpperCase()];
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

  // 2. Chunk text by sections (~500 words per chunk)
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

  // 3. Extract 5e Statblocks (monsters, spells, tables)
  let statblocksCount = 0;
  try {
    const parsedEntities = parseDeterministic(text, fileName);
    if (parsedEntities.monsters.length > 0) {
      await compendiumDb.monsters.bulkPut(parsedEntities.monsters);
      statblocksCount += parsedEntities.monsters.length;
      await notifyMonstersUpdated();
    }
    if (parsedEntities.spells.length > 0) {
      await compendiumDb.spells.bulkPut(parsedEntities.spells);
      statblocksCount += parsedEntities.spells.length;
    }
  } catch {
    // Non-blocking entity parsing fallback
  }

  return {
    fileName,
    format: ext.toUpperCase(),
    chunksCount: chunks.length,
    sizeBytes: file.size || text.length,
    categories,
    success: true,
    metadata: { statblocksCount },
  };
}

// ── 5. PDF File Page-by-Page Extraction & Entity Parsing ────────────────────

async function processPdfFile(file: File | Blob, fileName: string): Promise<IngestionFileResult> {
  const docId = `doc-${generateId()}`;
  const now = Date.now();
  const chunks: SourceChunk[] = [];
  const categories: string[] = ['PDF Document', 'Rulebook', 'Source Material'];

  // Save raw PDF to `Ingest/Source material/`
  await saveCampaignAsset('Ingest/Source material', fileName, file);

  let extractedText = '';

  try {
    const pdfjsLib = await import('pdfjs-dist');
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      try {
        pdfjsLib.GlobalWorkerOptions.workerSrc = (
          await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
        ).default;
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
  } catch {
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

  // Parse any 5e entities found in PDF text
  let statblocksCount = 0;
  if (extractedText) {
    try {
      const entities = parseDeterministic(extractedText, fileName);
      if (entities.monsters.length > 0) {
        await compendiumDb.monsters.bulkPut(entities.monsters);
        statblocksCount += entities.monsters.length;
        await notifyMonstersUpdated();
      }
      if (entities.spells.length > 0) {
        await compendiumDb.spells.bulkPut(entities.spells);
        statblocksCount += entities.spells.length;
      }
    } catch {
      // Non-blocking entity parsing fallback
    }
  }

  return {
    fileName,
    format: 'PDF',
    chunksCount: chunks.length,
    sizeBytes: file.size,
    categories,
    success: true,
    metadata: { statblocksCount },
  };
}

// ── 6. Image Media & Token Ingestion ────────────────────────────────────────

async function processImageMedia(
  file: File | Blob,
  fileName: string,
  ext: string
): Promise<IngestionFileResult> {
  const mediaId = `media-${generateId()}`;
  const now = Date.now();
  const mimeType = file.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  const lowerName = fileName.toLowerCase();

  const isToken = lowerName.includes('token') || lowerName.includes('portrait');
  const targetFolder = isToken ? 'tokens' : 'maps';

  // Persist into appropriate campaign subdirectory
  const saveRes = await saveCampaignAsset(targetFolder, fileName, file);

  // Store in compendiumDb.media
  await compendiumDb.media.put({
    id: mediaId,
    name: fileName,
    sourceBook: isToken ? 'Campaign Tokens' : 'Campaign Battlemaps',
    mimeType,
    createdAt: now,
    blob: file,
  });

  // If raster battlemap, also register in mapsDb.tacticalMaps
  if (!isToken) {
    const tacticalMap: TacticalBattlemap = {
      id: `map-${generateId()}`,
      name: fileName.replace(/\.[^/.]+$/, ''),
      type: 'tactical',
      createdAt: now,
      updatedAt: now,
      grid: {
        type: 'square',
        sizePx: 70,
        offsetX: 0,
        offsetY: 0,
        opacity: 0.35,
        color: '#6366f1',
      },
      lighting: {
        ambientDarkness: 0,
        tintColor: '#ffffff',
      },
      fogOfWar: {
        revealedPolygons: [],
        concealedPolygons: [],
      },
      walls: [],
      tokens: [],
      textureBlob: file,
    };
    await mapsDb.tacticalMaps.put(tacticalMap);
  }

  return {
    fileName,
    format: ext.toUpperCase(),
    chunksCount: 1,
    sizeBytes: file.size,
    categories: isToken ? ['Token', 'Portrait'] : ['Map', 'Raster Battlemap'],
    success: true,
    assetUrl: saveRes.url,
  };
}

// ── 7. Audio Media Ingestion ────────────────────────────────────────────────

async function processAudioMedia(
  file: File | Blob,
  fileName: string,
  ext: string
): Promise<IngestionFileResult> {
  // Save directly to campaign `audio/`
  const saveRes = await saveCampaignAsset('audio', fileName, file);

  return {
    fileName,
    format: ext.toUpperCase(),
    chunksCount: 1,
    sizeBytes: file.size,
    categories: ['Audio', 'Music/SFX'],
    success: true,
    assetUrl: saveRes.url,
  };
}

// ── 8. Delimited Table Ingestion (.csv, .tsv) ───────────────────────────────

async function processDelimitedTable(
  file: File | Blob,
  fileName: string,
  ext: string
): Promise<IngestionFileResult> {
  const text = await file.text();
  const delimiter = ext === 'tsv' ? '\t' : ',';
  const rows = parseDelimitedRows(text, delimiter);
  const headers = rows.length > 0 ? rows[0] : [];
  const bodyRows = rows.slice(1);

  const docId = `table-${generateId()}`;
  const now = Date.now();
  const chunks: SourceChunk[] = [];

  const pageSize = 50;
  for (let i = 0; i < bodyRows.length; i += pageSize) {
    const chunkRows = bodyRows.slice(i, i + pageSize);
    let mdTable = `| ${headers.join(' | ')} |\n| ${headers.map(() => '---').join(' | ')} |\n`;
    for (const r of chunkRows) {
      mdTable += `| ${r.join(' | ')} |\n`;
    }
    chunks.push({
      id: `chunk-${docId}-${Math.floor(i / pageSize)}`,
      docId,
      docName: fileName,
      chunkIndex: Math.floor(i / pageSize),
      sectionHeader: `${fileName} (Rows ${i + 1}–${Math.min(i + pageSize, bodyRows.length)})`,
      text: mdTable,
    });
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

// ── 9. JSON & JSONL Data Ingestion ──────────────────────────────────────────

async function processJsonData(
  file: File | Blob,
  fileName: string,
  ext: string
): Promise<IngestionFileResult> {
  const text = await file.text();
  const docId = `json-${generateId()}`;
  const now = Date.now();
  const chunks: SourceChunk[] = [];
  const categories: string[] = ['JSON Data'];

  let parsed: any;
  try {
    if (ext === 'jsonl') {
      parsed = text
        .split('\n')
        .filter((l) => l.trim().length > 0)
        .map((l) => JSON.parse(l));
    } else {
      parsed = JSON.parse(text);
    }
  } catch (err: any) {
    return {
      fileName,
      format: ext.toUpperCase(),
      chunksCount: 0,
      sizeBytes: file.size || text.length,
      categories,
      success: false,
      error: `JSON parsing error: ${err?.message || 'Invalid syntax'}`,
    };
  }

  if (Array.isArray(parsed)) {
    for (let i = 0; i < parsed.length; i++) {
      const item = parsed[i];
      const name = item.name || item.title || item.id || `Item ${i + 1}`;
      chunks.push({
        id: `chunk-${docId}-${i}`,
        docId,
        docName: fileName,
        chunkIndex: i,
        sectionHeader: `${fileName}: ${name}`,
        text: `### ${name}\n` + formatJsonRecordAsMarkdown(item),
      });
    }
  } else {
    chunks.push({
      id: `chunk-${docId}-0`,
      docId,
      docName: fileName,
      chunkIndex: 0,
      sectionHeader: `${fileName}: Root Record`,
      text: formatJsonRecordAsMarkdown(parsed),
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

// ── 10. ZIP Archive Recursive Ingestion ─────────────────────────────────────

async function processZipArchive(file: File | Blob, fileName: string): Promise<IngestionFileResult[]> {
  const zip = new JSZip();
  let loadedZip: JSZip;
  try {
    loadedZip = await zip.loadAsync(file);
  } catch (err: any) {
    return [
      {
        fileName,
        format: 'ZIP',
        chunksCount: 0,
        sizeBytes: file.size || 0,
        categories: ['Archive'],
        success: false,
        error: `Corrupted ZIP archive: ${err?.message || 'Failed to unpack'}`,
      },
    ];
  }

  const results: IngestionFileResult[] = [];

  for (const [relativePath, zipEntry] of Object.entries(loadedZip.files)) {
    if (zipEntry.dir) continue;
    if (relativePath.includes('__MACOSX') || relativePath.startsWith('.')) continue;

    const subName = relativePath.split('/').pop() || relativePath;
    const subExt = getExtension(subName).toLowerCase();

    if (matchesAllowedExtension(subExt)) {
      try {
        const blob = await zipEntry.async('blob');
        const subResults = await ingestUniversalFile(blob, `${fileName}/${relativePath}`);
        results.push(...subResults);
      } catch (err: any) {
        results.push({
          fileName: `${fileName}/${relativePath}`,
          format: subExt.toUpperCase(),
          chunksCount: 0,
          sizeBytes: 0,
          categories: [],
          success: false,
          error: err?.message || 'Failed to extract file from ZIP',
        });
      }
    }
  }

  return results;
}

// ── Utilities & Helper Functions ─────────────────────────────────────────────

function getExtension(name: string): string {
  const parts = name.split('.');
  return parts.length > 1 ? parts.pop()! : '';
}

function matchesAllowedExtension(ext: string): boolean {
  return [
    'md',
    'txt',
    'json',
    'jsonl',
    'csv',
    'tsv',
    'ds',
    'dd2vtt',
    'uvtt',
    'geojson',
    'pdf',
    'vttbundle',
    'png',
    'jpg',
    'jpeg',
    'webp',
    'mp3',
    'wav',
    'ogg',
    'flac',
    'm4a',
  ].includes(ext);
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
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: string[][] = [];

  for (const line of lines) {
    const cells = line.split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ''));
    rows.push(cells);
  }

  return rows;
}
