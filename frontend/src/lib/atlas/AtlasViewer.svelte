<!-- src/lib/atlas/AtlasViewer.svelte -->
<!-- Hierarchical Overland Atlas — CRS.Simple pan/zoom + normalized pins -->

<script lang="ts">
  import { onMount } from 'svelte';
  import {
    fetchAtlasChildren,
    fetchAtlasPins,
    upsertAtlasPin,
    deleteAtlasPin,
    buildBreadcrumb,
  } from '$lib/db/atlasDb';
  import { mapsDb, type AtlasMapNode, type AtlasPin, type AtlasPinTargetType } from '$lib/db/mapsDb';

  // ── Props ───────────────────────────────────────────────────────────────────
  let {
    rootNodeId = null,
    onOpenBattlemap,
    onOpenJournal,
  }: {
    rootNodeId?: string | null;
    onOpenBattlemap?: (sceneId: string) => void;
    onOpenJournal?: (entryId: string) => void;
  } = $props();

  // ── Viewport state (CRS.Simple) ─────────────────────────────────────────────
  let containerEl = $state<HTMLDivElement | null>(null);
  let zoom = $state(1.0);
  let panX = $state(0);
  let panY = $state(0);
  let isPanning = $state(false);
  let panStart = $state({ x: 0, y: 0, panX: 0, panY: 0 });

  // ── Atlas navigation state ──────────────────────────────────────────────────
  let currentNode = $state<AtlasMapNode | null>(null);
  let breadcrumb = $state<AtlasMapNode[]>([]);
  let pins = $state<AtlasPin[]>([]);
  let children = $state<AtlasMapNode[]>([]);

  // ── Pin creation state ──────────────────────────────────────────────────────
  let isPinMode = $state(false);
  let newPinForm = $state<{
    label: string;
    targetType: AtlasPinTargetType;
    targetId: string;
    iconEmoji: string;
  } | null>(null);
  let pendingPinCoords = $state<{ x: number; y: number } | null>(null);

  // ── Distance measurement ────────────────────────────────────────────────────
  let isMeasuring = $state(false);
  let measureStart = $state<{ x: number; y: number } | null>(null);
  let measureEnd = $state<{ x: number; y: number } | null>(null);
  let measuredDistance = $state<string | null>(null);

  // ── Root children ───────────────────────────────────────────────────────────
  let rootNodes = $state<AtlasMapNode[]>([]);
  let loadError = $state<string | null>(null);

  onMount(async () => {
    try {
      if (rootNodeId) {
        await navigateTo(rootNodeId);
      } else {
        rootNodes = await fetchAtlasChildren(null);
      }
    } catch (e: any) {
      loadError = e?.message ?? 'Failed to load atlas';
    }
  });

  async function navigateTo(nodeId: string) {
    loadError = null;
    const node = await mapsDb.atlasNodes.get(nodeId);
    if (!node) { loadError = `Atlas node '${nodeId}' not found`; return; }
    currentNode = node;
    breadcrumb = await buildBreadcrumb(nodeId);
    pins = await fetchAtlasPins(nodeId);
    children = await fetchAtlasChildren(nodeId);
    // Reset viewport when navigating
    zoom = 1.0; panX = 0; panY = 0;
  }

  async function navigateToBreadcrumb(node: AtlasMapNode) {
    await navigateTo(node.id);
  }

  // ── Viewport helpers ─────────────────────────────────────────────────────────
  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    zoom = Math.min(8, Math.max(0.25, zoom * delta));
  }

  function handlePointerDown(e: PointerEvent) {
    if (isPinMode) return;
    if (isMeasuring) {
      const { nx, ny } = screenToNorm(e.clientX, e.clientY);
      if (!measureStart) {
        measureStart = { x: nx, y: ny };
        measureEnd = null;
        measuredDistance = null;
      } else {
        measureEnd = { x: nx, y: ny };
        computeDistance();
        measureStart = null;
      }
      return;
    }
    isPanning = true;
    panStart = { x: e.clientX, y: e.clientY, panX, panY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: PointerEvent) {
    if (!isPanning) return;
    panX = panStart.panX + (e.clientX - panStart.x);
    panY = panStart.panY + (e.clientY - panStart.y);
  }

  function handlePointerUp(e: PointerEvent) {
    isPanning = false;
  }

  function handleImageClick(e: MouseEvent) {
    if (!isPinMode || !currentNode) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    pendingPinCoords = { x: Math.max(0, Math.min(1, nx)), y: Math.max(0, Math.min(1, ny)) };
    newPinForm = { label: '', targetType: 'atlas_map', targetId: '', iconEmoji: '📍' };
  }

  async function saveNewPin() {
    if (!newPinForm || !pendingPinCoords || !currentNode) return;
    const pin: AtlasPin = {
      id: `pin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      atlasMapId: currentNode.id,
      label: newPinForm.label || 'Unnamed',
      x: pendingPinCoords.x,
      y: pendingPinCoords.y,
      targetType: newPinForm.targetType,
      targetId: newPinForm.targetId,
      iconEmoji: newPinForm.iconEmoji || '📍',
      createdAt: Date.now(),
    };
    await upsertAtlasPin(pin);
    pins = [...pins, pin];
    newPinForm = null;
    pendingPinCoords = null;
    isPinMode = false;
  }

  async function handlePinClick(pin: AtlasPin) {
    if (pin.targetType === 'atlas_map') {
      await navigateTo(pin.targetId);
    } else if (pin.targetType === 'battlemap_scene') {
      onOpenBattlemap?.(pin.targetId);
    } else if (pin.targetType === 'journal_entry') {
      onOpenJournal?.(pin.targetId);
    }
  }

  async function handleDeletePin(pinId: string, e: MouseEvent) {
    e.stopPropagation();
    await deleteAtlasPin(pinId);
    pins = pins.filter((p) => p.id !== pinId);
  }

  // ── Biome & River Travel Multipliers (Adapted from Azgaar/Fantasy-Map-Generator) ───
  export type AtlasBiome = 'plains' | 'forest' | 'mountains' | 'swamp' | 'desert';
  export type TravelPaceMode = 'overland' | 'river_downstream' | 'river_upstream';

  let selectedBiome = $state<AtlasBiome>('plains');
  let travelPaceMode = $state<TravelPaceMode>('overland');
  let settlementLedger = $state<any | null>(null);

  // Border Collision Alert Modal State
  let activeBorderAlert = $state<{
    regionName: string;
    faction: string;
    diplomaticStatus: 'Friendly' | 'Neutral' | 'Hostile' | 'Contested';
    customsLore: string;
    tariff: string;
  } | null>(null);

  const BIOME_TRAVEL_DATA: Record<AtlasBiome, { multiplier: number; milesPerDay: number; description: string }> = {
    plains: { multiplier: 1.0, milesPerDay: 24, description: 'Normal pace: 24 miles/day' },
    forest: { multiplier: 1.5, milesPerDay: 16, description: '1.5x cost: 16 miles/day (Dense brush)' },
    mountains: { multiplier: 2.0, milesPerDay: 12, description: '2.0x cost: 12 miles/day (Steep terrain)' },
    swamp: { multiplier: 2.0, milesPerDay: 12, description: '2.0x cost: 12 miles/day (Hazardous mire)' },
    desert: { multiplier: 1.5, milesPerDay: 16, description: '1.5x cost: Forced march CON checks beyond 8h' },
  };

  const RIVER_PACE_MULTIPLIERS: Record<TravelPaceMode, { boost: number; label: string }> = {
    overland: { boost: 1.0, label: 'Overland (1.0x)' },
    river_downstream: { boost: 2.0, label: '⛵ River Downstream (2.0x speed boost)' },
    river_upstream: { boost: 0.5, label: '🛶 River Upstream (0.5x speed penalty)' },
  };

  // Mock regional border definitions (normalized 0.0 - 1.0)
  interface RegionalBorder {
    regionName: string;
    faction: string;
    diplomaticStatus: 'Friendly' | 'Neutral' | 'Hostile' | 'Contested';
    customsLore: string;
    tariff: string;
    bounds: { minX: number; maxX: number; minY: number; maxY: number };
  }

  const REGIONAL_BORDERS: RegionalBorder[] = [
    {
      regionName: 'Grand Duchy of Graywood',
      faction: 'Concord of Seven Crowns',
      diplomaticStatus: 'Friendly',
      customsLore: 'Imperial trade escorts patrol the paved highways. Common folk travel freely; weapons must be peace-bonded in burgs.',
      tariff: 'Standard 2% ad valorem cargo assay',
      bounds: { minX: 0.0, maxX: 0.5, minY: 0.0, maxY: 0.5 },
    },
    {
      regionName: 'Barony of the Iron Marches',
      faction: 'Marquisate Ironclad Watch',
      diplomaticStatus: 'Contested',
      customsLore: 'Militarized fortified frontier. Mercenaries and spellcasters must register at the palisade post upon entry.',
      tariff: '5 silver sovereigns per pack beast or wagon',
      bounds: { minX: 0.5, maxX: 1.0, minY: 0.0, maxY: 1.0 },
    },
    {
      regionName: 'Sunken Mire of Modlahd',
      faction: 'Rucean Outcast Clans',
      diplomaticStatus: 'Hostile',
      customsLore: 'Lawless wetlands. Imperial writ carries no weight. Tolls are exacted at spearpoint by river raiders.',
      tariff: 'All metallic coinage or surrender of cargo',
      bounds: { minX: 0.0, maxX: 0.5, minY: 0.5, maxY: 1.0 },
    },
  ];

  function checkBorderCrossing(nx: number, ny: number) {
    for (const border of REGIONAL_BORDERS) {
      if (
        nx >= border.bounds.minX &&
        nx <= border.bounds.maxX &&
        ny >= border.bounds.minY &&
        ny <= border.bounds.maxY
      ) {
        if (!activeBorderAlert || activeBorderAlert.regionName !== border.regionName) {
          activeBorderAlert = {
            regionName: border.regionName,
            faction: border.faction,
            diplomaticStatus: border.diplomaticStatus,
            customsLore: border.customsLore,
            tariff: border.tariff,
          };
        }
        break;
      }
    }
  }

  // ── Distance measurement ─────────────────────────────────────────────────────
  function screenToNorm(clientX: number, clientY: number): { nx: number; ny: number } {
    if (!containerEl) return { nx: 0, ny: 0 };
    const rect = containerEl.getBoundingClientRect();
    return {
      nx: (clientX - rect.left - panX) / (rect.width * zoom),
      ny: (clientY - rect.top - panY) / (rect.height * zoom),
    };
  }

  function computeDistance() {
    if (!measureStart || !measureEnd || !currentNode) return;
    const dx = (measureEnd.x - measureStart.x) * currentNode.imageWidthPx;
    const dy = (measureEnd.y - measureStart.y) * currentNode.imageHeightPx;
    const pixelDist = Math.sqrt(dx * dx + dy * dy);
    const unitDist = pixelDist / currentNode.pixelsPerUnit;

    const biomeData = BIOME_TRAVEL_DATA[selectedBiome];
    const riverBoost = RIVER_PACE_MULTIPLIERS[travelPaceMode].boost;
    // Downstream (2.0x) halves travel days; Upstream (0.5x) doubles travel days
    const effectiveDays = ((unitDist * biomeData.multiplier) / 24) / riverBoost;

    const riverLabel = travelPaceMode !== 'overland' ? ` · ${RIVER_PACE_MULTIPLIERS[travelPaceMode].label}` : '';
    measuredDistance = `${unitDist.toFixed(1)} ${currentNode.unit} (${effectiveDays.toFixed(1)} days travel in ${selectedBiome}${riverLabel})`;

    // Check border crossing along measurement vector
    checkBorderCrossing(measureEnd.x, measureEnd.y);
  }

  // ── Burg Settlement Ledger Generator ─────────────────────────────────────────
  async function generateBurgSettlement(pin: AtlasPin) {
    const { generateName } = await import('$lib/services/generators/markovNameGen');
    const { generateLoot } = await import('$lib/services/generators/lootGenerator');

    const tavernName = `The ${generateName('human')} & Crown`;
    const barkeep = generateName('human');
    const patrons = [generateName('human'), generateName('elven'), generateName('dwarven')];
    const shopLoot = generateLoot({ cr: 2, isHoard: true });

    settlementLedger = {
      burgName: pin.label,
      tavern: { name: tavernName, barkeep, patrons },
      generalStore: shopLoot.magicItems,
      biome: selectedBiome,
    };
  }
</script>

<div
  class="relative w-full h-full bg-slate-950 overflow-hidden select-none flex flex-col"
  style="cursor: {isPinMode ? 'crosshair' : isMeasuring ? 'crosshair' : isPanning ? 'grabbing' : 'grab'}"
>
  <!-- Breadcrumb header -->
  <div class="flex items-center gap-1.5 px-3 py-2 bg-slate-900/90 border-b border-slate-800 text-xs shrink-0 z-10">
    <span class="text-slate-500">🌍</span>
    {#if breadcrumb.length === 0}
      <span class="text-slate-400 font-semibold">World Atlas</span>
    {:else}
      <button
        type="button"
        onclick={() => { currentNode = null; breadcrumb = []; pins = []; children = []; zoom = 1; panX = 0; panY = 0; }}
        class="text-indigo-400 hover:text-white transition-colors"
      >World</button>
      {#each breadcrumb as crumb, i}
        <span class="text-slate-600">/</span>
        {#if i < breadcrumb.length - 1}
          <button
            type="button"
            onclick={() => navigateToBreadcrumb(crumb)}
            class="text-indigo-400 hover:text-white transition-colors"
          >{crumb.name}</button>
        {:else}
          <span class="text-slate-200 font-bold">{crumb.name}</span>
        {/if}
      {/each}
    {/if}
    <span class="ml-auto flex items-center gap-2">
      {#if currentNode}
        <select
          bind:value={selectedBiome}
          onchange={computeDistance}
          class="bg-slate-800 border border-slate-700 text-slate-300 text-[10px] rounded px-1.5 py-0.5 outline-none font-medium"
        >
          <option value="plains">🌾 Plains (1.0x)</option>
          <option value="forest">🌲 Forest (1.5x)</option>
          <option value="mountains">⛰️ Mountains (2.0x)</option>
          <option value="swamp">🐊 Swamp (2.0x)</option>
          <option value="desert">🏜️ Desert (1.5x)</option>
        </select>
        <select
          bind:value={travelPaceMode}
          onchange={computeDistance}
          class="bg-slate-800 border border-slate-700 text-slate-300 text-[10px] rounded px-1.5 py-0.5 outline-none font-medium"
        >
          <option value="overland">🚶 Overland</option>
          <option value="river_downstream">⛵ River Downstream (2.0x)</option>
          <option value="river_upstream">🛶 River Upstream (0.5x)</option>
        </select>
        <button
          type="button"
          onclick={() => { isPinMode = !isPinMode; isMeasuring = false; }}
          class="px-2 py-0.5 rounded text-[10px] font-bold {isPinMode ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'} transition-colors"
        >📍 Pin</button>
        <button
          type="button"
          onclick={() => { isMeasuring = !isMeasuring; isPinMode = false; measureStart = null; measureEnd = null; measuredDistance = null; }}
          class="px-2 py-0.5 rounded text-[10px] font-bold {isMeasuring ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'} transition-colors"
        >📏 Measure</button>
      {/if}
      <span class="font-mono text-slate-500 text-[10px]">{Math.round(zoom * 100)}%</span>
    </span>
  </div>

  {#if measuredDistance}
    <div class="absolute top-12 left-1/2 -translate-x-1/2 z-30 bg-amber-900/90 border border-amber-600 text-amber-200 text-xs font-mono px-3 py-1.5 rounded-xl shadow-lg">
      📏 {measuredDistance}
    </div>
  {/if}

  {#if activeBorderAlert}
    <div class="absolute top-16 left-4 z-40 bg-slate-900/95 border border-amber-500/60 rounded-xl p-3 shadow-2xl text-xs max-w-xs backdrop-blur-md animate-in slide-in-from-left duration-200">
      <div class="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-2">
        <span class="font-bold text-amber-400 flex items-center gap-1.5">
          <span>🚩</span> Border Crossing Alert
        </span>
        <button type="button" onclick={() => (activeBorderAlert = null)} class="text-slate-500 hover:text-white">✕</button>
      </div>
      <div class="space-y-1.5 text-slate-300 text-[11px]">
        <div><strong class="text-amber-300">Territory:</strong> {activeBorderAlert.regionName}</div>
        <div><strong class="text-indigo-300">Ruling Faction:</strong> {activeBorderAlert.faction}</div>
        <div>
          <strong class="text-slate-400">Diplomatic Status:</strong>
          <span class="px-1.5 py-0.5 rounded text-[10px] font-bold {activeBorderAlert.diplomaticStatus === 'Friendly' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : activeBorderAlert.diplomaticStatus === 'Hostile' ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'bg-amber-950 text-amber-300 border border-amber-800'}">
            {activeBorderAlert.diplomaticStatus}
          </span>
        </div>
        <div class="text-[10px] text-slate-400 pt-1 border-t border-slate-800 leading-normal">
          {activeBorderAlert.customsLore}
        </div>
        <div class="text-[10px] text-amber-300/90 font-mono">
          <strong>Tariff:</strong> {activeBorderAlert.tariff}
        </div>
      </div>
    </div>
  {/if}

  {#if settlementLedger}
    <div class="absolute top-16 right-4 z-40 bg-slate-900/95 border border-indigo-500/50 rounded-xl p-3 shadow-2xl text-xs max-w-xs backdrop-blur-md">
      <div class="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-2">
        <span class="font-bold text-amber-300">🏰 {settlementLedger.burgName} Ledger</span>
        <button type="button" onclick={() => (settlementLedger = null)} class="text-slate-500 hover:text-white">✕</button>
      </div>
      <div class="space-y-1.5 text-slate-300 text-[11px]">
        <div><strong class="text-indigo-300">Tavern:</strong> {settlementLedger.tavern.name}</div>
        <div><strong class="text-indigo-300">Barkeep:</strong> {settlementLedger.tavern.barkeep}</div>
        <div><strong class="text-indigo-300">Patrons:</strong> {settlementLedger.tavern.patrons.join(', ')}</div>
        <div class="pt-1 border-t border-slate-800 text-[10px] text-slate-400">
          <strong class="text-amber-400">Stocked Wares ({settlementLedger.generalStore.length} items):</strong>
          <ul class="list-disc pl-4 mt-0.5">
            {#each settlementLedger.generalStore.slice(0, 3) as item}
              <li>{item.name} ({item.current_rp} RP)</li>
            {/each}
          </ul>
        </div>
      </div>
    </div>
  {/if}

  {#if loadError}
    <div class="flex-1 flex items-center justify-center text-rose-400 text-sm">{loadError}</div>
  {:else if !currentNode}
    <!-- Root node selection -->
    <div class="flex-1 overflow-y-auto p-4">
      <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">World Maps</h3>
      {#if rootNodes.length === 0}
        <div class="text-center text-slate-500 text-xs py-8">
          <div class="text-3xl mb-2">🌍</div>
          No atlas maps yet. Import a world map image from the Ingest panel to get started.
        </div>
      {:else}
        <div class="grid grid-cols-2 gap-2">
          {#each rootNodes as node}
            <button
              type="button"
              onclick={() => navigateTo(node.id)}
              class="p-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-left text-xs transition-colors"
            >
              <div class="font-bold text-slate-200">{node.name}</div>
              <div class="text-slate-400 text-[10px]">{node.unit} scale · {node.breadcrumb?.join(' › ') || 'Root'}</div>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {:else}
    <!-- Panning map container -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      bind:this={containerEl}
      class="flex-1 relative overflow-hidden"
      onwheel={handleWheel}
      onpointerdown={handlePointerDown}
      onpointermove={handlePointerMove}
      onpointerup={handlePointerUp}
    >
      <!-- Transform origin = top-left; CRS.Simple flat coordinate space -->
      <div
        style="transform: translate({panX}px, {panY}px) scale({zoom}); transform-origin: top left; width: 100%; height: 100%; position: absolute;"
      >
        <!-- Map image -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="relative w-full h-full"
          onclick={handleImageClick}
        >
          {#if currentNode.imageUrl}
            <img
              src={currentNode.imageUrl}
              alt={currentNode.name}
              class="w-full h-full object-contain pointer-events-none"
              draggable="false"
            />
          {:else}
            <div class="w-full h-full flex items-center justify-center bg-slate-900 text-slate-600 text-sm">
              No image — drag a map image here or update the node's imageUrl.
            </div>
          {/if}

          <!-- Normalized pins -->
          {#each pins as pin}
            <div
              class="absolute -translate-x-1/2 -translate-y-full z-20 group flex flex-col items-center cursor-pointer"
              style="left: {pin.x * 100}%; top: {pin.y * 100}%;"
              onclick={(e) => { e.stopPropagation(); handlePinClick(pin); }}
              onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); handlePinClick(pin); } }}
              role="button"
              tabindex="0"
              title={pin.label}
            >
              <span class="text-lg drop-shadow-lg group-hover:scale-125 transition-transform">{pin.iconEmoji || '📍'}</span>
              <span class="text-[9px] font-bold text-white bg-slate-900/80 px-1 py-0.5 rounded shadow whitespace-nowrap max-w-[80px] truncate">{pin.label}</span>
              <!-- Settlement Ledger button -->
              <button
                type="button"
                title="Generate Settlement Ledger"
                onclick={(e) => { e.stopPropagation(); generateBurgSettlement(pin); }}
                class="absolute -top-1 -left-3 text-[9px] opacity-0 group-hover:opacity-100 bg-amber-600 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center transition-opacity"
              >🏰</button>
              <!-- Delete button -->
              <button
                type="button"
                onclick={(e) => handleDeletePin(pin.id, e)}
                class="absolute -top-1 -right-3 text-[9px] opacity-0 group-hover:opacity-100 bg-rose-700 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center transition-opacity"
              >✕</button>
            </div>
          {/each}

          <!-- Pending pin preview -->
          {#if pendingPinCoords}
            <span
              class="absolute -translate-x-1/2 -translate-y-full z-30 text-xl animate-bounce"
              style="left: {pendingPinCoords.x * 100}%; top: {pendingPinCoords.y * 100}%;"
            >📍</span>
          {/if}
        </div>
      </div>
    </div>

    <!-- Child map navigation strip -->
    {#if children.length > 0}
      <div class="shrink-0 px-3 py-2 bg-slate-900/80 border-t border-slate-800 flex gap-2 overflow-x-auto">
        <span class="text-[10px] text-slate-500 shrink-0 self-center">Sub-regions:</span>
        {#each children as child}
          <button
            type="button"
            onclick={() => navigateTo(child.id)}
            class="px-2 py-1 bg-slate-800 hover:bg-indigo-700 border border-slate-700 text-slate-300 text-[10px] font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            🗺️ {child.name}
          </button>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<!-- New pin form modal -->
{#if newPinForm && pendingPinCoords}
  <div class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center" role="presentation">
    <div class="bg-slate-900 border border-slate-700 rounded-2xl p-5 w-80 space-y-3 shadow-2xl text-xs">
      <h3 class="font-bold text-sm text-slate-200">Add Atlas Pin</h3>
      <div>
        <label class="text-[10px] text-slate-400 block mb-1" for="pin-label">Label</label>
        <input id="pin-label" type="text" bind:value={newPinForm.label} class="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200 outline-none focus:border-indigo-500" placeholder="e.g. Capital City" />
      </div>
      <div>
        <label class="text-[10px] text-slate-400 block mb-1" for="pin-icon">Icon</label>
        <input id="pin-icon" type="text" bind:value={newPinForm.iconEmoji} class="w-20 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200 outline-none text-center" />
      </div>
      <div>
        <label class="text-[10px] text-slate-400 block mb-1" for="pin-type">Links to</label>
        <select id="pin-type" bind:value={newPinForm.targetType} class="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200 outline-none">
          <option value="atlas_map">Atlas Map (drill-down)</option>
          <option value="battlemap_scene">Tactical Battlemap</option>
          <option value="journal_entry">Journal Entry</option>
        </select>
      </div>
      <div>
        <label class="text-[10px] text-slate-400 block mb-1" for="pin-target">Target ID</label>
        <input id="pin-target" type="text" bind:value={newPinForm.targetId} class="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200 outline-none font-mono text-[10px] focus:border-indigo-500" placeholder="paste id here" />
      </div>
      <div class="flex gap-2 pt-1">
        <button type="button" onclick={saveNewPin} class="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition-colors">Save Pin</button>
        <button type="button" onclick={() => { newPinForm = null; pendingPinCoords = null; }} class="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg transition-colors">Cancel</button>
      </div>
    </div>
  </div>
{/if}
