// src/lib/services/battlematSyncBridge.ts
// Cross-Window Sync Bus synchronizing DM canvas to projector via BroadcastChannel & WebSockets

import { canvasStore, type CanvasStateSnapshot } from '../stores/canvasStore';
import { sessionStore } from '../stores/sessionStore';

const CHANNEL_NAME = 'dnd_battlemat_sync';
let broadcastChannel: BroadcastChannel | null = null;

if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
}

export type SyncMessage =
  | { type: 'REQUEST_INITIAL_STATE' }
  | { type: 'SYNC_FULL_STATE'; payload: CanvasStateSnapshot }
  | { type: 'TOKEN_MOVE'; tokenId: string; x: number; y: number }
  | { type: 'GRID_UPDATE'; gridSize: number; gridColor: string }
  | { type: 'MAP_TEXTURE_UPDATE'; url: string; width: number; height: number }
  | { type: 'WALL_GEOMETRY_UPDATE'; mapId: string; walls: any[] }
  | { type: 'FOG_UPDATE'; polygons: Array<Array<{ x: number; y: number }>> }
  | { type: 'PING_POINT'; x: number; y: number; color: string; sender_name: string };

export function broadcastBattlematUpdate(message: SyncMessage) {
  broadcastChannel?.postMessage(message);
  sessionStore.sendWebSocketMessage({
    type: 'BATTLEMAT_WS_EVENT',
    event: message
  });
}

export function initDmSyncListener() {
  if (!broadcastChannel) return;
  broadcastChannel.onmessage = (event: MessageEvent<SyncMessage>) => {
    if (event.data?.type === 'REQUEST_INITIAL_STATE') {
      broadcastBattlematUpdate({
        type: 'SYNC_FULL_STATE',
        payload: canvasStore.getSnapshot()
      });
    }
  };
}

export function cleanupDmSyncListener() {
  if (broadcastChannel) {
    broadcastChannel.onmessage = null;
  }
}

export function initProjectorSyncListener(onUpdate: (msg: SyncMessage) => void) {
  if (broadcastChannel) {
    broadcastChannel.onmessage = (event: MessageEvent<SyncMessage>) => {
      onUpdate(event.data);
    };
  }

  const unsubWs = sessionStore.subscribe((state) => {
    const last = state.lastReceivedEvent;
    if (last?.type === 'BATTLEMAT_WS_EVENT' && last.event) {
      onUpdate(last.event);
    }
  });

  broadcastBattlematUpdate({ type: 'REQUEST_INITIAL_STATE' });
  return () => unsubWs();
}
