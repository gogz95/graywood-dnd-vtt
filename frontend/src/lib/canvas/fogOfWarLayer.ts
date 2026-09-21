// src/lib/canvas/fogOfWarLayer.ts
// Dual-Layer Fog of War Engine for tactical battlemat & dual-screen projector displays.
// Supports vector polygon operations and radial brush operations with real-time BroadcastChannel sync.

export interface FogPoint {
  x: number;
  y: number;
}

export type FogOperation =
  | { type: 'revealPolygon'; points: FogPoint[] }
  | { type: 'concealPolygon'; points: FogPoint[] }
  | { type: 'revealBrush'; x: number; y: number; radius: number }
  | { type: 'concealBrush'; x: number; y: number; radius: number }
  | { type: 'reset'; concealed: boolean };

export class FogOfWarLayer {
  private width: number;
  private height: number;
  private maskCanvas: HTMLCanvasElement | null = null;
  private maskCtx: CanvasRenderingContext2D | null = null;
  private operations: FogOperation[] = [];
  private broadcastBus: BroadcastChannel | null = null;

  constructor(width = 1920, height = 1080) {
    this.width = width;
    this.height = height;
    this.initCanvas();
    this.initBroadcast();
  }

  private initCanvas() {
    if (typeof document === 'undefined') return;
    this.maskCanvas = document.createElement('canvas');
    this.maskCanvas.width = this.width;
    this.maskCanvas.height = this.height;
    this.maskCtx = this.maskCanvas.getContext('2d');

    // Default: fully obscured (opaque black mask)
    this.resetFog(true, false);
  }

  private initBroadcast() {
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      this.broadcastBus = new BroadcastChannel('vtt_fog_sync');
      this.broadcastBus.onmessage = (event) => {
        const msg = event.data;
        if (msg?.type === 'FOG_OP') {
          this.applyOperation(msg.op, false);
        } else if (msg?.type === 'FOG_FULL_SYNC') {
          this.syncFullState(msg.operations);
        }
      };
    } catch {
      // BroadcastChannel unavailable in some environments
    }
  }

  /**
   * Resets fog of war to completely concealed or completely revealed.
   */
  resetFog(concealed = true, broadcast = true) {
    if (this.maskCtx && this.maskCanvas) {
      this.maskCtx.globalCompositeOperation = 'source-over';
      if (concealed) {
        this.maskCtx.fillStyle = '#000000';
        this.maskCtx.fillRect(0, 0, this.width, this.height);
      } else {
        this.maskCtx.clearRect(0, 0, this.width, this.height);
      }
    }

    const op: FogOperation = { type: 'reset', concealed };
    this.operations = [op];

    if (broadcast) {
      this.broadcastOp(op);
    }
  }

  /**
   * Reveals an arbitrary vector polygon (carves out fog).
   */
  revealPolygon(points: FogPoint[], broadcast = true) {
    if (points.length < 3) return;

    if (this.maskCtx) {
      this.maskCtx.save();
      this.maskCtx.globalCompositeOperation = 'destination-out';
      this.maskCtx.beginPath();
      this.maskCtx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        this.maskCtx.lineTo(points[i].x, points[i].y);
      }
      this.maskCtx.closePath();
      this.maskCtx.fill();
      this.maskCtx.restore();
    }

    const op: FogOperation = { type: 'revealPolygon', points };
    this.operations.push(op);

    if (broadcast) {
      this.broadcastOp(op);
    }
  }

  /**
   * Conceals an arbitrary vector polygon (paints fog back).
   */
  concealPolygon(points: FogPoint[], broadcast = true) {
    if (points.length < 3) return;

    if (this.maskCtx) {
      this.maskCtx.save();
      this.maskCtx.globalCompositeOperation = 'source-over';
      this.maskCtx.fillStyle = '#000000';
      this.maskCtx.beginPath();
      this.maskCtx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        this.maskCtx.lineTo(points[i].x, points[i].y);
      }
      this.maskCtx.closePath();
      this.maskCtx.fill();
      this.maskCtx.restore();
    }

    const op: FogOperation = { type: 'concealPolygon', points };
    this.operations.push(op);

    if (broadcast) {
      this.broadcastOp(op);
    }
  }

  /**
   * Carves out circular fog with soft brush falloff.
   */
  revealBrush(x: number, y: number, radius: number, broadcast = true) {
    if (this.maskCtx) {
      this.maskCtx.save();
      this.maskCtx.globalCompositeOperation = 'destination-out';
      this.maskCtx.beginPath();
      this.maskCtx.arc(x, y, radius, 0, Math.PI * 2);
      this.maskCtx.fill();
      this.maskCtx.restore();
    }

    const op: FogOperation = { type: 'revealBrush', x, y, radius };
    this.operations.push(op);

    if (broadcast) {
      this.broadcastOp(op);
    }
  }

  /**
   * Restores circular fog mask.
   */
  concealBrush(x: number, y: number, radius: number, broadcast = true) {
    if (this.maskCtx) {
      this.maskCtx.save();
      this.maskCtx.globalCompositeOperation = 'source-over';
      this.maskCtx.fillStyle = '#000000';
      this.maskCtx.beginPath();
      this.maskCtx.arc(x, y, radius, 0, Math.PI * 2);
      this.maskCtx.fill();
      this.maskCtx.restore();
    }

    const op: FogOperation = { type: 'concealBrush', x, y, radius };
    this.operations.push(op);

    if (broadcast) {
      this.broadcastOp(op);
    }
  }

  /**
   * Applies an operation received from network/broadcast.
   */
  applyOperation(op: FogOperation, broadcast = false) {
    switch (op.type) {
      case 'reset':
        this.resetFog(op.concealed, broadcast);
        break;
      case 'revealPolygon':
        this.revealPolygon(op.points, broadcast);
        break;
      case 'concealPolygon':
        this.concealPolygon(op.points, broadcast);
        break;
      case 'revealBrush':
        this.revealBrush(op.x, op.y, op.radius, broadcast);
        break;
      case 'concealBrush':
        this.concealBrush(op.x, op.y, op.radius, broadcast);
        break;
    }
  }

  syncFullState(ops: FogOperation[]) {
    this.resetFog(true, false);
    for (const op of ops) {
      this.applyOperation(op, false);
    }
  }

  broadcastFullState() {
    this.broadcastBus?.postMessage({
      type: 'FOG_FULL_SYNC',
      operations: this.operations
    });
  }

  private broadcastOp(op: FogOperation) {
    this.broadcastBus?.postMessage({
      type: 'FOG_OP',
      op
    });
  }

  /**
   * Renders the compiled fog mask onto target canvas context.
   */
  render(targetCtx: CanvasRenderingContext2D, opacity = 0.96) {
    if (!this.maskCanvas) return;

    targetCtx.save();
    targetCtx.globalAlpha = opacity;
    targetCtx.drawImage(this.maskCanvas, 0, 0);
    targetCtx.restore();
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    if (this.maskCanvas) {
      this.maskCanvas.width = width;
      this.maskCanvas.height = height;
    }
    // Replay ops on new dimensions
    const savedOps = [...this.operations];
    this.resetFog(true, false);
    for (const op of savedOps) {
      this.applyOperation(op, false);
    }
  }

  getOperations(): FogOperation[] {
    return [...this.operations];
  }

  getRevealedPolygons(): FogPoint[][] {
    return this.operations
      .filter((op): op is { type: 'revealPolygon'; points: FogPoint[] } => op.type === 'revealPolygon')
      .map(op => op.points);
  }

  getConcealedPolygons(): FogPoint[][] {
    return this.operations
      .filter((op): op is { type: 'concealPolygon'; points: FogPoint[] } => op.type === 'concealPolygon')
      .map(op => op.points);
  }

  getRevealedBrushes(): Array<{ x: number; y: number; radius: number }> {
    return this.operations
      .filter((op): op is { type: 'revealBrush'; x: number; y: number; radius: number } => op.type === 'revealBrush')
      .map(op => ({ x: op.x, y: op.y, radius: op.radius }));
  }

  exportState(): { operations: FogOperation[] } {
    return { operations: [...this.operations] };
  }

  loadState(state: { operations: FogOperation[] }) {
    this.syncFullState(state.operations);
  }

  destroy() {
    this.broadcastBus?.close();
  }
}

export const fogOfWarLayer = new FogOfWarLayer();
