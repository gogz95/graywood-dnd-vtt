// src/lib/services/systemBus.ts
// Centralized Reactive Inter-System Event Bus & Sync Orchestrator
// Coordinates Canvas, Combat Ribbon, Session Chat, and /play Companion Endpoints

export type SystemBusEventType =
  | 'SCENE_CHANGE'
  | 'COMBAT_START'
  | 'COMBAT_END'
  | 'TOKEN_SELECT'
  | 'DAMAGE_APPLIED'
  | 'REST_COMPLETED'
  | 'HANDOUT_SHARED'
  | 'STORAGE_QUOTA_WARNING';

export interface SystemBusPayloads {
  SCENE_CHANGE: { mapId: string; mapType: 'tactical' | 'atlas'; name?: string };
  COMBAT_START: { encounterId: string; combatantsCount: number };
  COMBAT_END: { encounterId: string };
  TOKEN_SELECT: { tokenId: string | null; name?: string };
  DAMAGE_APPLIED: { tokenId: string; targetName: string; damage: number; nextHp: number; tempHpDepleted: number };
  REST_COMPLETED: { characterId: string; restType: 'short' | 'long'; hpRestored: number; hdSpent?: number; hdRecovered?: number };
  HANDOUT_SHARED: { id: string; title: string; playerContent: string; imageUrl?: string };
  STORAGE_QUOTA_WARNING: { usageBytes: number; quotaBytes: number; usagePercent: number };
}

type Listener<T extends SystemBusEventType> = (payload: SystemBusPayloads[T]) => void;

class SystemBus {
  private listeners: Map<SystemBusEventType, Set<Listener<any>>> = new Map();
  private broadcastChannel: BroadcastChannel | null = null;

  constructor() {
    if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
      try {
        this.broadcastChannel = new BroadcastChannel('vtt_system_bus');
        this.broadcastChannel.onmessage = (event: MessageEvent<{ type: SystemBusEventType; payload: any }>) => {
          const { type, payload } = event.data;
          if (type && payload) {
            this.notifyLocal(type, payload);
          }
        };
      } catch {
        // BroadcastChannel unsupported
      }
    }
  }

  private notifyLocal<T extends SystemBusEventType>(eventType: T, payload: SystemBusPayloads[T]): void {
    const list = this.listeners.get(eventType);
    if (list) {
      for (const fn of list) {
        try {
          fn(payload);
        } catch {
          // ignore listener errors
        }
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(`vtt:bus:${eventType}`, { detail: payload }));
    }
  }

  /**
   * Dispatches a typed event to local subscribers and across cross-window BroadcastChannels.
   */
  emit<T extends SystemBusEventType>(eventType: T, payload: SystemBusPayloads[T]): void {
    this.notifyLocal(eventType, payload);

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({ type: eventType, payload });
      } catch {
        // ignore broadcast failures
      }
    }
  }

  /**
   * Subscribes to a typed system bus event. Returns an unsubscribe function.
   */
  on<T extends SystemBusEventType>(eventType: T, callback: Listener<T>): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    const set = this.listeners.get(eventType)!;
    set.add(callback);

    return () => {
      set.delete(callback);
    };
  }
}

export const systemBus = new SystemBus();
