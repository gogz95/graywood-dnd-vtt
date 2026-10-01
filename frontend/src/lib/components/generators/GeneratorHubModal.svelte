<!-- src/lib/components/generators/GeneratorHubModal.svelte -->
<!-- Sandboxed Map Generator Hub: Azgaar / Watabou / Dungeon Scrawl / Eigengrau -->

<script lang="ts">
  import { campaignDirectoryStore } from '$lib/stores/campaignDirectoryStore.svelte';
  import {
    GENERATOR_PLUGINS,
    type GeneratorPlugin,
    type GeneratorId,
    type ExportFormat,
    type GeneratorExportMessage,
  } from '$lib/types/generatorPlugin';
  import { mapsDb } from '$lib/db/mapsDb';
  import type { TacticalBattlemap } from '$lib/types/maps';

  let { isOpen = $bindable(false) }: { isOpen?: boolean } = $props();

  let activePlugin = $state<GeneratorPlugin | null>(null);
  let iframeEl = $state<HTMLIFrameElement | null>(null);
  let isExporting = $state(false);
  let exportStatus = $state<string | null>(null);
  let selectedFormat = $state<ExportFormat>('png');

  function openGenerator(plugin: GeneratorPlugin) {
    activePlugin = plugin;
    selectedFormat = plugin.supportedFormats[0];
    exportStatus = null;
  }

  function closeGenerator() {
    // Destroy iframe immediately to release memory
    if (iframeEl) {
      iframeEl.src = 'about:blank';
    }
    activePlugin = null;
    iframeEl = null;
    isExporting = false;
    exportStatus = null;
  }

  function closeFully() {
    closeGenerator();
    isOpen = false;
  }

  function requestExport() {
    if (!iframeEl || !activePlugin) return;
    isExporting = true;
    exportStatus = 'Requesting export from generator…';
    iframeEl.contentWindow?.postMessage(
      { type: 'REQUEST_EXPORT', format: selectedFormat },
      '*'
    );
  }

  async function handleGeneratorMessage(ev: MessageEvent) {
    if (!activePlugin) return;
    const msg = ev.data as GeneratorExportMessage;
    if (msg?.type !== 'GENERATOR_EXPORT') return;

    exportStatus = `Saving ${msg.filename}…`;

    try {
      // Save asset via campaign directory store (REST or Tauri IPC)
      let savedUrl = '';
      try {
        const subfolder = selectedFormat === 'uvtt' || selectedFormat === 'geojson' ? 'Ingest/Image' : 'maps';
        const saved = await campaignDirectoryStore.saveAsset(subfolder, msg.filename, msg.dataBase64);
        savedUrl = saved?.url || '';
      } catch {
        // Graceful fallback for offline / standalone mode
      }

      const mapId = `gen-${activePlugin.id}-${Date.now()}`;
      const mapName = msg.filename.replace(/\.[^/.]+$/, '');

      // Register in Dexie mapsDb so the scene picker sees it immediately
      const record: TacticalBattlemap = {
        id: mapId,
        name: mapName,
        type: 'tactical',
        imageUrl: savedUrl || msg.dataBase64 || '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        grid: { type: 'square', sizePx: 70, offsetX: 0, offsetY: 0, opacity: 0.35, color: '#000000' },
        lighting: { ambientDarkness: 0, tintColor: '#ffffff' },
        fogOfWar: { revealedPolygons: [], concealedPolygons: [] },
        walls: [],
        tokens: [],
      };
      await mapsDb.tacticalMaps.put(record);

      exportStatus = `✓ Saved: ${msg.filename}`;

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vtt:maps-updated'));
        window.dispatchEvent(
          new CustomEvent('vtt:generator-export-complete', {
            detail: { mapId, name: mapName, url: savedUrl, generator: activePlugin.id },
          })
        );
      }

      // Unmount iframe after successful export
      setTimeout(() => closeGenerator(), 1200);
    } catch (err: any) {
      exportStatus = `Export failed: ${err?.message ?? 'Unknown error'}`;
    } finally {
      isExporting = false;
    }
  }
</script>

<svelte:window onmessage={handleGeneratorMessage} />

{#if isOpen}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in select-none"
    role="presentation"
    onclick={closeFully}
  >
    <div
      class="w-full max-w-5xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      style="height: 85vh;"
      role="dialog"
      aria-modal="true"
      aria-label="Map Generator Hub"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <!-- Header -->
      <div class="px-5 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-2.5">
          {#if activePlugin}
            <button
              type="button"
              onclick={closeGenerator}
              class="text-slate-400 hover:text-white text-xs px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
            >← Back</button>
            <span class="text-lg">{activePlugin.icon}</span>
            <h2 class="text-sm font-black text-slate-100 uppercase tracking-wider">{activePlugin.label}</h2>
          {:else}
            <span class="text-xl">🗺️</span>
            <h2 class="text-sm font-black text-slate-100 uppercase tracking-wider">Map Generator Hub</h2>
          {/if}
        </div>
        <div class="flex items-center gap-2">
          {#if activePlugin}
            <!-- Format selector -->
            {#if activePlugin.supportedFormats.length > 1}
              <select
                bind:value={selectedFormat}
                class="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1 outline-none"
              >
                {#each activePlugin.supportedFormats as fmt}
                  <option value={fmt}>{fmt.toUpperCase()}</option>
                {/each}
              </select>
            {/if}
            <button
              type="button"
              onclick={requestExport}
              disabled={isExporting}
              class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5"
            >
              {#if isExporting}
                <span class="animate-spin">⏳</span> Exporting…
              {:else}
                📥 Export & Save Map
              {/if}
            </button>
          {/if}
          <button
            type="button"
            onclick={closeFully}
            class="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors text-xs"
          >✕</button>
        </div>
      </div>

      {#if exportStatus}
        <div class="px-5 py-1.5 text-xs font-mono {exportStatus.startsWith('✓') ? 'text-emerald-400 bg-emerald-950/40' : exportStatus.startsWith('Export failed') ? 'text-rose-400 bg-rose-950/40' : 'text-sky-400 bg-sky-950/40'} border-b border-slate-800 shrink-0">
          {exportStatus}
        </div>
      {/if}

      <!-- Content -->
      {#if activePlugin}
        <!-- Sandboxed iframe -->
        <iframe
          bind:this={iframeEl}
          src={activePlugin.sandboxUrl}
          title="{activePlugin.label} Generator"
          class="flex-1 w-full border-none bg-white"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
          loading="lazy"
        ></iframe>
      {:else}
        <!-- Plugin picker grid -->
        <div class="flex-1 overflow-y-auto p-5">
          <p class="text-xs text-slate-400 mb-4">
            Select a procedural generator. It runs in an isolated sandbox — click <strong class="text-white">Export & Save Map</strong> to capture output, save to your campaign directory, and register it in the scene picker.
          </p>
          <div class="grid grid-cols-2 gap-3">
            {#each GENERATOR_PLUGINS as plugin}
              <button
                type="button"
                onclick={() => openGenerator(plugin)}
                class="p-4 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 hover:border-indigo-500/60 rounded-xl text-left transition-all group"
              >
                <div class="flex items-start gap-3">
                  <span class="text-3xl">{plugin.icon}</span>
                  <div>
                    <div class="font-bold text-sm text-slate-200 group-hover:text-white transition-colors">{plugin.label}</div>
                    <div class="text-[11px] text-slate-400 mt-0.5">{plugin.description}</div>
                    <div class="flex gap-1 mt-2">
                      {#each plugin.supportedFormats as fmt}
                        <span class="px-1.5 py-0.5 text-[9px] font-bold uppercase bg-slate-700 text-slate-300 rounded">{fmt}</span>
                      {/each}
                    </div>
                  </div>
                </div>
              </button>
            {/each}
          </div>
          <p class="text-[10px] text-slate-600 mt-4 text-center">
            Generators run in an isolated <code>sandbox</code> attribute iframe. Export events are bridged via <code>postMessage</code>.
            <br>For generators that don't implement the export bridge, use your browser's built-in screenshot or save tools, then drag the file onto the Ingest panel.
          </p>
        </div>
      {/if}
    </div>
  </div>
{/if}
