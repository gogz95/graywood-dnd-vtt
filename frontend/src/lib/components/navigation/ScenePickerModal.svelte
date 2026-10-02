<!-- frontend/src/lib/components/navigation/ScenePickerModal.svelte -->
<!-- Quick-Load Tactical Scene Picker Modal with One-Click Demo Reset -->

<script lang="ts">
  import { onMount } from 'svelte';
  import { mapsDb } from '../../db/mapsDb';
  import type { TacticalBattlemap } from '../../types/maps';
  import { canvasStore } from '../../../stores/canvasStore.svelte';
  import { projectorStore } from '../../stores/projectorStore.svelte';
  import { seedDemoEncounter, STARTER_ENCOUNTER_ID } from '../../services/demoEncounterSeeder';

  interface Props {
    isOpen?: boolean;
    onClose?: () => void;
  }

  let { isOpen = $bindable(false), onClose }: Props = $props();

  let scenes = $state<TacticalBattlemap[]>([]);
  let isLoading = $state(false);
  let isResettingDemo = $state(false);
  let feedbackMessage = $state<string | null>(null);

  $effect(() => {
    if (isOpen) {
      loadScenes();
    }
  });

  async function loadScenes() {
    isLoading = true;
    try {
      if (mapsDb?.tacticalMaps) {
        scenes = await mapsDb.tacticalMaps.toArray();
      }
    } catch (err) {
      console.warn('[ScenePickerModal] Failed loading maps from mapsDb:', err);
    } finally {
      isLoading = false;
    }
  }

  async function handleSelectScene(scene: TacticalBattlemap) {
    try {
      // 1. Set grid & background
      canvasStore.setGridSize(scene.grid.sizePx || 60);
      if (scene.grid.color) canvasStore.setGridColor(scene.grid.color);
      if (scene.grid.opacity !== undefined) canvasStore.setGridOpacity(scene.grid.opacity);

      if (scene.textureUrl) {
        canvasStore.setBackgroundTexture(scene.textureUrl);
      }

      // 2. Set walls
      if (scene.walls) {
        canvasStore.setWallsAndDoors?.(
          scene.walls
            .filter((w) => w.type === 'wall')
            .map((w) => ({ id: w.id, x1: w.p1.x, y1: w.p1.y, x2: w.p2.x, y2: w.p2.y })),
          scene.walls
            .filter((w) => w.type.startsWith('door'))
            .map((d) => ({
              id: d.id,
              x1: d.p1.x,
              y1: d.p1.y,
              x2: d.p2.x,
              y2: d.p2.y,
              state: d.type === 'door_open' ? 'OPEN' : 'CLOSED',
              doorType: 'STANDARD',
              portalType: 'door',
              portalState: d.type === 'door_open' ? 'open' : 'closed',
            }))
        );
      }

      // 3. Set Projector
      projectorStore.activeMapId = scene.id;

      close();
    } catch (err) {
      console.error('[ScenePickerModal] Failed activating scene:', err);
    }
  }

  async function handleResetDemoScene() {
    isResettingDemo = true;
    feedbackMessage = null;
    try {
      const res = await seedDemoEncounter(true);
      if (res.success) {
        feedbackMessage = `Restored "Ambush at Triboar Trail" in ${res.durationMs.toFixed(0)}ms!`;
        await loadScenes();
        setTimeout(() => {
          close();
        }, 600);
      }
    } catch (err) {
      console.error('[ScenePickerModal] Reset demo encounter failed:', err);
    } finally {
      isResettingDemo = false;
    }
  }

  function close() {
    isOpen = false;
    feedbackMessage = null;
    onClose?.();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label="Tactical Scene Picker"
    onclick={close}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-3xl p-6 shadow-2xl flex flex-col text-slate-100 cursor-default animate-in zoom-in-95 duration-200 max-h-[85vh]"
      onclick={(e) => e.stopPropagation()}
      role="document"
    >
      <!-- Header -->
      <div class="flex items-center justify-between pb-4 border-b border-slate-800">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-xl">
            🗺️
          </div>
          <div>
            <h2 class="text-base font-bold text-white tracking-wide">Tactical Scene Picker</h2>
            <p class="text-xs text-slate-400 font-mono">Select a battlemap to mount on the DM canvas</p>
          </div>
        </div>
        <button
          type="button"
          onclick={close}
          class="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          aria-label="Close Scene Picker"
        >
          ✕
        </button>
      </div>

      <!-- Action Notification Feedback -->
      {#if feedbackMessage}
        <div class="mt-3 p-3 bg-emerald-950/80 border border-emerald-500/60 rounded-xl text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <span>✓</span>
          <span>{feedbackMessage}</span>
        </div>
      {/if}

      <!-- Scene List -->
      <div class="mt-4 flex-1 overflow-y-auto space-y-2 pr-1 min-h-[160px]">
        {#if isLoading}
          <div class="text-center py-10 text-slate-500 text-xs font-mono">
            Scanning scene database…
          </div>
        {:else if scenes.length === 0}
          <div class="text-center py-10 space-y-3">
            <p class="text-xs text-slate-400">No battlemaps found in workspace storage.</p>
            <button
              type="button"
              onclick={handleResetDemoScene}
              disabled={isResettingDemo}
              class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md transition-all inline-flex items-center gap-2"
            >
              <span>🌲</span>
              <span>Load Starter Scene ("Ambush at Triboar Trail")</span>
            </button>
          </div>
        {:else}
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {#each scenes as s}
              {@const isActive = projectorStore.activeMapId === s.id}
              <div
                class="p-3.5 rounded-2xl border transition-all flex flex-col justify-between gap-3 {isActive
                  ? 'bg-indigo-950/60 border-indigo-500/80 shadow-md ring-1 ring-indigo-500/40'
                  : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'}"
              >
                <div>
                  <div class="flex items-center justify-between">
                    <span class="font-bold text-xs text-white truncate max-w-[170px]">{s.name}</span>
                    <span class="px-2 py-0.5 rounded text-[9px] font-mono font-bold {s.biome === 'forest' ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/60' : 'bg-slate-800 text-slate-300'}">
                      {s.biome || 'Tactical'}
                    </span>
                  </div>
                  <div class="mt-1 text-[10px] text-slate-400 font-mono">
                    Grid: {s.grid.sizePx}px • Walls: {s.walls?.length || 0}
                  </div>
                </div>

                <div class="flex items-center justify-between pt-2 border-t border-slate-800/80">
                  {#if isActive}
                    <span class="text-[10px] font-bold text-indigo-400 flex items-center gap-1">
                      <span>●</span> Active on Canvas
                    </span>
                  {:else}
                    <span></span>
                  {/if}
                  <button
                    type="button"
                    onclick={() => handleSelectScene(s)}
                    class="px-3 py-1 bg-slate-800 hover:bg-indigo-600 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
                  >
                    Mount Scene
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Footer with Reset/Reload Demo Scene Action -->
      <div class="mt-5 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
        <button
          type="button"
          onclick={handleResetDemoScene}
          disabled={isResettingDemo}
          class="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 text-amber-300 hover:text-amber-200 font-bold rounded-xl transition-all inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          title="Restore sample forest battlemap with goblins and campfire"
        >
          <span>{isResettingDemo ? '⏳' : '🔄'}</span>
          <span>{isResettingDemo ? 'Restoring…' : 'Reset/Reload Demo Scene'}</span>
        </button>

        <button
          type="button"
          onclick={close}
          class="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition-colors cursor-pointer"
        >
          Close
        </button>
      </div>
    </div>
  </div>
{/if}
