// frontend/src/lib/canvas/TokenVisionResolver.ts
// Token Vision Aggregation & View Separation: DM Omniscience vs. Player/Projector View
// Aggregates party visibility polygons and culls monsters/secrets outside active player vision.

import type { CanvasToken } from '../../stores/canvasStore.svelte';
import { raycastEngine } from './RaycastEngine';
import { fogOfWarTextureManager } from './FogOfWarTextureManager';

export interface TokenVisionProfile {
  id: string;
  x: number;
  y: number;
  isPlayer: boolean;
  sightRadius: number; // in pixels
  brightRadius: number;
  dimRadius: number;
  hasDarkvision: boolean;
  darkvisionRadius: number;
  polygon: [number, number][];
}

export class TokenVisionResolver {
  /**
   * Resolves vision profile for a single token using RaycastEngine.
   */
  public resolveTokenVision(
    token: any,
    cellPx = 70,
    viewportBounds?: { minX: number; minY: number; maxX: number; maxY: number }
  ): TokenVisionProfile {
    // 5e standard: 5ft = 1 cell. Default 30ft sight = 6 cells = 420px
    const isPixelToken = typeof token.radius === 'number' && (token.x > 30 || token.y > 30);
    const origin = isPixelToken
      ? { x: token.x, y: token.y }
      : {
          x: (token.x + (token.sizeInCells || 1) / 2) * cellPx,
          y: (token.y + (token.sizeInCells || 1) / 2) * cellPx,
        };

    const sightFeet = token.sightRadiusFeet || 30;
    const sightRadiusPx = token.sightRadius || (sightFeet / 5) * cellPx;

    const brightFeet = 20;
    const brightPx = (brightFeet / 5) * cellPx;
    const dimFeet = 40;
    const dimPx = (dimFeet / 5) * cellPx;

    // Check conditions & darkvision
    const conditions = (token.conditions || []).map((c: string) => c.toLowerCase());
    const isBlind = conditions.includes('blinded') || token.isOrbSealed;
    const effectiveRadius = isBlind ? 0 : sightRadiusPx;

    const polygon =
      effectiveRadius > 0
        ? raycastEngine.computeVisibilityPolygon(origin, effectiveRadius, viewportBounds)
        : [];

    return {
      id: token.id,
      x: origin.x,
      y: origin.y,
      isPlayer: token.isPlayer ?? false,
      sightRadius: effectiveRadius,
      brightRadius: brightPx,
      dimRadius: dimPx,
      hasDarkvision: true,
      darkvisionRadius: token.darkvisionRadius || (60 / 5) * cellPx, // 60ft Darkvision baseline
      polygon,
    };
  }

  /**
   * Aggregates all active player character vision profiles.
   */
  public resolvePartyVision(
    tokens: any[],
    cellPx = 70,
    viewportBounds?: { minX: number; minY: number; maxX: number; maxY: number }
  ): TokenVisionProfile[] {
    const hasExplicitPlayers = tokens.some((t) => t.isPlayer === true);
    const candidates = hasExplicitPlayers
      ? tokens.filter((t) => t.isPlayer === true && (t.hp === undefined || t.hp > 0) && !t.isOrbSealed)
      : tokens.filter((t) => !t.isOrbSealed);
    return candidates.map((p) => this.resolveTokenVision(p, cellPx, viewportBounds));
  }

  /**
   * Determines whether an entity/token is visible from the perspective of the player/projector screen.
   * 1. If player token: always visible.
   * 2. If entity is within active LoS of ANY player character: visible.
   * 3. If entity is in explored fog but outside active LoS: culled (false for monsters/secrets).
   */
  public isEntityVisibleToPlayers(
    entityX: number,
    entityY: number,
    isPlayerEntity: boolean,
    partyProfiles: TokenVisionProfile[]
  ): boolean {
    if (isPlayerEntity) return true;

    // Point-in-polygon check against any party member's active vision polygon
    for (const profile of partyProfiles) {
      if (profile.polygon.length < 3) continue;
      if (this.isPointInPolygon(entityX, entityY, profile.polygon)) {
        return true;
      }
    }

    // Outside active player line-of-sight: monsters/traps remain hidden
    return false;
  }

  /**
   * Point-in-polygon raycasting algorithm.
   */
  public isPointInPolygon(x: number, y: number, polygon: [number, number][]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];
      const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }
}

export const tokenVisionResolver = new TokenVisionResolver();
