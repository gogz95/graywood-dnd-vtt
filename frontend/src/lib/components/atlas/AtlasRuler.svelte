<!-- src/lib/components/atlas/AtlasRuler.svelte -->
<!-- Multi-Point Overland Travel Ruler for AtlasMapView with waypoint pacing and resource calculations -->

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { calculateTravelTime, type TravelPace } from '../../mechanics/travelCalculator';

  let {
    scale = { unitsPerPixel: 1, unitName: 'miles' },
    waypoints = $bindable<Array<{ x: number; y: number }>>([]),
    currentMouse = null,
    isMeasuring = $bindable(false),
    onClear = () => {}
  }: {
    scale?: { unitsPerPixel: number; unitName?: string };
    waypoints?: Array<{ x: number; y: number }>;
    currentMouse?: { x: number; y: number } | null;
    isMeasuring?: boolean;
    onClear?: () => void;
  } = $props();

  let selectedPace = $state<TravelPace>('normal');

  function calculateSegmentLength(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  let totalPixelDistance = $derived.by(() => {
    if (waypoints.length === 0) return 0;
    let total = 0;
    for (let i = 0; i < waypoints.length - 1; i++) {
      total += calculateSegmentLength(waypoints[i], waypoints[i + 1]);
    }
    if (currentMouse && isMeasuring && waypoints.length > 0) {
      total += calculateSegmentLength(waypoints[waypoints.length - 1], currentMouse);
    }
    return total;
  });

  let travelResult = $derived(
    calculateTravelTime(totalPixelDistance, scale, selectedPace, 1.0, 4)
  );

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      clearRuler();
    }
  }

  function clearRuler() {
    waypoints = [];
    isMeasuring = false;
    onClear();
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeyDown);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeyDown);
  });
</script>

<!-- SVG Overlay for Route Line & Waypoint Markers -->
{#if waypoints.length > 0}
  <svg class="absolute inset-0 w-[4000px] h-[3000px] pointer-events-none z-20">
    <!-- Path Segments -->
    {#each waypoints as pt, idx}
      {#if idx < waypoints.length - 1}
        <line
          x1={pt.x}
          y1={pt.y}
          x2={waypoints[idx + 1].x}
          y2={waypoints[idx + 1].y}
          stroke="#f59e0b"
          stroke-width="3"
          stroke-dasharray="6 4"
        />
      {/if}
    {/each}

    <!-- Line to active mouse cursor -->
    {#if isMeasuring && currentMouse && waypoints.length > 0}
      <line
        x1={waypoints[waypoints.length - 1].x}
        y1={waypoints[waypoints.length - 1].y}
        x2={currentMouse.x}
        y2={currentMouse.y}
        stroke="#fbbf24"
        stroke-width="2.5"
        stroke-dasharray="4 4"
        opacity="0.8"
      />
    {/if}

    <!-- Waypoint dots -->
    {#each waypoints as pt, idx}
      <circle
        cx={pt.x}
        cy={pt.y}
        r="6"
        fill="#f59e0b"
        stroke="#0f172a"
        stroke-width="2"
      />
      <text
        x={pt.x + 9}
        y={pt.y - 8}
        fill="#fcd34d"
        font-size="11"
        font-family="monospace"
        font-weight="bold"
        filter="drop-shadow(0 1px 2px rgba(0,0,0,0.8))"
      >
        W{idx + 1}
      </text>
    {/each}
  </svg>

  <!-- Persistent Floating Route Travel HUD -->
  <div
    class="absolute top-16 right-4 z-30 bg-slate-900/95 backdrop-blur-md border border-amber-500/60 rounded-2xl shadow-2xl p-3.5 w-80 space-y-2.5 animate-in fade-in select-none"
  >
    <div class="flex items-center justify-between border-b border-slate-800 pb-2">
      <div class="flex items-center gap-2">
        <span class="text-base">🧭</span>
        <h4 class="text-xs font-black uppercase text-amber-300 tracking-wider">Overland Route Calculator</h4>
      </div>
      <button
        type="button"
        onclick={clearRuler}
        class="text-xs text-slate-400 hover:text-rose-400 font-bold px-1 py-0.5 rounded hover:bg-slate-800 transition-colors"
        title="Clear Ruler (Esc or Double-Click)"
      >
        ✕
      </button>
    </div>

    <!-- Distance & Time Summary -->
    <div class="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 text-center space-y-1">
      <div class="text-lg font-black text-amber-400 font-mono">
        {travelResult.distanceMiles} {scale.unitName || 'miles'}
      </div>
      <div class="text-xs text-slate-300 font-medium">
        Approx. <strong class="text-amber-300">{travelResult.days} day{travelResult.days > 1 ? 's' : ''}</strong> ({travelResult.hours} hours travel)
      </div>
    </div>

    <!-- Pace Selector -->
    <div class="space-y-1">
      <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Travel Pace</span>
      <div class="grid grid-cols-3 gap-1 text-[11px] font-bold">
        {#each [
          { id: 'fast', label: 'Fast (30m/d)' },
          { id: 'normal', label: 'Normal (24m/d)' },
          { id: 'slow', label: 'Slow (18m/d)' }
        ] as p}
          <button
            type="button"
            onclick={() => selectedPace = p.id as TravelPace}
            class="py-1 px-1.5 rounded text-center transition-colors {selectedPace === p.id
              ? 'bg-amber-500 text-slate-950 font-black'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-750 hover:text-slate-200'}"
          >
            {p.label}
          </button>
        {/each}
      </div>
    </div>

    <!-- Pacing Details & Resource Depletion -->
    <div class="text-[11px] text-slate-400 space-y-1 border-t border-slate-800 pt-2 font-sans">
      <div class="flex items-center justify-between">
        <span>Stealth:</span>
        <span class="font-bold {travelResult.stealthAllowed ? 'text-emerald-400' : 'text-slate-500'}">
          {travelResult.stealthAllowed ? 'Allowed' : 'Not Allowed'}
        </span>
      </div>
      {#if travelResult.passivePerceptionMod !== 0}
        <div class="flex items-center justify-between text-rose-400">
          <span>Perception Penalty:</span>
          <span class="font-bold">{travelResult.passivePerceptionMod} Passive</span>
        </div>
      {/if}
      <div class="flex items-center justify-between">
        <span>Rations Needed (4 PCs):</span>
        <span class="font-bold text-amber-300">{travelResult.resourceDeductions.rationsPounds} lbs</span>
      </div>
      <div class="flex items-center justify-between">
        <span>Water Needed (4 PCs):</span>
        <span class="font-bold text-cyan-300">{travelResult.resourceDeductions.waterGallons} gal</span>
      </div>
    </div>
  </div>
{/if}
