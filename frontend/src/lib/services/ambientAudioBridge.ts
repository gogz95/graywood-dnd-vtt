// src/lib/services/ambientAudioBridge.ts
// Biome-to-Audio Bus Auto-Routing Bridge synchronized with SystemBus SCENE_CHANGE events

import { systemBus, type SystemBusPayloads } from './systemBus';
import { mapsDb } from '../db/mapsDb';
import { soundboardEngine, type AtmospherePreset } from '../audio/soundboardEngine';
import type { BiomeType, WeatherSettings } from '../types/maps';

const BIOME_PRESET_MAP: Record<BiomeType, AtmospherePreset> = {
  dungeon: 'dungeon',
  forest: 'wind',
  tavern: 'tavern',
  coastal: 'wind',
  arctic: 'wind',
  city: 'tavern',
};

export class AmbientAudioBridge {
  private unsubSceneChange: (() => void) | null = null;
  private currentBiome: BiomeType | null = null;
  private currentWeather: WeatherSettings | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.init();
    }
  }

  public init(): void {
    if (this.unsubSceneChange) return;

    this.unsubSceneChange = systemBus.on('SCENE_CHANGE', (payload) => {
      this.handleSceneChange(payload);
    });
  }

  public async handleSceneChange(payload: SystemBusPayloads['SCENE_CHANGE']): Promise<void> {
    try {
      if (payload.mapType === 'tactical') {
        const battlemap = await mapsDb.tacticalMaps.get(payload.mapId);
        if (battlemap) {
          const biome = battlemap.biome || 'dungeon';
          const weather = battlemap.weather || { type: 'clear', intensity: 0 };
          await this.routeBiomeAndWeather(biome, weather);
        }
      } else if (payload.mapType === 'atlas') {
        const atlas = await mapsDb.atlasMaps.get(payload.mapId);
        if (atlas) {
          const biome = atlas.biome || 'forest';
          await this.routeBiomeAndWeather(biome, { type: 'clear', intensity: 0 });
        }
      }
    } catch (err) {
      console.warn('AmbientAudioBridge error routing scene audio:', err);
    }
  }

  public async routeBiomeAndWeather(biome: BiomeType, weather: WeatherSettings): Promise<void> {
    this.currentBiome = biome;
    this.currentWeather = weather;

    // If heavy rain is active, rain takes environmental precedence
    if (weather.type === 'rain' && weather.intensity >= 0.4) {
      await soundboardEngine.crossfadeAtmosphere('rain', 2000);
      return;
    }

    // Otherwise route based on map's ambient biome
    const targetPreset = BIOME_PRESET_MAP[biome] || 'dungeon';
    await soundboardEngine.crossfadeAtmosphere(targetPreset, 2000);
  }

  public destroy(): void {
    if (this.unsubSceneChange) {
      this.unsubSceneChange();
      this.unsubSceneChange = null;
    }
  }
}

export const ambientAudioBridge = new AmbientAudioBridge();
