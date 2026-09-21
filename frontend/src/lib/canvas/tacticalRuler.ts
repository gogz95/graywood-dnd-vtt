// src/lib/canvas/tacticalRuler.ts
// Tactical Drag Ruler Engine with 3D Elevation Euclidean Distance,
// Difficult Terrain Polygon Intersection & 5e Speed Budget Evaluation (Green/Yellow/Red).

export interface Waypoint3D {
  x: number; // grid coords or pixel coords (specified in options)
  y: number;
  zFeet?: number; // Elevation in feet
}

export interface DifficultTerrainZone {
  id: string;
  polygon: Array<{ x: number; y: number }>; // in pixel coordinates
}

export interface TacticalRulerOptions {
  gridSize: number; // pixels per 5ft cell
  baseSpeedFeet: number; // e.g. 30 ft
  dashMultiplier?: number; // default 2 (60 ft total)
  difficultZones?: DifficultTerrainZone[];
  isPixelCoords?: boolean; // if true, x/y are in pixels; if false, in cell coordinates
}

export type MovementCostState = 'normal' | 'dash' | 'exceeded';

export interface SegmentMeasurement {
  from: Waypoint3D;
  to: Waypoint3D;
  distanceFeet: number;
  costFeet: number;
  isDifficultTerrain: boolean;
  elevationDeltaFeet: number;
}

export interface RulerMeasurementResult {
  segments: SegmentMeasurement[];
  totalDistanceFeet: number;
  totalCostFeet: number;
  state: MovementCostState;
  color: string;
}

/**
 * Checks whether a 2D point is inside a polygon (Ray-casting point in polygon).
 */
export function isPointInPoly(pt: { x: number; y: number }, poly: Array<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;

    const intersect = yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Samples points along a line segment to evaluate difficult terrain coverage ratio.
 */
export function calculateSegmentDifficultRatio(
  p1Px: { x: number; y: number },
  p2Px: { x: number; y: number },
  difficultZones: DifficultTerrainZone[],
  samples: number = 10
): number {
  if (!difficultZones || difficultZones.length === 0) return 0;

  let inDiffCount = 0;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const samplePt = {
      x: p1Px.x + t * (p2Px.x - p1Px.x),
      y: p1Px.y + t * (p2Px.y - p1Px.y),
    };

    const inAny = difficultZones.some((zone) => isPointInPoly(samplePt, zone.polygon));
    if (inAny) inDiffCount++;
  }

  return inDiffCount / (samples + 1);
}

/**
 * Computes 3D Euclidean distance and 5e movement cost across all drag waypoints.
 */
export function measureTacticalPath(
  waypoints: Waypoint3D[],
  options: TacticalRulerOptions
): RulerMeasurementResult {
  const {
    gridSize,
    baseSpeedFeet = 30,
    dashMultiplier = 2,
    difficultZones = [],
    isPixelCoords = false,
  } = options;

  if (!waypoints || waypoints.length < 2) {
    return {
      segments: [],
      totalDistanceFeet: 0,
      totalCostFeet: 0,
      state: 'normal',
      color: '#22c55e',
    };
  }

  const segments: SegmentMeasurement[] = [];
  let totalDistanceFeet = 0;
  let totalCostFeet = 0;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i];
    const to = waypoints[i + 1];

    const p1Px = isPixelCoords
      ? { x: from.x, y: from.y }
      : { x: (from.x + 0.5) * gridSize, y: (from.y + 0.5) * gridSize };
    const p2Px = isPixelCoords
      ? { x: to.x, y: to.y }
      : { x: (to.x + 0.5) * gridSize, y: (to.y + 0.5) * gridSize };

    // 2D distance converted to feet (gridSize = 5 ft)
    const dxFeet = ((p2Px.x - p1Px.x) / gridSize) * 5;
    const dyFeet = ((p2Px.y - p1Px.y) / gridSize) * 5;
    const dzFeet = (to.zFeet || 0) - (from.zFeet || 0);

    // 3D Euclidean Distance: sqrt((x1 - x0)^2 + (y1 - y0)^2 + (z1 - z0)^2)
    const distFeet = Math.sqrt(dxFeet * dxFeet + dyFeet * dyFeet + dzFeet * dzFeet);

    // Difficult terrain calculation (1 ft difficult = 2 ft cost budget)
    const diffRatio = calculateSegmentDifficultRatio(p1Px, p2Px, difficultZones);
    const normalPortion = distFeet * (1 - diffRatio);
    const diffPortion = distFeet * diffRatio;
    const costFeet = normalPortion + diffPortion * 2;

    segments.push({
      from,
      to,
      distanceFeet: Math.round(distFeet * 10) / 10,
      costFeet: Math.round(costFeet * 10) / 10,
      isDifficultTerrain: diffRatio > 0.15,
      elevationDeltaFeet: dzFeet,
    });

    totalDistanceFeet += distFeet;
    totalCostFeet += costFeet;
  }

  totalDistanceFeet = Math.round(totalDistanceFeet * 10) / 10;
  totalCostFeet = Math.round(totalCostFeet * 10) / 10;

  const dashBudget = baseSpeedFeet * dashMultiplier;
  let state: MovementCostState = 'normal';
  let color = '#22c55e'; // Green: within remaining normal speed

  if (totalCostFeet > dashBudget) {
    state = 'exceeded';
    color = '#ef4444'; // Red: exceeds dash / total speed
  } else if (totalCostFeet > baseSpeedFeet) {
    state = 'dash';
    color = '#eab308'; // Yellow: dash action required
  }

  return {
    segments,
    totalDistanceFeet,
    totalCostFeet,
    state,
    color,
  };
}

/**
 * Draws the tactical ruler segmented path, distance labels, and waypoint markers onto the canvas.
 */
export function renderTacticalRuler(
  ctx: CanvasRenderingContext2D,
  waypoints: Waypoint3D[],
  options: TacticalRulerOptions
): void {
  if (!waypoints || waypoints.length < 2) return;

  const measurement = measureTacticalPath(waypoints, options);
  const { gridSize, isPixelCoords } = options;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const seg of measurement.segments) {
    const p1 = isPixelCoords
      ? { x: seg.from.x, y: seg.from.y }
      : { x: (seg.from.x + 0.5) * gridSize, y: (seg.from.y + 0.5) * gridSize };
    const p2 = isPixelCoords
      ? { x: seg.to.x, y: seg.to.y }
      : { x: (seg.to.x + 0.5) * gridSize, y: (seg.to.y + 0.5) * gridSize };

    // Outer glow
    ctx.strokeStyle = measurement.color;
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    // Inner line (dashed if difficult terrain)
    ctx.globalAlpha = 1.0;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = measurement.color;
    if (seg.isDifficultTerrain) {
      ctx.setLineDash([6, 4]);
    } else {
      ctx.setLineDash([]);
    }

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    // Segment midpoint distance badge
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;

    const label = seg.isDifficultTerrain
      ? `${seg.distanceFeet.toFixed(0)} ft (${seg.costFeet.toFixed(0)} ft Diff)`
      : `${seg.distanceFeet.toFixed(0)} ft`;

    ctx.setLineDash([]);
    ctx.font = 'bold 11px sans-serif';
    const textWidth = ctx.measureText(label).width;

    // Badge pill
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.strokeStyle = measurement.color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(midX - textWidth / 2 - 6, midY - 10, textWidth + 12, 20, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, midX, midY);
  }

  // End Point Target Reticle
  const lastSeg = measurement.segments[measurement.segments.length - 1];
  const endPoint = isPixelCoords
    ? { x: lastSeg.to.x, y: lastSeg.to.y }
    : { x: (lastSeg.to.x + 0.5) * gridSize, y: (lastSeg.to.y + 0.5) * gridSize };

  ctx.beginPath();
  ctx.arc(endPoint.x, endPoint.y, 8, 0, Math.PI * 2);
  ctx.fillStyle = measurement.color;
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Total Movement Summary Tag
  const totalSummary = `${measurement.totalDistanceFeet.toFixed(0)} ft / ${options.baseSpeedFeet} ft Speed`;
  ctx.font = 'black 12px sans-serif';
  const sumWidth = ctx.measureText(totalSummary).width;

  ctx.fillStyle = measurement.color;
  ctx.beginPath();
  ctx.roundRect(endPoint.x + 12, endPoint.y - 12, sumWidth + 14, 24, 6);
  ctx.fill();

  ctx.fillStyle = '#020617';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(totalSummary, endPoint.x + 19, endPoint.y);

  ctx.restore();
}
