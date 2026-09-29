// src/lib/services/companionSync.ts
// Cross-Tab Auth & State Synchronization for the DM workstation, player portal,
// projector, and mobile companion surfaces.
//
// Credentials authenticated in one tab are fanned out to every other tab of the
// same origin over a single BroadcastChannel, so a newly opened workspace or
// player surface adopts the active session instead of re-prompting for a PIN.
//
// Protocol:
//   { type: 'REQUEST_AUTH' }                            => "does anyone hold credentials?"
//   { type: 'AUTH_SYNC', payload: AuthPayload }         => credential fan-out
//
// Defects resolved relative to the legacy `src/services/companionSync.ts`:
//   1. Listeners are attached with `addEventListener('message', ...)` rather than
//      assigning `.onmessage`, so concurrent subscribers no longer clobber each other.
//   2. The `REQUEST_AUTH` responder always replies with `{ type: 'AUTH_SYNC', payload }`.
//      The legacy implementation posted a bare payload, which the requester could
//      never match because its handler tested `event.data.type`.
//   3. Every credential field is validated before broadcast, so a null, undefined,
//      or partial payload is never emitted and never delivered to a subscriber.
//   4. `unsubscribe` is idempotent and the channel plus its `message` listener are
//      torn down once the last subscriber detaches.

export interface AuthPayload {
  /** Campaign / room identifier shared by every surface at the table. */
  roomCode: string;
  /**
   * Session credential this tab authenticated with: the player session token
   * issued by `AUTH_SUCCESS`, or the 4-digit table PIN for PIN-gated surfaces.
   */
  token: string;
  /** Authenticated player / character session identity. */
  playerId: string;
}

export type CompanionSyncMessage =
  | { type: 'REQUEST_AUTH' }
  | { type: 'AUTH_SYNC'; payload: AuthPayload };

export const COMPANION_SYNC_CHANNEL_NAME = 'vtt_companion_sync';

/**
 * Canonical sessionStorage keys for adopted credentials. Exported so stores and
 * routes share one definition instead of repeating string literals.
 */
export const COMPANION_AUTH_STORAGE_KEYS = {
  roomCode: 'vtt_last_room_code',
  token: 'vtt_last_player_token',
  playerId: 'vtt_last_session_id',
} as const;

type AuthListener = (authData: AuthPayload) => void;

/** Live channel singleton. Created lazily on first subscribe, closed when idle. */
let channel: BroadcastChannel | null = null;
let messageHandler: ((event: MessageEvent) => void) | null = null;

/** Registered subscribers. The channel is only kept alive while this is non-empty. */
const subscribers = new Set<AuthListener>();

/** BroadcastChannel is unavailable in SSR / Node-only execution and old engines. */
function isBroadcastSupported(): boolean {
  return typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined';
}

/**
 * Narrows an untrusted candidate to a complete `AuthPayload`.
 * Guards against undefined, null, partially-populated, and blank-string payloads.
 */
export function isValidAuthPayload(candidate: unknown): candidate is AuthPayload {
  if (!candidate || typeof candidate !== 'object') return false;

  const { roomCode, token, playerId } = candidate as Partial<AuthPayload>;

  return (
    typeof roomCode === 'string' &&
    roomCode.trim() !== '' &&
    typeof token === 'string' &&
    token.trim() !== '' &&
    typeof playerId === 'string' &&
    playerId.trim() !== ''
  );
}

/**
 * Reads the credentials this tab currently holds.
 * Returns `null` when any field is missing so callers never propagate partial auth.
 */
export function readLocalAuth(): AuthPayload | null {
  if (typeof sessionStorage === 'undefined') return null;

  try {
    const candidate = {
      roomCode: sessionStorage.getItem(COMPANION_AUTH_STORAGE_KEYS.roomCode) ?? '',
      token: sessionStorage.getItem(COMPANION_AUTH_STORAGE_KEYS.token) ?? '',
      playerId: sessionStorage.getItem(COMPANION_AUTH_STORAGE_KEYS.playerId) ?? '',
    };
    return isValidAuthPayload(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

/**
 * Persists credentials to `sessionStorage` so this tab can reconnect after a
 * reload. Returns false when storage is unavailable or the payload is incomplete.
 */
export function saveLocalAuth(authData: AuthPayload): boolean {
  if (typeof sessionStorage === 'undefined' || !isValidAuthPayload(authData)) return false;

  try {
    sessionStorage.setItem(COMPANION_AUTH_STORAGE_KEYS.roomCode, authData.roomCode);
    sessionStorage.setItem(COMPANION_AUTH_STORAGE_KEYS.token, authData.token);
    sessionStorage.setItem(COMPANION_AUTH_STORAGE_KEYS.playerId, authData.playerId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Clears adopted credentials on sign-out or auth rejection.
 */
export function clearLocalAuth(): void {
  if (typeof sessionStorage === 'undefined') return;

  try {
    sessionStorage.removeItem(COMPANION_AUTH_STORAGE_KEYS.roomCode);
    sessionStorage.removeItem(COMPANION_AUTH_STORAGE_KEYS.token);
    sessionStorage.removeItem(COMPANION_AUTH_STORAGE_KEYS.playerId);
  } catch {
    // storage unavailable / quota — nothing to clear
  }
}

/** Posts over the live singleton. Returns false when no channel is attached. */
function postToChannel(message: CompanionSyncMessage): boolean {
  if (!channel) return false;

  try {
    channel.postMessage(message);
    return true;
  } catch {
    return false;
  }
}

/**
 * Shared singleton message handler.
 * Replies to `REQUEST_AUTH` only when this tab actually holds valid credentials,
 * so a `null`/partial payload can never reach another tab.
 */
function handleMessage(event: MessageEvent): void {
  const data = event.data as CompanionSyncMessage | null | undefined;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'REQUEST_AUTH') {
    const cachedAuth = readLocalAuth();
    if (cachedAuth) {
      postToChannel({ type: 'AUTH_SYNC', payload: cachedAuth });
    }
    return;
  }

  if (data.type === 'AUTH_SYNC') {
    if (!isValidAuthPayload(data.payload)) return;

    // Snapshot so a subscriber unsubscribing mid-flight cannot mutate iteration.
    for (const listener of Array.from(subscribers)) {
      try {
        listener(data.payload);
      } catch {
        // isolate subscriber faults so one bad listener cannot break the fan-out
      }
    }
  }
}

/** Lazily creates the channel and attaches exactly one shared `message` listener. */
function attachChannel(): boolean {
  if (channel) return true;
  if (!isBroadcastSupported()) return false;

  try {
    channel = new BroadcastChannel(COMPANION_SYNC_CHANNEL_NAME);
    messageHandler = handleMessage;
    channel.addEventListener('message', messageHandler);
    return true;
  } catch {
    // BroadcastChannel unsupported at runtime — degrade to a no-op
    channel = null;
    messageHandler = null;
    return false;
  }
}

/** Removes the listener and closes the channel once no subscribers remain. */
function detachChannelIfIdle(): void {
  if (!channel || subscribers.size > 0) return;

  try {
    if (messageHandler) {
      channel.removeEventListener('message', messageHandler);
    }
    channel.close();
  } catch {
    // already closed / detached
  }

  channel = null;
  messageHandler = null;
}

/**
 * Subscribes to cross-tab credential fan-out.
 *
 * On the first subscriber the channel is created and a `REQUEST_AUTH` probe is
 * broadcast so an already-authenticated tab (another webview, player portal, or
 * projector window) volunteers its credentials. The probe is emitted once per
 * channel lifecycle, so N subscribers inside one tab produce one prompt rather
 * than N duplicate `AUTH_SYNC` responses.
 *
 * @param onAuthReceived Invoked with each validated `AuthPayload` received.
 * @returns Idempotent unsubscribe callback. The channel is closed and its
 *          `message` listener removed once the last subscriber detaches.
 */
export function initCompanionSync(onAuthReceived: AuthListener): () => void {
  if (typeof onAuthReceived !== 'function') {
    return () => {};
  }

  const isFirstSubscriber = subscribers.size === 0;

  if (isFirstSubscriber) {
    // A context with no usable channel can never deliver, so retain no phantom
    // subscriber and hand back a no-op unsubscribe.
    if (!attachChannel()) {
      return () => {};
    }
    // Prompt already-authenticated tabs to fan out credentials.
    postToChannel({ type: 'REQUEST_AUTH' });
  }

  subscribers.add(onAuthReceived);

  let disposed = false;

  return () => {
    if (disposed) return;
    disposed = true;

    subscribers.delete(onAuthReceived);
    detachChannelIfIdle();
  };
}

/**
 * Fans credentials out to every other tab immediately after this tab
 * authenticates. Call this alongside persisting credentials locally — it does not
 * write to storage itself.
 *
 * Reuses the live singleton when this tab is already listening; otherwise it
 * posts over a transient channel. Per the BroadcastChannel specification the
 * message is queued onto every other port's event loop before `postMessage()`
 * returns, so closing the sender immediately cannot drop it.
 *
 * @returns true when the message was handed to a BroadcastChannel.
 */
export function broadcastAuth(authData: AuthPayload): boolean {
  if (!isBroadcastSupported() || !isValidAuthPayload(authData)) return false;

  const message: CompanionSyncMessage = { type: 'AUTH_SYNC', payload: authData };

  if (channel) {
    return postToChannel(message);
  }

  try {
    const transient = new BroadcastChannel(COMPANION_SYNC_CHANNEL_NAME);
    transient.postMessage(message);
    transient.close();
    return true;
  } catch {
    return false;
  }
}

/**
 * Number of live subscribers. Exposed for diagnostics and test assertions.
 */
export function companionSyncSubscriberCount(): number {
  return subscribers.size;
}

