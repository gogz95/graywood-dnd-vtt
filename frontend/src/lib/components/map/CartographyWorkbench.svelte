<!-- CartographyWorkbench.svelte — Battlemat Vector Geometry Importer & Synchronizer -->
<script lang="ts">
  import { mapStore } from '../../stores/mapStore.svelte';
  import { parseGeoJsonToWalls, parseSvgToWalls, type CanonicalWall, type BoundingBox } from '../../services/vectorMapParser';
  import { audioEngine } from '../../audio/AudioEngine';

  interface Props {
    isOpen?: boolean;
    onClose?: () => void;
  }

  let { isOpen = $bindable(false), onClose }: Props = $props();

  let mapName = $state('Dungeon Chamber Vector Mat');
  let rawInput = $state('');
  let gridSize = $state(60);
  let feedback = $state<string | null>(null);

  let parsedWalls = $state<CanonicalWall[]>([]);
  let parsedBounds = $state<BoundingBox | null>(null);
  let parsedCount = $state(0);

  function handleParse() {
    const trimmed = rawInput.trim();
    if (!trimmed) {
      parsedWalls = [];
      parsedBounds = null;
      parsedCount = 0;
      return;
    }

    try {
      if (trimmed.startsWith('<svg') || trimmed.includes('<svg') || trimmed.includes('<line') || trimmed.includes('<path')) {
        // SVG Format
        const res = parseSvgToWalls(trimmed, { cellSize: gridSize, padding: 60 });
        parsedWalls = res.walls;
        parsedBounds = res.bounds;
        parsedCount = res.featureCount;
        feedback = `Parsed SVG: ${res.walls.length} line segments found.`;
      } else {
        // GeoJSON Format
        const res = parseGeoJsonToWalls(trimmed, { cellSize: gridSize, padding: 60 });
        parsedWalls = res.walls;
        parsedBounds = res.bounds;
        parsedCount = res.featureCount;
        feedback = `Parsed GeoJSON: ${res.walls.length} walls generated from ${res.featureCount} features.`;
      }
    } catch (err: any) {
      feedback = `Parsing error: ${err?.message || 'Invalid format'}`;
    }
  }

  async function handleFileUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    mapName = file.name.replace(/\.[^/.]+$/, '');
    const text = await file.text();
    rawInput = text;
    handleParse();
  }

  async function handleSync() {
    if (parsedWalls.length === 0 || !parsedBounds) {
      handleParse();
      if (parsedWalls.length === 0 || !parsedBounds) {
        feedback = 'Please provide valid GeoJSON or SVG vector geometry to sync.';
        return;
      }
    }

    try {
      const res = await mapStore.syncVectorGeometry({
        name: mapName,
        walls: parsedWalls,
        bounds: parsedBounds,
        gridSize,
        fitCamera: true,
      });

      audioEngine.triggerSfx('sfx-secret');
      feedback = `✅ Synced ${res.wallCount} walls to SQLite & Pixi canvas! Camera auto-fitted.`;

      setTimeout(() => {
        if (onClose) onClose();
        isOpen = false;
      }, 1200);
    } catch (err: any) {
      feedback = `Sync failed: ${err?.message || 'Unknown error'}`;
    }
  }
</script>

{#if isOpen}
  <div
    role="presentation"
    class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none"
    onclick={(e) => { if (e.target === e.currentTarget) { if (onClose) onClose(); isOpen = false; } }}
  >
    <div
      class="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-slate-200"
    >
      <!-- Header -->
      <div class="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <span class="text-xl">📐</span>
          <div>
            <h2 class="text-base font-bold text-white tracking-wide">Cartography Workbench</h2>
            <p class="text-[11px] text-slate-400">GeoJSON & SVG Battlemat Vector Synchronizer</p>
          </div>
        </div>

        <button
          type="button"
          onclick={() => { if (onClose) onClose(); isOpen = false; }}
          class="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center font-bold text-sm transition-colors"
        >
          ✕
        </button>
      </div>

      <!-- Body -->
      <div class="p-6 overflow-y-auto space-y-4 text-xs font-sans">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label for="cartography-map-name" class="block text-[10px] uppercase font-bold text-slate-400 mb-1">Map Name</label>
            <input
              id="cartography-map-name"
              type="text"
              bind:value={mapName}
              class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label for="cartography-grid-size" class="block text-[10px] uppercase font-bold text-slate-400 mb-1">Grid Cell Size (px)</label>
            <input
              id="cartography-grid-size"
              type="number"
              bind:value={gridSize}
              min="20"
              max="200"
              class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <!-- File Upload or Paste -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <label for="cartography-raw-input" class="block text-[10px] uppercase font-bold text-slate-400">
              GeoJSON or SVG Vector Source
            </label>
            <label class="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold cursor-pointer">
              <span>📁 Upload File</span>
              <input type="file" accept=".geojson,.json,.svg" onchange={handleFileUpload} class="hidden" />
            </label>
          </div>
          <textarea
            id="cartography-raw-input"
            bind:value={rawInput}
            oninput={handleParse}
            rows="6"
            placeholder="Paste raw GeoJSON features or SVG elements (<svg>, <line>, <path>, <polygon>)..."
            class="w-full font-mono text-[11px] bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-300 focus:outline-none focus:border-indigo-500 resize-none select-text"
          ></textarea>
        </div>

        <!-- Parsed Geometry Summary -->
        {#if parsedBounds}
          <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-3 grid grid-cols-3 gap-2 text-center">
            <div>
              <span class="text-[9px] uppercase font-bold text-slate-500 block">Walls Extracted</span>
              <span class="text-sm font-black font-mono text-emerald-400">{parsedWalls.length}</span>
            </div>
            <div>
              <span class="text-[9px] uppercase font-bold text-slate-500 block">Dimensions</span>
              <span class="text-sm font-bold font-mono text-indigo-300">{parsedBounds.width} × {parsedBounds.height}px</span>
            </div>
            <div>
              <span class="text-[9px] uppercase font-bold text-slate-500 block">Features</span>
              <span class="text-sm font-bold font-mono text-amber-300">{parsedCount}</span>
            </div>
          </div>
        {/if}

        {#if feedback}
          <p class="text-xs font-mono {feedback.startsWith('✅') ? 'text-emerald-400' : 'text-amber-400'}">
            {feedback}
          </p>
        {/if}
      </div>

      <!-- Footer Actions -->
      <div class="px-6 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
        <button
          type="button"
          onclick={handleParse}
          class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 text-xs font-bold rounded-lg transition-all"
        >
          🔍 Inspect Geometry
        </button>

        <button
          type="button"
          onclick={handleSync}
          disabled={mapStore.isSyncing}
          class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center gap-1.5"
        >
          <span>⚡</span>
          <span>{mapStore.isSyncing ? 'Syncing to SQLite...' : 'Sync to Battlemat & SQLite'}</span>
        </button>
      </div>
    </div>
  </div>
{/if}
