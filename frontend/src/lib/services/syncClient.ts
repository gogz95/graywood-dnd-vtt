// src/lib/services/syncClient.ts
// WebSocket synchronization client for player portal & companion displays

import type { VttToken } from '$lib/stores/tokenStore.svelte';
import type { ChatMessage } from '$lib/services/chatCommandService';

class SyncClient {
  private ws: WebSocket | null = null;
  public isConnected = false;

  connect(hostname = 'localhost', port?: number) {
    if (typeof window === 'undefined') return;

    if (this.ws) {
      this.disconnect();
    }

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const actualPort = port || (window.location.port === '5173' ? 8080 : (parseInt(window.location.port, 10) || 8080));
      const targetHost = hostname || window.location.hostname || 'localhost';
      const url = `${protocol}//${targetHost}:${actualPort}/ws`;

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.isConnected = true;
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Handle various payload structures from LAN / Tauri broadcasts
          if (data.event === 'tokens:update' || data.type === 'tokens:update') {
            window.dispatchEvent(new CustomEvent<VttToken[]>('sync:tokens:update', {
              detail: data.payload || data.tokens || []
            }));
          } else if (data.event === 'chat:message' || data.type === 'chat:message') {
            window.dispatchEvent(new CustomEvent<ChatMessage>('sync:chat:message', {
              detail: data.payload || data.message
            }));
          } else if (data.type === 'TOKEN_MOVE' || data.type === 'SPAWN_TOKEN') {
            // Handle native backend combatant events
            window.dispatchEvent(new CustomEvent('sync:tokens:native', { detail: data }));
          }
        } catch {
          // ignore non-JSON messages
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
      };

      this.ws.onerror = () => {
        this.isConnected = false;
      };
    } catch (err) {
      console.warn('SyncClient failed to establish WebSocket connection:', err);
    }
  }

  send(event: string, payload: unknown) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event, payload }));
    }
  }

  disconnect() {
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
