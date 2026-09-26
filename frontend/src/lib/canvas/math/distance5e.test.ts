// frontend/src/lib/canvas/math/distance5e.test.ts
// Vitest suite for 5e distance calculator.

import { describe, it, expect } from 'vitest';
import { calculate5eDistance } from './distance5e';

const CELL = 100; // 100px = 5ft
const FPT = 5;   // feet per cell

function pt(x: number, y: number, elevation = 0) {
  return { x: x * CELL, y: y * CELL, elevation };
}

describe('5-5-5 (Chebyshev) rule', () => {
  it('(0,0,0) to (3,4,0) cells yields 20 ft (max of 3,4 = 4 cells × 5ft)', () => {
    const r = calculate5eDistance({ from: pt(0, 0), to: pt(3, 4), cellSize: CELL, feetPerCell: FPT, diagonalRule: '5-5-5' });
    expect(r.distance2D).toBe(20);
    expect(r.distance3D).toBe(20);
  });

  it('pure horizontal 5 cells = 25ft', () => {
    const r = calculate5eDistance({ from: pt(0, 0), to: pt(5, 0), cellSize: CELL, feetPerCell: FPT, diagonalRule: '5-5-5' });
    expect(r.distance2D).toBe(25);
  });

  it('pure diagonal 4 cells = 20ft', () => {
    const r = calculate5eDistance({ from: pt(0, 0), to: pt(4, 4), cellSize: CELL, feetPerCell: FPT, diagonalRule: '5-5-5' });
    expect(r.distance2D).toBe(20);
  });
});

describe('5-10-5 alternating diagonal rule', () => {
  it('1 diagonal = 5ft', () => {
    const r = calculate5eDistance({ from: pt(0, 0), to: pt(1, 1), cellSize: CELL, feetPerCell: FPT, diagonalRule: '5-10-5' });
    expect(r.distance2D).toBe(5);
  });

  it('2 diagonals = 15ft (5 + 10)', () => {
    const r = calculate5eDistance({ from: pt(0, 0), to: pt(2, 2), cellSize: CELL, feetPerCell: FPT, diagonalRule: '5-10-5' });
    expect(r.distance2D).toBe(15);
  });

  it('3 diagonals = 20ft (5 + 10 + 5)', () => {
    const r = calculate5eDistance({ from: pt(0, 0), to: pt(3, 3), cellSize: CELL, feetPerCell: FPT, diagonalRule: '5-10-5' });
    expect(r.distance2D).toBe(20);
  });

  it('4 diagonals = 30ft (5+10+5+10)', () => {
    const r = calculate5eDistance({ from: pt(0, 0), to: pt(4, 4), cellSize: CELL, feetPerCell: FPT, diagonalRule: '5-10-5' });
    expect(r.distance2D).toBe(30);
  });

  it('mixed: 3 horizontal + 2 diagonal', () => {
    // 3 straight = 15ft, 2 diag = 15ft (5+10) → 30ft
    const r = calculate5eDistance({ from: pt(0, 0), to: pt(5, 2), cellSize: CELL, feetPerCell: FPT, diagonalRule: '5-10-5' });
    expect(r.distance2D).toBe(30);
  });
});

describe('euclidean rule', () => {
  it('(0,0) to (3,4) = 5 cells Pythagorean = 25ft', () => {
    const r = calculate5eDistance({ from: pt(0, 0), to: pt(3, 4), cellSize: CELL, feetPerCell: FPT, diagonalRule: 'euclidean' });
    expect(r.distance2D).toBeCloseTo(25, 1);
  });
});

describe('manhattan rule', () => {
  it('(0,0) to (3,4) = 7 cells = 35ft', () => {
    const r = calculate5eDistance({ from: pt(0, 0), to: pt(3, 4), cellSize: CELL, feetPerCell: FPT, diagonalRule: 'manhattan' });
    expect(r.distance2D).toBe(35);
  });
});

describe('3D elevation combination', () => {
  it('2D dist = 30ft, elev = 40ft → 3D = 50ft', () => {
    // 6 horizontal cells = 30ft 2D, elevation delta 40ft
    const r = calculate5eDistance({
      from: { x: 0, y: 0, elevation: 0 },
      to: { x: 6 * CELL, y: 0, elevation: 40 },
      cellSize: CELL,
      feetPerCell: FPT,
      diagonalRule: '5-5-5',
    });
    expect(r.distance2D).toBe(30);
    expect(r.elevationDelta).toBe(40);
    expect(r.distance3D).toBe(50);
  });

  it('zero elevation: 3D equals 2D', () => {
    const r = calculate5eDistance({ from: pt(0, 0, 0), to: pt(4, 0, 0), cellSize: CELL, feetPerCell: FPT, diagonalRule: '5-5-5' });
    expect(r.distance3D).toBe(r.distance2D);
  });

  it('zero 2D: 3D equals elevation delta', () => {
    const r = calculate5eDistance({
      from: { x: 0, y: 0, elevation: 0 },
      to: { x: 0, y: 0, elevation: 20 },
      cellSize: CELL,
      feetPerCell: FPT,
      diagonalRule: '5-5-5',
    });
    expect(r.distance2D).toBe(0);
    expect(r.distance3D).toBe(20);
  });
});
