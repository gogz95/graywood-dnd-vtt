// frontend/src/plugins/map-importers/services/uvttParser.ts
// Universal VTT (.uvtt / .dd2vtt), Watabou GeoJSON, and Dungeon Scrawl Vector Geometry Converters

import type { MapSceneData } from '$lib/types/viewport';
import { uploadAsset } from '$lib/services/assetUpload';

export interface WatabouCityDistrict {
  id: string;
  name: string;
  wardType: string;
  polygon: Array<[number, number]>;
}

export interface WatabouCityData {
  cityId: string;
  cityName: string;
  districts: WatabouCityDistrict[];
  metadataNotes: string[];
  featuresCount: number;
}

/**
 * Converts a base64 encoded string into a File object.
 */
async function base64ToFile(base64Data: string, filename: string): Promise<File> {
  const cleanB64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  const binaryStr = atob(cleanB64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  const mimeType = base64Data.startsWith('data:image/webp')
    ? 'image/webp'
    : base64Data.startsWith('data:image/jpeg')
      ? 'image/jpeg'
      : 'image/png';

  const blob = new Blob([bytes], { type: mimeType });
  return new File([blob], filename, { type: mimeType });
}

/**
 * Parses Universal VTT (.uvtt / .dd2vtt) raw JSON into canonical MapSceneData.
 */
export async function parseUvttFile(rawJson: any): Promise<MapSceneData> {
  const pixelsPerGrid = rawJson.resolution?.pixels_per_grid ?? 70;
  let assetUrl: string | undefined;

  // 1. Decode base64 image and upload to Host storage
  if (rawJson.image) {
    try {
      const file = await base64ToFile(
        rawJson.image,
        `uvtt_map_${Date.now()}.${rawJson.image.startsWith('data:image/webp') ? 'webp' : 'png'}`
      );
      assetUrl = await uploadAsset(file, 'maps');
    } catch (err) {
      console.warn('[uvttParser] Upload failed, falling back to inline data URL:', err);
      assetUrl = rawJson.image.startsWith('data:')
        ? rawJson.image
        : `data:image/png;base64,${rawJson.image}`;
    }
  }

  // 2. Convert line_of_sight polylines and portals into canonical wall segments
  const walls: Array<{ id: string; p1: [number, number]; p2: [number, number]; blocksVision: boolean }> = [];
  let wallIdx = 0;

  if (Array.isArray(rawJson.line_of_sight)) {
    for (const chain of rawJson.line_of_sight) {
      if (Array.isArray(chain) && chain.length >= 2) {
        for (let i = 0; i < chain.length - 1; i++) {
          const ptA = chain[i];
          const ptB = chain[i + 1];
          if (ptA && ptB) {
            walls.push({
              id: `los_${wallIdx++}`,
              p1: [ptA.x * pixelsPerGrid, ptA.y * pixelsPerGrid],
              p2: [ptB.x * pixelsPerGrid, ptB.y * pixelsPerGrid],
              blocksVision: true
            });
          }
        }
      }
    }
  }

  if (Array.isArray(rawJson.portals)) {
    for (const portal of rawJson.portals) {
      if (Array.isArray(portal.bounds) && portal.bounds.length >= 2) {
        const ptA = portal.bounds[0];
        const ptB = portal.bounds[1];
        walls.push({
          id: `door_${wallIdx++}`,
          p1: [ptA.x * pixelsPerGrid, ptA.y * pixelsPerGrid],
          p2: [ptB.x * pixelsPerGrid, ptB.y * pixelsPerGrid],
          blocksVision: portal.closed !== false
        });
      } else if (portal.position) {
        const px = portal.position.x * pixelsPerGrid;
        const py = portal.position.y * pixelsPerGrid;
        const half = pixelsPerGrid / 2;
        walls.push({
          id: `door_${wallIdx++}`,
          p1: [px - half, py],
          p2: [px + half, py],
          blocksVision: portal.closed !== false
        });
      }
    }
  }

  return {
    id: `scene_uvtt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name: rawJson.name || 'Universal VTT Battlemap',
    type: 'tactical_2d',
    grid: {
      type: 'square',
      size: pixelsPerGrid,
      scaleFeet: 5
    },
    assetUrl,
    walls
  };
}

/**
 * Extracts city districts and building polygons from Watabou GeoJSON into metadata notes.
 */
export function parseWatabouGeoJson(rawGeoJson: any): WatabouCityData {
  const cityName =
    rawGeoJson.properties?.name || rawGeoJson.name || 'Watabou Procedural Settlement';
  const districts: WatabouCityDistrict[] = [];
  const metadataNotes: string[] = [];

  const features = Array.isArray(rawGeoJson.features) ? rawGeoJson.features : [];

  for (let i = 0; i < features.length; i++) {
    const feat = features[i];
    const props = feat.properties || {};
    const geom = feat.geometry || {};

    const name = props.name || props.ward || props.district || `Ward ${i + 1}`;
    const wardType = props.type || props.ward || 'urban';

    let polygon: Array<[number, number]> = [];
    if (geom.type === 'Polygon' && Array.isArray(geom.coordinates?.[0])) {
      polygon = geom.coordinates[0].map((pt: [number, number]) => [pt[0], pt[1]]);
    } else if (geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates?.[0]?.[0])) {
      polygon = geom.coordinates[0][0].map((pt: [number, number]) => [pt[0], pt[1]]);
    }

    districts.push({
      id: `district_${i}`,
      name,
      wardType,
      polygon
    });

    metadataNotes.push(`${name} [${wardType}]: ${polygon.length} perimeter coordinates.`);
  }

  return {
    cityId: `city_${Date.now()}`,
    cityName,
    districts,
    metadataNotes,
    featuresCount: features.length
  };
}

/**
 * Parses Dungeon Scrawl line geometry into MapSceneData walls.
 */
export function parseDungeonScrawlJson(rawJson: any): MapSceneData {
  const pixelsPerGrid = rawJson.grid?.size ?? 70;
  const walls: Array<{ id: string; p1: [number, number]; p2: [number, number]; blocksVision: boolean }> = [];
  let wallIdx = 0;

  if (Array.isArray(rawJson.lines)) {
    for (const line of rawJson.lines) {
      if (line.p1 && line.p2) {
        walls.push({
          id: `ds_${wallIdx++}`,
          p1: [line.p1.x ?? line.p1[0], line.p1.y ?? line.p1[1]],
          p2: [line.p2.x ?? line.p2[0], line.p2.y ?? line.p2[1]],
          blocksVision: true
        });
      }
    }
  }

  return {
    id: `scene_ds_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name: rawJson.name || 'Dungeon Scrawl Map',
    type: 'tactical_2d',
    grid: {
      type: 'square',
      size: pixelsPerGrid,
      scaleFeet: 5
    },
    walls
  };
}
