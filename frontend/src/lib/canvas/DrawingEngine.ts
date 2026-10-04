// frontend/src/lib/canvas/DrawingEngine.ts
// PixiJS Tactical Battlemat Vector Drawing, Freehand Brush & Wall Placement Engine.
// Integrates with ViewportController for coordinate transform, RaycastEngine for dynamic lighting,
// and Dexie mapsDb for persistent scene storage.

import { Container, Graphics, type Application } from 'pixi.js';
import type { ViewportController } from './controllers/ViewportController';
import { raycastEngine, type WallCollider } from './lighting/RaycastEngine';
import { canvasToolStore, canvasToolSettings, type CanvasTool } from '../stores/canvasToolStore';
import { canvasStore } from '../../stores/canvasStore.svelte';
import { mapsDb } from '../db/mapsDb';
import type { WallSegment } from './parsers/dungeonScrawlParser';

export interface VectorStrokePoint {
  x: number;
  y: number;
}

export interface VectorStroke {
  id: string;
  points: VectorStrokePoint[];
  color: string;
  alpha: number;
  width: number;
}

export interface DrawingEngineOptions {
  app: Application;
  worldContainer: Container;
  viewportController: ViewportController;
  canvasElement: HTMLCanvasElement;
  gridSize?: number;
  activeSceneId?: string;
  gridContainer?: Container | null;
  tokensContainer?: Container | null;
}

export class DrawingEngine {
  public app: Application;
  public worldContainer: Container;
  public viewportController: ViewportController;
  public canvasElement: HTMLCanvasElement;
  public gridSize: number;
  public activeSceneId: string | null = null;

  // Semantic Pixi Containers
  public drawingContainer: Container;
  public wallOverlayContainer: Container;

  // Internal graphics instances
  private persistentStrokesGfx: Graphics;
  private activeStrokeGfx: Graphics;
  private persistentWallsGfx: Graphics;
  private previewGfx: Graphics;

  // Stored scene data
  public drawings: VectorStroke[] = [];
  public walls: WallCollider[] = [];

  // Active interaction tracking
  private activeTool: CanvasTool = 'select';
  private unsubscribeToolStore: (() => void) | null = null;
  private unsubscribeSettingsStore: (() => void) | null = null;

  private isDrawingBrush: boolean = false;
  private currentBrushPoints: VectorStrokePoint[] = [];

  private wallStartPoint: { x: number; y: number } | null = null;
  private wallCurrentPoint: { x: number; y: number } | null = null;

  private polygonVertices: { x: number; y: number }[] = [];
  private lastClickTime: number = 0;

  private abortController: AbortController = new AbortController();

  constructor(opts: DrawingEngineOptions) {
    this.app = opts.app;
    this.worldContainer = opts.worldContainer;
    this.viewportController = opts.viewportController;
    this.canvasElement = opts.canvasElement;
    this.gridSize = opts.gridSize || 60;
    this.activeSceneId = opts.activeSceneId || null;

    // 1. Create Dedicated Drawing Layer positioned above grid and beneath tokens
    this.drawingContainer = new Container();
    this.drawingContainer.label = 'VTT_DrawingContainer';

    // 2. Create Dedicated Wall Vector Overlay Layer
    this.wallOverlayContainer = new Container();
    this.wallOverlayContainer.label = 'VTT_WallOverlayContainer';

    // Insert containers into worldContainer hierarchy
    if (opts.tokensContainer && this.worldContainer.children.includes(opts.tokensContainer)) {
      const tokenIndex = this.worldContainer.getChildIndex(opts.tokensContainer);
      this.worldContainer.addChildAt(this.drawingContainer, tokenIndex);
      this.worldContainer.addChildAt(this.wallOverlayContainer, tokenIndex + 1);
    } else {
      this.worldContainer.addChild(this.drawingContainer);
      this.worldContainer.addChild(this.wallOverlayContainer);
    }

    // Initialize graphics buffers
    this.persistentStrokesGfx = new Graphics();
    this.activeStrokeGfx = new Graphics();
    this.drawingContainer.addChild(this.persistentStrokesGfx);
    this.drawingContainer.addChild(this.activeStrokeGfx);

    this.persistentWallsGfx = new Graphics();
    this.previewGfx = new Graphics();
    this.wallOverlayContainer.addChild(this.persistentWallsGfx);
    this.wallOverlayContainer.addChild(this.previewGfx);

    this.initStoreBindings();
    this.attachPointerListeners();
    this.loadActiveScene();
  }

  /**
   * Binds tool switching to suspension of left-click camera pan.
   */
  private initStoreBindings(): void {
    this.unsubscribeToolStore = canvasToolStore.subscribe((tool) => {
      this.activeTool = tool;
      const isDrawingOrWall = tool !== 'select';
      this.viewportController.setPanSuspended(isDrawingOrWall);
      this.canvasElement.style.pointerEvents = 'auto';

      // Clear in-flight polygon if switching away from polygon
      if (tool !== 'polygon' && this.polygonVertices.length > 0) {
        this.polygonVertices = [];
        this.previewGfx.clear();
      }
    });

    this.unsubscribeSettingsStore = canvasToolSettings.subscribe((settings) => {
      this.wallOverlayContainer.visible = settings.wallsVisible;
    });
  }

  /**
   * Attaches pointer listeners directly to canvasElement for coordinate sampling.
   */
  private attachPointerListeners(): void {
    const signal = this.abortController.signal;

    this.canvasElement.addEventListener(
      'pointerdown',
      (e: PointerEvent) => this.handlePointerDown(e),
      { signal }
    );

    this.canvasElement.addEventListener(
      'pointermove',
      (e: PointerEvent) => this.handlePointerMove(e),
      { signal }
    );

    window.addEventListener(
      'pointerup',
      (e: PointerEvent) => this.handlePointerUp(e),
      { signal }
    );
  }

  /**
   * Converts screen (clientX, clientY) to battlemat world space.
   */
  public screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    return this.viewportController.screenToWorld(clientX, clientY);
  }

  /**
   * Snaps a world point to the nearest grid vertex if snapping is enabled.
   */
  public snap(worldPoint: { x: number; y: number }): { x: number; y: number } {
    const settings = canvasToolStore.getSettings();
    if (!settings.snapToGrid || this.gridSize <= 0) {
      return worldPoint;
    }
    return {
      x: Math.round(worldPoint.x / this.gridSize) * this.gridSize,
      y: Math.round(worldPoint.y / this.gridSize) * this.gridSize,
    };
  }

  // ── Pointer Handlers ───────────────────────────────────────────────────────

  private handlePointerDown(e: PointerEvent): void {
    // Left-click only (button === 0). Middle/right/space are preserved for camera pan.
    if (e.button !== 0 || e.spaceKey) return;
    if (this.activeTool === 'select') return;

    const world = this.screenToWorld(e.clientX, e.clientY);

    if (this.activeTool === 'brush') {
      this.isDrawingBrush = true;
      this.currentBrushPoints = [{ x: world.x, y: world.y }];
      this.renderActiveBrush();
      e.preventDefault();
      return;
    }

    if (this.activeTool === 'wall') {
      const snapped = this.snap(world);
      this.wallStartPoint = snapped;
      this.wallCurrentPoint = snapped;
      this.renderWallPreview();
      e.preventDefault();
      return;
    }

    if (this.activeTool === 'polygon') {
      const now = performance.now();
      const isDoubleClick = now - this.lastClickTime < 350;
      this.lastClickTime = now;

      const snapped = this.snap(world);

      if (this.polygonVertices.length > 0) {
        const origin = this.polygonVertices[0];
        const distToOrigin = Math.hypot(world.x - origin.x, world.y - origin.y);

        // Close polygon if clicked within 10px of origin or double-clicked
        if (distToOrigin <= 12 || (isDoubleClick && this.polygonVertices.length >= 3)) {
          this.commitPolygon();
          e.preventDefault();
          return;
        }
      }

      this.polygonVertices.push(snapped);
      this.renderPolygonPreview(world);
      e.preventDefault();
      return;
    }

    if (this.activeTool === 'fog_reveal') {
      const gx = Math.floor(world.x / this.gridSize);
      const gy = Math.floor(world.y / this.gridSize);
      canvasStore.revealFogAt(gx, gy);
      e.preventDefault();
      return;
    }

    if (this.activeTool === 'fog_shroud') {
      const gx = Math.floor(world.x / this.gridSize);
      const gy = Math.floor(world.y / this.gridSize);
      canvasStore.concealFog([`${gx},${gy}`]);
      e.preventDefault();
      return;
    }
  }

  private handlePointerMove(e: PointerEvent): void {
    if (this.activeTool === 'select') return;

    const world = this.screenToWorld(e.clientX, e.clientY);

    if (this.activeTool === 'brush' && this.isDrawingBrush) {
      const lastPoint = this.currentBrushPoints[this.currentBrushPoints.length - 1];
      if (!lastPoint || Math.hypot(world.x - lastPoint.x, world.y - lastPoint.y) >= 2) {
        this.currentBrushPoints.push({ x: world.x, y: world.y });
        this.renderActiveBrush();
      }
      return;
    }

    if (this.activeTool === 'wall' && this.wallStartPoint) {
      this.wallCurrentPoint = this.snap(world);
      this.renderWallPreview();
      return;
    }

    if (this.activeTool === 'polygon' && this.polygonVertices.length > 0) {
      this.renderPolygonPreview(this.snap(world));
      return;
    }
  }

  private handlePointerUp(e: PointerEvent): void {
    if (e.button !== 0) return;

    if (this.activeTool === 'brush' && this.isDrawingBrush) {
      this.isDrawingBrush = false;
      if (this.currentBrushPoints.length >= 2) {
        const settings = canvasToolStore.getSettings();
        const newStroke: VectorStroke = {
          id: `stroke-${crypto.randomUUID()}`,
          points: [...this.currentBrushPoints],
          color: settings.brushColor,
          alpha: settings.brushAlpha,
          width: settings.brushWidth,
        };
        this.drawings.push(newStroke);
        this.renderPersistentStrokes();
        this.saveSceneState();
      }
      this.currentBrushPoints = [];
      this.activeStrokeGfx.clear();
      return;
    }

    if (this.activeTool === 'wall' && this.wallStartPoint && this.wallCurrentPoint) {
      const p1 = this.wallStartPoint;
      const p2 = this.wallCurrentPoint;

      if (Math.hypot(p2.x - p1.x, p2.y - p1.y) > 5) {
        this.addWallSegment(p1, p2);
        this.saveSceneState();
      }

      this.wallStartPoint = null;
      this.wallCurrentPoint = null;
      this.previewGfx.clear();
      return;
    }
  }

  // ── Geometry Rendering ─────────────────────────────────────────────────────

  /**
   * Renders quadratic bezier curve through sampled brush points.
   */
  private renderActiveBrush(): void {
    const settings = canvasToolStore.getSettings();
    const g = this.activeStrokeGfx;
    g.clear();

    const pts = this.currentBrushPoints;
    if (pts.length === 0) return;

    const colorNum = parseInt(settings.brushColor.replace('#', ''), 16) || 0xffffff;

    if (pts.length === 1) {
      g.circle(pts[0].x, pts[0].y, settings.brushWidth / 2);
      g.fill({ color: colorNum, alpha: settings.brushAlpha });
      return;
    }

    g.moveTo(pts[0].x, pts[0].y);
    if (pts.length === 2) {
      g.lineTo(pts[1].x, pts[1].y);
    } else {
      for (let i = 1; i < pts.length - 1; i++) {
        const midX = (pts[i].x + pts[i + 1].x) / 2;
        const midY = (pts[i].y + pts[i + 1].y) / 2;
        g.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
      }
      g.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    }

    g.stroke({
      color: colorNum,
      alpha: settings.brushAlpha,
      width: settings.brushWidth,
      cap: 'round',
      join: 'round',
    });
  }

  /**
   * Re-renders all finalized strokes into the persistent layer.
   */
  public renderPersistentStrokes(): void {
    const g = this.persistentStrokesGfx;
    g.clear();

    for (const stroke of this.drawings) {
      const pts = stroke.points;
      if (!pts || pts.length === 0) continue;

      const colorNum = parseInt(stroke.color.replace('#', ''), 16) || 0xffffff;

      if (pts.length === 1) {
        g.circle(pts[0].x, pts[0].y, stroke.width / 2);
        g.fill({ color: colorNum, alpha: stroke.alpha });
        continue;
      }

      g.moveTo(pts[0].x, pts[0].y);
      if (pts.length === 2) {
        g.lineTo(pts[1].x, pts[1].y);
      } else {
        for (let i = 1; i < pts.length - 1; i++) {
          const midX = (pts[i].x + pts[i + 1].x) / 2;
          const midY = (pts[i].y + pts[i + 1].y) / 2;
          g.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
        }
        g.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      }

      g.stroke({
        color: colorNum,
        alpha: stroke.alpha,
        width: stroke.width,
        cap: 'round',
        join: 'round',
      });
    }
  }

  /**
   * High-contrast amber preview line for wall placement.
   */
  private renderWallPreview(): void {
    const g = this.previewGfx;
    g.clear();

    if (!this.wallStartPoint || !this.wallCurrentPoint) return;

    // Solid amber line with anchor vertices
    g.moveTo(this.wallStartPoint.x, this.wallStartPoint.y)
      .lineTo(this.wallCurrentPoint.x, this.wallCurrentPoint.y)
      .stroke({ color: 0xf59e0b, width: 2.5, alpha: 0.95 });

    g.circle(this.wallStartPoint.x, this.wallStartPoint.y, 4)
      .fill({ color: 0xf59e0b });
    g.circle(this.wallCurrentPoint.x, this.wallCurrentPoint.y, 4)
      .fill({ color: 0xef4444 });
  }

  /**
   * Preview for multi-vertex polygon enclosure.
   */
  private renderPolygonPreview(cursorWorld: { x: number; y: number }): void {
    const g = this.previewGfx;
    g.clear();

    if (this.polygonVertices.length === 0) return;

    // Draw committed polygon segments
    g.moveTo(this.polygonVertices[0].x, this.polygonVertices[0].y);
    for (let i = 1; i < this.polygonVertices.length; i++) {
      g.lineTo(this.polygonVertices[i].x, this.polygonVertices[i].y);
    }
    // Draw elastic line to cursor
    g.lineTo(cursorWorld.x, cursorWorld.y);
    g.stroke({ color: 0xf59e0b, width: 2, alpha: 0.9 });

    // Mark vertices
    for (let i = 0; i < this.polygonVertices.length; i++) {
      const v = this.polygonVertices[i];
      g.circle(v.x, v.y, i === 0 ? 6 : 3.5);
      g.fill({ color: i === 0 ? 0x22c55e : 0xf59e0b });
    }
  }

  /**
   * Commits the active polygon by connecting sequential vertices into contiguous wall colliders.
   */
  private commitPolygon(): void {
    if (this.polygonVertices.length < 3) {
      this.polygonVertices = [];
      this.previewGfx.clear();
      return;
    }

    const n = this.polygonVertices.length;
    for (let i = 0; i < n; i++) {
      const p1 = this.polygonVertices[i];
      const p2 = this.polygonVertices[(i + 1) % n];
      this.addWallSegment(p1, p2);
    }

    this.polygonVertices = [];
    this.previewGfx.clear();
    this.saveSceneState();
  }

  /**
   * Pushes a finalized segment into visual overlay, RaycastEngine, and canvasStore.
   */
  public addWallSegment(p1: { x: number; y: number }, p2: { x: number; y: number }): WallCollider {
    const wallId = `wall-${crypto.randomUUID()}`;
    const wall: WallCollider = {
      id: wallId,
      p1: { x: p1.x, y: p1.y },
      p2: { x: p2.x, y: p2.y },
      sense: 'block',
      move: 'block',
    };

    this.walls.push(wall);

    // 1. RaycastEngine: update collision mesh for instantaneous shadow casting
    raycastEngine.addWall(wall);

    // 2. Synchronize with canvasStore for multi-display / projector broadcast
    const scrawlWall: WallSegment = {
      id: wallId,
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
    };
    canvasStore.addWallSegment(scrawlWall);

    // 3. Render in visual overlay Graphics
    this.renderWallsOverlay();

    return wall;
  }

  /**
   * Renders wall segments in vibrant indigo/cyan (#6366f1 / #06b6d4).
   */
  public renderWallsOverlay(): void {
    const g = this.persistentWallsGfx;
    g.clear();

    for (const w of this.walls) {
      g.moveTo(w.p1.x, w.p1.y)
        .lineTo(w.p2.x, w.p2.y)
        .stroke({ color: 0x6366f1, width: 3.5, alpha: 0.9, cap: 'round' });

      // Subtle cyan terminal nodes
      g.circle(w.p1.x, w.p1.y, 3).fill({ color: 0x06b6d4 });
      g.circle(w.p2.x, w.p2.y, 3).fill({ color: 0x06b6d4 });
    }
  }

  // ── Scene Persistence (Dexie) ──────────────────────────────────────────────

  /**
   * Saves drawings and walls to Dexie mapsDb.tacticalMaps.
   */
  public async saveSceneState(): Promise<void> {
    try {
      const activeId =
        this.activeSceneId ||
        (typeof localStorage !== 'undefined'
          ? localStorage.getItem('vtt_active_battlemap_id')
          : null);

      if (!activeId) return;

      const map = await mapsDb.tacticalMaps.get(activeId);
      if (map) {
        const formattedWalls = this.walls.map((w) => ({
          id: w.id,
          p1: { x: w.p1.x, y: w.p1.y },
          p2: { x: w.p2.x, y: w.p2.y },
          type: 'wall' as const,
        }));

        await mapsDb.tacticalMaps.update(activeId, {
          walls: formattedWalls,
          drawings: this.drawings as any,
          updatedAt: Date.now(),
        } as any);
      }
    } catch (err) {
      console.warn('[DrawingEngine] Failed saving scene state to Dexie:', err);
    }
  }

  /**
   * Rehydrates drawing strokes and walls from Dexie mapsDb.
   */
  public async loadActiveScene(sceneId?: string): Promise<void> {
    try {
      const targetId =
        sceneId ||
        this.activeSceneId ||
        (typeof localStorage !== 'undefined'
          ? localStorage.getItem('vtt_active_battlemap_id')
          : null);

      if (!targetId) return;
      this.activeSceneId = targetId;

      const map = await mapsDb.tacticalMaps.get(targetId);
      if (map) {
        if (Array.isArray((map as any).drawings)) {
          this.drawings = (map as any).drawings;
          this.renderPersistentStrokes();
        }

        if (Array.isArray(map.walls)) {
          this.walls = map.walls.map((w) => ({
            id: w.id,
            p1: { x: w.p1.x, y: w.p1.y },
            p2: { x: w.p2.x, y: w.p2.y },
            sense: 'block',
            move: 'block',
          }));
          raycastEngine.addWalls(this.walls);
          this.renderWallsOverlay();
        }
      }
    } catch (err) {
      console.warn('[DrawingEngine] Error loading scene from Dexie:', err);
    }
  }

  public clearAllStrokes(): void {
    this.drawings = [];
    this.renderPersistentStrokes();
    this.saveSceneState();
  }

  public clearAllWalls(): void {
    this.walls = [];
    raycastEngine.clearWalls();
    canvasStore.clearWalls();
    this.renderWallsOverlay();
    this.saveSceneState();
  }

  public destroy(): void {
    this.abortController.abort();
    if (this.unsubscribeToolStore) this.unsubscribeToolStore();
    if (this.unsubscribeSettingsStore) this.unsubscribeSettingsStore();
    this.drawingContainer.destroy({ children: true });
    this.wallOverlayContainer.destroy({ children: true });
  }
}
