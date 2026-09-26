// frontend/src/lib/canvas/math/gridSnapping.test.ts
import { describe, it, expect } from 'vitest';
import { snapTokenToGrid, getFootprintCells, cleanFloat, EPSILON } from './gridSnapping';

describe('gridSnapping pure mathematical utility', () => {
  it('correctly maps creature size categories to cell footprint counts', () => {
    expect(getFootprintCells('tiny')).toBe(1);
    expect(getFootprintCells('small')).toBe(1);
    expect(getFootprintCells('medium')).toBe(1);
    expect(getFootprintCells('large')).toBe(2);
    expect(getFootprintCells('huge')).toBe(3);
    expect(getFootprintCells('gargantuan')).toBe(4);
  });

  it('snaps 1x1 token at (104, 98) with cellSize: 100 to center (50, 50) and occupies [{ col: 1, row: 1 }]', () => {
    const res = snapTokenToGrid({
      worldX: 104,
      worldY: 98,
      cellSize: 100,
      sizeCategory: 'medium',
    });

    expect(res.snappedWorldX).toBe(50);
    expect(res.snappedWorldY).toBe(50);
    expect(res.occupiesCells).toEqual([{ col: 1, row: 1 }]);
  });

  it('snaps 2x2 token at (104, 98) with cellSize: 100 to vertex (100, 100) and occupies 4 cells [{1,1}, {2,1}, {1,2}, {2,2}]', () => {
    const res = snapTokenToGrid({
      worldX: 104,
      worldY: 98,
      cellSize: 100,
      sizeCategory: 'large',
    });

    expect(res.snappedWorldX).toBe(100);
    expect(res.snappedWorldY).toBe(100);
    expect(res.occupiesCells).toEqual([
      { col: 1, row: 1 },
      { col: 2, row: 1 },
      { col: 1, row: 2 },
      { col: 2, row: 2 },
    ]);
  });

  it('snaps 3x3 token correctly centered over 9 cells', () => {
    const res = snapTokenToGrid({
      worldX: 155,
      worldY: 145,
      cellSize: 100,
      sizeCategory: 'huge',
    });

    // Middle cell center for 3x3 covering cols 1..3 and rows 1..3 is (150, 150)
    expect(res.snappedWorldX).toBe(150);
    expect(res.snappedWorldY).toBe(150);
    expect(res.occupiesCells).toHaveLength(9);
    expect(res.occupiesCells).toEqual([
      { col: 1, row: 1 },
      { col: 2, row: 1 },
      { col: 3, row: 1 },
      { col: 1, row: 2 },
      { col: 2, row: 2 },
      { col: 3, row: 2 },
      { col: 1, row: 3 },
      { col: 2, row: 3 },
      { col: 3, row: 3 },
    ]);
  });

  it('snaps 4x4 gargantuan token to grid vertex intersection over 16 cells', () => {
    const res = snapTokenToGrid({
      worldX: 205,
      worldY: 195,
      cellSize: 100,
      sizeCategory: 'gargantuan',
    });

    // 4x4 center aligns with vertex (200, 200), occupying cols 1..4 and rows 1..4
    expect(res.snappedWorldX).toBe(200);
    expect(res.snappedWorldY).toBe(200);
    expect(res.occupiesCells).toHaveLength(16);
    expect(res.occupiesCells[0]).toEqual({ col: 1, row: 1 });
    expect(res.occupiesCells[15]).toEqual({ col: 4, row: 4 });
  });

  it('accurately applies offset translations (offsetX: 20, offsetY: 20)', () => {
    // 1x1 token with (20, 20) offset
    const res1 = snapTokenToGrid({
      worldX: 65,
      worldY: 65,
      cellSize: 100,
      sizeCategory: 'medium',
      offsetX: 20,
      offsetY: 20,
    });

    expect(res1.snappedWorldX).toBe(70); // 20 + 50
    expect(res1.snappedWorldY).toBe(70);
    expect(res1.occupiesCells).toEqual([{ col: 1, row: 1 }]);

    // 2x2 token with (20, 20) offset
    const res2 = snapTokenToGrid({
      worldX: 115,
      worldY: 125,
      cellSize: 100,
      sizeCategory: 'large',
      offsetX: 20,
      offsetY: 20,
    });

    expect(res2.snappedWorldX).toBe(120); // 20 + 100
    expect(res2.snappedWorldY).toBe(120);
    expect(res2.occupiesCells).toEqual([
      { col: 1, row: 1 },
      { col: 2, row: 1 },
      { col: 1, row: 2 },
      { col: 2, row: 2 },
    ]);
  });

  it('snaps edge cases near cell borders (x = 99.9999) deterministically without flickering', () => {
    // Test cleanFloat with EPSILON (0.0001)
    const valNearOne = 0.99999;
    expect(cleanFloat(valNearOne)).toBe(1);

    // Coordinate right at border minus epsilon
    const borderX = 100 - EPSILON; // 99.9999
    const res = snapTokenToGrid({
      worldX: borderX,
      worldY: 50,
      cellSize: 100,
      sizeCategory: 'medium',
    });

    // 99.9999 / 100 = 0.999999, cleans to 1.0, snapping to col 2 center (150)
    expect(res.snappedWorldX).toBe(150);
    expect(res.occupiesCells).toEqual([{ col: 2, row: 1 }]);

    // Re-verify deterministic repeat
    const resRepeat = snapTokenToGrid({
      worldX: borderX,
      worldY: 50,
      cellSize: 100,
      sizeCategory: 'medium',
    });
    expect(resRepeat.snappedWorldX).toBe(res.snappedWorldX);
  });

  it('snaps tokens on hexagonal grids (hex_pointy and hex_flat)', () => {
    const resPointy = snapTokenToGrid({
      worldX: 102,
      worldY: 88,
      cellSize: 100,
      sizeCategory: 'medium',
      gridType: 'hex_pointy',
    });
    expect(typeof resPointy.snappedWorldX).toBe('number');
    expect(typeof resPointy.snappedWorldY).toBe('number');
    expect(resPointy.occupiesCells).toHaveLength(1);

    const resFlat = snapTokenToGrid({
      worldX: 85,
      worldY: 105,
      cellSize: 100,
      sizeCategory: 'medium',
      gridType: 'hex_flat',
    });
    expect(typeof resFlat.snappedWorldX).toBe('number');
    expect(typeof resFlat.snappedWorldY).toBe('number');
    expect(resFlat.occupiesCells).toHaveLength(1);
  });
});
