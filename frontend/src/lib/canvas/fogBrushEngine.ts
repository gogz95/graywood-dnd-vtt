// src/lib/canvas/fogBrushEngine.ts
// Interactive Fog-of-War Editing Engine with Brush, Shape & Delta Persistence
// Directly controls offscreen fog canvas and commits polygon delta arrays to mapsDb

import { mapsDb } from '../db/mapsDb';
import { fogOfWarLayer } from './fogOfWarLayer';
import type { TacticalBattlemap } from '../types/maps';

export type FogToolMode =
  | 'reveal_brush'
  | 'hide_brush'
  | 'reveal_polygon'
  | 'hide_polygon'
  | 'reveal_all'
  | 'hide_all';

export interface FogPoint {
  x: number;
  y: number;
}

export class FogBrushEngine {
  private activeMapId: string | null = null;
  private mode: FogToolMode = 'reveal_brush';
  private brushRadius: number = 60; // 20px to 200px
  private activePolygon: FogPoint[] = [];
  private isDrawing: boolean = false;
  private lastBrushPoint: FogPoint | null = null;

  constructor(initialMapId: string | null = null) {
    this.activeMapId = initialMapId;
  }

  setActiveMapId(mapId: string | null): void {
    this.activeMapId = mapId;
    this.activePolygon = [];
    this.isDrawing = false;
    this.lastBrushPoint = null;
  }

  setMode(mode: FogToolMode): void {
    this.mode = mode;
    this.activePolygon = [];
    this.isDrawing = false;
    this.lastBrushPoint = null;
  }

  getMode(): FogToolMode {
    return this.mode;
  }

  setBrushRadius(radius: number): void {
    this.brushRadius = Math.max(20, Math.min(200, radius));
  }

  getBrushRadius(): number {
    return this.brushRadius;
  }

  getActivePolygon(): FogPoint[] {
    return [...this.activePolygon];
  }

  // Brush Drag Operations
  startBrush(point: FogPoint): void {
    this.isDrawing = true;
    this.lastBrushPoint = point;
    this.applyBrushAt(point);
  }

  moveBrush(point: FogPoint): void {
    if (!this.isDrawing) return;
    this.applyBrushAt(point);
    this.lastBrushPoint = point;
  }

  async endBrush(): Promise<void> {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    this.lastBrushPoint = null;
    await this.commitFogState();
  }

  private applyBrushAt(point: FogPoint): void {
    if (this.mode === 'reveal_brush') {
      fogOfWarLayer.revealBrush(point.x, point.y, this.brushRadius);
    } else if (this.mode === 'hide_brush') {
      fogOfWarLayer.concealBrush(point.x, point.y, this.brushRadius);
    }
  }

  // Polygon Shape Operations
  addPolygonPoint(point: FogPoint): void {
    this.activePolygon.push(point);
  }

  async finishPolygon(): Promise<void> {
    if (this.activePolygon.length < 3) {
      this.activePolygon = [];
      return;
    }

    const points = [...this.activePolygon];
    if (this.mode === 'reveal_polygon') {
      fogOfWarLayer.revealPolygon(points);
      await this.commitPolygonDelta('reveal', points);
    } else if (this.mode === 'hide_polygon') {
      fogOfWarLayer.concealPolygon(points);
      await this.commitPolygonDelta('conceal', points);
    }

    this.activePolygon = [];
  }

  cancelPolygon(): void {
    this.activePolygon = [];
  }

  // Global Reveal & Shroud
  async revealAll(): Promise<void> {
    fogOfWarLayer.resetFog(false);
    if (!this.activeMapId) return;

    const map = await mapsDb.tacticalMaps.get(this.activeMapId);
    if (map) {
      const fullBounds = [
        { x: 0, y: 0 },
        { x: 4000, y: 0 },
        { x: 4000, y: 4000 },
        { x: 0, y: 4000 },
      ];
      await mapsDb.tacticalMaps.update(this.activeMapId, {
        fogOfWar: {
          revealedPolygons: [fullBounds],
          concealedPolygons: [],
        },
        updatedAt: Date.now(),
      });
    }
  }

  async hideAll(): Promise<void> {
    fogOfWarLayer.resetFog(true);
    if (!this.activeMapId) return;

    await mapsDb.tacticalMaps.update(this.activeMapId, {
      fogOfWar: {
        revealedPolygons: [],
        concealedPolygons: [],
      },
      updatedAt: Date.now(),
    });
  }

  // Convert circular brush stamp to approximate regular polygon for delta persistence
  private brushToPolygon(center: FogPoint, radius: number, segments = 8): FogPoint[] {
    const pts: FogPoint[] = [];
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      pts.push({
        x: Math.round(center.x + Math.cos(angle) * radius),
        y: Math.round(center.y + Math.sin(angle) * radius),
      });
    }
    return pts;
  }

  private async commitPolygonDelta(type: 'reveal' | 'conceal', points: FogPoint[]): Promise<void> {
    if (!this.activeMapId) return;
    const map = await mapsDb.tacticalMaps.get(this.activeMapId);
    if (!map) return;

    const fow = map.fogOfWar || { revealedPolygons: [], concealedPolygons: [] };
    if (type === 'reveal') {
      fow.revealedPolygons.push(points);
    } else {
      fow.concealedPolygons.push(points);
    }

    await mapsDb.tacticalMaps.update(this.activeMapId, {
      fogOfWar: fow,
      updatedAt: Date.now(),
    });
  }

  private async commitFogState(): Promise<void> {
    if (!this.activeMapId || !this.lastBrushPoint) return;
    // Commit approximate polygon delta for persistent map saving
    const approxPoly = this.brushToPolygon(this.lastBrushPoint, this.brushRadius);
    await this.commitPolygonDelta(this.mode === 'reveal_brush' ? 'reveal' : 'conceal', approxPoly);
  }
}

export const fogBrushEngine = new FogBrushEngine();
