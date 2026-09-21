// src/lib/canvas/wallRenderer.ts
// Tactical Wall & Portal Renderer with Interactive Door Toggles
// Solid wall: solid slate/black line
// Window: cyan translucent double-line (blocks movement, passes vision rays)
// Closed Door: thick wood-brown bar with brass handle glyph
// Open Door: dotted brown swing arc & open door leaf (passes vision and movement)

import type { MapWall } from '../types/maps';

/**
 * Computes shortest distance from point (px, py) to line segment (p1, p2).
 */
export function pointToSegmentDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);

  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;

  return Math.hypot(px - projX, py - projY);
}

/**
 * Renders all walls, windows, and doors with distinct tactical styling.
 */
export function renderWallSegments(
  ctx: CanvasRenderingContext2D,
  walls: MapWall[],
  zoom: number = 1
): void {
  if (!walls || walls.length === 0) return;

  ctx.save();
  ctx.lineCap = 'round';

  for (const w of walls) {
    const { p1, p2, type } = w;

    if (type === 'wall') {
      // Solid Wall: Solid dark slate bar
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = Math.max(3, 4.5 / zoom);
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      // Wall core highlight
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = Math.max(1, 1.5 / zoom);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    } else if (type === 'window') {
      // Window: Cyan translucent double-line (passes vision rays, blocks movement)
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-4) continue;

      const nx = (-dy / len) * 2;
      const ny = (dx / len) * 2;

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
      ctx.lineWidth = Math.max(1, 1.5 / zoom);
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.moveTo(p1.x + nx, p1.y + ny);
      ctx.lineTo(p2.x + nx, p2.y + ny);
      ctx.moveTo(p1.x - nx, p1.y - ny);
      ctx.lineTo(p2.x - nx, p2.y - ny);
      ctx.stroke();
    } else if (type === 'door_closed') {
      // Closed Door: Sturdy wood-brown bar with brass handle glyph
      ctx.strokeStyle = '#92400e';
      ctx.lineWidth = Math.max(4, 5.5 / zoom);
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      // Brass handle glyph at midpoint
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(midX, midY, Math.max(2.5, 3 / zoom), 0, Math.PI * 2);
      ctx.fill();
    } else if (type === 'door_open') {
      // Open Door: Dotted brown portal threshold & perpendicular swung door leaf
      ctx.strokeStyle = 'rgba(180, 83, 9, 0.6)';
      ctx.lineWidth = Math.max(2, 2.5 / zoom);
      ctx.setLineDash([4, 4]);

      // Dotted threshold
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      // Swung open leaf from p1
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy);
      if (len > 0) {
        const leafX = p1.x - dy * 0.8;
        const leafY = p1.y + dx * 0.8;

        ctx.strokeStyle = '#92400e';
        ctx.lineWidth = Math.max(3, 3.5 / zoom);
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(leafX, leafY);
        ctx.stroke();
      }
    }
  }

  ctx.restore();
}

/**
 * Interactive Door Click Handler:
 * Toggles a door between 'door_closed' and 'door_open' upon user click.
 */
export function handleDoorClick(
  clickX: number,
  clickY: number,
  walls: MapWall[],
  hitRadiusPx: number = 14
): { toggledWall: MapWall | null; updatedWalls: MapWall[] } {
  let nearestDoorIndex = -1;
  let nearestDist = hitRadiusPx;

  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    if (w.type !== 'door_closed' && w.type !== 'door_open') continue;

    const dist = pointToSegmentDistance(clickX, clickY, w.p1.x, w.p1.y, w.p2.x, w.p2.y);
    if (dist <= nearestDist) {
      nearestDist = dist;
      nearestDoorIndex = i;
    }
  }

  if (nearestDoorIndex === -1) {
    return { toggledWall: null, updatedWalls: walls };
  }

  const updatedWalls = [...walls];
  const target = { ...updatedWalls[nearestDoorIndex] };
  target.type = target.type === 'door_closed' ? 'door_open' : 'door_closed';
  updatedWalls[nearestDoorIndex] = target;

  return {
    toggledWall: target,
    updatedWalls,
  };
}
