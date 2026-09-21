<!-- src/lib/components/map/AtlasMapView.svelte -->
<!-- Overland World Atlas Vector Map with POI pins, GeoJSON layers, Pan/Zoom & Azgaar Ingestion -->

<script lang="ts">
  import { onMount } from 'svelte';
  import { mapsDb } from '../../db/mapsDb';
  import type { WorldAtlasMap, MapPoiPin, TacticalBattlemap } from '../../types/maps';
  import { importAzgaarGeoJson } from '../../importers/azgaarImporter';
  import { importUniversalMap } from '../../services/mapImporter';
  import { projectorStore } from '../../stores/projectorStore.svelte';
  import AtlasRuler from '../atlas/AtlasRuler.svelte';

  let {
    isDm = false,
    activeMapId = null,
  }: {
    isDm?: boolean;
    activeMapId?: string | null;
  } = $props();

  let allAtlases = $state<WorldAtlasMap[]>([]);
  let currentAtlas = $state<WorldAtlasMap | null>(null);
  let selectedPin = $state<MapPoiPin | null>(null);
  let isUploading = $state(false);

  // Tactical map linking & Pin editor
  let tacticalMapsList = $state<TacticalBattlemap[]>([]);
  let editingPin = $state<MapPoiPin | null>(null);
  let isEditingPin = $state(false);

  // Ruler & Measurement
  let rulerActive = $state(false);
  let rulerWaypoints = $state<Array<{ x: number; y: number }>>([]);
  let rulerMouse = $state<{ x: number; y: number } | null>(null);

  // Pan & Zoom
  let panX = $state(0);
  let panY = $state(0);
  let zoom = $state(1);
  let isDragging = $state(false);
  let dragStartX = 0;
  let dragStartY = 0;

  // Filtered pins for projector / players: strictly filter out secret pins
  let displayPins = $derived(
    currentAtlas?.poiPins.filter(p => isDm || !p.isSecret) || []
  );

  async function loadAtlases() {
    try {
      allAtlases = await mapsDb.atlasMaps.toArray();
      tacticalMapsList = await mapsDb.tacticalMaps.toArray();
      const targetId = activeMapId || projectorStore.activeMapId;
      if (targetId) {
        currentAtlas = allAtlases.find(a => a.id === targetId) || allAtlases[0] || null;
      } else if (allAtlases.length > 0) {
        currentAtlas = allAtlases[0];
      }
    } catch {
      // ignore
    }
  }

  onMount(() => {
    loadAtlases();
  });

  $effect(() => {
    const targetId = activeMapId || projectorStore.activeMapId;
    if (targetId && allAtlases.length > 0) {
      const found = allAtlases.find(a => a.id === targetId);
      if (found) currentAtlas = found;
    }
  });

  function selectAtlas(id: string) {
    const found = allAtlases.find(a => a.id === id);
    if (found) {
      currentAtlas = found;
      if (isDm) {
        projectorStore.setActiveMap(found.id);
      }
    }
  }

  let activeSvgUrl = $state<string | null>(null);

  $effect(() => {
    if (currentAtlas?.textureBlob) {
      const url = URL.createObjectURL(currentAtlas.textureBlob);
      activeSvgUrl = url;
      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      activeSvgUrl = null;
    }
  });

  async function handleFileUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    isUploading = true;
    try {
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.map') || lower.endsWith('.svg')) {
        const res = await importUniversalMap(file, file.name);
        if (res.success) {
          await loadAtlases();
          const target = allAtlases.find(a => a.name === res.name) || allAtlases[allAtlases.length - 1];
          if (target) {
            currentAtlas = target;
            if (isDm) projectorStore.setActiveMap(target.id);
          }
        } else {
          alert(`Import warning: ${res.error || 'Failed to parse map'}`);
        }
      } else {
        const imported = await importAzgaarGeoJson(file, file.name.replace(/\.[^/.]+$/, ''));
        allAtlases = [...allAtlases, imported];
        currentAtlas = imported;
        if (isDm) {
          projectorStore.setActiveMap(imported.id);
        }
      }
    } catch (err: any) {
      alert(`Import failed: ${err?.message || 'Invalid map file'}`);
    } finally {
      isUploading = false;
      input.value = '';
    }
  }

  async function enterEncounterMap(linkedTacticalMapId: string) {
    const battlemap = await mapsDb.tacticalMaps.get(linkedTacticalMapId);
    if (battlemap) {
      localStorage.setItem('vtt_active_battlemap_id', battlemap.id);

      // Smooth projector transition: blackout then reveal battlemap
      projectorStore.setCastingSource('blackout');
      setTimeout(() => {
        projectorStore.setActiveMap(battlemap.id);
        projectorStore.setCastingSource('battlemap');
      }, 350);

      // Switch DM workspace to tactical battlemat tab
      window.dispatchEvent(new CustomEvent('vtt:switch-tab', { detail: { tab: 'battlemat' } }));
      window.dispatchEvent(new CustomEvent('vtt:load-battle-map', {
        detail: { fileName: battlemap.name }
      }));
    }
  }

  async function openPinEditor(pin: MapPoiPin) {
    editingPin = { ...pin };
    try {
      tacticalMapsList = await mapsDb.tacticalMaps.toArray();
    } catch (_) {}
    isEditingPin = true;
  }

  async function saveEditedPin() {
    if (!currentAtlas || !editingPin) return;
    const updatedPins = currentAtlas.poiPins.map(p => p.id === editingPin!.id ? { ...editingPin! } : p);
    currentAtlas = { ...currentAtlas, poiPins: updatedPins };
    await mapsDb.atlasMaps.update(currentAtlas.id, { poiPins: updatedPins });
    if (selectedPin && selectedPin.id === editingPin.id) {
      selectedPin = { ...editingPin };
    }
    isEditingPin = false;
    editingPin = null;
  }

  function handleMouseDown(e: MouseEvent) {
    if (rulerActive && e.button === 0) {
      const mapX = (e.clientX - panX) / zoom;
      const mapY = (e.clientY - panY) / zoom;
      rulerWaypoints = [...rulerWaypoints, { x: mapX, y: mapY }];
      return;
    }
    if (e.button !== 0 && e.button !== 1) return;
    isDragging = true;
    dragStartX = e.clientX - panX;
    dragStartY = e.clientY - panY;
  }

  function handleMouseMove(e: MouseEvent) {
    if (rulerActive) {
      rulerMouse = {
        x: (e.clientX - panX) / zoom,
        y: (e.clientY - panY) / zoom,
      };
    }
    if (!isDragging) return;
    panX = e.clientX - dragStartX;
    panY = e.clientY - dragStartY;
  }

  function handleMouseUp() {
    isDragging = false;
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.85;
    zoom = Math.min(5, Math.max(0.2, zoom * factor));
  }

  function resetView() {
    panX = 0;
    panY = 0;
    zoom = 1;
  }

  function getPinEmoji(icon: string): string {
    switch (icon) {
      case 'castle': return '🏰';
      case 'anchor': return '⚓';
      case 'dungeon': return '🗝️';
      default: return '🏘️';
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="relative w-full h-full bg-slate-950 text-slate-100 overflow-hidden select-none"
  role="region"
  aria-label="World Atlas Map Viewer"
  onmousedown={handleMouseDown}
  onmousemove={handleMouseMove}
  onmouseup={handleMouseUp}
  onmouseleave={handleMouseUp}
  onwheel={handleWheel}
>
  <!-- Background Pattern -->
  <div class="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:24px_24px]"></div>

  <!-- DM Controls Overlay Header -->
  {#if isDm}
    <div class="absolute top-3 left-4 z-20 flex items-center gap-2 bg-slate-900/90 backdrop-blur-md border border-slate-800 p-2 rounded-xl shadow-xl text-xs">
      <span class="font-bold text-amber-400 uppercase text-[10px] tracking-wider">Atlas:</span>
      {#if allAtlases.length > 0}
        <select
          value={currentAtlas?.id || ''}
          onchange={(e) => selectAtlas((e.target as HTMLSelectElement).value)}
          class="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-indigo-500 font-semibold text-xs"
        >
          {#each allAtlases as atlas}
            <option value={atlas.id}>{atlas.name}</option>
          {/each}
        </select>
      {:else}
        <span class="text-slate-500 italic">No Atlas Maps Loaded</span>
      {/if}

      <!-- Upload Azgaar / Vector Map Button -->
      <label class="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-bold cursor-pointer transition-colors flex items-center gap-1">
        <span>📥</span>
        <span>{isUploading ? 'Importing…' : 'Import Map (.map, .geojson)'}</span>
        <input type="file" accept=".map,.geojson,.json" onchange={handleFileUpload} class="hidden" disabled={isUploading} />
      </label>

      <!-- Overland Ruler Button -->
      <button
        type="button"
        onclick={() => rulerActive = !rulerActive}
        class="px-2.5 py-1 rounded font-bold transition-colors flex items-center gap-1 {rulerActive
          ? 'bg-amber-500 text-slate-950 font-black'
          : 'bg-slate-800 hover:bg-slate-750 text-slate-300'}"
        title="Toggle Overland Travel Distance Ruler"
      >
        <span>📏</span>
        <span>{rulerActive ? 'Measuring…' : 'Ruler'}</span>
      </button>

      <button
        type="button"
        onclick={resetView}
        class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold transition-colors"
        title="Reset Pan and Zoom"
      >
        🎯 Reset View
      </button>
    </div>
  {/if}

  <!-- Transformable Map Surface -->
  <div
    class="absolute inset-0 origin-center transition-transform duration-75 ease-out"
    style="transform: translate({panX}px, {panY}px) scale({zoom}); cursor: {isDragging ? 'grabbing' : 'grab'};"
  >
    {#if currentAtlas}
      {#if activeSvgUrl}
        <img
          src={activeSvgUrl}
          alt={currentAtlas.name}
          class="absolute inset-0 w-[4000px] h-[3000px] object-contain pointer-events-none"
        />
      {/if}
      <!-- Render Vector Layers if available -->
      <svg class="absolute inset-0 w-[4000px] h-[3000px] pointer-events-none" viewBox="0 0 4000 3000">
        <!-- Borders -->
        {#if currentAtlas.vectorLayers?.bordersGeoJson?.features}
          {#each currentAtlas.vectorLayers.bordersGeoJson.features as feature}
            {#if feature.geometry?.coordinates}
              <!-- Simple line / polygon preview path -->
              <path
                d={feature.geometry.type.includes('Polygon')
                  ? `M ${feature.geometry.coordinates[0]?.map((pt: any) => `${pt[0]},${pt[1]}`).join(' L ')} Z`
                  : `M ${feature.geometry.coordinates?.map((pt: any) => `${pt[0]},${pt[1]}`).join(' L ')}`}
                fill="rgba(99, 102, 241, 0.04)"
                stroke="rgba(129, 140, 248, 0.3)"
                stroke-width="1.5"
                stroke-dasharray="4 2"
              />
            {/if}
          {/each}
        {/if}

        <!-- Routes -->
        {#if currentAtlas.vectorLayers?.routesGeoJson?.features}
          {#each currentAtlas.vectorLayers.routesGeoJson.features as feature}
            {#if feature.geometry?.coordinates}
              <path
                d={`M ${feature.geometry.coordinates?.map((pt: any) => `${pt[0]},${pt[1]}`).join(' L ')}`}
                fill="none"
                stroke="rgba(245, 158, 11, 0.4)"
                stroke-width="2"
              />
            {/if}
          {/each}
        {/if}
      </svg>

      <!-- POI Pins -->
      {#each displayPins as pin (pin.id)}
        <div
          class="absolute -translate-x-1/2 -translate-y-1/2 transition-transform hover:scale-125 z-10 cursor-pointer"
          style="left: {pin.x}px; top: {pin.y}px;"
          role="button"
          tabindex="0"
          onclick={(e) => {
            e.stopPropagation();
            selectedPin = pin;
          }}
          oncontextmenu={(e) => {
            if (isDm) {
              e.preventDefault();
              e.stopPropagation();
              openPinEditor(pin);
            }
          }}
          onkeydown={(e) => {
            if (e.key === 'Enter') selectedPin = pin;
          }}
        >
          <div class="flex flex-col items-center group">
            <div
              class="w-7 h-7 rounded-full flex items-center justify-center shadow-lg border text-sm transition-all {pin.isSecret
                ? 'bg-rose-950 border-rose-500/80 text-rose-200'
                : 'bg-slate-900 border-amber-500/80 text-amber-200 group-hover:border-amber-400'}"
            >
              <span>{getPinEmoji(pin.icon)}</span>
            </div>
            <span class="mt-0.5 px-1.5 py-0.5 rounded bg-slate-950/90 border border-slate-800 text-[10px] font-bold text-slate-200 whitespace-nowrap shadow">
              {pin.label}
              {#if isDm && pin.isSecret}
                <span class="text-[9px] text-rose-400 font-normal">[Secret]</span>
              {/if}
            </span>
          </div>
        </div>
      {/each}

      <!-- Multi-Point Overland Ruler -->
      {#if rulerActive}
        <AtlasRuler
          scale={currentAtlas.scale}
          bind:waypoints={rulerWaypoints}
          currentMouse={rulerMouse}
          bind:isMeasuring={rulerActive}
          onClear={() => { rulerWaypoints = []; rulerActive = false; }}
        />
      {/if}
    {:else}
      <div class="w-full h-full flex flex-col items-center justify-center text-slate-500">
        <span class="text-4xl mb-2">🗺️</span>
        <span class="text-sm font-semibold">No Overland World Atlas Loaded</span>
        {#if isDm}
          <span class="text-xs text-slate-600 mt-1">Import an Azgaar GeoJSON sourcebook to display map features.</span>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Selected Pin POI Drawer / Popover -->
  {#if selectedPin}
    <div
      class="absolute bottom-5 right-5 w-80 bg-slate-900/95 backdrop-blur-md border border-amber-500/50 rounded-2xl shadow-2xl p-4 z-30 space-y-2 animate-in fade-in"
    >
      <div class="flex items-start justify-between">
        <div class="flex items-center gap-2">
          <span class="text-xl">{getPinEmoji(selectedPin.icon)}</span>
          <div>
            <h4 class="font-bold text-sm text-amber-300 leading-tight">{selectedPin.label}</h4>
            {#if isDm && selectedPin.isSecret}
              <span class="text-[9px] uppercase font-bold text-rose-400">Secret POI (DM Only)</span>
            {/if}
          </div>
        </div>
        <button
          type="button"
          onclick={() => selectedPin = null}
          class="text-slate-400 hover:text-slate-200 text-sm font-bold"
        >
          ✕
        </button>
      </div>

      {#if selectedPin.description}
        <p class="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
          {selectedPin.description}
        </p>
      {/if}

      {#if selectedPin.linkedTacticalMapId}
        <div class="pt-2 border-t border-slate-800 space-y-1.5">
          <button
            type="button"
            onclick={() => enterEncounterMap(selectedPin!.linkedTacticalMapId!)}
            class="w-full py-1.5 px-3 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 active:scale-95 text-slate-950 font-black text-xs rounded-xl shadow-md flex items-center justify-center gap-1.5 transition-all"
          >
            <span>⚔️</span>
            <span>Enter Encounter Map</span>
          </button>
        </div>
      {/if}

      {#if isDm}
        <div class="pt-1">
          <button
            type="button"
            onclick={() => openPinEditor(selectedPin!)}
            class="w-full py-1 text-center text-[10px] font-bold text-slate-400 hover:text-slate-200 rounded hover:bg-slate-800 transition-colors"
          >
            ⚙ Edit POI Details
          </button>
        </div>
      {/if}
    </div>
  {/if}

  <!-- DM POI Pin Editor Modal -->
  {#if isEditingPin && editingPin}
    <div
      class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
      onclick={() => isEditingPin = false}
      role="presentation"
    >
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div
        class="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-5 space-y-4"
        onclick={(e) => e.stopPropagation()}
        role="dialog"
        tabindex="-1"
        aria-label="Edit Map POI Pin"
      >
        <div class="flex items-center justify-between border-b border-slate-800 pb-2">
          <h3 class="text-sm font-black text-slate-100 uppercase tracking-wider">Edit Map POI Pin</h3>
          <button
            type="button"
            onclick={() => isEditingPin = false}
            class="text-slate-400 hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        <div class="space-y-3 text-xs">
          <div>
            <label for="atlas-pin-label" class="text-[10px] font-bold uppercase text-slate-400 block mb-1">Pin Name / Label</label>
            <input
              id="atlas-pin-label"
              type="text"
              bind:value={editingPin.label}
              class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label for="atlas-pin-icon" class="text-[10px] font-bold uppercase text-slate-400 block mb-1">Icon Category</label>
            <select
              id="atlas-pin-icon"
              bind:value={editingPin.icon}
              class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 focus:outline-none focus:border-amber-500"
            >
              <option value="settlement">🏘️ Settlement / Town</option>
              <option value="castle">🏰 Castle / Fortress</option>
              <option value="dungeon">🗝️ Dungeon / Ruin</option>
              <option value="anchor">⚓ Port / Coast</option>
            </select>
          </div>

          <div>
            <label for="atlas-pin-desc" class="text-[10px] font-bold uppercase text-slate-400 block mb-1">Description / Lore</label>
            <textarea
              id="atlas-pin-desc"
              bind:value={editingPin.description}
              rows="3"
              class="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-amber-500"
            ></textarea>
          </div>

          <div>
            <label for="atlas-pin-battlemap" class="text-[10px] font-bold uppercase text-slate-400 block mb-1">Linked Tactical Battlemap</label>
            <select
              id="atlas-pin-battlemap"
              bind:value={editingPin.linkedTacticalMapId}
              class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 focus:outline-none focus:border-amber-500"
            >
              <option value="">-- No Linked Battlemap --</option>
              {#each tacticalMapsList as tMap}
                <option value={tMap.id}>{tMap.name}</option>
              {/each}
            </select>
          </div>

          <div class="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="pin-secret-checkbox"
              bind:checked={editingPin.isSecret}
              class="rounded bg-slate-950 border-slate-800 text-amber-500 focus:ring-amber-500"
            />
            <label for="pin-secret-checkbox" class="text-xs text-slate-300 font-semibold cursor-pointer">
              Secret POI (Hidden from Player Projector)
            </label>
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 border-t border-slate-800 pt-3">
          <button
            type="button"
            onclick={() => isEditingPin = false}
            class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-bold transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onclick={saveEditedPin}
            class="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition-colors shadow"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Scale Indicator Bottom-Right -->
  {#if currentAtlas}
    <div class="absolute bottom-3 right-4 z-10 pointer-events-none bg-slate-950/80 border border-slate-800 px-3 py-1 rounded-xl text-[10px] font-mono text-slate-400">
      <span>100 px = {Math.round(100 * currentAtlas.scale.unitsPerPixel)} {currentAtlas.scale.unitName}</span>
      <span class="ml-2 text-slate-600">|</span>
      <span class="ml-2">Zoom: {Math.round(zoom * 100)}%</span>
    </div>
  {/if}
</div>
