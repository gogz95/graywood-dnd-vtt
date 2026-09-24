// dungeonScrawlParser.ts — Standalone native parser for Dungeon Scrawl (.ds JSON) exports
// Extracts grid settings, floor geometry, 2D wall colliders, and interactive door obstructions.

export interface WallSegment {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness?: number;
  color?: string;
}

export type DoorState = 'OPEN' | 'CLOSED' | 'LOCKED';

export interface DoorPrimitive {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  state: DoorState;
  width?: number;
  name?: string;
  doorType?: 'STANDARD' | 'SECRET' | 'PORTCULLIS';
  portalType?: 'door' | 'secret' | 'window';
  portalState?: 'open' | 'closed' | 'locked';
  type?: string;
}

export interface FloorPolygon {
  id: string;
  points: Array<{ x: number; y: number }>;
  fillColor?: string;
}

export interface DungeonScrawlParsedMap {
  name: string;
  gridSize: number; // pixels per cell in target workstation
  sourceCellSize: number; // original pixels per cell from file
  walls: WallSegment[];
  doors: DoorPrimitive[];
  floors: FloorPolygon[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

/**
 * Parses a raw Dungeon Scrawl JSON export or .ds file content.
 */
export function parseDungeonScrawl(rawJson: string | Record<string, unknown>, targetGridSize = 60): DungeonScrawlParsedMap {
  const data = typeof rawJson === 'string' ? JSON.parse(rawJson) as Record<string, unknown> : rawJson;

  let name = 'Dungeon Scrawl Map';
  let sourceCellSize = 70; // Common default in Dungeon Scrawl exports
  const walls: WallSegment[] = [];
  const doors: DoorPrimitive[] = [];
  const floors: FloorPolygon[] = [];

  // 1. Check for Universal VTT / Dungeon Scrawl UVTT format
  if (data.resolution && typeof data.resolution === 'object') {
    const res = data.resolution as { pixels_per_grid?: number; map_size?: { x: number; y: number } };
    if (res.pixels_per_grid) sourceCellSize = res.pixels_per_grid;
  } else if (data.grid && typeof data.grid === 'object') {
    const grid = data.grid as { cellWidth?: number; size?: number; pixelsPerGrid?: number };
    sourceCellSize = grid.cellWidth || grid.size || grid.pixelsPerGrid || 70;
  }

  // 2. Extract Line of Sight (LOS) Walls if in UVTT / standard format
  if (Array.isArray(data.line_of_sight)) {
    let segIdx = 0;
    for (const poly of data.line_of_sight) {
      if (Array.isArray(poly) && poly.length >= 2) {
        for (let i = 0; i < poly.length - 1; i++) {
          const p1 = poly[i] as { x: number; y: number };
          const p2 = poly[i + 1] as { x: number; y: number };
          if (p1 && p2 && typeof p1.x === 'number' && typeof p2.x === 'number') {
            walls.push({
              id: `ds-wall-${segIdx++}`,
              x1: p1.x,
              y1: p1.y,
              x2: p2.x,
              y2: p2.y,
            });
          }
        }
      }
    }
  }

  // 3. Extract Portals / Doors if in UVTT format
  if (Array.isArray(data.portals)) {
    let doorIdx = 0;
    for (const portal of data.portals) {
      const p = portal as {
        position?: { x: number; y: number };
        bounds?: Array<{ x: number; y: number }>;
        closed?: boolean;
      };
      if (Array.isArray(p.bounds) && p.bounds.length >= 2) {
        const p1 = p.bounds[0];
        const p2 = p.bounds[1];
        doors.push({
          id: `ds-door-${doorIdx++}`,
          x1: p1.x,
          y1: p1.y,
          x2: p2.x,
          y2: p2.y,
          state: p.closed !== false ? 'CLOSED' : 'OPEN',
        });
      } else if (p.position) {
        // Fallback: create a perpendicular 1-grid-unit door marker
        const half = sourceCellSize / 2;
        doors.push({
          id: `ds-door-${doorIdx++}`,
          x1: p.position.x - half,
          y1: p.position.y,
          x2: p.position.x + half,
          y2: p.position.y,
          state: p.closed !== false ? 'CLOSED' : 'OPEN',
        });
      }
    }
  }

  // 4. Native Dungeon Scrawl Layer Hierarchy (.ds structure)
  // Structure usually wraps in { state: { document: { data: { layers: [...] } } } } or { data: { layers: [...] } }
  const docData = (
    (data.state as { document?: { data?: Record<string, unknown> } })?.document?.data ||
    (data.data as Record<string, unknown>) ||
    data
  ) as Record<string, unknown>;

  if (Array.isArray(docData.layers)) {
    let layerSegIdx = 0;
    let layerDoorIdx = 0;

    for (const layer of docData.layers) {
      const l = layer as {
        name?: string;
        type?: string;
        walls?: Array<{ points?: number[]; vertices?: Array<{ x: number; y: number }> }>;
        lines?: Array<{ points?: number[]; vertices?: Array<{ x: number; y: number }> }>;
        shapes?: Array<{ type?: string; points?: number[]; vertices?: Array<{ x: number; y: number }>; state?: string }>;
        objects?: Array<{ type?: string; x?: number; y?: number; width?: number; state?: string; angle?: number }>;
      };

      if (l.name && !name.includes(l.name)) {
        name = l.name;
      }

      // Parse walls from layer shapes or lines
      const lineCollections = [...(l.walls || []), ...(l.lines || [])];
      for (const line of lineCollections) {
        if (Array.isArray(line.points) && line.points.length >= 4) {
          for (let i = 0; i < line.points.length - 2; i += 2) {
            walls.push({
              id: `ds-layer-wall-${layerSegIdx++}`,
              x1: line.points[i],
              y1: line.points[i + 1],
              x2: line.points[i + 2],
              y2: line.points[i + 3],
            });
          }
        } else if (Array.isArray(line.vertices) && line.vertices.length >= 2) {
          for (let i = 0; i < line.vertices.length - 1; i++) {
            walls.push({
              id: `ds-layer-wall-${layerSegIdx++}`,
              x1: line.vertices[i].x,
              y1: line.vertices[i].y,
              x2: line.vertices[i + 1].x,
              y2: line.vertices[i + 1].y,
            });
          }
        }
      }

      // Parse doors and objects
      const shapeObjects = [...(l.shapes || []), ...(l.objects || [])] as Array<Record<string, unknown>>;
      for (const rawObj of shapeObjects) {
        const objType = typeof rawObj.type === 'string' ? rawObj.type : '';
        if (objType === 'door' || objType === 'portal') {
          const points = rawObj.points;
          const objState = rawObj.state === 'open' ? 'OPEN' : 'CLOSED';
          if (Array.isArray(points) && points.length >= 4) {
            doors.push({
              id: `ds-layer-door-${layerDoorIdx++}`,
              x1: Number(points[0]),
              y1: Number(points[1]),
              x2: Number(points[2]),
              y2: Number(points[3]),
              state: objState,
            });
          } else if (typeof rawObj.x === 'number' && typeof rawObj.y === 'number') {
            const w = typeof rawObj.width === 'number' ? rawObj.width : sourceCellSize;
            const half = w / 2;
            const angle = typeof rawObj.angle === 'number' ? rawObj.angle * (Math.PI / 180) : 0;
            const dx = Math.cos(angle) * half;
            const dy = Math.sin(angle) * half;
            doors.push({
              id: `ds-layer-door-${layerDoorIdx++}`,
              x1: rawObj.x - dx,
              y1: rawObj.y - dy,
              x2: rawObj.x + dx,
              y2: rawObj.y + dy,
              state: objState,
              width: w,
            });
          }
        }
      }
    }
  }

  // 5. Compute Bounding Box
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const w of walls) {
    minX = Math.min(minX, w.x1, w.x2);
    minY = Math.min(minY, w.y1, w.y2);
    maxX = Math.max(maxX, w.x1, w.x2);
    maxY = Math.max(maxY, w.y1, w.y2);
  }

  for (const d of doors) {
    minX = Math.min(minX, d.x1, d.x2);
    minY = Math.min(minY, d.y1, d.y2);
    maxX = Math.max(maxX, d.x1, d.x2);
    maxY = Math.max(maxY, d.y1, d.y2);
  }

  if (minX === Infinity) {
    minX = 0; minY = 0; maxX = 1000; maxY = 1000;
  }

  // 6. Scale Normalization to Workstation Grid Size
  const scale = sourceCellSize > 0 ? targetGridSize / sourceCellSize : 1.0;
  const padding = targetGridSize; // 1 cell padding

  const normalizedWalls = walls.map(w => ({
    ...w,
    x1: (w.x1 - minX) * scale + padding,
    y1: (w.y1 - minY) * scale + padding,
    x2: (w.x2 - minX) * scale + padding,
    y2: (w.y2 - minY) * scale + padding,
  }));

  const normalizedDoors = doors.map(d => ({
    ...d,
    x1: (d.x1 - minX) * scale + padding,
    y1: (d.y1 - minY) * scale + padding,
    x2: (d.x2 - minX) * scale + padding,
    y2: (d.y2 - minY) * scale + padding,
  }));

  const normBounds = {
    minX: padding,
    minY: padding,
    maxX: (maxX - minX) * scale + padding * 2,
    maxY: (maxY - minY) * scale + padding * 2,
  };

  return {
    name,
    gridSize: targetGridSize,
    sourceCellSize,
    walls: normalizedWalls,
    doors: normalizedDoors,
    floors,
    bounds: normBounds,
  };
}

/**
 * Toggles the state of a door between OPEN and CLOSED.
 */
export function toggleDoorState(doors: DoorPrimitive[], doorId: string): DoorPrimitive[] {
  return doors.map(d => {
    if (d.id === doorId) {
      return { ...d, state: d.state === 'OPEN' ? 'CLOSED' : 'OPEN' };
    }
    return d;
  });
}

/**
 * Tests if mouse click coordinates (px, py) are within hit distance of a door.
 */
export function hitTestDoor(doors: DoorPrimitive[], px: number, py: number, hitRadius = 18): DoorPrimitive | null {
  for (const d of doors) {
    const midX = (d.x1 + d.x2) / 2;
    const midY = (d.y1 + d.y2) / 2;
    const distSq = (px - midX) ** 2 + (py - midY) ** 2;
    if (distSq <= hitRadius ** 2) {
      return d;
    }
  }
  return null;
}

/**
 * Returns raycast-blocking segments (all walls + closed doors).
 */
export function getActiveOccluders(walls: WallSegment[], doors: DoorPrimitive[]): Array<{ x1: number; y1: number; x2: number; y2: number; id: string }> {
  const occluders: Array<{ x1: number; y1: number; x2: number; y2: number; id: string }> = [...walls];
  for (const d of doors) {
    if (d.state === 'CLOSED') {
      occluders.push({
        id: `door-occluder-${d.id}`,
        x1: d.x1,
        y1: d.y1,
        x2: d.x2,
        y2: d.y2,
      });
    }
  }
  return occluders;
}

export interface GenericTacticalWall {
  p1: [number, number];
  p2: [number, number];
  blocksVision: boolean;
  blocksMovement: boolean;
  isDoor: boolean;
  isOpen: boolean;
}

/**
 * Converts a parsed Dungeon Scrawl map into GenericTacticalWall instances compatible
 * with both PixiJS v8 TacticalCanvas and custom raycast collision engines.
 */
export function convertToTacticalWalls(map: DungeonScrawlParsedMap): GenericTacticalWall[] {
  const result: GenericTacticalWall[] = [];
  for (const w of map.walls) {
    result.push({
      p1: [w.x1, w.y1],
      p2: [w.x2, w.y2],
      blocksVision: true,
      blocksMovement: true,
      isDoor: false,
      isOpen: false,
    });
  }
  for (const d of map.doors) {
    result.push({
      p1: [d.x1, d.y1],
      p2: [d.x2, d.y2],
      blocksVision: d.state === 'CLOSED',
      blocksMovement: d.state === 'CLOSED',
      isDoor: true,
      isOpen: d.state === 'OPEN',
    });
  }
  return result;
}

/**
 * Generates a realistic sample Dungeon Scrawl export JSON structure with walls, corridors, and doors.
 */
export function generateSampleDungeonScrawlJson(): Record<string, unknown> {
  return {
    resolution: { pixels_per_grid: 70 },
    line_of_sight: [
      // Room 1 (Entry Hall)
      [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 240 }, { x: 0, y: 240 }, { x: 0, y: 0 }],
      // East Corridor
      [{ x: 300, y: 90 }, { x: 480, y: 90 }],
      [{ x: 300, y: 150 }, { x: 480, y: 150 }],
      // Room 2 (Armory)
      [{ x: 480, y: 0 }, { x: 750, y: 0 }, { x: 750, y: 240 }, { x: 480, y: 240 }, { x: 480, y: 0 }],
      // South Corridor & Crypt
      [{ x: 120, y: 240 }, { x: 120, y: 400 }],
      [{ x: 180, y: 240 }, { x: 180, y: 400 }],
      [{ x: 60, y: 400 }, { x: 420, y: 400 }, { x: 420, y: 640 }, { x: 60, y: 640 }, { x: 60, y: 400 }]
    ],
    portals: [
      { bounds: [{ x: 300, y: 90 }, { x: 300, y: 150 }], closed: true },
      { bounds: [{ x: 120, y: 240 }, { x: 180, y: 240 }], closed: true }
    ]
  };
}
