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
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  size: number;
  conditions: string[];
  isRevealed: boolean;
  isGmOnly: boolean;
}

class TokenStore {
  tokens = $state<VttToken[]>([]);
  selectedTokenId = $state<string | null>(null);

  selectedToken = $derived(this.tokens.find((t) => t.id === this.selectedTokenId) ?? null);

  addToken(token: VttToken) {
    this.tokens.push(token);
    this.broadcastTokens();
  }

  updateHp(id: string, delta: number) {
    const token = this.tokens.find((t) => t.id === id);
    if (token) {
      token.hp = Math.max(0, Math.min(token.maxHp, token.hp + delta));
      this.broadcastTokens();
    }
  }

  toggleCondition(id: string, condition: string) {
    const token = this.tokens.find((t) => t.id === id);
    if (token) {
      const idx = token.conditions.indexOf(condition);
      if (idx >= 0) token.conditions.splice(idx, 1);
      else token.conditions.push(condition);
      this.broadcastTokens();
    }
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
