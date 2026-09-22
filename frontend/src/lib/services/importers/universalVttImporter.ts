// src/lib/services/importers/universalVttImporter.ts
// Universal VTT (.dd2vtt, .uvtt) Importer with grid calibration & line-of-sight wall parsing

import { mapLayers, type MapFloor } from '$lib/stores/mapLayerStore.svelte';

export interface UVTTFormat {
  format: number;
  resolution: {
    map_origin: { x: number; y: number };
    map_size: { x: number; y: number };
    pixels_per_grid: number;
  };
  image: string; // Base64 encoded PNG or WebP
  line_of_sight: Array<Array<{ x: number; y: number }>>;
  portals?: Array<{
    position: { x: number; y: number };
    bounds: Array<{ x: number; y: number }>;
    rotation: number;
    closed: boolean;
    freestanding: boolean;
  }>;
  lights?: Array<{
    position: { x: number; y: number };
    range: number;
    intensity: number;
    color: string;
    shadows: boolean;
  }>;
}

export async function importUniversalVtt(file: File): Promise<MapFloor> {
  const text = await file.text();
  const data: UVTTFormat = JSON.parse(text);

  // Convert Base64 image payload to Blob URL
  const byteCharacters = atob(data.image);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const imageBlob = new Blob([byteArray], { type: 'image/png' });
  const assetUrl = URL.createObjectURL(imageBlob);

  // Extract Line of Sight wall coordinates
  const wallPolygons: number[][] = [];
  if (data.line_of_sight) {
    for (const line of data.line_of_sight) {
      const flatCoords: number[] = [];
      for (const pt of line) {
        flatCoords.push(pt.x * data.resolution.pixels_per_grid, pt.y * data.resolution.pixels_per_grid);
      }
      wallPolygons.push(flatCoords);
    }
  }

  const newFloor: MapFloor = {
    id: `floor_uvtt_${Date.now()}`,
    name: file.name.replace(/\.[^/.]+$/, ''),
    elevationFt: 0,
    assetUrl,
    gridConfig: {
      pixelsPerSquare: data.resolution?.pixels_per_grid || 70,
      offsetX: data.resolution?.map_origin?.x || 0,
      offsetY: data.resolution?.map_origin?.y || 0
    },
    wallPolygons
  };

  mapLayers.floors.push(newFloor);
  mapLayers.activeFloorIndex = mapLayers.floors.length - 1;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('map:floor-changed', { detail: newFloor }));
  }

  return newFloor;
}
