// src/lib/services/mapDispatchService.ts
// Automatic Direct Push Pipeline for Generated & Imported Maps to the Battlemat
// Manages memory lifecycle for Blob Object URLs and synchronizes with Projector display

import { canvasStore } from '../stores/canvasStore';
import { broadcastBattlematUpdate } from './battlematSyncBridge';

export interface DispatchMapPayload {
  imageBlob: Blob | string;
  gridCols?: number;
  gridRows?: number;
  gridSize?: number;
  name?: string;
  walls?: Array<{ x1: number; y1: number; x2: number; y2: number }>;
}

export interface PushMapOptions {
  name?: string;
  gridSize?: number;
  gridCols?: number;
  gridRows?: number;
  walls?: Array<{ x1: number; y1: number; x2: number; y2: number }>;
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

  // 1. Update DM Canvas Store
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

  if (gridSize) {
    canvasStore.setGridSize(gridSize);
  }

  if (walls && walls.length > 0) {
    canvasStore.setWallCollisions(walls);
  }

  // 2. Broadcast to Projector Route and WebSockets
  broadcastBattlematUpdate({
    type: 'MAP_TEXTURE_UPDATE',
    url: textureUrl,
    width: naturalWidth,
    height: naturalHeight
  });

  // 3. Dispatch workspace events
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('vtt:load-battle-map', {
        detail: {
          url: textureUrl,
          fileName: name || 'Tactical Battlemat',
          gridSize: gridSize || canvasStore.gridSize,
          gridCols,
          gridRows
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
