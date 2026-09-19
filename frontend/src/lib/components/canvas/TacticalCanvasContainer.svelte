<script lang="ts">
  import { onMount } from 'svelte';
  import TacticalCanvas from '../../canvas/TacticalCanvas.svelte';
  import type { Token, Wall } from '../../canvas/types';
  import Icons from '../../../components/Icons.svelte';
  import { dispatchSoundEvent } from '../../audio/soundboardBridge';

  export type CanvasTool = 'select' | 'wall' | 'door' | 'ruler' | 'spawn';

  let {
    tokens = $bindable([] as Token[]),
    walls = $bindable([] as Wall[]),
    onTokenMove,
    onDropMonster,
  }: {
    tokens?: Token[];
    walls?: Wall[];
    onTokenMove?: (id: string, x: number, y: number) => void;
    onDropMonster?: (monster: unknown, x: number, y: number) => void;
  } = $props();

  let activeTool = $state<CanvasTool>('select');
  let isFogEnabled = $state(true);
  let snapToGrid = $state(true);
  let darknessOpacity = $state(0.95);
  let isSpawnDrawerOpen = $state(false);

  // Ruler measurement state
  let isMeasuring = $state(false);
  let rulerStart = $state<{ x: number; y: number } | null>(null);
  let rulerCurrent = $state<{ x: number; y: number } | null>(null);

  // Wall drawing in-progress state
  let wallDrawStart = $state<[number, number] | null>(null);

  const GRID_SIZE = 50; // 50px = 5 feet (standard 5e scale: 10px / ft)

  // Calculate measuring ruler distance
  let measuredDistanceFt = $derived(() => {
    if (!rulerStart || !rulerCurrent) return 0;
    const dx = rulerCurrent.x - rulerStart.x;
    const dy = rulerCurrent.y - rulerStart.y;
    const pixels = Math.hypot(dx, dy);
    // 50px = 5ft => 10px per foot
    return Math.round((pixels / 10) * 10) / 10;
  });

  let measuredSquares = $derived(() => {
    if (!rulerStart || !rulerCurrent) return 0;
    const dx = Math.abs(rulerCurrent.x - rulerStart.x);
    const dy = Math.abs(rulerCurrent.y - rulerStart.y);
    // D&D 5e standard grid movement: 1 sq = 50px
    return Math.round(Math.max(dx, dy) / GRID_SIZE);
  });

  function selectTool(tool: CanvasTool) {
    activeTool = tool;
    if (tool !== 'ruler') {
      rulerStart = null;
      rulerCurrent = null;
      isMeasuring = false;
    }
    if (tool !== 'wall') {
      wallDrawStart = null;
    }
  }

  function handleCanvasClick(e: MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    let clickX = e.clientX - rect.left;
    let clickY = e.clientY - rect.top;

    if (snapToGrid) {
      clickX = Math.round(clickX / GRID_SIZE) * GRID_SIZE;
      clickY = Math.round(clickY / GRID_SIZE) * GRID_SIZE;
    }

    if (activeTool === 'wall') {
      if (!wallDrawStart) {
        wallDrawStart = [clickX, clickY];
      } else {
        const newWall: Wall = {
          p1: wallDrawStart,
          p2: [clickX, clickY],
          blocksVision: true,
          blocksMovement: true,
          isDoor: false,
          isOpen: false,
        };
        walls = [...walls, newWall];
        wallDrawStart = null;
        dispatchSoundEvent('item_broken');
      }
    } else if (activeTool === 'door') {
      if (!wallDrawStart) {
        wallDrawStart = [clickX, clickY];
      } else {
        const newDoor: Wall = {
          p1: wallDrawStart,
          p2: [clickX, clickY],
          blocksVision: true,
          blocksMovement: true,
          isDoor: true,
          isOpen: false,
        };
        walls = [...walls, newDoor];
        wallDrawStart = null;
        dispatchSoundEvent('turn_bell');
      }
    }
  }

  function handleRulerMouseDown(e: MouseEvent) {
    if (activeTool !== 'ruler') return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;

    if (snapToGrid) {
      x = Math.round(x / GRID_SIZE) * GRID_SIZE;
      y = Math.round(y / GRID_SIZE) * GRID_SIZE;
    }

    rulerStart = { x, y };
    rulerCurrent = { x, y };
    isMeasuring = true;
  }

  function handleRulerMouseMove(e: MouseEvent) {
    if (activeTool !== 'ruler' || !isMeasuring) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;

    if (snapToGrid) {
      x = Math.round(x / GRID_SIZE) * GRID_SIZE;
      y = Math.round(y / GRID_SIZE) * GRID_SIZE;
    }

    rulerCurrent = { x, y };
  }

  function handleRulerMouseUp() {
    if (activeTool === 'ruler') {
      isMeasuring = false;
    }
  }

  function removeLastWall() {
    if (walls.length > 0) {
      walls = walls.slice(0, -1);
    }
  }

  function clearAllWalls() {
    if (confirm('Clear all vector walls on this tactical map?')) {
      walls = [];
    }
  }

  function spawnPresetToken(name: string, type: 'pc' | 'ally' | 'monster' | 'light') {
    const randomOffset = (Math.random() * 80) - 40;
    const x = snapToGrid ? Math.round((300 + randomOffset) / GRID_SIZE) * GRID_SIZE : 300 + randomOffset;
    const y = snapToGrid ? Math.round((300 + randomOffset) / GRID_SIZE) * GRID_SIZE : 300 + randomOffset;

    let tint = 0xf59e0b; // Amber PC
    let radius = 22;
    let sightRadius = 360;
    let darkvisionRadius = 180;

    if (type === 'ally') {
      tint = 0x38bdf8; // Sky blue ally
    } else if (type === 'monster') {
      tint = 0xef4444; // Crimson monster
    } else if (type === 'light') {
      tint = 0xfef08a; // Golden torch
      radius = 16;
      sightRadius = 400;
      darkvisionRadius = 400;
    }

    const newToken: Token = {
      id: `token-${Date.now()}`,
      name,
      x,
      y,
      radius,
      sightRadius,
      darkvisionRadius,
      isOrbSealed: false,
      tint,
    };

    tokens = [...tokens, newToken];
    dispatchSoundEvent('coin_clink');
    isSpawnDrawerOpen = false;
  }
</script>

<div class="relative w-full h-[780px] bg-dark-950 rounded-2xl border border-amber-900/40 overflow-hidden shadow-2xl flex flex-col">
  <!-- Top Floating HUD Toolbar -->
  <div class="absolute top-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
    <!-- Tool Selector Dock (Left) -->
    <div class="bg-dark-900/90 backdrop-blur-md border border-amber-900/50 p-1.5 rounded-2xl shadow-xl flex items-center gap-1 pointer-events-auto">
      <button
        onclick={() => selectTool('select')}
        title="Select & Move Token"
        class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 {
          activeTool === 'select'
            ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
            : 'text-slate-300 hover:bg-dark-800'
        }"
      >
        <Icons name="crosshair" size={15} />
        <span>Select / Move</span>
      </button>

      <button
        onclick={() => selectTool('wall')}
        title="Draw Vision & Movement Blocking Wall"
        class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 {
          activeTool === 'wall'
            ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
            : 'text-slate-300 hover:bg-dark-800'
        }"
      >
        <Icons name="layers" size={15} />
        <span>Draw Wall</span>
      </button>

      <button
        onclick={() => selectTool('door')}
        title="Place Interactive Portal / Door"
        class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 {
          activeTool === 'door'
            ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
            : 'text-slate-300 hover:bg-dark-800'
        }"
      >
        <Icons name="unlock" size={15} />
        <span>Door</span>
      </button>

      <button
        onclick={() => selectTool('ruler')}
        title="Measure Distance in 5ft Grid Increments"
        class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 {
          activeTool === 'ruler'
            ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
            : 'text-slate-300 hover:bg-dark-800'
        }"
      >
        <Icons name="ruler" size={15} />
        <span>Ruler</span>
      </button>

      <button
        onclick={() => (isSpawnDrawerOpen = !isSpawnDrawerOpen)}
        title="Spawn Token on Canvas"
        class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 {
          isSpawnDrawerOpen
            ? 'bg-purple-950/90 border border-purple-500 text-purple-200'
            : 'text-slate-300 hover:bg-dark-800'
        }"
      >
        <Icons name="plus" size={15} />
        <span>Spawn</span>
      </button>
    </div>

    <!-- Active Tool Status & Controls (Center / Right) -->
    <div class="bg-dark-900/90 backdrop-blur-md border border-amber-900/50 px-3.5 py-2 rounded-2xl shadow-xl flex items-center gap-3 text-xs pointer-events-auto">
      <!-- Grid Snap Switch -->
      <label class="flex items-center gap-1.5 cursor-pointer text-slate-300 select-none">
        <input
          type="checkbox"
          bind:checked={snapToGrid}
          class="rounded bg-dark-950 border-dark-700 text-amber-500 focus:ring-0"
        />
        <span class="text-[11px] font-semibold">Grid Snap (5ft)</span>
      </label>

      <div class="w-px h-4 bg-dark-700"></div>

      <!-- Fog of War Switch -->
      <button
        onclick={() => (isFogEnabled = !isFogEnabled)}
        class="px-2.5 py-1 rounded-lg font-bold text-[11px] transition-colors border flex items-center gap-1.5 {
          isFogEnabled
            ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300'
            : 'bg-dark-800 border-dark-700 text-slate-400'
        }"
      >
        <Icons name="eye" size={13} />
        <span>Fog Mask: {isFogEnabled ? 'Active' : 'Revealed'}</span>
      </button>

      {#if activeTool === 'wall' || activeTool === 'door'}
        <div class="w-px h-4 bg-dark-700"></div>
        <div class="flex items-center gap-1.5 text-[11px] font-mono text-amber-300">
          <span>{wallDrawStart ? 'Click endpoint to finish' : 'Click start point'}</span>
          <button
            onclick={removeLastWall}
            disabled={walls.length === 0}
            class="px-2 py-0.5 bg-dark-800 hover:bg-dark-700 disabled:opacity-30 border border-dark-700 rounded text-slate-300 text-[10px]"
          >
            Undo
          </button>
        </div>
      {/if}

      {#if activeTool === 'ruler' && rulerStart && rulerCurrent}
        <div class="w-px h-4 bg-dark-700"></div>
        <div class="flex items-center gap-2 bg-dark-950 px-2.5 py-1 rounded-lg border border-dark-800 text-amber-400 font-mono font-bold text-xs">
          <span>{measuredDistanceFt()} ft</span>
          <span class="text-slate-500">({measuredSquares()} sq)</span>
        </div>
      {/if}
    </div>
  </div>

  <!-- Spawn Token Floating Modal Drawer -->
  {#if isSpawnDrawerOpen}
    <div class="absolute top-20 left-4 z-30 w-72 bg-dark-900/95 backdrop-blur-md border border-amber-900/60 rounded-2xl p-4 shadow-2xl space-y-3 animate-fadeIn">
      <div class="flex items-center justify-between">
        <h4 class="text-xs font-bold text-slate-200 uppercase tracking-wider font-serif">
          Quick Spawn Token
        </h4>
        <button
          onclick={() => (isSpawnDrawerOpen = false)}
          class="text-slate-400 hover:text-slate-200 text-sm font-bold"
        >
          &times;
        </button>
      </div>

      <div class="space-y-2">
        <button
          onclick={() => spawnPresetToken('Aiden Paladin', 'pc')}
          class="w-full px-3 py-2 bg-dark-800/80 hover:bg-dark-700 border border-amber-500/30 rounded-xl text-xs font-bold text-amber-300 flex items-center justify-between transition-colors"
        >
          <span>Player Character (Hero)</span>
          <span class="w-3 h-3 rounded-full bg-amber-500"></span>
        </button>

        <button
          onclick={() => spawnPresetToken('Lyra Cleric', 'ally')}
          class="w-full px-3 py-2 bg-dark-800/80 hover:bg-dark-700 border border-blue-500/30 rounded-xl text-xs font-bold text-blue-300 flex items-center justify-between transition-colors"
        >
          <span>Allied NPC / Companion</span>
          <span class="w-3 h-3 rounded-full bg-sky-400"></span>
        </button>

        <button
          onclick={() => spawnPresetToken('Shadow Wraith', 'monster')}
          class="w-full px-3 py-2 bg-dark-800/80 hover:bg-dark-700 border border-red-500/30 rounded-xl text-xs font-bold text-red-300 flex items-center justify-between transition-colors"
        >
          <span>Hostile Foe / Creature</span>
          <span class="w-3 h-3 rounded-full bg-red-500"></span>
        </button>

        <button
          onclick={() => spawnPresetToken('Everburning Torch', 'light')}
          class="w-full px-3 py-2 bg-dark-800/80 hover:bg-dark-700 border border-yellow-500/30 rounded-xl text-xs font-bold text-yellow-300 flex items-center justify-between transition-colors"
        >
          <span>Light Source / Brazier</span>
          <span class="w-3 h-3 rounded-full bg-yellow-300"></span>
        </button>
      </div>
    </div>
  {/if}

  <!-- Canvas Interaction Area -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="flex-1 relative cursor-crosshair overflow-hidden"
    onclick={handleCanvasClick}
    onmousedown={handleRulerMouseDown}
    onmousemove={handleRulerMouseMove}
    onmouseup={handleRulerMouseUp}
  >
    <!-- Tactical Canvas PixiJS Implementation -->
    <TacticalCanvas
      bind:tokens
      bind:walls
      mapWidth={1400}
      mapHeight={900}
      gridSize={GRID_SIZE}
      {onTokenMove}
      {onDropMonster}
    />

    <!-- SVG Vector Overlay for Active Ruler Measurement & Drawing Preview -->
    <svg
      class="absolute inset-0 pointer-events-none z-10 w-full h-full"
      xmlns="http://www.w3.org/2000/svg"
    >
      <!-- Active Ruler Line & Marker -->
      {#if activeTool === 'ruler' && rulerStart && rulerCurrent}
        <line
          x1={rulerStart.x}
          y1={rulerStart.y}
          x2={rulerCurrent.x}
          y2={rulerCurrent.y}
          stroke="#f59e0b"
          stroke-width="3"
          stroke-dasharray="6,4"
          stroke-linecap="round"
        />
        <circle cx={rulerStart.x} cy={rulerStart.y} r="5" fill="#f59e0b" />
        <circle cx={rulerCurrent.x} cy={rulerCurrent.y} r="5" fill="#f59e0b" />

        <!-- Distance Tooltip above cursor -->
        <g transform="translate({(rulerStart.x + rulerCurrent.x) / 2}, {((rulerStart.y + rulerCurrent.y) / 2) - 14})">
          <rect
            x="-40"
            y="-14"
            width="80"
            height="22"
            rx="6"
            fill="#0f111a"
            stroke="#f59e0b"
            stroke-width="1.5"
          />
          <text
            x="0"
            y="2"
            text-anchor="middle"
            fill="#fef08a"
            font-size="11"
            font-weight="bold"
            font-family="monospace"
          >
            {measuredDistanceFt()} ft
          </text>
        </g>
      {/if}

      <!-- Wall In-Progress Anchor Point -->
      {#if (activeTool === 'wall' || activeTool === 'door') && wallDrawStart}
        <circle
          cx={wallDrawStart[0]}
          cy={wallDrawStart[1]}
          r="6"
          fill={activeTool === 'door' ? '#38bdf8' : '#f59e0b'}
          stroke="#ffffff"
          stroke-width="2"
        />
      {/if}
    </svg>
  </div>

  <!-- Bottom Floating Status & Quick Wall Actions Bar -->
  <div class="bg-dark-900/90 border-t border-dark-800 p-2.5 px-4 flex flex-wrap items-center justify-between text-xs text-slate-400 z-20">
    <div class="flex items-center gap-3 font-mono text-[11px]">
      <span class="text-amber-400 font-bold font-serif">{tokens.length} Active Tokens</span>
      <span class="text-slate-600">&bull;</span>
      <span>{walls.length} Walls & Portals</span>
      <span class="text-slate-600">&bull;</span>
      <span>Scale: 50px = 5ft</span>
    </div>

    <div class="flex items-center gap-2">
      <button
        onclick={clearAllWalls}
        class="px-2 py-1 hover:bg-red-950/60 hover:text-red-300 rounded text-[11px] font-semibold transition-colors"
      >
        Clear Walls
      </button>
      <div class="w-px h-3 bg-dark-700"></div>
      <span class="text-[11px] text-slate-500">
        Tip: Drag tokens with mouse to navigate fog-of-war
      </span>
    </div>
  </div>
</div>
