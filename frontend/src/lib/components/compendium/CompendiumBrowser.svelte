<script lang="ts">
  import { onMount } from 'svelte';
  import Icons from '../../../components/Icons.svelte';

  export interface CompendiumClass {
    id: string;
    name: string;
    hit_die: string;
    primary_ability: string;
    saving_throws: string;
  }

  export interface CompendiumSpell {
    id: string;
    name: string;
    level: number;
    school: string;
    casting_time: string;
    range: string;
    components: string;
    duration: string;
    description: string;
    classes: string;
  }

  let activeTab = $state<'spells' | 'classes' | 'lore'>('spells');
  let spells = $state<CompendiumSpell[]>([]);
  let classes = $state<CompendiumClass[]>([]);
  let searchQuery = $state('');
  let selectedLevel = $state<number | null>(null);
  let selectedClass = $state<string>('');
  let isLoading = $state(true);

  onMount(async () => {
    await Promise.all([loadSpells(), loadClasses()]);
    isLoading = false;
  });

  async function loadClasses() {
    try {
      const res = await fetch('/api/compendium/classes');
      if (res.ok) {
        classes = await res.json();
      }
    } catch (err) {
      console.error('Failed fetching classes:', err);
    }
  }

  async function loadSpells() {
    try {
      let url = '/api/compendium/spells';
      const params = new URLSearchParams();
      if (selectedLevel !== null) params.append('level', selectedLevel.toString());
      if (selectedClass) params.append('class', selectedClass);
      if (params.toString()) url += `?${params.toString()}`;

      const res = await fetch(url);
      if (res.ok) {
        spells = await res.json();
      }
    } catch (err) {
      console.error('Failed fetching spells:', err);
    }
  }

  function handleFilterChange() {
    loadSpells();
  }

  let filteredSpells = $derived(
    spells.filter(
      (s) =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.school.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  let filteredClasses = $derived(
    classes.filter((c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.primary_ability.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );
</script>

<div class="space-y-6">
  <!-- Top Compendium Header & Sub-Navigation -->
  <div class="bg-dark-900 border border-amber-900/40 rounded-2xl p-4 shadow-xl">
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
          <Icons name="book" size={18} />
        </div>
        <div>
          <h2 class="text-base font-black text-slate-100 uppercase tracking-tight font-serif">
            Standard 5e Compendium & Codex
          </h2>
          <p class="text-xs text-amber-200/60">
            SRD 5.1 & 5.2 Spells, Classes, Equipment, and Rules
          </p>
        </div>
      </div>

      <!-- Tab Switcher -->
      <div class="flex items-center gap-1.5 p-1 bg-dark-950 border border-dark-800 rounded-xl">
        <button
          onclick={() => (activeTab = 'spells')}
          class="px-3 py-1.5 rounded-lg text-xs font-bold transition-all {
            activeTab === 'spells'
              ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }"
        >
          Spells ({spells.length})
        </button>
        <button
          onclick={() => (activeTab = 'classes')}
          class="px-3 py-1.5 rounded-lg text-xs font-bold transition-all {
            activeTab === 'classes'
              ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }"
        >
          Classes ({classes.length})
        </button>
      </div>
    </div>
  </div>

  <!-- Search & Filter Controls -->
  <div class="bg-dark-900 border border-dark-800 rounded-2xl p-4 space-y-3">
    <div class="flex flex-col sm:flex-row items-center gap-3">
      <!-- Search Input -->
      <div class="relative flex-1 w-full">
        <input
          type="text"
          placeholder="Search spell name, school, description, class..."
          bind:value={searchQuery}
          class="w-full bg-dark-950 border border-dark-700 focus:border-amber-500 text-slate-200 text-xs pl-8 pr-3 py-2 rounded-xl focus:outline-none"
        />
        <div class="absolute left-2.5 top-2.5 text-slate-400 pointer-events-none">
          <Icons name="search" size={14} />
        </div>
      </div>

      {#if activeTab === 'spells'}
        <!-- Spell Level Filter -->
        <select
          bind:value={selectedLevel}
          onchange={handleFilterChange}
          class="bg-dark-950 border border-dark-700 text-slate-300 text-xs px-3 py-2 rounded-xl focus:outline-none w-full sm:w-40"
        >
          <option value={null}>All Levels</option>
          <option value={0}>Cantrips (0th)</option>
          {#each [1, 2, 3, 4, 5, 6, 7, 8, 9] as lvl}
            <option value={lvl}>Level {lvl}</option>
          {/each}
        </select>

        <!-- Spell Class Filter -->
        <select
          bind:value={selectedClass}
          onchange={handleFilterChange}
          class="bg-dark-950 border border-dark-700 text-slate-300 text-xs px-3 py-2 rounded-xl focus:outline-none w-full sm:w-44"
        >
          <option value="">All Classes</option>
          <option value="Wizard">Wizard</option>
          <option value="Cleric">Cleric</option>
          <option value="Paladin">Paladin</option>
          <option value="Druid">Druid</option>
          <option value="Sorcerer">Sorcerer</option>
          <option value="Warlock">Warlock</option>
          <option value="Bard">Bard</option>
        </select>
      {/if}
    </div>
  </div>

  <!-- Content Results Grid -->
  {#if activeTab === 'spells'}
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      {#each filteredSpells as spell}
        <div class="bg-dark-900 border border-dark-800 hover:border-amber-500/50 rounded-2xl p-4 space-y-2.5 transition-colors group shadow-md">
          <div class="flex items-start justify-between gap-2">
            <div>
              <h3 class="font-bold text-sm text-slate-100 font-serif group-hover:text-amber-300 transition-colors">
                {spell.name}
              </h3>
              <p class="text-[11px] text-amber-200/60 font-serif italic">
                {spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`} &bull; {spell.school}
              </p>
            </div>
            <span class="px-2 py-0.5 rounded bg-dark-800 border border-dark-700 text-amber-300 font-mono font-bold text-[10px]">
              {spell.classes}
            </span>
          </div>

          <div class="grid grid-cols-2 gap-2 text-[10px] font-mono bg-dark-950 p-2.5 rounded-xl border border-dark-800 text-slate-400">
            <div><span class="text-slate-500">Cast:</span> {spell.casting_time}</div>
            <div><span class="text-slate-500">Range:</span> {spell.range}</div>
            <div><span class="text-slate-500">Dur:</span> {spell.duration}</div>
            <div><span class="text-slate-500">Comp:</span> {spell.components}</div>
          </div>

          <p class="text-xs text-slate-300 leading-relaxed font-sans">
            {spell.description}
          </p>
        </div>
      {/each}
    </div>
  {:else}
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each filteredClasses as cls}
        <div class="bg-dark-900 border border-dark-800 hover:border-amber-500/50 rounded-2xl p-4 space-y-3 transition-colors shadow-md">
          <div class="flex items-center justify-between">
            <h3 class="font-bold text-base text-slate-100 font-serif">
              {cls.name}
            </h3>
            <span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono font-bold text-xs">
              HD {cls.hit_die}
            </span>
          </div>

          <div class="space-y-1.5 text-xs text-slate-300">
            <div class="flex justify-between border-b border-dark-800 pb-1">
              <span class="text-slate-400">Primary Ability:</span>
              <span class="font-bold text-slate-200">{cls.primary_ability}</span>
            </div>
            <div class="flex justify-between border-b border-dark-800 pb-1">
              <span class="text-slate-400">Saving Throws:</span>
              <span class="font-mono text-amber-300">{cls.saving_throws}</span>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
