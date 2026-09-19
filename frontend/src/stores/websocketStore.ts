import { writable } from 'svelte/store';
import type { WsEvent } from '../types/websocket';
import {
  applyHpUpdateFromWs,
  applyBlackOrbToggleFromWs,
} from './characterStore';

export const isWsConnectedStore = writable<boolean>(false);
export const latestDiceRollStore = writable<{
  characterId: string;
  formula: string;
  result: number;
  isCritical: boolean;
} | null>(null);
export const campaignDateStore = writable<{
  epochDays: number;
  formatted: string;
} | null>(null);

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;

export function initWebSocket(): void {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // If running in Vite dev server (port 5173), target the backend at 8080
  const host =
    window.location.port === '5173'
      ? `${window.location.hostname}:8080`
      : window.location.host;

  const wsUrl = `${protocol}//${host}/ws`;

  try {
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      isWsConnectedStore.set(true);
      reconnectAttempts = 0;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
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
        formula: event.formula,
        result: event.result,
        isCritical: event.is_critical,
      });
      break;

    case 'DATE_ADVANCED':
      campaignDateStore.set({
        epochDays: event.epoch_days,
        formatted: event.date_formatted,
      });
      break;

    case 'TOKEN_MOVE':
    case 'SYSTEM_MESSAGE':
      break;
  }
}

export function sendWsEvent(event: WsEvent): void {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(event));
  }
}
