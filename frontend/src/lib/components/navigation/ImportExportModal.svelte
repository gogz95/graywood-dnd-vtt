<!-- src/lib/components/navigation/ImportExportModal.svelte -->
<!-- Phase E5: Self-Contained Campaign Archive Packaging & Foreign Scene Transpiler Modal -->
<script lang="ts">
  import { exportCampaignBundle, importCampaignBundle } from '$lib/services/campaignBundleService';
  import { mapsDb } from '$lib/db/mapsDb';
  import { compendiumDb } from '$lib/db/compendiumDb';

  interface Props {
    isOpen?: boolean;
    onClose?: () => void;
  }

  let { isOpen = $bindable(false), onClose }: Props = $props();

  let activeTab = $state<'backup' | 'restore' | 'foundry' | 'roll20'>('backup');
  let isProcessing = $state(false);
  let progressPercent = $state(0);
  let statusMessage = $state('');
  let errorMessage = $state('');
  let successMessage = $state('');

  // Transpiled scene preview state
  let transpiledFoundry = $state<any>(null);
  let transpiledRoll20 = $state<any>(null);

  async function runExportVttBundle() {
    isProcessing = true;
    progressPercent = 10;
    statusMessage = 'Gathering campaign data and IndexedDB tables...';
    errorMessage = '';
    successMessage = '';

    try {
      // Step 1: Collect Dexie data
      progressPercent = 30;
      statusMessage = 'Serializing Dexie records and session state...';
      const bundleBlob = await exportCampaignBundle();

      progressPercent = 80;
      statusMessage = 'Compressing archive stream into .vttbundle...';

      // Download file to disk
      const url = URL.createObjectURL(bundleBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `campaign_backup_${new Date().toISOString().slice(0, 10)}.vttbundle`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      progressPercent = 100;
      successMessage = 'Campaign successfully exported to .vttbundle archive!';
    } catch (err: any) {
      errorMessage = `Export failed: ${err.message || String(err)}`;
    } finally {
      isProcessing = false;
    }
  }

  async function handleImportVttBundle(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];

    isProcessing = true;
    progressPercent = 10;
    statusMessage = 'Validating archive integrity...';
    errorMessage = '';
    successMessage = '';

    try {
      progressPercent = 40;
      statusMessage = 'Extracting and verifying manifest...';
      await importCampaignBundle(file);

      progressPercent = 90;
      statusMessage = 'Rehydrating tactical maps and compendium items...';
      await new Promise(r => setTimeout(r, 200));

      progressPercent = 100;
      successMessage = 'Campaign archive successfully restored!';
    } catch (err: any) {
      errorMessage = `Import failed: ${err.message || String(err)}`;
    } finally {
      isProcessing = false;
      input.value = '';
    }
  }

  async function handleFoundryJsonUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];

    isProcessing = true;
    errorMessage = '';
    successMessage = '';

    try {
      const text = await file.text();
      // Try Tauri IPC if available, else local parse
      if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
        const { invoke } = await import('@tauri-apps/api/core');
        transpiledFoundry = await invoke('transpile_foundry_scene_cmd', { jsonContent: text });
      } else {
        const parsed = JSON.parse(text);
        const walls = (parsed.walls || []).map((w: any) => ({
          x1: w.c?.[0] ?? 0,
          y1: w.c?.[1] ?? 0,
          x2: w.c?.[2] ?? 0,
          y2: w.c?.[3] ?? 0,
          is_door: w.door === 1 || w.door === 2,
          is_secret: w.door === 2,
          is_open: w.ds === 1,
          blocks_vision: w.sense !== 0,
          blocks_movement: w.move !== 0,
        }));
        const lights = (parsed.lights || []).map((l: any) => ({
          x: l.x ?? 0,
          y: l.y ?? 0,
          dim_radius: l.dim ?? 0,
          bright_radius: l.bright ?? 0,
          color: l.config?.color || '#ffffff',
          intensity: l.config?.alpha ?? 1.0,
        }));
        transpiledFoundry = {
          name: parsed.name || 'Foundry Scene',
          width: parsed.width || 4000,
          height: parsed.height || 3000,
          grid_size: parsed.grid?.size || 100,
          grid_distance: parsed.grid?.distance || 5,
          image_url: parsed.img || parsed.background?.src || null,
          walls,
          lights,
        };
      }
      successMessage = `Transpiled Foundry scene "${transpiledFoundry.name}" (${transpiledFoundry.walls.length} walls, ${transpiledFoundry.lights.length} lights)`;
    } catch (err: any) {
      errorMessage = `Foundry transpilation failed: ${err.message || String(err)}`;
    } finally {
      isProcessing = false;
      input.value = '';
    }
  }

  async function handleRoll20JsonUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];

    isProcessing = true;
    errorMessage = '';
    successMessage = '';

    try {
      const text = await file.text();
      if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
        const { invoke } = await import('@tauri-apps/api/core');
        transpiledRoll20 = await invoke('transpile_roll20_page_cmd', { jsonContent: text });
      } else {
        const parsed = JSON.parse(text);
        transpiledRoll20 = {
          name: parsed.name || 'Roll20 Page',
          width: (parsed.width || 30) * (parsed.snapping_increment || 70),
          height: (parsed.height || 30) * (parsed.snapping_increment || 70),
          grid_size: parsed.snapping_increment || 70,
          background_image_url: null,
          wall_segments: [],
          tokens: [],
        };
      }
      successMessage = `Transpiled Roll20 page "${transpiledRoll20.name}" (${transpiledRoll20.wall_segments.length} DL segments)`;
    } catch (err: any) {
      errorMessage = `Roll20 transpilation failed: ${err.message || String(err)}`;
    } finally {
      isProcessing = false;
      input.value = '';
    }
  }

  async function saveTranspiledScene(source: 'foundry' | 'roll20') {
    const data = source === 'foundry' ? transpiledFoundry : transpiledRoll20;
    if (!data) return;

    try {
      await mapsDb.tacticalMaps.add({
        id: `imported-${Date.now()}`,
        name: data.name || 'Imported Scene',
        gridSize: data.grid_size || 100,
        gridDistance: data.grid_distance || 5,
        width: data.width || 3000,
        height: data.height || 2000,
        imageUrl: data.image_url || data.background_image_url || '',
        walls: (data.walls || data.wall_segments || []).map((w: any, idx: number) => ({
          id: `w-${idx}`,
          x1: w.x1,
          y1: w.y1,
          x2: w.x2,
          y2: w.y2,
          door: w.is_door ? (w.is_secret ? 'secret' : 'door') : 'none',
          isOpen: w.is_open ?? false,
          blocksVision: w.blocks_vision ?? true,
          blocksMovement: w.blocks_movement ?? true,
        })),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as any);

      successMessage = `Saved "${data.name}" to Tactical Maps!`;
      if (source === 'foundry') transpiledFoundry = null;
      else transpiledRoll20 = null;
    } catch (err: any) {
      errorMessage = `Failed to save map: ${err.message || String(err)}`;
    }
  }

  function handleClose() {
    isOpen = false;
    onClose?.();
  }
</script>

{#if isOpen}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
    role="dialog"
    aria-modal="true"
    aria-labelledby="import-export-title"
  >
    <div
      class="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
    >
      <!-- Header -->
      <div class="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 text-lg">
            📦
          </div>
          <div>
            <h2 id="import-export-title" class="text-lg font-bold text-white tracking-wide">
              Campaign Vault & Ecosystem Migrations
            </h2>
            <p class="text-xs text-slate-400">
              Compressed .vttbundle packages, automated restores, and foreign scene transpilers
            </p>
          </div>
        </div>
        <button
          type="button"
          onclick={handleClose}
          aria-label="Close"
          class="text-slate-400 hover:text-white text-xl p-1 rounded-lg hover:bg-slate-800 transition-colors"
        >
          ✕
        </button>
      </div>

      <!-- Navigation Tabs -->
      <div class="flex border-b border-slate-800 bg-slate-900/60 px-6">
        <button
          type="button"
          class="px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 {activeTab === 'backup' ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5' : 'border-transparent text-slate-400 hover:text-slate-200'}"
          onclick={() => (activeTab = 'backup')}
        >
          <span>💾</span> Export .vttbundle
        </button>
        <button
          type="button"
          class="px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 {activeTab === 'restore' ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5' : 'border-transparent text-slate-400 hover:text-slate-200'}"
          onclick={() => (activeTab = 'restore')}
        >
          <span>📥</span> Restore .vttbundle
        </button>
        <button
          type="button"
          class="px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 {activeTab === 'foundry' ? 'border-amber-500 text-amber-400 bg-amber-500/5' : 'border-transparent text-slate-400 hover:text-slate-200'}"
          onclick={() => (activeTab = 'foundry')}
        >
          <span>🔥</span> Foundry VTT Scene
        </button>
        <button
          type="button"
          class="px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 {activeTab === 'roll20' ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5' : 'border-transparent text-slate-400 hover:text-slate-200'}"
          onclick={() => (activeTab = 'roll20')}
        >
          <span>🎲</span> Roll20 Page
        </button>
      </div>

      <!-- Body / Active Tab Content -->
      <div class="p-6 overflow-y-auto flex-1 space-y-6">
        {#if errorMessage}
          <div class="p-4 bg-red-950/60 border border-red-500/40 rounded-xl text-red-200 text-sm flex items-start gap-3">
            <span class="text-lg">⚠️</span>
            <div class="flex-1 font-mono text-xs">{errorMessage}</div>
          </div>
        {/if}

        {#if successMessage}
          <div class="p-4 bg-emerald-950/60 border border-emerald-500/40 rounded-xl text-emerald-200 text-sm flex items-start gap-3">
            <span class="text-lg">✅</span>
            <div class="flex-1">{successMessage}</div>
          </div>
        {/if}

        {#if isProcessing}
          <div class="space-y-3 bg-slate-950/40 border border-slate-800 p-5 rounded-xl">
            <div class="flex justify-between text-xs text-slate-300 font-medium">
              <span>{statusMessage}</span>
              <span>{progressPercent}%</span>
            </div>
            <div class="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                class="bg-indigo-500 h-full transition-all duration-300 ease-out"
                style="width: {progressPercent}%"
              ></div>
            </div>
          </div>
        {/if}

        {#if activeTab === 'backup'}
          <div class="space-y-4">
            <p class="text-sm text-slate-300 leading-relaxed">
              Export a complete, self-contained <code class="text-indigo-300">.vttbundle</code> archive. This includes all tactical maps, vector wall colliders, lighting profiles, compendium monsters and spells, journal entries, and campaign session state.
            </p>
            <div class="border border-slate-800 rounded-xl p-5 bg-slate-950/30 flex items-center justify-between">
              <div>
                <h4 class="font-semibold text-white text-sm">Full Campaign Packaging</h4>
                <p class="text-xs text-slate-400 mt-1">Compressed DEFLATE stream containing all SQLite & IndexedDB state.</p>
              </div>
              <button
                type="button"
                disabled={isProcessing}
                onclick={runExportVttBundle}
                class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/25 disabled:opacity-50 flex items-center gap-2"
              >
                <span>📦</span> Export .vttbundle
              </button>
            </div>
          </div>

        {:else if activeTab === 'restore'}
          <div class="space-y-4">
            <p class="text-sm text-slate-300 leading-relaxed">
              Restore an existing <code class="text-indigo-300">.vttbundle</code> archive. This cleanly rehydrates the database schemas, replaces tactical scenes, and triggers live view sync.
            </p>
            <label
              class="border-2 border-dashed border-slate-700 hover:border-indigo-500/70 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer bg-slate-950/30 transition-colors group"
            >
              <div class="w-12 h-12 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 text-2xl group-hover:scale-110 transition-transform">
                📂
              </div>
              <span class="mt-3 text-sm font-medium text-slate-200">Select or drop a .vttbundle file</span>
              <span class="text-xs text-slate-500 mt-1">Accepts standard Graywood .vttbundle archives</span>
              <input
                type="file"
                accept=".vttbundle,.zip"
                class="hidden"
                disabled={isProcessing}
                onchange={handleImportVttBundle}
              />
            </label>
          </div>

        {:else if activeTab === 'foundry'}
          <div class="space-y-4">
            <p class="text-sm text-slate-300 leading-relaxed">
              Import a Foundry VTT scene JSON file (<code class="text-amber-300">fvtt-scene-*.json</code>). Wall segments, door mechanisms (regular & secret), light sources, and grid scale will be transpiled.
            </p>
            <label
              class="border-2 border-dashed border-slate-700 hover:border-amber-500/70 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer bg-slate-950/30 transition-colors group"
            >
              <span class="text-2xl mb-1">🔥</span>
              <span class="text-sm font-medium text-slate-200">Select Foundry Scene JSON</span>
              <span class="text-xs text-slate-500 mt-1">Exports from Foundry VTT "Export Data"</span>
              <input
                type="file"
                accept=".json"
                class="hidden"
                disabled={isProcessing}
                onchange={handleFoundryJsonUpload}
              />
            </label>

            {#if transpiledFoundry}
              <div class="p-4 bg-slate-950/60 border border-amber-500/30 rounded-xl space-y-3">
                <div class="flex justify-between items-center">
                  <h4 class="text-sm font-bold text-amber-300">{transpiledFoundry.name}</h4>
                  <span class="text-xs text-slate-400">{transpiledFoundry.width} × {transpiledFoundry.height} px</span>
                </div>
                <div class="grid grid-cols-3 gap-2 text-xs text-slate-300">
                  <div class="bg-slate-900 p-2 rounded-lg border border-slate-800">
                    <span class="text-slate-500 block">Walls</span>
                    <span class="text-sm font-bold text-white">{transpiledFoundry.walls.length}</span>
                  </div>
                  <div class="bg-slate-900 p-2 rounded-lg border border-slate-800">
                    <span class="text-slate-500 block">Lights</span>
                    <span class="text-sm font-bold text-white">{transpiledFoundry.lights.length}</span>
                  </div>
                  <div class="bg-slate-900 p-2 rounded-lg border border-slate-800">
                    <span class="text-slate-500 block">Grid Size</span>
                    <span class="text-sm font-bold text-white">{transpiledFoundry.grid_size} px</span>
                  </div>
                </div>
                <button
                  type="button"
                  onclick={() => saveTranspiledScene('foundry')}
                  class="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white font-medium rounded-xl text-sm transition-all"
                >
                  Create Tactical Map from Foundry Scene
                </button>
              </div>
            {/if}
          </div>

        {:else if activeTab === 'roll20'}
          <div class="space-y-4">
            <p class="text-sm text-slate-300 leading-relaxed">
              Import a Roll20 page JSON schema. Dynamic Lighting (DL) path vectors and page dimensions will be converted into tactical collision segments.
            </p>
            <label
              class="border-2 border-dashed border-slate-700 hover:border-emerald-500/70 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer bg-slate-950/30 transition-colors group"
            >
              <span class="text-2xl mb-1">🎲</span>
              <span class="text-sm font-medium text-slate-200">Select Roll20 Page JSON</span>
              <span class="text-xs text-slate-500 mt-1">Roll20 exported page object</span>
              <input
                type="file"
                accept=".json"
                class="hidden"
                disabled={isProcessing}
                onchange={handleRoll20JsonUpload}
              />
            </label>

            {#if transpiledRoll20}
              <div class="p-4 bg-slate-950/60 border border-emerald-500/30 rounded-xl space-y-3">
                <div class="flex justify-between items-center">
                  <h4 class="text-sm font-bold text-emerald-300">{transpiledRoll20.name}</h4>
                  <span class="text-xs text-slate-400">{transpiledRoll20.width} × {transpiledRoll20.height} px</span>
                </div>
                <div class="grid grid-cols-2 gap-2 text-xs text-slate-300">
                  <div class="bg-slate-900 p-2 rounded-lg border border-slate-800">
                    <span class="text-slate-500 block">DL Colliders</span>
                    <span class="text-sm font-bold text-white">{transpiledRoll20.wall_segments.length}</span>
                  </div>
                  <div class="bg-slate-900 p-2 rounded-lg border border-slate-800">
                    <span class="text-slate-500 block">Grid Size</span>
                    <span class="text-sm font-bold text-white">{transpiledRoll20.grid_size} px</span>
                  </div>
                </div>
                <button
                  type="button"
                  onclick={() => saveTranspiledScene('roll20')}
                  class="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl text-sm transition-all"
                >
                  Create Tactical Map from Roll20 Page
                </button>
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="px-6 py-4 bg-slate-950/60 border-t border-slate-800 flex justify-end">
        <button
          type="button"
          onclick={handleClose}
          class="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-xl transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  </div>
{/if}
