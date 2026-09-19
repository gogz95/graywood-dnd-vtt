// MeasurementTool.ts — Vector measurement and geometric spell AOE template engine
// Snaps to 5 ft D&D grid increments and supports Circle, Cone, Cube, and Line templates.

import type { SpellAoeTemplate, RulerMeasurement } from '../../../stores/canvasStore.svelte';

export interface GridPoint {
  gx: number;
  gy: number;
}

export interface PixelPoint {
  x: number;
  y: number;
}

/**
 * Calculates Euclidean distance in feet between two grid coordinates.
 * In standard 5e, 1 cell = 5 feet.
 */
export function calculateGridDistanceFeet(
  start: GridPoint,
  end: GridPoint,
  feetPerCell = 5
): { distanceFeet: number; cells: number } {
  const dx = end.gx - start.gx;
  const dy = end.gy - start.gy;
  const cells = Math.sqrt(dx * dx + dy * dy);
  const distanceFeet = Math.round((cells * feetPerCell) * 10) / 10;
  return { distanceFeet, cells: Math.round(cells * 10) / 10 };
}

/**
 * Standard 5e Cone geometry:
 * A cone's width at any point along its length is equal to its distance from the point of origin.
 * This corresponds to a 53.13° spread angle (half-angle = atan(0.5) ≈ 26.565°).
 */
export function calculateConeVertices(
  originPx: PixelPoint,
  targetPx: PixelPoint,
  lengthPx: number
): { p1: PixelPoint; p2: PixelPoint; p3: PixelPoint } {
  const dx = targetPx.x - originPx.x;
  const dy = targetPx.y - originPx.y;
  const angle = Math.atan2(dy, dx);
  const halfSpread = Math.atan(0.5); // ~26.565°

  const leftAngle = angle - halfSpread;
  const rightAngle = angle + halfSpread;

  return {
    p1: originPx,
    p2: {
      x: originPx.x + Math.cos(leftAngle) * lengthPx,
      y: originPx.y + Math.sin(leftAngle) * lengthPx,
    },
    p3: {
      x: originPx.x + Math.cos(rightAngle) * lengthPx,
      y: originPx.y + Math.sin(rightAngle) * lengthPx,
    },
  };
}

/**
 * Calculates rectangular polygon vertices for a 5 ft wide Line spell template.
 */
export function calculateLineVertices(
  originPx: PixelPoint,
  targetPx: PixelPoint,
  lengthPx: number,
  widthPx: number
): [PixelPoint, PixelPoint, PixelPoint, PixelPoint] {
  const dx = targetPx.x - originPx.x;
  const dy = targetPx.y - originPx.y;
  const lineLen = Math.sqrt(dx * dx + dy * dy) || 1;
  const uX = dx / lineLen;
  const uY = dy / lineLen;

  // Normal vector perpendicular to line
  const nX = -uY * (widthPx / 2);
  const nY = uX * (widthPx / 2);

  const endX = originPx.x + uX * lengthPx;
  const endY = originPx.y + uY * lengthPx;

  return [
    { x: originPx.x + nX, y: originPx.y + nY },
    { x: endX + nX,       y: endY + nY },
    { x: endX - nX,       y: endY - nY },
    { x: originPx.x - nX, y: originPx.y - nY },
  ];
}

/**
 * Renders a Spell AOE Template onto an HTML5 2D Canvas context.
 */
export function renderAoeTemplateOnCanvas(
  ctx: CanvasRenderingContext2D,
  template: SpellAoeTemplate,
  gridSize: number
): void {
  const feetPerCell = 5;
  const pixelsPerFoot = gridSize / feetPerCell;
  const originPx: PixelPoint = {
    x: (template.originX + 0.5) * gridSize,
    y: (template.originY + 0.5) * gridSize,
  };

  const targetPx: PixelPoint = {
    x: ((template.targetX ?? template.originX + 1) + 0.5) * gridSize,
    y: ((template.targetY ?? template.originY) + 0.5) * gridSize,
  };

  const radiusPx = template.sizeFeet * pixelsPerFoot;

  ctx.save();
  ctx.fillStyle = template.color || 'rgba(239, 68, 68, 0.35)';
  ctx.strokeStyle = template.color.replace('0.35', '0.9').replace('0.3', '0.9') || 'rgba(239, 68, 68, 0.9)';
  ctx.lineWidth = 2;

  switch (template.type) {
    case 'circle': {
      ctx.beginPath();
      ctx.arc(originPx.x, originPx.y, radiusPx, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Center crosshair
      ctx.beginPath();
      ctx.arc(originPx.x, originPx.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      break;
    }

    case 'cone': {
      const cone = calculateConeVertices(originPx, targetPx, radiusPx);
      ctx.beginPath();
      ctx.moveTo(cone.p1.x, cone.p1.y);
      ctx.lineTo(cone.p2.x, cone.p2.y);
      ctx.arc(
        originPx.x,
        originPx.y,
        radiusPx,
        Math.atan2(cone.p2.y - originPx.y, cone.p2.x - originPx.x),
        Math.atan2(cone.p3.y - originPx.y, cone.p3.x - originPx.x)
      );
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }

    case 'cube': {
      const sidePx = template.sizeFeet * pixelsPerFoot;
      const x = originPx.x - sidePx / 2;
      const y = originPx.y - sidePx / 2;
      ctx.fillRect(x, y, sidePx, sidePx);
      ctx.strokeRect(x, y, sidePx, sidePx);
      break;
    }

    case 'line': {
      const widthPx = 5 * pixelsPerFoot;
      const poly = calculateLineVertices(originPx, targetPx, radiusPx, widthPx);
      ctx.beginPath();
      ctx.moveTo(poly[0].x, poly[0].y);
      ctx.lineTo(poly[1].x, poly[1].y);
      ctx.lineTo(poly[2].x, poly[2].y);
      ctx.lineTo(poly[3].x, poly[3].y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
  }

  // Draw Template Label Badge
  if (template.label) {
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const textWidth = ctx.measureText(template.label).width;
    const badgeW = textWidth + 14;
    const badgeH = 20;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(originPx.x - badgeW / 2, originPx.y - badgeH / 2, badgeW, badgeH, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.fillText(template.label, originPx.x, originPx.y);
  }

  ctx.restore();
}

/**
 * Renders an active Euclidean distance ruler with footage badge onto an HTML5 2D Canvas context.
 */
export function renderRulerOnCanvas(
  ctx: CanvasRenderingContext2D,
  ruler: RulerMeasurement,
  gridSize: number
): void {
  const startPx = {
    x: (ruler.startX + 0.5) * gridSize,
    y: (ruler.startY + 0.5) * gridSize,
  };
  const endPx = {
    x: (ruler.endX + 0.5) * gridSize,
    y: (ruler.endY + 0.5) * gridSize,
  };

  ctx.save();

  // Line
  ctx.strokeStyle = ruler.color || '#38bdf8';
  ctx.lineWidth = 3;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(startPx.x, startPx.y);
  ctx.lineTo(endPx.x, endPx.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // End nodes
  ctx.fillStyle = ruler.color || '#38bdf8';
  ctx.beginPath();
  ctx.arc(startPx.x, startPx.y, 4, 0, Math.PI * 2);
  ctx.arc(endPx.x, endPx.y, 4, 0, Math.PI * 2);
  ctx.fill();

  // Midpoint distance badge
  const midX = (startPx.x + endPx.x) / 2;
  const midY = (startPx.y + endPx.y) / 2;
  const label = `${ruler.distanceFeet} ft`;

  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const textWidth = ctx.measureText(label).width;
  const badgeW = textWidth + 16;
  const badgeH = 22;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.strokeStyle = ruler.color || '#38bdf8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(midX - badgeW / 2, midY - badgeH / 2, badgeW, badgeH, 6);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, midX, midY);

  ctx.restore();
}
