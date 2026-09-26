// src/lib/stores/mapStore.svelte.ts
// Svelte 5 Reactive Battlemat Vector Map Store
// Synchronizes GeoJSON/SVG wall geometry with SQLite backend, Pixi wallsContainer, and Camera Viewport

import { canvasStore } from '../../stores/canvasStore.svelte';
import { wallStore } from './wallStore.svelte';
import { mapsDb } from '../db/mapsDb';
import { tacticalViewport } from '../services/canvas/tacticalViewportService.svelte';
import { broadcastBattlematUpdate } from '../services/battlematSyncBridge';
import type { CanonicalWall, BoundingBox } from '../services/vectorMapParser';
import type { TacticalBattlemap } from '../types/maps';

export interface SyncVectorOptions {
  name: string;
  walls: CanonicalWall[];
  bounds: BoundingBox;
  mapId?: string;
  gridSize?: number;
  imageBlob?: Blob | string;
  fitCamera?: boolean;
}

export interface SyncResult {
  success: boolean;
  mapId: string;
  wallCount: number;
  bounds: BoundingBox;
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
}

class MapStore {
  activeMapId = $state<string>('');
  activeMapName = $state<string>('Default Battlemat');
  walls = $state<CanonicalWall[]>([]);
  bounds = $state<BoundingBox>({ minX: 0, minY: 0, maxX: 1200, maxY: 800, width: 1200, height: 800 });
  gridSize = $state<number>(60);
  isSyncing = $state<boolean>(false);
  lastSyncTime = $state<number>(0);

  wallCount = $derived(this.walls.length);

  /**
   * Persists vector geometry to SQLite, synchronizes the live Pixi wallsContainer,
   * and auto-fits the camera viewport to the imported map geometry.
   */
  async syncVectorGeometry(options: SyncVectorOptions): Promise<SyncResult> {
    this.isSyncing = true;
    const mapId = options.mapId || `map-${Date.now()}`;
    const name = options.name || 'Imported Vector Map';
    const effectiveGridSize = options.gridSize || 60;
    const { walls, bounds } = options;

    try {
      // 1. Update SQLite via Tauri IPC or LAN REST fallback
      const payload = {
        map_id: mapId,
        name,
        grid_size: effectiveGridSize,
        walls: walls.map((w) => ({
          id: w.id,
          x1: w.x1,
          y1: w.y1,
          x2: w.x2,
          y2: w.y2,
          blocks_light: w.blocksLight,
          blocks_movement: w.blocksMovement,
        })),
      };

      if (isTauri()) {
        try {
          const tauri = (window as unknown as { __TAURI__?: { core?: { invoke: (cmd: string, args: unknown) => Promise<number> } } }).__TAURI__;
          if (tauri?.core?.invoke) {
            await tauri.core.invoke('save_map_vector_geometry', { request: payload });
          }
        } catch (ipcErr) {
          console.warn('[MapStore] Tauri IPC save_map_vector_geometry failed, attempting REST:', ipcErr);
          await this.fallbackRestSave(payload);
        }
      } else {
        await this.fallbackRestSave(payload);
      }

      // 2. Persist to local IndexedDB (mapsDb)
      const mapRecord: TacticalBattlemap = {
        id: mapId,
        name,
        type: 'tactical',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        grid: {
          type: 'square',
          sizePx: effectiveGridSize,
          offsetX: 0,
          offsetY: 0,
          opacity: 0.35,
          color: '#64748b',
        },
        lighting: {
          ambientDarkness: 0,
          tintColor: '#ffffff',
        },
        fogOfWar: {
          revealedPolygons: [],
          concealedPolygons: [],
        },
        walls: walls.map((w) => ({
          id: w.id,
          p1: { x: w.x1, y: w.y1 },
          p2: { x: w.x2, y: w.y2 },
          type: w.door ? 'door_closed' : 'wall',
        })),
        tokens: [],
        textureBlob: options.imageBlob instanceof Blob ? options.imageBlob : undefined,
        textureUrl: typeof options.imageBlob === 'string' ? options.imageBlob : undefined,
      };

      try {
        await mapsDb.tacticalMaps.put(mapRecord);
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('vtt_active_battlemap_id', mapId);
        }
      } catch (idbErr) {
        console.warn('[MapStore] Failed saving to IndexedDB:', idbErr);
      }

      // 3. Immediately update live Pixi wallsContainer & CanvasStore without requiring a page refresh
      this.activeMapId = mapId;
      this.activeMapName = name;
      this.walls = walls;
      this.bounds = bounds;
      this.gridSize = effectiveGridSize;
      this.lastSyncTime = Date.now();

      const canonicalWallSegments = walls.map((w) => ({
        id: w.id,
        x1: w.x1,
        y1: w.y1,
        x2: w.x2,
        y2: w.y2,
        blocksVision: w.blocksLight,
        blocksMovement: w.blocksMovement,
        isDoor: Boolean(w.door),
        isOpen: false,
      }));

      wallStore.setWalls(canonicalWallSegments);
      canvasStore.setWallCollisions(canonicalWallSegments);
      canvasStore.setWallsAndDoors(canonicalWallSegments, []);

      // Dispatch live synchronization events
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('vtt:walls-updated', {
            detail: { mapId, walls: canonicalWallSegments, bounds },
          })
        );

        window.dispatchEvent(
          new CustomEvent('vtt:load-battle-map', {
            detail: {
              mapId,
              fileName: name,
              gridSize: effectiveGridSize,
              walls: canonicalWallSegments,
              width: bounds.width,
              height: bounds.height,
            },
          })
        );
      }

      broadcastBattlematUpdate({
        type: 'WALL_GEOMETRY_UPDATE',
        mapId,
        walls: canonicalWallSegments,
      });

      // 4. Auto-fit camera viewport bounds to the imported map geometry
      if (options.fitCamera !== false && typeof window !== 'undefined') {
        const viewW = window.innerWidth || 1200;
        const viewH = window.innerHeight || 800;
        this.fitCameraToBounds(bounds, viewW, viewH);
      }

      return {
        success: true,
        mapId,
        wallCount: walls.length,
        bounds,
      };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Auto-fits camera viewport to enclose the imported geometry with comfortable margins.
   */
  fitCameraToBounds(bounds: BoundingBox, viewW: number, viewH: number) {
    const margin = 80;
    const targetW = Math.max(bounds.width + margin * 2, 200);
    const targetH = Math.max(bounds.height + margin * 2, 200);

    const scaleX = viewW / targetW;
    const scaleY = viewH / targetH;
    const zoom = Math.max(0.15, Math.min(2.5, Math.min(scaleX, scaleY)));

    // Center camera on geometry center
    const centerX = bounds.minX + bounds.width / 2;
    const centerY = bounds.minY + bounds.height / 2;

    const panX = viewW / 2 - centerX * zoom;
    const panY = viewH / 2 - centerY * zoom;

    tacticalViewport.setCamera(panX, panY, zoom);
    canvasStore.setDmViewport({ x: panX, y: panY, zoom });
  }

  private async fallbackRestSave(payload: unknown): Promise<void> {
    try {
      await fetch('/api/map/save_vector', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      // In standalone frontend offline mode, IndexedDB and memory hold the source of truth
    }
  }
}

export const mapStore = new MapStore();
