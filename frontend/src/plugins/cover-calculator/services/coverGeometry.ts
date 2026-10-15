// frontend/src/plugins/cover-calculator/services/coverGeometry.ts
// 2D 4-Corner Raycast Engine for 5e Geometric Cover Detection

import type { TokenCoordinates } from '$lib/types/coreModels';

export type CoverLevel = 'none' | 'half' | 'three_quarters' | 'total';

export interface CoverResult {
  level: CoverLevel;
  acBonus: number;
  blockedRays: number;
}

/**
 * Pure 2D segment-segment intersection algorithm.
 */
export function segmentsIntersect(
  a1: [number, number],
  a2: [number, number],
  b1: [number, number],
  b2: [number, number]
): boolean {
  const [x1, y1] = a1;
  const [x2, y2] = a2;
  const [x3, y3] = b1;
  const [x4, y4] = b2;

  const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
  if (denom === 0) return false;

  const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
  const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;

  const eps = 1e-4;
  return ua > eps && ua < 1 - eps && ub >= 0 && ub <= 1;
}

/**
 * Calculates D&D 5e Cover rules by casting rays from the attacker's nearest corner
 * to the target's 4 bounding corners through walls and intervening creatures.
 */
export function calculateCover(
  attacker: TokenCoordinates,
  target: TokenCoordinates,
  walls: Array<{ p1: [number, number]; p2: [number, number]; blocksVision: boolean }> = [],
  interveningTokens: TokenCoordinates[] = []
): CoverResult {
  const ax = attacker.gridX + (attacker.offsetX || 0);
  const ay = attacker.gridY + (attacker.offsetY || 0);

  const tx = target.gridX + (target.offsetX || 0);
  const ty = target.gridY + (target.offsetY || 0);

  // 1. Calculate 4 corners of attacker and target footprints
  const attackerCorners: Array<[number, number]> = [
    [ax, ay],
    [ax + 1, ay],
    [ax + 1, ay + 1],
    [ax, ay + 1]
  ];

  const targetCorners: Array<[number, number]> = [
    [tx, ty],
    [tx + 1, ty],
    [tx + 1, ty + 1],
    [tx, ty + 1]
  ];

  const targetCenter: [number, number] = [tx + 0.5, ty + 0.5];

  // 2. Select attacker corner closest to target center
  let bestAttackerCorner = attackerCorners[0];
  let minDist = Infinity;
  for (const corner of attackerCorners) {
    const dist = Math.hypot(corner[0] - targetCenter[0], corner[1] - targetCenter[1]);
    if (dist < minDist) {
      minDist = dist;
      bestAttackerCorner = corner;
    }
  }

  // 3. Prepare intervening token obstacle segments (4 perimeter edges each)
  const tokenObstacles: Array<[[number, number], [number, number]]> = [];
  for (const tok of interveningTokens) {
    const ox = tok.gridX + (tok.offsetX || 0);
    const oy = tok.gridY + (tok.offsetY || 0);

    // Skip if it is the attacker or target themselves
    if (Math.hypot(ox - ax, oy - ay) < 0.1 || Math.hypot(ox - tx, oy - ty) < 0.1) {
      continue;
    }

    const c1: [number, number] = [ox + 0.1, oy + 0.1];
    const c2: [number, number] = [ox + 0.9, oy + 0.1];
    const c3: [number, number] = [ox + 0.9, oy + 0.9];
    const c4: [number, number] = [ox + 0.1, oy + 0.9];

    tokenObstacles.push([c1, c2], [c2, c3], [c3, c4], [c4, c1]);
  }

  // 4. Cast 4 rays from best attacker corner to each target corner
  let blockedRays = 0;

  for (const targetCorner of targetCorners) {
    let isBlocked = false;

    // Test against vision/physical walls
    for (const wall of walls) {
      if (wall.blocksVision && segmentsIntersect(bestAttackerCorner, targetCorner, wall.p1, wall.p2)) {
        isBlocked = true;
        break;
      }
    }

    // Test against intervening creature tokens (providing half cover per 5e rules)
    if (!isBlocked) {
      for (const [edgeP1, edgeP2] of tokenObstacles) {
        if (segmentsIntersect(bestAttackerCorner, targetCorner, edgeP1, edgeP2)) {
          isBlocked = true;
          break;
        }
      }
    }

    if (isBlocked) {
      blockedRays++;
    }
  }

  // 5. Determine 5e cover classification
  let level: CoverLevel = 'none';
  let acBonus = 0;

  if (blockedRays === 0) {
    level = 'none';
    acBonus = 0;
  } else if (blockedRays === 1 || blockedRays === 2) {
    level = 'half';
    acBonus = 2;
  } else if (blockedRays === 3) {
    level = 'three_quarters';
    acBonus = 5;
  } else {
    // 4 blocked rays
    level = 'total';
    acBonus = 99; // Untargetable directly
  }

  return {
    level,
    acBonus,
    blockedRays
  };
}
