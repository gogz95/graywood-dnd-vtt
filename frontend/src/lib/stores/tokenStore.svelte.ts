// src/lib/stores/tokenStore.svelte.ts
// Svelte 5 Token Store with LAN Broadcast Synchronization

async function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T | undefined> {
  if (typeof window !== 'undefined') {
    const win = window as any;
    const invokeFn = win.__TAURI__?.core?.invoke || win.__TAURI_INTERNALS__?.invoke;
    if (typeof invokeFn === 'function') {
      return invokeFn(cmd, args);
    }
  }
  return undefined;
}

export interface VttToken {
  id: string;
  name: string;
  x: number; // world x (center or top-left)
  y: number; // world y
  hp: number;
  maxHp: number;
  tempHp?: number;
  ac?: number;
  size: number; // grid cell footprint: 1=Med/Small, 2=Large, 3=Huge, 4=Gargantuan
  sizeCategory?: 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan';
  conditions: string[];
  isRevealed: boolean;
  isGmOnly: boolean;
  imageUrl?: string;
  color?: string;
  elevation?: number; // In feet, e.g. 0, 10, 20
  rotation?: number; // In degrees, 0-360
  isPlayer?: boolean;
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

const TOKEN_STORAGE_KEY = 'vtt_battlemat_tokens';

function loadInitialTokens(): VttToken[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

class TokenStore {
  tokens = $state<VttToken[]>(loadInitialTokens());
  selectedTokenId = $state<string | null>(null);

  selectedToken = $derived(this.tokens.find((t) => t.id === this.selectedTokenId) ?? null);

  addToken(token: VttToken) {
    this.tokens.push(token);
    this.persist();
    this.broadcastTokens();
  }

  moveToken(id: string, x: number, y: number) {
    const token = this.tokens.find((t) => t.id === id);
    if (token) {
      token.x = x;
      token.y = y;
      this.persist();
      this.broadcastTokens();
    }
  }

  updateToken(id: string, patch: Partial<VttToken>) {
    const token = this.tokens.find((t) => t.id === id);
    if (token) {
      Object.assign(token, patch);
      this.persist();
      this.broadcastTokens();
    }
  }

  deleteToken(id: string) {
    const idx = this.tokens.findIndex((t) => t.id === id);
    if (idx >= 0) {
      this.tokens.splice(idx, 1);
      if (this.selectedTokenId === id) {
        this.selectedTokenId = null;
      }
      this.persist();
      this.broadcastTokens();
    }
  }

  selectToken(id: string | null) {
    this.selectedTokenId = id;
  }

  setElevation(id: string, elevation: number) {
    const token = this.tokens.find((t) => t.id === id);
    if (token) {
      token.elevation = Math.max(0, elevation);
      this.persist();
      this.broadcastTokens();
    }
  }

  setRotation(id: string, rotation: number) {
    const token = this.tokens.find((t) => t.id === id);
    if (token) {
      token.rotation = ((rotation % 360) + 360) % 360;
      this.persist();
      this.broadcastTokens();
    }
  }

  updateHp(id: string, delta: number) {
    const token = this.tokens.find((t) => t.id === id);
    if (token) {
      token.hp = Math.max(0, Math.min(token.maxHp, token.hp + delta));
      this.persist();
      this.broadcastTokens();
    }
  }

  toggleCondition(id: string, condition: string) {
    const token = this.tokens.find((t) => t.id === id);
    if (token) {
      const idx = token.conditions.indexOf(condition);
      if (idx >= 0) token.conditions.splice(idx, 1);
      else token.conditions.push(condition);
      this.persist();
      this.broadcastTokens();
    }
  }

  clearTokens() {
    this.tokens = [];
    this.selectedTokenId = null;
    this.persist();
    this.broadcastTokens();
  }

  private persist() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(this.tokens));
    } catch {}
  }

  private async broadcastTokens() {
    try {
      await invoke('broadcast_vtt_event', { event: 'tokens:update', payload: this.tokens });
    } catch (err) {
      console.warn('LAN token broadcast unavailable:', err);
    }
  }
}

export const tokenStore = new TokenStore();
