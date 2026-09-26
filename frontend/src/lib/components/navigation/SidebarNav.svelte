<!-- src/lib/components/navigation/SidebarNav.svelte -->
<!-- Unified Dark-Themed Collapsible Multi-Level Sidebar Accordion Navigation -->

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
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import NavAccordionGroup, { type NavGroup, type NavItem } from './NavAccordionGroup.svelte';
  import { uiStore } from '../../stores/uiStore.svelte';
  import { floatingWindowsStore } from '../../stores/floatingWindowsStore.svelte';
  import { compendiumStore } from '../../stores/compendiumStore.svelte';
  import { ingestPipelineStore } from '../../services/ingest/ingestPipelineStore.svelte';
  import { assetBrowserStore } from '../../stores/assetBrowserStore.svelte';

  let {
    activeTab = $bindable<DmTab>('party'),
    dmMapMode = $bindable<'tactical' | 'atlas'>('tactical'),
    onSelectTab,
  }: {
    activeTab?: DmTab;
    dmMapMode?: 'tactical' | 'atlas';
    onSelectTab?: (tab: DmTab) => void;
  } = $props();

  // Screen Real Estate: Docked icon-rail mode vs. fully expanded navigation panel
  let isCollapsed = $state(false);

  // Active leaf identifier for highlighted route state
  let activeItemId = $state<string>('canvas:battlemaps');

  // Accordion open/close branch states
  let openBranches = $state<Record<string, boolean>>({
    canvas: true,
    atlas: false,
    bestiary: false,
    compendium: false,
    party: false,
    journal: false,
  });

  // Hierarchical Navigation Tree with dynamic liveQuery counters
  const navSections: NavGroup[] = $derived([
    {
      id: 'canvas',
      label: 'Tactical Canvas',
      icon: '⚔️',
      defaultChildId: 'canvas:battlemaps',
      children: [
        { id: 'canvas:battlemaps', label: 'Battlemaps', icon: '🗺️', badge: 'Pixi' },
        { id: 'canvas:grid', label: 'Grid Calibration', icon: '📏' },
        { id: 'canvas:fog', label: 'Vision & Fog', icon: '🌫️' },
        { id: 'canvas:layers', label: 'Floor Layers', icon: '🥞' },
        { id: 'canvas:assets', label: 'Image Browser', icon: '🖼️', badge: assetBrowserStore.assets.length ? `${assetBrowserStore.assets.length}` : undefined },
      ],
    },
    {
      id: 'atlas',
      label: 'World Atlas',
      icon: '🗺️',
      defaultChildId: 'atlas:realm',
      children: [
        { id: 'atlas:realm', label: 'Realm Maps', icon: '🌍' },
        { id: 'atlas:regions', label: 'Regions', icon: '🚩' },
        { id: 'atlas:poi', label: 'Points of Interest', icon: '📍' },
      ],
    },
    {
      id: 'bestiary',
      label: 'Bestiary',
      icon: '🐉',
      defaultChildId: 'bestiary:monsters',
      children: [
        { id: 'bestiary:monsters', label: 'Monster Manual', icon: '📖', badge: `${compendiumStore.monsterCount}` },
        { id: 'bestiary:npcs', label: 'Custom NPCs', icon: '👤' },
        { id: 'bestiary:encounters', label: 'Encounter Builder', icon: '⚔️' },
      ],
    },
    {
      id: 'compendium',
      label: 'Compendium',
      icon: '📚',
      defaultChildId: 'compendium:spells',
      children: [
        { id: 'compendium:spells', label: 'Spells', icon: '✨', badge: `${compendiumStore.spellCount}` },
        { id: 'compendium:items', label: 'Equipment & Items', icon: '🛡️', badge: `${compendiumStore.itemCount}` },
        { id: 'compendium:rules', label: 'Sourcebook Rules', icon: '📜' },
        { id: 'compendium:unlocks', label: 'Unlocks', icon: '🔓' },
        { id: 'compendium:ingest', label: 'Asset Ingest Pipeline', icon: '📥', badge: 'Crawler' },
      ],
    },
    {
      id: 'party',
      label: 'Party & Roster',
      icon: '👥',
      defaultChildId: 'party:characters',
      children: [
        { id: 'party:characters', label: 'Player Characters', icon: '🧑‍🤝‍🧑' },
        { id: 'party:allies', label: 'NPC Allies', icon: '🤝' },
        { id: 'party:combat', label: 'Combat Tracker', icon: '⚔️' },
        { id: 'party:holdings', label: 'Holdings & Bastions', icon: '🏰' },
      ],
    },
    {
      id: 'journal',
      label: 'Journal & Lore',
      icon: '📜',
      defaultChildId: 'journal:notes',
      children: [
        { id: 'journal:notes', label: 'Campaign Notes', icon: '📝' },
        { id: 'journal:handouts', label: 'Handouts', icon: '📜' },
        { id: 'journal:calendar', label: 'Calendar & History', icon: '📅' },
      ],
    },
  ]);

  // Auto-sync active item and open accordion group based on activeView & activeTab
  $effect(() => {
    const view = uiStore.activeView;
    if (view === 'canvas') {
      if (activeTab === 'encounter') {
        activeItemId = 'party:combat';
      } else {
        activeItemId = 'canvas:battlemaps';
      }
    } else if (view === 'atlas') {
      activeItemId = 'atlas:realm';
    } else if (view === 'bestiary') {
      activeItemId = 'bestiary:monsters';
    } else if (view === 'compendium') {
      activeItemId = 'compendium:spells';
    } else if (view === 'party') {
      if (activeTab === 'holdings') {
        activeItemId = 'party:holdings';
      } else {
        activeItemId = 'party:characters';
      }
    } else if (view === 'journal') {
      if (activeTab === 'handouts') {
        activeItemId = 'journal:handouts';
      } else {
        activeItemId = 'journal:notes';
      }
    }
  });

  onMount(() => {
    if (typeof localStorage !== 'undefined') {
      const savedCollapsed = localStorage.getItem('graywood_sidebar_collapsed');
      if (savedCollapsed !== null) {
        isCollapsed = savedCollapsed === 'true';
      }
    }
  });

  function toggleSidebarCollapse() {
    isCollapsed = !isCollapsed;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('graywood_sidebar_collapsed', String(isCollapsed));
    }
  }

  function handleToggleSection(sectionId: string) {
    if (isCollapsed) {
      isCollapsed = false;
      openBranches[sectionId] = true;
      return;
    }
    openBranches[sectionId] = !openBranches[sectionId];
  }

  function handleSelectGroup(group: NavGroup) {
    if (isCollapsed) {
      // Find default child or first child and navigate directly
      const targetChild = group.children[0];
      if (targetChild) {
        handleSelectChild(targetChild, group);
      }
    } else {
      openBranches[group.id] = true;
    }
  }

  function handleSelectChild(child: NavItem, group: NavGroup) {
    activeItemId = child.id;
    openBranches[group.id] = true;

    // Dispatch custom events or update store state based on selected leaf
    switch (child.id) {
      case 'canvas:battlemaps':
        uiStore.setActiveView('canvas');
        dmMapMode = 'tactical';
        activeTab = 'battlemat';
        onSelectTab?.('battlemat');
        break;

      case 'canvas:grid':
        uiStore.setActiveView('canvas');
        dmMapMode = 'tactical';
        activeTab = 'battlemat';
        onSelectTab?.('battlemat');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('vtt:context-tool', { detail: { tool: 'ruler', active: true } }));
        }
        break;

      case 'canvas:fog':
        uiStore.setActiveView('canvas');
        dmMapMode = 'tactical';
        activeTab = 'battlemat';
        onSelectTab?.('battlemat');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('vtt:context-tool', { detail: { tool: 'fog', active: true } }));
        }
        break;

      case 'canvas:layers':
        uiStore.setActiveView('canvas');
        dmMapMode = 'tactical';
        activeTab = 'battlemat';
        onSelectTab?.('battlemat');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('vtt:context-tool', { detail: { tool: 'layers', active: true } }));
        }
        break;

      case 'canvas:assets':
        assetBrowserStore.open();
        break;

      case 'atlas:realm':
        uiStore.setActiveView('atlas');
        dmMapMode = 'atlas';
        activeTab = 'battlemat';
        onSelectTab?.('battlemat');
        break;

      case 'atlas:regions':
        uiStore.setActiveView('atlas');
        dmMapMode = 'atlas';
        activeTab = 'battlemat';
        onSelectTab?.('battlemat');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('vtt:context-tool', { detail: { tool: 'factions', active: true } }));
        }
        break;

      case 'atlas:poi':
        uiStore.setActiveView('atlas');
        dmMapMode = 'atlas';
        activeTab = 'battlemat';
        onSelectTab?.('battlemat');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('vtt:context-tool', { detail: { tool: 'poi', active: true } }));
        }
        break;

      case 'bestiary:monsters':
      case 'bestiary:npcs':
        uiStore.setActiveView('bestiary');
        break;

      case 'bestiary:encounters':
        uiStore.setActiveView('canvas');
        activeTab = 'encounter';
        onSelectTab?.('encounter');
        break;

      case 'compendium:spells':
      case 'compendium:items':
      case 'compendium:unlocks':
        uiStore.setActiveView('compendium');
        activeTab = 'lore';
        onSelectTab?.('lore');
        break;

      case 'compendium:rules':
        uiStore.setActiveView('compendium');
        activeTab = 'lore';
        onSelectTab?.('lore');
        floatingWindowsStore.open('sources');
        break;

      case 'compendium:ingest':
        ingestPipelineStore.openModal();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('vtt:open-ingest-modal'));
        }
        break;

      case 'party:characters':
      case 'party:allies':
        uiStore.setActiveView('party');
        activeTab = 'party';
        onSelectTab?.('party');
        break;

      case 'party:combat':
        uiStore.setActiveView('canvas');
        activeTab = 'encounter';
        onSelectTab?.('encounter');
        break;

      case 'party:holdings':
        uiStore.setActiveView('party');
        activeTab = 'holdings';
        onSelectTab?.('holdings');
        break;

      case 'journal:notes':
        uiStore.setActiveView('journal');
        activeTab = 'lore';
        onSelectTab?.('lore');
        break;

      case 'journal:handouts':
        uiStore.setActiveView('journal');
        activeTab = 'handouts';
        onSelectTab?.('handouts');
        break;

      case 'journal:calendar':
        uiStore.setActiveView('journal');
        activeTab = 'lore';
        onSelectTab?.('lore');
        break;
    }
  }
</script>

<aside
  class="h-full bg-slate-900 border-r border-slate-800 flex flex-col transition-all duration-200 ease-in-out shrink-0 select-none z-20 overflow-hidden {isCollapsed ? 'w-16' : 'w-64'}"
  aria-label="Workspace Navigation Sidebar"
>
  <!-- ═════════════════════════════════════════════════════════════════════════
       SIDEBAR HEADER: BRAND & EXPAND/COLLAPSE TOGGLE
  ══════════════════════════════════════════════════════════════════════════ -->
  <div class="h-12 border-b border-slate-800/90 flex items-center px-3.5 shrink-0 justify-between">
    {#if !isCollapsed}
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/60 shrink-0"></div>
        <span class="font-black text-xs text-slate-100 uppercase tracking-widest truncate">
          Graywood VTT
        </span>
      </div>
    {:else}
      <div class="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/60 mx-auto"></div>
    {/if}

    <button
      type="button"
      onclick={toggleSidebarCollapse}
      title={isCollapsed ? 'Expand Navigation Panel' : 'Collapse into Icon-Rail'}
      class="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors {isCollapsed ? 'mx-auto' : ''}"
      aria-label="Toggle Sidebar Collapse"
    >
      <svg
        class="w-4 h-4 transition-transform duration-200 {isCollapsed ? 'rotate-180' : 'rotate-0'}"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <polyline points="11 17 6 12 11 7"></polyline>
        <polyline points="18 17 13 12 18 7"></polyline>
      </svg>
    </button>
  </div>

  <!-- ═════════════════════════════════════════════════════════════════════════
       ACCORDION NAVIGATION LIST
  ══════════════════════════════════════════════════════════════════════════ -->
  <nav class="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-1 scrollbar-thin">
    {#each navSections as group (group.id)}
      <NavAccordionGroup
        {group}
        isOpen={openBranches[group.id] ?? false}
        isCollapsedRail={isCollapsed}
        {activeItemId}
        onToggle={() => handleToggleSection(group.id)}
        onSelectGroup={(g) => handleSelectGroup(g)}
        onSelectChild={(child, g) => handleSelectChild(child, g)}
      />
    {/each}
  </nav>

  <!-- ═════════════════════════════════════════════════════════════════════════
       BOTTOM UTILITY DOCK
  ══════════════════════════════════════════════════════════════════════════ -->
  <div class="border-t border-slate-800/90 p-2 shrink-0 bg-slate-950/40 flex flex-col gap-1">
    {#if !isCollapsed}
      <div class="flex items-center justify-between px-1 py-1">
        <span class="text-[10px] font-mono uppercase tracking-wider text-slate-500">Quick Access</span>
        <span class="text-[10px] font-mono text-emerald-400/80">ONLINE</span>
      </div>
      <div class="grid grid-cols-4 gap-1">
        <button
          type="button"
          onclick={() => {
            floatingWindowsStore.toggleWindow('sources');
            activeTab = 'lore';
            onSelectTab?.('lore');
          }}
          class="p-2 rounded-lg text-center hover:bg-slate-800 transition-colors text-xs text-slate-300"
          title="Source Engine (NotebookLM-Style)"
        >
          📚
        </button>
        <button
          type="button"
          onclick={() => {
            floatingWindowsStore.toggleWindow('copilot');
            activeTab = 'lore';
            onSelectTab?.('lore');
          }}
          class="p-2 rounded-lg text-center hover:bg-slate-800 transition-colors text-xs text-slate-300"
          title="Session AI Co-Pilot"
        >
          🤖
        </button>
        <button
          type="button"
          onclick={() => floatingWindowsStore.toggleWindow('audio')}
          class="p-2 rounded-lg text-center hover:bg-slate-800 transition-colors text-xs text-slate-300"
          title="Soundboard & Ambient Audio"
        >
          🎵
        </button>
        <button
          type="button"
          onclick={() => { uiStore.isSettingsOpen = true; }}
          class="p-2 rounded-lg text-center hover:bg-slate-800 transition-colors text-xs text-slate-300"
          title="Settings & Persistence"
        >
          ⚙️
        </button>
      </div>
    {:else}
      <div class="flex flex-col items-center gap-1.5 py-1">
        <button
          type="button"
          onclick={() => {
            floatingWindowsStore.toggleWindow('sources');
            activeTab = 'lore';
            onSelectTab?.('lore');
          }}
          class="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors text-sm"
          title="Source Engine"
        >
          📚
        </button>
        <button
          type="button"
          onclick={() => {
            floatingWindowsStore.toggleWindow('copilot');
            activeTab = 'lore';
            onSelectTab?.('lore');
          }}
          class="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors text-sm"
          title="AI Co-Pilot"
        >
          🤖
        </button>
        <button
          type="button"
          onclick={() => floatingWindowsStore.toggleWindow('audio')}
          class="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors text-sm"
          title="Soundboard & Audio"
        >
          🎵
        </button>
        <button
          type="button"
          onclick={() => { uiStore.isSettingsOpen = true; }}
          class="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors text-sm"
          title="Settings"
        >
          ⚙️
        </button>
      </div>
    {/if}
  </div>
</aside>
