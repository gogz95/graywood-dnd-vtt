// frontend/src/lib/canvas/fogEngine.ts
// Triple-State Fog of War Engine: Unexplored Void, Explored Terrain Memory, & Active LoS Sight

export type FogCellState = 'unexplored' | 'explored' | 'active';

export interface FogEngineConfig {
  width: number;
  height: number;
  unexploredColor?: string; // Default 'rgba(5, 7, 15, 1.0)'
  memoryDesaturation?: number; // 0.0 - 1.0 (default 0.75 grayscale)
  memoryDimming?: number; // Multiplier on memory brightness (default 0.45)
}

export class FogOfWarMemoryEngine {
  private width: number;
  private height: number;
  private memoryCanvas: HTMLCanvasElement | null = null;
  private memoryCtx: CanvasRenderingContext2D | null = null;
  private exploredMaskCanvas: HTMLCanvasElement | null = null;
  private exploredMaskCtx: CanvasRenderingContext2D | null = null;
  private config: FogEngineConfig;

  constructor(config: FogEngineConfig) {
    this.config = {
      unexploredColor: 'rgba(5, 7, 15, 1.0)',
      memoryDesaturation: 0.85,
      memoryDimming: 0.40,
      ...config,
    };
    this.width = Math.max(1, config.width);
    this.height = Math.max(1, config.height);
    this.initCanvases();
  }

  private initCanvases(): void {
    if (typeof document === 'undefined') return;

    this.memoryCanvas = document.createElement('canvas');
    this.memoryCanvas.width = this.width;
    this.memoryCanvas.height = this.height;
    this.memoryCtx = this.memoryCanvas.getContext('2d');

    this.exploredMaskCanvas = document.createElement('canvas');
    this.exploredMaskCanvas.width = this.width;
    this.exploredMaskCanvas.height = this.height;
    this.exploredMaskCtx = this.exploredMaskCanvas.getContext('2d');

    if (this.exploredMaskCtx) {
      // Initially pitch black (unexplored)
      this.exploredMaskCtx.fillStyle = 'rgba(0, 0, 0, 1.0)';
      this.exploredMaskCtx.fillRect(0, 0, this.width, this.height);
    }
  }

  public resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    if (this.memoryCanvas && this.memoryCtx) {
      this.memoryCanvas.width = this.width;
      this.memoryCanvas.height = this.height;
    }
    if (this.exploredMaskCanvas && this.exploredMaskCtx) {
      this.exploredMaskCanvas.width = this.width;
      this.exploredMaskCanvas.height = this.height;
      this.exploredMaskCtx.fillStyle = 'rgba(0, 0, 0, 1.0)';
      this.exploredMaskCtx.fillRect(0, 0, this.width, this.height);
    }
  }

  /**
   * Bakes newly revealed visibility polygons into the persistent Explored Memory mask.
   */
  public revealSightPolygons(polygons: Array<Array<{ x: number; y: number }>>): void {
    if (!this.exploredMaskCtx || polygons.length === 0) return;

    this.exploredMaskCtx.save();
    // Destination-out clears the black mask, marking territory as explored
    this.exploredMaskCtx.globalCompositeOperation = 'destination-out';
    this.exploredMaskCtx.fillStyle = 'rgba(0, 0, 0, 1.0)';

    for (const poly of polygons) {
      if (poly.length < 3) continue;
      this.exploredMaskCtx.beginPath();
      this.exploredMaskCtx.moveTo(poly[0].x, poly[0].y);
      for (let i = 1; i < poly.length; i++) {
        this.exploredMaskCtx.lineTo(poly[i].x, poly[i].y);
      }
      this.exploredMaskCtx.closePath();
      this.exploredMaskCtx.fill();
    }
    this.exploredMaskCtx.restore();
  }

  /**
   * Updates static terrain memory snapshot (culled of tokens and dynamic entities).
   */
  public snapshotTerrain(baseTerrainCanvasOrImage: CanvasImageSource): void {
    if (!this.memoryCtx) return;

    this.memoryCtx.save();
    this.memoryCtx.clearRect(0, 0, this.width, this.height);
    this.memoryCtx.drawImage(baseTerrainCanvasOrImage, 0, 0, this.width, this.height);

    // Apply 5e memory styling: desaturate to muted monochrome and dim
    this.memoryCtx.globalCompositeOperation = 'color';
    this.memoryCtx.fillStyle = 'rgba(100, 116, 139, 1.0)';
    this.memoryCtx.fillRect(0, 0, this.width, this.height);

    this.memoryCtx.globalCompositeOperation = 'multiply';
    this.memoryCtx.fillStyle = `rgba(30, 41, 59, ${1.0 - (this.config.memoryDimming ?? 0.4)})`;
    this.memoryCtx.fillRect(0, 0, this.width, this.height);

    this.memoryCtx.restore();
  }

  /**
   * Composites the three fog tiers:
   * 1. Unexplored: Opaque black void
   * 2. Explored Memory: Dimmed grayscale terrain snapshot
   * 3. Active Sight: Full-color active visibility punch-through
   */
  public compositeFogPass(
    targetCtx: CanvasRenderingContext2D,
    activeSightPolygons: Array<Array<{ x: number; y: number }>>
  ): void {
    if (!this.exploredMaskCanvas || !this.memoryCanvas) return;

    targetCtx.save();

    // 1. Draw Explored Memory layer
    targetCtx.drawImage(this.memoryCanvas, 0, 0);

    // 2. Punch out Active Sight polygons with source-over / clip for full-color real-time terrain
    if (activeSightPolygons.length > 0) {
      targetCtx.save();
      targetCtx.beginPath();
      for (const poly of activeSightPolygons) {
        if (poly.length < 3) continue;
        targetCtx.moveTo(poly[0].x, poly[0].y);
        for (let i = 1; i < poly.length; i++) {
          targetCtx.lineTo(poly[i].x, poly[i].y);
        }
        targetCtx.closePath();
      }
      targetCtx.clip();
      // Within active sight, clear the memory tint so live full-color layers shine through
      targetCtx.globalCompositeOperation = 'destination-out';
      targetCtx.fill();
      targetCtx.restore();
    }

    // 3. Draw Unexplored Void mask on top (covers anything never explored)
    targetCtx.globalCompositeOperation = 'source-over';
    targetCtx.drawImage(this.exploredMaskCanvas, 0, 0);

    targetCtx.restore();
  }
}
