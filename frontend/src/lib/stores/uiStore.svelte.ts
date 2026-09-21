// src/lib/stores/uiStore.svelte.ts
// Primary DM Workstation navigation state, resolution adaptation & dynamic UI scale engine

export type ActiveWorkspaceView = 'canvas' | 'atlas' | 'bestiary' | 'compendium' | 'party' | 'journal';

class UiStore {
  activeView = $state<ActiveWorkspaceView>('canvas');
  isSettingsOpen = $state<boolean>(false);
  isSoundboardOpen = $state<boolean>(false);
  isMapManagerOpen = $state<boolean>(false);

  // UI Scale Factor (default 1.0, user adjustable 0.75 - 1.5)
  uiScale: number = $state(
    typeof localStorage !== 'undefined' ? Number(localStorage.getItem('graywood_ui_scale')) || 1.0 : 1.0
  );

  // Auto-detected client resolution state
  viewportWidth: number = $state(typeof window !== 'undefined' ? window.innerWidth : 1920);
  viewportHeight: number = $state(typeof window !== 'undefined' ? window.innerHeight : 1080);
  devicePixelRatio: number = $state(typeof window !== 'undefined' ? window.devicePixelRatio : 1);

  constructor() {
    if (typeof window !== 'undefined') {
      this.initViewportListeners();
      this.applyCssScale();
    }
  }

  setActiveView(view: ActiveWorkspaceView) {
    this.activeView = view;
  }

  setUiScale(factor: number) {
    this.uiScale = Math.min(Math.max(factor, 0.75), 1.5);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('graywood_ui_scale', this.uiScale.toString());
    }
    this.applyCssScale();
  }

  private applyCssScale() {
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--ui-scale', this.uiScale.toString());
      document.documentElement.style.fontSize = `${Math.round(this.uiScale * 100)}%`;
    }
  }

  private initViewportListeners() {
    const handleResize = () => {
      this.viewportWidth = window.innerWidth;
      this.viewportHeight = window.innerHeight;
      this.devicePixelRatio = window.devicePixelRatio || 1;
    };
    window.addEventListener('resize', handleResize);
  }
}

export const uiStore = new UiStore();
