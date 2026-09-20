<!-- CanvasDrawingToolbar.svelte — Tactical Canvas Vector Drawing & Fog of War Tools -->
<script lang="ts">
  import { canvasStore } from '../../../stores/canvasStore.svelte';
  import type { WallSegment } from '../../canvas/parsers/dungeonScrawlParser';

  export type DrawTool =
    | 'select'
    | 'brush'
    | 'wall_line'
    | 'wall_polygon'
    | 'fog_carve'
    | 'fog_conceal'
    | 'ruler';

  interface Props {
    activeTool?: DrawTool;
    onToolChange?: (tool: DrawTool) => void;
  }

  let { activeTool = $bindable('select'), onToolChange }: Props = $props();

  let brushColor = $state('#ef4444');
  let strokeWidth = $state(4);
  let snapToGrid = $state(true);

  // Active vector polygon points accumulator
  let polyPoints = $state<{ x: number; y: number }[]>([]);

  function selectTool(tool: DrawTool) {
    activeTool = tool;
    polyPoints = [];
    if (onToolChange) {
      onToolChange(tool);
    }
  }

  function handleCommitPolygon() {
    if (polyPoints.length < 3) return;

    // Convert polygon boundary into contiguous WallSegments
    const segments: WallSegment[] = [];
    for (let i = 0; i < polyPoints.length; i++) {
      const p1 = polyPoints[i];
      const p2 = polyPoints[(i + 1) % polyPoints.length];
      segments.push({
        id: `wall-poly-${Date.now()}-${i}`,
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y
      });
    }

    canvasStore.addWallSegments(segments);
    polyPoints = [];
  }

  function handleCancelPolygon() {
    polyPoints = [];
  }

  function handleRevealAllFog() {
    canvasStore.revealAllFog();
  }

  function handleResetFog() {
    canvasStore.clearFog();
  }

  function handleClearAllWalls() {
    if (confirm('Clear all line-of-sight vector walls?')) {
      canvasStore.clearWalls();
    }
  }
</script>

<div class="flex items-center gap-1.5 bg-slate-900/90 border border-slate-700/80 rounded-2xl p-1.5 shadow-2xl backdrop-blur select-none text-xs">
  <!-- Selection / Pan -->
  <button
    onclick={() => selectTool('select')}
    class="px-2.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1 {activeTool === 'select' ? 'bg-indigo-600 text-white shadow' : 'text-slate-300 hover:bg-slate-800'}"
    title="Pan & Token Select (V)"
  >
    <span>👆</span>
    <span class="hidden sm:inline">Select</span>
  </button>

  <div class="h-4 w-[1px] bg-slate-800 mx-0.5"></div>

  <!-- Vector Wall Line -->
  <button
    onclick={() => selectTool('wall_line')}
    class="px-2.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1 {activeTool === 'wall_line' ? 'bg-amber-600 text-slate-950 shadow' : 'text-slate-300 hover:bg-slate-800'}"
    title="Straight Wall Vector (Blocks Line of Sight)"
  >
    <span>🧱</span>
    <span class="hidden sm:inline">Wall Line</span>
  </button>

  <!-- Vector Polygon -->
  <button
    onclick={() => selectTool('wall_polygon')}
    class="px-2.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1 {activeTool === 'wall_polygon' ? 'bg-amber-600 text-slate-950 shadow' : 'text-slate-300 hover:bg-slate-800'}"
    title="Dynamic Polygon Wall Enclosure"
  >
    <span>🔷</span>
    <span class="hidden sm:inline">Polygon</span>
  </button>

  <!-- Freehand Brush -->
  <button
    onclick={() => selectTool('brush')}
    class="px-2.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1 {activeTool === 'brush' ? 'bg-indigo-600 text-white shadow' : 'text-slate-300 hover:bg-slate-800'}"
    title="Freehand Vector Brush"
  >
    <span>✏️</span>
    <span class="hidden sm:inline">Brush</span>
  </button>

  <div class="h-4 w-[1px] bg-slate-800 mx-0.5"></div>

  <!-- Fog of War Carve / Reveal -->
  <button
    onclick={() => selectTool('fog_carve')}
    class="px-2.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1 {activeTool === 'fog_carve' ? 'bg-emerald-600 text-white shadow' : 'text-slate-300 hover:bg-slate-800'}"
    title="Carve Fog of War (Reveal Area)"
  >
    <span>👁️</span>
    <span class="hidden sm:inline">Reveal Fog</span>
  </button>

  <!-- Fog of War Conceal -->
  <button
    onclick={() => selectTool('fog_conceal')}
    class="px-2.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1 {activeTool === 'fog_conceal' ? 'bg-rose-700 text-white shadow' : 'text-slate-300 hover:bg-slate-800'}"
    title="Conceal Area (Re-shroud in Fog)"
  >
    <span>🌫️</span>
    <span class="hidden sm:inline">Shroud</span>
  </button>

  <div class="h-4 w-[1px] bg-slate-800 mx-0.5"></div>

  <!-- Quick Global Fog Actions -->
  <div class="flex items-center gap-1">
    <button
      onclick={handleRevealAllFog}
      class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-bold"
      title="Reveal all battlemat fog cells"
    >
      Reveal All
    </button>
    <button
      onclick={handleResetFog}
      class="px-2 py-1 bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-300 rounded-lg text-[10px] font-bold"
      title="Reset and re-shroud entire map"
    >
      Reset Fog
    </button>
  </div>

  <div class="h-4 w-[1px] bg-slate-800 mx-0.5"></div>

  <!-- Clear Walls -->
  <button
    onclick={handleClearAllWalls}
    class="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-xl transition-colors"
    title="Clear All Wall Vectors ({canvasStore.walls.length} active)"
  >
    🗑️
  </button>

  {#if activeTool === 'wall_polygon' && polyPoints.length > 0}
    <div class="flex items-center gap-1 pl-2 border-l border-slate-700">
      <span class="text-[10px] text-amber-300 font-mono font-bold">{polyPoints.length} pts</span>
      <button
        onclick={handleCommitPolygon}
        class="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-bold"
      >
        Close Poly
      </button>
      <button
        onclick={handleCancelPolygon}
        class="px-1.5 py-0.5 bg-slate-800 text-slate-400 hover:text-slate-200 rounded text-[10px]"
      >
        Cancel
      </button>
    </div>
  {/if}
</div>
