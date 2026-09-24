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
