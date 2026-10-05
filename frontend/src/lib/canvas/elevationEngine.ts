// frontend/src/lib/canvas/elevationEngine.ts
// 3D Euclidean Elevation, Range Enforcement, and Altitude Drop-Shadow Engine

export interface Point3D {
  x: number; // grid col or pixel x
  y: number; // grid row or pixel y
  z?: number; // elevation in feet (default 0)
}

export interface AttackRangeValidation {
  inRange: boolean;
  distanceFeet: number;
  groundDistanceFeet: number;
  elevationDeltaFeet: number;
  maxRangeFeet: number;
  failureReason?: string;
}

export interface DropShadowParams {
  blur: number;
  offsetX: number;
  offsetY: number;
  alpha: number;
}

/**
 * Computes official 3D Euclidean distance in feet between two points:
 * D_3D = sqrt((dx * 5)^2 + (dy * 5)^2 + dz^2)
 * @param p1 Point 1 in grid cells and elevation in feet
 * @param p2 Point 2 in grid cells and elevation in feet
 * @param feetPerCell Standard 5e grid scale (default 5.0 ft)
 */
export function calculate3DDistanceFeet(
  p1: Point3D,
  p2: Point3D,
  feetPerCell: number = 5.0
): number {
  const dxFeet = (p2.x - p1.x) * feetPerCell;
  const dyFeet = (p2.y - p1.y) * feetPerCell;
  const dzFeet = (p2.z ?? 0) - (p1.z ?? 0);

  return Math.sqrt(dxFeet * dxFeet + dyFeet * dyFeet + dzFeet * dzFeet);
}

/**
 * Enforces 3D range checks for melee, ranged attacks, and spells.
 * Fails targeting if 3D Euclidean distance exceeds max range,
 * even when 2D top-down grid projection is directly adjacent.
 */
export function validate3DAttackRange(
  attacker: Point3D,
  target: Point3D,
  maxRangeFeet: number,
  feetPerCell: number = 5.0
): AttackRangeValidation {
  const groundDistanceFeet = Math.hypot(
    (target.x - attacker.x) * feetPerCell,
    (target.y - attacker.y) * feetPerCell
  );
  const elevationDeltaFeet = Math.abs((target.z ?? 0) - (attacker.z ?? 0));
  const distanceFeet = Math.sqrt(
    groundDistanceFeet * groundDistanceFeet + elevationDeltaFeet * elevationDeltaFeet
  );

  const inRange = distanceFeet <= maxRangeFeet + 0.05;
  let failureReason: string | undefined;

  if (!inRange) {
    if (groundDistanceFeet <= maxRangeFeet && elevationDeltaFeet > 0) {
      failureReason = `Target is out of reach due to vertical elevation (Ground: ${groundDistanceFeet.toFixed(0)}ft, Height Delta: ${elevationDeltaFeet.toFixed(0)}ft, 3D Distance: ${distanceFeet.toFixed(1)}ft vs Max: ${maxRangeFeet}ft)`;
    } else {
      failureReason = `Target exceeds range (${distanceFeet.toFixed(1)}ft vs Max: ${maxRangeFeet}ft)`;
    }
  }

  return {
    inRange,
    distanceFeet,
    groundDistanceFeet,
    elevationDeltaFeet,
    maxRangeFeet,
    failureReason,
  };
}

/**
 * Computes dynamic drop-shadow parameters proportional to elevation in feet.
 * Higher elevation increases shadow blur and offset while softening opacity.
 */
export function calculateDropShadowParams(elevationFeet: number = 0): DropShadowParams {
  if (elevationFeet <= 0) {
    return {
      blur: 3,
      offsetX: 2,
      offsetY: 2,
      alpha: 0.4,
    };
  }

  // Shadow displacement scaled by altitude (e.g. 30ft elevation -> 12px blur, 9px offset)
  const blur = Math.min(30, 4 + elevationFeet * 0.28);
  const offsetX = Math.min(24, 2 + elevationFeet * 0.22);
  const offsetY = Math.min(28, 3 + elevationFeet * 0.30);
  const alpha = Math.max(0.15, 0.45 - elevationFeet * 0.0035);

  return { blur, offsetX, offsetY, alpha };
}

/**
 * Generates HUD elevation badge label and states.
 */
export function getElevationBadge(elevationFeet: number = 0): {
  label: string;
  isElevated: boolean;
  isSubterranean: boolean;
  cssColor: string;
} {
  if (elevationFeet === 0) {
    return { label: '0 ft', isElevated: false, isSubterranean: false, cssColor: '#94a3b8' };
  }

  if (elevationFeet > 0) {
    return {
      label: `↑ ${elevationFeet}ft`,
      isElevated: true,
      isSubterranean: false,
      cssColor: '#38bdf8', // Cyan sky
    };
  }

  return {
    label: `↓ ${Math.abs(elevationFeet)}ft`,
    isElevated: false,
    isSubterranean: true,
    cssColor: '#f97316', // Orange subterranean
  };
}

/**
 * Steps elevation by deltaFeet (e.g. +/- 5ft per wheel detent),
 * clamped to minimum 0ft unless allowSubterranean is true.
 */
export function stepElevationFeet(
  currentElevationFeet: number = 0,
  deltaFeet: number = 5,
  allowSubterranean: boolean = false
): number {
  const next = currentElevationFeet + deltaFeet;
  const minVal = allowSubterranean ? -100 : 0;
  return Math.max(minVal, Math.min(500, Math.round(next / 5) * 5));
}

