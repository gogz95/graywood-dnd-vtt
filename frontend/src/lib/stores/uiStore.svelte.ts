// src/lib/stores/uiStore.svelte.ts
// Primary DM Workstation navigation state & active workspace view store

export type ActiveWorkspaceView = 'canvas' | 'atlas' | 'bestiary' | 'compendium' | 'party' | 'journal';

class UiStore {
  activeView = $state<ActiveWorkspaceView>('canvas');
  isSettingsOpen = $state<boolean>(false);
  isSoundboardOpen = $state<boolean>(false);
  isMapManagerOpen = $state<boolean>(false);

  setActiveView(view: ActiveWorkspaceView) {
    this.activeView = view;
  }
}

export const uiStore = new UiStore();
