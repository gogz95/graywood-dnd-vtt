// frontend/src/lib/stores/tokenStore.svelte.ts
// Svelte 5 In-Memory Reactive Token Store with Unidirectional WebSocket Data Flow.
// Completely purged of Dexie.js (IndexedDB) and localStorage direct writes.
// Authoritative Flow: UI -> WebSocket -> Axum -> SQLite -> Broadcast -> Svelte Stores.

import type { VisionType, LightEmission, VttToken, TokenAura } from '../types/token';
import { sendWsEvent } from '../../stores/websocketStore';

export type { VisionType, LightEmission, VttToken, TokenAura };

export interface TokenInstance {
  instance_id: string;
  id: string;
  scene_id?: string;
  entity_id?: string | null;
  name: string;
  x: number;
  y: number;
  elevation: number;
  size_cells?: number;
  system_data_json?: string;
  // Runtime canvas and UI properties
  hp?: number;
  maxHp?: number;
  tempHp?: number;
  ac?: number;
  speed?: number;
  size?: string | number;
  imageUrl?: string;
  assetPath?: string;
  conditions?: string[];
  isPlayer?: boolean;
  isGmOnly?: boolean;
  rotation?: number;
  visionType?: VisionType;
  visionRange?: number;
  lightEmission?: LightEmission;
  auras?: TokenAura[];
  [key: string]: any;
}

export function parseSizeToCells(size?: string | number): number {
  if (typeof size === 'number') return Math.max(1, Math.min(6, size));
  if (!size) return 1;
  const s = size.toLowerCase();
  if (s.includes('tiny') || s.includes('small') || s.includes('medium')) return 1;
  if (s.includes('large')) return 2;
  if (s.includes('huge')) return 3;
  if (s.includes('gargantuan')) return 4;
  return 1;
}

function normalizeToken(raw: Partial<TokenInstance> & { id?: string; instance_id?: string; name?: string }): TokenInstance {
  const instance_id = raw.instance_id || raw.id || `tok-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const id = raw.id || instance_id;

  return {
    ...raw,
    instance_id,
    id,
    name: raw.name || 'Token',
    x: raw.x ?? 0,
    y: raw.y ?? 0,
    elevation: raw.elevation ?? 0,
    size_cells: raw.size_cells ?? parseSizeToCells(raw.size),
    hp: raw.hp ?? 10,
    maxHp: raw.maxHp ?? 10,
    tempHp: raw.tempHp ?? 0,
    conditions: raw.conditions ? [...raw.conditions] : [],
    auras: raw.auras ? [...raw.auras] : [],
    rotation: raw.rotation ?? 0,
  };
}

// In-Memory Svelte 5 Rune-backed state (zero Dexie / IndexedDB / localStorage writes)
let tokens = $state<Map<string, TokenInstance>>(new Map());
let selectedTokenId = $state<string | null>(null);

export const tokenStore = {
  // Authoritative getters
  get all(): TokenInstance[] {
    return Array.from(tokens.values());
  },
  get tokens(): TokenInstance[] {
    return Array.from(tokens.values());
  },
  set tokens(newTokens: TokenInstance[]) {
    tokens = new Map(newTokens.map((t) => {
      const normalized = normalizeToken(t);
      return [normalized.instance_id, normalized];
    }));
  },
  get: (id: string): TokenInstance | undefined => {
    return tokens.get(id);
  },

  // Selection
  get selectedTokenId(): string | null {
    return selectedTokenId;
  },
  set selectedTokenId(id: string | null) {
    selectedTokenId = id;
  },
  get selectedToken(): TokenInstance | null {
    return selectedTokenId ? tokens.get(selectedTokenId) ?? null : null;
  },
  selectToken(id: string | null): void {
    selectedTokenId = id;
  },

  // Inbound WebSocket Event Handlers (Unidirectional update from server broadcasts)
  handleTokenSpawned: (token: Partial<TokenInstance>): void => {
    const normalized = normalizeToken(token);
    tokens.set(normalized.instance_id, normalized);
  },

  handleTokenMoved: (id: string, x: number, y: number, elevation: number = 0): void => {
    const t = tokens.get(id);
    if (t) {
      t.x = x;
      t.y = y;
      t.elevation = elevation;
    }
  },

  handleTokenUpdated: (id: string, patch: Partial<TokenInstance>): void => {
    const t = tokens.get(id);
    if (t) {
      Object.assign(t, patch);
      if (patch.id && patch.id !== id) {
        t.instance_id = patch.id;
      }
    }
  },

  handleTokenRemoved: (id: string): void => {
    tokens.delete(id);
    if (selectedTokenId === id) {
      selectedTokenId = null;
    }
  },

  handleStateSnapshot: (snapshot: TokenInstance[]): void => {
    tokens = new Map(snapshot.map((t) => {
      const normalized = normalizeToken(t);
      return [normalized.instance_id, normalized];
    }));
  },

  // Outbound User Intent Actions (Dispatches to Axum WebSocket instead of local Dexie mutation)
  requestTokenMove(id: string, x: number, y: number): void {
    sendWsEvent({
      type: 'TOKEN_MOVE',
      id,
      x,
      y,
    });
  },

  requestTokenSpawn(payload: { entity_id: string; scene_id?: string; x: number; y: number }): void {
    sendWsEvent({
      type: 'TOKEN_SPAWN',
      ...payload,
    });
  },

  requestTokenRemove(id: string): void {
    sendWsEvent({
      type: 'TOKEN_REMOVE',
      id,
    });
  },

  requestTokenUpdate(id: string, patch: Partial<TokenInstance>): void {
    sendWsEvent({
      type: 'TOKEN_UPDATE',
      id,
      patch,
    });
  },

  // UI convenience wrappers dispatching intents
  addToken(token: Partial<TokenInstance>): void {
    const normalized = normalizeToken(token);
    tokens.set(normalized.instance_id, normalized);
    sendWsEvent({
      type: 'TOKEN_SPAWN',
      token: normalized,
      entity_id: normalized.entity_id,
      x: normalized.x,
      y: normalized.y,
    });
  },

  moveToken(id: string, x: number, y: number): void {
    const t = tokens.get(id);
    if (t) {
      t.x = x;
      t.y = y;
    }
    this.requestTokenMove(id, x, y);
  },

  updateToken(id: string, patch: Partial<TokenInstance>): void {
    const t = tokens.get(id);
    if (t) {
      Object.assign(t, patch);
    }
    this.requestTokenUpdate(id, patch);
  },

  deleteToken(id: string): void {
    this.handleTokenRemoved(id);
    this.requestTokenRemove(id);
  },

  setElevation(id: string, elevation: number): void {
    const t = tokens.get(id);
    if (t) {
      t.elevation = Math.round(elevation);
    }
    this.requestTokenUpdate(id, { elevation: Math.round(elevation) });
  },

  setRotation(id: string, rotation: number): void {
    const rot = ((rotation % 360) + 360) % 360;
    const t = tokens.get(id);
    if (t) {
      t.rotation = rot;
    }
    this.requestTokenUpdate(id, { rotation: rot });
  },

  updateHp(id: string, delta: number): void {
    const t = tokens.get(id);
    if (t) {
      const maxHp = t.maxHp ?? 10;
      t.hp = Math.max(0, Math.min(maxHp, (t.hp ?? maxHp) + delta));
      this.requestTokenUpdate(id, { hp: t.hp });
    }
  },

  toggleCondition(id: string, condition: string): void {
    const t = tokens.get(id);
    if (t) {
      if (!t.conditions) t.conditions = [];
      const idx = t.conditions.indexOf(condition);
      if (idx >= 0) t.conditions.splice(idx, 1);
      else t.conditions.push(condition);
      this.requestTokenUpdate(id, { conditions: t.conditions });
    }
  },

  setVision(id: string, visionType: VisionType, visionRange?: number): void {
    const t = tokens.get(id);
    if (t) {
      t.visionType = visionType;
      if (visionRange !== undefined) {
        t.visionRange = Math.max(0, visionRange);
      }
      this.requestTokenUpdate(id, { visionType: t.visionType, visionRange: t.visionRange });
    }
  },

  setLightEmission(id: string, emission: Partial<LightEmission>): void {
    const t = tokens.get(id);
    if (t) {
      t.lightEmission = {
        brightRadius: emission.brightRadius ?? t.lightEmission?.brightRadius ?? 20,
        dimRadius: emission.dimRadius ?? t.lightEmission?.dimRadius ?? 20,
        color: emission.color ?? t.lightEmission?.color ?? '#ffaa44',
        enabled: emission.enabled ?? t.lightEmission?.enabled ?? true,
      };
      this.requestTokenUpdate(id, { lightEmission: t.lightEmission });
    }
  },

  addAura(id: string, aura: TokenAura): void {
    const t = tokens.get(id);
    if (t) {
      if (!t.auras) t.auras = [];
      const existingIdx = t.auras.findIndex((a) => a.id === aura.id);
      if (existingIdx >= 0) {
        t.auras[existingIdx] = aura;
      } else {
        t.auras.push(aura);
      }
      this.requestTokenUpdate(id, { auras: t.auras });
    }
  },

  removeAura(id: string, auraId: string): void {
    const t = tokens.get(id);
    if (t && t.auras) {
      t.auras = t.auras.filter((a) => a.id !== auraId);
      this.requestTokenUpdate(id, { auras: t.auras });
    }
  },

  clearAuras(id: string): void {
    const t = tokens.get(id);
    if (t) {
      t.auras = [];
      this.requestTokenUpdate(id, { auras: [] });
    }
  },

  clearTokens(): void {
    tokens.clear();
    selectedTokenId = null;
    sendWsEvent({ type: 'TOKEN_CLEAR' });
  },
};
