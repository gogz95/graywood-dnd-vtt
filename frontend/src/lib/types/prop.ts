// prop.ts — Canvas Prop & Tile Schema for Graywood VTT Battlemap Layer

export type PropLayer = 'ground' | 'overhead';

export interface CanvasProp {
  id: string;
  imageUrl: string;
  x: number;          // world-space center X (pixels)
  y: number;          // world-space center Y (pixels)
  width: number;      // display width in pixels
  height: number;     // display height in pixels
  rotation: number;   // radians
  flippedX: boolean;
  flippedY: boolean;
  zIndex: number;
  isLocked: boolean;  // locked props pass pointer events through
  layer: PropLayer;   // 'ground' = below tokens, 'overhead' = above tokens
}
