// frontend/src/lib/canvas/gridCalculations.test.ts
import { describe, it, expect } from 'vitest';
import {
  axialToCube,
  cubeToAxial,
  cubeRound,
  pixelToHexAxial,
  hexAxialToPixel,
  snapToHex,
  hexDistance,
  hexDistanceFeet,
  getHexVertices,
  getHexRing,
  getHexSpiral,
  getHexCone,
} from './gridCalculations';

describe('Hexagonal Grid Calculations', () => {
  it('converts axial to cube coordinates maintaining q + r + s = 0', () => {
    const axial = { q: 2, r: -3 };
    const cube = axialToCube(axial);
    expect(cube.q).toBe(2);
    expect(cube.r).toBe(-3);
    expect(cube.s).toBe(1);
    expect(cube.q + cube.r + cube.s).toBe(0);

    const backToAxial = cubeToAxial(cube);
    expect(backToAxial).toEqual(axial);
  });

  it('rounds fractional cube coordinates correctly', () => {
    const fractional = { q: 1.1, r: -2.2, s: 1.1 };
    const rounded = cubeRound(fractional);
    expect(rounded.q + rounded.r + rounded.s).toBe(0);
    expect(rounded.q).toBe(1);
    expect(rounded.r).toBe(-2);
    expect(rounded.s).toBe(1);
  });

  it('transforms pixel coordinates to axial and back for pointy-topped hexagons', () => {
    const radius = 50;
    const origin = hexAxialToPixel(0, 0, radius, 'pointy');
    expect(origin.x).toBe(0);
    expect(origin.y).toBe(0);

    const axial = { q: 3, r: -2 };
    const pixel = hexAxialToPixel(axial.q, axial.r, radius, 'pointy');
    const computedAxial = pixelToHexAxial(pixel.x, pixel.y, radius, 'pointy');
    expect(Math.round(computedAxial.q)).toBe(axial.q);
    expect(Math.round(computedAxial.r)).toBe(axial.r);
  });

  it('transforms pixel coordinates to axial and back for flat-topped hexagons', () => {
    const radius = 50;
    const axial = { q: 2, r: 4 };
    const pixel = hexAxialToPixel(axial.q, axial.r, radius, 'flat');
    const computedAxial = pixelToHexAxial(pixel.x, pixel.y, radius, 'flat');
    expect(Math.round(computedAxial.q)).toBe(axial.q);
    expect(Math.round(computedAxial.r)).toBe(axial.r);
  });

  it('snaps arbitrary world positions accurately to nearest hex centers', () => {
    const radius = 40;
    // Expected center for (1, 1) in pointy
    const exactCenter = hexAxialToPixel(1, 1, radius, 'pointy');

    // Query slightly off center
    const snapped = snapToHex(exactCenter.x + 5, exactCenter.y - 4, radius, 'pointy');
    expect(snapped.q).toBe(1);
    expect(snapped.r).toBe(1);
    expect(Math.abs(snapped.x - exactCenter.x)).toBeLessThan(0.001);
    expect(Math.abs(snapped.y - exactCenter.y)).toBeLessThan(0.001);
  });

  it('calculates Manhattan cube distances accurately', () => {
    const a = { q: 0, r: 0 };
    const b = { q: 2, r: -1 }; // s: -1 -> distance: max(2, 1, 1) = 2
    expect(hexDistance(a, b)).toBe(2);
    expect(hexDistanceFeet(a, b, 5)).toBe(10);

    const c = { q: 3, r: -3 }; // s: 0 -> distance: 3
    expect(hexDistance(a, c)).toBe(3);
    expect(hexDistanceFeet(a, c, 5)).toBe(15);
  });

  it('computes 6 regular hex vertices', () => {
    const vertices = getHexVertices(100, 100, 50, 'pointy');
    expect(vertices).toHaveLength(6);
    for (const v of vertices) {
      const dist = Math.sqrt((v.x - 100) ** 2 + (v.y - 100) ** 2);
      expect(Math.abs(dist - 50)).toBeLessThan(0.001);
    }
  });

  it('computes exact hex rings without fractional cell clipping', () => {
    const center = { q: 0, r: 0 };
    // Radius 0: just center
    expect(getHexRing(center, 0)).toEqual([center]);
    // Radius 1: exactly 6 cells
    const ring1 = getHexRing(center, 1);
    expect(ring1).toHaveLength(6);
    for (const cell of ring1) {
      expect(hexDistance(center, cell)).toBe(1);
    }

    // Radius 2: exactly 12 cells
    const ring2 = getHexRing(center, 2);
    expect(ring2).toHaveLength(12);
    for (const cell of ring2) {
      expect(hexDistance(center, cell)).toBe(2);
    }
  });

  it('computes hex spiral circular burst areas matching 3*N*(N+1)+1 count', () => {
    const center = { q: 0, r: 0 };
    // Radius 1: 1 + 6 = 7 cells
    expect(getHexSpiral(center, 1)).toHaveLength(7);
    // Radius 2: 1 + 6 + 12 = 19 cells
    expect(getHexSpiral(center, 2)).toHaveLength(19);
    // Radius 3: 1 + 6 + 12 + 18 = 37 cells
    expect(getHexSpiral(center, 3)).toHaveLength(37);
  });

  it('computes 60-degree hex wedge cones along orientation angle', () => {
    const origin = { q: 0, r: 0 };
    // 0 radian wedge along +X axis
    const coneEast = getHexCone(origin, 0, 3, 'pointy');
    expect(coneEast.length).toBeGreaterThan(1);
    expect(coneEast).toContainEqual(origin);
    for (const hex of coneEast) {
      expect(hexDistance(origin, hex)).toBeLessThanOrEqual(3);
    }
  });
});
