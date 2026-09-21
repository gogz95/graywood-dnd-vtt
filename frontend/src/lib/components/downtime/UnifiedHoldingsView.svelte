<!-- src/lib/components/downtime/UnifiedHoldingsView.svelte -->
<!-- Unified Holdings & Downtime Manager: Strongholds, Adventurers' Guild & Alchemy/Crafting -->

<script lang="ts">
  import BastionManagerView from '../bastion/BastionManagerView.svelte';
  import GuildNoticeBoard from '../guild/GuildNoticeBoard.svelte';
  import AlchemyWorkbench from '../crafting/AlchemyWorkbench.svelte';

  type DowntimeSubTab = 'stronghold' | 'guild' | 'crafting';
  let activeSubTab = $state<DowntimeSubTab>('stronghold');

  const SUB_TABS: Array<{ id: DowntimeSubTab; label: string; icon: string; desc: string }> = [
    { id: 'stronghold', label: 'Stronghold / Keep', icon: '🏰', desc: 'Bastion room progression & facility upgrades' },
    { id: 'guild',      label: 'Guild Hall',         icon: '📋', desc: 'Bounties, quests & adventurer guild contracts' },
    { id: 'crafting',   label: 'Crafting & Alchemy', icon: '⚗️', desc: 'Alchemy workbench & 5e downtime crafting' },
  ];
</script>

<div class="w-full h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden select-none">
  <!-- Top Consolidated Sub-Bar -->
  <div class="h-12 bg-slate-900 border-b border-slate-800 px-6 flex items-center justify-between shrink-0">
    <div class="flex items-center gap-3">
      <span class="text-xl">🏰</span>
      <div>
        <h2 class="text-xs font-black uppercase tracking-wider text-slate-200">Holdings & Downtime</h2>
        <p class="text-[10px] text-slate-400">Manage bastion keeps, guild operations, and downtime workshop orders</p>
      </div>
    </div>

    <!-- Segmented Navigation Pills -->
    <div class="flex items-center gap-1 bg-slate-950 border border-slate-800 p-1 rounded-xl shadow-inner">
      {#each SUB_TABS as tab}
        {@const isActive = activeSubTab === tab.id}
        <button
          type="button"
          onclick={() => activeSubTab = tab.id}
          class="px-3.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 {isActive
            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'}"
          title={tab.desc}
        >
          <span>{tab.icon}</span>
          <span>{tab.label}</span>
        </button>
      {/each}
    </div>
  </div>

  <!-- Content Body -->
  <div class="flex-1 relative overflow-hidden">
    <div class="absolute inset-0 {activeSubTab === 'stronghold' ? '' : 'hidden'}">
      <BastionManagerView />
    </div>

    <div class="absolute inset-0 {activeSubTab === 'guild' ? '' : 'hidden'}">
      <GuildNoticeBoard />
    </div>

    <div class="absolute inset-0 {activeSubTab === 'crafting' ? '' : 'hidden'}">
      <AlchemyWorkbench />
    </div>
  </div>
</div>
