<!-- src/lib/components/dm/SceneEnvironmentWidget.svelte -->
<!-- Floating DM Mini-Toolbar for dynamic scene weather, ambient darkness, and audio combat theme control -->

<script lang="ts">
  import { soundboardEngine } from '../../audio/soundboardEngine';
  import { mapsDb } from '../../db/mapsDb';
  import type { WeatherType } from '../../types/maps';

  let weatherType = $state<WeatherType>('clear');
  let weatherIntensity = $state(50); // 0-100
  let ambientDarkness = $state(0); // 0-100%
  let isMuted = $state(false);
  let prevVolume = 0.8;
  let isCombatMusicPlaying = $state(false);

  function handleWeatherChange() {
    const intensityNorm = weatherIntensity / 100;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vtt:weather-changed', {
        detail: { type: weatherType, intensity: intensityNorm }
      }));
    }

    // Persist to active tactical map
    const activeMapId = localStorage.getItem('vtt_active_battlemap_id');
    if (activeMapId) {
      mapsDb.tacticalMaps.update(activeMapId, {
        weather: { type: weatherType, intensity: intensityNorm }
      }).catch(() => {});
    }
  }

  function handleDarknessChange() {
    const darknessNorm = ambientDarkness / 100;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vtt:lighting-changed', {
        detail: { ambientDarkness: darknessNorm }
      }));
    }

    const activeMapId = localStorage.getItem('vtt_active_battlemap_id');
    if (activeMapId) {
      mapsDb.tacticalMaps.get(activeMapId).then(map => {
        if (map) {
          mapsDb.tacticalMaps.update(activeMapId, {
            lighting: { ...map.lighting, ambientDarkness: darknessNorm }
          });
        }
      }).catch(() => {});
    }
  }

  function toggleMute() {
    if (isMuted) {
      soundboardEngine.setMasterVolume(prevVolume);
      isMuted = false;
    } else {
      prevVolume = soundboardEngine.getState().masterVol || 0.8;
      soundboardEngine.setMasterVolume(0);
      isMuted = true;
    }
  }

  function toggleCombatMusicOverride() {
    if (isCombatMusicPlaying) {
      soundboardEngine.handleCombatEnd();
      isCombatMusicPlaying = false;
    } else {
      soundboardEngine.handleCombatStart();
      isCombatMusicPlaying = true;
    }
  }
</script>

<div
  class="flex items-center gap-3 p-2 bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-2xl shadow-2xl text-xs select-none"
  role="toolbar"
  aria-label="Scene Environment Controls"
>
  <!-- 1. Weather Dropdown & Intensity -->
  <div class="flex items-center gap-1.5 border-r border-slate-800 pr-3">
    <span class="text-sm">🌧️</span>
    <select
      bind:value={weatherType}
      onchange={handleWeatherChange}
      class="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-200 text-xs font-semibold focus:outline-none focus:border-amber-500"
    >
      <option value="clear">☀️ Clear</option>
      <option value="rain">🌧️ Rain</option>
      <option value="snow">❄️ Heavy Snow</option>
      <option value="fog">🌫️ Dense Fog</option>
      <option value="ash">🌋 Ash / Embers</option>
    </select>

    {#if weatherType !== 'clear'}
      <div class="flex items-center gap-1 pl-1">
        <input
          type="range"
          min="10"
          max="100"
          step="5"
          bind:value={weatherIntensity}
          oninput={handleWeatherChange}
          class="w-16 accent-amber-500 cursor-pointer"
          title="Weather Intensity: {weatherIntensity}%"
        />
        <span class="font-mono text-[10px] text-slate-400 w-6">{weatherIntensity}%</span>
      </div>
    {/if}
  </div>

  <!-- 2. Ambient Darkness Slider -->
  <div class="flex items-center gap-2 border-r border-slate-800 pr-3">
    <span class="text-sm">🌓</span>
    <span class="text-[10px] font-bold uppercase text-slate-400">Darkness</span>
    <input
      type="range"
      min="0"
      max="100"
      step="5"
      bind:value={ambientDarkness}
      oninput={handleDarknessChange}
      class="w-20 accent-indigo-500 cursor-pointer"
      title="Ambient Darkness: {ambientDarkness}%"
    />
    <span class="font-mono text-[10px] text-slate-400 w-6">{ambientDarkness}%</span>
  </div>

  <!-- 3. Audio Quick Overrides -->
  <div class="flex items-center gap-1.5">
    <!-- Combat Music Override -->
    <button
      type="button"
      onclick={toggleCombatMusicOverride}
      class="px-2 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 {isCombatMusicPlaying
        ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
        : 'bg-slate-800 hover:bg-slate-750 text-slate-300'}"
      title={isCombatMusicPlaying ? 'Stop Combat Theme' : 'Override & Play Combat Theme'}
    >
      <span>⚔️</span>
      <span>{isCombatMusicPlaying ? 'Combat ON' : 'Fight'}</span>
    </button>

    <!-- Master Mute Toggle -->
    <button
      type="button"
      onclick={toggleMute}
      class="w-7 h-7 rounded-lg flex items-center justify-center transition-colors {isMuted
        ? 'bg-rose-950/80 border border-rose-600 text-rose-300'
        : 'bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-slate-200'}"
      title={isMuted ? 'Unmute Audio' : 'Mute Master Audio'}
    >
      {isMuted ? '🔇' : '🔊'}
    </button>
  </div>
</div>
