// src/lib/services/ingest/subsystemRouter.ts
// Routes categorized assets into Dexie compendiums, disk storage, and canvas/audio subsystems

import { compendiumDb } from '../../db/compendiumDb';
import { mapsDb } from '../../db/mapsDb';
import { campaignDirectoryStore } from '../../stores/campaignDirectoryStore.svelte';
import { parseDeterministic } from '../dualEngineIngest';
import { notifyMonstersUpdated } from '../ingestPipeline';
import { mapLayers } from '../../stores/mapLayerStore.svelte';
import { parseDungeonScrawl } from '../../canvas/parsers/dungeonScrawlParser';
import { parseWatabouGeoJson } from '../../canvas/parsers/watabouParser';
import { sniffAndClassify, ingestClassifiedContent } from './contentClassifier';
import { extractAndStoreCompendiumSource } from '../../importers/pdfRuleExtractor';
import { ingestUniversalFile } from '../../importers/universalIngestionEngine';
import type { UVTTFormat } from '../importers/universalVttImporter';
import type { TacticalBattlemap, MapWall } from '../../types/maps';
import type { IngestQueueItem } from './ingestTypes';
import JSZip from 'jszip';

function createTacticalMapRecord(
  id: string,
  name: string,
  gridSize: number,
  walls: MapWall[] = [],
  blob?: Blob
): TacticalBattlemap {
  return {
    id,
    name,
    type: 'tactical',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    grid: {
      type: 'square',
      sizePx: gridSize,
      offsetX: 0,
      offsetY: 0,
      opacity: 0.35,
      color: '#000000',
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
    textureBlob: blob,
  };
}

/**
 * Helper to convert a File/Blob to a base64 string.
 */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result as string;
      const base64 = res.includes(',') ? res.split(',')[1] : res;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Helper to get the contents of a queue item as string.
 */
async function getItemText(item: IngestQueueItem): Promise<string> {
  if (item.file) {
    return await (item.file as Blob).text();
  }
  if (item.fullPath) {
    const res = await fetch(`/api/campaign/assets/${item.relativePath}`);
    if (res.ok) return await res.text();
  }
  return '';
}

/**
 * Helper to get the contents of a queue item as Blob.
 */
async function getItemBlob(item: IngestQueueItem): Promise<Blob> {
  if (item.file) {
    return item.file as Blob;
  }
  if (item.fullPath) {
    const res = await fetch(`/api/campaign/assets/${item.relativePath}`);
    if (res.ok) return await res.blob();
  }
  return new Blob([]);
}

/**
 * Routes a single asset to its target subsystem.
 */
export async function routeAsset(
  item: IngestQueueItem,
  onProgress?: (percent: number, message: string) => void
): Promise<{ success: boolean; summary: string }> {
  const ext = item.extension.toLowerCase();

  switch (item.category) {
    case 'source':
      return await routeSourceMaterial(item, ext, onProgress);

    case 'image':
      return await routeImageOrMap(item, ext, onProgress);

    case 'audio':
      return await routeAudio(item, ext, onProgress);

    case 'video':
      return await routeVideo(item, ext, onProgress);

    default:
      throw new Error(`Unsupported category for item: ${item.name}`);
  }
}

/**
 * 1. SOURCE MATERIAL ROUTING
 * Ingests into compendiumDb tables (monsters, spells, tables, rules).
 */
async function routeSourceMaterial(
  item: IngestQueueItem,
  ext: string,
  onProgress?: (percent: number, message: string) => void
): Promise<{ success: boolean; summary: string }> {
  onProgress?.(20, 'Reading source text...');

  if (ext === 'pdf') {
    onProgress?.(30, 'Extracting text and 5e entities from PDF...');
    const blob = await getItemBlob(item);
    const result = await extractAndStoreCompendiumSource(blob, item.name);
    await notifyMonstersUpdated();
    return {
      success: true,
      summary: `Parsed PDF: extracted ${result.monstersExtracted.length} monsters, ${result.spellsExtracted.length} spells, ${result.facilitiesExtracted.length} facilities, ${result.tablesExtracted.length} tables`,
    };
  }

  if (ext === 'zip') {
    onProgress?.(40, 'Extracting ZIP archive...');
    const blob = await getItemBlob(item);
    const zip = await JSZip.loadAsync(blob);
    let extractedCount = 0;

    for (const [relativePath, fileEntry] of Object.entries(zip.files)) {
      if (fileEntry.dir) continue;
      const innerExt = relativePath.split('.').pop()?.toLowerCase() || '';
      if (['md', 'txt', 'json', 'csv'].includes(innerExt)) {
        const text = await fileEntry.async('string');
        const parsed = parseDeterministic(text, `${item.name}/${relativePath}`);
        if (parsed.monsters.length > 0) {
          await compendiumDb.monsters.bulkPut(parsed.monsters);
        }
        if (parsed.spells.length > 0) {
          await compendiumDb.spells.bulkPut(parsed.spells);
        }
        if (parsed.tables.length > 0) {
          await compendiumDb.ingestedTables.bulkAdd(parsed.tables);
        }
        extractedCount++;
      }
    }
    await notifyMonstersUpdated();
    return { success: true, summary: `Extracted & parsed ${extractedCount} files from archive` };
  }

  if (ext === 'json' || ext === 'jsonl' || ext === 'md' || ext === 'txt') {
    onProgress?.(45, 'Sniffing schema and normalizing content...');
    const text = await getItemText(item);
    const packageId = item.name.replace(/\.[^/.]+$/, '');
    const sniffResult = await sniffAndClassify(text, item.name);

    if (sniffResult.confidence >= 0.7 && sniffResult.extractedRecords) {
      const committed = await ingestClassifiedContent(sniffResult, packageId);
      if (committed.committedCount > 0) {
        await notifyMonstersUpdated();
        return {
          success: true,
          summary: `Auto-classified ${sniffResult.format}: committed ${committed.committedCount} records to ${committed.destination}`,
        };
      }
    }

    onProgress?.(60, 'Parsing standard 5e structure...');
    try {
      const data = JSON.parse(text);
      let count = 0;
      if (Array.isArray(data)) {
        // Check if monster, spell, or general record
        const monsters = data.filter(d => d.cr !== undefined || d.ac !== undefined);
        const spells = data.filter(d => d.level !== undefined && d.school !== undefined);
        if (monsters.length > 0) {
          await compendiumDb.monsters.bulkPut(monsters.map(m => ({
            ...m,
            packageId: item.name.replace(/\.[^/.]+$/, ''),
            origin: 'USER_IMPORT',
            sourceBook: item.name
          })));
          count += monsters.length;
        }
        if (spells.length > 0) {
          await compendiumDb.spells.bulkPut(spells.map(s => ({
            ...s,
            packageId: item.name.replace(/\.[^/.]+$/, ''),
            origin: 'USER_IMPORT',
            sourceBook: item.name
          })));
          count += spells.length;
        }
      } else if (typeof data === 'object') {
        const parsed = parseDeterministic(text, item.name);
        if (parsed.monsters.length > 0) await compendiumDb.monsters.bulkPut(parsed.monsters);
        if (parsed.spells.length > 0) await compendiumDb.spells.bulkPut(parsed.spells);
        if (parsed.tables.length > 0) await compendiumDb.ingestedTables.bulkAdd(parsed.tables);
        count = parsed.monsters.length + parsed.spells.length + parsed.tables.length;
      }
      await notifyMonstersUpdated();
      return { success: true, summary: `Imported ${count} entries into compendium` };
    } catch {
      // Fall back to text parsing if JSON.parse fails (e.g. JSONL)
      const parsed = parseDeterministic(text, item.name);
      if (parsed.monsters.length > 0) await compendiumDb.monsters.bulkPut(parsed.monsters);
      if (parsed.spells.length > 0) await compendiumDb.spells.bulkPut(parsed.spells);
      await notifyMonstersUpdated();
      return { success: true, summary: `Parsed ${parsed.monsters.length} monsters, ${parsed.spells.length} spells` };
    }
  }

  // Markdown, TXT, CSV, TSV, DS
  if (ext === 'ds') {
    onProgress?.(50, 'Parsing Dungeon Scrawl map...');
    const text = await getItemText(item);
    const parsedMap = parseDungeonScrawl(text);
    const mapId = `ds-map-${Date.now()}`;
    const walls: MapWall[] = (parsedMap.walls || []).map(w => ({
      id: w.id || `wall-${Math.random()}`,
      p1: { x: w.x1, y: w.y1 },
      p2: { x: w.x2, y: w.y2 },
      type: 'wall' as const,
    }));
    for (const d of parsedMap.doors || []) {
      walls.push({
        id: d.id || `door-${Math.random()}`,
        p1: { x: d.x1, y: d.y1 },
        p2: { x: d.x2, y: d.y2 },
        type: d.state === 'OPEN' ? ('door_open' as const) : ('door_closed' as const),
      });
    }
    await mapsDb.tacticalMaps.put(
      createTacticalMapRecord(mapId, item.name.replace(/\.[^/.]+$/, ''), parsedMap.gridSize || 60, walls)
    );
    return { success: true, summary: `Created Dungeon Scrawl map with ${walls.length} walls` };
  }

  onProgress?.(60, 'Indexing document chunks and 5e entities...');
  const blob = await getItemBlob(item);
  let chunkCount = 0;
  if (blob && blob.size > 0) {
    try {
      const ingestResults = await ingestUniversalFile(blob, item.name);
      chunkCount = ingestResults.reduce((acc, r) => acc + r.chunksCount, 0);
    } catch {
      // Non-blocking source chunking fallback
    }
  }

  const text = await getItemText(item);
  const result = parseDeterministic(text, item.name);

  if (result.monsters.length > 0) {
    await compendiumDb.monsters.bulkPut(result.monsters);
  }
  if (result.spells.length > 0) {
    await compendiumDb.spells.bulkPut(result.spells);
  }
  if (result.tables.length > 0) {
    await compendiumDb.ingestedTables.bulkAdd(result.tables);
  }
  await notifyMonstersUpdated();

  return {
    success: true,
    summary: `Indexed ${chunkCount} lore chunks; extracted ${result.monsters.length} monsters, ${result.spells.length} spells, ${result.tables.length} tables`,
  };
}

/**
 * 2. IMAGE & MAP ROUTING
 * Moves/copies raster & vector maps into campaign `maps/` and registers grid config.
 * Routes token portraits to `tokens/`.
 */
async function routeImageOrMap(
  item: IngestQueueItem,
  ext: string,
  onProgress?: (percent: number, message: string) => void
): Promise<{ success: boolean; summary: string }> {
  const isToken =
    item.name.toLowerCase().includes('token') ||
    item.relativePath.toLowerCase().includes('token');

  const targetSubfolder = isToken ? 'tokens' : 'maps';
  onProgress?.(30, `Encoding asset for ${targetSubfolder}/...`);

  let fileUrl = '';
  const blob = await getItemBlob(item);
  if (blob.size > 0) {
    const base64 = await blobToBase64(blob);
    const saved = await campaignDirectoryStore.saveAsset(
      targetSubfolder,
      item.name,
      base64
    );
    fileUrl = saved.url || `/api/campaign/assets/${targetSubfolder}/${item.name}`;
  } else {
    fileUrl = `/api/campaign/assets/${targetSubfolder}/${item.name}`;
  }

  if (isToken) {
    return { success: true, summary: `Saved token portrait to tokens/${item.name}` };
  }

  onProgress?.(70, 'Registering battlemap and grid layers...');

  // If Universal VTT (.dd2vtt or .uvtt)
  if (ext === 'dd2vtt' || ext === 'uvtt') {
    const text = await getItemText(item);
    const uvtt = JSON.parse(text) as UVTTFormat;
    const mapId = `uvtt-${Date.now()}`;
    const ppg = uvtt.resolution?.pixels_per_grid || 70;
    const cols = uvtt.resolution?.map_size?.x || 30;
    const rows = uvtt.resolution?.map_size?.y || 30;

    const wallPolygons: number[][] = [];
    if (uvtt.line_of_sight) {
      for (const line of uvtt.line_of_sight) {
        const flatCoords: number[] = [];
        for (const pt of line) {
          flatCoords.push(pt.x * ppg, pt.y * ppg);
        }
        wallPolygons.push(flatCoords);
      }
    }

    mapLayers.addFloor({
      id: mapId,
      name: item.name.replace(/\.[^/.]+$/, ''),
      elevationFt: 0,
      assetUrl: fileUrl,
      gridConfig: {
        pixelsPerSquare: ppg,
        offsetX: 0,
        offsetY: 0,
      },
      wallPolygons,
    });

    const walls: MapWall[] = [];
    if (uvtt.line_of_sight) {
      for (const line of uvtt.line_of_sight) {
        if (Array.isArray(line)) {
          for (let j = 0; j < line.length - 1; j++) {
            const p1 = line[j];
            const p2 = line[j + 1];
            if (p1 && p2) {
              walls.push({
                id: `wall-${Date.now()}-${walls.length}`,
                p1: { x: p1.x * ppg, y: p1.y * ppg },
                p2: { x: p2.x * ppg, y: p2.y * ppg },
                type: 'wall' as const,
              });
            }
          }
        }
      }
    }
    for (const p of uvtt.portals || []) {
      if (p.bounds && p.bounds.length >= 2) {
        walls.push({
          id: `door-${Date.now()}-${walls.length}`,
          p1: { x: p.bounds[0].x * ppg, y: p.bounds[0].y * ppg },
          p2: { x: p.bounds[1].x * ppg, y: p.bounds[1].y * ppg },
          type: p.closed === false ? ('door_open' as const) : ('door_closed' as const),
        });
      }
    }

    // Save embedded raster texture to maps/ if present in UVTT payload
    if (uvtt.image) {
      const imgName = `${item.name.replace(/\.[^/.]+$/, '')}.png`;
      const cleanImgBase64 = uvtt.image.includes(',') ? uvtt.image.split(',')[1] : uvtt.image;
      const savedImg = await campaignDirectoryStore.saveAsset('maps', imgName, cleanImgBase64);
      if (savedImg.url) {
        fileUrl = savedImg.url;
      }
    }

    const lightsCount = Array.isArray(uvtt.lights) ? uvtt.lights.length : 0;

    await mapsDb.tacticalMaps.put(
      createTacticalMapRecord(mapId, item.name.replace(/\.[^/.]+$/, ''), ppg, walls, blob)
    );

    return {
      success: true,
      summary: `Imported Universal VTT (${cols}x${rows} @ ${ppg} DPI, ${walls.length} LOS walls/doors, ${lightsCount} lights)`,
    };
  }

  // GeoJSON Watabou Settlement
  if (ext === 'geojson') {
    const text = await getItemText(item);
    const watabou = parseWatabouGeoJson(text);
    const mapId = `watabou-${Date.now()}`;
    await mapsDb.tacticalMaps.put(
      createTacticalMapRecord(mapId, watabou.name || item.name.replace(/\.[^/.]+$/, ''), 50, [], blob)
    );
    return {
      success: true,
      summary: `Registered Watabou settlement with ${watabou.districts.length} districts & ${watabou.buildings.length} buildings`,
    };
  }

  // Standard Raster Image Map (png, jpg, webp)
  const mapId = `map-${Date.now()}`;
  await mapsDb.tacticalMaps.put(
    createTacticalMapRecord(mapId, item.name.replace(/\.[^/.]+$/, ''), 60, [], blob)
  );

  return { success: true, summary: `Saved map to maps/${item.name} and calibrated 60px grid layer` };
}

/**
 * 3. AUDIO ROUTING
 * Copies audio tracks to campaign `audio/` and registers track metadata.
 */
async function routeAudio(
  item: IngestQueueItem,
  ext: string,
  onProgress?: (percent: number, message: string) => void
): Promise<{ success: boolean; summary: string }> {
  onProgress?.(30, 'Saving track to campaign audio storage...');

  const blob = await getItemBlob(item);
  let audioUrl = `/api/campaign/assets/audio/${encodeURIComponent(item.name)}`;

  if (blob.size > 0) {
    const base64 = await blobToBase64(blob);
    const saved = await campaignDirectoryStore.saveAsset('audio', item.name, base64);
    if (saved.url) audioUrl = saved.url;
  }

  onProgress?.(70, 'Registering track metadata with audio bus...');

  // Auto-detect audio bus (music vs ambient vs sfx)
  const lowerName = item.name.toLowerCase();
  let bus: 'music' | 'ambient' | 'sfx' = 'ambient';
  if (lowerName.includes('music') || lowerName.includes('theme') || lowerName.includes('battle')) {
    bus = 'music';
  } else if (lowerName.includes('sfx') || lowerName.includes('hit') || lowerName.includes('spell') || lowerName.includes('dice')) {
    bus = 'sfx';
  }

  // Save to Dexie media table as reference
  await compendiumDb.media.put({
    id: `audio-${Date.now()}-${item.name}`,
    name: item.name.replace(/\.[^/.]+$/, ''),
    sourceBook: 'Campaign Audio',
    mimeType: item.mimeType || `audio/${ext}`,
    createdAt: Date.now(),
    url: audioUrl,
    category: bus,
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('vtt:audio-track-registered', {
        detail: { id: item.name, name: item.name, bus, url: audioUrl },
      })
    );
  }

  return { success: true, summary: `Registered ${bus} track: ${item.name}` };
}

/**
 * 4. VIDEO ROUTING
 * Copies video to campaign `maps/` and instantiates looping animated battlemap texture record.
 */
async function routeVideo(
  item: IngestQueueItem,
  ext: string,
  onProgress?: (percent: number, message: string) => void
): Promise<{ success: boolean; summary: string }> {
  onProgress?.(30, 'Copying animated video to campaign maps storage...');

  const blob = await getItemBlob(item);
  let videoUrl = `/api/campaign/assets/maps/${encodeURIComponent(item.name)}`;

  if (blob.size > 0) {
    const base64 = await blobToBase64(blob);
    const saved = await campaignDirectoryStore.saveAsset('maps', item.name, base64);
    if (saved.url) videoUrl = saved.url;
  }

  onProgress?.(70, 'Creating animated battlemap video projection record...');

  const mapId = `video-map-${Date.now()}`;
  await mapsDb.tacticalMaps.put(
    createTacticalMapRecord(mapId, item.name.replace(/\.[^/.]+$/, ''), 70, [], blob)
  );

  return {
    success: true,
    summary: `Registered animated video battlemap texture: maps/${item.name}`,
  };
}
