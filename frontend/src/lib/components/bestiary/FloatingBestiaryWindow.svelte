<!-- src/lib/components/bestiary/FloatingBestiaryWindow.svelte -->
<!-- Floating detachable Bestiary HUD with draggable header, resize handle, and direct token drag-to-canvas -->

<script lang="ts">
  import { floatingWindowsStore } from '../../stores/floatingWindowsStore.svelte';
  import { bestiaryStore, encounterStore } from '../../stores/bestiaryStore.svelte';
  import type { CompendiumMonster } from '../../db/compendiumDb';
  import StatblockView from './StatblockView.svelte';

  let {
    onDock = () => {},
  }: {
    onDock?: () => void;
  } = $props();

  const winState = $derived(floatingWindowsStore.windows.bestiary);

  let isDragging = $state(false);
  let isResizing = $state(false);
  let dragStartX = 0;
  let dragStartY = 0;
  let initialX = 0;
  let initialY = 0;
  let initialWidth = 0;
  let initialHeight = 0;

  let previewMonster = $state<CompendiumMonster | null>(null);
  let justAddedId = $state<string | null>(null);

  const CR_OPTIONS = [
    { label: 'All', value: 'all' },
    { label: '1/8', value: '1/8' },
    { label: '1/4', value: '1/4' },
    { label: '1/2', value: '1/2' },
    { label: '1', value: '1' },
    { label: '2', value: '2' },
    { label: '3', value: '3' },
    { label: '5', value: '5' },
    { label: '10+', value: '10' },
  ];

  const TYPE_OPTIONS = [
    'all',
    'Humanoid',
    'Undead',
    'Beast',
    'Giant',
    'Fiend',
    'Dragon',
    'Monstrosity',
  ];

  function handleHeaderMouseDown(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('button')) return;
    isDragging = true;
    floatingWindowsStore.bringToFront('bestiary');
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    initialX = winState.x;
    initialY = winState.y;

    window.addEventListener('mousemove', handleHeaderMouseMove);
    window.addEventListener('mouseup', handleHeaderMouseUp);
  }

  function handleHeaderMouseMove(e: MouseEvent) {
    if (!isDragging) return;
    const deltaX = e.clientX - dragStartX;
    const deltaY = e.clientY - dragStartY;
    floatingWindowsStore.updatePosition('bestiary', initialX + deltaX, initialY + deltaY);
  }

  function handleHeaderMouseUp() {
    isDragging = false;
    window.removeEventListener('mousemove', handleHeaderMouseMove);
    window.removeEventListener('mouseup', handleHeaderMouseUp);
  }

  function handleResizeMouseDown(e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    isResizing = true;
    floatingWindowsStore.bringToFront('bestiary');
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    initialWidth = winState.width;
    initialHeight = winState.height;

    window.addEventListener('mousemove', handleResizeMouseMove);
    window.addEventListener('mouseup', handleResizeMouseUp);
  }

  function handleResizeMouseMove(e: MouseEvent) {
    if (!isResizing) return;
    const deltaW = e.clientX - dragStartX;
    const deltaH = e.clientY - dragStartY;
    const newW = Math.max(340, Math.min(1000, initialWidth + deltaW));
    const newH = Math.max(280, Math.min(900, initialHeight + deltaH));
    floatingWindowsStore.updateSize('bestiary', newW, newH);
  }

  function handleResizeMouseUp() {
    isResizing = false;
    window.removeEventListener('mousemove', handleResizeMouseMove);
    window.removeEventListener('mouseup', handleResizeMouseUp);
  }

  function handleDragStart(event: DragEvent, m: CompendiumMonster) {
    if (!event.dataTransfer) return;
    const payload = {
      type: 'MONSTER_TOKEN',
      monsterId: m.id,
      name: m.name,
      hp: m.hp,
      ac: m.ac,
      size: m.size || 'Medium',
      cr: m.cr,
      color: '#ef4444',
    };
    event.dataTransfer.setData('application/json', JSON.stringify(payload));
    event.dataTransfer.setData('text/plain', JSON.stringify(payload));
    event.dataTransfer.effectAllowed = 'copy';
  }

  function handleAddToEncounter(m: CompendiumMonster) {
    encounterStore.addCombatant(m);
    justAddedId = m.id;
    setTimeout(() => {
      if (justAddedId === m.id) justAddedId = null;
    }, 1500);
  }

  function dockBack() {
    floatingWindowsStore.closeWindow('bestiary');
    onDock();
  }
</script>

{#if winState && winState.isOpen}
  <!-- Draggable HUD container positioned absolutely with pointer-events-auto -->
  <div
    class="fixed pointer-events-none select-none"
    style="left: {winState.x}px; top: {winState.y}px; z-index: {winState.zIndex}; width: {winState.width}px; height: {winState.isMinimized ? 'auto' : `${winState.height}px`};"
  >
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="pointer-events-auto w-full h-full flex flex-col bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-none"
      style="box-shadow: 0 25px 50px -12px rgba(0,0,0,0.85), 0 0 1px 1px rgba(255,255,255,0.06);"
      onclick={() => floatingWindowsStore.bringToFront('bestiary')}
      role="region"
      aria-label="Floating Bestiary Compendium"
    >
      <!-- Title Bar -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        onmousedown={handleHeaderMouseDown}
        class="h-10 px-3 bg-slate-950/95 border-b border-slate-800 flex items-center justify-between cursor-move shrink-0"
      >
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-sm">🐉</span>
          <span class="text-xs font-bold uppercase tracking-wider text-slate-200 truncate">
            Bestiary HUD (Detached)
          </span>
          <span class="text-[10px] text-amber-400/80 font-mono">
            {bestiaryStore.filteredMonsters.length}
          </span>
        </div>

        <!-- Window Action Buttons -->
        <div class="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onclick={dockBack}
            class="px-1.5 py-0.5 rounded text-[10px] font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            title="Dock back to slide-over drawer"
          >
            📥 Dock
          </button>
          <button
            type="button"
            onclick={() => floatingWindowsStore.toggleMinimize('bestiary')}
            class="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-800 text-xs font-mono transition-colors"
            title={winState.isMinimized ? 'Restore' : 'Minimize'}
          >
            {winState.isMinimized ? '□' : '−'}
          </button>
          <button
            type="button"
            onclick={() => floatingWindowsStore.closeWindow('bestiary')}
            class="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-rose-300 hover:bg-rose-900/50 text-xs font-bold transition-colors"
            title="Close Window"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Window Body (when not minimized) -->
      {#if !winState.isMinimized}
        <div class="flex-1 overflow-hidden min-h-0 bg-slate-950 flex flex-col relative">
          <!-- Search & Filter Controls -->
          <div class="p-3 border-b border-slate-800 bg-slate-900/90 space-y-2 shrink-0">
            <div class="relative">
              <input
                type="text"
                bind:value={bestiaryStore.searchQuery}
                placeholder="Search monsters to spawn..."
                class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
              {#if bestiaryStore.searchQuery}
                <button
                  type="button"
                  onclick={() => (bestiaryStore.searchQuery = '')}
                  class="absolute right-2.5 top-1.5 text-xs text-slate-500 hover:text-slate-300"
                >
                  ✕
                </button>
              {/if}
            </div>

            <!-- CR Quick Chips -->
            <div class="flex items-center gap-1 overflow-x-auto pb-0.5 text-[10px] font-bold scrollbar-none">
              {#each CR_OPTIONS as crOpt}
                <button
                  type="button"
                  onclick={() => (bestiaryStore.selectedCr = crOpt.value)}
                  class="px-2 py-0.5 rounded transition-colors whitespace-nowrap {bestiaryStore.selectedCr ===
                  crOpt.value
                    ? 'bg-amber-500 text-slate-950 font-black'
                    : 'bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-slate-200'}"
                >
                  {crOpt.label}
                </button>
              {/each}
            </div>
          </div>

          <!-- Monster List with Drag handles -->
          <div class="flex-1 overflow-y-auto p-2.5 space-y-1.5 scrollbar-thin">
            {#if bestiaryStore.isLoading}
              <div class="p-8 text-center text-xs text-slate-500">
                Loading 5e SRD Bestiary...
              </div>
            {:else if bestiaryStore.filteredMonsters.length === 0}
              <div class="p-8 text-center text-xs text-slate-500 space-y-1">
                <p>No monsters matching filter.</p>
              </div>
            {:else}
              {#each bestiaryStore.filteredMonsters as monster (monster.id)}
                <div
                  class="p-2 bg-slate-900/90 border border-slate-800/80 hover:border-slate-700 rounded-lg flex items-center justify-between gap-2 transition-colors group"
                >
                  <!-- Drag Handle & Monster Info -->
                  <div class="flex items-center gap-2 min-w-0">
                    <div
                      role="button"
                      tabindex="0"
                      aria-label="Drag {monster.name} onto canvas"
                      draggable="true"
                      ondragstart={(e) => handleDragStart(e, monster)}
                      class="w-6 h-7 flex items-center justify-center rounded cursor-grab active:cursor-grabbing text-slate-500 hover:text-amber-400 hover:bg-slate-800 transition-colors"
                      title="Drag directly onto battlemat grid to spawn"
                    >
                      <span class="text-sm select-none">⋮⋮</span>
                    </div>

                    <div class="min-w-0">
                      <div class="flex items-center gap-1.5">
                        <span class="font-bold text-xs text-slate-200 truncate capitalize">
                          {monster.name}
                        </span>
                        <span class="px-1 py-0.1 rounded bg-amber-950/80 border border-amber-500/40 text-amber-300 font-mono text-[9px] font-bold">
                          CR {monster.cr}
                        </span>
                      </div>
                      <div class="text-[9px] text-slate-400 flex items-center gap-1.5 truncate">
                        <span>{monster.size}</span>
                        <span>•</span>
                        <span>HP {monster.hp}</span>
                        <span>•</span>
                        <span>AC {monster.ac}</span>
                      </div>
                    </div>
                  </div>

                  <!-- Quick Actions -->
                  <div class="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onclick={() => (previewMonster = monster)}
                      class="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[10px] rounded transition-colors"
                      title="Inspect Statblock"
                    >
                      View
                    </button>
                    <button
                      type="button"
                      onclick={() => handleAddToEncounter(monster)}
                      class="px-2 py-0.5 font-bold text-[10px] rounded transition-all {justAddedId ===
                      monster.id
                        ? 'bg-emerald-600 text-white'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white'}"
                      title="Add to Encounter"
                    >
                      {justAddedId === monster.id ? '✓' : '+ Enc'}
                    </button>
                  </div>
                </div>
              {/each}
            {/if}
          </div>

          <!-- Drag instruction footer bar -->
          <div class="px-3 py-1.5 bg-slate-950 border-t border-slate-800/80 text-[10px] text-slate-400 flex items-center justify-between shrink-0">
            <span>Drag <strong class="text-amber-300">⋮⋮ handle</strong> directly onto canvas</span>
            <span class="text-slate-500">Auto-snaps to grid</span>
          </div>

          <!-- Bottom-Right Resize Handle -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            onmousedown={handleResizeMouseDown}
            class="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-end justify-end p-0.5 text-slate-600 hover:text-amber-400 select-none"
            title="Drag to resize window"
          >
            <svg class="w-2.5 h-2.5" viewBox="0 0 10 10" fill="currentColor">
              <path d="M9 9H7V7h2v2zm0-4H7V3h2v2zm-4 4H3V7h2v2z"/>
            </svg>
          </div>
        </div>
      {/if}
    </div>
  </div>

  <!-- Statblock Modal Preview Overlay -->
  {#if previewMonster}
    <div
      class="fixed inset-0 z-60 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      <StatblockView
        monster={previewMonster}
        onClose={() => (previewMonster = null)}
        onAddToEncounter={(m) => {
          handleAddToEncounter(m);
        }}
      />
    </div>
  {/if}
{/if}
