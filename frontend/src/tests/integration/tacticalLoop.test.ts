// frontend/src/tests/integration/tacticalLoop.test.ts
// Phase 6 End-to-End Runtime Validation & Automated Ingestion Stress Test

import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { mapsDb } from '../../lib/db/mapsDb';
import { importUniversalMap } from '../../lib/services/mapImporter';
import {
  wallsToLineSegments,
  getWallRTree,
  computeRaycastVisibility,
  type PointLightEmitter,
  type Point2D,
} from '../../lib/canvas/raycastVisionEngine';
import { clipFogDifference, clipFogUnion } from '../../lib/canvas/fogBooleanClipping';
import type { TacticalBattlemap } from '../../lib/types/maps';

describe('Phase 6 End-to-End Tactical Loop & Ingestion Stress Test', () => {
  beforeEach(async () => {
    await mapsDb.tacticalMaps.clear();
  });

  it('ingests 50+ walls, 4 portals, 6 lights, verifies spatial R-tree, raycasts LOS, and clips fog', async () => {
    // 1. Construct Mock .dd2vtt payload with 52 line-of-sight walls, 4 portals, and 6 point lights
    const losPolylines: Array<Array<{ x: number; y: number }>> = [];
    for (let i = 0; i < 52; i++) {
      losPolylines.push([
        { x: i * 2, y: 0 },
        { x: i * 2 + 1, y: 1 },
      ]);
    }

    const portals = [
      {
        position: { x: 10, y: 5 },
        bounds: [{ x: 10, y: 4 }, { x: 10, y: 6 }],
        closed: true,
        freestanding: false,
      },
      {
        position: { x: 20, y: 5 },
        bounds: [{ x: 20, y: 4 }, { x: 20, y: 6 }],
        closed: false,
        freestanding: false,
      },
      {
        position: { x: 30, y: 5 },
        bounds: [{ x: 30, y: 4 }, { x: 30, y: 6 }],
        closed: true,
        freestanding: false,
      },
      {
        position: { x: 40, y: 5 },
        bounds: [{ x: 40, y: 4 }, { x: 40, y: 6 }],
        closed: false,
        freestanding: false,
      },
    ];

    const lights = [
      { position: { x: 5, y: 5 }, range: 20, intensity: 0.8, color: '#ffaa44', shadows: true },
      { position: { x: 15, y: 10 }, range: 25, intensity: 0.9, color: '#f59e0b', shadows: true },
      { position: { x: 25, y: 15 }, range: 30, intensity: 0.7, color: '#ef4444', shadows: true },
      { position: { x: 35, y: 20 }, range: 20, intensity: 0.85, color: '#3b82f6', shadows: true },
      { position: { x: 45, y: 25 }, range: 15, intensity: 0.75, color: '#10b981', shadows: true },
      { position: { x: 55, y: 30 }, range: 35, intensity: 0.95, color: '#a855f7', shadows: true },
    ];

    const mockUvttPayload = {
      format: 0.2,
      resolution: {
        map_origin: { x: 0, y: 0 },
        map_size: { x: 120, y: 80 },
        pixels_per_grid: 70,
      },
      line_of_sight: losPolylines,
      portals,
      lights,
      image: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    };

    const uvttBlob = new Blob([JSON.stringify(mockUvttPayload)], { type: 'application/json' });

    // Step 1: Ingest mock .dd2vtt payload
    const ingestResult = await importUniversalMap(uvttBlob, 'dungeon_catacombs_stress.dd2vtt');
    expect(ingestResult.success).toBe(true);
    expect(ingestResult.wallsCount).toBe(52);
    expect(ingestResult.lightsCount).toBe(6);

    // Retrieve parsed map from Dexie database
    const maps = await mapsDb.tacticalMaps.toArray();
    expect(maps.length).toBeGreaterThan(0);
    const savedMap = maps[0];
    expect(savedMap).toBeDefined();
    expect(savedMap.walls.length).toBe(52);

    // Add 4 portal doors to walls array for total occlusion testing
    for (let i = 0; i < portals.length; i++) {
      const p = portals[i];
      savedMap.walls.push({
        id: `door-${i}`,
        p1: { x: p.bounds[0].x * 70, y: p.bounds[0].y * 70 },
        p2: { x: p.bounds[1].x * 70, y: p.bounds[1].y * 70 },
        type: p.closed ? 'door_closed' : 'door_open',
      });
    }
    expect(savedMap.walls.length).toBe(56); // 52 walls + 4 doors

    // Step 2: Spatial Indexing into RBush R-Tree
    const lineSegments = wallsToLineSegments(savedMap!.walls);
    expect(lineSegments.length).toBe(56);

    const rtree = getWallRTree(lineSegments);
    expect(rtree).toBeDefined();

    // Query R-Tree spatial bounding box around first quarter of map
    const queriedSegments = rtree.search({
      minX: 0,
      minY: 0,
      maxX: 1000,
      maxY: 1000,
    });
    expect(queriedSegments.length).toBeGreaterThan(0);

    // Step 3: Dynamic Lighting PointLightEmitter Creation
    const lightEmitters: PointLightEmitter[] = lights.map((l) => ({
      brightRadiusFt: Math.round(l.range * 0.5),
      dimRadiusFt: l.range,
      color: l.color,
      isDarkvision: false,
    }));
    expect(lightEmitters.length).toBe(6);
    for (const emitter of lightEmitters) {
      expect(emitter.brightRadiusFt).toBeGreaterThan(0);
      expect(emitter.dimRadiusFt).toBeGreaterThan(emitter.brightRadiusFt);
      expect(emitter.color).toBeDefined();
    }

    // Step 4: Execute computeRaycastVisibility at 4 distinct token positions
    const tokenPositions: Point2D[] = [
      { x: 100, y: 100 },
      { x: 500, y: 300 },
      { x: 1200, y: 800 },
      { x: 2000, y: 1500 },
    ];

    for (const pos of tokenPositions) {
      const visionResult = computeRaycastVisibility(pos, lineSegments, 350);
      expect(visionResult.origin).toEqual(pos);
      expect(visionResult.polygon.length).toBeGreaterThanOrEqual(3);

      // Verify coordinate ring sanity
      for (const pt of visionResult.polygon) {
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.y)).toBe(true);
      }

      // Check distance from origin to all polygon vertices is within max radius bounds (+ small epsilon)
      for (const pt of visionResult.polygon) {
        const dist = Math.hypot(pt.x - pos.x, pt.y - pos.y);
        expect(dist).toBeLessThanOrEqual(350.1);
      }
    }

    // Step 5: Martinez Boolean Fog of War Subtract (clipFogDifference) & Dexie Persistence
    const initialExploredRoom = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 1000 },
      { x: 0, y: 1000 },
    ];

    // Reveal room into fog state
    const revealedFog = clipFogUnion([], initialExploredRoom);
    expect(revealedFog.length).toBeGreaterThan(0);

    // Conceal/subtract a circular/box area in the middle (e.g. 300x300 concealment box)
    const concealBox = [
      { x: 300, y: 300 },
      { x: 600, y: 300 },
      { x: 600, y: 600 },
      { x: 300, y: 600 },
    ];

    const clippedFog = clipFogDifference(revealedFog, concealBox);
    expect(clippedFog.length).toBeGreaterThan(0);

    // Verify coordinate serialization into mock Dexie store
    const updatedMap: TacticalBattlemap = {
      ...savedMap!,
      fogOfWar: {
        revealedPolygons: clippedFog,
        concealedPolygons: [concealBox],
      },
      updatedAt: Date.now(),
    };

    await mapsDb.tacticalMaps.put(updatedMap);
    const reloaded = await mapsDb.tacticalMaps.get(savedMap!.id);

    expect(reloaded).toBeDefined();
    expect(reloaded!.fogOfWar.revealedPolygons.length).toBe(clippedFog.length);
    expect(reloaded!.fogOfWar.concealedPolygons.length).toBe(1);
    expect(reloaded!.fogOfWar.revealedPolygons[0][0].x).toBeDefined();
  });
});
