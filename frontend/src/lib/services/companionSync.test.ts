// frontend/src/lib/services/companionSync.test.ts
// Vitest suite — cross-tab auth fan-out over BroadcastChannel('vtt_companion_sync').
//
// Node exposes a spec-compliant global `BroadcastChannel`, so `window` and
// `sessionStorage` are stubbed to exercise the real channel rather than a mock.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  broadcastAuth,
  clearLocalAuth,
  companionSyncSubscriberCount,
  COMPANION_AUTH_STORAGE_KEYS,
  COMPANION_SYNC_CHANNEL_NAME,
  initCompanionSync,
  isValidAuthPayload,
  readLocalAuth,
  saveLocalAuth,
  type AuthPayload,
} from './companionSync';

// ── Harness ───────────────────────────────────────────────────────────────────

/** Waits long enough for a BroadcastChannel macrotask to be delivered. */
const settle = (ms = 40): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const VALID: AuthPayload = {
  roomCode: 'Campaign Alpha',
  token: 'tok-abc123',
  playerId: 'sess-42',
};

/** A raw sibling "tab" used to post and observe channel traffic. */
function createObserver() {
  const received: Array<{ type?: string; payload?: unknown }> = [];
  const channel = new BroadcastChannel(COMPANION_SYNC_CHANNEL_NAME);

  channel.addEventListener('message', (event: MessageEvent) => {
    received.push(event.data);
  });

  return {
    received,
    ofType(type: string) {
      return received.filter((message) => message?.type === type);
    },
    post(message: unknown) {
      channel.postMessage(message);
    },
    close() {
      try {
        channel.close();
      } catch {
        // already closed
      }
    },
  };
}

type Observer = ReturnType<typeof createObserver>;

/** Map-backed sessionStorage stub. */
function installSessionStorage(seed: Partial<Record<string, string>> = {}): Map<string, string> {
  const store = new Map<string, string>(Object.entries(seed) as Array<[string, string]>);

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

  return store;
}

let observers: Observer[] = [];
let unsubscribes: Array<() => void> = [];

function observe(): Observer {
  const observer = createObserver();
  observers.push(observer);
  return observer;
}

function track(unsubscribe: () => void): () => void {
  unsubscribes.push(unsubscribe);
  return unsubscribe;
}

beforeEach(() => {
  // `isBroadcastSupported()` gates on `window`; BroadcastChannel is a Node global.
  vi.stubGlobal('window', {});
  installSessionStorage();
  observers = [];
  unsubscribes = [];
});

afterEach(() => {
  for (const unsubscribe of unsubscribes) unsubscribe();
  for (const observer of observers) observer.close();
  vi.unstubAllGlobals();
});

// ── Payload validation ────────────────────────────────────────────────────────

describe('isValidAuthPayload', () => {
  it('accepts a complete credential set', () => {
    expect(isValidAuthPayload(VALID)).toBe(true);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a bare string', 'AUTH_SYNC'],
    ['an empty object', {}],
    ['a partial payload (missing playerId)', { roomCode: 'r', token: 't' }],
    ['a blank roomCode', { roomCode: '   ', token: 't', playerId: 'p' }],
    ['a non-string token', { roomCode: 'r', token: 7, playerId: 'p' }],
  ])('rejects %s', (_label, candidate) => {
    expect(isValidAuthPayload(candidate)).toBe(false);
  });
});

// ── Local credential persistence ─────────────────────────────────────────────

describe('local credential storage', () => {
  it('round-trips a valid payload through the canonical keys', () => {
    expect(saveLocalAuth(VALID)).toBe(true);
    expect(readLocalAuth()).toEqual(VALID);
  });

  it('writes the canonical sessionStorage keys consumed by websocketStore', () => {
    const store = installSessionStorage();
    saveLocalAuth(VALID);

    expect(store.get(COMPANION_AUTH_STORAGE_KEYS.roomCode)).toBe(VALID.roomCode);
    expect(store.get(COMPANION_AUTH_STORAGE_KEYS.token)).toBe(VALID.token);
    expect(store.get(COMPANION_AUTH_STORAGE_KEYS.playerId)).toBe(VALID.playerId);
  });

  it('returns null rather than a partial payload when a field is missing', () => {
    installSessionStorage({
      [COMPANION_AUTH_STORAGE_KEYS.roomCode]: 'Campaign Alpha',
      [COMPANION_AUTH_STORAGE_KEYS.token]: 'tok-abc123',
      // playerId intentionally absent
    });

    expect(readLocalAuth()).toBeNull();
  });

  it('refuses to persist an incomplete payload', () => {
    expect(saveLocalAuth({ roomCode: 'r', token: '', playerId: 'p' })).toBe(false);
  });

  it('clearLocalAuth removes every adopted key', () => {
    saveLocalAuth(VALID);
    clearLocalAuth();
    expect(readLocalAuth()).toBeNull();
  });
});

// ── REQUEST_AUTH / AUTH_SYNC handshake ───────────────────────────────────────

describe('initCompanionSync handshake', () => {
  it('emits a REQUEST_AUTH probe on initialization', async () => {
    const observer = observe();
    track(initCompanionSync(() => {}));

    await settle();
    expect(observer.ofType('REQUEST_AUTH').length).toBe(1);
  });

  it('emits a single probe for concurrent subscribers in the same tab', async () => {
    const observer = observe();
    track(initCompanionSync(() => {}));
    track(initCompanionSync(() => {}));
    track(initCompanionSync(() => {}));

    await settle();
    expect(observer.ofType('REQUEST_AUTH').length).toBe(1);
  });

  it('responds to REQUEST_AUTH with a wrapped AUTH_SYNC payload', async () => {
    saveLocalAuth(VALID);
    const observer = observe();
    track(initCompanionSync(() => {}));

    observer.post({ type: 'REQUEST_AUTH' });
    await settle();

    const responses = observer.ofType('AUTH_SYNC');
    expect(responses.length).toBe(1);
    // Regression guard: the legacy service posted the bare payload, which a
    // requester testing `event.data.type` could never match.
    expect(responses[0]).toEqual({ type: 'AUTH_SYNC', payload: VALID });
    expect(responses[0].payload).toBeDefined();
    expect(responses[0].payload).not.toBeNull();
  });

  it('never emits a null or undefined payload when it holds no credentials', async () => {
    installSessionStorage(); // empty
    const observer = observe();
    track(initCompanionSync(() => {}));

    observer.post({ type: 'REQUEST_AUTH' });
    await settle(120);

    // A naive responder would have posted `undefined`/null here.
    expect(observer.ofType('AUTH_SYNC')).toEqual([]);
    // Only the initial probe crossed the channel — nothing else was emitted.
    expect(observer.received).toEqual([{ type: 'REQUEST_AUTH' }]);
  });

  it('adopts an AUTH_SYNC broadcast by a sibling tab', async () => {
    const observer = observe();
    const received: AuthPayload[] = [];
    track(initCompanionSync((authData) => received.push(authData)));

    observer.post({ type: 'AUTH_SYNC', payload: VALID });
    await settle();

    expect(received).toEqual([VALID]);
  });

  it('delivers to every concurrent subscriber without clobbering (addEventListener)', async () => {
    const observer = observe();
    const first: AuthPayload[] = [];
    const second: AuthPayload[] = [];

    track(initCompanionSync((authData) => first.push(authData)));
    track(initCompanionSync((authData) => second.push(authData)));

    observer.post({ type: 'AUTH_SYNC', payload: VALID });
    await settle();

    expect(first).toEqual([VALID]);
    expect(second).toEqual([VALID]);
  });

  it('drops AUTH_SYNC payloads that fail validation', async () => {
    const observer = observe();
    const received: unknown[] = [];
    track(initCompanionSync((authData) => received.push(authData)));

    observer.post({ type: 'AUTH_SYNC', payload: null });
    observer.post({ type: 'AUTH_SYNC', payload: { roomCode: 'r' } });
    observer.post({ type: 'AUTH_SYNC' });
    observer.post(null);
    observer.post('not-an-object');
    await settle();

    expect(received).toEqual([]);
  });

  it('isolates a throwing subscriber from the remaining fan-out', async () => {
    const observer = observe();
    const received: AuthPayload[] = [];

    track(
      initCompanionSync(() => {
        throw new Error('subscriber fault');
      })
    );
    track(initCompanionSync((authData) => received.push(authData)));

    observer.post({ type: 'AUTH_SYNC', payload: VALID });
    await settle();

    expect(received).toEqual([VALID]);
  });
});

// ── Lifecycle: unsubscribe idempotency and channel teardown ──────────────────

describe('unsubscribe lifecycle', () => {
  it('is idempotent and detaches every subscriber', async () => {
    const observer = observe();
    const unsubscribe = initCompanionSync(() => {});

    expect(companionSyncSubscriberCount()).toBe(1);

    unsubscribe();
    unsubscribe();
    unsubscribe();

    expect(companionSyncSubscriberCount()).toBe(0);

    // Channel torn down: a subsequent sibling broadcast must not reach a dead sub.
    observer.post({ type: 'AUTH_SYNC', payload: VALID });
    await settle();
    expect(companionSyncSubscriberCount()).toBe(0);
  });

  it('stops delivering to a detached subscriber while a sibling stays active', async () => {
    const observer = observe();
    const detached: AuthPayload[] = [];
    const active: AuthPayload[] = [];

    const unsubscribeFirst = track(initCompanionSync((authData) => detached.push(authData)));
    track(initCompanionSync((authData) => active.push(authData)));

    observer.post({ type: 'AUTH_SYNC', payload: VALID });
    await settle();
    expect(detached.length).toBe(1);
    expect(active.length).toBe(1);

    unsubscribeFirst();

    observer.post({ type: 'AUTH_SYNC', payload: { ...VALID, playerId: 'sess-99' } });
    await settle();

    expect(detached.length).toBe(1); // unchanged
    expect(active.length).toBe(2);
    expect(companionSyncSubscriberCount()).toBe(1);
  });

  it('re-arms the probe after the last subscriber detaches', async () => {
    const observer = observe();

    const unsubscribe = initCompanionSync(() => {});
    await settle();
    expect(observer.ofType('REQUEST_AUTH').length).toBe(1);

    unsubscribe();
    expect(companionSyncSubscriberCount()).toBe(0);

    track(initCompanionSync(() => {}));
    await settle();
    expect(observer.ofType('REQUEST_AUTH').length).toBe(2);
  });
});

// ── broadcastAuth fan-out ────────────────────────────────────────────────────

describe('broadcastAuth', () => {
  it('fans credentials out to sibling tabs without a local listener', async () => {
    const observer = observe();

    expect(broadcastAuth(VALID)).toBe(true);
    await settle();

    expect(observer.ofType('AUTH_SYNC')[0]).toEqual({ type: 'AUTH_SYNC', payload: VALID });
  });

  it('reuses the live singleton while this tab is listening', async () => {
    const observer = observe();
    const received: AuthPayload[] = [];
    track(initCompanionSync((authData) => received.push(authData)));

    expect(broadcastAuth({ ...VALID, token: 'tok-from-listener' })).toBe(true);
    await settle();

    // Other tabs receive it...
    expect(observer.ofType('AUTH_SYNC').at(-1)).toEqual({
      type: 'AUTH_SYNC',
      payload: { ...VALID, token: 'tok-from-listener' },
    });
    // ...and a BroadcastChannel never echoes to its own posting context.
    expect(received).toEqual([]);
  });

  it.each([
    ['a partial payload', { roomCode: 'r', token: 't' }],
    ['blank credentials', { roomCode: '', token: '', playerId: '' }],
  ])('refuses to broadcast %s', async (_label, candidate) => {
    const observer = observe();

    expect(broadcastAuth(candidate as AuthPayload)).toBe(false);
    await settle();

    expect(observer.ofType('AUTH_SYNC').length).toBe(0);
  });

  it('degrades to a no-op without a BroadcastChannel-capable context', () => {
    vi.stubGlobal('window', undefined);
    expect(broadcastAuth(VALID)).toBe(false);
    expect(initCompanionSync(() => {})).toBeInstanceOf(Function);
    expect(companionSyncSubscriberCount()).toBe(0);
  });
});



