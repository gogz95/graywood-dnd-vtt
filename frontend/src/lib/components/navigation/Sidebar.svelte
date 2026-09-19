<script module lang="ts">
  export type DmTab =
    | 'party'
    | 'encounter'
    | 'battlemat'
    | 'lore'
    | 'handouts'
    | 'archivist'
    | 'copilot'
    | 'audio';

  export interface SidebarTab {
    id: DmTab;
    icon: string;
    label: string;
    title: string;
  }
</script>

<script lang="ts">
  // Sidebar.svelte — Vertical DM navigation dock with strictly 8 primary subsystems:
  // 1. Party & Characters
  // 2. Encounter & Combat
  // 3. Tactical Mat
  // 4. Lore Wiki
  // 5. Handout Studio
  // 6. Rules Archivist
  // 7. Session Co-Pilot
  // 8. Audio Studio

  let {
    activeTab = $bindable<DmTab>('encounter'),
    onSelectTab,
  }: {
    activeTab?: DmTab;
    onSelectTab?: (tab: DmTab) => void;
  } = $props();

  const TABS: SidebarTab[] = [
    { id: 'party',     icon: '👥', label: 'Party',     title: 'Active Party Roster & PIN Controls' },
    { id: 'encounter', icon: '⚔️', label: 'Combat',    title: 'Encounter & Initiative Tracker' },
    { id: 'battlemat', icon: '🗺️', label: 'Tactical',  title: 'Tactical Mat (PixiJS Canvas)' },
    { id: 'lore',      icon: '📚', label: 'Lore',      title: 'Lore Wiki & Relational Graph' },
    { id: 'handouts',  icon: '📜', label: 'Handouts',  title: 'Parchment Handout Studio & Broadcast' },
    { id: 'archivist', icon: '📖', label: 'Archivist', title: 'Rules Archivist (Independent RAG)' },
    { id: 'copilot',   icon: '🤖', label: 'Co-Pilot',  title: 'Session Co-Pilot (DM Command Terminal)' },
    { id: 'audio',     icon: '🎵', label: 'Audio',     title: 'Audio Studio & Dual-Bus Soundboard' },
  ];

  function selectTab(id: DmTab) {
    activeTab = id;
    onSelectTab?.(id);
    if (id === 'audio') {
      window.dispatchEvent(new CustomEvent('vtt:toggle-audio'));
    }
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
