// src/lib/services/syncClient.ts
// WebSocket synchronization client for player portal & companion displays
// Features exponential backoff, heartbeat pings, and mobile screen wake resynchronization.

import type { VttToken } from '$lib/stores/tokenStore.svelte';
import type { ChatMessage } from '$lib/services/chatCommandService';

class SyncClient {
  private ws: WebSocket | null = null;
  public isConnected = false;

  private retryCount = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private isManuallyClosed = false;

  private lastHostname = 'localhost';
  private lastPort: number | undefined = undefined;
  private listenersAttached = false;

  connect(hostname = 'localhost', port?: number) {
    if (typeof window === 'undefined') return;

    this.lastHostname = hostname;
    this.lastPort = port;
    this.isManuallyClosed = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.disconnect(false);
    }

    this.attachWakeListeners();

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const actualPort =
        port ||
        (window.location.port === '5173'
          ? 5174
          : parseInt(window.location.port, 10) || 5174);
      const targetHost = hostname || window.location.hostname || 'localhost';
      const url = `${protocol}//${targetHost}:${actualPort}/ws`;

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.retryCount = 0;
        this.startHeartbeat();

        // Request full state resynchronization on fresh connect or wake
        this.requestSync();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const eventType = data.type || data.event;
          const payload = data.payload || data.event || data;

          if (eventType === 'tokens:update' || data.tokens) {
            window.dispatchEvent(
              new CustomEvent<VttToken[]>('sync:tokens:update', {
                detail: data.payload || data.tokens || []
              })
            );
          } else if (eventType === 'chat:message' || data.message) {
            window.dispatchEvent(
              new CustomEvent<ChatMessage>('sync:chat:message', {
                detail: data.payload || data.message
              })
            );
          } else if (
            eventType === 'MAP_TEXTURE_UPDATE' ||
            payload?.type === 'MAP_TEXTURE_UPDATE'
          ) {
            const mapData =
              payload?.type === 'MAP_TEXTURE_UPDATE' ? payload : data;
            window.dispatchEvent(
              new CustomEvent('sync:map:update', { detail: mapData })
            );
          } else if (
            eventType === 'FOG_UPDATE' ||
            payload?.type === 'FOG_UPDATE'
          ) {
            const fogData = payload?.type === 'FOG_UPDATE' ? payload : data;
            window.dispatchEvent(
              new CustomEvent('sync:fog:update', {
                detail: fogData.polygons || []
              })
            );
          } else if (
            eventType === 'SYNC_FULL_STATE' ||
            payload?.type === 'SYNC_FULL_STATE'
          ) {
            const stateData = payload?.payload || payload;
            window.dispatchEvent(
              new CustomEvent('sync:full:update', { detail: stateData })
            );
          } else if (eventType === 'TOKEN_MOVE' || eventType === 'SPAWN_TOKEN') {
            window.dispatchEvent(
              new CustomEvent('sync:tokens:native', { detail: data })
            );
          } else if (eventType === 'BATTLEMAT_WS_EVENT' && data.event) {
            const sub = data.event;
            if (sub.type === 'MAP_TEXTURE_UPDATE') {
              window.dispatchEvent(
                new CustomEvent('sync:map:update', { detail: sub })
              );
            } else if (sub.type === 'FOG_UPDATE') {
              window.dispatchEvent(
                new CustomEvent('sync:fog:update', {
                  detail: sub.polygons || []
                })
              );
            } else if (sub.type === 'SYNC_FULL_STATE') {
              window.dispatchEvent(
                new CustomEvent('sync:full:update', { detail: sub.payload })
              );
            } else if (sub.type === 'TOKEN_MOVE') {
              window.dispatchEvent(
                new CustomEvent('sync:tokens:native', { detail: sub })
              );
            }
          }
        } catch {
          // ignore non-JSON messages
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.stopHeartbeat();
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.isConnected = false;
        this.stopHeartbeat();
      };
    } catch (err) {
      console.warn('SyncClient failed to establish WebSocket connection:', err);
      this.scheduleReconnect();
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send('ping', { timestamp: Date.now() });
      }
    }, 15000);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.isManuallyClosed) return;
    if (this.reconnectTimer) return;

    // Exponential backoff capped at 16 seconds
    const delay = Math.min(16000, 1000 * Math.pow(2, this.retryCount));
    this.retryCount += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect(this.lastHostname, this.lastPort);
    }, delay);
  }

  /**
   * Listens for mobile screen unlock, document visibility changes, and network recovery.
   */
  private attachWakeListeners() {
    if (this.listenersAttached || typeof window === 'undefined') return;
    this.listenersAttached = true;

    const handleWakeOrFocus = () => {
      if (document.visibilityState === 'visible') {
        if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
          this.connect(this.lastHostname, this.lastPort);
        } else {
          this.requestSync();
        }
      }
    };

    document.addEventListener('visibilitychange', handleWakeOrFocus);
    window.addEventListener('online', handleWakeOrFocus);
    window.addEventListener('focus', handleWakeOrFocus);
  }

  /**
   * Sends full-sync request across WebSocket and dispatches local sync signal.
   */
  public requestSync() {
    this.send('REQUEST_SYNC', { timestamp: Date.now() });
    this.send('sync:request', { timestamp: Date.now() });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sync:request:full'));
    }
  }

  send(event: string, payload: unknown) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ event, payload }));
      } catch {
        // buffer or ignore
      }
    }
  }

  disconnect(manual = true) {
    this.isManuallyClosed = manual;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.isConnected = false;
  }
}

export const syncClient = new SyncClient();
