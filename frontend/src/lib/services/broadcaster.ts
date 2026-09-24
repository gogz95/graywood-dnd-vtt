// src/lib/services/broadcaster.ts
// Cross-window and LAN Handout & Media Broadcasting Service

export interface HandoutPayload {
  id?: string;
  title: string;
  url?: string;
  content?: string;
  image_url?: string;
  caption?: string;
  mediaId?: string;
}

export type BroadcastHandoutEvent =
  | { type: 'SHOW_HANDOUT'; payload: HandoutPayload }
  | { type: 'HIDE_HANDOUT' };

const CHANNEL_NAME = 'graywood_vtt_channel';
const STORAGE_KEY = 'vtt_active_projector_handout';

class BroadcasterService {
  private channel: BroadcastChannel | null = null;
  private listeners: Set<(event: BroadcastHandoutEvent) => void> = new Set();
  currentHandout: HandoutPayload | null = null;

  constructor() {
    this.initSync();
  }

  private initSync() {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.currentHandout = JSON.parse(stored);
      }
    } catch {
      // storage quota or parsing safe
    }

    if ('BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel(CHANNEL_NAME);
        this.channel.onmessage = (event: MessageEvent<BroadcastHandoutEvent>) => {
          if (event.data?.type === 'SHOW_HANDOUT') {
            this.currentHandout = event.data.payload;
            this.notify(event.data);
          } else if (event.data?.type === 'HIDE_HANDOUT') {
            this.currentHandout = null;
            this.notify(event.data);
          }
        };
      } catch {
        // fallback
      }
    }
  }

  showHandout(payload: HandoutPayload): void {
    this.currentHandout = payload;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // ignore
      }
    }

    const msg: BroadcastHandoutEvent = { type: 'SHOW_HANDOUT', payload };
    try {
      this.channel?.postMessage(msg);
    } catch {
      // ignore
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vtt:handout-event', { detail: msg }));
    }
    this.notify(msg);
  }

  hideHandout(): void {
    this.currentHandout = null;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    }

    const msg: BroadcastHandoutEvent = { type: 'HIDE_HANDOUT' };
    try {
      this.channel?.postMessage(msg);
    } catch {
      // ignore
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vtt:handout-event', { detail: msg }));
    }
    this.notify(msg);
  }

  subscribe(listener: (event: BroadcastHandoutEvent) => void): () => void {
    this.listeners.add(listener);
    if (this.currentHandout) {
      listener({ type: 'SHOW_HANDOUT', payload: this.currentHandout });
    }
    return () => this.listeners.delete(listener);
  }

  private notify(event: BroadcastHandoutEvent) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

export const broadcaster = new BroadcasterService();
