import { describe, it, expect } from 'vitest';
import {
  calculateGridDistanceFeet,
  calculateConeVertices,
  calculateLineVertices,
} from '../components/map/MeasurementTool';

describe('MeasurementTool & Spell AOE Geometry', () => {
  it('calculates Euclidean distance in 5-ft increments correctly', () => {
    // 3 squares right, 4 squares down = 5 squares Euclidean = 25 feet
    const r1 = calculateGridDistanceFeet({ gx: 0, gy: 0 }, { gx: 3, gy: 4 });
    expect(r1.cells).toBe(5);
    expect(r1.distanceFeet).toBe(25);

    // Diagonal 1 square = sqrt(2) * 5 ≈ 7.1 feet
    const r2 = calculateGridDistanceFeet({ gx: 2, gy: 2 }, { gx: 3, gy: 3 });
    expect(r2.cells).toBe(1.4);
    expect(r2.distanceFeet).toBe(7.1);

    // Straight line 6 squares = 30 feet
    const r3 = calculateGridDistanceFeet({ gx: 5, gy: 10 }, { gx: 11, gy: 10 });
    expect(r3.cells).toBe(6);
    expect(r3.distanceFeet).toBe(30);
  });

  it('generates standard 5e 53.13° cone vertices', () => {
    const origin = { x: 100, y: 100 };
    const target = { x: 200, y: 100 }; // Pointing directly East (0 radians)
    const lengthPx = 100;

    const cone = calculateConeVertices(origin, target, lengthPx);
    expect(cone.p1.x).toBe(100);
    expect(cone.p1.y).toBe(100);

    // At angle 0, p2 is at angle -atan(0.5) and p3 is at +atan(0.5)
    // cos(atan(0.5)) = 2 / sqrt(5) ≈ 0.8944 * 100 ≈ 89.44 => x ≈ 189.44
    // sin(atan(0.5)) = 1 / sqrt(5) ≈ 0.4472 * 100 ≈ 44.72 => y ≈ 144.72 / 55.28
    expect(Math.abs(cone.p2.x - 189.44)).toBeLessThan(0.1);
    expect(Math.abs(cone.p3.x - 189.44)).toBeLessThan(0.1);
    expect(Math.abs((cone.p3.y - cone.p2.y) - 89.44)).toBeLessThan(0.2); // Spread matches ~2*44.72 = 89.44
  });

  it('generates 4-corner line corridor with 5-ft path width', () => {
    const origin = { x: 50, y: 50 };
    const target = { x: 150, y: 50 }; // East line
    const lengthPx = 100;
    const widthPx = 20;

    const poly = calculateLineVertices(origin, target, lengthPx, widthPx);
    expect(poly.length).toBe(4);

    // Normal vector perpendicular is (0, 10)
    // poly[0] = origin + (0, 10) = (50, 60)
    // poly[1] = end + (0, 10) = (150, 60)
    // poly[2] = end - (0, 10) = (150, 40)
    // poly[3] = origin - (0, 10) = (50, 40)
    expect(poly[0].x).toBe(50);
    expect(poly[0].y).toBe(60);

    expect(poly[1].x).toBe(150);
    expect(poly[1].y).toBe(60);

    expect(poly[2].x).toBe(150);
    expect(poly[2].y).toBe(40);

    expect(poly[3].x).toBe(50);
    expect(poly[3].y).toBe(40);
  });
});
