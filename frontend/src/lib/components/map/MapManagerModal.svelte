<!-- src/lib/components/map/MapManagerModal.svelte -->
<!-- Universal Map Manager & Importer Modal for .dd2vtt, .uvtt, .map, .geojson, and raster images -->

<script lang="ts">
  import { onMount } from 'svelte';
  import { mapsDb } from '../../db/mapsDb';
  import type { TacticalBattlemap } from '../../types/maps';
  import { importUniversalMap, type MapImportResult } from '../../services/mapImporter';
  import { canvasStore } from '../../../stores/canvasStore.svelte';

  let {
    isOpen = $bindable(false),
    onClose = () => {},
  }: {
    isOpen?: boolean;
    onClose?: () => void;
  } = $props();

  let tacticalMaps = $state<TacticalBattlemap[]>([]);
  let isDragging = $state(false);
  let isProcessing = $state(false);
  let statusMessage = $state<string | null>(null);
  let isError = $state(false);

  // Calibration state
  let calibratingGrid = $state(false);
  let calibrationGridSize = $state(70);

  async function loadMaps() {
    try {
      tacticalMaps = await mapsDb.tacticalMaps.toArray();
    } catch {
      tacticalMaps = [];
    }
  }

  onMount(() => {
    loadMaps();
  });

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    isProcessing = true;
    statusMessage = `Importing ${files[0].name}…`;
    isError = false;

    try {
      const file = files[0];
      const result: MapImportResult = await importUniversalMap(file, file.name);

      if (result.success) {
        statusMessage = `Successfully imported ${result.name}!`;
        if (result.promptGridCalibration) {
          calibratingGrid = true;
          calibrationGridSize = result.gridSize || 70;
        }
        await loadMaps();
      } else {
        isError = true;
        statusMessage = result.error || 'Failed to import map.';
      }
    } catch (err: any) {
      isError = true;
      statusMessage = err?.message || 'Unexpected import error.';
    } finally {
      isProcessing = false;
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    if (e.dataTransfer?.files) {
      handleFiles(e.dataTransfer.files);
    }
  }

  function handleFileInputChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files) {
      handleFiles(input.files);
    }
  }

  function applyCalibration() {
    canvasStore.setGridSize(calibrationGridSize);
    calibratingGrid = false;
    statusMessage = `Grid calibrated to ${calibrationGridSize}px per cell.`;
  }

  async function loadMapToCanvas(map: TacticalBattlemap) {
    if (map.textureBlob) {
      const url = URL.createObjectURL(map.textureBlob);
      canvasStore.setBackgroundTexture({
        url,
        width: 2000,
        height: 2000,
        name: map.name,
      });
    }
    canvasStore.setGridSize(map.grid.sizePx);
    canvasStore.setWallCollisions(
      map.walls.map(w => ({
        x1: w.p1.x,
        y1: w.p1.y,
        x2: w.p2.x,
        y2: w.p2.y,
      }))
    );
    statusMessage = `Loaded "${map.name}" onto Tactical Canvas.`;
  }

  async function deleteMap(id: string) {
    await mapsDb.tacticalMaps.delete(id);
    await loadMaps();
  }
</script>

{#if isOpen}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in select-none"
    role="dialog"
    aria-modal="true"
    aria-label="Universal Map Manager"
  >
    <div class="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
      <!-- Header -->
      <div class="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <span class="text-xl">🗺️</span>
          <div>
            <h2 class="text-sm font-black text-slate-100 uppercase tracking-wider">Universal Map Manager</h2>
            <p class="text-[11px] text-slate-400">Import .dd2vtt, .uvtt, .map, .geojson, or raster battlemaps</p>
          </div>
        </div>
        <button
          type="button"
          onclick={() => { isOpen = false; onClose(); }}
          class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center font-bold text-sm transition-colors"
        >
          ✕
        </button>
      </div>

      <!-- Body -->
      <div class="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
        <!-- Dropzone -->
        <div
          role="region"
          aria-label="Map File Dropzone"
          ondragover={(e) => { e.preventDefault(); isDragging = true; }}
          ondragleave={() => isDragging = false}
          ondrop={handleDrop}
          class="border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer {isDragging ? 'border-indigo-400 bg-indigo-950/20' : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'}"
        >
          <input
            type="file"
            id="map-upload-input"
            accept=".dd2vtt,.uvtt,.map,.geojson,.png,.jpg,.jpeg,.webp"
            onchange={handleFileInputChange}
            class="hidden"
          />
          <label for="map-upload-input" class="cursor-pointer block">
            <span class="text-3xl block mb-2">📂</span>
            <span class="font-bold text-slate-200 block text-sm">Drop map files or click to browse</span>
            <span class="text-[11px] text-slate-500 block mt-1">Supports Universal VTT (.dd2vtt, .uvtt), Azgaar (.map, .geojson), and Images (.png, .webp, .jpg)</span>
          </label>
        </div>

        {#if statusMessage}
          <div class="p-3 rounded-lg text-xs font-semibold flex items-center gap-2 {isError ? 'bg-red-950/60 text-red-300 border border-red-800/60' : 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60'}">
            <span>{isError ? '⚠️' : '✓'}</span>
            <span>{statusMessage}</span>
          </div>
        {/if}

        <!-- Calibration Prompt -->
        {#if calibratingGrid}
          <div class="p-4 bg-indigo-950/40 border border-indigo-800/60 rounded-xl space-y-3">
            <div class="flex items-center justify-between">
              <span class="font-bold text-indigo-200">Calibrate Battlemap Grid Pitch</span>
              <span class="font-mono text-xs text-indigo-300">{calibrationGridSize}px</span>
            </div>
            <input
              type="range"
              min="30"
              max="200"
              step="2"
              bind:value={calibrationGridSize}
              class="w-full accent-indigo-500"
            />
            <div class="flex justify-end gap-2">
              <button
                type="button"
                onclick={() => calibratingGrid = false}
                class="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-bold"
              >
                Skip
              </button>
              <button
                type="button"
                onclick={applyCalibration}
                class="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-bold shadow"
              >
                Apply Grid Pitch
              </button>
            </div>
          </div>
        {/if}

        <!-- Tactical Battlemaps In Library -->
        <div>
          <h3 class="font-bold text-slate-300 uppercase tracking-wider text-[11px] mb-2.5">
            Saved Battlemaps ({tacticalMaps.length})
          </h3>
          {#if tacticalMaps.length === 0}
            <div class="text-slate-500 text-center py-6 border border-slate-800 rounded-xl bg-slate-950/30">
              No tactical battlemaps saved yet. Drop a .dd2vtt or image file above.
            </div>
          {:else}
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {#each tacticalMaps as m}
                <div class="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between group hover:border-slate-700 transition-colors">
                  <div class="min-w-0 flex-1 pr-2">
                    <span class="font-bold text-slate-200 block truncate">{m.name}</span>
                    <span class="text-[10px] text-slate-500 block">
                      Grid: {m.grid.sizePx}px · {m.walls.length} Walls
                    </span>
                  </div>
                  <div class="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onclick={() => loadMapToCanvas(m)}
                      class="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-[11px] transition-colors"
                      title="Load to Canvas"
                    >
                      Load
                    </button>
                    <button
                      type="button"
                      onclick={() => deleteMap(m.id)}
                      class="p-1 hover:bg-red-950/60 hover:text-red-400 text-slate-500 rounded transition-colors"
                      title="Delete Map"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}
