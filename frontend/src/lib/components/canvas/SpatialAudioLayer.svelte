<!-- SpatialAudioLayer.svelte — 2D Positional Spatial Audio Emitters & DM Canvas Visualizer -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Container, Graphics, Text } from 'pixi.js';
  import type { Application } from 'pixi.js';
  import { spatialAudioEngine } from '../../services/spatialAudioEngine';
  import type { AudioEmitter } from '../../types/audio';

  interface Props {
    pixiApp: Application | null;
    parentContainer: Container | null;
    gridSize?: number;
    zoom?: number;
    panX?: number;
    panY?: number;
    screenToWorld: (screenX: number, screenY: number) => { x: number; y: number };
    worldToScreen: (worldX: number, worldY: number) => { x: number; y: number };
  }

  let {
    pixiApp,
    parentContainer,
    gridSize = 60,
    zoom = 1.0,
    panX = 0,
    panY = 0,
    screenToWorld,
    worldToScreen,
  }: Props = $props();

  // ── Pixi Containers ────────────────────────────────────────────────────────
  let emitterGraphicsContainer: Container | null = null;
  let ringsGraphics: Graphics | null = null;
  let badgesContainer: Container | null = null;

  // ── Drag & Selection State ─────────────────────────────────────────────────
  let isDraggingEmitter = $state(false);
  let draggingEmitterId = $state<string | null>(null);
  let dragOffset = { x: 0, y: 0 };
  let showCreateModal = $state(false);

  const selectedEmitter = $derived(
    spatialAudioEngine.selectedEmitterId
      ? spatialAudioEngine.emitters.find((e) => e.id === spatialAudioEngine.selectedEmitterId) || null
      : null
  );

  const selectedScreenPos = $derived.by(() => {
    if (!selectedEmitter) return null;
    return worldToScreen(selectedEmitter.x, selectedEmitter.y);
  });

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  onMount(() => {
    initPixiLayers();
  });

  onDestroy(() => {
    destroyPixiLayers();
  });

  function initPixiLayers() {
    if (!parentContainer) return;

    if (!emitterGraphicsContainer) {
      emitterGraphicsContainer = new Container();
      emitterGraphicsContainer.label = 'spatialAudioContainer';
      parentContainer.addChild(emitterGraphicsContainer);
    }

    if (!ringsGraphics) {
      ringsGraphics = new Graphics();
      ringsGraphics.label = 'spatialAudioRings';
      emitterGraphicsContainer.addChild(ringsGraphics);
    }

    if (!badgesContainer) {
      badgesContainer = new Container();
      badgesContainer.label = 'spatialAudioBadges';
      emitterGraphicsContainer.addChild(badgesContainer);
    }

    renderAllEmitters();
  }

  function destroyPixiLayers() {
    if (ringsGraphics) {
      ringsGraphics.destroy();
      ringsGraphics = null;
    }
    if (badgesContainer) {
      badgesContainer.destroy({ children: true });
      badgesContainer = null;
    }
    if (emitterGraphicsContainer) {
      emitterGraphicsContainer.destroy({ children: true });
      emitterGraphicsContainer = null;
    }
  }

  // ── Reactive Visual Render ─────────────────────────────────────────────────
  $effect(() => {
    const _ = spatialAudioEngine.emitters;
    const __ = spatialAudioEngine.selectedEmitterId;
    const ___ = gridSize;
    if (parentContainer && !emitterGraphicsContainer) {
      initPixiLayers();
    }
    renderAllEmitters();
  });

  function renderAllEmitters() {
    if (!ringsGraphics || !badgesContainer) return;

    ringsGraphics.clear();
    badgesContainer.removeChildren().forEach((c) => {
      try {
        c.destroy({ children: true });
      } catch {}
    });

    const isSelected = (id: string) => spatialAudioEngine.selectedEmitterId === id;

    for (const emitter of spatialAudioEngine.emitters) {
      const innerPx = (emitter.innerRadius / 5) * gridSize;
      const outerPx = (emitter.outerRadius / 5) * gridSize;
      const sel = isSelected(emitter.id);

      // 1. Outer Falloff Ring (Dashed/Subtle Cyan)
      ringsGraphics
        .circle(emitter.x, emitter.y, outerPx)
        .fill({ color: 0x06b6d4, alpha: sel ? 0.08 : 0.04 });
      ringsGraphics
        .circle(emitter.x, emitter.y, outerPx)
        .stroke({ color: sel ? 0x22d3ee : 0x0891b2, width: sel ? 2 : 1.5, alpha: sel ? 0.8 : 0.4 });

      // 2. Inner 100% Volume Ring (Emerald Green)
      ringsGraphics
        .circle(emitter.x, emitter.y, innerPx)
        .fill({ color: 0x10b981, alpha: sel ? 0.15 : 0.08 });
      ringsGraphics
        .circle(emitter.x, emitter.y, innerPx)
        .stroke({ color: sel ? 0x34d399 : 0x059669, width: sel ? 2.5 : 1.5, alpha: sel ? 0.95 : 0.6 });

      // 3. Emitter Speaker Center Badge
      const badgeG = new Graphics();
      badgeG
        .circle(emitter.x, emitter.y, 16)
        .fill({ color: sel ? 0x0284c7 : 0x0f172a, alpha: 0.95 })
        .stroke({ color: sel ? 0x38bdf8 : 0x10b981, width: sel ? 2.5 : 2 });

      // Pulsing indicator if playing
      if (emitter.isPlaying !== false) {
        badgeG
          .circle(emitter.x, emitter.y, 20)
          .stroke({ color: 0x10b981, width: 1, alpha: 0.5 });
      }

      badgesContainer.addChild(badgeG);

      // Text Icon 🔊
      const iconText = new Text({
        text: emitter.isPlaying === false ? '🔇' : '🔊',
        style: {
          fontSize: 14,
          align: 'center',
        },
      });
      iconText.anchor.set(0.5);
      iconText.position.set(emitter.x, emitter.y);
      badgesContainer.addChild(iconText);

      // Name Label Tag
      if (emitter.name) {
        const nameText = new Text({
          text: emitter.name,
          style: {
            fontFamily: 'monospace',
            fontSize: 10,
            fontWeight: 'bold',
            fill: sel ? 0x38bdf8 : 0xe2e8f0,
            stroke: { color: 0x000000, width: 3 },
          },
        });
        nameText.anchor.set(0.5, 0);
        nameText.position.set(emitter.x, emitter.y + 20);
        badgesContainer.addChild(nameText);
      }
    }
  }

  // ── Drag & Hit-Testing Interaction ─────────────────────────────────────────
  export function handlePointerDown(e: PointerEvent): boolean {
    if (e.button !== 0) return false;

    const world = screenToWorld(e.clientX, e.clientY);
    const hit = spatialAudioEngine.emitters.find((emitter) => {
      const d = Math.hypot(emitter.x - world.x, emitter.y - world.y);
      return d <= 24; // Badge radius + padding
    });

    if (hit) {
      isDraggingEmitter = true;
      draggingEmitterId = hit.id;
      dragOffset = { x: hit.x - world.x, y: hit.y - world.y };
      spatialAudioEngine.selectedEmitterId = hit.id;
      return true; // consumed
    }

    return false;
  }

  export function handlePointerMove(e: PointerEvent): boolean {
    if (!isDraggingEmitter || !draggingEmitterId) return false;

    const world = screenToWorld(e.clientX, e.clientY);
    const newX = Math.round(world.x + dragOffset.x);
    const newY = Math.round(world.y + dragOffset.y);

    spatialAudioEngine.updateEmitter(draggingEmitterId, { x: newX, y: newY });
    return true; // consumed
  }

  export function handlePointerUp(): boolean {
    if (isDraggingEmitter) {
      isDraggingEmitter = false;
      draggingEmitterId = null;
      return true;
    }
    return false;
  }

  function handleCreateNewEmitter(presetType: 'fire' | 'water' | 'hum') {
    const centerWorld = screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
    const names = {
      fire: 'Campfire Ambient',
      water: 'Sewer / Water Flow',
      hum: 'Arcane Crystal Hum',
    };

    const newEmitter: AudioEmitter = {
      id: `emitter_${Date.now()}`,
      fileUrl: `synth:${presetType}`,
      name: names[presetType],
      x: centerWorld.x,
      y: centerWorld.y,
      innerRadius: 15,
      outerRadius: 45,
      loop: true,
      volume: 0.75,
      isPlaying: true,
      isProcedural: true,
      proceduralType: presetType,
    };

    spatialAudioEngine.addEmitter(newEmitter);
    spatialAudioEngine.selectedEmitterId = newEmitter.id;
    showCreateModal = false;
  }
</script>

<!-- ── Floating Spatial Audio Button & Action Dock ───────────────────────── -->
<div class="absolute top-20 right-28 z-30 pointer-events-auto">
  <div class="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 rounded-xl p-1 shadow-xl backdrop-blur-md">
    <button
      type="button"
      onclick={() => (showCreateModal = true)}
      class="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold flex items-center gap-1.5 transition-colors"
      title="Add 2D Positional Sound Source"
    >
      <span>🔊+</span>
      <span class="text-[11px]">Add Emitter</span>
    </button>

    {#if spatialAudioEngine.emitters.length > 0}
      <button
        type="button"
        onclick={() => (spatialAudioEngine.masterEnabled = !spatialAudioEngine.masterEnabled)}
        class="px-2 py-1 rounded-lg text-xs font-semibold border transition-colors flex items-center gap-1
          {spatialAudioEngine.masterEnabled ? 'bg-indigo-950 text-indigo-300 border-indigo-800' : 'bg-rose-950 text-rose-300 border-rose-800'}"
        title="Toggle all spatial audio nodes"
      >
        <span>{spatialAudioEngine.masterEnabled ? 'Mute' : 'Unmute'}</span>
        <span class="text-[10px] opacity-75">({spatialAudioEngine.emitters.length})</span>
      </button>
    {/if}
  </div>
</div>

<!-- ── Selected Emitter Inspector Popover ─────────────────────────────────── -->
{#if selectedEmitter && selectedScreenPos}
  <div
    class="absolute z-50 bg-slate-900/95 border border-cyan-500/80 rounded-2xl shadow-2xl p-3 min-w-[240px] text-xs backdrop-blur-md animate-in fade-in"
    style="left: {Math.max(20, Math.min(window.innerWidth - 270, selectedScreenPos.x + 24))}px; top: {Math.max(80, Math.min(window.innerHeight - 340, selectedScreenPos.y - 60))}px;"
  >
    <div class="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
      <div class="flex items-center gap-1.5 font-bold text-slate-200">
        <span>🔊</span>
        <span>{selectedEmitter.name || 'Positional Emitter'}</span>
      </div>
      <button
        type="button"
        onclick={() => (spatialAudioEngine.selectedEmitterId = null)}
        class="text-slate-400 hover:text-white p-0.5 text-xs font-bold"
      >
        ✕
      </button>
    </div>

    <div class="space-y-2.5">
      <!-- Volume Slider -->
      <div>
        <div class="flex items-center justify-between text-[11px] text-slate-400">
          <span>Volume</span>
          <span class="font-mono text-cyan-300 font-bold">{Math.round(selectedEmitter.volume * 100)}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={selectedEmitter.volume}
          oninput={(e) => {
            const v = parseFloat(e.currentTarget.value);
            spatialAudioEngine.updateEmitter(selectedEmitter.id, { volume: v });
          }}
          class="w-full accent-cyan-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
        />
      </div>

      <!-- Inner Radius Slider (100% Volume Zone) -->
      <div>
        <div class="flex items-center justify-between text-[11px] text-slate-400">
          <span>Inner Full Radius</span>
          <span class="font-mono text-emerald-400 font-bold">{selectedEmitter.innerRadius} ft</span>
        </div>
        <input
          type="range"
          min="5"
          max="60"
          step="5"
          value={selectedEmitter.innerRadius}
          oninput={(e) => {
            const r = parseInt(e.currentTarget.value, 10);
            spatialAudioEngine.updateEmitter(selectedEmitter.id, {
              innerRadius: r,
              outerRadius: Math.max(r + 5, selectedEmitter.outerRadius),
            });
          }}
          class="w-full accent-emerald-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
        />
      </div>

      <!-- Outer Radius Slider (Fade to 0% Zone) -->
      <div>
        <div class="flex items-center justify-between text-[11px] text-slate-400">
          <span>Outer Fade Radius</span>
          <span class="font-mono text-cyan-400 font-bold">{selectedEmitter.outerRadius} ft</span>
        </div>
        <input
          type="range"
          min={selectedEmitter.innerRadius + 5}
          max="150"
          step="5"
          value={selectedEmitter.outerRadius}
          oninput={(e) => {
            const r = parseInt(e.currentTarget.value, 10);
            spatialAudioEngine.updateEmitter(selectedEmitter.id, { outerRadius: r });
          }}
          class="w-full accent-cyan-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
        />
      </div>

      <!-- Mute & Delete Actions -->
      <div class="flex items-center justify-between pt-1 border-t border-slate-800">
        <button
          type="button"
          onclick={() => {
            const next = selectedEmitter.isPlaying === false;
            spatialAudioEngine.updateEmitter(selectedEmitter.id, { isPlaying: next });
          }}
          class="px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors
            {selectedEmitter.isPlaying !== false ? 'bg-emerald-950 text-emerald-300 border-emerald-800' : 'bg-slate-800 text-slate-400 border-slate-700'}"
        >
          {selectedEmitter.isPlaying !== false ? 'Playing' : 'Muted'}
        </button>

        <button
          type="button"
          onclick={() => spatialAudioEngine.removeEmitter(selectedEmitter.id)}
          class="px-2.5 py-1 bg-rose-950/80 hover:bg-rose-900 border border-rose-800/80 text-rose-300 rounded-lg text-[11px] font-semibold transition-colors"
        >
          Remove
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ── Create Emitter Modal ──────────────────────────────────────────────── -->
{#if showCreateModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
    <div class="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-4 max-w-sm w-full space-y-3">
      <div class="flex items-center justify-between border-b border-slate-800 pb-2">
        <h4 class="text-xs font-bold text-slate-100 flex items-center gap-1.5">
          <span>🔊</span>
          <span>Spawn Spatial Audio Emitter</span>
        </h4>
        <button
          type="button"
          onclick={() => (showCreateModal = false)}
          class="text-slate-400 hover:text-white text-xs font-bold"
        >
          ✕
        </button>
      </div>

      <p class="text-xs text-slate-400 leading-relaxed">
        Select a 2D spatial acoustic preset. Sound volume smoothly attenuates according to the distance from the party or camera center.
      </p>

      <div class="flex flex-col gap-2 pt-1">
        <button
          type="button"
          onclick={() => handleCreateNewEmitter('fire')}
          class="w-full py-2.5 px-3 bg-amber-950/40 hover:bg-amber-900/60 text-amber-200 text-xs font-semibold rounded-xl border border-amber-800/60 text-left flex items-center justify-between transition-colors"
        >
          <span class="flex items-center gap-2">
            <span>🔥</span>
            <span>Campfire / Forge Ambience</span>
          </span>
          <span class="text-[10px] text-amber-400 font-mono">15/45 ft</span>
        </button>

        <button
          type="button"
          onclick={() => handleCreateNewEmitter('water')}
          class="w-full py-2.5 px-3 bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-200 text-xs font-semibold rounded-xl border border-cyan-800/60 text-left flex items-center justify-between transition-colors"
        >
          <span class="flex items-center gap-2">
            <span>🌊</span>
            <span>Sewer / Underground River</span>
          </span>
          <span class="text-[10px] text-cyan-400 font-mono">20/60 ft</span>
        </button>

        <button
          type="button"
          onclick={() => handleCreateNewEmitter('hum')}
          class="w-full py-2.5 px-3 bg-purple-950/40 hover:bg-purple-900/60 text-purple-200 text-xs font-semibold rounded-xl border border-purple-800/60 text-left flex items-center justify-between transition-colors"
        >
          <span class="flex items-center gap-2">
            <span>✨</span>
            <span>Arcane Crystal Resonance</span>
          </span>
          <span class="text-[10px] text-purple-400 font-mono">10/40 ft</span>
        </button>
      </div>

      <div class="flex justify-end pt-2 border-t border-slate-800">
        <button
          type="button"
          onclick={() => (showCreateModal = false)}
          class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
{/if}
