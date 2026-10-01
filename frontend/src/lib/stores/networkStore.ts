// src/lib/stores/networkStore.ts
// WebSocket token concurrency lease store — WIRE-23
// Dispatches LEASE_ACQUIRE on drag-start and LEASE_RELEASE on drop for optimistic locking.

const WS_BASE = (() => {
  if (typeof window === 'undefined') return 'ws://localhost:5174';
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.hostname;
  return `${proto}//${host}:5174`;
})();

export interface TokenLease {
  tokenId: string;
  userId: string;
  acquiredAt: number;
}

class NetworkStore {
  private socket: WebSocket | null = null;
  private userId: string;
  /** tokenId → lease holder userId */
  leases = $state<Map<string, string>>(new Map());
  isConnected = $state(false);

  constructor() {
    this.userId = this.loadOrCreateUserId();
  }

  private loadOrCreateUserId(): string {
    if (typeof localStorage === 'undefined') return `user-${Date.now()}`;
    let id = localStorage.getItem('vtt_user_id');
    if (!id) {
      id = `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      localStorage.setItem('vtt_user_id', id);
    }
    return id;
  }

  connect(pin?: string): void {
    if (this.socket?.readyState === WebSocket.OPEN) return;
    const url = `${WS_BASE}/ws${pin ? `?pin=${encodeURIComponent(pin)}&role=dm` : '?role=dm'}`;
    try {
      this.socket = new WebSocket(url);
      this.socket.addEventListener('open', () => { this.isConnected = true; });
      this.socket.addEventListener('close', () => { this.isConnected = false; });
      this.socket.addEventListener('message', (ev) => this.handleMessage(ev));
    } catch (e) {
      console.warn('[NetworkStore] WebSocket connect failed:', e);
    }
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
    this.isConnected = false;
  }

  private send(payload: unknown): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    }
  }

  private handleMessage(ev: MessageEvent): void {
    let msg: any;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.type === 'LEASE_ACQUIRE') {
      const newMap = new Map(this.leases);
      newMap.set(msg.token_id, msg.user_id);
      this.leases = newMap;
    } else if (msg.type === 'LEASE_RELEASE' || msg.type === 'LEASE_RELEASED') {
      const newMap = new Map(this.leases);
      newMap.delete(msg.token_id);
      this.leases = newMap;
    }
  }

  /** Call on token pointerdown / drag-start. */
  acquireLease(tokenId: string): boolean {
    const existing = this.leases.get(tokenId);
    if (existing && existing !== this.userId) {
      // Already held by another user — deny
      return false;
    }
    const newMap = new Map(this.leases);
    newMap.set(tokenId, this.userId);
    this.leases = newMap;
    this.send({ type: 'LEASE_ACQUIRE', token_id: tokenId, user_id: this.userId });
    return true;
  }

  /** Call on token pointerup / drop. */
  releaseLease(tokenId: string): void {
    const newMap = new Map(this.leases);
    newMap.delete(tokenId);
    this.leases = newMap;
    this.send({ type: 'LEASE_RELEASE', token_id: tokenId, user_id: this.userId });
  }

  /** Returns true when this client holds the lease, or no lease exists. */
  canControl(tokenId: string): boolean {
    const holder = this.leases.get(tokenId);
    return !holder || holder === this.userId;
  }

  get myUserId(): string {
    return this.userId;
  }
}

export const networkStore = new NetworkStore();
