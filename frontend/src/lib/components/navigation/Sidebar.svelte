<script module lang="ts">
  export type DmTab =
    | 'party'
    | 'encounter'
    | 'battlemat'
    | 'alchemy'
    | 'guild'
    | 'stronghold'
    | 'lore'
    | 'handouts';

  export interface SidebarTab {
    id: DmTab;
    icon: string;
    label: string;
    title: string;
  }
</script>

<script lang="ts">
  // Sidebar.svelte — Primary Workspace DM Navigation Rail
  // 1. Party & Characters
  // 2. Encounter & Combat
  // 3. Tactical Mat
  // 4. Alchemy & Crafting
  // 5. Guild Notice Board
  // 6. Stronghold / Keep Manager
  // 7. Lore Wiki
  // 8. Handout Studio

  let {
    activeTab = $bindable<DmTab>('encounter'),
    onSelectTab,
  }: {
    activeTab?: DmTab;
    onSelectTab?: (tab: DmTab) => void;
  } = $props();

  const TABS: SidebarTab[] = [
    { id: 'party',      icon: '👥', label: 'Party',      title: 'Active Party Roster & PIN Controls' },
    { id: 'encounter',  icon: '⚔️', label: 'Combat',     title: 'Encounter & Initiative Tracker' },
    { id: 'battlemat',  icon: '🗺️', label: 'Tactical',   title: 'Tactical Mat (PixiJS Canvas)' },
    { id: 'alchemy',    icon: '⚗️', label: 'Crafting',   title: 'Alchemy Lab & Crafting Workbench' },
    { id: 'guild',      icon: '📋', label: 'Guild',      title: 'Adventurers\' Guild Notice Board' },
    { id: 'stronghold', icon: '🏰', label: 'Keep',       title: 'Stronghold Manager & Holdings' },
    { id: 'lore',       icon: '📚', label: 'Lore',       title: 'Lore Wiki & Compendium' },
    { id: 'handouts',   icon: '📜', label: 'Handouts',   title: 'Parchment Handout Studio & Broadcast' },
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
</aside>
