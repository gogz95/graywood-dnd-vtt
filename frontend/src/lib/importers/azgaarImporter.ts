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

  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    const props = f.properties || {};
    const geom = f.geometry || {};

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
      const pop = props.population ? `Pop: ${Number(props.population).toLocaleString()}` : '';
      const state = props.state ? `Province: ${props.state}` : '';
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

  const now = Date.now();
  const mapRecord: WorldAtlasMap = {
    id: `atlas-${now}-${Math.random().toString(36).slice(2, 7)}`,
    name: atlasName.trim() || file.name.replace(/\.[^/.]+$/, '') || 'Azgaar Fantasy World',
    type: 'atlas',
    createdAt: now,
    updatedAt: now,
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
