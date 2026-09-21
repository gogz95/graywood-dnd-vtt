// src/lib/stores/targetingStore.svelte.ts
// Token Targeting State Store (Requirement 10)

class TargetingStore {
  activeTargetTokenId = $state<string | null>(null);

  setTarget(tokenId: string | null) {
    this.activeTargetTokenId = tokenId;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vtt:target-token-changed', { detail: { tokenId } }));
    }
  }

  clearTarget() {
    this.activeTargetTokenId = null;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vtt:target-token-changed', { detail: { tokenId: null } }));
    }
  }

  toggleTarget(tokenId: string) {
    if (this.activeTargetTokenId === tokenId) {
      this.clearTarget();
    } else {
      this.setTarget(tokenId);
    }
  }
}

export const targetingStore = new TargetingStore();
