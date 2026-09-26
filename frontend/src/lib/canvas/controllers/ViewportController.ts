// frontend/src/lib/canvas/controllers/ViewportController.ts
// Pure TypeScript Viewport & Camera Controller for PixiJS v8.
// Framework-agnostic: zero Svelte runes or Svelte store imports.

import type { Application, Container, Ticker } from 'pixi.js';

export interface ViewportState {
  targetX: number;
  targetY: number;
  zoomLevel: number;
  currentX: number;
  currentY: number;
  currentZoom: number;
}

export interface ViewportControllerOptions {
  canvasElement: HTMLCanvasElement;
  app?: Application | null;
  targetContainer?: Container | null;
  initialX?: number;
  initialY?: number;
  initialZoom?: number;
  minZoom?: number;
  maxZoom?: number;
  lerpFactor?: number;
  onChange?: (state: ViewportState) => void;
}

export class ViewportController {
  // Canonical camera target state stored as raw numbers to prevent float drift
  public targetX: number = 0;
  public targetY: number = 0;
  public zoomLevel: number = 1.0;

  // Active interpolated render values
  public currentX: number = 0;
  public currentY: number = 0;
  public currentZoom: number = 1.0;

  // Bounds and interpolation tuning
  public readonly minZoom: number = 0.1;
  public readonly maxZoom: number = 5.0;
  public lerpFactor: number = 0.2;

  // Panning interaction flags
  public isPanMode: boolean = false;

  private canvasElement: HTMLCanvasElement;
  private app: Application | null = null;
  private targetContainer: Container | null = null;
  private onChange?: (state: ViewportState) => void;

  private abortController: AbortController = new AbortController();
  private tickerFn: ((ticker: Ticker) => void) | null = null;

  // Drag interaction state
  private isDragging: boolean = false;
  private activePointerId: number | null = null;
  private dragStartX: number = 0;
  private dragStartY: number = 0;
  private dragStartTargetX: number = 0;
  private dragStartTargetY: number = 0;
  private spacePressed: boolean = false;

  constructor(
    canvasOrOptions: HTMLCanvasElement | ViewportControllerOptions,
    maybeOptions?: Partial<ViewportControllerOptions>
  ) {
    const opts: ViewportControllerOptions =
      canvasOrOptions instanceof HTMLCanvasElement
        ? { canvasElement: canvasOrOptions, ...(maybeOptions || {}) }
        : canvasOrOptions;

    this.canvasElement = opts.canvasElement;
    this.app = opts.app ?? null;
    this.targetContainer = opts.targetContainer ?? null;
    this.onChange = opts.onChange;

    if (opts.minZoom !== undefined) this.minZoom = Math.max(0.01, opts.minZoom);
    if (opts.maxZoom !== undefined) this.maxZoom = Math.min(50.0, opts.maxZoom);
    if (opts.lerpFactor !== undefined) this.lerpFactor = Math.max(0.01, Math.min(1.0, opts.lerpFactor));

    const initZoom = opts.initialZoom ?? 1.0;
    this.zoomLevel = this.clampZoom(initZoom);
    this.currentZoom = this.zoomLevel;

    this.targetX = opts.initialX ?? 0;
    this.targetY = opts.initialY ?? 0;
    this.currentX = this.targetX;
    this.currentY = this.targetY;

    this.applyTransform();
    this.setupListeners();
    this.setupTicker();
  }

  /**
   * Clamps a zoom level between minZoom (default 0.1) and maxZoom (default 5.0).
   */
  private clampZoom(zoom: number): number {
    return Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
  }

  /**
   * Projects screen-space pixel coordinates into world-space coordinates.
   */
  public screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    const zoom = this.currentZoom || 1.0;
    return {
      x: (screenX - this.currentX) / zoom,
      y: (screenY - this.currentY) / zoom,
    };
  }

  /**
   * Projects world-space coordinates into screen-space pixel coordinates.
   */
  public worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    const zoom = this.currentZoom || 1.0;
    return {
      x: worldX * zoom + this.currentX,
      y: worldY * zoom + this.currentY,
    };
  }

  /**
   * Projects screen-space coordinates into canonical target world coordinates.
   */
  public screenToWorldTarget(screenX: number, screenY: number): { x: number; y: number } {
    const zoom = this.zoomLevel || 1.0;
    return {
      x: (screenX - this.targetX) / zoom,
      y: (screenY - this.targetY) / zoom,
    };
  }

  /**
   * Projects world-space coordinates into canonical target screen coordinates.
   */
  public worldToScreenTarget(worldX: number, worldY: number): { x: number; y: number } {
    const zoom = this.zoomLevel || 1.0;
    return {
      x: worldX * zoom + this.targetX,
      y: worldY * zoom + this.targetY,
    };
  }

  /**
   * Smoothly zooms anchored at a screen-space focal point (e.g. mouse pointer).
   */
  public zoomAt(factor: number, screenX: number, screenY: number, smooth: boolean = true): void {
    const oldZoom = this.zoomLevel;
    const newZoom = this.clampZoom(oldZoom * factor);
    if (Math.abs(newZoom - oldZoom) < 0.00001) return;

    // Fixed world point under screen cursor before zoom
    const worldX = (screenX - this.targetX) / oldZoom;
    const worldY = (screenY - this.targetY) / oldZoom;

    this.zoomLevel = newZoom;
    this.targetX = screenX - worldX * newZoom;
    this.targetY = screenY - worldY * newZoom;

    if (!smooth) {
      this.currentX = this.targetX;
      this.currentY = this.targetY;
      this.currentZoom = this.zoomLevel;
      this.applyTransform();
    }

    this.notifyChange();
  }

  /**
   * Explicitly sets the zoom level, optionally centered on a screen point.
   */
  public setZoom(zoom: number, screenX?: number, screenY?: number, smooth: boolean = true): void {
    const clamped = this.clampZoom(zoom);
    const rect = this.canvasElement.getBoundingClientRect();
    const sx = screenX ?? rect.width / 2;
    const sy = screenY ?? rect.height / 2;
    const factor = clamped / this.zoomLevel;
    this.zoomAt(factor, sx, sy, smooth);
  }

  /**
   * Pans the camera by a screen-space offset delta.
   */
  public panBy(deltaX: number, deltaY: number, smooth: boolean = false): void {
    this.targetX += deltaX;
    this.targetY += deltaY;

    if (!smooth) {
      this.currentX = this.targetX;
      this.currentY = this.targetY;
      this.applyTransform();
    }

    this.notifyChange();
  }

  /**
   * Centers the viewport on a world coordinate.
   */
  public centerOnWorld(worldX: number, worldY: number, smooth: boolean = true): void {
    const rect = this.canvasElement.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    this.targetX = centerX - worldX * this.zoomLevel;
    this.targetY = centerY - worldY * this.zoomLevel;

    if (!smooth) {
      this.currentX = this.targetX;
      this.currentY = this.targetY;
      this.applyTransform();
    }

    this.notifyChange();
  }

  /** Returns the current canvas screen dimensions in CSS pixels. */
  public getScreenSize(): { width: number; height: number } {
    const rect = this.canvasElement.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }

  /**
   * Resets viewport camera to origin (0, 0) and default zoom (1.0).
   */
  public reset(x: number = 0, y: number = 0, zoom: number = 1.0): void {
    this.targetX = x;
    this.targetY = y;
    this.zoomLevel = this.clampZoom(zoom);
    this.currentX = this.targetX;
    this.currentY = this.targetY;
    this.currentZoom = this.zoomLevel;
    this.applyTransform();
    this.notifyChange();
  }

  /**
   * Sets or updates the target Pixi Container being transformed.
   */
  public setTargetContainer(container: Container | null): void {
    this.targetContainer = container;
    this.applyTransform();
  }

  /**
   * Applies the current camera transformation directly to the Pixi Container.
   */
  private applyTransform(): void {
    if (!this.targetContainer) return;
    this.targetContainer.position.set(this.currentX, this.currentY);
    this.targetContainer.scale.set(this.currentZoom);
  }

  /**
   * Notifies external listeners of camera state updates.
   */
  private notifyChange(): void {
    if (this.onChange) {
      this.onChange({
        targetX: this.targetX,
        targetY: this.targetY,
        zoomLevel: this.zoomLevel,
        currentX: this.currentX,
        currentY: this.currentY,
        currentZoom: this.currentZoom,
      });
    }
  }

  /**
   * Registers DOM event listeners using the internal AbortController signal.
   */
  private setupListeners(): void {
    const signal = this.abortController.signal;
    const el = this.canvasElement;

    // Wheel zoom toward pointer position
    el.addEventListener(
      'wheel',
      (e: WheelEvent) => {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;

        // Smooth zoom curve (deltaY < 0 is scroll up / zoom in)
        const zoomFactor = e.deltaY < 0 ? 1.15 : 0.869565; // 1 / 1.15
        this.zoomAt(zoomFactor, screenX, screenY, true);
      },
      { signal, passive: false }
    );

    // Pointer down: click-drag panning (Middle click, Right click, or Left click with Space/PanMode)
    el.addEventListener(
      'pointerdown',
      (e: PointerEvent) => {
        const isMiddle = e.button === 1;
        const isRight = e.button === 2;
        const isLeftPan = e.button === 0 && (this.spacePressed || this.isPanMode);

        if (!isMiddle && !isRight && !isLeftPan) return;

        this.isDragging = true;
        this.activePointerId = e.pointerId;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.dragStartTargetX = this.targetX;
        this.dragStartTargetY = this.targetY;

        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          // Non-critical pointer capture fallback
        }

        e.preventDefault();
      },
      { signal }
    );

    // Pointer move: update pan position
    el.addEventListener(
      'pointermove',
      (e: PointerEvent) => {
        if (!this.isDragging || e.pointerId !== this.activePointerId) return;

        const deltaX = e.clientX - this.dragStartX;
        const deltaY = e.clientY - this.dragStartY;

        this.targetX = this.dragStartTargetX + deltaX;
        this.targetY = this.dragStartTargetY + deltaY;

        // Instant responsive panning tracking
        this.currentX = this.targetX;
        this.currentY = this.targetY;

        this.applyTransform();
        this.notifyChange();
      },
      { signal }
    );

    const stopDrag = (e: PointerEvent) => {
      if (e.pointerId === this.activePointerId) {
        this.isDragging = false;
        this.activePointerId = null;
        try {
          if (el.hasPointerCapture(e.pointerId)) {
            el.releasePointerCapture(e.pointerId);
          }
        } catch {
          // ignore
        }
      }
    };

    el.addEventListener('pointerup', stopDrag, { signal });
    el.addEventListener('pointercancel', stopDrag, { signal });

    // Prevent default context menu during right-click panning
    el.addEventListener(
      'contextmenu',
      (e: MouseEvent) => {
        if (this.isDragging) {
          e.preventDefault();
        }
      },
      { signal }
    );

    // Track Spacebar for left-click pan toggling
    if (typeof window !== 'undefined') {
      window.addEventListener(
        'keydown',
        (e: KeyboardEvent) => {
          if (e.code === 'Space' && !this.spacePressed && (e.target === document.body || e.target === el)) {
            this.spacePressed = true;
          }
        },
        { signal }
      );

      window.addEventListener(
        'keyup',
        (e: KeyboardEvent) => {
          if (e.code === 'Space') {
            this.spacePressed = false;
          }
        },
        { signal }
      );
    }
  }

  /**
   * Sets up Pixi ticker hook for smooth camera interpolation.
   */
  private setupTicker(): void {
    if (!this.app) return;

    this.tickerFn = (_ticker: Ticker) => {
      this.tick();
    };

    this.app.ticker.add(this.tickerFn);
  }

  /**
   * Step interpolation frame.
   */
  public tick(): void {
    const dx = this.targetX - this.currentX;
    const dy = this.targetY - this.currentY;
    const dz = this.zoomLevel - this.currentZoom;

    const thresholdPos = 0.01;
    const thresholdZoom = 0.0001;

    let changed = false;

    if (Math.abs(dx) > thresholdPos || Math.abs(dy) > thresholdPos) {
      this.currentX += dx * this.lerpFactor;
      this.currentY += dy * this.lerpFactor;

      if (Math.abs(this.targetX - this.currentX) <= thresholdPos) {
        this.currentX = this.targetX;
      }
      if (Math.abs(this.targetY - this.currentY) <= thresholdPos) {
        this.currentY = this.targetY;
      }
      changed = true;
    }

    if (Math.abs(dz) > thresholdZoom) {
      this.currentZoom += dz * this.lerpFactor;

      if (Math.abs(this.zoomLevel - this.currentZoom) <= thresholdZoom) {
        this.currentZoom = this.zoomLevel;
      }
      changed = true;
    }

    if (changed) {
      this.applyTransform();
      this.notifyChange();
    }
  }

  /**
   * Detaches all DOM listeners via AbortController and removes Pixi ticker hooks.
   */
  public destroy(): void {
    this.abortController.abort();

    if (this.tickerFn && this.app?.ticker) {
      this.app.ticker.remove(this.tickerFn);
      this.tickerFn = null;
    }

    this.targetContainer = null;
    this.app = null;
    this.onChange = undefined;
  }
}
