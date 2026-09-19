export type ThemeMode = 'obsidian' | 'parchment' | 'high-contrast';
export type DisplayMode = 'DM_COMMAND' | 'PLAYER_VIEW' | 'COMPACT';

export interface UiThemeSettings {
  theme: ThemeMode;
  scaling: number; // 80 to 125 percent
  displayMode: DisplayMode;
}

class UiThemeStore {
  theme = $state<ThemeMode>('obsidian');
  scaling = $state<number>(100);
  displayMode = $state<DisplayMode>('DM_COMMAND');

  constructor() {
    this.init();
  }

  private init(): void {
    if (typeof window === 'undefined') return;

    try {
      const savedTheme = localStorage.getItem('vtt_theme') as ThemeMode | null;
      if (savedTheme && (savedTheme === 'obsidian' || savedTheme === 'parchment' || savedTheme === 'high-contrast')) {
        this.theme = savedTheme;
      }

      const savedScale = localStorage.getItem('vtt_ui_scaling');
      if (savedScale) {
        const parsed = parseInt(savedScale, 10);
        if (!isNaN(parsed) && parsed >= 80 && parsed <= 125) {
          this.scaling = parsed;
        }
      }

      const savedMode = localStorage.getItem('vtt_display_mode') as DisplayMode | null;
      if (savedMode && (savedMode === 'DM_COMMAND' || savedMode === 'PLAYER_VIEW' || savedMode === 'COMPACT')) {
        this.displayMode = savedMode;
      }

      this.applyDOMUpdates();
    } catch {
      // Fall back to default state
    }
  }

  public setTheme(mode: ThemeMode): void {
    this.theme = mode;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('vtt_theme', mode);
      } catch {
        // Storage quota or restriction
      }
      this.applyDOMUpdates();
    }
  }

  public setScaling(percent: number): void {
    const clamped = Math.max(80, Math.min(125, Math.round(percent)));
    this.scaling = clamped;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('vtt_ui_scaling', clamped.toString());
      } catch {
        // Storage quota or restriction
      }
      this.applyDOMUpdates();
    }
  }

  public setDisplayMode(mode: DisplayMode): void {
    this.displayMode = mode;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('vtt_display_mode', mode);
      } catch {
        // Storage quota or restriction
      }
    }
  }

  public applyDOMUpdates(): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.classList.remove('theme-obsidian', 'theme-parchment', 'theme-high-contrast');
    root.classList.add(`theme-${this.theme}`);
    root.style.fontSize = `${this.scaling}%`;
  }
}

export const uiTheme = new UiThemeStore();
