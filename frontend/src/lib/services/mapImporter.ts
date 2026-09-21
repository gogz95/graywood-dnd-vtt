// src/lib/services/mapImporter.ts
// Universal Map Importer with .dd2vtt/.uvtt, Azgaar .map/.geojson, and Raster Image Support

import { canvasStore } from '../../stores/canvasStore.svelte';
import { mapsDb } from '../db/mapsDb';
import { importAzgaarGeoJson } from '../importers/azgaarImporter';
import type { TacticalBattlemap, MapWall } from '../types/maps';
import type { WallSegment, DoorPrimitive } from '../canvas/parsers/dungeonScrawlParser';

export interface MapImportResult {
  success: boolean;
  format: 'uvtt' | 'azgaar' | 'raster' | 'unknown';
  name: string;
  gridSize?: number;
  wallsCount?: number;
  lightsCount?: number;
  promptGridCalibration?: boolean;
  error?: string;
}

export async function importUniversalMap(
  file: File | Blob,
  fileName: string
): Promise<MapImportResult> {
  const lowerName = fileName.toLowerCase();

  try {
    // 1. Universal VTT (.dd2vtt / .uvtt)
    if (lowerName.endsWith('.dd2vtt') || lowerName.endsWith('.uvtt')) {
      const text = await file.text();
      const data = JSON.parse(text);

      const gridPitch = data.resolution?.pixels_per_grid || 70;
      const mapSize = data.resolution?.map_size || { x: 20, y: 20 };
      const mapWidth = mapSize.x * gridPitch;
      const mapHeight = mapSize.y * gridPitch;

      // Extract image bytes to canvas background
      let imageUrl = '';
      if (data.image) {
        imageUrl = data.image.startsWith('data:')
          ? data.image
          : `data:image/png;base64,${data.image}`;
      }

      // Convert line_of_sight arrays to wall segments
      const wallSegments: WallSegment[] = [];
      const losArrays = data.line_of_sight || [];
      for (let i = 0; i < losArrays.length; i++) {
        const poly = losArrays[i];
        if (Array.isArray(poly)) {
          for (let j = 0; j < poly.length - 1; j++) {
            const p1 = poly[j];
            const p2 = poly[j + 1];
            wallSegments.push({
              id: `uvtt-wall-${Date.now()}-${i}-${j}`,
              x1: p1.x * gridPitch,
              y1: p1.y * gridPitch,
              x2: p2.x * gridPitch,
              y2: p2.y * gridPitch,
            });
          }
        }
      }

      // Convert portals to doors
      const doors: DoorPrimitive[] = [];
      const portals = data.portals || [];
      for (let i = 0; i < portals.length; i++) {
        const port = portals[i];
        const bounds = port.bounds || [];
        if (bounds.length >= 2) {
          doors.push({
            id: `uvtt-door-${Date.now()}-${i}`,
            x1: bounds[0].x * gridPitch,
            y1: bounds[0].y * gridPitch,
            x2: bounds[1].x * gridPitch,
            y2: bounds[1].y * gridPitch,
            state: port.closed ? 'CLOSED' : 'OPEN',
            doorType: 'STANDARD',
          });
        }
      }

      // Apply to canvasStore
      if (imageUrl) {
        canvasStore.setBackgroundTexture({
          url: imageUrl,
          width: mapWidth,
          height: mapHeight,
          name: fileName,
        });
      }
      canvasStore.setGridSize(gridPitch);
      canvasStore.setWallsAndDoors(wallSegments, doors);

      // Persist to mapsDb
      const mapRecord: TacticalBattlemap = {
        id: `map-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: fileName.replace(/\.[^/.]+$/, ''),
        type: 'tactical',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        grid: {
          type: 'square',
          sizePx: gridPitch,
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
        walls: wallSegments.map(w => ({
          id: w.id,
          p1: { x: w.x1, y: w.y1 },
          p2: { x: w.x2, y: w.y2 },
          type: 'wall' as const,
        })),
        tokens: [],
        textureBlob: file,
      };
      await mapsDb.tacticalMaps.put(mapRecord);

      return {
        success: true,
        format: 'uvtt',
        name: fileName,
        gridSize: gridPitch,
        wallsCount: wallSegments.length,
        lightsCount: Array.isArray(data.lights) ? data.lights.length : 0,
      };
    }

    // 2. Azgaar Fantasy Map / GeoJSON (.map / .geojson)
    if (lowerName.endsWith('.map') || lowerName.endsWith('.geojson')) {
      const atlasName = fileName.replace(/\.[^/.]+$/, '');
      const atlas = await importAzgaarGeoJson(file as File, atlasName);
      return {
        success: true,
        format: 'azgaar',
        name: atlas.name,
      };
    }

    // 3. Raster Images (.png, .webp, .jpg, .jpeg)
    if (
      lowerName.endsWith('.png') ||
      lowerName.endsWith('.webp') ||
      lowerName.endsWith('.jpg') ||
      lowerName.endsWith('.jpeg')
    ) {
      const url = URL.createObjectURL(file);
      const img = new Image();

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image metadata'));
        img.src = url;
      });

      const defaultGrid = 70;
      canvasStore.setBackgroundTexture({
        url,
        width: img.width,
        height: img.height,
        name: fileName,
      });
      canvasStore.setGridSize(defaultGrid);

      const mapRecord: TacticalBattlemap = {
        id: `map-img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: fileName.replace(/\.[^/.]+$/, ''),
        type: 'tactical',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        grid: {
          type: 'square',
          sizePx: defaultGrid,
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
      await mapsDb.tacticalMaps.put(mapRecord);

      return {
        success: true,
        format: 'raster',
        name: fileName,
        gridSize: defaultGrid,
        promptGridCalibration: true,
      };
    }

    return {
      success: false,
      format: 'unknown',
      name: fileName,
      error: 'Unsupported map format. Please provide .dd2vtt, .uvtt, .map, .geojson, or raster image.',
    };
  } catch (err: any) {
    return {
      success: false,
      format: 'unknown',
      name: fileName,
      error: err?.message || 'Failed to import map.',
    };
  }
}
