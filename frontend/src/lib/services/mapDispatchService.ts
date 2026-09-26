// src/lib/services/mapDispatchService.ts
// Automatic Direct Push Pipeline for Generated & Imported Maps to the Battlemat
// Manages memory lifecycle for Blob Object URLs and synchronizes with Projector display

import { canvasStore } from '../stores/canvasStore';
import { wallStore, type WallSegment } from '../stores/wallStore.svelte';
import { mapsDb } from '../db/mapsDb';
import type { TacticalBattlemap } from '../types/maps';
import { broadcastBattlematUpdate } from './battlematSyncBridge';

export interface DispatchMapPayload {
  imageBlob: Blob | string;
  gridCols?: number;
  gridRows?: number;
  gridSize?: number;
  name?: string;
  walls?: Array<{ x1: number; y1: number; x2: number; y2: number; blocksLight?: boolean; blocksVision?: boolean; blocksMovement?: boolean; door?: boolean; isDoor?: boolean }>;
}

export interface PushMapOptions {
  name?: string;
  gridSize?: number;
  gridCols?: number;
  gridRows?: number;
  walls?: Array<{ x1: number; y1: number; x2: number; y2: number; blocksLight?: boolean; blocksVision?: boolean; blocksMovement?: boolean; door?: boolean; isDoor?: boolean }>;
}

let activeBlobUrl: string | null = null;

/**
 * Revokes any previously allocated Object URL to avoid memory leaks across long sessions.
 */
function cleanupPreviousBlobUrl(): void {
  if (activeBlobUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    try {
      URL.revokeObjectURL(activeBlobUrl);
    } catch {
      // Non-blocking cleanup
    }
    activeBlobUrl = null;
  }
}

/**
 * Dispatches a generated or imported map directly to the Tactical Battlemat canvas and projector.
 */
export async function dispatchMapToBattlemat(payload: DispatchMapPayload): Promise<string> {
  const { imageBlob, gridCols, gridRows, gridSize, name, walls } = payload;
  let textureUrl: string;

  if (typeof imageBlob === 'string') {
    cleanupPreviousBlobUrl();
    textureUrl = imageBlob;
  } else if (imageBlob instanceof Blob) {
    cleanupPreviousBlobUrl();
    activeBlobUrl = URL.createObjectURL(imageBlob);
    textureUrl = activeBlobUrl;
  } else {
    throw new Error('Invalid image payload passed to dispatchMapToBattlemat');
  }

  // Pre-load image to verify dimensions and context stability
  const img = new Image();
  img.crossOrigin = 'anonymous';

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load map texture into Image element'));
    img.src = textureUrl;
  });

  const naturalWidth = img.naturalWidth || 1800;
  const naturalHeight = img.naturalHeight || 1200;

  // 1. Convert walls to canonical wall segment schemas
  const canonicalWalls: WallSegment[] = (walls || []).map((w, idx) => ({
    id: `wall-col-${Date.now()}-${idx}`,
    x1: w.x1,
    y1: w.y1,
    x2: w.x2,
    y2: w.y2,
    blocksVision: w.blocksLight !== undefined ? w.blocksLight : (w.blocksVision !== undefined ? w.blocksVision : true),
    blocksMovement: w.blocksMovement !== undefined ? w.blocksMovement : true,
    isDoor: w.door || w.isDoor,
    isOpen: false
  }));

  // 2. Register & Select Active Map in IndexedDB
  const mapId = `map-${Date.now()}`;
  const effectiveGridSize = gridSize || 60;
  try {
    const mapRecord: TacticalBattlemap = {
      id: mapId,
      name: name || 'Tactical Battlemat',
      type: 'tactical',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      grid: {
        type: 'square',
        sizePx: effectiveGridSize,
        offsetX: 0,
        offsetY: 0,
        opacity: 0.35,
        color: '#64748b'
      },
      lighting: {
        ambientDarkness: 0,
        tintColor: '#ffffff'
      },
      fogOfWar: {
        revealedPolygons: [],
        concealedPolygons: []
      },
      walls: canonicalWalls.map(w => ({
        id: w.id,
        p1: { x: w.x1, y: w.y1 },
        p2: { x: w.x2, y: w.y2 },
        type: w.isDoor ? 'door_closed' : 'wall'
      })),
      tokens: [],
      textureBlob: imageBlob instanceof Blob ? imageBlob : undefined,
      textureUrl: typeof imageBlob === 'string' ? imageBlob : undefined
    };
    await mapsDb.tacticalMaps.put(mapRecord);

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('vtt_active_battlemap_id', mapId);
    }
  } catch (err) {
    console.warn('[MapDispatch] Failed persisting map to mapsDb:', err);
  }

  // 3. Update DM Canvas Store & Wall Store
  canvasStore.setBackgroundTexture(
    {
      url: textureUrl,
      width: naturalWidth,
      height: naturalHeight,
      name: name || 'Tactical Battlemat'
    },
    gridCols,
    gridRows
  );

  canvasStore.setGridSize(effectiveGridSize);
  wallStore.setWalls(canonicalWalls);
  canvasStore.setWallCollisions(canonicalWalls);
  canvasStore.setWallsAndDoors(canonicalWalls, []);

  // Persist vector geometry directly to SQLite
  const sqlitePayload = {
    map_id: mapId,
    name: name || 'Tactical Battlemat',
    grid_size: effectiveGridSize,
    walls: canonicalWalls.map((w) => ({
      id: w.id,
      x1: w.x1,
      y1: w.y1,
      x2: w.x2,
      y2: w.y2,
      blocks_light: w.blocksVision,
      blocks_movement: w.blocksMovement,
    })),
  };

  if (typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)) {
    try {
      const tauri = (window as any).__TAURI__;
      if (tauri?.core?.invoke) {
        await tauri.core.invoke('save_map_vector_geometry', { request: sqlitePayload });
      }
    } catch (err) {
      console.warn('[MapDispatch] SQLite IPC failed:', err);
    }
  } else {
    try {
      await fetch('/api/map/save_vector', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sqlitePayload),
      });
    } catch {
      // offline fallback
    }
  }

  // Auto-fit camera viewport bounds to imported geometry
  if (typeof window !== 'undefined') {
    const viewW = window.innerWidth || 1200;
    const viewH = window.innerHeight || 800;
    const margin = 80;
    const scaleX = viewW / Math.max(naturalWidth + margin * 2, 200);
    const scaleY = viewH / Math.max(naturalHeight + margin * 2, 200);
    const fitZoom = Math.max(0.15, Math.min(2.5, Math.min(scaleX, scaleY)));
    const panX = (viewW - naturalWidth * fitZoom) / 2;
    const panY = (viewH - naturalHeight * fitZoom) / 2;
    canvasStore.setDmViewport({ x: panX, y: panY, zoom: fitZoom });
  }

  // 4. Broadcast to Projector Route and WebSockets
  broadcastBattlematUpdate({
    type: 'MAP_TEXTURE_UPDATE',
    url: textureUrl,
    width: naturalWidth,
    height: naturalHeight
  });

  // 5. Dispatch workspace events
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('vtt:maps-updated')
    );

    window.dispatchEvent(
      new CustomEvent('vtt:walls-updated', {
        detail: { mapId, walls: canonicalWalls }
      })
    );

    window.dispatchEvent(
      new CustomEvent('vtt:load-battle-map', {
        detail: {
          url: textureUrl,
          fileName: name || 'Tactical Battlemat',
          mapId,
          gridSize: effectiveGridSize,
          gridCols,
          gridRows,
          walls: canonicalWalls,
          width: naturalWidth,
          height: naturalHeight
        }
      })
    );

    // Switch DM view to battlemat tab
    window.dispatchEvent(
      new CustomEvent('vtt:switch-tab', {
        detail: { tab: 'battlemat' }
      })
    );
  }

  return textureUrl;
}

/**
 * Legacy wrapper for backward compatibility with existing generator triggers.
 */
export async function pushMapToBattlemat(
  source: Blob | string,
  options: PushMapOptions = {}
): Promise<void> {
  await dispatchMapToBattlemat({
    imageBlob: source,
    name: options.name,
    gridSize: options.gridSize,
    gridCols: options.gridCols,
    gridRows: options.gridRows,
    walls: options.walls
  });
}
