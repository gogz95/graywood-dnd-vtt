<script lang="ts">
  import { uiTheme, type ThemeMode, type DisplayMode } from '../../stores/uiTheme.svelte';
  import { pluginHost } from '$lib/services/pluginHost.svelte';
  import Icons from '../../../components/Icons.svelte';

  let { isOpen = $bindable(false) }: { isOpen?: boolean } = $props();

  let activeViewportEngine = $state(
    typeof localStorage !== 'undefined'
      ? localStorage.getItem('vtt_active_viewport_engine') || 'viewport-pixi-2d'
      : 'viewport-pixi-2d'
  );

  function selectViewportEngine(id: string) {
    activeViewportEngine = id;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('vtt_active_viewport_engine', id);
      window.dispatchEvent(new CustomEvent('vtt:viewport-engine-changed', { detail: { id } }));
    }
  }

  function selectTheme(mode: ThemeMode) {
    uiTheme.setTheme(mode);
  }

  function handleScaleSlider(e: Event) {
    const target = e.target as HTMLInputElement;
    uiTheme.setScaling(parseInt(target.value, 10));
  }

  function setScalePreset(percent: number) {
    uiTheme.setScaling(percent);
  }

  function selectDisplayMode(mode: DisplayMode) {
    uiTheme.setDisplayMode(mode);
  }

  let isSideloading = $state(false);
  let sideloadToast = $state<string | null>(null);
  let isDragOverZip = $state(false);
  let zipInputRef = $state<HTMLInputElement | null>(null);

  async function handleSideloadFile(file: File) {
    if (!file.name.endsWith('.zip')) {
      sideloadToast = 'Please upload a .zip plugin bundle.';
      setTimeout(() => { sideloadToast = null; }, 3000);
      return;
    }

    isSideloading = true;
    sideloadToast = `Unpacking and mounting ${file.name}...`;

    try {
      const plugin = await pluginHost.sideloadZip(file);
      sideloadToast = `Successfully mounted "${plugin.name}" v${plugin.version}!`;
      setTimeout(() => { sideloadToast = null; }, 4000);
    } catch (err) {
      console.error('[SettingsDrawer] Sideload failed:', err);
      sideloadToast = err instanceof Error ? err.message : 'Plugin sideload failed.';
      setTimeout(() => { sideloadToast = null; }, 5000);
    } finally {
      isSideloading = false;
      if (zipInputRef) zipInputRef.value = '';
    }
  }

  function handleZipDrop(e: DragEvent) {
    e.preventDefault();
    isDragOverZip = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) handleSideloadFile(file);
  }

  function handleZipSelect(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) handleSideloadFile(file);
  }

  function close() {
    isOpen = false;
  }
</script>

{#if isOpen}
  <!-- Backdrop -->
  <div 
    role="presentation"
    class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity"
    onclick={close}
  ></div>

  <!-- Settings Drawer Panel -->
  <aside 
    class="fixed top-0 right-0 h-full w-96 max-w-full bg-slate-900 border-l border-slate-800 z-50 flex flex-col shadow-2xl transition-transform transform translate-x-0"
    aria-label="Workstation Settings"
  >
    <!-- Header -->
    <div class="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 shrink-0">
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold text-base border border-indigo-500/30">
          ⚙️
        </div>
        <div>
          <h2 class="text-sm font-bold text-slate-100 uppercase tracking-wide">Workstation Settings</h2>
          <p class="text-[10px] text-slate-400">Theme, scaling & display layout</p>
        </div>
      </div>
      <button 
        onclick={close} 
        class="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 flex items-center justify-center text-xs transition-colors"
        aria-label="Close Settings"
      >
        ✕
      </button>
    </div>

    <!-- Content Body -->
    <div class="flex-1 overflow-y-auto p-5 space-y-6">
      <!-- 1. Theme Selection -->
      <div class="space-y-2.5">
        <span class="text-xs font-bold uppercase tracking-wider text-slate-300 block">
          Interface Theme
        </span>
        <div class="grid grid-cols-1 gap-2">
          <!-- Obsidian -->
          <button 
            onclick={() => selectTheme('obsidian')}
            class="p-3 rounded-xl border text-left flex items-center justify-between transition-all {
              uiTheme.theme === 'obsidian' 
                ? 'bg-slate-950 border-indigo-500 shadow-md shadow-indigo-600/10 text-white' 
                : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
            }"
          >
            <div class="flex items-center gap-3">
              <span class="w-4 h-4 rounded-full bg-slate-950 border-2 border-slate-700 flex items-center justify-center">
                {#if uiTheme.theme === 'obsidian'}<span class="w-2 h-2 rounded-full bg-indigo-500"></span>{/if}
              </span>
              <div>
                <span class="text-xs font-semibold block text-slate-200">Obsidian (Default Dark)</span>
                <span class="text-[10px] text-slate-500">Deep slate tones tailored for dim play environments</span>
              </div>
            </div>
            <div class="flex gap-1">
              <span class="w-3 h-3 rounded bg-slate-950 border border-slate-800"></span>
              <span class="w-3 h-3 rounded bg-indigo-600"></span>
            </div>
          </button>

          <!-- Parchment -->
          <button 
            onclick={() => selectTheme('parchment')}
            class="p-3 rounded-xl border text-left flex items-center justify-between transition-all {
              uiTheme.theme === 'parchment' 
                ? 'bg-[#18120c] border-amber-500 shadow-md shadow-amber-600/10 text-amber-200' 
                : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
            }"
          >
            <div class="flex items-center gap-3">
              <span class="w-4 h-4 rounded-full bg-[#221a12] border-2 border-amber-900 flex items-center justify-center">
                {#if uiTheme.theme === 'parchment'}<span class="w-2 h-2 rounded-full bg-amber-500"></span>{/if}
              </span>
              <div>
                <span class="text-xs font-semibold block text-amber-300">Parchment & Warm Paper</span>
                <span class="text-[10px] text-amber-400/60">Classic fantasy manuscript tones with gold accents</span>
              </div>
            </div>
            <div class="flex gap-1">
              <span class="w-3 h-3 rounded bg-[#18120c] border border-amber-800"></span>
              <span class="w-3 h-3 rounded bg-amber-600"></span>
            </div>
          </button>

          <!-- High Contrast -->
          <button 
            onclick={() => selectTheme('high-contrast')}
            class="p-3 rounded-xl border text-left flex items-center justify-between transition-all {
              uiTheme.theme === 'high-contrast' 
                ? 'bg-black border-white shadow-md text-white' 
                : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
            }"
          >
            <div class="flex items-center gap-3">
              <span class="w-4 h-4 rounded-full bg-black border-2 border-white flex items-center justify-center">
                {#if uiTheme.theme === 'high-contrast'}<span class="w-2 h-2 rounded-full bg-white"></span>{/if}
              </span>
              <div>
                <span class="text-xs font-semibold block text-white">High Contrast Monochrome</span>
                <span class="text-[10px] text-slate-400">Crisp high-readability black & white typography</span>
              </div>
            </div>
            <div class="flex gap-1">
              <span class="w-3 h-3 rounded bg-black border border-white"></span>
              <span class="w-3 h-3 rounded bg-white"></span>
            </div>
          </button>
        </div>
      </div>

      <!-- 2. UI Font Scaling -->
      <div class="space-y-3 pt-2 border-t border-slate-800">
        <div class="flex justify-between items-center">
          <span class="text-xs font-bold uppercase tracking-wider text-slate-300">
            Interface Scaling
          </span>
          <span class="font-mono text-xs font-bold text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/40">
            {uiTheme.scaling}%
          </span>
        </div>
        
        <input 
          type="range" 
          min="80" 
          max="125" 
          step="1" 
          value={uiTheme.scaling}
          oninput={handleScaleSlider}
          class="w-full accent-indigo-500 bg-slate-950 h-2 rounded-lg cursor-pointer"
        />

        <div class="grid grid-cols-5 gap-1.5 pt-1">
          {#each [80, 90, 100, 110, 125] as p}
            <button 
              onclick={() => setScalePreset(p)}
              class="py-1 rounded text-[11px] font-mono font-semibold border transition-all {
                uiTheme.scaling === p 
                  ? 'bg-indigo-600 text-white border-indigo-500' 
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
              }"
            >
              {p}%
            </button>
          {/each}
        </div>
        <p class="text-[11px] text-slate-500">Scales all typography, buttons, and layout padding dynamically.</p>
      </div>

      <!-- 3. Display Mode Selection -->
      <div class="space-y-2.5 pt-2 border-t border-slate-800">
        <span class="text-xs font-bold uppercase tracking-wider text-slate-300 block">
          Workstation Viewport Mode
        </span>
        <div class="grid grid-cols-1 gap-2">
          <!-- DM Command -->
          <button 
            onclick={() => selectDisplayMode('DM_COMMAND')}
            class="p-3 rounded-xl border text-left flex items-start gap-3 transition-all {
              uiTheme.displayMode === 'DM_COMMAND' 
                ? 'bg-slate-950 border-indigo-500 text-white' 
                : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
            }"
          >
            <span class="text-lg">🛡️</span>
            <div>
              <span class="text-xs font-semibold block text-slate-200">DM Command Center</span>
              <span class="text-[10px] text-slate-400">Full access to hidden monster tokens, DM notes, and fog controls</span>
            </div>
          </button>

          <!-- Player View -->
          <button 
            onclick={() => selectDisplayMode('PLAYER_VIEW')}
            class="p-3 rounded-xl border text-left flex items-start gap-3 transition-all {
              uiTheme.displayMode === 'PLAYER_VIEW' 
                ? 'bg-slate-950 border-indigo-500 text-white' 
                : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
            }"
          >
            <span class="text-lg">👁️</span>
            <div>
              <span class="text-xs font-semibold block text-slate-200">Player Mirror Display</span>
              <span class="text-[10px] text-slate-400">Hides secret traps, unrevealed monster stats, and hidden tokens</span>
            </div>
          </button>

          <!-- Compact -->
          <button 
            onclick={() => selectDisplayMode('COMPACT')}
            class="p-3 rounded-xl border text-left flex items-start gap-3 transition-all {
              uiTheme.displayMode === 'COMPACT' 
                ? 'bg-slate-950 border-indigo-500 text-white' 
                : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
            }"
          >
            <span class="text-lg">📐</span>
            <div>
              <span class="text-xs font-semibold block text-slate-200">Compact Dense Layout</span>
              <span class="text-[10px] text-slate-400">Maximizes tactical battle map canvas area with collapsed toolbars</span>
            </div>
          </button>
        </div>
      </div>

      <!-- Sideload External Plugin Dropzone -->
      <div class="space-y-2 pt-2 border-t border-slate-800">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold uppercase tracking-wider text-slate-300">
            Sideload External Plugin (.zip)
          </span>
          {#if isSideloading}
            <span class="text-[10px] text-indigo-400 font-mono animate-pulse">Unpacking...</span>
          {/if}
        </div>

        <div
          role="button"
          tabindex="0"
          onclick={() => zipInputRef?.click()}
          onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') zipInputRef?.click(); }}
          ondragover={(e) => { e.preventDefault(); isDragOverZip = true; }}
          ondragleave={() => { isDragOverZip = false; }}
          ondrop={handleZipDrop}
          class="p-4 rounded-xl border-2 border-dashed transition-all cursor-pointer text-center flex flex-col items-center justify-center gap-1.5 {
            isDragOverZip
              ? 'border-indigo-500 bg-indigo-950/30'
              : 'border-slate-800 hover:border-slate-700 bg-slate-950/40'
          }"
        >
          <input
            bind:this={zipInputRef}
            type="file"
            accept=".zip"
            onchange={handleZipSelect}
            class="hidden"
          />
          <span class="text-xl">📦</span>
          <span class="text-xs font-semibold text-slate-200">
            Drop .zip plugin archive here
          </span>
          <span class="text-[10px] text-slate-500">
            Extracts plugin.json & index.js directly into runtime
          </span>
        </div>

        {#if sideloadToast}
          <div class="p-2.5 rounded-lg bg-indigo-950/80 border border-indigo-700 text-indigo-200 text-xs font-medium">
            {sideloadToast}
          </div>
        {/if}
      </div>

      <!-- 4. Modular Plugins Checklist -->
      <div class="space-y-3 pt-2 border-t border-slate-800">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold uppercase tracking-wider text-slate-300">
            Modular Plugins
          </span>
          <span class="text-[10px] text-slate-500 font-mono">
            {pluginHost.enabledIds.size} active
          </span>
        </div>

        <div class="space-y-2">
          {#each Array.from(pluginHost.registeredPlugins.values()) as plugin}
            <div class="p-3 rounded-xl border border-slate-800 bg-slate-950/40 flex items-start justify-between gap-3 transition-colors hover:border-slate-700">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-semibold text-slate-200 truncate">{plugin.name}</span>
                  <span class="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">v{plugin.version}</span>
                </div>
                {#if plugin.description}
                  <p class="text-[10px] text-slate-400 mt-1 leading-relaxed">{plugin.description}</p>
                {/if}
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={pluginHost.isEnabled(plugin.id)}
                onclick={() => {
                  if (pluginHost.isEnabled(plugin.id)) {
                    pluginHost.disable(plugin.id);
                  } else {
                    void pluginHost.enable(plugin.id);
                  }
                }}
                class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none {
                  pluginHost.isEnabled(plugin.id) ? 'bg-indigo-600' : 'bg-slate-700'
                }"
              >
                <span
                  class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {
                    pluginHost.isEnabled(plugin.id) ? 'translate-x-4' : 'translate-x-0'
                  }"
                ></span>
              </button>
            </div>
          {/each}
        </div>
      </div>

      <!-- 5. Viewport Engine Selector -->
      <div class="space-y-2.5 pt-2 border-t border-slate-800">
        <span class="text-xs font-bold uppercase tracking-wider text-slate-300 block">
          Viewport Engine
        </span>
        <div class="grid grid-cols-1 gap-2">
          {#each [
            { id: 'viewport-pixi-2d', name: '2D Tactical Battlemat', icon: '🗺️', desc: 'Hardware-accelerated PixiJS 2D canvas with full fog and lighting' },
            { id: 'viewport-threlte-3d', name: '3D Spectator Display', icon: '🧊', desc: 'Isometric perspective 3D miniature renderer for TV & table displays' }
          ] as engine}
            <button
              onclick={() => selectViewportEngine(engine.id)}
              class="p-3 rounded-xl border text-left flex items-start gap-3 transition-all {
                activeViewportEngine === engine.id
                  ? 'bg-slate-950 border-indigo-500 text-white shadow-md shadow-indigo-600/10'
                  : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
              }"
            >
              <span class="text-lg">{engine.icon}</span>
              <div>
                <span class="text-xs font-semibold block text-slate-200">{engine.name}</span>
                <span class="text-[10px] text-slate-400">{engine.desc}</span>
              </div>
            </button>
          {/each}
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="p-4 border-t border-slate-800 bg-slate-950/60 shrink-0 text-center">
      <p class="text-[11px] text-slate-500">Preferences automatically persist to local storage.</p>
    </div>
  </aside>
{/if}
