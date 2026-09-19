import { writable } from 'svelte/store';
import type { WsEvent } from '../types/websocket';
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
export const latestDiceRollStore = writable<{
  characterId: string;
  characterName?: string;
  formula: string;
  result: number;
  isCritical: boolean;
  breakdown?: string;
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

export function initWebSocket(pin?: string): void {
  if (pin) {
    currentConnectedPin = pin;
  }
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    if (pin && socket.readyState === WebSocket.OPEN) {
      sendWsEvent({ type: 'AUTH_REQUEST', pin });
    }
    return;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // Target backend port 8080 when running frontend dev server
  const host =
    window.location.port === '5173'
      ? `${window.location.hostname}:8080`
      : window.location.host;

  const pinQuery = currentConnectedPin ? `?pin=${encodeURIComponent(currentConnectedPin)}` : '';
  const wsUrl = `${protocol}//${host}/ws${pinQuery}`;

  try {
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      isWsConnectedStore.set(true);
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
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    socket.onclose = () => {
      isWsConnectedStore.set(false);
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
      break;

    case 'DICE_ROLL':
      latestDiceRollStore.set({
        characterId: event.character_id,
        characterName: event.character_name,
        formula: event.formula,
        result: event.result,
        isCritical: event.is_critical,
        breakdown: event.breakdown,
      });
      break;

    case 'DATE_ADVANCED':
      campaignDateStore.set({
        epochDays: event.epoch_days,
        formatted: event.date_formatted,
      });
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

    case 'BLACK_ORB_TOGGLE': {
      applyBlackOrbToggleFromWs(event.character_id, event.is_orb_sealed);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vtt:black-orb-toggle', { detail: event }));
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

    case 'TOKEN_MOVE':
    case 'SYSTEM_MESSAGE':
    case 'AUTH_REQUEST':
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
