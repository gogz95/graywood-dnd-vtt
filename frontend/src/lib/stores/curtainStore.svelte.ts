// frontend/src/lib/stores/curtainStore.svelte.ts
// Authoritative DM Staging Curtain ("Blackout Veil") store in Svelte 5 runes.
// Synchronizes across dual windows/screens via BroadcastChannel and backend /api/scene/curtain

class CurtainStore {
  active = $state(false);
  splashImageUrl = $state<string | undefined>(undefined);
  private channel: BroadcastChannel | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.channel = new BroadcastChannel('vtt_curtain_sync');
      this.channel.onmessage = (event) => {
        if (event.data?.type === 'PROJECTOR_CURTAIN_STATE') {
          this.active = Boolean(event.data.active);
          this.splashImageUrl = event.data.splash_image_url;
        }
      };
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
    this.active = val;
    this.splashImageUrl = splashUrl;
    this.broadcast(val, splashUrl);
  }

  async toggle(splashUrl?: string) {
    const next = !this.active;
    // Optimistically update & broadcast immediately across windows
    this.active = next;
    this.splashImageUrl = splashUrl;
    this.broadcast(next, splashUrl);

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
    this.active = active;
    this.splashImageUrl = splashUrl;
    this.broadcast(active, splashUrl);

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
