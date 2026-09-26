// src/lib/types/drawing.ts
// Freehand Drawing, Vector Shape, and Text Annotation Schemas for Battlemap Canvas

export type DrawingLayerType = 'dm' | 'shared';

export type DrawingTool =
  | 'none'
  | 'select'
  | 'freehand'
  | 'line'
  | 'arrow'
  | 'rectangle'
  | 'circle'
  | 'text'
  | 'eraser';

export interface BaseDrawing {
  id: string;
  layer: DrawingLayerType;
  strokeColor: string;
  strokeWidth: number;
  alpha: number;
  createdAt?: number;
}

export interface FreehandDrawing extends BaseDrawing {
  type: 'freehand';
  points: number[]; // Flattened sequence: [x0, y0, x1, y1, ...]
}

export interface ShapeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
}

export interface ShapeDrawing extends BaseDrawing {
  type: 'rectangle' | 'circle' | 'arrow' | 'line';
  bounds: ShapeBounds;
  fillColor?: string;
}

export interface TextDrawing extends BaseDrawing {
  type: 'text';
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
}

export type DrawingElement = FreehandDrawing | ShapeDrawing | TextDrawing;
