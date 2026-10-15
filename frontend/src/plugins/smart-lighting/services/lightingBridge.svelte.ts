// frontend/src/plugins/smart-lighting/services/lightingBridge.svelte.ts
// Smart Room Lighting Automation Bridge (Home Assistant / Philips Hue Webhooks)

export interface LightingPreset {
  id: string;
  name: string;
  hexColor: string;
  brightnessPct: number; // 0 to 100
  transitionMs: number;
}

export const BUILTIN_PRESETS: LightingPreset[] = [
  {
    id: 'tavern',
    name: 'Tavern (Warm Amber)',
    hexColor: '#ff9329',
    brightnessPct: 75,
    transitionMs: 1000
  },
  {
    id: 'crypt',
    name: 'Dungeon / Crypt (Cold Slate Blue)',
    hexColor: '#3b5998',
    brightnessPct: 30,
    transitionMs: 1500
  },
  {
    id: 'wilderness_day',
    name: 'Wilderness Daylight White',
    hexColor: '#fff4e5',
    brightnessPct: 90,
    transitionMs: 2000
  },
  {
    id: 'combat_alert',
    name: 'Combat Alert (Deep Crimson)',
    hexColor: '#991b1b',
    brightnessPct: 60,
    transitionMs: 500
  }
];

const STORAGE_KEY = 'vtt_plugin_smart_lights';

export class LightingBridge {
  webhookUrl = $state<string>('');
  autoReactToCombat = $state<boolean>(true);
  activePreset = $state<LightingPreset | null>(null);

  constructor() {
    this.loadSettings();
  }

  loadSettings(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.webhookUrl === 'string') this.webhookUrl = parsed.webhookUrl;
        if (typeof parsed.autoReactToCombat === 'boolean') {
          this.autoReactToCombat = parsed.autoReactToCombat;
        }
      }
    } catch {
      // safe fallback
    }
  }

  saveSettings(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          webhookUrl: this.webhookUrl,
          autoReactToCombat: this.autoReactToCombat
        })
      );
    } catch {
      // safe fallback
    }
  }

  setWebhookUrl(url: string): void {
    this.webhookUrl = url;
    this.saveSettings();
  }

  setAutoReactToCombat(enabled: boolean): void {
    this.autoReactToCombat = enabled;
    this.saveSettings();
  }

  async triggerRoomState(preset: LightingPreset): Promise<void> {
    this.activePreset = preset;
    if (!this.webhookUrl) return;

    try {
      await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(preset)
      });
    } catch {
      // Non-blocking: silently ignore network errors when offline
    }
  }

  async triggerTransientFlash(hexColor: string, durationMs = 1200): Promise<void> {
    if (!this.webhookUrl) return;

    const previousPreset = this.activePreset || BUILTIN_PRESETS[0];

    const flashPreset: LightingPreset = {
      id: `flash_${Date.now()}`,
      name: 'Transient Flash',
      hexColor,
      brightnessPct: 100,
      transitionMs: 150
    };

    try {
      await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(flashPreset)
      });

      setTimeout(() => {
        if (this.webhookUrl) {
          fetch(this.webhookUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(previousPreset)
          }).catch(() => {});
        }
      }, durationMs);
    } catch {
      // Non-blocking: silently ignore network errors when offline
    }
  }
}

export const lightingBridge = new LightingBridge();

export function triggerRoomState(preset: LightingPreset): Promise<void> {
  return lightingBridge.triggerRoomState(preset);
}

export function triggerTransientFlash(hexColor: string, durationMs = 1200): Promise<void> {
  return lightingBridge.triggerTransientFlash(hexColor, durationMs);
}
