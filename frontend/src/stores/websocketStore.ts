import { writable } from 'svelte/store';
import type { WsEvent } from '../types/websocket';
import { vttTimeStore } from '../lib/stores/timeStore.svelte';
import { routeInboundWsEvent } from '../lib/network/wsRouter';
import {
  broadcastAuth,
  clearLocalAuth,
  COMPANION_AUTH_STORAGE_KEYS,
  initCompanionSync,
  isValidAuthPayload,
  readLocalAuth,
  saveLocalAuth,
  type AuthPayload,
} from '../lib/services/companionSync';
import {
  applyHpUpdateFromWs,
  applyBlackOrbToggleFromWs,
} from './characterStore';

export interface WhisperMessage {
  id: string;
  target_character_id?: string;
  target_pin?: string;
  sender_name: string;
  message: string;
  timestamp: number;
}

export interface CombatTurnSync {
  encounter_id: string;
  round: number;
  current_turn_index: number;
  combatants: Array<{
    id: string;
    name: string;
    initiative: number;
    is_active: boolean;
    is_on_deck: boolean;
    is_hidden?: boolean;
    is_player?: boolean;
    hp_percent?: number;
  }>;
}

export const isWsConnectedStore = writable<boolean>(false);
export const connectionStatusStore = writable<'disconnected' | 'connecting' | 'connected' | 'reconnecting'>('disconnected');
export const lastSessionIdStore = writable<string | null>(null);
export const lastRoomCodeStore = writable<string | null>(null);
export const lastPlayerTokenStore = writable<string | null>(null);
export const latestDiceRollStore = writable<{
  characterId: string;
  characterName?: string;
  formula: string;
  result: number;
  isCritical: boolean;
  breakdown?: string;
  seed?: number;
  vectors?: Array<{ x: number; y: number; angle: number; velocity: number }>;
} | null>(null);


export const campaignDateStore = writable<{
  epochDays: number;
  formatted: string;
} | null>(null);

function loadInitialWhispers(): WhisperMessage[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem('vtt_dm_whispers');
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return [];
}

export const dmWhispersStore = writable<WhisperMessage[]>(loadInitialWhispers());
export const combatTurnStore = writable<CombatTurnSync | null>(null);

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let currentConnectedPin: string | undefined = undefined;

// ── Cross-Tab Auth Synchronization (BroadcastChannel 'vtt_companion_sync') ────

/** Guards {@link initCompanionSyncAdoption} against duplicate subscriptions. */
let companionSyncInitialized = false;

/**
 * Persists a successful handshake and fans the credentials out to every other tab.
 *
 * `saveLocalAuth` writes the canonical keys read back by both `initWebSocket()`
 * session recovery and the companionSync `REQUEST_AUTH` responder, so a newly
 * opened workstation, player portal, or projector window adopts the live session
 * instead of re-prompting for a PIN.
 */
export function applyAuthSuccess(credentials: {
  sessionId?: string | null;
  roomCode?: string | null;
  token?: string | null;
}): void {
  const roomCode = String(credentials.roomCode ?? '').trim();
  const token = String(credentials.token ?? '').trim();
  const playerId = String(credentials.sessionId ?? '').trim();
  const authData: AuthPayload = { roomCode, token, playerId };

  if (isValidAuthPayload(authData)) {
    saveLocalAuth(authData);
    broadcastAuth(authData);
  } else if (typeof sessionStorage !== 'undefined') {
    // Partial handshake: keep the legacy reconnection bookkeeping but never
    // broadcast an incomplete credential set to sibling tabs.
    try {
      sessionStorage.setItem(COMPANION_AUTH_STORAGE_KEYS.playerId, playerId);
      sessionStorage.setItem(COMPANION_AUTH_STORAGE_KEYS.roomCode, roomCode);
      sessionStorage.setItem(COMPANION_AUTH_STORAGE_KEYS.token, token);
    } catch {
      // storage unavailable / quota
    }
  }

  lastSessionIdStore.set(playerId || null);
  lastRoomCodeStore.set(roomCode || null);
  lastPlayerTokenStore.set(token || null);
  connectionStatusStore.set('connected');
}

/**
 * Clears persisted credentials and cached session identity after an `AUTH_FAILURE`.
 */
export function applyAuthFailure(): void {
  clearLocalAuth();
  lastSessionIdStore.set(null);
  lastRoomCodeStore.set(null);
  lastPlayerTokenStore.set(null);
}

/**
 * Subscribes to credentials broadcast by an already-authenticated tab so a newly
 * opened surface inherits the session without re-prompting for a PIN.
 *
 * Only engages while this tab holds no credentials of its own, so a live session
 * is never clobbered by a sibling tab. Adoption is one-shot: the subscription
 * detaches after the first valid payload so a later unrelated `AUTH_SYNC` cannot
 * hijack an established connection.
 *
 * @returns Idempotent unsubscribe callback, or a no-op when this tab already has
 *          credentials or has already subscribed.
 */
export function initCompanionSyncAdoption(): () => void {
  if (companionSyncInitialized || readLocalAuth()) {
    return () => {};
  }

  let unsubscribe: (() => void) | null = null;

  const adoptOnce = (adopted: AuthPayload): void => {
    // One-shot: detach before reconnecting so the fan-out cannot double-fire.
    unsubscribe?.();
    unsubscribe = null;

    saveLocalAuth(adopted);
    lastSessionIdStore.set(adopted.playerId);
    lastRoomCodeStore.set(adopted.roomCode);
    lastPlayerTokenStore.set(adopted.token);

    // Reconnect using the recovered session — no PIN prompt.
    connectionStatusStore.set('reconnecting');
    initWebSocket();
  };

  companionSyncInitialized = true;
  unsubscribe = initCompanionSync(adoptOnce);

  return () => {
    unsubscribe?.();
    unsubscribe = null;
  };
}

export function initWebSocket(pin?: string): void {
  // Adopt a session broadcast by an already-authenticated tab when this tab holds
  // no credentials of its own. No-op once credentials exist in sessionStorage.
  initCompanionSyncAdoption();

  if (pin) {
    currentConnectedPin = pin;
  }

  // Try to recover session from sessionStorage on reconnect
  const cachedSessionId = sessionStorage.getItem('vtt_last_session_id');
  const cachedRoomCode = sessionStorage.getItem('vtt_last_room_code');
  const cachedPlayerToken = sessionStorage.getItem('vtt_last_player_token');

  if (cachedSessionId && cachedPlayerToken) {
    // Use cached credentials for reconnect attempt
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws?session_id=${encodeURIComponent(cachedSessionId)}&token=${encodeURIComponent(cachedPlayerToken)}`;

    try {
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        isWsConnectedStore.set(true);
        connectionStatusStore.set('connected');
        reconnectAttempts = 0;
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        if (currentConnectedPin) {
          sendWsEvent({ type: 'AUTH_REQUEST', pin: currentConnectedPin });
        }
      };

      socket.onmessage = (event) => {
        try {
          const data: WsEvent = JSON.parse(event.data);
          handleIncomingWsEvent(data);

          // Persist credentials locally, then fan them out across tabs.
          if (data.type === 'AUTH_SUCCESS') {
            applyAuthSuccess({
              sessionId: data.session_id,
              roomCode: data.campaign_name,
              token: data.token,
            });
          } else if (data.type === 'AUTH_FAILURE') {
            applyAuthFailure();
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      socket.onclose = () => {
        isWsConnectedStore.set(false);
        connectionStatusStore.set('disconnected');
        scheduleReconnect();
      };

      socket.onerror = (err) => {
        console.warn('WebSocket encountered error:', err);
        if (socket) {
          socket.close();
        }
      };
    } catch (err) {
      console.error('WebSocket connection failed to initialize:', err);
      scheduleReconnect();
    }
  } else {
    // No cached session, use PIN-based connection
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const pinQuery = currentConnectedPin ? `?pin=${encodeURIComponent(currentConnectedPin)}` : '';
    const wsUrl = `${protocol}//${host}/ws${pinQuery}`;

    try {
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        isWsConnectedStore.set(true);
        connectionStatusStore.set('connecting');
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        if (currentConnectedPin) {
          sendWsEvent({ type: 'AUTH_REQUEST', pin: currentConnectedPin });
        }
      };

      socket.onmessage = (event) => {
        try {
          const data: WsEvent = JSON.parse(event.data);
          handleIncomingWsEvent(data);

          // Persist credentials locally, then fan them out across tabs.
          if (data.type === 'AUTH_SUCCESS') {
            applyAuthSuccess({
              sessionId: data.session_id,
              roomCode: data.campaign_name,
              token: data.token,
            });
          } else if (data.type === 'AUTH_FAILURE') {
            applyAuthFailure();
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      socket.onclose = () => {
        isWsConnectedStore.set(false);
        connectionStatusStore.set('disconnected');
        scheduleReconnect();
      };

      socket.onerror = (err) => {
        console.warn('WebSocket encountered error:', err);
        if (socket) {
          socket.close();
        }
      };
    } catch (err) {
      console.error('WebSocket connection failed to initialize:', err);
      scheduleReconnect();
    }
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts), 10000);
  reconnectAttempts++;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    initWebSocket();
  }, delay);
}

function handleIncomingWsEvent(event: WsEvent): void {
  switch (event.type) {
    case 'HP_UPDATE':
      applyHpUpdateFromWs(event.character_id, event.current_hp, event.temp_hp);
      break;

    case 'BLACK_ORB_TOGGLE':
      applyBlackOrbToggleFromWs(event.character_id, event.is_orb_sealed);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vtt:black-orb-toggle', { detail: event }));
      }
      break;

    case 'DICE_ROLL':
      latestDiceRollStore.set({
        characterId: event.character_id,
        characterName: event.character_name,
        formula: event.formula,
        result: event.result,
        isCritical: event.is_critical,
        breakdown: event.breakdown,
        seed: event.seed,
        vectors: event.vectors,
      });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vtt:dice-roll', { detail: event }));
      }
      break;


    case 'DATE_ADVANCED':
      campaignDateStore.set({
        epochDays: event.epoch_days,
        formatted: event.date_formatted,
      });
      break;

    case 'TIME_UPDATE':
      vttTimeStore.applyWsUpdate(event);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vtt:time-update', { detail: event }));
      }
      break;

    case 'HANDOUT_BROADCAST':
      if (typeof window !== 'undefined') {
        localStorage.setItem('vtt_active_broadcast_handout', JSON.stringify(event));
        window.dispatchEvent(new CustomEvent('vtt:handout-broadcast', { detail: event }));
      }
      break;

    case 'HANDOUT_DISMISS':
      if (typeof window !== 'undefined') {
        localStorage.removeItem('vtt_active_broadcast_handout');
        window.dispatchEvent(new CustomEvent('vtt:handout-dismiss', { detail: event }));
      }
      break;

    case 'CHAT_MESSAGE':
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vtt:chat-message', { detail: event.message }));
      }
      break;

    case 'DM_WHISPER': {

      const whisper: WhisperMessage = {
        id: event.id,
        target_character_id: event.target_character_id,
        target_pin: event.target_pin,
        sender_name: event.sender_name,
        message: event.message,
        timestamp: event.timestamp,
      };
      dmWhispersStore.update((curr) => {
        const next = [whisper, ...curr].slice(0, 50);
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('vtt_dm_whispers', JSON.stringify(next));
        }
        return next;
      });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vtt:dm-whisper', { detail: whisper }));
      }
      break;
    }

    case 'COMBAT_INITIATIVE_UPDATE': {
      const syncData: CombatTurnSync = {
        encounter_id: event.encounter_id,
        round: event.round,
        current_turn_index: event.current_turn_index,
        combatants: event.combatants,
      };
      combatTurnStore.set(syncData);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vtt:combat-turn-sync', { detail: syncData }));
      }
      break;
    }

    case 'AUTH_FAILURE':
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vtt:auth-failure', { detail: event }));
      }
      break;

    case 'AUTH_SUCCESS':
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vtt:auth-success', { detail: event }));
      }
      break;

    case 'TRADE_OFFER':
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vtt:trade-offer', { detail: event }));
      }
      break;

    case 'TRADE_ACCEPT':
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vtt:trade-accept', { detail: event }));
      }
      break;

    case 'TRADE_DECLINE':
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vtt:trade-decline', { detail: event }));
      }
      break;

    case 'TRADE_AUDIT_LOG':
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vtt:trade-audit', { detail: event }));
      }
      break;

    case 'BATTLEMAT_WS_EVENT':
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vtt:battlemat-ws-event', { detail: event }));
      }
      break;

    case 'PING_POINT':
    case 'PingPoint':
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vtt:ping-point', { detail: event }));
      }
      break;

    case 'DRAWING_UPDATE':
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vtt:drawing-update', { detail: event }));
      }
      break;

    case 'PROP_UPDATE':
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vtt:prop-update', { detail: event }));
      }
      break;

    case 'TOKEN_MOVE':
    case 'TOKEN_SPAWNED':
    case 'TOKEN_UPDATED':
    case 'TOKEN_REMOVED':
    case 'STATE_SNAPSHOT':
    case 'TokenMoved':
    case 'TokenSpawned':
    case 'TokenUpdated':
    case 'TokenRemoved':
    case 'StateSnapshot':
    case 'STAGING_CURTAIN':
    case 'staging_curtain':
    case 'StagingCurtain':
      routeInboundWsEvent(event);
      break;

    case 'SYSTEM_MESSAGE':
    case 'AUTH_REQUEST':
      break;
    default:
      routeInboundWsEvent(event);
      break;
  }
}

export function sendWsEvent(event: WsEvent | any): void {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(event));
  }
  // Local event dispatch for same-window / LAN fallback
  if (typeof window !== 'undefined') {
    if (event?.type === 'TOGGLE_BLACK_ORB' || event?.type === 'BLACK_ORB_TOGGLE') {
      applyBlackOrbToggleFromWs(event.character_id, event.is_orb_sealed);
      window.dispatchEvent(new CustomEvent('vtt:black-orb-toggle', { detail: event }));
    } else if (event?.type === 'DRAWING_UPDATE') {
      window.dispatchEvent(new CustomEvent('vtt:drawing-update', { detail: event }));
    } else if (event?.type === 'TRADE_OFFER') {
      window.dispatchEvent(new CustomEvent('vtt:trade-offer', { detail: event }));
    } else if (event?.type === 'TRADE_ACCEPT') {
      window.dispatchEvent(new CustomEvent('vtt:trade-accept', { detail: event }));
    } else if (event?.type === 'TRADE_DECLINE') {
      window.dispatchEvent(new CustomEvent('vtt:trade-decline', { detail: event }));
    } else if (event?.type === 'TRADE_AUDIT_LOG') {
      window.dispatchEvent(new CustomEvent('vtt:trade-audit', { detail: event }));
    }
  }
}

/**
 * Dispatch an explicit auth rejection packet (useful for local simulation or client session listener)
 */
export function dispatchAuthFailure(message = 'Wrong PIN'): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('vtt:auth-failure', { detail: { type: 'AUTH_FAILURE', message } }));
  }
}

/**
 * Dispatch a local simulated whisper (useful for direct local testing or offline LAN fallback)
 */
export function dispatchLocalWhisper(whisper: WhisperMessage): void {
  dmWhispersStore.update((curr) => {
    const next = [whisper, ...curr].slice(0, 50);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('vtt_dm_whispers', JSON.stringify(next));
    }
    return next;
  });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('vtt:dm-whisper', { detail: whisper }));
  }
}
