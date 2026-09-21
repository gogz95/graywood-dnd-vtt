// src/lib/types/maps.ts
// Dual-Map Architecture Types: Tactical Battlemaps & Overland World Atlas

export type MapType = 'tactical' | 'atlas';

export interface GridSettings {
  type: 'square' | 'hex-h' | 'hex-v' | 'gridless';
  sizePx: number;
  offsetX: number;
  offsetY: number;
  opacity: number;
  color: string;
}

export interface LightingSettings {
  ambientDarkness: number;
  tintColor: string;
}

export interface FogOfWarData {
  revealedPolygons: Array<Array<{ x: number; y: number }>>;
  concealedPolygons: Array<Array<{ x: number; y: number }>>;
}

export interface MapWall {
  id: string;
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  type: 'wall' | 'door_closed' | 'door_open' | 'window';
}

export interface MapPlacedToken {
  tokenId: string;
  x: number;
  y: number;
  elevationFt: number;
  isVisibleToPlayers: boolean;
}

export type WeatherType = 'clear' | 'rain' | 'snow' | 'fog' | 'ash';

export interface WeatherSettings {
  type: WeatherType;
  intensity: number; // 0.0 to 1.0
}

export type BiomeType = 'dungeon' | 'forest' | 'tavern' | 'coastal' | 'arctic' | 'city';

export interface TacticalBattlemap {
  id: string;
  name: string;
  type: 'tactical';
  createdAt: number;
  updatedAt: number;
  grid: GridSettings;
  lighting: LightingSettings;
  fogOfWar: FogOfWarData;
  walls: MapWall[];
  tokens: MapPlacedToken[];
  textureBlob?: Blob;
  weather?: WeatherSettings;
  biome?: BiomeType;
}

export interface MapPoiPin {
  id: string;
  x: number;
  y: number;
  icon: string;
  label: string;
  description: string;
  linkedTacticalMapId?: string;
  isSecret: boolean;
}

export interface WorldAtlasScale {
  unitsPerPixel: number;
  unitName: 'miles' | 'kilometers' | 'hexes' | 'leagues';
}

export interface WorldAtlasMap {
  id: string;
  name: string;
  type: 'atlas';
  createdAt: number;
  updatedAt: number;
  scale: WorldAtlasScale;
  poiPins: MapPoiPin[];
  vectorLayers?: {
    bordersGeoJson?: any;
    routesGeoJson?: any;
  };
  textureBlob?: Blob;
  biome?: BiomeType;
}
