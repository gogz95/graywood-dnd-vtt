// src/lib/services/mapDispatchService.ts
// Automatic Direct Push Pipeline for Generated & Imported Maps to the Battlemat

import { canvasStore } from '../stores/canvasStore';
import { broadcastBattlematUpdate } from './battlematSyncBridge';

export interface PushMapOptions {
  name?: string;
  gridSize?: number;
  walls?: Array<{ x1: number; y1: number; x2: number; y2: number }>;
}

export async function pushMapToBattlemat(
  source: Blob | string,
  options: PushMapOptions = {}
): Promise<void> {
  let textureUrl = typeof source === 'string' ? source : URL.createObjectURL(source);

  const img = new Image();
  img.src = textureUrl;
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });

  canvasStore.setBackgroundTexture({
    url: textureUrl,
    width: img.naturalWidth,
    height: img.naturalHeight,
    name: options.name || 'Tactical Encounter Map'
  });

  if (options.gridSize) {
    canvasStore.setGridSize(options.gridSize);
  }

  if (options.walls && options.walls.length > 0) {
    canvasStore.setWallCollisions(options.walls);
  }

  broadcastBattlematUpdate({
    type: 'MAP_TEXTURE_UPDATE',
    url: textureUrl,
    width: img.naturalWidth,
    height: img.naturalHeight
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('vtt:load-battle-map', {
      detail: {
        url: textureUrl,
        fileName: options.name || 'Tactical Encounter Map',
        gridSize: options.gridSize
      }
    }));
  }
}
