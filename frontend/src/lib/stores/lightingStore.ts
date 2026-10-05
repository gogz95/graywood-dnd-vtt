// frontend/src/lib/stores/lightingStore.ts
// Lighting, Environmental Cycle, and Darkvision/Ambient Light Store (Svelte 5 Runes)

export type EnvironmentTimeOfDay = 'daylight' | 'dusk' | 'night' | 'pitch_black';

export interface LightingState {
  ambientDarkness: number; // 0.0 (full daylight) to 0.85 - 0.95 (pitch black)
  ambientColor: string;    // Hex tint (e.g. '#030712' for night, '#fde68a' for dawn)
  timeOfDay: EnvironmentTimeOfDay;
  dynamicLightingEnabled: boolean;
  darkvisionEnabled: boolean;
  gmVisionOverride: boolean; // Shift+V: 30% ghost shroud overlay for DM omniscience
}

class LightingStore {
  ambientDarkness = $state<number>(0.85); // Default pitch-black dungeon / night
  ambientColor = $state<string>('#030712');
  timeOfDay = $state<EnvironmentTimeOfDay>('pitch_black');
  dynamicLightingEnabled = $state<boolean>(true);
  darkvisionEnabled = $state<boolean>(true);
  gmVisionOverride = $state<boolean>(false);

  setAmbientDarkness(val: number) {
    this.ambientDarkness = Math.max(0.0, Math.min(1.0, val));
  }

  setAmbientColor(color: string) {
    this.ambientColor = color;
  }

  setTimeOfDay(time: EnvironmentTimeOfDay) {
    this.timeOfDay = time;
    switch (time) {
      case 'daylight':
        this.ambientDarkness = 0.05;
        this.ambientColor = '#ffffff';
        break;
      case 'dusk':
        this.ambientDarkness = 0.50;
        this.ambientColor = '#1e1b4b';
        break;
      case 'night':
        this.ambientDarkness = 0.80;
        this.ambientColor = '#090d16';
        break;
      case 'pitch_black':
        this.ambientDarkness = 0.92;
        this.ambientColor = '#030712';
        break;
    }
  }

  toggleGmVisionOverride() {
    this.gmVisionOverride = !this.gmVisionOverride;
  }

  toggleDynamicLighting() {
    this.dynamicLightingEnabled = !this.dynamicLightingEnabled;
  }
}

export const lightingStore = new LightingStore();
