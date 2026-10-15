<!-- frontend/src/lib/components/canvas/MapToolOverlay.svelte -->
<!-- Engine-agnostic SVG/HTML tool overlay for Rulers, AoE templates, and coordinate Pings -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { ViewportTransform } from '../../types/viewport';

  export interface PingItem {
    id: string;
    gridX: number;
    gridY: number;
    color?: string;
    createdAt: number;
  }

  export interface RemoteRuler {
    id: string;
    startGridX: number;
    startGridY: number;
    endGridX: number;
    endGridY: number;
    tool: string;
    distanceFeet: number;
  }

  interface Props {
    transform?: ViewportTransform;
    gridSize?: number;
    scaleFeet?: number;
    activeTool?: string;
    onPing?: (gridCoords: { gridX: number; gridY: number }) => void;
    onRulerChange?: (ruler: { startGridX: number; startGridY: number; endGridX: number; endGridY: number; distanceFeet: number } | null) => void;
  }

  let {
    transform = { x: 0, y: 0, zoom: 1 },
    gridSize = 50,
    scaleFeet = 5,
    activeTool = 'select',
    onPing,
    onRulerChange
  }: Props = $props();

  let containerEl = $state<HTMLDivElement | null>(null);

  // Active drag measurement state
  let isDragging = $state(false);
  let dragStart = $state<{ gridX: number; gridY: number } | null>(null);
  let dragCurrent = $state<{ gridX: number; gridY: number } | null>(null);

  // Active animated pings
  let pings = $state<PingItem[]>([]);
  let remoteRuler = $state<RemoteRuler | null>(null);
  let pingCleanupTimer: ReturnType<typeof setInterval> | null = null;

  export function screenToGrid(clientX: number, clientY: number): { gridX: number; gridY: number } {
    if (!containerEl) return { gridX: 0, gridY: 0 };
    const rect = containerEl.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const worldX = (localX - transform.x) / transform.zoom;
    const worldY = (localY - transform.y) / transform.zoom;
    return {
      gridX: Number((worldX / gridSize).toFixed(3)),
      gridY: Number((worldY / gridSize).toFixed(3))
    };
  }

  export function gridToScreen(gridX: number, gridY: number): { x: number; y: number } {
    const worldX = gridX * gridSize;
    const worldY = gridY * gridSize;
    return {
      x: worldX * transform.zoom + transform.x,
      y: worldY * transform.zoom + transform.y
    };
  }

  export function addPing(gridX: number, gridY: number, color = '#38bdf8'): void {
    const newPing: PingItem = {
      id: `ping-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      gridX,
      gridY,
      color,
      createdAt: Date.now()
    };
    pings = [...pings, newPing];
  }

  export function setRemoteRuler(ruler: RemoteRuler | null): void {
    remoteRuler = ruler;
  }

  function handlePointerDown(e: PointerEvent) {
    if (activeTool === 'select') return;

    const coords = screenToGrid(e.clientX, e.clientY);

    if (activeTool === 'ping') {
      addPing(coords.gridX, coords.gridY, '#38bdf8');
      onPing?.(coords);
      return;
    }

    if (['ruler', 'cone', 'circle'].includes(activeTool)) {
      isDragging = true;
      dragStart = coords;
      dragCurrent = coords;
      containerEl?.setPointerCapture(e.pointerId);
    }
  }

  function handlePointerMove(e: PointerEvent) {
    if (!isDragging || !dragStart) return;
    dragCurrent = screenToGrid(e.clientX, e.clientY);

    if (onRulerChange && dragCurrent) {
      const distCells = Math.hypot(dragCurrent.gridX - dragStart.gridX, dragCurrent.gridY - dragStart.gridY);
      const distanceFeet = Math.round(distCells * scaleFeet);
      onRulerChange({
        startGridX: dragStart.gridX,
        startGridY: dragStart.gridY,
        endGridX: dragCurrent.gridX,
        endGridY: dragCurrent.gridY,
        distanceFeet
      });
    }
  }

  function handlePointerUp(e: PointerEvent) {
    if (!isDragging) return;
    isDragging = false;
    dragStart = null;
    dragCurrent = null;
    onRulerChange?.(null);
    try {
      containerEl?.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore capture release error
    }
  }

  onMount(() => {
    pingCleanupTimer = setInterval(() => {
      const now = Date.now();
      if (pings.some((p) => now - p.createdAt > 3200)) {
        pings = pings.filter((p) => now - p.createdAt <= 3200);
      }
    }, 500);

    return () => {
      if (pingCleanupTimer) clearInterval(pingCleanupTimer);
    };
  });

  onDestroy(() => {
    if (pingCleanupTimer) clearInterval(pingCleanupTimer);
  });

  // Derived geometry for active ruler / template
  let activeMeasure = $derived.by(() => {
    const start = dragStart || (remoteRuler ? { gridX: remoteRuler.startGridX, gridY: remoteRuler.startGridY } : null);
    const end = dragCurrent || (remoteRuler ? { gridX: remoteRuler.endGridX, gridY: remoteRuler.endGridY } : null);
    const tool = activeTool !== 'select' ? activeTool : (remoteRuler?.tool || 'ruler');

    if (!start || !end) return null;

    const p1 = gridToScreen(start.gridX, start.gridY);
    const p2 = gridToScreen(end.gridX, end.gridY);

    const distCells = Math.hypot(end.gridX - start.gridX, end.gridY - start.gridY);
    const distFeet = Math.round(distCells * scaleFeet);
    const screenRadius = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

    // Cone 53-degree angle vertices
    const halfAngle = 0.4636; // ~26.565 degrees
    const coneP2 = {
      x: p1.x + Math.cos(angle - halfAngle) * screenRadius,
      y: p1.y + Math.sin(angle - halfAngle) * screenRadius
    };
    const coneP3 = {
      x: p1.x + Math.cos(angle + halfAngle) * screenRadius,
      y: p1.y + Math.sin(angle + halfAngle) * screenRadius
    };

    return {
      tool,
      p1,
      p2,
      coneP2,
      coneP3,
      screenRadius,
      distFeet,
      midX: (p1.x + p2.x) / 2,
      midY: (p1.y + p2.y) / 2
    };
  });
</script>

<div
  bind:this={containerEl}
  role="presentation"
  class="absolute inset-0 select-none {
    activeTool === 'select'
      ? 'pointer-events-none'
      : 'pointer-events-auto cursor-crosshair'
  }"
  onpointerdown={handlePointerDown}
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
  onpointercancel={handlePointerUp}
>
  <svg class="w-full h-full block pointer-events-none">
    <!-- 1. Concentric Animated Pings -->
    {#each pings as ping (ping.id)}
      {@const pos = gridToScreen(ping.gridX, ping.gridY)}
      <g transform="translate({pos.x}, {pos.y})">
        <circle r="6" fill={ping.color || '#38bdf8'} opacity="0.9" />
        <circle r="18" fill="none" stroke={ping.color || '#38bdf8'} stroke-width="2" class="animate-ping" opacity="0.75" />
        <circle r="36" fill="none" stroke={ping.color || '#38bdf8'} stroke-width="1.5" class="animate-ping" opacity="0.4" style="animation-delay: 150ms;" />
      </g>
    {/each}

    <!-- 2. Active AoE Measurement Preview & Ruler -->
    {#if activeMeasure}
      {#if activeMeasure.tool === 'ruler'}
        <!-- Dashed Vector Line -->
        <line
          x1={activeMeasure.p1.x}
          y1={activeMeasure.p1.y}
          x2={activeMeasure.p2.x}
          y2={activeMeasure.p2.y}
          stroke="#f59e0b"
          stroke-width="3"
          stroke-dasharray="6 4"
          stroke-linecap="round"
        />
        <!-- Start & End Knobs -->
        <circle cx={activeMeasure.p1.x} cy={activeMeasure.p1.y} r="4" fill="#f59e0b" />
        <circle cx={activeMeasure.p2.x} cy={activeMeasure.p2.y} r="4" fill="#f59e0b" />

        <!-- Distance Tag Pill -->
        <g transform="translate({activeMeasure.midX}, {activeMeasure.midY})">
          <rect x="-30" y="-12" width="60" height="20" rx="6" fill="#0f172a" stroke="#f59e0b" stroke-width="1.5" opacity="0.9" />
          <text x="0" y="2" text-anchor="middle" dominant-baseline="middle" fill="#f8fafc" font-size="11" font-weight="bold" font-family="system-ui, sans-serif">
            {activeMeasure.distFeet} ft
          </text>
        </g>
      {:else if activeMeasure.tool === 'circle'}
        <!-- Circle Radius AoE Ring -->
        <circle
          cx={activeMeasure.p1.x}
          cy={activeMeasure.p1.y}
          r={activeMeasure.screenRadius}
          fill="rgba(56, 189, 248, 0.2)"
          stroke="#38bdf8"
          stroke-width="2"
          stroke-dasharray="6 4"
        />
        <line
          x1={activeMeasure.p1.x}
          y1={activeMeasure.p1.y}
          x2={activeMeasure.p2.x}
          y2={activeMeasure.p2.y}
          stroke="#38bdf8"
          stroke-width="1.5"
          stroke-dasharray="4 3"
        />
        <g transform="translate({activeMeasure.midX}, {activeMeasure.midY})">
          <rect x="-32" y="-12" width="64" height="20" rx="6" fill="#0f172a" stroke="#38bdf8" stroke-width="1.5" opacity="0.9" />
          <text x="0" y="2" text-anchor="middle" dominant-baseline="middle" fill="#f8fafc" font-size="11" font-weight="bold" font-family="system-ui, sans-serif">
            r={activeMeasure.distFeet} ft
          </text>
        </g>
      {:else if activeMeasure.tool === 'cone'}
        <!-- 53-degree Cone AoE Triangle -->
        <polygon
          points="{activeMeasure.p1.x},{activeMeasure.p1.y} {activeMeasure.coneP2.x},{activeMeasure.coneP2.y} {activeMeasure.coneP3.x},{activeMeasure.coneP3.y}"
          fill="rgba(249, 115, 22, 0.22)"
          stroke="#f97316"
          stroke-width="2"
        />
        <circle cx={activeMeasure.p1.x} cy={activeMeasure.p1.y} r="4" fill="#f97316" />
        <g transform="translate({activeMeasure.p2.x}, {activeMeasure.p2.y})">
          <rect x="-30" y="-12" width="60" height="20" rx="6" fill="#0f172a" stroke="#f97316" stroke-width="1.5" opacity="0.9" />
          <text x="0" y="2" text-anchor="middle" dominant-baseline="middle" fill="#f8fafc" font-size="11" font-weight="bold" font-family="system-ui, sans-serif">
            {activeMeasure.distFeet} ft
          </text>
        </g>
      {/if}
    {/if}
  </svg>
</div>
