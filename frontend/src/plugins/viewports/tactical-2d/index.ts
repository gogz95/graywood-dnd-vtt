import { mount, unmount } from 'svelte';
import type { ViewportProvider } from '$lib/types/viewport';
import type { TokenCoordinates } from '$lib/types/coreModels';
import TacticalCanvas from '$lib/canvas/TacticalCanvas.svelte';

export function canonicalToPixel(coords: TokenCoordinates, gridSize: number): { x: number; y: number } {
  return {
    x: (coords.gridX + (coords.offsetX ?? 0)) * gridSize,
    y: (coords.gridY + (coords.offsetY ?? 0)) * gridSize
  };
}

export function pixelToCanonical(
  pixelX: number,
  pixelY: number,
  gridSize: number,
  elevationFt = 0
): TokenCoordinates {
  const totalGridX = pixelX / gridSize;
  const totalGridY = pixelY / gridSize;
  const gridX = Math.floor(totalGridX);
  const gridY = Math.floor(totalGridY);
  return {
    gridX,
    gridY,
    offsetX: Number((totalGridX - gridX).toFixed(4)),
    offsetY: Number((totalGridY - gridY).toFixed(4)),
    elevationFt
  };
}

export const tactical2dProvider: ViewportProvider = {
  id: 'viewport-pixi-2d',
  name: '2D Tactical Battlemat',
  supportedSceneTypes: ['tactical_2d'],
  mount: (container, props) => {
    const gridSize = props.scene?.grid?.size ?? 50;

    const mappedTokens = (props.tokens ?? []).map((t: any) => {
      if (t.gridX !== undefined && t.gridY !== undefined && t.x === undefined) {
        const pix = canonicalToPixel(t, gridSize);
        return { ...t, x: pix.x, y: pix.y };
      }
      return t;
    });

    const app = mount(TacticalCanvas, {
      target: container,
      props: {
        tokens: mappedTokens,
        walls: (props.scene?.walls as any) ?? [],
        gridSize,
        activeTool: props.activeTool ?? 'select',
        onTokenMove: (tokenId: string, pixelX: number, pixelY: number) => {
          const canonical = pixelToCanonical(pixelX, pixelY, gridSize);
          props.callbacks.onTokenMoved(tokenId, canonical as any);
        },
        onDropMonster: (monster: any, pixelX: number, pixelY: number) => {
          const canonical = pixelToCanonical(pixelX, pixelY, gridSize);
          const tokenId = monster?.id ?? `monster-${Date.now()}`;
          props.callbacks.onTokenMoved(tokenId, canonical as any);
        }
      }
    });

    return {
      destroy: () => unmount(app)
    };
  }
};
