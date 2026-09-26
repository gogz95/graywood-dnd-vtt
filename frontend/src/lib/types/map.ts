// src/lib/types/map.ts
// Multi-State Portal (Door/Window/Secret Door) & Map Geometry Types

export type PortalType = 'door' | 'secret' | 'window';
export type PortalState = 'open' | 'closed' | 'locked';

export interface PortalDefinition {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  portalType: PortalType;
  portalState: PortalState;
  bounds?: { minX: number; minY: number; maxX: number; maxY: number };
}

export type OcclusionMode = 'fade' | 'radial';

export interface OverheadTile {
  id: string;
  imageUrl: string;
  bounds: { x: number; y: number; width: number; height: number };
  elevationThreshold: number; // elevation in feet required to see over the roof, default 10
  occlusionAlpha: number; // opacity when a token is underneath, default 0.2
  occlusionMode: OcclusionMode;
  name?: string;
}

