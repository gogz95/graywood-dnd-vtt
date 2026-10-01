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
import { parseItemInWorker } from '../../workers/parseWorkerClient';
import { extractAndStoreCompendiumSource } from '../../importers/pdfRuleExtractor';
import { ingestUniversalFile } from '../../importers/universalIngestionEngine';
import type { UVTTFormat } from '../importers/universalVttImporter';
import type { TacticalBattlemap, MapWall } from '../../types/maps';
import type { IngestQueueItem } from './ingestTypes';
import type { VisionSource } from '../../canvas/LightShadowRenderer';
import { canvasStore } from '../../../stores/canvasStore.svelte';
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

async function persistMapVectorToBackend(
  mapId: string,
  name: string,
  gridSize: number,
  walls: MapWall[] = []
): Promise<void> {
  const wallPayload = walls.map((w) => ({
    id: w.id,
    x1: w.p1.x,
    y1: w.p1.y,
    x2: w.p2.x,
    y2: w.p2.y,
    blocks_light: true,
    blocks_movement: !w.type.startsWith('door_open'),
  }));
  const req = {
    map_id: mapId,
    name,
    grid_size: gridSize,
    walls: wallPayload,
  };
  try {
    const win = typeof window !== 'undefined' ? (window as any) : {};
    if (win.__TAURI__?.core?.invoke) {
      await win.__TAURI__.core.invoke('save_map_vector_geometry', { request: req });
      return;
    }
  } catch {
    // fallback
  }
  try {
    await fetch('/api/campaign/save-map-vector', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
  } catch (err) {
    console.warn('[SubsystemRouter] SQLite map vector persistence warning:', err);
  }
}

/**
 * Helper to get the contents of a queue item as string.
 * Text extraction is offloaded to the background parse worker so large vault
 * files never block the main UI thread. Corrupt or unreadable payloads are
 * surfaced as thrown errors, which the queue processor converts to
 * `{ status: 'error', error }` via its per-item error boundary.
 */
async function getItemText(item: IngestQueueItem): Promise<string> {
  let raw = '';
  if (item.content) {
    raw = item.content;
  } else if (item.file) {
    raw = await (item.file as Blob).text();
  } else if (item.fullPath) {
    const cleanRel = (item.relativePath || '').replace(/\\/g, '/');
    const res = await fetch(`/api/campaign/assets/${cleanRel}`);
    if (res.ok) raw = await res.text();
  }
  if (!raw) {
    throw new Error(`Cannot read text for ${item.name}: empty or missing content`);
  }
  const parsed = await parseItemInWorker(item, raw);
  if (parsed.status === 'failed' || typeof parsed.text !== 'string') {
    throw new Error(parsed.error || `Background parse failed for ${item.name}`);
  }
  return parsed.text;
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
    let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>;
    try {
      zip = await JSZip.loadAsync(blob);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unreadable ZIP archive';
      throw new Error(`Corrupt archive ${item.name}: ${message}`);
    }
    let extractedCount = 0;

    for (const [relativePath, fileEntry] of Object.entries(zip.files)) {
      if (fileEntry.dir) continue;
      const innerExt = relativePath.split('.').pop()?.toLowerCase() || '';
      if (['md', 'txt', 'json', 'csv'].includes(innerExt)) {
        let rawInner: string;
        try {
          rawInner = await fileEntry.async('string');
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Unreadable ZIP entry';
          throw new Error(`Corrupt entry ${item.name}/${relativePath}: ${message}`);
        }
        // Normalize each archive entry off the main thread; corrupt entries
        // resolve as failed results so the queue records `{ status: 'error' }`.
        const workerResult = await parseItemInWorker(
          { ...item, id: `${item.id}:${relativePath}` },
          rawInner
        );
        if (workerResult.status === 'failed' || typeof workerResult.text !== 'string') {
          throw new Error(workerResult.error || `Background parse failed for ${relativePath}`);
        }
        const text = workerResult.text;
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

  // Persist markdown note directly into compendiumDb.journal
  if (compendiumDb.journal) {
    await compendiumDb.journal.put({
      id: `journal-${item.name}`,
      title: item.name.replace(/\.[^/.]+$/, ''),
      category: 'Lore',
      content: text,
      sourceBook: item.name,
      packageId: 'notes',
      createdAt: Date.now(),
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vtt:journal-updated'));
    }
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
    await compendiumDb.media.put({
      id: `token-${item.name}`,
      name: item.name,
      sourceBook: 'Campaign Tokens',
      mimeType: item.mimeType || 'image/png',
      createdAt: Date.now(),
      url: fileUrl,
      category: 'token',
    });

    // Mirror token into compendiumDb.monsters for immediate actor compendium visibility
    const cleanActorName = item.name
      .replace(/\.[^/.]+$/, '')
      .replace(/[-_]token/i, '')
      .replace(/[-_]/g, ' ')
      .trim();
    const existingMonster = await compendiumDb.monsters
      .where('name')
      .equalsIgnoreCase(cleanActorName)
      .first();
    if (!existingMonster) {
      await compendiumDb.monsters.put({
        id: `actor-token-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: cleanActorName,
        cr: 1,
        size: 'Medium',
        type: 'humanoid',
        alignment: 'unaligned',
        ac: 10,
        hp: 10,
        speed: '30 ft.',
        str: 10,
        dex: 10,
        con: 10,
        int: 10,
        wis: 10,
        cha: 10,
        actions: [{ name: 'Token Action', description: 'Custom action for ingested token actor.' }],
        sourceBook: 'Campaign Tokens',
        packageId: 'tokens',
        origin: 'USER_IMPORT',
      });
    }

    await notifyMonstersUpdated();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('compendium:tokens-updated', { detail: { token: item.name, url: fileUrl } })
      );
    }
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

    // Map UVTT light emitters → VisionSource[] and push into the canvas lighting pipeline
    const sceneLights: VisionSource[] = [];
    for (const light of uvtt.lights || []) {
      if (!light?.position) continue;
      // Parse color: hex string '#rrggbb' or 'rgba(...)' → CSS color string
      const color = light.color
        ? (light.color.startsWith('#') ? light.color : light.color)
        : 'rgba(251, 191, 36, 0.4)';
      sceneLights.push({
        id: `uvtt-light-${sceneLights.length}-${Date.now()}`,
        x: light.position.x * ppg,
        y: light.position.y * ppg,
        radius: (light.range || 5) * ppg,
        color,
        intensity: Math.min(1, Math.max(0, light.intensity ?? 1)),
      });
    }
    if (sceneLights.length > 0) {
      canvasStore.setSceneLights(sceneLights);
    }

    const mapRecord = createTacticalMapRecord(
      mapId,
      item.name.replace(/\.[^/.]+$/, ''),
      ppg,
      walls,
      blob
    );
    await mapsDb.tacticalMaps.put(mapRecord);

    // Persist resolution, grid size, and wall colliders into SQLite backend
    await persistMapVectorToBackend(
      mapId,
      item.name.replace(/\.[^/.]+$/, ''),
      ppg,
      walls
    );

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vtt:maps-updated'));
    }

    return {
      success: true,
      summary: `Imported Universal VTT (${cols}x${rows} @ ${ppg} DPI, ${walls.length} LOS walls/doors, ${sceneLights.length} lights)`,
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
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vtt:maps-updated'));
    }
    return {
      success: true,
      summary: `Registered Watabou settlement with ${watabou.districts.length} districts & ${watabou.buildings.length} buildings`,
    };
  }

  // Standard Raster Image Map (png, jpg, webp)
  const mapId = `map-${Date.now()}`;
  const gridSize = item.gridSize || 60;
  const rasterMapRecord = createTacticalMapRecord(
    mapId,
    item.name.replace(/\.[^/.]+$/, ''),
    gridSize,
    [],
    blob
  );
  await mapsDb.tacticalMaps.put(rasterMapRecord);

  // Persist raster map record into SQLite
  await persistMapVectorToBackend(
    mapId,
    item.name.replace(/\.[^/.]+$/, ''),
    gridSize,
    []
  );

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('vtt:maps-updated'));
  }

  return { success: true, summary: `Saved map to maps/${item.name} and calibrated ${gridSize}px grid layer` };
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
