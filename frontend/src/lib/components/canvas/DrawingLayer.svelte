<!-- DrawingLayer.svelte — Freehand Drawing, Vector Shape & Text Annotation Engine for Battlemap Canvas -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Container, Graphics } from 'pixi.js';
  import type { Application } from 'pixi.js';
  import { drawingStore } from '../../stores/drawingStore.svelte';
  import type { DrawingElement, DrawingTool, DrawingLayerType } from '../../types/drawing';
  import {
    renderDrawingOnPixi,
    isPointNearDrawing,
  } from './drawingRenderHelper';

  interface Props {
    pixiApp: Application | null;
    parentContainer: Container | null;
    isDmView?: boolean;
    gridSize?: number;
    screenToWorld: (screenX: number, screenY: number) => { x: number; y: number };
  }

  let {
    pixiApp,
    parentContainer,
    isDmView = true,
    gridSize = 60,
    screenToWorld,
  }: Props = $props();

  // ── Pixi Containers ────────────────────────────────────────────────────────
  let sharedDrawingContainer: Container | null = null;
  let dmDrawingContainer: Container | null = null;
  let previewGraphics: Graphics | null = null;
  let previewTextContainer: Container | null = null;

  // ── Interaction State ──────────────────────────────────────────────────────
  let isPointerDown = $state(false);
  let startWorldPos = $state<{ x: number; y: number } | null>(null);
  let activeFreehandPoints = $state<number[]>([]);
  let activeShapeBounds = $state<{
    x: number;
    y: number;
    width: number;
    height: number;
    startX?: number;
    startY?: number;
    endX?: number;
    endY?: number;
  } | null>(null);

  // Text Prompt Modal State
  let showTextPrompt = $state(false);
  let textInputPrompt = $state('');
  let textPlacementWorld = $state<{ x: number; y: number } | null>(null);

  // Clear Confirmation Modal State
  let showClearModal = $state(false);

  // Preset Colors
  const PRESET_COLORS = [
    '#ef4444', // Red
    '#f97316', // Orange
    '#eab308', // Yellow
    '#22c55e', // Green
    '#06b6d4', // Cyan
    '#3b82f6', // Blue
    '#a855f7', // Purple
    '#ffffff', // White
    '#0f172a', // Dark
  ];

  // ── Lifecycle & Container Setup ────────────────────────────────────────────
  onMount(() => {
    initPixiContainers();
    window.addEventListener('keydown', handleGlobalKeyDown);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleGlobalKeyDown);
    destroyPixiContainers();
  });

  function initPixiContainers() {
    if (!parentContainer) return;

    if (!sharedDrawingContainer) {
      sharedDrawingContainer = new Container();
      sharedDrawingContainer.label = 'sharedDrawingContainer';
      parentContainer.addChild(sharedDrawingContainer);
    }

    if (!dmDrawingContainer) {
      dmDrawingContainer = new Container();
      dmDrawingContainer.label = 'dmDrawingContainer';
      dmDrawingContainer.visible = isDmView;
      parentContainer.addChild(dmDrawingContainer);
    }

    if (!previewGraphics) {
      previewGraphics = new Graphics();
      previewGraphics.label = 'drawingPreviewGraphics';
      parentContainer.addChild(previewGraphics);
    }

    if (!previewTextContainer) {
      previewTextContainer = new Container();
      previewTextContainer.label = 'drawingPreviewTextContainer';
      parentContainer.addChild(previewTextContainer);
    }

    renderAllDrawings();
  }

  function destroyPixiContainers() {
    if (sharedDrawingContainer) {
      sharedDrawingContainer.destroy({ children: true });
      sharedDrawingContainer = null;
    }
    if (dmDrawingContainer) {
      dmDrawingContainer.destroy({ children: true });
      dmDrawingContainer = null;
    }
    if (previewGraphics) {
      previewGraphics.destroy();
      previewGraphics = null;
    }
    if (previewTextContainer) {
      previewTextContainer.destroy({ children: true });
      previewTextContainer = null;
    }
  }

  // ── Reactive Re-Rendering Effect ───────────────────────────────────────────
  $effect(() => {
    // Re-render when drawings change or parent container becomes available
    const _ = drawingStore.drawings;
    const __ = isDmView;
    if (parentContainer && (!sharedDrawingContainer || !dmDrawingContainer)) {
      initPixiContainers();
    }
    renderAllDrawings();
  });

  function renderAllDrawings() {
    if (!sharedDrawingContainer || !dmDrawingContainer) return;

    // 1. Clear existing children
    sharedDrawingContainer.removeChildren().forEach((c) => {
      try {
        c.destroy({ children: true });
      } catch {}
    });
    dmDrawingContainer.removeChildren().forEach((c) => {
      try {
        c.destroy({ children: true });
      } catch {}
    });

    dmDrawingContainer.visible = isDmView;

    // Create shared graphics & text
    const sharedG = new Graphics();
    const sharedT = new Container();
    sharedDrawingContainer.addChild(sharedG);
    sharedDrawingContainer.addChild(sharedT);

    // Create DM graphics & text
    const dmG = new Graphics();
    const dmT = new Container();
    dmDrawingContainer.addChild(dmG);
    dmDrawingContainer.addChild(dmT);

    for (const d of drawingStore.drawings) {
      if (d.layer === 'shared') {
        renderDrawingOnPixi(sharedG, sharedT, d);
      } else if (d.layer === 'dm' && isDmView) {
        renderDrawingOnPixi(dmG, dmT, d);
      }
    }
  }

  function renderPreview() {
    if (!previewGraphics || !previewTextContainer) return;
    previewGraphics.clear();
    previewTextContainer.removeChildren();

    const tool = drawingStore.activeTool;
    const color = drawingStore.strokeColor;
    const width = drawingStore.strokeWidth;
    const alpha = drawingStore.alpha;
    const fillColor = drawingStore.fillColor;

    if (tool === 'freehand' && activeFreehandPoints.length >= 4) {
      const dummy: DrawingElement = {
        id: 'preview',
        layer: drawingStore.activeLayer,
        type: 'freehand',
        points: activeFreehandPoints,
        strokeColor: color,
        strokeWidth: width,
        alpha,
      };
      renderDrawingOnPixi(previewGraphics, previewTextContainer, dummy);
    } else if (
      (tool === 'line' || tool === 'arrow' || tool === 'rectangle' || tool === 'circle') &&
      activeShapeBounds
    ) {
      const dummy: DrawingElement = {
        id: 'preview',
        layer: drawingStore.activeLayer,
        type: tool,
        bounds: activeShapeBounds,
        strokeColor: color,
        fillColor,
        strokeWidth: width,
        alpha,
      };
      renderDrawingOnPixi(previewGraphics, previewTextContainer, dummy);
    }
  }

  // ── Pointer Handlers (Interception on Viewport) ─────────────────────────────
  export function handleCanvasPointerDown(e: PointerEvent): boolean {
    const tool = drawingStore.activeTool;
    if (tool === 'none' || tool === 'select') return false;

    // Drawing tool is active: capture pointer
    isPointerDown = true;
    const world = screenToWorld(e.clientX, e.clientY);
    startWorldPos = { ...world };

    if (tool === 'freehand') {
      activeFreehandPoints = [world.x, world.y, world.x, world.y];
      renderPreview();
    } else if (tool === 'line' || tool === 'arrow') {
      activeShapeBounds = {
        x: world.x,
        y: world.y,
        width: 0,
        height: 0,
        startX: world.x,
        startY: world.y,
        endX: world.x,
        endY: world.y,
      };
      renderPreview();
    } else if (tool === 'rectangle' || tool === 'circle') {
      activeShapeBounds = {
        x: world.x,
        y: world.y,
        width: 0,
        height: 0,
        startX: world.x,
        startY: world.y,
        endX: world.x,
        endY: world.y,
      };
      renderPreview();
    } else if (tool === 'text') {
      textPlacementWorld = { ...world };
      textInputPrompt = '';
      showTextPrompt = true;
      isPointerDown = false;
    } else if (tool === 'eraser') {
      eraseAt(world.x, world.y);
    }

    return true; // event consumed
  }

  export function handleCanvasPointerMove(e: PointerEvent): boolean {
    const tool = drawingStore.activeTool;
    if (tool === 'none' || tool === 'select' || !isPointerDown) return false;

    const world = screenToWorld(e.clientX, e.clientY);

    if (tool === 'freehand') {
      const len = activeFreehandPoints.length;
      const lastX = activeFreehandPoints[len - 2];
      const lastY = activeFreehandPoints[len - 1];
      const dist = Math.hypot(world.x - lastX, world.y - lastY);
      // Append if movement > 2px to avoid dense points
      if (dist >= 2) {
        activeFreehandPoints.push(world.x, world.y);
        renderPreview();
      }
    } else if (tool === 'line' || tool === 'arrow') {
      if (startWorldPos && activeShapeBounds) {
        activeShapeBounds.endX = world.x;
        activeShapeBounds.endY = world.y;
        activeShapeBounds.width = Math.abs(world.x - startWorldPos.x);
        activeShapeBounds.height = Math.abs(world.y - startWorldPos.y);
        renderPreview();
      }
    } else if (tool === 'rectangle') {
      if (startWorldPos && activeShapeBounds) {
        const x = Math.min(startWorldPos.x, world.x);
        const y = Math.min(startWorldPos.y, world.y);
        const w = Math.abs(world.x - startWorldPos.x);
        const h = Math.abs(world.y - startWorldPos.y);
        activeShapeBounds.x = x;
        activeShapeBounds.y = y;
        activeShapeBounds.width = w;
        activeShapeBounds.height = h;
        renderPreview();
      }
    } else if (tool === 'circle') {
      if (startWorldPos && activeShapeBounds) {
        const radius = Math.hypot(world.x - startWorldPos.x, world.y - startWorldPos.y);
        activeShapeBounds.x = startWorldPos.x - radius;
        activeShapeBounds.y = startWorldPos.y - radius;
        activeShapeBounds.width = radius * 2;
        activeShapeBounds.height = radius * 2;
        renderPreview();
      }
    } else if (tool === 'eraser') {
      eraseAt(world.x, world.y);
    }

    return true; // event consumed
  }

  export function handleCanvasPointerUp(_e: PointerEvent): boolean {
    const tool = drawingStore.activeTool;
    if (tool === 'none' || tool === 'select' || !isPointerDown) return false;

    isPointerDown = false;

    // Commit drawing to store
    if (tool === 'freehand' && activeFreehandPoints.length >= 4) {
      const newDrawing: DrawingElement = {
        id: `draw_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        layer: drawingStore.activeLayer,
        type: 'freehand',
        points: [...activeFreehandPoints],
        strokeColor: drawingStore.strokeColor,
        strokeWidth: drawingStore.strokeWidth,
        alpha: drawingStore.alpha,
      };
      drawingStore.addDrawing(newDrawing);
    } else if ((tool === 'line' || tool === 'arrow') && activeShapeBounds) {
      if (activeShapeBounds.width > 2 || activeShapeBounds.height > 2) {
        const newDrawing: DrawingElement = {
          id: `shape_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          layer: drawingStore.activeLayer,
          type: tool,
          bounds: { ...activeShapeBounds },
          strokeColor: drawingStore.strokeColor,
          strokeWidth: drawingStore.strokeWidth,
          alpha: drawingStore.alpha,
        };
        drawingStore.addDrawing(newDrawing);
      }
    } else if ((tool === 'rectangle' || tool === 'circle') && activeShapeBounds) {
      if (activeShapeBounds.width > 4 || activeShapeBounds.height > 4) {
        const newDrawing: DrawingElement = {
          id: `shape_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          layer: drawingStore.activeLayer,
          type: tool,
          bounds: { ...activeShapeBounds },
          strokeColor: drawingStore.strokeColor,
          fillColor: drawingStore.fillColor,
          strokeWidth: drawingStore.strokeWidth,
          alpha: drawingStore.alpha,
        };
        drawingStore.addDrawing(newDrawing);
      }
    }

    // Reset preview
    activeFreehandPoints = [];
    activeShapeBounds = null;
    startWorldPos = null;
    if (previewGraphics) previewGraphics.clear();
    if (previewTextContainer) previewTextContainer.removeChildren();

    return true;
  }

  function eraseAt(worldX: number, worldY: number) {
    // Find closest drawing touched
    for (let i = drawingStore.drawings.length - 1; i >= 0; i--) {
      const d = drawingStore.drawings[i];
      if (d.layer === 'dm' && !isDmView) continue;
      if (isPointNearDrawing(worldX, worldY, d)) {
        drawingStore.removeDrawing(d.id);
        break;
      }
    }
  }

  function commitTextAnnotation() {
    if (!textPlacementWorld || !textInputPrompt.trim()) {
      showTextPrompt = false;
      return;
    }

    const textDrawing: DrawingElement = {
      id: `text_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      layer: drawingStore.activeLayer,
      type: 'text',
      text: textInputPrompt.trim(),
      x: textPlacementWorld.x,
      y: textPlacementWorld.y,
      fontSize: drawingStore.fontSize,
      color: drawingStore.strokeColor,
      strokeColor: drawingStore.strokeColor,
      strokeWidth: 1,
      alpha: drawingStore.alpha,
    };

    drawingStore.addDrawing(textDrawing);
    showTextPrompt = false;
    textInputPrompt = '';
    textPlacementWorld = null;
  }

  function handleGlobalKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (showTextPrompt) {
        showTextPrompt = false;
      } else if (showClearModal) {
        showClearModal = false;
      } else if (drawingStore.activeTool !== 'none') {
        drawingStore.activeTool = 'none';
      }
    }
  }
</script>

<!-- ── Collapsible Floating Drawing Toolbar ──────────────────────────────── -->
<div class="absolute top-20 right-4 z-40 flex flex-col items-end pointer-events-auto select-none">
  <!-- Main Dock -->
  <div class="bg-slate-900/95 border border-slate-800 rounded-2xl shadow-2xl backdrop-blur-md p-2 flex flex-col gap-2 transition-all duration-200">
    <!-- Header with Layer Selector & Expand Toggle -->
    <div class="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
      <div class="flex items-center gap-1.5">
        <button
          type="button"
          aria-label="Toggle drawing toolbar"
          onclick={() => (drawingStore.isToolbarExpanded = !drawingStore.isToolbarExpanded)}
          class="p-1 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors text-xs font-bold flex items-center gap-1"
        >
          <span>🎨</span>
          <span class="text-[11px] font-semibold">Draw</span>
        </button>

        {#if drawingStore.activeTool !== 'none'}
          <span class="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-indigo-950 text-indigo-300 border border-indigo-800/60 uppercase">
            {drawingStore.activeTool}
          </span>
        {/if}
      </div>

      <button
        type="button"
        onclick={() => (drawingStore.isToolbarExpanded = !drawingStore.isToolbarExpanded)}
        class="text-slate-400 hover:text-slate-200 p-1 text-xs"
        aria-label="Minimize Toolbar"
      >
        {drawingStore.isToolbarExpanded ? '▾' : '▸'}
      </button>
    </div>

    {#if drawingStore.isToolbarExpanded}
      <!-- Layer Toggle (Shared vs DM Secret) -->
      {#if isDmView}
        <div class="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px]">
          <button
            type="button"
            onclick={() => (drawingStore.activeLayer = 'shared')}
            class="flex-1 py-1 px-2 rounded-lg font-semibold transition-all flex items-center justify-center gap-1
              {drawingStore.activeLayer === 'shared' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}"
          >
            <span>🌐</span>
            <span>Shared</span>
          </button>
          <button
            type="button"
            onclick={() => (drawingStore.activeLayer = 'dm')}
            class="flex-1 py-1 px-2 rounded-lg font-semibold transition-all flex items-center justify-center gap-1
              {drawingStore.activeLayer === 'dm' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}"
          >
            <span>🔒</span>
            <span>DM Only</span>
          </button>
        </div>
      {/if}

      <!-- Tool Selector Grid -->
      <div class="grid grid-cols-4 gap-1">
        <!-- Pointer / None -->
        <button
          type="button"
          title="Pointer / Move Mode"
          onclick={() => (drawingStore.activeTool = 'none')}
          class="p-2 rounded-xl border flex flex-col items-center justify-center text-xs transition-colors
            {drawingStore.activeTool === 'none' ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200' : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'}"
        >
          <span>👆</span>
          <span class="text-[9px] mt-0.5">Select</span>
        </button>

        <!-- Freehand Pencil -->
        <button
          type="button"
          title="Freehand Pencil / Brush"
          onclick={() => (drawingStore.activeTool = 'freehand')}
          class="p-2 rounded-xl border flex flex-col items-center justify-center text-xs transition-colors
            {drawingStore.activeTool === 'freehand' ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200' : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'}"
        >
          <span>✏️</span>
          <span class="text-[9px] mt-0.5">Brush</span>
        </button>

        <!-- Tactical Arrow -->
        <button
          type="button"
          title="Tactical Arrow"
          onclick={() => (drawingStore.activeTool = 'arrow')}
          class="p-2 rounded-xl border flex flex-col items-center justify-center text-xs transition-colors
            {drawingStore.activeTool === 'arrow' ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200' : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'}"
        >
          <span>🏹</span>
          <span class="text-[9px] mt-0.5">Arrow</span>
        </button>

        <!-- Straight Line -->
        <button
          type="button"
          title="Straight Line"
          onclick={() => (drawingStore.activeTool = 'line')}
          class="p-2 rounded-xl border flex flex-col items-center justify-center text-xs transition-colors
            {drawingStore.activeTool === 'line' ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200' : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'}"
        >
          <span>📏</span>
          <span class="text-[9px] mt-0.5">Line</span>
        </button>

        <!-- Rectangle -->
        <button
          type="button"
          title="Rectangle"
          onclick={() => (drawingStore.activeTool = 'rectangle')}
          class="p-2 rounded-xl border flex flex-col items-center justify-center text-xs transition-colors
            {drawingStore.activeTool === 'rectangle' ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200' : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'}"
        >
          <span>▭</span>
          <span class="text-[9px] mt-0.5">Rect</span>
        </button>

        <!-- Circle -->
        <button
          type="button"
          title="Circle"
          onclick={() => (drawingStore.activeTool = 'circle')}
          class="p-2 rounded-xl border flex flex-col items-center justify-center text-xs transition-colors
            {drawingStore.activeTool === 'circle' ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200' : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'}"
        >
          <span>⭕</span>
          <span class="text-[9px] mt-0.5">Circle</span>
        </button>

        <!-- Text Note -->
        <button
          type="button"
          title="Text Note Annotation"
          onclick={() => (drawingStore.activeTool = 'text')}
          class="p-2 rounded-xl border flex flex-col items-center justify-center text-xs transition-colors
            {drawingStore.activeTool === 'text' ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200' : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'}"
        >
          <span>🔤</span>
          <span class="text-[9px] mt-0.5">Text</span>
        </button>

        <!-- Eraser -->
        <button
          type="button"
          title="Eraser (Click or Drag over items)"
          onclick={() => (drawingStore.activeTool = 'eraser')}
          class="p-2 rounded-xl border flex flex-col items-center justify-center text-xs transition-colors
            {drawingStore.activeTool === 'eraser' ? 'bg-rose-600/30 border-rose-500 text-rose-200' : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'}"
        >
          <span>🧹</span>
          <span class="text-[9px] mt-0.5">Eraser</span>
        </button>
      </div>

      <!-- Color Palette Swatches -->
      <div class="space-y-1.5 pt-1">
        <div class="flex items-center justify-between text-[10px] text-slate-400 font-semibold px-0.5">
          <span>Stroke Color</span>
          <div class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded-full border border-slate-700" style="background-color: {drawingStore.strokeColor};"></span>
            <input
              type="color"
              bind:value={drawingStore.strokeColor}
              class="w-4 h-4 p-0 border-0 rounded cursor-pointer bg-transparent"
              title="Custom Color"
            />
          </div>
        </div>

        <div class="flex items-center gap-1 justify-between bg-slate-950/60 p-1 rounded-xl border border-slate-800/80">
          {#each PRESET_COLORS as color}
            <button
              type="button"
              onclick={() => (drawingStore.strokeColor = color)}
              class="w-5 h-5 rounded-lg border transition-transform hover:scale-110 flex items-center justify-center
                {drawingStore.strokeColor === color ? 'border-white scale-110 shadow-sm' : 'border-slate-800'}"
              style="background-color: {color};"
              aria-label="Select color {color}"
            >
              {#if drawingStore.strokeColor === color}
                <span class="w-1.5 h-1.5 rounded-full {color === '#ffffff' ? 'bg-black' : 'bg-white'}"></span>
              {/if}
            </button>
          {/each}
        </div>
      </div>

      <!-- Stroke Width & Fill -->
      <div class="space-y-2 pt-1 border-t border-slate-800/60">
        <div class="flex items-center justify-between text-[10px] text-slate-400 font-semibold">
          <span>Stroke Width</span>
          <span class="font-mono text-indigo-300 font-bold">{drawingStore.strokeWidth}px</span>
        </div>
        <input
          type="range"
          min="2"
          max="16"
          step="1"
          bind:value={drawingStore.strokeWidth}
          class="w-full accent-indigo-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
        />

        <div class="flex items-center justify-between pt-0.5 text-[11px] text-slate-300">
          <label class="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={drawingStore.fillColor !== 'transparent'}
              onchange={(e) => {
                drawingStore.fillColor = e.currentTarget.checked ? drawingStore.strokeColor : 'transparent';
              }}
              class="accent-indigo-500 rounded"
            />
            <span class="text-[10px]">Fill Shapes</span>
          </label>

          <button
            type="button"
            onclick={() => (showClearModal = true)}
            class="px-2 py-0.5 bg-rose-950/60 hover:bg-rose-900/80 border border-rose-800/60 text-rose-300 rounded-lg text-[10px] font-semibold transition-colors"
          >
            Clear…
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>

<!-- ── Text Annotation Placement Modal ────────────────────────────────────── -->
{#if showTextPrompt}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
    <div class="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-4 max-w-sm w-full space-y-3">
      <div class="flex items-center justify-between border-b border-slate-800 pb-2">
        <h4 class="text-xs font-bold text-slate-100 flex items-center gap-1.5">
          <span>🔤</span>
          <span>Add Text Annotation</span>
        </h4>
        <button
          type="button"
          onclick={() => (showTextPrompt = false)}
          class="text-slate-400 hover:text-white text-xs font-bold"
        >
          ✕
        </button>
      </div>

      <div class="space-y-2">
        <input
          type="text"
          bind:value={textInputPrompt}
          placeholder="e.g. Secret Door, Trap, High Ground…"
          class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          autofocus
          onkeydown={(e) => {
            if (e.key === 'Enter') commitTextAnnotation();
          }}
        />

        <div class="flex items-center justify-between text-xs text-slate-400">
          <span>Font Size</span>
          <div class="flex items-center gap-1">
            {#each [14, 18, 24, 32] as size}
              <button
                type="button"
                onclick={() => (drawingStore.fontSize = size)}
                class="px-2 py-0.5 rounded text-[10px] font-mono font-semibold border
                  {drawingStore.fontSize === size ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-950 border-slate-800 text-slate-400'}"
              >
                {size}px
              </button>
            {/each}
          </div>
        </div>
      </div>

      <div class="flex items-center justify-end gap-2 pt-1 border-t border-slate-800">
        <button
          type="button"
          onclick={() => (showTextPrompt = false)}
          class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg"
        >
          Cancel
        </button>
        <button
          type="button"
          onclick={commitTextAnnotation}
          class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg"
        >
          Place Text
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ── Clear All Drawings Confirmation Modal ──────────────────────────────── -->
{#if showClearModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
    <div class="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-4 max-w-sm w-full space-y-3">
      <div class="flex items-center justify-between border-b border-slate-800 pb-2">
        <h4 class="text-xs font-bold text-rose-300 flex items-center gap-1.5">
          <span>⚠️</span>
          <span>Clear Canvas Drawings</span>
        </h4>
        <button
          type="button"
          onclick={() => (showClearModal = false)}
          class="text-slate-400 hover:text-white text-xs font-bold"
        >
          ✕
        </button>
      </div>

      <p class="text-xs text-slate-400 leading-relaxed">
        Choose which drawing layer to wipe from the current scene. Sketches can be cleared individually or completely.
      </p>

      <div class="flex flex-col gap-2 pt-1">
        <button
          type="button"
          onclick={() => {
            drawingStore.clearDrawings('shared');
            showClearModal = false;
          }}
          class="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 text-left flex items-center justify-between"
        >
          <span>🌐 Clear Shared Drawings ({drawingStore.sharedDrawings.length})</span>
          <span class="text-[10px] text-slate-400">Players &amp; DM</span>
        </button>

        {#if isDmView}
          <button
            type="button"
            onclick={() => {
              drawingStore.clearDrawings('dm');
              showClearModal = false;
            }}
            class="w-full py-2 px-3 bg-amber-950/60 hover:bg-amber-900/80 text-amber-200 text-xs font-semibold rounded-lg border border-amber-800/80 text-left flex items-center justify-between"
          >
            <span>🔒 Clear DM-Only Notes ({drawingStore.dmDrawings.length})</span>
            <span class="text-[10px] text-amber-400">Secret</span>
          </button>
        {/if}

        <button
          type="button"
          onclick={() => {
            drawingStore.clearDrawings('all');
            showClearModal = false;
          }}
          class="w-full py-2 px-3 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg text-center"
        >
          Wipe All Drawings ({drawingStore.drawings.length})
        </button>
      </div>
    </div>
  </div>
{/if}
