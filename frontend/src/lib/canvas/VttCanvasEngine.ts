// frontend/src/lib/canvas/VttCanvasEngine.ts
// Pure TypeScript canvas engine facade for PixiJS v8 with WebGL/WebGPU auto-detection.
// Framework-agnostic: zero Svelte runes or Svelte store imports.

import { Application, Container, Ticker } from 'pixi.js';
import { ViewportController, type ViewportState } from './controllers/ViewportController';
import { GridController } from './controllers/GridController';
import { TokenController } from './controllers/TokenController';
import { FogController } from './controllers/FogController';

export interface ViewportChangeEvent {
  targetX: number;
  targetY: number;
  zoomLevel: number;
  currentX: number;
  currentY: number;
  currentZoom: number;
}

export interface EngineReadyEvent {
  app: Application;
  engine: VttCanvasEngine;
  worldContainer: Container;
  backgroundContainer: Container;
  gridContainer: Container;
  wallsContainer: Container;
  tokensContainer: Container;
  fogContainer: Container;
  viewport: ViewportController;
  grid: GridController;
  tokens: TokenController;
  fog: FogController;
}

export interface EngineResizeEvent {
  width: number;
  height: number;
}

export type VttEngineEventMap = {
  'viewport:change': ViewportChangeEvent;
  'engine:ready': EngineReadyEvent;
  'engine:resize': EngineResizeEvent;
  'engine:destroy': void;
};

export type VttEventListener<T> = (data: T) => void;

export class VttCanvasEngine {
  private app: Application | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private worldContainer: Container | null = null;
  public backgroundContainer: Container | null = null;
  public gridContainer: Container | null = null;
  public wallsContainer: Container | null = null;
  public tokensContainer: Container | null = null;
  public fogContainer: Container | null = null;
  private viewportController: ViewportController | null = null;
  private gridController: GridController | null = null;
  private tokenController: TokenController | null = null;
  private fogController: FogController | null = null;
  private isInitialized: boolean = false;

  private listeners: Map<keyof VttEngineEventMap, Set<(data: any) => void>> = new Map();

  private tickerCallbacks: Set<(ticker: Ticker) => void> = new Set();
  private resizeObserver: ResizeObserver | null = null;

  /**
   * Typed event listener subscription.
   * Returns an unsubscribe function.
   */
  public on<K extends keyof VttEngineEventMap>(
    event: K,
    listener: VttEventListener<VttEngineEventMap[K]>
  ): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as (data: any) => void);

    return () => this.off(event, listener);
  }

  /**
   * Remove a typed event listener.
   */
  public off<K extends keyof VttEngineEventMap>(
    event: K,
    listener: VttEventListener<VttEngineEventMap[K]>
  ): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(listener as (data: any) => void);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  /**
   * Emit a typed event to all registered listeners.
   */
  public emit<K extends keyof VttEngineEventMap>(event: K, data: VttEngineEventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;
    set.forEach((listener) => {
      try {
        listener(data);
      } catch (err) {
        console.error(`[VttCanvasEngine] Error in '${event}' event listener:`, err);
      }
    });
  }

  /**
   * Register a custom callback to run on the Pixi ticker.
   */
  public addTicker(callback: (ticker: Ticker) => void): void {
    this.tickerCallbacks.add(callback);
    if (this.app?.ticker) {
      this.app.ticker.add(callback);
    }
  }

  /**
   * Remove a ticker callback.
   */
  public removeTicker(callback: (ticker: Ticker) => void): void {
    this.tickerCallbacks.delete(callback);
    if (this.app?.ticker) {
      this.app.ticker.remove(callback);
    }
  }

  /**
   * Initializes PixiJS v8 Application with WebGL/WebGPU auto-detection.
   */
  public async init(canvasElement: HTMLCanvasElement): Promise<void> {
    if (this.isInitialized && this.app) {
      return;
    }

    this.canvasElement = canvasElement;
    const parent = canvasElement.parentElement || (typeof document !== 'undefined' ? document.body : null);

    const app = new Application();

    // PixiJS v8: preference: 'webgpu' automatically attempts WebGPU initialization and
    // cleanly falls back to WebGL2 / WebGL if WebGPU is unsupported or unavailable.
    await app.init({
      canvas: canvasElement,
      resizeTo: parent || undefined,
      autoDensity: true,
      resolution: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
      backgroundColor: 0x0a0a0c,
      antialias: true,
      preference: 'webgpu',
    });

    this.app = app;

    // Create root world container for battlemaps, grid, and tokens
    this.worldContainer = new Container();
    this.worldContainer.label = 'VTT_WorldContainer';
    app.stage.addChild(this.worldContainer);

    // Strict semantic layer hierarchy (Foundry / Roll20 architecture)
    this.backgroundContainer = new Container();
    this.backgroundContainer.label = 'VTT_BackgroundContainer';
    this.worldContainer.addChild(this.backgroundContainer);

    this.gridContainer = new Container();
    this.gridContainer.label = 'VTT_GridContainer';
    this.worldContainer.addChild(this.gridContainer);

    this.wallsContainer = new Container();
    this.wallsContainer.label = 'VTT_WallsContainer';
    this.worldContainer.addChild(this.wallsContainer);

    // Initialize ViewportController
    this.viewportController = new ViewportController({
      canvasElement,
      app,
      targetContainer: this.worldContainer,
      onChange: (state: ViewportState) => {
        this.emit('viewport:change', {
          targetX: state.targetX,
          targetY: state.targetY,
          zoomLevel: state.zoomLevel,
          currentX: state.currentX,
          currentY: state.currentY,
          currentZoom: state.currentZoom,
        });
      },
    });

    // Initialize GridController attached to root stage with active viewport
    this.gridController = new GridController(app.stage, this.viewportController);

    // Initialize TokenController and FogController attached to worldContainer
    this.tokenController = new TokenController(this.worldContainer);
    this.tokensContainer = this.tokenController.tokenLayer;
    this.tokensContainer.label = 'VTT_TokensContainer';

    this.fogController = new FogController(this.worldContainer);
    this.fogContainer = this.fogController.fogLayer;
    this.fogContainer.label = 'VTT_FogContainer';

    // Dynamic grid line rendering when viewport bounds change
    this.on('viewport:change', () => {
      this.gridController?.redraw();
    });

    // Reattach any pre-registered ticker callbacks
    this.tickerCallbacks.forEach((cb) => {
      app.ticker.add(cb);
    });

    // Monitor resize events
    if (typeof ResizeObserver !== 'undefined' && parent) {
      this.resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          this.emit('engine:resize', { width, height });
          this.gridController?.redraw();
        }
      });
      this.resizeObserver.observe(parent);
    }

    this.isInitialized = true;
    this.emit('engine:ready', {
      app,
      engine: this,
      worldContainer: this.worldContainer,
      backgroundContainer: this.backgroundContainer!,
      gridContainer: this.gridContainer!,
      wallsContainer: this.wallsContainer!,
      tokensContainer: this.tokensContainer!,
      fogContainer: this.fogContainer!,
      viewport: this.viewportController,
      grid: this.gridController,
      tokens: this.tokenController,
      fog: this.fogController,
    });
  }

  /**
   * Binds interaction modes to the active canvas tool (Foundry/Roll20 masking pattern).
   * When drawing walls, measuring with ruler, carving fog, or placing templates:
   * tokensContainer.eventMode is set to 'none' to prevent accidental token selection/movement.
   * When select/pan is active, static event mode is restored.
   */
  public setInteractionMode(tool: string): void {
    if (!this.tokensContainer) return;
    const lower = tool.toLowerCase();
    const isDrawingOrMeasuring =
      lower.startsWith('wall') ||
      lower === 'ruler' ||
      lower.startsWith('fog') ||
      lower === 'template' ||
      ['brush', 'circle', 'cone', 'cube', 'line'].includes(lower);

    this.tokensContainer.eventMode = isDrawingOrMeasuring ? 'none' : 'static';
  }

  public get walls(): Container {
    if (!this.wallsContainer) {
      throw new Error('[VttCanvasEngine] wallsContainer accessed before engine.init()');
    }
    return this.wallsContainer;
  }

  public get tokensLayer(): Container {
    if (!this.tokensContainer) {
      throw new Error('[VttCanvasEngine] tokensContainer accessed before engine.init()');
    }
    return this.tokensContainer;
  }

  public get grid(): GridController {
    if (!this.gridController) {
      throw new Error('[VttCanvasEngine] GridController accessed before engine.init()');
    }
    return this.gridController;
  }

  public get tokens(): TokenController {
    if (!this.tokenController) {
      throw new Error('[VttCanvasEngine] TokenController accessed before engine.init()');
    }
    return this.tokenController;
  }

  public get fog(): FogController {
    if (!this.fogController) {
      throw new Error('[VttCanvasEngine] FogController accessed before engine.init()');
    }
    return this.fogController;
  }

  public getApp(): Application | null {
    return this.app;
  }

  public getWorldContainer(): Container | null {
    return this.worldContainer;
  }

  public getViewport(): ViewportController | null {
    return this.viewportController;
  }

  public getCanvas(): HTMLCanvasElement | null {
    return this.canvasElement;
  }

  public get ready(): boolean {
    return this.isInitialized && this.app !== null;
  }

  /**
   * Destroys the engine, clearing ticker callbacks, removing all listeners,
   * tearing down the viewport controller, and releasing PixiJS GPU memory.
   */
  public destroy(): void {
    this.emit('engine:destroy', undefined as void);

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    // Teardown TokenController
    if (this.tokenController) {
      this.tokenController.destroy();
      this.tokenController = null;
    }

    // Teardown FogController
    if (this.fogController) {
      this.fogController.destroy();
      this.fogController = null;
    }

    // Teardown GridController
    if (this.gridController) {
      this.gridController.destroy();
      this.gridController = null;
    }

    // Teardown ViewportController and abort DOM listeners
    if (this.viewportController) {
      this.viewportController.destroy();
      this.viewportController = null;
    }

    // Clear ticker callbacks
    if (this.app?.ticker) {
      this.tickerCallbacks.forEach((cb) => {
        this.app!.ticker.remove(cb);
      });
    }
    this.tickerCallbacks.clear();

    // Remove all event listeners
    this.listeners.clear();

    // Destroy PixiJS Application releasing children, textures, and texture sources
    if (this.app) {
      try {
        this.app.destroy(true, {
          children: true,
          texture: true,
          textureSource: true,
        });
      } catch (err) {
        console.warn('[VttCanvasEngine] Error during app.destroy:', err);
      }
      this.app = null;
    }

    this.worldContainer = null;
    this.canvasElement = null;
    this.isInitialized = false;
  }
}
