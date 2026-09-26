// src/lib/components/canvas/drawingRenderHelper.ts
// Shared Rendering & Hit-Testing Utilities for Freehand Drawings, Vector Shapes, and Text Annotations

import type { DrawingElement } from '../../types/drawing';
import { Graphics, Container, Text } from 'pixi.js';

export function parseHexColor(hexStr: string, defaultHex = 0xef4444): number {
  if (!hexStr || hexStr === 'transparent') return defaultHex;
  const clean = hexStr.replace('#', '');
  const num = parseInt(clean, 16);
  return isNaN(num) ? defaultHex : num;
}

/**
 * Render a single drawing element into PixiJS v8 Graphics and Text containers
 */
export function renderDrawingOnPixi(
  graphics: Graphics,
  textContainer: Container,
  d: DrawingElement
) {
  const strokeColor = parseHexColor(d.strokeColor);
  const strokeWidth = d.strokeWidth || 4;
  const alpha = d.alpha ?? 1.0;

  if (d.type === 'freehand') {
    if (!d.points || d.points.length < 4) return;
    graphics.moveTo(d.points[0], d.points[1]);
    for (let i = 2; i < d.points.length; i += 2) {
      graphics.lineTo(d.points[i], d.points[i + 1]);
    }
    graphics.stroke({
      color: strokeColor,
      width: strokeWidth,
      alpha,
      cap: 'round',
      join: 'round',
    });
  } else if (d.type === 'rectangle') {
    const { x, y, width, height } = d.bounds;
    if (d.fillColor && d.fillColor !== 'transparent') {
      graphics.rect(x, y, width, height).fill({
        color: parseHexColor(d.fillColor),
        alpha: Math.min(alpha * 0.4, 0.8),
      });
    }
    graphics.rect(x, y, width, height).stroke({
      color: strokeColor,
      width: strokeWidth,
      alpha,
      join: 'round',
    });
  } else if (d.type === 'circle') {
    const { x, y, width, height } = d.bounds;
    const cx = x + width / 2;
    const cy = y + height / 2;
    const radius = Math.max(Math.abs(width), Math.abs(height)) / 2;
    if (d.fillColor && d.fillColor !== 'transparent') {
      graphics.circle(cx, cy, radius).fill({
        color: parseHexColor(d.fillColor),
        alpha: Math.min(alpha * 0.4, 0.8),
      });
    }
    graphics.circle(cx, cy, radius).stroke({
      color: strokeColor,
      width: strokeWidth,
      alpha,
    });
  } else if (d.type === 'line') {
    const { startX = 0, startY = 0, endX = 0, endY = 0 } = d.bounds;
    graphics.moveTo(startX, startY);
    graphics.lineTo(endX, endY);
    graphics.stroke({
      color: strokeColor,
      width: strokeWidth,
      alpha,
      cap: 'round',
    });
  } else if (d.type === 'arrow') {
    const { startX = 0, startY = 0, endX = 0, endY = 0 } = d.bounds;
    graphics.moveTo(startX, startY);
    graphics.lineTo(endX, endY);
    graphics.stroke({
      color: strokeColor,
      width: strokeWidth,
      alpha,
      cap: 'round',
    });

    // Draw arrowhead chevron
    const angle = Math.atan2(endY - startY, endX - startX);
    const headLen = Math.max(strokeWidth * 3.5, 14);
    const arrowAngle = Math.PI / 6;

    const leftX = endX - headLen * Math.cos(angle - arrowAngle);
    const leftY = endY - headLen * Math.sin(angle - arrowAngle);
    const rightX = endX - headLen * Math.cos(angle + arrowAngle);
    const rightY = endY - headLen * Math.sin(angle + arrowAngle);

    graphics.moveTo(leftX, leftY);
    graphics.lineTo(endX, endY);
    graphics.lineTo(rightX, rightY);
    graphics.stroke({
      color: strokeColor,
      width: strokeWidth,
      alpha,
      cap: 'round',
      join: 'round',
    });
  } else if (d.type === 'text') {
    const pixiText = new Text({
      text: d.text || '',
      style: {
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: d.fontSize || 18,
        fontWeight: 'bold',
        fill: parseHexColor(d.color || '#ffffff'),
        stroke: { color: 0x000000, width: 3 },
      },
    });
    pixiText.position.set(d.x, d.y);
    textContainer.addChild(pixiText);
  }
}

/**
 * Render shared drawings onto an HTML5 2D Canvas (e.g. for /projector view)
 */
export function renderSharedDrawingsOnCanvas2D(
  ctx: CanvasRenderingContext2D,
  drawings: DrawingElement[],
  _zoom = 1.0
) {
  if (!drawings || drawings.length === 0) return;

  for (const d of drawings) {
    if (d.layer !== 'shared') continue;

    ctx.save();
    ctx.globalAlpha = d.alpha ?? 1.0;
    ctx.strokeStyle = d.strokeColor || '#ef4444';
    ctx.lineWidth = d.strokeWidth || 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (d.type === 'freehand') {
      if (!d.points || d.points.length < 4) {
        ctx.restore();
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(d.points[0], d.points[1]);
      for (let i = 2; i < d.points.length; i += 2) {
        ctx.lineTo(d.points[i], d.points[i + 1]);
      }
      ctx.stroke();
    } else if (d.type === 'rectangle') {
      const { x, y, width, height } = d.bounds;
      if (d.fillColor && d.fillColor !== 'transparent') {
        ctx.fillStyle = d.fillColor;
        ctx.globalAlpha = Math.min((d.alpha ?? 1.0) * 0.4, 0.8);
        ctx.fillRect(x, y, width, height);
        ctx.globalAlpha = d.alpha ?? 1.0;
      }
      ctx.strokeRect(x, y, width, height);
    } else if (d.type === 'circle') {
      const { x, y, width, height } = d.bounds;
      const cx = x + width / 2;
      const cy = y + height / 2;
      const radius = Math.max(Math.abs(width), Math.abs(height)) / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      if (d.fillColor && d.fillColor !== 'transparent') {
        ctx.fillStyle = d.fillColor;
        ctx.globalAlpha = Math.min((d.alpha ?? 1.0) * 0.4, 0.8);
        ctx.fill();
        ctx.globalAlpha = d.alpha ?? 1.0;
      }
      ctx.stroke();
    } else if (d.type === 'line') {
      const { startX = 0, startY = 0, endX = 0, endY = 0 } = d.bounds;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    } else if (d.type === 'arrow') {
      const { startX = 0, startY = 0, endX = 0, endY = 0 } = d.bounds;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      const angle = Math.atan2(endY - startY, endX - startX);
      const headLen = Math.max((d.strokeWidth || 4) * 3.5, 14);
      const arrowAngle = Math.PI / 6;

      ctx.beginPath();
      ctx.moveTo(endX - headLen * Math.cos(angle - arrowAngle), endY - headLen * Math.sin(angle - arrowAngle));
      ctx.lineTo(endX, endY);
      ctx.lineTo(endX - headLen * Math.cos(angle + arrowAngle), endY - headLen * Math.sin(angle + arrowAngle));
      ctx.stroke();
    } else if (d.type === 'text') {
      ctx.font = `bold ${d.fontSize || 18}px system-ui, -apple-system, sans-serif`;
      ctx.fillStyle = d.color || '#ffffff';
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 4;
      ctx.fillText(d.text, d.x, d.y + (d.fontSize || 18));
    }

    ctx.restore();
  }
}

/**
 * Distance from point (px, py) to line segment (x1, y1) -> (x2, y2)
 */
function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

/**
 * Hit-testing helper for the eraser tool: returns true if (worldX, worldY) touches drawing
 */
export function isPointNearDrawing(
  worldX: number,
  worldY: number,
  d: DrawingElement,
  hitThreshold = 12
): boolean {
  const threshold = Math.max(hitThreshold, (d.strokeWidth || 4) / 2 + 6);

  if (d.type === 'freehand') {
    if (!d.points || d.points.length < 4) return false;
    for (let i = 0; i < d.points.length - 2; i += 2) {
      const dist = distToSegment(
        worldX,
        worldY,
        d.points[i],
        d.points[i + 1],
        d.points[i + 2],
        d.points[i + 3]
      );
      if (dist <= threshold) return true;
    }
    return false;
  }

  if (d.type === 'line' || d.type === 'arrow') {
    const { startX = 0, startY = 0, endX = 0, endY = 0 } = d.bounds;
    return distToSegment(worldX, worldY, startX, startY, endX, endY) <= threshold;
  }

  if (d.type === 'rectangle') {
    const { x, y, width, height } = d.bounds;
    const minX = Math.min(x, x + width);
    const maxX = Math.max(x, x + width);
    const minY = Math.min(y, y + height);
    const maxY = Math.max(y, y + height);

    // Inside box or near border
    const inside = worldX >= minX && worldX <= maxX && worldY >= minY && worldY <= maxY;
    if (inside) return true;

    // Check border distance
    const dLeft = distToSegment(worldX, worldY, minX, minY, minX, maxY);
    const dRight = distToSegment(worldX, worldY, maxX, minY, maxX, maxY);
    const dTop = distToSegment(worldX, worldY, minX, minY, maxX, minY);
    const dBottom = distToSegment(worldX, worldY, minX, maxY, maxX, maxY);
    return Math.min(dLeft, dRight, dTop, dBottom) <= threshold;
  }

  if (d.type === 'circle') {
    const { x, y, width, height } = d.bounds;
    const cx = x + width / 2;
    const cy = y + height / 2;
    const radius = Math.max(Math.abs(width), Math.abs(height)) / 2;
    const distToCenter = Math.hypot(worldX - cx, worldY - cy);
    return Math.abs(distToCenter - radius) <= threshold || distToCenter <= radius;
  }

  if (d.type === 'text') {
    const fontSize = d.fontSize || 18;
    const estimatedWidth = (d.text || '').length * fontSize * 0.65;
    const estimatedHeight = fontSize * 1.3;
    return (
      worldX >= d.x - 8 &&
      worldX <= d.x + estimatedWidth + 8 &&
      worldY >= d.y - 8 &&
      worldY <= d.y + estimatedHeight + 8
    );
  }

  return false;
}
