// frontend/src/lib/stores/curtainStore.svelte.ts
// Authoritative DM Staging Curtain ("Blackout Veil") store in Svelte 5 runes.
// Synchronizes across dual windows/screens via BroadcastChannel and backend /api/scene/curtain

class CurtainStore {
  active = $state(false);
  splashImageUrl = $state<string | undefined>(undefined);
  private channel: BroadcastChannel | null = null;
  /** External observers (e.g. projectorStore) notified on every curtain mutation. */
  private listeners = new Set<(active: boolean, splashUrl?: string) => void>();

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.channel = new BroadcastChannel('vtt_curtain_sync');
      this.channel.onmessage = (event) => {
        if (event.data?.type === 'PROJECTOR_CURTAIN_STATE') {
          this.active = Boolean(event.data.active);
          this.splashImageUrl = event.data.splash_image_url;
          this.notify();
        }
      };
    }
    this.initTauriListener();
  }

  /** Listen for native Tauri multi-window curtain toggles (no-op in browsers). */
  private async initTauriListener(): Promise<void> {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window || '__TAURI__' in window)) {
      return;
    }
    try {
      const { listen } = await import('@tauri-apps/api/event');
      await listen<{ isCurtained?: boolean; splash_image_url?: string }>(
        'PROJECTOR_CURTAIN_TOGGLE',
        (event) => {
          const isCurtained = event.payload?.isCurtained;
          if (typeof isCurtained === 'boolean') {
            this.set(isCurtained, event.payload?.splash_image_url);
          }
        }
      );
    } catch {
      // Tauri event bus unavailable
    }
  }

  /** Subscribe to curtain state changes originating from any surface. Returns an unsubscribe fn. */
  onChange(listener: (active: boolean, splashUrl?: string) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const listener of Array.from(this.listeners)) {
      try {
        listener(this.active, this.splashImageUrl);
      } catch (err) {
        console.warn('curtainStore onChange listener failed:', err);
      }
    }
  }

  private broadcast(active: boolean, splashUrl?: string) {
    if (this.channel) {
      try {
        this.channel.postMessage({
          type: 'PROJECTOR_CURTAIN_STATE',
          active,
          splash_image_url: splashUrl,
        });
      } catch {
        // ignore
      }
    }
  }

  set(val: boolean, splashUrl?: string) {
    // Idempotent guard: remote echoes of state we already hold must not re-broadcast.
    if (this.active === val && this.splashImageUrl === splashUrl) return;
    this.active = val;
    this.splashImageUrl = splashUrl;
    this.broadcast(val, splashUrl);
    this.notify();
  }

  async toggle(splashUrl?: string) {
    const next = !this.active;
    // Optimistically update & broadcast immediately across windows
    this.set(next, splashUrl);

    try {
      await fetch('/api/scene/curtain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: next, splash_image_url: splashUrl }),
      });
    } catch {
      // Offline fallback
    }
  }

  async setActive(active: boolean, splashUrl?: string) {
    this.set(active, splashUrl);

    try {
      await fetch('/api/scene/curtain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active, splash_image_url: splashUrl }),
      });
    } catch {
      // Offline fallback
    }
  }
}

export const curtainStore = new CurtainStore();
