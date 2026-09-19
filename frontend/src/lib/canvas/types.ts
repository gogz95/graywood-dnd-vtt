export interface Token {
  id: string;
  x: number;
  y: number;
  radius: number;
  sightRadius: number;
  darkvisionRadius: number;
  isOrbSealed: boolean;
  textureUrl?: string;
  name?: string;
  tint?: number;
}

export interface Wall {
  p1: [number, number];
  p2: [number, number];
  blocksVision: boolean;
  blocksMovement: boolean;
  isDoor: boolean;
  isOpen: boolean;
}

export interface MovementCollisionResult {
  collides: boolean;
  hitWall: Wall | null;
  intersectionPoint: [number, number] | null;
}
