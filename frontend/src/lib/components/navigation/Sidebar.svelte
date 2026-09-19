<script module lang="ts">
  export type DmTab = 'party' | 'encounter' | 'battlemat' | 'archivist' | 'compendium' | 'calendar' | 'atlas';

  export interface SidebarTab {
    id: DmTab;
    icon: string;
    label: string;
    title: string;
  }
</script>

<script lang="ts">
  // Sidebar.svelte — Vertical DM navigation dock with Atlas hub integration

  let {
    activeTab = $bindable<DmTab>('encounter'),
    onSelectTab,
  }: {
    activeTab?: DmTab;
    onSelectTab?: (tab: DmTab) => void;
  } = $props();

  const TABS: SidebarTab[] = [
    { id: 'party',      icon: '👥', label: 'Party',      title: 'Party Roster & Character Management' },
    { id: 'encounter',  icon: '⚔️', label: 'Combat',     title: 'Encounter & Turn Tracker' },
    { id: 'battlemat',  icon: '🗺️', label: 'Battle Mat', title: 'Tactical Battle Mat & Grid' },
    { id: 'archivist',  icon: '📖', label: 'AI Hub',     title: 'Rules Archivist & DM Co-Pilot' },
    { id: 'compendium', icon: '📚', label: 'Compendium', title: '5e / 5.5e SRD Compendium Browser' },
    { id: 'calendar',   icon: '📅', label: 'Calendar',   title: 'Campaign Calendar & Timekeeping' },
    { id: 'atlas',      icon: '🧭', label: 'Atlas',      title: 'World Atlas & External Tools Hub' },
  ];

  function selectTab(id: DmTab) {
    activeTab = id;
    onSelectTab?.(id);
  }
</script>

<aside class="w-14 bg-slate-900 border-r border-slate-800 flex flex-col items-center py-3 gap-1.5 z-10 shrink-0 select-none">
  {#each TABS as tab}
    <button
      type="button"
      title={tab.title}
      onclick={() => selectTab(tab.id)}
      class="w-10 h-10 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all text-sm relative group
        {activeTab === tab.id
          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}"
    >
      <span class="text-base leading-none transition-transform group-hover:scale-110">{tab.icon}</span>
      <span class="text-[8px] font-bold uppercase tracking-wide leading-none">{tab.label}</span>
      {#if activeTab === tab.id}
        <span class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-indigo-300 rounded-r-full"></span>
      {/if}
    </button>
  {/each}

  <!-- Separator + Secondary Economy / Settlement Tool -->
  <div class="w-6 h-px bg-slate-800 my-1"></div>
  <button
    type="button"
    title="Economy & Strongholds (Secondary)"
    class="w-10 h-10 rounded-xl flex flex-col items-center justify-center gap-0.5 text-slate-600 hover:bg-slate-800 hover:text-slate-400 transition-all"
  >
    <span class="text-base leading-none">🪙</span>
    <span class="text-[8px] font-bold uppercase tracking-wide leading-none">Econ</span>
  </button>
</aside>
