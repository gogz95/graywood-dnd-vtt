<!-- OverheadLayer.svelte — Overhead Tile Roofs and Dynamic Token Occlusion Engine (Foundry Levels/Roofs Parity) -->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Application, Container, Graphics, Sprite, Assets } from 'pixi.js';
  import { canvasStore } from '../../../stores/canvasStore.svelte';
  import { tokenStore } from '../../stores/tokenStore.svelte';
  import type { OverheadTile } from '../../types/map';

  interface Props {
    pixiApp: Application | null;
    container: Container | null;
    gridSize?: number;
    isProjector?: boolean;
    selectedTokenId?: string | null;
  }

  let {
    pixiApp = null,
    container = null,
    gridSize = 60,
    isProjector = false,
    selectedTokenId = null,
  }: Props = $props();

  interface TileInstance {
    sprite: Sprite;
    maskGraphics: Graphics;
    texture: any;
    currentAlpha: number;
    targetAlpha: number;
    isOccluded: boolean;
  }

  const tileInstances = new Map<string, TileInstance>();
  let tickerBound = false;

  // Selected tile for DM configuration
  let selectedTileId = $state<string | null>(null);
  let selectedTile = $derived(
    selectedTileId ? canvasStore.overheadTiles.find((t) => t.id === selectedTileId) || null : null
  );

  function isTokenInsideTileBounds(
    tokX: number,
    tokY: number,
    bounds: { x: number; y: number; width: number; height: number }
  ): boolean {
    return (
      tokX >= bounds.x &&
      tokX <= bounds.x + bounds.width &&
      tokY >= bounds.y &&
      tokY <= bounds.y + bounds.height
    );
  }

  function purgeTileInstance(id: string) {
    const inst = tileInstances.get(id);
    if (!inst) return;
    try {
      if (inst.sprite.parent) {
        inst.sprite.parent.removeChild(inst.sprite);
      }
      if (inst.maskGraphics.parent) {
        inst.maskGraphics.parent.removeChild(inst.maskGraphics);
      }
      inst.sprite.mask = null;
      inst.maskGraphics.destroy(true);
      inst.texture.destroy(true);
      inst.sprite.destroy({ children: true, texture: true, textureSource: true });
    } catch (err) {
      console.warn('OverheadLayer: Error destroying tile instance:', err);
    }
    tileInstances.delete(id);
  }

  function purgeAllTiles() {
    for (const id of Array.from(tileInstances.keys())) {
      purgeTileInstance(id);
    }
    if (container) {
      container.removeChildren();
    }
  }

  async function syncTiles() {
    if (!container) return;

    const tiles = canvasStore.overheadTiles || [];
    const activeIds = new Set(tiles.map((t) => t.id));

    // 1. Purge removed tiles
    for (const id of Array.from(tileInstances.keys())) {
      if (!activeIds.has(id)) {
        purgeTileInstance(id);
      }
    }

    // 2. Add or update tiles
    for (const tile of tiles) {
      const existing = tileInstances.get(tile.id);
      if (existing) {
        existing.sprite.position.set(tile.bounds.x, tile.bounds.y);
        existing.sprite.width = tile.bounds.width;
        existing.sprite.height = tile.bounds.height;
      } else {
        try {
          const texture = await Assets.load(tile.imageUrl);
          if (!texture || !container) return;

          const sprite = new Sprite(texture);
          sprite.position.set(tile.bounds.x, tile.bounds.y);
          sprite.width = tile.bounds.width;
          sprite.height = tile.bounds.height;
          sprite.alpha = 1.0;
          sprite.eventMode = 'static';
          sprite.cursor = 'pointer';

          const maskGraphics = new Graphics();

          container.addChild(sprite);
          container.addChild(maskGraphics);

          tileInstances.set(tile.id, {
            sprite,
            maskGraphics,
            texture,
            currentAlpha: 1.0,
            targetAlpha: 1.0,
            isOccluded: false,
          });
        } catch (err) {
          console.warn('OverheadLayer: Failed to load overhead tile texture:', tile.imageUrl, err);
        }
      }
    }
  }

  // ── Frame Ticker Occlusion Evaluation ──────────────────────────────────────
  function onTick() {
    if (!pixiApp) return;
    const deltaMs = pixiApp.ticker.deltaMS || 16.66;
    const dt = deltaMs / 1000;
    const lerpFactor = 1 - Math.exp(-14 * dt);

    const tiles = canvasStore.overheadTiles || [];
    if (tiles.length === 0) return;

    // Get tokens to evaluate based on perspective
    // Tabletop projector: strictly party player tokens (not DM monsters!)
    // DM Workstation: player tokens or currently selected token
    let tokensToCheck: Array<{ x: number; y: number; elevation: number }> = [];

    if (isProjector) {
      tokensToCheck = canvasStore.tokens
        .filter((t) => t.isPlayer && !t.isOrbSealed && t.isVisible !== false)
        .map((t) => ({
          x: (t.x + 0.5) * gridSize,
          y: (t.y + 0.5) * gridSize,
          elevation: (t as any).elevation ?? 0,
        }));
    } else {
      tokensToCheck = tokenStore.tokens
        .filter((t) => t.isPlayer || (selectedTokenId && t.id === selectedTokenId))
        .map((t) => ({
          x: t.x,
          y: t.y,
          elevation: t.elevation ?? 0,
        }));
    }

    for (const tile of tiles) {
      const inst = tileInstances.get(tile.id);
      if (!inst) continue;

      // Find tokens inside tile bounds with elevation lower than the threshold
      const tokensInside = tokensToCheck.filter((tok) => {
        return (
          isTokenInsideTileBounds(tok.x, tok.y, tile.bounds) &&
          tok.elevation < (tile.elevationThreshold ?? 10)
        );
      });

      const isOccluded = tokensInside.length > 0;
      inst.isOccluded = isOccluded;

      if (isOccluded) {
        if (tile.occlusionMode === 'radial') {
          // Keep base tile visible, punch circular holes around tokens underneath
          inst.targetAlpha = 1.0;

          inst.maskGraphics.clear();
          // 1. Draw outer boundary rect
          inst.maskGraphics
            .rect(tile.bounds.x - 4, tile.bounds.y - 4, tile.bounds.width + 8, tile.bounds.height + 8)
            .fill({ color: 0xffffff, alpha: 1.0 });

          // 2. Cut radial hole around each token
          const cutoutRadius = Math.max(gridSize * 1.4, 75);
          for (const tok of tokensInside) {
            inst.maskGraphics.circle(tok.x, tok.y, cutoutRadius).cut();
          }

          inst.sprite.mask = inst.maskGraphics;
        } else {
          // Fade mode: smoothly reduce opacity
          inst.targetAlpha = tile.occlusionAlpha ?? 0.2;
          inst.sprite.mask = null;
          inst.maskGraphics.clear();
        }
      } else {
        // No tokens underneath: restore to full 1.0 opacity
        inst.targetAlpha = 1.0;
        if (inst.sprite.mask) {
          inst.sprite.mask = null;
          inst.maskGraphics.clear();
        }
      }

      // Smooth exponential lerp
      inst.currentAlpha += (inst.targetAlpha - inst.currentAlpha) * lerpFactor;
      if (Math.abs(inst.currentAlpha - inst.targetAlpha) < 0.005) {
        inst.currentAlpha = inst.targetAlpha;
      }
      inst.sprite.alpha = inst.currentAlpha;
    }
  }

  $effect(() => {
    const _ = canvasStore.overheadTiles;
    if (container) {
      syncTiles();
    }
  });

  $effect(() => {
    if (pixiApp && !tickerBound) {
      pixiApp.ticker.add(onTick);
      tickerBound = true;
    }
  });

  onDestroy(() => {
    if (pixiApp && tickerBound) {
      pixiApp.ticker.remove(onTick);
      tickerBound = false;
    }
    purgeAllTiles();
  });

  export function selectTile(id: string | null) {
    selectedTileId = id;
  }
</script>

<!-- ── Selected Overhead Roof Tile Inspector HUD (DM Workstation Only) ────────── -->
{#if !isProjector && selectedTile}
  <div
    class="absolute top-20 right-6 z-40 bg-slate-900/95 border border-amber-500/70 rounded-2xl shadow-2xl p-4 w-72 backdrop-blur-md flex flex-col gap-3 text-xs text-slate-200 animate-in fade-in duration-150"
  >
    <div class="flex items-center justify-between border-b border-slate-800 pb-2">
      <div class="flex items-center gap-2 min-w-0">
        <span class="text-amber-400 font-bold shrink-0">🏠 Roof Tile</span>
        <span class="text-slate-300 font-semibold truncate text-[11px]">{selectedTile.name || 'Overhead Roof'}</span>
      </div>
      <button
        type="button"
        class="text-slate-400 hover:text-white p-1 rounded shrink-0"
        onclick={() => (selectedTileId = null)}
        aria-label="Close Roof Inspector"
      >
        ✕
      </button>
    </div>

    <!-- Bounds & Elevation Threshold -->
    <div class="grid grid-cols-2 gap-2 text-[11px]">
      <div class="bg-slate-950/70 p-2 rounded-lg border border-slate-800 flex flex-col">
        <span class="text-slate-400 text-[10px]">Elevation Threshold</span>
        <span class="text-amber-300 font-bold font-mono">{selectedTile.elevationThreshold} ft</span>
      </div>
      <div class="bg-slate-950/70 p-2 rounded-lg border border-slate-800 flex flex-col">
        <span class="text-slate-400 text-[10px]">Occlusion Mode</span>
        <span class="text-amber-300 font-bold uppercase font-mono">{selectedTile.occlusionMode}</span>
      </div>
    </div>

    <!-- Mode Selector -->
    <div class="flex flex-col gap-1">
      <span class="text-slate-400 text-[11px]">Occlusion Mode</span>
      <div class="grid grid-cols-2 gap-1.5 p-1 bg-slate-950/80 rounded-lg border border-slate-800">
        <button
          type="button"
          class="py-1 rounded font-semibold text-[11px] transition-colors {selectedTile.occlusionMode === 'fade' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}"
          onclick={() => canvasStore.updateOverheadTile(selectedTile.id, { occlusionMode: 'fade' })}
        >
          Fade
        </button>
        <button
          type="button"
          class="py-1 rounded font-semibold text-[11px] transition-colors {selectedTile.occlusionMode === 'radial' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}"
          onclick={() => canvasStore.updateOverheadTile(selectedTile.id, { occlusionMode: 'radial' })}
        >
          Radial Cutout
        </button>
      </div>
    </div>

    <!-- Occlusion Alpha Slider (Fade Mode) -->
    {#if selectedTile.occlusionMode === 'fade'}
      <div class="flex flex-col gap-1">
        <div class="flex items-center justify-between text-[11px]">
          <span class="text-slate-400">Occlusion Opacity</span>
          <span class="font-mono text-amber-300">{Math.round(selectedTile.occlusionAlpha * 100)}%</span>
        </div>
        <input
          type="range"
          min="0.0"
          max="0.8"
          step="0.05"
          value={selectedTile.occlusionAlpha}
          oninput={(e) => {
            const val = parseFloat(e.currentTarget.value);
            canvasStore.updateOverheadTile(selectedTile.id, { occlusionAlpha: val });
          }}
          class="w-full accent-amber-500 cursor-pointer"
        />
      </div>
    {/if}

    <!-- Elevation Threshold Slider -->
    <div class="flex flex-col gap-1">
      <div class="flex items-center justify-between text-[11px]">
        <span class="text-slate-400">Elevation Threshold (ft)</span>
        <span class="font-mono text-amber-300">{selectedTile.elevationThreshold} ft</span>
      </div>
      <input
        type="range"
        min="0"
        max="60"
        step="5"
        value={selectedTile.elevationThreshold}
        oninput={(e) => {
          const val = parseInt(e.currentTarget.value, 10);
          canvasStore.updateOverheadTile(selectedTile.id, { elevationThreshold: val });
        }}
        class="w-full accent-amber-500 cursor-pointer"
      />
    </div>

    <!-- Delete Button -->
    <button
      type="button"
      class="mt-1 px-3 py-1.5 bg-red-950/80 hover:bg-red-900 border border-red-800 text-red-200 rounded-lg text-[11px] font-semibold transition-colors"
      onclick={() => {
        canvasStore.removeOverheadTile(selectedTile.id);
        selectedTileId = null;
      }}
    >
      Remove Roof Tile
    </button>
  </div>
{/if}
