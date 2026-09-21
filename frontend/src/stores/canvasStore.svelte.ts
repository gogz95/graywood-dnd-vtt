// canvasStore.svelte.ts — Central reactive battle mat store for DM workstation and projector screen
// Synchronizes tokens, walls, doors, AOE templates, rulers, and viewports across windows/displays via BroadcastChannel.

import type { WallSegment, DoorPrimitive } from '../lib/canvas/parsers/dungeonScrawlParser';
import type { WatabouCityMap } from '../lib/canvas/parsers/watabouParser';

export interface CanvasToken {
  id: string;
  name: string;
  x: number; // grid col (0-indexed)
  y: number; // grid row (0-indexed)
  color: string;
  isPlayer: boolean;
  hp: number;
  maxHp: number;
  isVisible: boolean; // false for DM-hidden monsters
  conditions: string[]; // e.g. ['Blinded', 'Poisoned', 'Concentrating']
  isOrbSealed: boolean; // Aleamos Black Orb temporal amnesia state
  sizeInCells: number; // default 1
  sightRadiusFeet: number; // default 30 (6 cells)
}

export type SpellAoeType = 'circle' | 'cone' | 'cube' | 'line';

export interface SpellAoeTemplate {
  id: string;
  type: SpellAoeType;
  originX: number; // grid col
  originY: number; // grid row
  targetX?: number; // grid col (direction/extent)
  targetY?: number;
  sizeFeet: number; // e.g. 20 for 20ft radius / side
  color: string;
  label: string;
  isPublic: boolean; // if true, visible on /projector
}

export interface RulerMeasurement {
  id: string;
  startX: number; // grid coords
  startY: number;
  endX: number;
  endY: number;
  distanceFeet: number;
  isPublic: boolean;
  color: string;
}

export interface ViewportTransform {
  x: number;
  y: number;
  zoom: number;
}

export interface CanvasStateSnapshot {
  mapImageUrl: string;
  mapWidth?: number;
  mapHeight?: number;
  tokens: CanvasToken[];
  walls: WallSegment[];
  doors: DoorPrimitive[];
  gridSize: number;
  gridOpacity: number;
  gridColor?: string;
  fogExplored: string[];
  aoeTemplates: SpellAoeTemplate[];
  ruler: RulerMeasurement | null;
  dmViewport: ViewportTransform;
  projectorViewport: ViewportTransform;
  dynamicLightingEnabled: boolean;
  wallVisibilityEnabled: boolean;
}

export interface BattleMatState {
  tokens: CanvasToken[];
  walls: WallSegment[];
  doors: DoorPrimitive[];
  cityMap: WatabouCityMap | null;
  mapImageUrl: string;
  mapWidth?: number;
  mapHeight?: number;
  gridSize: number;
  gridOpacity: number;
  gridColor?: string;
  activeTokenId: string | null;
  lockProjectorPan: boolean;
  dmViewport: ViewportTransform;
  projectorViewport: ViewportTransform;
  aoeTemplates: SpellAoeTemplate[];
  ruler: RulerMeasurement | null;
  fogExplored: string[]; // Set serialized as array of 'gx,gy'
  dynamicLightingEnabled: boolean;
  wallVisibilityEnabled: boolean;
}

const STORAGE_KEY = 'vtt_battlemat_state';
const BROADCAST_CHANNEL_NAME = 'dnd_battlemat_sync';

function loadInitialState(): BattleMatState {
  const fallback: BattleMatState = {
    tokens: [],
    walls: [],
    doors: [],
    cityMap: null,
    mapImageUrl: '',
    mapWidth: 0,
    mapHeight: 0,
    gridSize: 60,
    gridOpacity: 0.35,
    gridColor: '#6366f1',
    activeTokenId: null,
    lockProjectorPan: false,
    dmViewport: { x: 120, y: 80, zoom: 1.0 },
    projectorViewport: { x: 120, y: 80, zoom: 1.0 },
    aoeTemplates: [],
    ruler: null,
    fogExplored: [],
    dynamicLightingEnabled: true,
    wallVisibilityEnabled: true,
  };

  if (typeof localStorage === 'undefined') return fallback;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}

class CanvasStoreClass {
  tokens = $state<CanvasToken[]>([]);
  walls = $state<WallSegment[]>([]);
  doors = $state<DoorPrimitive[]>([]);
  cityMap = $state<WatabouCityMap | null>(null);
  mapImageUrl = $state<string>('');
  mapWidth = $state<number>(0);
  mapHeight = $state<number>(0);
  gridSize = $state<number>(60);
  gridOpacity = $state<number>(0.35);
  gridColor = $state<string>('#6366f1');
  activeTokenId = $state<string | null>(null);
  lockProjectorPan = $state<boolean>(false);
  dmViewport = $state<ViewportTransform>({ x: 0, y: 0, zoom: 1 });
  projectorViewport = $state<ViewportTransform>({ x: 0, y: 0, zoom: 1 });
  aoeTemplates = $state<SpellAoeTemplate[]>([]);
  ruler = $state<RulerMeasurement | null>(null);
  fogExplored = $state<string[]>([]);
  dynamicLightingEnabled = $state<boolean>(true);
  wallVisibilityEnabled = $state<boolean>(true);

  private channel: BroadcastChannel | null = null;
  private isBroadcasting = false;

  constructor() {
    const initial = loadInitialState();
    this.tokens = initial.tokens;
    this.walls = initial.walls;
    this.doors = initial.doors;
    this.cityMap = initial.cityMap;
    this.mapImageUrl = initial.mapImageUrl;
    this.gridSize = initial.gridSize;
    this.gridOpacity = initial.gridOpacity;
    this.activeTokenId = initial.activeTokenId;
    this.lockProjectorPan = initial.lockProjectorPan;
    this.dmViewport = initial.dmViewport;
    this.projectorViewport = initial.projectorViewport;
    this.aoeTemplates = initial.aoeTemplates;
    this.ruler = initial.ruler;
    this.fogExplored = initial.fogExplored;
    this.dynamicLightingEnabled = initial.dynamicLightingEnabled;
    this.wallVisibilityEnabled = initial.wallVisibilityEnabled;

    if (typeof window !== 'undefined') {
      if ('BroadcastChannel' in window) {
        this.channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        this.channel.onmessage = (event) => {
          if (!event.data) return;
          this.handleRemoteMessage(event.data);
        };
      }

      window.addEventListener('vtt:black-orb-toggle', ((event: CustomEvent) => {
        if (event.detail?.character_id) {
          this.updateToken(event.detail.character_id, {
            isOrbSealed: Boolean(event.detail.is_orb_sealed),
          });
        }
      }) as EventListener);
    }
  }

  private broadcast(type: string, payload: unknown) {
    if (!this.channel) return;
    this.isBroadcasting = true;
    try {
      this.channel.postMessage({ type, payload, timestamp: Date.now() });
      this.persist();
    } finally {
      this.isBroadcasting = false;
    }
  }

  private persist() {
    if (typeof localStorage === 'undefined') return;
    try {
      const snapshot: BattleMatState = {
        tokens: this.tokens,
        walls: this.walls,
        doors: this.doors,
        cityMap: this.cityMap,
        mapImageUrl: this.mapImageUrl,
        gridSize: this.gridSize,
        gridOpacity: this.gridOpacity,
        activeTokenId: this.activeTokenId,
        lockProjectorPan: this.lockProjectorPan,
        dmViewport: this.dmViewport,
        projectorViewport: this.projectorViewport,
        aoeTemplates: this.aoeTemplates,
        ruler: this.ruler,
        fogExplored: this.fogExplored,
        dynamicLightingEnabled: this.dynamicLightingEnabled,
        wallVisibilityEnabled: this.wallVisibilityEnabled,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Storage quota or error fallback
    }
  }

  private handleRemoteMessage(msg: { type: string; payload: any }) {
    const { type, payload } = msg;

    switch (type) {
      case 'TOKENS_SYNC':
        this.tokens = payload;
        break;
      case 'TOKEN_UPDATE':
        this.tokens = this.tokens.map(t => t.id === payload.id ? { ...t, ...payload } : t);
        break;
      case 'VIEWPORT_DM':
        this.dmViewport = payload;
        if (!this.lockProjectorPan) {
          this.projectorViewport = { ...payload };
        }
        break;
      case 'VIEWPORT_PROJECTOR':
        this.projectorViewport = payload;
        break;
      case 'LOCK_PROJECTOR_PAN':
        this.lockProjectorPan = payload;
        break;
      case 'ACTIVE_TOKEN':
        this.activeTokenId = payload;
        break;
      case 'AOE_TEMPLATES_SYNC':
        this.aoeTemplates = payload;
        break;
      case 'RULER_SYNC':
        this.ruler = payload;
        break;
      case 'WALLS_DOORS_SYNC':
        this.walls = payload.walls;
        this.doors = payload.doors;
        break;
      case 'DOOR_TOGGLE':
        this.doors = this.doors.map(d => d.id === payload.id ? { ...d, state: payload.state } : d);
        break;
      case 'FOG_EXPLORED_SYNC':
        this.fogExplored = payload;
        break;
      case 'FULL_STATE_SYNC':
        Object.assign(this, payload);
        break;
    }
  }

  // ── Public Mutators ────────────────────────────────────────────────────────

  setTokens(newTokens: CanvasToken[]) {
    this.tokens = newTokens;
    this.broadcast('TOKENS_SYNC', newTokens);
  }

  moveToken(id: string, gx: number, gy: number) {
    this.tokens = this.tokens.map(t => {
      if (t.id === id) {
        return { ...t, x: gx, y: gy };
      }
      return t;
    });

    // Mark surrounding cells as explored
    this.exploreAround(gx, gy, 4);
    this.broadcast('TOKENS_SYNC', this.tokens);
  }

  updateToken(id: string, patch: Partial<CanvasToken>) {
    this.tokens = this.tokens.map(t => t.id === id ? { ...t, ...patch } : t);
    this.broadcast('TOKEN_UPDATE', { id, ...patch });
  }

  toggleTokenCondition(tokenId: string, condition: string) {
    this.tokens = this.tokens.map(t => {
      if (t.id === tokenId) {
        const hasCond = t.conditions.includes(condition);
        const next = hasCond
          ? t.conditions.filter(c => c !== condition)
          : [...t.conditions, condition];
        return { ...t, conditions: next };
      }
      return t;
    });
    this.broadcast('TOKENS_SYNC', this.tokens);
  }

  setActiveToken(tokenId: string | null) {
    this.activeTokenId = tokenId;
    this.broadcast('ACTIVE_TOKEN', tokenId);
  }

  centerOnToken(tokenId: string, target: 'dm' | 'projector' | 'both' = 'both') {
    const tok = this.tokens.find(t => t.id === tokenId);
    if (!tok) return;

    const screenW = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const screenH = typeof window !== 'undefined' ? window.innerHeight : 800;

    const targetX = -(tok.x * this.gridSize) + (screenW / 2);
    const targetY = -(tok.y * this.gridSize) + (screenH / 2);

    if (target === 'dm' || target === 'both') {
      this.dmViewport = { ...this.dmViewport, x: targetX, y: targetY };
      this.broadcast('VIEWPORT_DM', this.dmViewport);
    }

    if ((target === 'projector' || target === 'both') && !this.lockProjectorPan) {
      this.projectorViewport = { ...this.projectorViewport, x: targetX, y: targetY };
      this.broadcast('VIEWPORT_PROJECTOR', this.projectorViewport);
    }
  }

  setDmViewport(vp: ViewportTransform) {
    this.dmViewport = vp;
    if (!this.lockProjectorPan) {
      this.projectorViewport = { ...vp };
    }
    this.broadcast('VIEWPORT_DM', vp);
  }

  setProjectorViewport(vp: ViewportTransform) {
    this.projectorViewport = vp;
    this.broadcast('VIEWPORT_PROJECTOR', vp);
  }

  toggleLockProjectorPan() {
    this.lockProjectorPan = !this.lockProjectorPan;
    this.broadcast('LOCK_PROJECTOR_PAN', this.lockProjectorPan);
  }

  setWallsAndDoors(walls: WallSegment[], doors: DoorPrimitive[]) {
    this.walls = walls;
    this.doors = doors;
    this.broadcast('WALLS_DOORS_SYNC', { walls, doors });
  }

  toggleDoor(doorId: string) {
    const door = this.doors.find(d => d.id === doorId);
    if (!door) return;
    const nextState = door.state === 'OPEN' ? 'CLOSED' : 'OPEN';
    this.doors = this.doors.map(d => d.id === doorId ? { ...d, state: nextState } : d);
    this.broadcast('DOOR_TOGGLE', { id: doorId, state: nextState });
  }

  addAoeTemplate(template: SpellAoeTemplate) {
    this.aoeTemplates = [...this.aoeTemplates, template];
    this.broadcast('AOE_TEMPLATES_SYNC', this.aoeTemplates);
  }

  removeAoeTemplate(id: string) {
    this.aoeTemplates = this.aoeTemplates.filter(t => t.id !== id);
    this.broadcast('AOE_TEMPLATES_SYNC', this.aoeTemplates);
  }

  clearAoeTemplates() {
    this.aoeTemplates = [];
    this.broadcast('AOE_TEMPLATES_SYNC', []);
  }

  setRuler(ruler: RulerMeasurement | null) {
    this.ruler = ruler;
    this.broadcast('RULER_SYNC', ruler);
  }

  exploreAround(gx: number, gy: number, radiusCells: number) {
    const added: string[] = [];
    for (let dx = -radiusCells; dx <= radiusCells; dx++) {
      for (let dy = -radiusCells; dy <= radiusCells; dy++) {
        if (dx * dx + dy * dy <= radiusCells * radiusCells) {
          const key = `${gx + dx},${gy + dy}`;
          if (!this.fogExplored.includes(key)) {
            added.push(key);
          }
        }
      }
    }
    if (added.length > 0) {
      this.fogExplored = [...this.fogExplored, ...added];
      this.broadcast('FOG_EXPLORED_SYNC', this.fogExplored);
    }
  }

  addWallSegment(wall: WallSegment) {
    this.walls = [...this.walls, wall];
    this.broadcast('WALLS_DOORS_SYNC', { walls: this.walls, doors: this.doors });
  }

  addWallSegments(walls: WallSegment[]) {
    this.walls = [...this.walls, ...walls];
    this.broadcast('WALLS_DOORS_SYNC', { walls: this.walls, doors: this.doors });
  }

  clearWalls() {
    this.walls = [];
    this.broadcast('WALLS_DOORS_SYNC', { walls: [], doors: this.doors });
  }

  carveFog(cells: string[]) {
    const next = Array.from(new Set([...this.fogExplored, ...cells]));
    this.fogExplored = next;
    this.broadcast('FOG_EXPLORED_SYNC', this.fogExplored);
  }

  concealFog(cells: string[]) {
    const cellSet = new Set(cells);
    this.fogExplored = this.fogExplored.filter(c => !cellSet.has(c));
    this.broadcast('FOG_EXPLORED_SYNC', this.fogExplored);
  }

  clearFog() {
    this.fogExplored = [];
    this.broadcast('FOG_EXPLORED_SYNC', []);
  }

  revealAllFog(widthCells = 40, heightCells = 30) {
    const allCells: string[] = [];
    for (let x = 0; x < widthCells; x++) {
      for (let y = 0; y < heightCells; y++) {
        allCells.push(`${x},${y}`);
      }
    }
    this.fogExplored = allCells;
    this.broadcast('FOG_EXPLORED_SYNC', this.fogExplored);
  }

  setBackgroundTexture(texture: string | { url: string; width: number; height: number; name?: string }) {
    if (typeof texture === 'string') {
      this.mapImageUrl = texture;
    } else {
      this.mapImageUrl = texture.url;
      this.mapWidth = texture.width;
      this.mapHeight = texture.height;
    }
    this.broadcast('FULL_STATE_SYNC', {
      mapImageUrl: this.mapImageUrl,
      mapWidth: this.mapWidth,
      mapHeight: this.mapHeight
    });
  }

  setGridSize(size: number) {
    this.gridSize = Math.max(10, Math.min(200, size));
    this.broadcast('FULL_STATE_SYNC', { gridSize: this.gridSize });
  }

  setGridColor(color: string) {
    this.gridColor = color;
    this.broadcast('FULL_STATE_SYNC', { gridColor: color });
  }

  setWallCollisions(walls: Array<{ x1: number; y1: number; x2: number; y2: number }>) {
    this.walls = walls.map((w, i) => ({
      id: `wall-col-${Date.now()}-${i}`,
      x1: w.x1,
      y1: w.y1,
      x2: w.x2,
      y2: w.y2
    }));
    this.broadcast('WALLS_DOORS_SYNC', { walls: this.walls, doors: this.doors });
  }

  getSnapshot(): CanvasStateSnapshot {
    return {
      mapImageUrl: this.mapImageUrl,
      mapWidth: this.mapWidth,
      mapHeight: this.mapHeight,
      tokens: $state.snapshot(this.tokens),
      walls: $state.snapshot(this.walls),
      doors: $state.snapshot(this.doors),
      gridSize: this.gridSize,
      gridOpacity: this.gridOpacity,
      gridColor: this.gridColor,
      fogExplored: [...this.fogExplored],
      aoeTemplates: $state.snapshot(this.aoeTemplates),
      ruler: this.ruler ? { ...this.ruler } : null,
      dmViewport: { ...this.dmViewport },
      projectorViewport: { ...this.projectorViewport },
      dynamicLightingEnabled: this.dynamicLightingEnabled,
      wallVisibilityEnabled: this.wallVisibilityEnabled,
    };
  }

  requestSync() {
    this.broadcast('REQUEST_SYNC', null);
  }
}

export const canvasStore = new CanvasStoreClass();
