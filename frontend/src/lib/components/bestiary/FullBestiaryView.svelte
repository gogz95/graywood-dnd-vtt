<!-- src/lib/components/bestiary/FullBestiaryView.svelte -->
<!-- Full-Page 5e Bestiary Workspace with Multi-Attribute Filtering, Statblock Inspector, and Canvas/Combat/Cast Actions -->

<script lang="ts">
  import { onMount } from 'svelte';
  import { bestiaryStore } from '../../stores/bestiaryStore.svelte';
  import { compendiumStore } from '../../stores/compendiumStore.svelte';
  import type { CompendiumMonster } from '../../db/compendiumDb';
  import { canvasStore, type CanvasToken } from '../../../stores/canvasStore.svelte';
  import { encounterStore } from '../../stores/bestiaryStore.svelte';
  import { broadcaster } from '../../services/broadcaster';
  import StatblockView from './StatblockView.svelte';

  let selectedSource = $state('all');
  let minCr = $state(0);
  let maxCr = $state(30);
  let selectedType = $state('all');
  let selectedSize = $state('all');
  let searchQuery = $state('');

  let actionFeedback = $state<string | null>(null);

  const SIZE_OPTIONS = ['all', 'Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];
  const TYPE_OPTIONS = [
    'all',
    'Aberration',
    'Beast',
    'Celestial',
    'Construct',
    'Dragon',
    'Elemental',
    'Fey',
    'Fiend',
    'Giant',
    'Humanoid',
    'Monstrosity',
    'Ooze',
    'Plant',
    'Undead',
  ];

  let availableSources = $derived([
    'all',
    ...new Set(bestiaryStore.allMonsters.map(m => m.sourceBook || m.origin || 'SRD 5.1').filter(Boolean))
  ]);

  onMount(async () => {
    if (bestiaryStore.allMonsters.length === 0) {
      await bestiaryStore.init();
    }
    if (!bestiaryStore.activeMonster && bestiaryStore.allMonsters.length > 0) {
      bestiaryStore.activeMonster = bestiaryStore.allMonsters[0];
    }

    const reload = async () => {
      await bestiaryStore.refreshFromDb();
      await compendiumStore.refreshFromDb?.();
      if (!bestiaryStore.activeMonster && bestiaryStore.allMonsters.length > 0) {
        bestiaryStore.activeMonster = bestiaryStore.allMonsters[0];
      }
    };

    window.addEventListener('compendium:monsters-updated', reload);
    window.addEventListener('compendium:data-synchronized', reload);
    return () => {
      window.removeEventListener('compendium:monsters-updated', reload);
      window.removeEventListener('compendium:data-synchronized', reload);
    };
  });

  // Filtered monsters reactive derived
  let filteredList = $derived.by(() => {
    return bestiaryStore.allMonsters.filter(m => {
      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesText =
          m.name.toLowerCase().includes(q) ||
          m.type.toLowerCase().includes(q) ||
          (m.size && m.size.toLowerCase().includes(q));
        if (!matchesText) return false;
      }

      // CR range
      if (m.cr < minCr || m.cr > maxCr) return false;

      // Type
      if (selectedType !== 'all' && !m.type.toLowerCase().includes(selectedType.toLowerCase())) {
        return false;
      }

      // Size
      if (selectedSize !== 'all' && (!m.size || m.size.toLowerCase() !== selectedSize.toLowerCase())) {
        return false;
      }

      // Sourcebook
      if (selectedSource !== 'all') {
        const monsterSource = m.sourceBook || m.origin || 'SRD 5.1';
        if (monsterSource !== selectedSource) {
          return false;
        }
      }

      return true;
    });
  });

  function formatCr(cr: number): string {
    if (cr === 0.125) return '1/8';
    if (cr === 0.25) return '1/4';
    if (cr === 0.5) return '1/2';
    return cr.toString();
  }

  function showFeedback(msg: string) {
    actionFeedback = msg;
    setTimeout(() => {
      if (actionFeedback === msg) actionFeedback = null;
    }, 2500);
  }

  // 1. Spawn Token to Canvas
  function handleSpawnToken(m: CompendiumMonster) {
    const sizeMap: Record<string, number> = {
      Tiny: 1,
      Small: 1,
      Medium: 1,
      Large: 2,
      Huge: 3,
      Gargantuan: 4,
    };
    const sizeInCells = sizeMap[m.size] || 1;

    // Place near center or random cell
    const gx = Math.floor(Math.random() * 8) + 4;
    const gy = Math.floor(Math.random() * 8) + 4;

    const newToken: CanvasToken = {
      id: `token-mon-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: m.name,
      x: gx,
      y: gy,
      color: '#ef4444',
      isPlayer: false,
      hp: m.hp || 10,
      maxHp: m.hp || 10,
      ac: m.ac || 10,
      isVisible: true,
      conditions: [],
      isOrbSealed: false,
      sizeInCells,
      sightRadiusFeet: 30,
    };

    canvasStore.setTokens([...canvasStore.tokens, newToken]);
    showFeedback(`Spawned token for "${m.name}" (${sizeInCells}x${sizeInCells}) on Tactical Canvas!`);
  }

  // 2. Add to Combat Tracker
  function handleAddToCombat(m: CompendiumMonster) {
    encounterStore.addCombatant(m);
    showFeedback(`Added "${m.name}" to Active Combat Tracker!`);
  }

  // 3. Cast Artwork to Players
  function handleCastArtwork(m: CompendiumMonster) {
    // Construct artwork or fallback statcard URL
    const payload = {
      mediaId: `monster-${m.id}`,
      url: `https://raw.githubusercontent.com/5etools-mirror-3/5etools-img/main/bestiary/tokens/${encodeURIComponent(m.name)}.webp`,
      title: m.name,
      caption: `CR ${formatCr(m.cr)} ${m.size} ${m.type} · AC ${m.ac} · HP ${m.hp}`,
    };
    broadcaster.showHandout(payload);
    showFeedback(`Casting "${m.name}" artwork to Player & Projector screens!`);
  }
</script>

<div class="w-full h-full flex bg-slate-950 text-slate-100 overflow-hidden select-none">
  <!-- ═════════════════════════════════════════════════════════════════════════
       LEFT PANE: FILTERS & MONSTER LIST (320px)
  ══════════════════════════════════════════════════════════════════════════ -->
  <aside class="w-80 border-r border-slate-800 bg-slate-900/90 flex flex-col shrink-0">
    <!-- Header & Search -->
    <div class="p-4 border-b border-slate-800 space-y-3 shrink-0">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-xl">🐉</span>
          <h2 class="text-xs font-black uppercase tracking-wider text-slate-200">5e Bestiary</h2>
        </div>
        <span class="text-[10px] font-mono text-slate-500">{filteredList.length} Found</span>
      </div>

      <!-- Search Input -->
      <div class="relative">
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search name, type, size…"
          class="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
        />
        <span class="absolute left-2.5 top-2 text-slate-500 text-xs">🔍</span>
      </div>
    </div>

    <!-- Multi-Attribute Filters Accordion -->
    <div class="p-3 border-b border-slate-800/80 bg-slate-950/40 space-y-2.5 text-[11px] shrink-0">
      <!-- CR Range -->
      <div class="space-y-1">
        <div class="flex justify-between text-slate-400 font-bold">
          <span>CR Range</span>
          <span class="text-indigo-400 font-mono">CR {minCr} – {maxCr}</span>
        </div>
        <div class="flex items-center gap-2">
          <input
            type="range"
            min="0"
            max="30"
            step="1"
            bind:value={minCr}
            class="w-full accent-indigo-500 h-1 bg-slate-800 rounded"
          />
          <input
            type="range"
            min="0"
            max="30"
            step="1"
            bind:value={maxCr}
            class="w-full accent-indigo-500 h-1 bg-slate-800 rounded"
          />
        </div>
      </div>

      <!-- Monster Type & Size Dropdowns -->
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label for="filter-type-select" class="text-slate-400 font-bold block mb-1">Type</label>
          <select
            id="filter-type-select"
            bind:value={selectedType}
            class="w-full bg-slate-900 border border-slate-800 rounded p-1 text-[10px] text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            {#each TYPE_OPTIONS as t}
              <option value={t}>{t === 'all' ? 'All Types' : t}</option>
            {/each}
          </select>
        </div>

        <div>
          <label for="filter-size-select" class="text-slate-400 font-bold block mb-1">Size</label>
          <select
            id="filter-size-select"
            bind:value={selectedSize}
            class="w-full bg-slate-900 border border-slate-800 rounded p-1 text-[10px] text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            {#each SIZE_OPTIONS as s}
              <option value={s}>{s === 'all' ? 'All Sizes' : s}</option>
            {/each}
          </select>
        </div>
      </div>

      <!-- Sourcebook Filter -->
      <div>
        <label for="filter-source-select" class="text-slate-400 font-bold block mb-1">Sourcebook</label>
        <select
          id="filter-source-select"
          bind:value={selectedSource}
          class="w-full bg-slate-900 border border-slate-800 rounded p-1 text-[10px] text-slate-200 focus:outline-none focus:border-indigo-500"
        >
          {#each availableSources as src}
            <option value={src}>{src === 'all' ? 'All Sources' : src}</option>
          {/each}
        </select>
      </div>
    </div>

    <!-- Virtualized Monster List -->
    <div class="flex-1 overflow-y-auto divide-y divide-slate-800/40">
      {#each filteredList as m (m.id)}
        {@const isSelected = bestiaryStore.activeMonster?.id === m.id}
        <button
          type="button"
          onclick={() => bestiaryStore.activeMonster = m}
          class="w-full text-left p-2.5 flex items-center justify-between hover:bg-slate-800/60 transition-colors {isSelected ? 'bg-indigo-950/60 border-l-2 border-indigo-500' : ''}"
        >
          <div class="min-w-0 flex-1 pr-2">
            <span class="font-bold text-xs text-slate-200 block truncate">{m.name}</span>
            <span class="text-[10px] text-slate-400 block truncate">
              {m.size || 'Medium'} {m.type}
            </span>
          </div>
          <div class="text-right shrink-0">
            <span class="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] font-bold text-amber-300">
              CR {formatCr(m.cr)}
            </span>
          </div>
        </button>
      {:else}
        <div class="p-6 text-center text-slate-500 text-xs">
          No creatures match the selected filters.
        </div>
      {/each}
    </div>
  </aside>

  <!-- ═════════════════════════════════════════════════════════════════════════
       RIGHT WORKSPACE: STATBLOCK & ACTIONS
  ══════════════════════════════════════════════════════════════════════════ -->
  <main class="flex-1 min-w-0 flex flex-col bg-slate-950 overflow-hidden">
    {#if bestiaryStore.activeMonster}
      {@const monster = bestiaryStore.activeMonster}
      <!-- Action Command Bar -->
      <div class="px-6 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-3">
          <h1 class="font-black text-sm text-slate-100 uppercase tracking-wider">{monster.name}</h1>
          <span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-bold">
            CR {formatCr(monster.cr)}
          </span>
          <span class="text-xs text-slate-400">
            AC {monster.ac} · HP {monster.hp}
          </span>
        </div>

        <!-- 3 Primary Action Buttons -->
        <div class="flex items-center gap-2">
          <!-- Spawn Token to Canvas -->
          <button
            type="button"
            onclick={() => handleSpawnToken(monster)}
            class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-xs transition-all shadow flex items-center gap-1.5 active:scale-95"
            title="Spawn creature onto active battlemap grid with matching cell size"
          >
            <span>♟️</span>
            <span>Spawn Token to Canvas</span>
          </button>

          <!-- Add to Combat Tracker -->
          <button
            type="button"
            onclick={() => handleAddToCombat(monster)}
            class="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold text-xs transition-all shadow flex items-center gap-1.5 active:scale-95"
            title="Push creature and initiative roll to combat tracker"
          >
            <span>⚔️</span>
            <span>Add to Combat Tracker</span>
          </button>

          <!-- Cast Artwork to Players -->
          <button
            type="button"
            onclick={() => handleCastArtwork(monster)}
            class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs transition-all shadow flex items-center gap-1.5 active:scale-95"
            title="Broadcast creature artwork or portrait to Player and Projector screens"
          >
            <span>📡</span>
            <span>Cast Artwork to Players</span>
          </button>
        </div>
      </div>

      <!-- Action Notification Feedback Banner -->
      {#if actionFeedback}
        <div class="px-6 py-2 bg-emerald-950/80 border-b border-emerald-800 text-emerald-300 text-xs font-semibold flex items-center justify-between animate-in fade-in">
          <div class="flex items-center gap-2">
            <span>✓</span>
            <span>{actionFeedback}</span>
          </div>
          <button
            type="button"
            onclick={() => actionFeedback = null}
            class="text-emerald-400 hover:text-white text-xs"
          >
            ✕
          </button>
        </div>
      {/if}

      <!-- Authentic 5e Statblock Inspector Body -->
      <div class="flex-1 overflow-y-auto p-6 flex justify-center">
        <div class="w-full max-w-2xl bg-amber-50/5 rounded-2xl border border-slate-800/80 p-4 shadow-xl">
          <StatblockView
            {monster}
            onAddToEncounter={() => handleAddToCombat(monster)}
          />
        </div>
      </div>
    {:else}
      <div class="flex-1 flex flex-col items-center justify-center text-slate-500 p-8 text-center">
        <span class="text-4xl mb-3">🐉</span>
        <h3 class="text-sm font-bold text-slate-400">Select a Creature</h3>
        <p class="text-xs text-slate-500 mt-1 max-w-sm">
          Pick a monster from the list on the left to inspect its complete 5e statblock, roll attacks, spawn tokens, or cast portraits to players.
        </p>
      </div>
    {/if}
  </main>
</div>
