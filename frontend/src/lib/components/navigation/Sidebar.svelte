<!-- src/lib/components/navigation/Sidebar.svelte -->
<!-- Wrapper for Unified SidebarNav with Accordion Sub-Menus -->

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
  import SidebarNav from './SidebarNav.svelte';

  let {
    activeTab = $bindable<DmTab>('party'),
    dmMapMode = $bindable<'tactical' | 'atlas'>('tactical'),
    onSelectTab,
  }: {
    activeTab?: DmTab;
    dmMapMode?: 'tactical' | 'atlas';
    onSelectTab?: (tab: DmTab) => void;
  } = $props();
</script>

<SidebarNav bind:activeTab bind:dmMapMode {onSelectTab} />
