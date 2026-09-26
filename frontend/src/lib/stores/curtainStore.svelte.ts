// frontend/src/lib/stores/curtainStore.svelte.ts
// Authoritative DM Staging Curtain ("Blackout Veil") store in Svelte 5 runes.

class CurtainStore {
  active = $state(false);

  set(val: boolean) {
    this.active = val;
  }

  async toggle() {
    const next = !this.active;
    try {
      await fetch('/api/scene/curtain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: next }),
      });
      // Optimistically update
      this.active = next;
    } catch (e) {
      console.error('Failed to toggle staging curtain:', e);
    }
  }

  async setActive(active: boolean) {
    try {
      await fetch('/api/scene/curtain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      });
      this.active = active;
    } catch (e) {
      console.error('Failed to set staging curtain:', e);
    }
  }
}

export const curtainStore = new CurtainStore();
