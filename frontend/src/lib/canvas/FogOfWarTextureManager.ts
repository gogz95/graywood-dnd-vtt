// frontend/src/lib/canvas/FogOfWarTextureManager.ts
// GPU Blitting & Dexie-Persisted Fog of War Exploration Shroud Manager
// Maintains offscreen explored canvas buffer, composites explored shroud, and persists to dexieDb.scene_fog

import { dexieDb } from '../db/dexieDb';

export class FogOfWarTextureManager {
  private width: number;
  private height: number;
  private exploredCanvas: HTMLCanvasElement | null = null;
  private exploredCtx: CanvasRenderingContext2D | null = null;
  private activeSceneId: string = 'default_scene';
  private saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(width = 1920, height = 1080) {
    this.width = width;
    this.height = height;
    this.initCanvas();
  }

  public initForScene(sceneId: string, width: number, height: number): void {
    this.activeSceneId = sceneId;
    this.width = width;
    this.height = height;
    this.initCanvas();
    this.loadFromDexie(sceneId);
  }

  private initCanvas(): void {
    if (typeof document === 'undefined') return;
    this.exploredCanvas = document.createElement('canvas');
    this.exploredCanvas.width = this.width;
    this.exploredCanvas.height = this.height;
    this.exploredCtx = this.exploredCanvas.getContext('2d', { willReadFrequently: true });

    if (this.exploredCtx) {
      this.exploredCtx.clearRect(0, 0, this.width, this.height);
    }
  }

  /**
   * Blits a newly revealed visibility polygon into the explored buffer with blend mode 'source-over'.
   * The explored buffer represents the cumulative explored footprint.
   */
  public blitExploredPolygon(polygon: Array<[number, number]> | Array<{ x: number; y: number }>): void {
    if (!this.exploredCtx || polygon.length < 3) return;

    this.exploredCtx.save();
    this.exploredCtx.globalCompositeOperation = 'source-over';
    this.exploredCtx.fillStyle = '#ffffff';

    this.exploredCtx.beginPath();
    const p0 = Array.isArray(polygon[0]) ? { x: polygon[0][0], y: polygon[0][1] } : polygon[0];
    this.exploredCtx.moveTo(p0.x, p0.y);

    for (let i = 1; i < polygon.length; i++) {
      const pt = Array.isArray(polygon[i]) ? { x: (polygon[i] as [number, number])[0], y: (polygon[i] as [number, number])[1] } : (polygon[i] as { x: number; y: number });
      this.exploredCtx.lineTo(pt.x, pt.y);
    }

    this.exploredCtx.closePath();
    this.exploredCtx.fill();
    this.exploredCtx.restore();

    this.scheduleSave();
  }

  /**
   * Resets or clears the explored fog buffer.
   */
  public resetExploration(startRevealed = false): void {
    if (!this.exploredCtx) return;
    if (startRevealed) {
      this.exploredCtx.fillStyle = '#ffffff';
      this.exploredCtx.fillRect(0, 0, this.width, this.height);
    } else {
      this.exploredCtx.clearRect(0, 0, this.width, this.height);
    }
    this.scheduleSave();
  }

  /**
   * Returns whether a given coordinate has been previously explored.
   */
  public isPointExplored(x: number, y: number): boolean {
    if (!this.exploredCtx || x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return false;
    }
    try {
      const pixel = this.exploredCtx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
      return pixel[3] > 32; // Alpha threshold
    } catch {
      return true;
    }
  }

  public getCanvas(): HTMLCanvasElement | null {
    return this.exploredCanvas;
  }

  /**
   * Debounces serialization of the explored shroud bitmap to Dexie db.scene_fog.
   */
  private scheduleSave(): void {
    if (this.saveDebounceTimer) clearTimeout(this.saveDebounceTimer);
    this.saveDebounceTimer = setTimeout(() => {
      this.persistToDexie();
    }, 600);
  }

  private async persistToDexie(): Promise<void> {
    if (!this.exploredCanvas || !dexieDb?.scene_fog) return;
    try {
      const dataUrl = this.exploredCanvas.toDataURL('image/png');
      await dexieDb.scene_fog.put({
        sceneId: this.activeSceneId,
        fogDataUrl: dataUrl,
        width: this.width,
        height: this.height,
        updatedAt: Date.now(),
      });
    } catch (e) {
      console.warn('[FogOfWarTextureManager] Save to Dexie failed:', e);
    }
  }

  private async loadFromDexie(sceneId: string): Promise<void> {
    if (!dexieDb?.scene_fog || !this.exploredCtx) return;
    try {
      const record = await dexieDb.scene_fog.get(sceneId);
      if (record && record.fogDataUrl) {
        const img = new Image();
        img.onload = () => {
          if (this.exploredCtx) {
            this.exploredCtx.clearRect(0, 0, this.width, this.height);
            this.exploredCtx.drawImage(img, 0, 0, this.width, this.height);
          }
        };
        img.src = record.fogDataUrl;
      }
    } catch (e) {
      console.warn('[FogOfWarTextureManager] Load from Dexie error:', e);
    }
  }
}

export const fogOfWarTextureManager = new FogOfWarTextureManager();
