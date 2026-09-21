<!-- src/lib/components/navigation/Sidebar.svelte -->
<!-- Context-Aware Workspace DM Navigation Rail with Consolidated Holdings & Downtime -->

<script module lang="ts">
  export type DmTab =
    | 'party'
    | 'encounter'
    | 'battlemat'
    | 'holdings'
    | 'lore'
    | 'handouts'
    | 'layers'
    | 'fog'
    | 'ruler'
    | 'poi'
    | 'pacing'
    | 'factions';

  export interface SidebarItem {
    id: DmTab;
    icon: string;
    label: string;
    title: string;
    isAction?: boolean;
  }
</script>

<script lang="ts">
  import { uiStore } from '../../stores/uiStore.svelte';

  let {
    activeTab = $bindable<DmTab>('encounter'),
    onSelectTab,
  }: {
    activeTab?: DmTab;
    onSelectTab?: (tab: DmTab) => void;
  } = $props();

  let activeTool = $state<string | null>(null);

  // Context-Aware Sidebar Tabs (Part 3.2)
  let currentTabs = $derived.by<SidebarItem[]>(() => {
    const view = uiStore.activeView;

    if (view === 'canvas') {
      return [
        { id: 'encounter', icon: '⚔️', label: 'Combat',   title: 'Encounter & Initiative Tracker' },
        { id: 'layers',    icon: '🥞', label: 'Layers',   title: 'Toggle Map Layers & Token Visibility', isAction: true },
        { id: 'fog',       icon: '🌫️', label: 'Fog',      title: 'Fog of War Carving & Concealing Tools', isAction: true },
        { id: 'ruler',     icon: '📏', label: 'Ruler',    title: 'Measurement Ruler & Grid Distance', isAction: true },
        { id: 'holdings',  icon: '🏰', label: 'Holdings', title: 'Stronghold, Guild Hall & Downtime Crafting' },
      ];
    }

    if (view === 'atlas') {
      return [
        { id: 'poi',      icon: '📍', label: 'Markers',  title: 'Points of Interest & Settlement Pins', isAction: true },
        { id: 'pacing',   icon: '⏱️', label: 'Pacing',   title: 'Overland Route Pacing & Travel Days', isAction: true },
        { id: 'factions', icon: '🚩', label: 'Factions', title: 'Kingdom Borders & Political Factions', isAction: true },
        { id: 'holdings', icon: '🏰', label: 'Holdings', title: 'Stronghold, Guild Hall & Downtime Crafting' },
      ];
    }

    // Default minimal quick-drawers for Bestiary, Compendium, Party, Journal
    return [
      { id: 'encounter', icon: '⚔️', label: 'Combat',   title: 'Encounter & Combat Tracker' },
      { id: 'party',     icon: '👥', label: 'Party',    title: 'Party Overview & Stash' },
      { id: 'holdings',  icon: '🏰', label: 'Holdings', title: 'Unified Holdings & Downtime' },
    ];
  });

  function handleTabClick(item: SidebarItem) {
    if (item.isAction) {
      activeTool = activeTool === item.id ? null : item.id;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vtt:context-tool', { detail: { tool: item.id, active: activeTool === item.id } }));
      }
      return;
    }

    activeTab = item.id;
    onSelectTab?.(item.id);
  }
</script>

<aside class="w-14 bg-slate-900 border-r border-slate-800 flex flex-col items-center py-3 gap-1.5 z-10 shrink-0 select-none">
  {#each currentTabs as tab (tab.id)}
    {@const isSelected = (!tab.isAction && activeTab === tab.id) || (tab.isAction && activeTool === tab.id)}
    <button
      type="button"
      title={tab.title}
      onclick={() => handleTabClick(tab)}
      class="w-10 h-10 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all text-sm relative group
        {isSelected
          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}"
    >
      <span class="text-base leading-none transition-transform group-hover:scale-110">{tab.icon}</span>
      <span class="text-[7.5px] font-bold uppercase tracking-wide leading-none">{tab.label}</span>
      {#if isSelected}
        <span class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-indigo-300 rounded-r-full"></span>
      {/if}
    </button>
  {/each}
</aside>
