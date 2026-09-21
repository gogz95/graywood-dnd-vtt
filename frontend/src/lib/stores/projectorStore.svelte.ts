// src/lib/stores/projectorStore.svelte.ts
// Projector Casting Switchboard & Synchronization via BroadcastChannel

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

export interface ProjectorSyncMessage {
  type: 'PROJECTOR_SYNC' | 'SET_CAST_SOURCE' | 'SET_ACTIVE_MAP' | 'UPDATE_SETTINGS' | 'SET_HANDOUT';
  castSource: ProjectorCastSource;
  activeMapId: string | null;
  playerSettings: ProjectorPlayerSettings;
  handout?: ProjectorHandoutPayload | null;
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

  private channel: BroadcastChannel | null = null;

  constructor() {
    this.loadState();
    this.initChannel();
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

  updateSettings(partial: Partial<ProjectorPlayerSettings>): void {
    this.playerSettings = {
      ...this.playerSettings,
      ...partial,
    };
    this.broadcast();
  }
}

export const projectorStore = new ProjectorStore();
