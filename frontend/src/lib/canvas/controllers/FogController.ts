// frontend/src/lib/canvas/controllers/FogController.ts
// Pure TypeScript FogController for PixiJS v8.
// Stores revealed polygon vertices in typed Float32Array buffers without Svelte reactivity proxies.

import type { Container } from 'pixi.js';
import { Graphics } from 'pixi.js';

export class FogController {
  public fogLayer: Container;
  private fogGraphics: Graphics;
  // Raw Float32Array vertex buffer without any Svelte proxy wrapping
  private fogBuffer: Float32Array | null = null;
  public fogColor: number = 0x05070f;
  public fogAlpha: number = 0.95;

  constructor(parent: Container) {
    this.fogLayer = new (parent.constructor as any)();
    this.fogLayer.label = 'VTT_FogLayer';

    this.fogGraphics = new Graphics();
    this.fogGraphics.label = 'VTT_FogGraphics';
    this.fogLayer.addChild(this.fogGraphics);

    const world = parent.label === 'VTT_WorldContainer'
      ? parent
      : (parent.getChildByLabel?.('VTT_WorldContainer') || parent);
    world.addChild(this.fogLayer);
  }

  /**
   * Sets the raw vertex buffer (consecutive [x0, y0, x1, y1, ...] floats).
   * Polygons separated by NaN will be drawn as distinct closed contours.
   */
  public setFogData(buffer: Float32Array): void {
    this.fogBuffer = buffer;
    this.redraw();
  }

  /**
   * Clears active fog buffer and resets graphics geometry.
   */
  public clearFog(): void {
    this.fogBuffer = null;
    this.fogGraphics.clear();
  }

  /**
   * Redraws revealed fog geometry from the typed Float32Array buffer.
   */
  public redraw(): void {
    this.fogGraphics.clear();
    if (!this.fogBuffer || this.fogBuffer.length < 6) {
      return;
    }

    const buf = this.fogBuffer;
    let inPoly = false;

    for (let i = 0; i < buf.length; i += 2) {
      const x = buf[i];
      const y = buf[i + 1];

      if (isNaN(x) || isNaN(y)) {
        if (inPoly) {
          this.fogGraphics.closePath();
          inPoly = false;
        }
      } else if (!inPoly) {
        this.fogGraphics.moveTo(x, y);
        inPoly = true;
      } else {
        this.fogGraphics.lineTo(x, y);
      }
    }

    if (inPoly) {
      this.fogGraphics.closePath();
    }

    this.fogGraphics.fill({
      color: this.fogColor,
      alpha: this.fogAlpha,
    });
  }

  /**
   * Register a callback to recompute visibility rays (e.g. from tactical lighting engine)
   */
  private visibilityRecomputeCallbacks: Array<() => void> = [];

  public onRecomputeVisibility(cb: () => void): () => void {
    this.visibilityRecomputeCallbacks.push(cb);
    return () => {
      this.visibilityRecomputeCallbacks = this.visibilityRecomputeCallbacks.filter(c => c !== cb);
    };
  }

  /**
   * Triggers immediate recomputation of visibility and fog lines of sight.
   */
  public recomputeVisibility(): void {
    for (const cb of this.visibilityRecomputeCallbacks) {
      cb();
    }
    this.redraw();
  }

  /**
   * Tears down fog buffer and destroys the dedicated fog layer container.
   */
  public destroy(): void {
    this.visibilityRecomputeCallbacks = [];
    this.clearFog();
    this.fogGraphics.clear();
    this.fogLayer.destroy({ children: true });
    this.fogBuffer = null;
  }
}
