// src/lib/stores/projectorStore.svelte.ts
// Projector Casting Switchboard & Synchronization via BroadcastChannel
// Also owns the global privacy-curtain state ({ isCurtained, customCurtainImage, splashText })
// and the DM ↔ projector camera mirror lock (isCameraLocked).

import { curtainStore } from './curtainStore.svelte';
import { sendWsEvent } from '../../stores/websocketStore';
import { canvasStore } from '../../stores/canvasStore.svelte';

function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
}

/** Emits an event on the Tauri event bus to all native windows (no-op in browsers). */
async function emitTauriEvent(name: string, payload: unknown): Promise<void> {
  if (!isTauriEnvironment()) return;
  try {
    const { emit } = await import('@tauri-apps/api/event');
    await emit(name, payload);
  } catch {
    // Tauri event bus unavailable — BC/WS fan-out still covers other surfaces
  }
}

export type ProjectorCastSource = 'battlemap' | 'atlas' | 'blackout' | 'handout';

export interface ProjectorPlayerSettings {
  showGrid: boolean;
  showHealthBars: boolean;
  showNames: boolean;
}

export interface ProjectorHandoutPayload {
  id: string;
  title: string;
  playerContent: string;
  imageUrl?: string;
}

/** Global privacy curtain state surfaced to the /projector route. */
export interface ProjectorCurtainState {
  isCurtained: boolean;
  customCurtainImage?: string;
  splashText?: string;
}

export interface ProjectorSyncMessage {
  type:
    | 'PROJECTOR_SYNC'
    | 'SET_CAST_SOURCE'
    | 'SET_ACTIVE_MAP'
    | 'UPDATE_SETTINGS'
    | 'SET_HANDOUT'
    | 'PROJECTOR_CURTAIN_TOGGLE'
    | 'SET_CAMERA_LOCK';
  castSource: ProjectorCastSource;
  activeMapId: string | null;
  playerSettings: ProjectorPlayerSettings;
  handout?: ProjectorHandoutPayload | null;
  /** Present on PROJECTOR_CURTAIN_TOGGLE messages. */
  isCurtained?: boolean;
  customCurtainImage?: string;
  splashText?: string;
  /** Present on SET_CAMERA_LOCK messages. */
  isCameraLocked?: boolean;
  timestamp: number;
}

const STORAGE_KEY = 'vtt_projector_state';
const CHANNEL_NAME = 'vtt_projector_stream';

class ProjectorStore {
  castSource = $state<ProjectorCastSource>('battlemap');
  previousSource = $state<ProjectorCastSource>('battlemap');
  activeMapId = $state<string | null>(null);
  activeHandout = $state<ProjectorHandoutPayload | null>(null);
  playerSettings = $state<ProjectorPlayerSettings>({
    showGrid: true,
    showHealthBars: false,
    showNames: true,
  });
  physicalPpi = $state<number>(
    typeof localStorage !== 'undefined'
      ? Number(localStorage.getItem('vtt_projector_physical_ppi')) || 96
      : 96
  );

  // ── Global Privacy Curtain (F9 / Ctrl+B) ────────────────────────────────
  isCurtained = $state(false);
  customCurtainImage = $state<string | undefined>(undefined);
  splashText = $state<string | undefined>(undefined);

  // ── Camera Mirror Lock (true = projector follows DM viewport) ───────────
  isCameraLocked = $state<boolean>(
    typeof localStorage !== 'undefined'
      ? localStorage.getItem('vtt_projector_camera_locked') !== 'false'
      : true
  );

  private channel: BroadcastChannel | null = null;

  constructor() {
    this.loadState();
    this.initChannel();

    // Mirror any curtain change from any surface (hotkey, header button, WS)
    // into the projector curtain state so /projector always reflects truth.
    curtainStore.onChange((active, splashUrl) => {
      if (this.isCurtained !== active) this.isCurtained = active;
      if (this.customCurtainImage !== splashUrl) this.customCurtainImage = splashUrl;
    });
    this.isCurtained = curtainStore.active;
    this.customCurtainImage = curtainStore.splashImageUrl;
  }

  private loadState(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.castSource) this.castSource = saved.castSource;
        if (saved.previousSource) this.previousSource = saved.previousSource;
        if (saved.activeMapId !== undefined) this.activeMapId = saved.activeMapId;
        if (saved.activeHandout !== undefined) this.activeHandout = saved.activeHandout;
        if (saved.playerSettings) {
          this.playerSettings = {
            ...this.playerSettings,
            ...saved.playerSettings,
          };
        }
      }
    } catch {
      // ignore
    }
  }

  private saveState(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          castSource: this.castSource,
          previousSource: this.previousSource,
          activeMapId: this.activeMapId,
          activeHandout: this.activeHandout,
          playerSettings: this.playerSettings,
        })
      );
    } catch {
      // ignore
    }
  }

  private initChannel(): void {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
    try {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = (event: MessageEvent<ProjectorSyncMessage>) => {
        const data = event.data;
        if (!data) return;
        if (data.castSource) this.castSource = data.castSource;
        if (data.activeMapId !== undefined) this.activeMapId = data.activeMapId;
        if (data.handout !== undefined) this.activeHandout = data.handout;
        if (data.playerSettings) {
          this.playerSettings = {
            ...this.playerSettings,
            ...data.playerSettings,
          };
        }
        if (data.type === 'PROJECTOR_CURTAIN_TOGGLE' && typeof data.isCurtained === 'boolean') {
          this.applyCurtainState(data.isCurtained, data.customCurtainImage, data.splashText, false);
        }
        if (data.type === 'SET_CAMERA_LOCK' && typeof data.isCameraLocked === 'boolean') {
          this.isCameraLocked = data.isCameraLocked;
          this.persistCameraLock();
        }
      };
    } catch {
      // BroadcastChannel unavailable
    }
  }

  private broadcast(): void {
    this.saveState();
    if (!this.channel) return;
    try {
      const payload: ProjectorSyncMessage = {
        type: 'PROJECTOR_SYNC',
        castSource: this.castSource,
        activeMapId: this.activeMapId,
        playerSettings: { ...this.playerSettings },
        handout: this.activeHandout,
        timestamp: Date.now(),
      };
      this.channel.postMessage(payload);
    } catch {
      // ignore postMessage failures
    }
  }

  setCastingSource(source: ProjectorCastSource): void {
    if (this.castSource !== 'handout') {
      this.previousSource = this.castSource;
    }
    this.castSource = source;
    this.broadcast();
  }

  setHandout(handout: ProjectorHandoutPayload | null): void {
    this.activeHandout = handout;
    if (handout) {
      if (this.castSource !== 'handout') {
        this.previousSource = this.castSource;
      }
      this.castSource = 'handout';
    }
    this.broadcast();
  }

  returnToMap(): void {
    this.castSource = this.previousSource === 'handout' ? 'battlemap' : this.previousSource;
    this.broadcast();
  }

  setActiveMap(id: string | null): void {
    this.activeMapId = id;
    this.broadcast();
  }

  toggleBlackout(): void {
    if (this.castSource === 'blackout') {
      this.castSource = this.previousSource === 'blackout' ? 'battlemap' : this.previousSource;
    } else {
      this.previousSource = this.castSource;
      this.castSource = 'blackout';
    }
    this.broadcast();
  }

  setPhysicalPpi(ppi: number): void {
    this.physicalPpi = ppi;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('vtt_projector_physical_ppi', String(ppi));
      } catch {}
    }
  }

  updateSettings(partial: Partial<ProjectorPlayerSettings>): void {
    this.playerSettings = {
      ...this.playerSettings,
      ...partial,
    };
    this.broadcast();
  }

  // ── Global Privacy Curtain ──────────────────────────────────────────────

  /**
   * Toggles the F9 / Ctrl+B privacy curtain. Delegates authoritative state to
   * curtainStore (BroadcastChannel + REST/WS fan-out) and broadcasts a
   * PROJECTOR_CURTAIN_TOGGLE message to same-process projector windows.
   */
  toggleCurtain(splashUrl?: string): void {
    const next = !curtainStore.active;
    const image = splashUrl ?? this.customCurtainImage;
    this.applyCurtainState(next, image, this.splashText, true);

    // WebSocket fan-out (ws.rs dispatches PROJECTOR_CURTAIN_TOGGLE to all clients)
    sendWsEvent({
      type: 'PROJECTOR_CURTAIN_TOGGLE',
      payload: { isCurtained: next, splash_image_url: image },
    });

    // Tauri event emitter (native multi-window)
    emitTauriEvent('PROJECTOR_CURTAIN_TOGGLE', { isCurtained: next, splash_image_url: image });

    // REST fallback so network clients still converge if the socket is down
    void fetch('/api/scene/curtain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: next, splash_image_url: image }),
    }).catch(() => {
      /* offline fallback — BC + WS already applied locally */
    });
  }

  setCurtain(isCurtained: boolean, splashUrl?: string): void {
    if (this.isCurtained === isCurtained && this.customCurtainImage === splashUrl) return;
    this.applyCurtainState(isCurtained, splashUrl, this.splashText, true);
  }

  /** Assigns a custom curtain backdrop image without toggling curtain visibility. */
  setCurtainImage(imageUrl?: string): void {
    this.customCurtainImage = imageUrl;
    this.postCurtainMessage();
  }

  /** Assigns the splash line rendered over the curtain ("Session in Progress"). */
  setSplashText(text?: string): void {
    this.splashText = text;
    this.postCurtainMessage();
  }

  private applyCurtainState(
    isCurtained: boolean,
    splashUrl?: string,
    splash?: string,
    broadcastToCurtainStore = true
  ): void {
    this.isCurtained = isCurtained;
    this.customCurtainImage = splashUrl;
    this.splashText = splash;
    if (broadcastToCurtainStore) {
      // curtainStore fans out to BroadcastChannel + REST (/api/scene/curtain → WS).
      curtainStore.set(isCurtained, splashUrl);
    }
    this.postCurtainMessage();
  }

  private postCurtainMessage(): void {
    if (!this.channel) return;
    try {
      this.channel.postMessage(this.buildMessage('PROJECTOR_CURTAIN_TOGGLE', {
        isCurtained: this.isCurtained,
        customCurtainImage: this.customCurtainImage,
        splashText: this.splashText,
      }));
    } catch {
      // ignore postMessage failures
    }
  }

  // ── Camera Mirror Lock ──────────────────────────────────────────────────

  /**
   * Toggles the "Mirror TV Camera" lock. When locked (true), throttled DM
   * pans/zooms are broadcast and /projector lerps to match; when unlocked the
   * projector camera stays independent (or centers on the active turn).
   */
  toggleCameraLock(): void {
    this.setCameraLocked(!this.isCameraLocked);
  }

  setCameraLocked(locked: boolean): void {
    const changed = this.isCameraLocked !== locked;
    this.isCameraLocked = locked;
    if (changed) {
      this.persistCameraLock();
      if (this.channel) {
        try {
          this.channel.postMessage(this.buildMessage('SET_CAMERA_LOCK', { isCameraLocked: locked }));
        } catch {
          // ignore postMessage failures
        }
      }
    }
    // Keep the legacy decoupling flag coherent (inverse semantics:
    // lockProjectorPan=true means "TV Decoupled", isCameraLocked=true means "Mirrored").
    if (canvasStore.lockProjectorPan === locked) {
      canvasStore.toggleLockProjectorPan();
    }
  }

  private persistCameraLock(): void {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('vtt_projector_camera_locked', String(this.isCameraLocked));
      } catch {
        // storage quota
      }
    }
  }

  private buildMessage(
    type: ProjectorSyncMessage['type'],
    extra: Partial<ProjectorSyncMessage> = {}
  ): ProjectorSyncMessage {
    return {
      type,
      castSource: this.castSource,
      activeMapId: this.activeMapId,
      playerSettings: { ...this.playerSettings },
      handout: this.activeHandout,
      timestamp: Date.now(),
      ...extra,
    };
  }
}

export const projectorStore = new ProjectorStore();
