// frontend/src/lib/canvas/controllers/GridController.ts
// Pure TypeScript isolated GridController for PixiJS v8.
// Operates strictly on unscaled logical coordinates.
// Framework-agnostic: zero Svelte runes or Svelte store imports.

import type { Container } from 'pixi.js';
import { Graphics } from 'pixi.js';
import { ViewportController } from './ViewportController';

declare module './ViewportController' {
  interface ViewportController {
    getVisibleBounds(): {
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
      width: number;
      height: number;
    };
  }
}

// Augment ViewportController prototype with getVisibleBounds if not already present
if (typeof ViewportController !== 'undefined' && !ViewportController.prototype.getVisibleBounds) {
  ViewportController.prototype.getVisibleBounds = function (this: ViewportController) {
    const canvas = (this as any).canvasElement as HTMLCanvasElement | undefined;
    const width = canvas ? canvas.clientWidth || canvas.width : 1920;
    const height = canvas ? canvas.clientHeight || canvas.height : 1080;
    const tl = this.screenToWorld(0, 0);
    const br = this.screenToWorld(width, height);
    const minX = Math.min(tl.x, br.x);
    const maxX = Math.max(tl.x, br.x);
    const minY = Math.min(tl.y, br.y);
    const maxY = Math.max(tl.y, br.y);
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    };
  };
}

export interface GridConfig {
  type: 'square' | 'hex_pointy' | 'hex_flat' | 'none';
  cellSize: number;       // Base grid cell width/height in logical pixels (default: 100)
  color: number;          // Hex color (default: 0xcccccc)
  alpha: number;          // Opacity (default: 0.3)
  offsetX: number;        // Logical pixel alignment offset
  offsetY: number;
  scalePpi: number;       // Physical pixels-per-inch scalar (default: 96)
}

export const DEFAULT_GRID_CONFIG: GridConfig = {
  type: 'square',
  cellSize: 100,
  color: 0xcccccc,
  alpha: 0.3,
  offsetX: 0,
  offsetY: 0,
  scalePpi: 96,
};

export class GridController {
  public gridContainer: Container;
  private graphics: Graphics;
  private stage: Container;
  private viewport: ViewportController | null = null;
  private config: GridConfig = { ...DEFAULT_GRID_CONFIG };
  private lastRenderKey: string = '';

  constructor(stage: Container, viewport?: ViewportController | null) {
    this.stage = stage;
    this.viewport = viewport ?? null;

    this.gridContainer = new (stage.constructor as any)();
    this.gridContainer.label = 'VTT_GridContainer';

    this.graphics = new Graphics();
    this.graphics.label = 'VTT_GridGraphics';
    this.gridContainer.addChild(this.graphics);

    // Parent into designated world container if present, or directly onto stage
    const world = stage.label === 'VTT_WorldContainer'
      ? stage
      : (stage.getChildByLabel('VTT_WorldContainer') || stage);
    world.addChild(this.gridContainer);

    this.redraw(true);
  }

  /**
   * Returns a copy of the active GridConfig.
   */
  public getConfig(): GridConfig {
    return { ...this.config };
  }

  /**
   * Updates grid configuration parameters and performs a cached redraw.
   */
  public setGridConfig(config: Partial<GridConfig>): void {
    this.config = { ...this.config, ...config };
    this.redraw(true);
  }

  /**
   * Links or updates the active ViewportController for dynamic bounds calculation.
   */
  public setViewport(viewport: ViewportController | null): void {
    this.viewport = viewport;
    this.redraw(true);
  }

  /**
   * Computes visible world-space bounds from ViewportController or default fallback.
   */
  public getVisibleBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    if (this.viewport && typeof this.viewport.getVisibleBounds === 'function') {
      return this.viewport.getVisibleBounds();
    }
    return { minX: -2000, minY: -2000, maxX: 2000, maxY: 2000 };
  }

  /**
   * Redraws grid lines dynamically across visible world bounds using batched Graphics.
   */
  public redraw(force: boolean = false): void {
    if (this.config.type === 'none' || this.config.alpha <= 0 || this.config.cellSize <= 0) {
      if (this.lastRenderKey !== 'none') {
        this.graphics.clear();
        this.lastRenderKey = 'none';
      }
      return;
    }

    const bounds = this.getVisibleBounds();
    const pad = this.config.cellSize * 2;
    const roundedMinX = Math.floor((bounds.minX - pad) / this.config.cellSize) * this.config.cellSize;
    const roundedMaxX = Math.ceil((bounds.maxX + pad) / this.config.cellSize) * this.config.cellSize;
    const roundedMinY = Math.floor((bounds.minY - pad) / this.config.cellSize) * this.config.cellSize;
    const roundedMaxY = Math.ceil((bounds.maxY + pad) / this.config.cellSize) * this.config.cellSize;

    const renderKey = `${this.config.type}_${this.config.cellSize}_${this.config.color}_${this.config.alpha}_${this.config.offsetX}_${this.config.offsetY}_${roundedMinX}_${roundedMinY}_${roundedMaxX}_${roundedMaxY}`;
    if (!force && renderKey === this.lastRenderKey) {
      return;
    }
    this.lastRenderKey = renderKey;

    this.graphics.clear();

    const drawBounds = {
      minX: roundedMinX,
      minY: roundedMinY,
      maxX: roundedMaxX,
      maxY: roundedMaxY,
    };

    switch (this.config.type) {
      case 'square':
        this.renderSquareGrid(drawBounds);
        break;
      case 'hex_pointy':
        this.renderHexPointyGrid(drawBounds);
        break;
      case 'hex_flat':
        this.renderHexFlatGrid(drawBounds);
        break;
    }

    // Instanced/batched single draw call for all accumulated grid lines
    this.graphics.stroke({
      color: this.config.color,
      width: 1,
      alpha: this.config.alpha,
    });
  }

  /**
   * Generates batched square grid lines in unscaled logical coordinates.
   */
  private renderSquareGrid(bounds: { minX: number; minY: number; maxX: number; maxY: number }): void {
    const cellSize = this.config.cellSize;
    const offsetX = ((this.config.offsetX % cellSize) + cellSize) % cellSize;
    const offsetY = ((this.config.offsetY % cellSize) + cellSize) % cellSize;

    const startX = Math.floor((bounds.minX - offsetX) / cellSize) * cellSize + offsetX;
    const endX = Math.ceil((bounds.maxX - offsetX) / cellSize) * cellSize + offsetX;

    const startY = Math.floor((bounds.minY - offsetY) / cellSize) * cellSize + offsetY;
    const endY = Math.ceil((bounds.maxY - offsetY) / cellSize) * cellSize + offsetY;

    const maxLines = 10000;
    let count = 0;

    // Vertical lines
    for (let x = startX; x <= endX && count < maxLines; x += cellSize, count++) {
      this.graphics.moveTo(x, startY);
      this.graphics.lineTo(x, endY);
    }

    // Horizontal lines
    count = 0;
    for (let y = startY; y <= endY && count < maxLines; y += cellSize, count++) {
      this.graphics.moveTo(startX, y);
      this.graphics.lineTo(endX, y);
    }
  }

  /**
   * Generates batched pointy-topped hexagonal grid edges in unscaled logical coordinates.
   */
  private renderHexPointyGrid(bounds: { minX: number; minY: number; maxX: number; maxY: number }): void {
    const s = this.config.cellSize;
    const radius = s / Math.sqrt(3);
    const deltaX = s;
    const deltaY = 1.5 * radius;

    const startCol = Math.floor((bounds.minX - this.config.offsetX - s) / deltaX);
    const endCol = Math.ceil((bounds.maxX - this.config.offsetX + s) / deltaX);
    const startRow = Math.floor((bounds.minY - this.config.offsetY - s) / deltaY);
    const endRow = Math.ceil((bounds.maxY - this.config.offsetY + s) / deltaY);

    const maxHexes = 15000;
    let hexCount = 0;

    for (let col = startCol; col <= endCol && hexCount < maxHexes; col++) {
      const cx = col * deltaX + this.config.offsetX;
      const yOffset = (Math.abs(col) % 2 === 1) ? deltaY / 2 : 0;

      for (let row = startRow; row <= endRow && hexCount < maxHexes; row++) {
        const cy = row * deltaY + yOffset + this.config.offsetY;
        hexCount++;

        for (let i = 0; i < 6; i++) {
          const a1 = (Math.PI / 180) * (60 * i - 30);
          const a2 = (Math.PI / 180) * (60 * (i + 1) - 30);
          this.graphics.moveTo(cx + radius * Math.cos(a1), cy + radius * Math.sin(a1));
          this.graphics.lineTo(cx + radius * Math.cos(a2), cy + radius * Math.sin(a2));
        }
      }
    }
  }

  /**
   * Generates batched flat-topped hexagonal grid edges in unscaled logical coordinates.
   */
  private renderHexFlatGrid(bounds: { minX: number; minY: number; maxX: number; maxY: number }): void {
    const s = this.config.cellSize;
    const radius = s / Math.sqrt(3);
    const deltaX = 1.5 * radius;
    const deltaY = s;

    const startCol = Math.floor((bounds.minX - this.config.offsetX - s) / deltaX);
    const endCol = Math.ceil((bounds.maxX - this.config.offsetX + s) / deltaX);
    const startRow = Math.floor((bounds.minY - this.config.offsetY - s) / deltaY);
    const endRow = Math.ceil((bounds.maxY - this.config.offsetY + s) / deltaY);

    const maxHexes = 15000;
    let hexCount = 0;

    for (let row = startRow; row <= endRow && hexCount < maxHexes; row++) {
      const cy = row * deltaY + this.config.offsetY;
      const xOffset = (Math.abs(row) % 2 === 1) ? deltaX / 2 : 0;

      for (let col = startCol; col <= endCol && hexCount < maxHexes; col++) {
        const cx = col * deltaX + xOffset + this.config.offsetX;
        hexCount++;

        for (let i = 0; i < 6; i++) {
          const a1 = (Math.PI / 180) * (60 * i);
          const a2 = (Math.PI / 180) * (60 * (i + 1));
          this.graphics.moveTo(cx + radius * Math.cos(a1), cy + radius * Math.sin(a1));
          this.graphics.lineTo(cx + radius * Math.cos(a2), cy + radius * Math.sin(a2));
        }
      }
    }
  }

  /**
   * Cleans up graphics geometry and destroys the dedicated grid container.
   */
  public destroy(): void {
    this.graphics.clear();
    this.gridContainer.destroy({ children: true });
    this.viewport = null;
  }
}
