// watabouParser.ts — Vector parcel interpreter for Watabou Medieval Fantasy City Generator GeoJSON exports
// Parses district wards, building lots, roads, walls, and provides point-in-polygon hit-testing with entity assignment.

export type SettlementEntityType =
  | 'Tavern'
  | 'Temple'
  | 'Smithy'
  | 'Apothecary'
  | 'Vault'
  | 'Guildhall'
  | 'Barracks'
  | 'Market'
  | 'Residence';

export interface BuildingParcel {
  id: string;
  points: Array<{ x: number; y: number }>;
  districtName?: string;
  entityType?: SettlementEntityType;
  customName?: string;
  notes?: string;
  npcContact?: string;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface DistrictPolygon {
  id: string;
  name: string;
  color: string;
  points: Array<{ x: number; y: number }>;
}

export interface RoadLine {
  id: string;
  points: Array<{ x: number; y: number }>;
  width: number;
}

export interface DefensiveWall {
  id: string;
  points: Array<{ x: number; y: number }>;
}

export interface WatabouCityMap {
  name: string;
  districts: DistrictPolygon[];
  buildings: BuildingParcel[];
  roads: RoadLine[];
  walls: DefensiveWall[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

const DISTRICT_COLORS: Record<string, string> = {
  Craftsmen: '#3b82f6',
  Merchant: '#10b981',
  Market: '#f59e0b',
  Castle: '#8b5cf6',
  Temple: '#ec4899',
  Harbor: '#06b6d4',
  Slums: '#78716c',
  Military: '#ef4444',
  Gate: '#64748b',
  Residential: '#059669',
  Default: '#6366f1',
};

/**
 * Standard Ray-casting Point-in-Polygon test.
 */
export function pointInPolygon(px: number, py: number, polygon: Array<{ x: number; y: number }>): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect = ((yi > py) !== (yj > py)) &&
      (px < (xj - xi) * (py - yi) / (yj - yi + 0.000000001) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Parses Watabou GeoJSON or JSON export format.
 */
export function parseWatabouGeoJson(raw: string | Record<string, unknown>, targetSpan = 2000): WatabouCityMap {
  const geojson = typeof raw === 'string' ? JSON.parse(raw) as Record<string, unknown> : raw;

  let name = 'Medieval Settlement';
  const rawDistricts: DistrictPolygon[] = [];
  const rawBuildings: BuildingParcel[] = [];
  const rawRoads: RoadLine[] = [];
  const rawWalls: DefensiveWall[] = [];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  function updateBounds(x: number, y: number) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  // FeatureCollection handling
  const features = Array.isArray(geojson.features)
    ? geojson.features
    : Array.isArray(geojson.data)
      ? geojson.data
      : [];

  let bldgIdx = 0;
  let roadIdx = 0;
  let wallIdx = 0;
  let distIdx = 0;

  for (const feat of features as Array<{ properties?: Record<string, unknown>; geometry?: { type: string; coordinates: unknown } }>) {
    const props = feat.properties || {};
    const geom = feat.geometry;
    if (!geom || !geom.coordinates) continue;

    const kind = String(props.type || props.kind || props.class || '').toLowerCase();

    // 1. Buildings
    if (kind.includes('building') || kind.includes('lot') || kind.includes('house') || (!kind && geom.type === 'Polygon')) {
      const coords = geom.type === 'Polygon'
        ? (geom.coordinates as number[][][])[0]
        : (geom.coordinates as number[][][][])[0]?.[0];

      if (Array.isArray(coords) && coords.length >= 3) {
        let bMinX = Infinity;
        let bMinY = Infinity;
        let bMaxX = -Infinity;
        let bMaxY = -Infinity;

        const points = coords.map((c: number[]) => {
          const x = c[0];
          const y = c[1];
          updateBounds(x, y);
          bMinX = Math.min(bMinX, x);
          bMinY = Math.min(bMinY, y);
          bMaxX = Math.max(bMaxX, x);
          bMaxY = Math.max(bMaxY, y);
          return { x, y };
        });

        rawBuildings.push({
          id: `watabou-bldg-${bldgIdx++}`,
          points,
          districtName: typeof props.ward === 'string' ? props.ward : undefined,
          bounds: { minX: bMinX, minY: bMinY, maxX: bMaxX, maxY: bMaxY },
        });
      }
    }
    // 2. Wards / Districts
    else if (kind.includes('ward') || kind.includes('district')) {
      const coords = geom.type === 'Polygon'
        ? (geom.coordinates as number[][][])[0]
        : (geom.coordinates as number[][][][])[0]?.[0];

      if (Array.isArray(coords) && coords.length >= 3) {
        const dName = String(props.name || props.ward || `District ${distIdx + 1}`);
        const color = DISTRICT_COLORS[dName] || DISTRICT_COLORS.Default;
        const points = coords.map((c: number[]) => {
          updateBounds(c[0], c[1]);
          return { x: c[0], y: c[1] };
        });

        rawDistricts.push({
          id: `watabou-dist-${distIdx++}`,
          name: dName,
          color,
          points,
        });
      }
    }
    // 3. Defensive Walls
    else if (kind.includes('wall')) {
      const coords = (geom.type === 'LineString' ? geom.coordinates : (geom.coordinates as number[][][])[0]) as number[][];
      if (Array.isArray(coords)) {
        const points = coords.map((c: number[]) => {
          updateBounds(c[0], c[1]);
          return { x: c[0], y: c[1] };
        });
        rawWalls.push({ id: `watabou-wall-${wallIdx++}`, points });
      }
    }
    // 4. Roads / Streets
    else if (kind.includes('road') || kind.includes('street') || geom.type === 'LineString') {
      const coords = (geom.type === 'LineString' ? geom.coordinates : (geom.coordinates as number[][][])[0]) as number[][];
      if (Array.isArray(coords)) {
        const points = coords.map((c: number[]) => {
          updateBounds(c[0], c[1]);
          return { x: c[0], y: c[1] };
        });
        rawRoads.push({
          id: `watabou-road-${roadIdx++}`,
          points,
          width: kind.includes('main') ? 8 : 4,
        });
      }
    }
  }

  // Handle empty bounds fallback
  if (minX === Infinity) {
    minX = -500; minY = -500; maxX = 500; maxY = 500;
  }

  const rawWidth = Math.max(1, maxX - minX);
  const rawHeight = Math.max(1, maxY - minY);
  const maxSpan = Math.max(rawWidth, rawHeight);
  const scale = targetSpan / maxSpan;
  const padding = 100;

  function transformX(x: number): number {
    return (x - minX) * scale + padding;
  }
  function transformY(y: number): number {
    return (y - minY) * scale + padding;
  }

  // Scale and translate all geometries
  const scaledBuildings: BuildingParcel[] = rawBuildings.map(b => ({
    ...b,
    points: b.points.map(p => ({ x: transformX(p.x), y: transformY(p.y) })),
    bounds: {
      minX: transformX(b.bounds.minX),
      minY: transformY(b.bounds.minY),
      maxX: transformX(b.bounds.maxX),
      maxY: transformY(b.bounds.maxY),
    },
  }));

  const scaledDistricts: DistrictPolygon[] = rawDistricts.map(d => ({
    ...d,
    points: d.points.map(p => ({ x: transformX(p.x), y: transformY(p.y) })),
  }));

  const scaledRoads: RoadLine[] = rawRoads.map(r => ({
    ...r,
    points: r.points.map(p => ({ x: transformX(p.x), y: transformY(p.y) })),
  }));

  const scaledWalls: DefensiveWall[] = rawWalls.map(w => ({
    ...w,
    points: w.points.map(p => ({ x: transformX(p.x), y: transformY(p.y) })),
  }));

  return {
    name,
    districts: scaledDistricts,
    buildings: scaledBuildings,
    roads: scaledRoads,
    walls: scaledWalls,
    bounds: {
      minX: padding,
      minY: padding,
      maxX: rawWidth * scale + padding * 2,
      maxY: rawHeight * scale + padding * 2,
    },
  };
}

/**
 * Searches for a building parcel that contains mouse coordinate (px, py).
 */
export function hitTestBuildingParcel(buildings: BuildingParcel[], px: number, py: number): BuildingParcel | null {
  for (const b of buildings) {
    // Fast AABB bounding box check
    if (px < b.bounds.minX || px > b.bounds.maxX || py < b.bounds.minY || py > b.bounds.maxY) {
      continue;
    }
    // Precise ray-casting point-in-polygon check
    if (pointInPolygon(px, py, b.points)) {
      return b;
    }
  }
  return null;
}

/**
 * Assigns an entity type and custom details to a building parcel.
 */
export function assignParcelEntity(
  buildings: BuildingParcel[],
  parcelId: string,
  data: { entityType: SettlementEntityType; customName?: string; notes?: string; npcContact?: string }
): BuildingParcel[] {
  return buildings.map(b => {
    if (b.id === parcelId) {
      return {
        ...b,
        entityType: data.entityType,
        customName: data.customName || b.customName,
        notes: data.notes || b.notes,
        npcContact: data.npcContact || b.npcContact,
      };
    }
    return b;
  });
}

/**
 * Generates a realistic sample Watabou GeoJSON structure with districts, defensive walls, roads, and lots.
 */
export function generateSampleWatabouGeoJson(): Record<string, unknown> {
  const sampleFeatures: Array<Record<string, unknown>> = [
    // Defensive wall
    {
      properties: { type: 'wall' },
      geometry: { type: 'LineString', coordinates: [[-350, -250], [350, -250], [350, 250], [-350, 250], [-350, -250]] },
    },
    // Roads
    {
      properties: { type: 'road', kind: 'main' },
      geometry: { type: 'LineString', coordinates: [[-350, 0], [350, 0]] },
    },
    // Districts
    {
      properties: { type: 'district', ward: 'Market' },
      geometry: { type: 'Polygon', coordinates: [[[-180, -180], [0, -180], [0, 0], [-180, 0], [-180, -180]]] },
    },
    {
      properties: { type: 'district', ward: 'Temple' },
      geometry: { type: 'Polygon', coordinates: [[[0, -180], [180, -180], [180, 0], [0, 0], [0, -180]]] },
    },
    {
      properties: { type: 'district', ward: 'Castle' },
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [180, 0], [180, 180], [0, 180], [0, 0]]] },
    },
    // Building Lots
    {
      properties: { type: 'building', ward: 'Market' },
      geometry: { type: 'Polygon', coordinates: [[[-160, -160], [-120, -160], [-120, -120], [-160, -120], [-160, -160]]] },
    },
    {
      properties: { type: 'building', ward: 'Market' },
      geometry: { type: 'Polygon', coordinates: [[[-100, -160], [-40, -160], [-40, -120], [-100, -120], [-100, -160]]] },
    },
    {
      properties: { type: 'building', ward: 'Temple' },
      geometry: { type: 'Polygon', coordinates: [[[40, -160], [100, -160], [100, -110], [40, -110], [40, -160]]] },
    },
    {
      properties: { type: 'building', ward: 'Castle' },
      geometry: { type: 'Polygon', coordinates: [[[50, 50], [150, 50], [150, 150], [50, 150], [50, 50]]] },
    },
  ];

  return {
    type: 'FeatureCollection',
    name: 'Watabou Settlement Sample',
    features: sampleFeatures,
  };
}
