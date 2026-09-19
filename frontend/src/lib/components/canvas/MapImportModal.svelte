<script lang="ts">
  // MapImportModal.svelte — Vector map ingestion modal & building parcel entity inspector
  // Ingests Dungeon Scrawl (.ds) and Watabou (GeoJSON) exports with real-time preview and sample generation.

  import { parseDungeonScrawl, type DungeonScrawlParsedMap } from '../../canvas/parsers/dungeonScrawlParser';
  import { parseWatabouGeoJson, type WatabouCityMap, type BuildingParcel, type SettlementEntityType } from '../../canvas/parsers/watabouParser';

  let {
    isOpen = $bindable(false),
    onLoadDungeonMap,
    onLoadWatabouCity,
    selectedParcel = null,
    onSaveParcelEntity,
    onCloseParcelInspector,
  }: {
    isOpen?: boolean;
    onLoadDungeonMap?: (map: DungeonScrawlParsedMap) => void;
    onLoadWatabouCity?: (city: WatabouCityMap) => void;
    selectedParcel?: BuildingParcel | null;
    onSaveParcelEntity?: (parcelId: string, data: { entityType: SettlementEntityType; customName: string; notes: string; npcContact: string }) => void;
    onCloseParcelInspector?: () => void;
  } = $props();

  type ModalTab = 'import' | 'parcel';
  let activeTab = $state<ModalTab>('import');

  let isDraggingFile = $state(false);
  let statusMessage = $state<{ type: 'success' | 'error'; text: string } | null>(null);
  let previewStats = $state<{ type: 'ds' | 'watabou'; name: string; details: string } | null>(null);

  // Parcel editing state
  let entityType = $state<SettlementEntityType>('Tavern');
  let customName = $state('');
  let npcContact = $state('');
  let notes = $state('');

  $effect(() => {
    if (selectedParcel) {
      activeTab = 'parcel';
      entityType = selectedParcel.entityType || 'Tavern';
      customName = selectedParcel.customName || '';
      npcContact = selectedParcel.npcContact || '';
      notes = selectedParcel.notes || '';
      isOpen = true;
    }
  });

  // ── Drag and Drop Ingestion ────────────────────────────────────────────────
  async function handleFileDrop(e: DragEvent) {
    e.preventDefault();
    isDraggingFile = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      await processFile(file);
    }
  }

  async function handleFileInputChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      await processFile(file);
      input.value = '';
    }
  }

  async function processFile(file: File) {
    statusMessage = null;
    try {
      const text = await file.text();
      const lower = file.name.toLowerCase();

      // Check if Dungeon Scrawl (.ds or UVTT)
      if (lower.endsWith('.ds') || lower.endsWith('.uvtt') || text.includes('line_of_sight') || text.includes('document')) {
        const parsed = parseDungeonScrawl(text);
        onLoadDungeonMap?.(parsed);
        previewStats = {
          type: 'ds',
          name: parsed.name || file.name,
          details: `${parsed.walls.length} Wall Colliders · ${parsed.doors.length} Doors · Grid ${parsed.gridSize}px`,
        };
        statusMessage = { type: 'success', text: `Ingested Dungeon Scrawl map: ${file.name}` };
        setTimeout(() => { isOpen = false; }, 1200);
      }
      // Check if Watabou GeoJSON
      else if (lower.endsWith('.geojson') || lower.endsWith('.json') || text.includes('FeatureCollection') || text.includes('ward')) {
        const parsed = parseWatabouGeoJson(text);
        onLoadWatabouCity?.(parsed);
        previewStats = {
          type: 'watabou',
          name: parsed.name || file.name,
          details: `${parsed.districts.length} Districts · ${parsed.buildings.length} Building Lots · ${parsed.walls.length} Defensive Walls`,
        };
        statusMessage = { type: 'success', text: `Ingested Watabou City map: ${file.name}` };
        setTimeout(() => { isOpen = false; }, 1200);
      } else {
        statusMessage = { type: 'error', text: 'Unrecognized map format. Please upload a .ds or .geojson file.' };
      }
    } catch (err) {
      statusMessage = { type: 'error', text: err instanceof Error ? err.message : 'Error parsing map file.' };
    }
  }

  // ── Sample Presets ─────────────────────────────────────────────────────────
  function loadSampleDungeon() {
    const g = 60;
    // Build a classic 4-room dungeon with corridors and 3 doors
    const sampleDs: Record<string, unknown> = {
      resolution: { pixels_per_grid: 70 },
      line_of_sight: [
        // Room 1 (Entry Hall)
        [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 240 }, { x: 0, y: 240 }, { x: 0, y: 0 }],
        // Corridor
        [{ x: 300, y: 90 }, { x: 480, y: 90 }],
        [{ x: 300, y: 150 }, { x: 480, y: 150 }],
        // Room 2 (Armory)
        [{ x: 480, y: 0 }, { x: 750, y: 0 }, { x: 750, y: 240 }, { x: 480, y: 240 }, { x: 480, y: 0 }],
        // South Corridor & Crypt
        [{ x: 120, y: 240 }, { x: 120, y: 400 }],
        [{ x: 180, y: 240 }, { x: 180, y: 400 }],
        [{ x: 60, y: 400 }, { x: 420, y: 400 }, { x: 420, y: 640 }, { x: 60, y: 640 }, { x: 60, y: 400 }]
      ],
      portals: [
        { bounds: [{ x: 300, y: 90 }, { x: 300, y: 150 }], closed: true },
        { bounds: [{ x: 480, y: 90 }, { x: 480, y: 150 }], closed: false },
        { bounds: [{ x: 120, y: 240 }, { x: 180, y: 240 }], closed: true }
      ]
    };

    const parsed = parseDungeonScrawl(sampleDs, g);
    onLoadDungeonMap?.(parsed);
    statusMessage = { type: 'success', text: 'Loaded sample "Crypt of the Ancients" dungeon!' };
    setTimeout(() => { isOpen = false; }, 1000);
  }

  function loadSampleCity() {
    // Generate realistic multi-district settlement with wards, lots, walls, and roads
    const sampleFeatures = [
      // Defensive wall
      { properties: { type: 'wall' }, geometry: { type: 'LineString', coordinates: [[-350, -250], [350, -250], [350, 250], [-350, 250], [-350, -250]] } },
      // Main street
      { properties: { type: 'road', kind: 'main' }, geometry: { type: 'LineString', coordinates: [[-350, 0], [350, 0]] } },
      { properties: { type: 'road', kind: 'main' }, geometry: { type: 'LineString', coordinates: [[0, -250], [0, 250]] } },
      // Districts
      { properties: { type: 'district', ward: 'Market' }, geometry: { type: 'Polygon', coordinates: [[[-180, -180], [0, -180], [0, 0], [-180, 0], [-180, -180]]] } },
      { properties: { type: 'district', ward: 'Craftsmen' }, geometry: { type: 'Polygon', coordinates: [[[0, -180], [180, -180], [180, 0], [0, 0], [0, -180]]] } },
      { properties: { type: 'district', ward: 'Temple' }, geometry: { type: 'Polygon', coordinates: [[[-180, 0], [0, 0], [0, 180], [-180, 180], [-180, 0]]] } },
      { properties: { type: 'district', ward: 'Castle' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [180, 0], [180, 180], [0, 180], [0, 0]]] } },
    ];

    // Add building lots in each quarter
    const bldgs = [
      // Market quarter buildings
      { properties: { type: 'building', ward: 'Market' }, coords: [[-160, -160], [-120, -160], [-120, -120], [-160, -120]] },
      { properties: { type: 'building', ward: 'Market' }, coords: [[-100, -160], [-40, -160], [-40, -120], [-100, -120]] },
      { properties: { type: 'building', ward: 'Market' }, coords: [[-160, -100], [-120, -100], [-120, -40], [-160, -40]] },
      // Craftsmen quarter buildings
      { properties: { type: 'building', ward: 'Craftsmen' }, coords: [[40, -160], [100, -160], [100, -110], [40, -110]] },
      { properties: { type: 'building', ward: 'Craftsmen' }, coords: [[120, -160], [160, -160], [160, -110], [120, -110]] },
      { properties: { type: 'building', ward: 'Craftsmen' }, coords: [[40, -90], [90, -90], [90, -40], [40, -40]] },
      // Temple quarter buildings
      { properties: { type: 'building', ward: 'Temple' }, coords: [[-150, 40], [-50, 40], [-50, 140], [-150, 140]] },
      // Castle quarter buildings
      { properties: { type: 'building', ward: 'Castle' }, coords: [[50, 50], [150, 50], [150, 150], [50, 150]] },
    ];

    for (const b of bldgs) {
      sampleFeatures.push({
        properties: b.properties,
        geometry: { type: 'Polygon', coordinates: [[...b.coords, b.coords[0]]] } as unknown as { type: string; coordinates: unknown },
      });
    }

    const parsed = parseWatabouGeoJson({ features: sampleFeatures });
    onLoadWatabouCity?.(parsed);
    statusMessage = { type: 'success', text: 'Loaded sample "Riverside Settlement" city!' };
    setTimeout(() => { isOpen = false; }, 1000);
  }

  function handleSaveEntity() {
    if (!selectedParcel) return;
    onSaveParcelEntity?.(selectedParcel.id, {
      entityType,
      customName: customName.trim(),
      notes: notes.trim(),
      npcContact: npcContact.trim(),
    });
    statusMessage = { type: 'success', text: 'Saved parcel entity details!' };
    setTimeout(() => {
      onCloseParcelInspector?.();
      isOpen = false;
    }, 600);
  }
</script>

{#if isOpen}
  <!-- Backdrop -->
  <div
    role="presentation"
    class="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 transition-opacity"
    onclick={() => { onCloseParcelInspector?.(); isOpen = false; }}
  ></div>

  <!-- Modal Dialog -->
  <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="map-import-title"
    class="fixed inset-4 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-lg sm:h-[540px] bg-slate-900 border border-slate-700/80 rounded-2xl z-50 flex flex-col shadow-2xl overflow-hidden select-none"
  >
    <!-- Header -->
    <div class="h-13 bg-slate-950/80 border-b border-slate-800 px-4 flex items-center justify-between shrink-0">
      <div class="flex items-center gap-2">
        <span class="text-lg">📐</span>
        <div>
          <h2 id="map-import-title" class="text-sm font-bold text-slate-100 uppercase tracking-wider">
            {activeTab === 'parcel' ? 'Settlement Parcel Inspector' : 'Vector Map Ingestion'}
          </h2>
          <p class="text-[10px] text-slate-400">
            {activeTab === 'parcel' ? 'Assign establishment and NPC contact to parcel' : 'Dungeon Scrawl (.ds) &amp; Watabou City (GeoJSON)'}
          </p>
        </div>
      </div>
      <button
        type="button"
        onclick={() => { onCloseParcelInspector?.(); isOpen = false; }}
        class="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 flex items-center justify-center text-xs transition-colors"
      >
        ✕
      </button>
    </div>

    <!-- Tab navigation -->
    <div class="bg-slate-950 border-b border-slate-800 px-4 flex items-center gap-1 shrink-0 text-xs">
      <button
        type="button"
        onclick={() => activeTab = 'import'}
        class="px-3 py-2 font-semibold border-b-2 transition-colors
          {activeTab === 'import' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'}"
      >
        📥 Ingest Map File
      </button>
      {#if selectedParcel}
        <button
          type="button"
          onclick={() => activeTab = 'parcel'}
          class="px-3 py-2 font-semibold border-b-2 transition-colors
            {activeTab === 'parcel' ? 'border-amber-500 text-amber-400' : 'border-transparent text-slate-400 hover:text-slate-200'}"
        >
          🏛️ Selected Parcel ({selectedParcel.id})
        </button>
      {/if}
    </div>

    <!-- Status toast -->
    {#if statusMessage}
      <div class="px-4 py-2 text-xs flex items-center justify-between shrink-0
        {statusMessage.type === 'success' ? 'bg-emerald-950 text-emerald-300 border-b border-emerald-800/40' : 'bg-rose-950 text-rose-300 border-b border-rose-800/40'}">
        <span>{statusMessage.text}</span>
        <button type="button" onclick={() => statusMessage = null} class="font-bold opacity-75 hover:opacity-100">✕</button>
      </div>
    {/if}

    <!-- Content body -->
    <div class="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
      {#if activeTab === 'import'}
        <!-- Drag & Drop Zone -->
        <div
          role="region"
          aria-label="Map File Drop Zone"
          class="p-6 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center transition-all
            {isDraggingFile ? 'border-indigo-500 bg-indigo-950/40' : 'border-slate-700 bg-slate-950/40 hover:border-slate-600'}"
          ondragover={(e) => { e.preventDefault(); isDraggingFile = true; }}
          ondragleave={() => { isDraggingFile = false; }}
          ondrop={handleFileDrop}
        >
          <span class="text-3xl mb-2">📜</span>
          <p class="font-bold text-slate-200 mb-1">Drag &amp; drop .ds or .geojson files here</p>
          <p class="text-[11px] text-slate-400 mb-4 max-w-xs">
            Dungeon Scrawl files will generate wall colliders and doors. Watabou GeoJSON files generate interactive city districts.
          </p>

          <label class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg cursor-pointer transition-colors text-xs shadow-md shadow-indigo-600/20">
            Choose File (.ds, .json, .geojson)
            <input type="file" accept=".ds,.json,.geojson,.uvtt" class="hidden" onchange={handleFileInputChange} />
          </label>
        </div>

        <!-- Sample generators -->
        <div class="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2">
          <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Quick Presets / Testing</span>
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              onclick={loadSampleDungeon}
              class="p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-left transition-colors"
            >
              <span class="font-bold text-indigo-300 block text-xs">🗡️ Crypt Dungeon</span>
              <span class="text-[10px] text-slate-400">4 rooms, corridors, 3 raycast doors</span>
            </button>

            <button
              type="button"
              onclick={loadSampleCity}
              class="p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-left transition-colors"
            >
              <span class="font-bold text-emerald-300 block text-xs">🏰 City Settlement</span>
              <span class="text-[10px] text-slate-400">4 districts, walls, clickable building lots</span>
            </button>
          </div>
        </div>

      {:else if activeTab === 'parcel' && selectedParcel}
        <!-- Building Parcel Entity Assignment Form -->
        <div class="space-y-3">
          <div class="p-3 bg-slate-950/60 rounded-lg border border-slate-800 flex items-center justify-between">
            <div>
              <span class="text-[10px] uppercase text-slate-500 font-bold block">Parcel ID</span>
              <span class="font-mono text-slate-200">{selectedParcel.id}</span>
            </div>
            {#if selectedParcel.districtName}
              <div class="text-right">
                <span class="text-[10px] uppercase text-slate-500 font-bold block">District</span>
                <span class="font-semibold text-indigo-400">{selectedParcel.districtName}</span>
              </div>
            {/if}
          </div>

          <div class="space-y-1">
            <label for="parcel-entity-select" class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Establishment Type</label>
            <select
              id="parcel-entity-select"
              bind:value={entityType}
              class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
            >
              <option value="Tavern">🍺 Tavern / Inn</option>
              <option value="Temple">⛪ Temple / Shrine</option>
              <option value="Smithy">⚒️ Blacksmith / Armorer</option>
              <option value="Apothecary">🧪 Alchemist / Apothecary</option>
              <option value="Vault">🗝️ Vault / Bank</option>
              <option value="Guildhall">📜 Trade Guildhall</option>
              <option value="Barracks">🛡️ Guardhouse / Barracks</option>
              <option value="Market">⚖️ Open Market Stall</option>
              <option value="Residence">🏠 Private Residence</option>
            </select>
          </div>

          <div class="space-y-1">
            <label for="parcel-custom-name" class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Establishment Name</label>
            <input
              id="parcel-custom-name"
              type="text"
              bind:value={customName}
              placeholder="e.g. The Silver Flagon, Hammer &amp; Tongs"
              class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div class="space-y-1">
            <label for="parcel-npc-contact" class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">NPC Contact / Proprietor</label>
            <input
              id="parcel-npc-contact"
              type="text"
              bind:value={npcContact}
              placeholder="e.g. Barnaby Stout, High Priestess Morwen"
              class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div class="space-y-1">
            <label for="parcel-notes" class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">DM Notes &amp; Secrets</label>
            <textarea
              id="parcel-notes"
              bind:value={notes}
              rows="3"
              placeholder="Rumors, hidden vaults, cellar entrances, security DC…"
              class="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 text-xs focus:outline-none focus:border-indigo-500 resize-none leading-relaxed"
            ></textarea>
          </div>

          <div class="flex gap-2 pt-1">
            <button
              type="button"
              onclick={handleSaveEntity}
              class="flex-1 py-2.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded-lg transition-colors shadow"
            >
              Save Establishment Details
            </button>
            <button
              type="button"
              onclick={() => { onCloseParcelInspector?.(); isOpen = false; }}
              class="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
