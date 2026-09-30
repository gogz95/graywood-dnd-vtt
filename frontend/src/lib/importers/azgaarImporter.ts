// src/lib/importers/azgaarImporter.ts
// Azgaar Fantasy Map Generator (.map / GeoJSON) Importer
// Converts overland burgs/features into POI pins, state boundaries, and trade routes

import type { WorldAtlasMap, MapPoiPin } from '../types/maps';
import { mapsDb } from '../db/mapsDb';

export async function importAzgaarGeoJson(file: File, atlasName: string): Promise<WorldAtlasMap> {
  const text = await file.text();
  let geoData: any;

  try {
    geoData = JSON.parse(text);
  } catch (err: any) {
    throw new Error(`Failed to parse Azgaar GeoJSON: ${err?.message || 'Invalid JSON format'}`);
  }

  const features: any[] = Array.isArray(geoData)
    ? geoData
    : Array.isArray(geoData.features)
    ? geoData.features
    : [];

  const poiPins: MapPoiPin[] = [];
  const borderFeatures: any[] = [];
  const routeFeatures: any[] = [];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  function expandBounds(x: number, y: number) {
    if (isNaN(x) || isNaN(y)) return;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  function scanCoords(coords: any) {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      expandBounds(coords[0], coords[1]);
    } else {
      for (const c of coords) {
        scanCoords(c);
      }
    }
  }

  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    const props = f.properties || {};
    const geom = f.geometry || {};

    if (geom.coordinates) {
      scanCoords(geom.coordinates);
    }

    // 1. Convert burgs / towns / population centers into POI Pins
    const isBurg =
      props.type === 'burg' ||
      props.type === 'town' ||
      props.type === 'city' ||
      props.population !== undefined ||
      (geom.type === 'Point' && (props.name || props.burg));

    if (isBurg && geom.coordinates && Array.isArray(geom.coordinates)) {
      const coords = geom.coordinates;
      const x = Number(coords[0]) || 0;
      const y = Number(coords[1]) || 0;
      const name = props.name || props.burg || `Settlement ${i + 1}`;
      const numPop = typeof props.population === 'number' ? props.population : Number(props.population) || undefined;
      const pop = numPop !== undefined ? `Pop: ${numPop.toLocaleString()}` : '';
      const provinceName = props.state || props.province || undefined;
      const state = provinceName ? `Province: ${provinceName}` : '';
      const desc = [pop, state, props.description].filter(Boolean).join(' · ');

      let icon = 'town';
      if (props.capital) icon = 'castle';
      else if (props.port || props.type === 'port') icon = 'anchor';
      else if (props.type === 'cave' || props.type === 'ruin') icon = 'dungeon';

      poiPins.push({
        id: `pin-${props.id || props.i || i}-${Date.now().toString(36)}`,
        x,
        y,
        icon,
        label: name,
        description: desc || 'Settlement',
        population: numPop,
        province: provinceName,
        isSecret: Boolean(props.isSecret),
      });
    }

    // 2. Extract State & Cultural Boundaries (Polygons / MultiPolygons)
    const isBorder =
      props.type === 'state' ||
      props.type === 'province' ||
      props.type === 'culture' ||
      props.type === 'border' ||
      geom.type === 'Polygon' ||
      geom.type === 'MultiPolygon';

    if (isBorder && !isBurg) {
      borderFeatures.push(f);
    }

    // 3. Extract Routes, Rivers & Sea Lanes (LineStrings / MultiLineStrings)
    const isRoute =
      props.type === 'route' ||
      props.type === 'road' ||
      props.type === 'river' ||
      props.type === 'trail' ||
      geom.type === 'LineString' ||
      geom.type === 'MultiLineString';

    if (isRoute && !isBurg) {
      routeFeatures.push(f);
    }
  }

  // Fallback map boundaries if bounding box was flat/empty
  const hasValidBbox = isFinite(minX) && isFinite(minY) && isFinite(maxX) && isFinite(maxY);
  const bbox: [number, number, number, number] = hasValidBbox
    ? [minX, minY, maxX, maxY]
    : [0, 0, 4000, 3000];

  const mapWidth = Math.max(100, bbox[2] - bbox[0]);
  const mapHeight = Math.max(100, bbox[3] - bbox[1]);

  const now = Date.now();
  const mapRecord: WorldAtlasMap = {
    id: `atlas-${now}-${Math.random().toString(36).slice(2, 7)}`,
    name: atlasName.trim() || file.name.replace(/\.[^/.]+$/, '') || 'Azgaar Fantasy World',
    type: 'atlas',
    createdAt: now,
    updatedAt: now,
    width: mapWidth,
    height: mapHeight,
    bbox,
    scale: {
      unitsPerPixel: geoData.scale?.unitsPerPixel || 1,
      unitName: geoData.scale?.unitName || 'miles',
    },
    poiPins,
    vectorLayers: {
      bordersGeoJson: {
        type: 'FeatureCollection',
        features: borderFeatures,
      },
      routesGeoJson: {
        type: 'FeatureCollection',
        features: routeFeatures,
      },
    },
  };

  await mapsDb.atlasMaps.put(mapRecord);
  return mapRecord;
}
