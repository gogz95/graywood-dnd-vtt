// frontend/src/lib/network/wsRouter.ts
// Inbound WebSocket Router dispatching server broadcasts directly into Svelte 5 stores.
// Establishes authoritative unidirectional data flow: UI -> WS -> Axum -> SQLite -> Broadcast -> Svelte Stores.

import { tokenStore, type TokenInstance } from '../stores/tokenStore.svelte';

export interface WsTokenEvent {
  type: string;
  token?: TokenInstance;
  tokens?: TokenInstance[];
  snapshot?: TokenInstance[];
  id?: string;
  token_id?: string;
  instance_id?: string;
  x?: number;
  y?: number;
  elevation?: number;
  patch?: Partial<TokenInstance>;
  payload?: any;
}

/**
 * Routes inbound WebSocket messages to store handlers.
 * Ensures local stores update strictly in response to authoritative server state broadcasts.
 */
export function routeInboundWsEvent(event: WsTokenEvent | any): void {
  if (!event || typeof event !== 'object') return;

  const eventType = event.type || event.event;

  switch (eventType) {
    case 'TokenSpawned':
    case 'TOKEN_SPAWNED':
    case 'token:spawned': {
      const token = event.token ?? event.payload?.token ?? event.payload;
      if (token) {
        tokenStore.handleTokenSpawned(token);
      }
      break;
    }

    case 'TokenMoved':
    case 'TOKEN_MOVED':
    case 'TOKEN_MOVE':
    case 'token:moved': {
      const id = event.id ?? event.token_id ?? event.instance_id ?? event.payload?.id;
      const x = event.x ?? event.payload?.x;
      const y = event.y ?? event.payload?.y;
      const elevation = event.elevation ?? event.payload?.elevation ?? 0;
      if (id !== undefined && x !== undefined && y !== undefined) {
        tokenStore.handleTokenMoved(id, Number(x), Number(y), Number(elevation));
      }
      break;
    }

    case 'TokenUpdated':
    case 'TOKEN_UPDATED':
    case 'token:updated': {
      const id = event.id ?? event.token_id ?? event.instance_id ?? event.payload?.id;
      const patch = event.patch ?? event.payload?.patch ?? event.payload;
      if (id && patch) {
        tokenStore.handleTokenUpdated(id, patch);
      }
      break;
    }

    case 'TokenRemoved':
    case 'TOKEN_REMOVED':
    case 'token:removed': {
      const id = event.id ?? event.token_id ?? event.instance_id ?? event.payload?.id;
      if (id) {
        tokenStore.handleTokenRemoved(id);
      }
      break;
    }

    case 'StateSnapshot':
    case 'STATE_SNAPSHOT':
    case 'tokens:snapshot': {
      const tokensList = event.tokens ?? event.snapshot ?? event.payload?.tokens ?? event.payload;
      if (Array.isArray(tokensList)) {
        tokenStore.handleStateSnapshot(tokensList);
      }
      break;
    }

    default:
      break;
  }
}
