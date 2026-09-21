// src/lib/mechanics/coverCalculator.ts
// 5e SRD Automatic Ray-Cast Cover Detection
// Casts 16 corner-to-corner rays between attacker and target bounding boxes.
// 0-4 blocked: No Cover (+0 AC)
// 5-8 blocked: Half Cover (+2 AC, +2 DEX saves)
// 9-15 blocked: Three-Quarters Cover (+5 AC, +5 DEX saves)
// 16 blocked: Total Cover (Cannot be directly targeted)

import type { CanvasToken } from '../../stores/canvasStore.svelte';
import type { MapWall } from '../types/maps';

export type CoverType = 'none' | 'half' | 'three_quarters' | 'total';

export interface CoverResult {
  coverType: CoverType;
  acBonus: number;
  dexSaveBonus: number;
  blockedRaysCount: number;
  totalRaysCount: number; // 16
  description: string;
  canTarget: boolean;
}

interface Point {
  x: number;
  y: number;
}

/**
 * Checks line-line segment intersection between (p1, p2) and (p3, p4).
 */
function segmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-9) return false;

  const u = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const v = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;

  return u > 0.001 && u < 0.999 && v >= 0 && v <= 1;
}

/**
 * Checks if a ray intersects an intervening creature's circular footprint.
 */
function rayIntersectsTokenCircle(p1: Point, p2: Point, tok: CanvasToken, gridSize: number = 50): boolean {
  const size = tok.sizeInCells || 1;
  const cx = (tok.x + size / 2) * gridSize;
  const cy = (tok.y + size / 2) * gridSize;
  const radius = (size * gridSize) * 0.42;

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) return false;

  // Project circle center onto ray segment
  const t = Math.max(0, Math.min(1, ((cx - p1.x) * dx + (cy - p1.y) * dy) / lenSq));
  // Ignore start and end token proximity
  if (t <= 0.05 || t >= 0.95) return false;

  const projX = p1.x + t * dx;
  const projY = p1.y + t * dy;
  const distSq = (cx - projX) ** 2 + (cy - projY) ** 2;

  return distSq <= radius * radius;
}

/**
 * Extracts the 4 corners of a token's bounding box.
 */
function getTokenCorners(tok: CanvasToken, gridSize: number = 50): Point[] {
  const size = (tok.sizeInCells || 1) * gridSize;
  const x = tok.x * gridSize;
  const y = tok.y * gridSize;

  return [
    { x: x + 2, y: y + 2 },                   // Top-left
    { x: x + size - 2, y: y + 2 },            // Top-right
    { x: x + size - 2, y: y + size - 2 },     // Bottom-right
    { x: x + 2, y: y + size - 2 },            // Bottom-left
  ];
}

/**
 * Calculates 5e SRD cover by casting 16 corner-to-corner rays.
 */
export function calculateCover(
  attacker: CanvasToken,
  target: CanvasToken,
  walls: MapWall[] = [],
  interveningTokens: CanvasToken[] = [],
  gridSize: number = 50
): CoverResult {
  const attackerCorners = getTokenCorners(attacker, gridSize);
  const targetCorners = getTokenCorners(target, gridSize);

  // Other creatures between attacker and target that could provide Half Cover
  const otherCreatures = interveningTokens.filter(
    (t) => t.id !== attacker.id && t.id !== target.id && t.isVisible !== false
  );

  let blockedRays = 0;
  const totalRays = 16;

  for (const aCorner of attackerCorners) {
    for (const tCorner of targetCorners) {
      let isRayBlocked = false;

      // 1. Check solid wall and closed door collisions
      for (const w of walls) {
        if (w.type === 'door_open') continue; // open doors do not block
        if (segmentsIntersect(aCorner, tCorner, w.p1, w.p2)) {
          isRayBlocked = true;
          break;
        }
      }

      // 2. Check intervening creature collisions (provides soft cover)
      if (!isRayBlocked) {
        for (const creature of otherCreatures) {
          if (rayIntersectsTokenCircle(aCorner, tCorner, creature, gridSize)) {
            isRayBlocked = true;
            break;
          }
        }
      }

      if (isRayBlocked) {
        blockedRays++;
      }
    }
  }

  // 5e SRD Cover Evaluation Table
  if (blockedRays === 16) {
    return {
      coverType: 'total',
      acBonus: 999,
      dexSaveBonus: 999,
      blockedRaysCount: blockedRays,
      totalRaysCount: totalRays,
      description: 'Total Cover (Target cannot be directly targeted)',
      canTarget: false,
    };
  }

  if (blockedRays >= 9) {
    return {
      coverType: 'three_quarters',
      acBonus: 5,
      dexSaveBonus: 5,
      blockedRaysCount: blockedRays,
      totalRaysCount: totalRays,
      description: 'Three-Quarters Cover (+5 AC, +5 DEX saves)',
      canTarget: true,
    };
  }

  if (blockedRays >= 5) {
    return {
      coverType: 'half',
      acBonus: 2,
      dexSaveBonus: 2,
      blockedRaysCount: blockedRays,
      totalRaysCount: totalRays,
      description: 'Half Cover (+2 AC, +2 DEX saves)',
      canTarget: true,
    };
  }

  return {
    coverType: 'none',
    acBonus: 0,
    dexSaveBonus: 0,
    blockedRaysCount: blockedRays,
    totalRaysCount: totalRays,
    description: 'No Cover (+0 AC)',
    canTarget: true,
  };
}
