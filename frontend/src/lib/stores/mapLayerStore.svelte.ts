// src/lib/stores/mapLayerStore.svelte.ts
// Multi-floor Z-level scene manager and active floor tracking

import type { GridConfig } from '../services/gridCalibration';

export interface MapFloor {
  id: string;
  name: string;
  elevationFt: number;
  assetUrl: string;
  gridConfig: GridConfig;
  wallPolygons: number[][];
}

class MapLayerStore {
  floors = $state<MapFloor[]>([]);
  activeFloorIndex = $state<number>(0);

  activeFloor = $derived(this.floors[this.activeFloorIndex] ?? null);

  addFloor(floor: MapFloor) {
    this.floors.push(floor);
    this.activeFloorIndex = this.floors.length - 1;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('map:floor-changed', { detail: floor }));
    }
  }

  setFloor(index: number) {
    if (index >= 0 && index < this.floors.length) {
      this.activeFloorIndex = index;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('map:floor-changed', { detail: this.floors[index] }));
      }
    }
  }

  removeFloor(index: number) {
    if (index >= 0 && index < this.floors.length) {
      this.floors.splice(index, 1);
      if (this.activeFloorIndex >= this.floors.length) {
        this.activeFloorIndex = Math.max(0, this.floors.length - 1);
      }
    }
  }
}

export const mapLayers = new MapLayerStore();
