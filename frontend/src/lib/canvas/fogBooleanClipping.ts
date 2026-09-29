// src/lib/canvas/fogBooleanClipping.ts
// 2D Boolean Polygon Operations for Permanent Fog of War using polygon-clipping (Martinez algorithm)
// Supports non-destructive Union (Reveal) and Difference (Conceal) operations across complex and self-intersecting polygons.

import polygonClipping, { type MultiPolygon, type Polygon, type Ring } from 'polygon-clipping';
import type { FogPoint } from './fogOfWarLayer';

/**
 * Converts an array of FogPoints ({ x, y }) into a closed polygon ring suitable for polygon-clipping.
 */
export function fogPointsToPolygon(pts: FogPoint[]): Polygon | null {
  if (!pts || pts.length < 3) return null;
  const ring: Ring = pts.map(p => [p.x, p.y]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]]);
  }
  return [ring];
}

/**
 * Converts a polygon-clipping MultiPolygon structure back into an array of simplified FogPoint polygon loops.
 */
export function multiPolygonToFogPoints(mp: MultiPolygon): FogPoint[][] {
  const result: FogPoint[][] = [];
  if (!mp || mp.length === 0) return result;

  for (const poly of mp) {
    if (poly.length > 0 && poly[0].length >= 3) {
      const ring = poly[0];
      const pts: FogPoint[] = [];
      const len =
        ring.length > 1 &&
        ring[0][0] === ring[ring.length - 1][0] &&
        ring[0][1] === ring[ring.length - 1][1]
          ? ring.length - 1
          : ring.length;

      for (let i = 0; i < len; i++) {
        pts.push({
          x: Math.round(ring[i][0]),
          y: Math.round(ring[i][1]),
        });
      }

      if (pts.length >= 3) {
        result.push(pts);
      }
    }
  }

  return result;
}

/**
 * Computes the algebraic union of existing explored fog polygons and a new reveal polygon.
 * Merges contiguous and overlapping territory into a simplified polygon set.
 */
export function clipFogUnion(existingPolygons: FogPoint[][], newPoly: FogPoint[]): FogPoint[][] {
  const deltaPoly = fogPointsToPolygon(newPoly);
  if (!deltaPoly) return existingPolygons;

  if (!existingPolygons || existingPolygons.length === 0) {
    return [newPoly];
  }

  const existingMulti: Polygon[] = existingPolygons
    .map(fogPointsToPolygon)
    .filter((p): p is Polygon => p !== null);

  if (existingMulti.length === 0) {
    return [newPoly];
  }

  try {
    const unionResult = polygonClipping.union(existingMulti, [deltaPoly]);
    return multiPolygonToFogPoints(unionResult);
  } catch (err) {
    console.warn('[fogBooleanClipping] Union failed on complex geometry, falling back to append:', err);
    return [...existingPolygons, newPoly];
  }
}

/**
 * Computes the algebraic difference between existing explored fog polygons and a conceal polygon.
 * Subtracts the concealed territory from the explored set.
 */
export function clipFogDifference(existingPolygons: FogPoint[][], concealPoly: FogPoint[]): FogPoint[][] {
  const deltaPoly = fogPointsToPolygon(concealPoly);
  if (!deltaPoly) return existingPolygons;

  if (!existingPolygons || existingPolygons.length === 0) {
    return [];
  }

  const existingMulti: Polygon[] = existingPolygons
    .map(fogPointsToPolygon)
    .filter((p): p is Polygon => p !== null);

  if (existingMulti.length === 0) {
    return [];
  }

  try {
    const diffResult = polygonClipping.difference(existingMulti, [deltaPoly]);
    return multiPolygonToFogPoints(diffResult);
  } catch (err) {
    console.warn('[fogBooleanClipping] Difference failed on complex geometry:', err);
    return existingPolygons;
  }
}
