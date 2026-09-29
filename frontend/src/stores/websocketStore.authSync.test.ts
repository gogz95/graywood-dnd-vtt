// frontend/src/stores/websocketStore.authSync.test.ts
// Integration guard for Item 5 wiring: the store must persist credentials to the
// canonical sessionStorage keys AND fan them out over BroadcastChannel so sibling
// tabs adopt the session without a PIN prompt.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  applyAuthFailure,
  applyAuthSuccess,
  connectionStatusStore,
  lastPlayerTokenStore,
  lastRoomCodeStore,
  lastSessionIdStore,
} from './websocketStore';
import {
  COMPANION_AUTH_STORAGE_KEYS,
  COMPANION_SYNC_CHANNEL_NAME,
  readLocalAuth,
} from '../lib/services/companionSync';

const settle = (ms = 40): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

let observer: BroadcastChannel;
let received: Array<{ type?: string; payload?: unknown }>;

beforeEach(() => {
  vi.stubGlobal('window', {});

  const store = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  });

  received = [];
  observer = new BroadcastChannel(COMPANION_SYNC_CHANNEL_NAME);
  observer.addEventListener('message', (event: MessageEvent) => received.push(event.data));
});

afterEach(() => {
  try {
    observer.close();
  } catch {
    // already closed
  }
  vi.unstubAllGlobals();
});

describe('websocketStore cross-tab auth synchronization', () => {
  it('persists AUTH_SUCCESS credentials and fans them out to sibling tabs', async () => {
    applyAuthSuccess({ sessionId: 'sess-7', roomCode: 'Graywood', token: 'tok-7' });

    // 1. Canonical storage — read back by initWebSocket() session recovery and by
    //    the companionSync REQUEST_AUTH responder.
    expect(readLocalAuth()).toEqual({
      roomCode: 'Graywood',
      token: 'tok-7',
      playerId: 'sess-7',
    });
    expect(sessionStorage.getItem(COMPANION_AUTH_STORAGE_KEYS.playerId)).toBe('sess-7');

    // 2. Cross-tab fan-out.
    await settle();
    expect(received).toEqual([
      { type: 'AUTH_SYNC', payload: { roomCode: 'Graywood', token: 'tok-7', playerId: 'sess-7' } },
    ]);

    // 3. Reactive session identity.
    expect(connectionStatusStore).toBeDefined();
    let sessionId: string | null = null;
    lastSessionIdStore.subscribe((value) => (sessionId = value))();
    expect(sessionId).toBe('sess-7');
  });

  it('normalizes whitespace and rejects a partial handshake without broadcasting', async () => {
    applyAuthSuccess({ sessionId: 'sess-8', roomCode: '  Dockside  ', token: 'tok-8' });

    await settle();
    const [message] = received as Array<{ payload: { roomCode: string } }>;
    expect(message.payload.roomCode).toBe('Dockside');

    // Partial handshake: token missing → nothing broadcast, still "connected".
    applyAuthSuccess({ sessionId: 'sess-9', roomCode: 'Dockside', token: '' });
    await settle();
    expect(received.length).toBe(1);
    expect(readLocalAuth()).toBeNull();
  });

  it('clears adopted credentials on AUTH_FAILURE', () => {
    applyAuthSuccess({ sessionId: 'sess-10', roomCode: 'Graywood', token: 'tok-10' });
    expect(readLocalAuth()).not.toBeNull();

    applyAuthFailure();
    expect(readLocalAuth()).toBeNull();

    let roomCode: string | null = 'sentinel';
    lastRoomCodeStore.subscribe((value) => (roomCode = value))();
    let token: string | null = 'sentinel';
    lastPlayerTokenStore.subscribe((value) => (token = value))();
    expect(roomCode).toBeNull();
    expect(token).toBeNull();
  });
});
