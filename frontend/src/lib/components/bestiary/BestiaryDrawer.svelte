<!-- src/lib/components/bestiary/BestiaryDrawer.svelte -->
<!-- Slide-Over Bestiary Browser Drawer with live filtering, statblock preview, and drag-to-canvas token spawning -->

<script lang="ts">
  import { bestiaryStore, encounterStore } from '../../stores/bestiaryStore.svelte';
  import type { CompendiumMonster } from '../../db/compendiumDb';
  import StatblockView from './StatblockView.svelte';

  let {
    isOpen = $bindable(false),
    onClose = () => {}
  }: {
    isOpen?: boolean;
    onClose?: () => void;
  } = $props();

  let previewMonster = $state<CompendiumMonster | null>(null);
  let justAddedId = $state<string | null>(null);

  const CR_OPTIONS = [
    { label: 'All CR', value: 'all' },
    { label: 'CR 1/8', value: '1/8' },
    { label: 'CR 1/4', value: '1/4' },
    { label: 'CR 1/2', value: '1/2' },
    { label: 'CR 1', value: '1' },
    { label: 'CR 2', value: '2' },
    { label: 'CR 3', value: '3' },
    { label: 'CR 5', value: '5' }
  ];

  const TYPE_OPTIONS = [
    'all',
    'Humanoid',
    'Undead',
    'Beast',
    'Giant',
    'Fiend',
    'Dragon',
    'Monstrosity'
  ];

  function handleDragStart(event: DragEvent, m: CompendiumMonster) {
    if (!event.dataTransfer) return;
    const payload = {
      type: 'MONSTER_TOKEN',
      monsterId: m.id,
      name: m.name,
      hp: m.hp,
      ac: m.ac,
      size: m.size || 'Medium',
      color: '#ef4444'
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
</script>

{#if isOpen}
  <!-- Drawer Backdrop -->
  <div
    class="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs transition-opacity"
    onclick={onClose}
    role="presentation"
  ></div>

  <!-- Main Drawer Panel -->
  <div
    class="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
    role="dialog"
    aria-label="Bestiary Monster Compendium"
  >
    <!-- Header -->
    <div class="px-5 py-3.5 border-b border-slate-800 bg-slate-950 flex items-center justify-between shrink-0">
      <div class="flex items-center gap-2">
        <span class="text-xl">🐉</span>
        <h2 class="text-sm font-black text-slate-100 uppercase tracking-wider">5e Bestiary Compendium</h2>
      </div>
      <button
        type="button"
        onclick={onClose}
        class="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-100 flex items-center justify-center font-bold text-sm transition-colors"
        aria-label="Close Bestiary Drawer"
      >
        ✕
      </button>
    </div>

    <!-- Search & Filter Controls -->
    <div class="p-4 border-b border-slate-800 bg-slate-900/90 space-y-3 shrink-0">
      <div class="relative">
        <input
          type="text"
          bind:value={bestiaryStore.searchQuery}
          placeholder="Search monsters, beasts, undead..."
          class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
        />
        {#if bestiaryStore.searchQuery}
          <button
            type="button"
            onclick={() => bestiaryStore.searchQuery = ''}
            class="absolute right-2.5 top-2 text-xs text-slate-500 hover:text-slate-300"
          >
            ✕
          </button>
        {/if}
      </div>

      <!-- CR Filter Chips -->
      <div class="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] font-bold scrollbar-none">
        {#each CR_OPTIONS as crOpt}
          <button
            type="button"
            onclick={() => bestiaryStore.selectedCr = crOpt.value}
            class="px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap {bestiaryStore.selectedCr === crOpt.value
              ? 'bg-amber-500 text-slate-950 font-black'
              : 'bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-slate-200'}"
          >
            {crOpt.label}
          </button>
        {/each}
      </div>

      <!-- Type Filter Chips -->
      <div class="flex items-center gap-1.5 overflow-x-auto pb-1 text-[10px] font-bold scrollbar-none">
        {#each TYPE_OPTIONS as tOpt}
          <button
            type="button"
            onclick={() => bestiaryStore.selectedType = tOpt}
            class="px-2 py-0.5 rounded transition-colors whitespace-nowrap capitalize {bestiaryStore.selectedType === tOpt
              ? 'bg-indigo-600 text-white font-black'
              : 'bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200'}"
          >
            {tOpt === 'all' ? 'All Types' : tOpt}
          </button>
        {/each}
      </div>
    </div>

    <!-- Monster List -->
    <div class="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-thin">
      {#if bestiaryStore.isLoading}
        <div class="p-8 text-center text-xs text-slate-500">
          Loading 5e SRD Bestiary...
        </div>
      {:else if bestiaryStore.filteredMonsters.length === 0}
        <div class="p-8 text-center text-xs text-slate-500 space-y-1">
          <p class="text-xl">🔍</p>
          <p>No monsters matching filter.</p>
        </div>
      {:else}
        {#each bestiaryStore.filteredMonsters as monster (monster.id)}
          <div
            class="p-3 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl flex items-center justify-between gap-3 transition-colors group"
          >
            <!-- Drag Handle & Name info -->
            <div class="flex items-center gap-2.5 min-w-0">
              <!-- Drag Handle -->
              <div
                role="button"
                tabindex="0"
                aria-label={`Drag ${monster.name} onto Canvas`}
                draggable="true"
                ondragstart={(e) => handleDragStart(e, monster)}
                class="w-6 h-8 flex items-center justify-center rounded cursor-grab active:cursor-grabbing text-slate-600 hover:text-amber-400 hover:bg-slate-900 transition-colors"
                title="Drag onto Canvas to Spawn Token"
              >
                <span class="text-sm select-none">⋮⋮</span>
              </div>

              <!-- Monster Meta -->
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <span class="font-bold text-xs text-slate-200 truncate capitalize">{monster.name}</span>
                  <span class="px-1.5 py-0.2 rounded bg-amber-950/80 border border-amber-500/40 text-amber-300 font-mono text-[9px] font-bold">
                    CR {monster.cr}
                  </span>
                </div>
                <div class="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2 truncate">
                  <span>{monster.size} {monster.type}</span>
                  <span>•</span>
                  <span>HP {monster.hp}</span>
                  <span>•</span>
                  <span>AC {monster.ac}</span>
                </div>
              </div>
            </div>

            <!-- Action Buttons -->
            <div class="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onclick={() => previewMonster = monster}
                class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[11px] rounded-lg transition-colors"
                title="Inspect 5e Statblock"
              >
                View
              </button>
              <button
                type="button"
                onclick={() => handleAddToEncounter(monster)}
                class="px-2.5 py-1 font-bold text-[11px] rounded-lg transition-all flex items-center gap-1 {
                  justAddedId === monster.id
                    ? 'bg-emerald-600 text-white'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white active:scale-95 shadow'
                }"
                title="Add to Current Combat Encounter"
              >
                {#if justAddedId === monster.id}
                  <span>✓ Added</span>
                {:else}
                  <span>+ Encounter</span>
                {/if}
              </button>
            </div>
          </div>
        {/each}
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
        onClose={() => previewMonster = null}
        onAddToEncounter={(m) => {
          handleAddToEncounter(m);
        }}
      />
    </div>
  {/if}
{/if}
