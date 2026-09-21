<script lang="ts">
  // +page.svelte — Production Root Workspace Shell for 5e VTT
  // Integrates Central Viewport Switcher, Dual Right Utility Dock (Archivist & Co-Pilot),
  // and Global Header with Scannable QR Code Player Join Portal.

  import { onMount, onDestroy } from 'svelte';
  import Sidebar, { type DmTab } from '../lib/components/navigation/Sidebar.svelte';

  // Subsystem Views
  import PartyRosterView from '../lib/components/party/PartyRosterView.svelte';
  import EncounterDashboard from '../lib/components/dm/EncounterDashboard.svelte';
  import TacticalMat from '../lib/components/canvas/TacticalMat.svelte';
  import AtlasMapView from '../lib/components/map/AtlasMapView.svelte';
  import ProjectorCastingBar from '../lib/components/navigation/ProjectorCastingBar.svelte';
  import LoreWikiView from '../lib/components/lore/LoreWikiView.svelte';
  import HandoutStudioView from '../lib/components/handouts/HandoutStudioView.svelte';
  import PlayerHandoutModal from '../lib/components/handouts/PlayerHandoutModal.svelte';
  import SoundboardDrawer from '../lib/components/audio/SoundboardDrawer.svelte';
  import SettingsModal from '../lib/components/settings/SettingsModal.svelte';
  import FirstRunWizardModal from '../lib/components/modals/FirstRunWizardModal.svelte';
  import OmnibarPalette from '../lib/components/navigation/OmnibarPalette.svelte';
  import BestiaryDrawer from '../lib/components/bestiary/BestiaryDrawer.svelte';
  import CalendarDisplayWidget from '../lib/components/navigation/CalendarDisplayWidget.svelte';
  import Header from '../lib/components/navigation/Header.svelte';
  import { uiStore } from '../lib/stores/uiStore.svelte';
  import FullBestiaryView from '../lib/components/bestiary/FullBestiaryView.svelte';
  import MapManagerModal from '../lib/components/map/MapManagerModal.svelte';
  import UnifiedHoldingsView from '../lib/components/downtime/UnifiedHoldingsView.svelte';

  // Aleamos Downtime, Logistics & Crafting
  import AlchemyWorkbench from '../lib/components/crafting/AlchemyWorkbench.svelte';
  import GuildNoticeBoard from '../lib/components/guild/GuildNoticeBoard.svelte';
  import BastionManagerView from '../lib/components/bastion/BastionManagerView.svelte';
  import StrongholdDashboard from '../lib/components/stronghold/StrongholdDashboard.svelte';
  import InitiativeRibbon from '../lib/components/combat/InitiativeRibbon.svelte';
  import SessionChatLog from '../lib/components/chat/SessionChatLog.svelte';
  import PhysicalDicePromptModal from '../lib/components/modals/PhysicalDicePromptModal.svelte';
  import { chatStore } from '../lib/stores/chatStore.svelte';

  // Floating Window Shells & Panels
  import FloatingPanel from '../lib/components/ui/FloatingPanel.svelte';
  import DualChatPanel from '../lib/components/ai/DualChatPanel.svelte';
  import SourceExplorerDrawer from '../lib/components/sources/SourceExplorerDrawer.svelte';
  import { floatingWindowsStore } from '../lib/stores/floatingWindowsStore.svelte';

  import PlayerCompanionPortalModal from '../lib/components/player/PlayerCompanionPortalModal.svelte';
  import { getLanIp, getLanPort } from '../lib/services/networkDiscovery';

  // Utilities
  import { initAutoSaver } from '../lib/utils/campaignPersistence';
  import { registerGlobalDropZone } from '../lib/utils/assetDrop';

  // ── State ──────────────────────────────────────────────────────────────────
  let activeTab = $state<DmTab>('party');
  let dmMapMode = $state<'tactical' | 'atlas'>('tactical');
  let campaignName = $state(typeof localStorage !== 'undefined' ? localStorage.getItem('vtt_campaign_name') || 'My 5e Campaign' : 'My 5e Campaign');

  // Modals & Popovers
  let isSettingsOpen = $state(false);
  let isPlayerPortalOpen = $state(false);
  let isBestiaryOpen = $state(false);
  let isMapManagerOpen = $state(false);

  $effect(() => {
    if (uiStore.activeView === 'canvas') {
      activeTab = 'battlemat';
      dmMapMode = 'tactical';
    } else if (uiStore.activeView === 'atlas') {
      activeTab = 'battlemat';
      dmMapMode = 'atlas';
    } else if (uiStore.activeView === 'bestiary') {
      // Bestiary handles full-page overlay
    } else if (uiStore.activeView === 'compendium') {
      activeTab = 'lore';
    } else if (uiStore.activeView === 'party') {
      activeTab = 'party';
    } else if (uiStore.activeView === 'journal') {
      activeTab = 'handouts';
    }
  });

  let stopAutoSaver: (() => void) | null = null;
  let dropCleanup: (() => void) | null = null;

  onMount(() => {
    stopAutoSaver = initAutoSaver();
    getLanIp().catch(() => {});

    const handleSwitchTab = (e: Event) => {
      const detail = (e as CustomEvent<{ tab: DmTab }>).detail;
      if (detail?.tab) {
        activeTab = detail.tab;
      }
    };
    const handleToggleAudio = () => {
      floatingWindowsStore.open('audio');
    };

    window.addEventListener('vtt:switch-tab', handleSwitchTab);
    window.addEventListener('vtt:toggle-audio', handleToggleAudio);

    dropCleanup = registerGlobalDropZone((asset) => {
      if (asset.category === 'audio') floatingWindowsStore.open('audio');
    });

    return () => {
      stopAutoSaver?.();
      dropCleanup?.();
      window.removeEventListener('vtt:switch-tab', handleSwitchTab);
      window.removeEventListener('vtt:toggle-audio', handleToggleAudio);
    };
  });
</script>

<div class="h-screen w-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-hidden">

  <!-- ═════════════════════════════════════════════════════════════════════════
       1. GLOBAL WORKSPACE HEADER
  ══════════════════════════════════════════════════════════════════════════ -->
  <Header
    {campaignName}
    onOpenSettings={() => uiStore.isSettingsOpen = true}
    onOpenPlayerPortal={() => isPlayerPortalOpen = true}
    onToggleCombat={() => activeTab = activeTab === 'encounter' ? 'battlemat' : 'encounter'}
  />

  <!-- ═════════════════════════════════════════════════════════════════════════
       2. WORKSPACE BODY: SIDEBAR + CENTRAL FULL-WIDTH STAGE
  ══════════════════════════════════════════════════════════════════════════ -->
  <div class="flex-1 flex min-h-0 overflow-hidden relative">

    <!-- Left Sidebar (Strict 8 Icons) -->
    <Sidebar bind:activeTab />

    <!-- Central Stage Viewport Switcher -->
    <main class="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col relative bg-slate-950">
      <!-- Tactical Combat Initiative Strip (Synchronous with Combat Tracker) -->
      <InitiativeRibbon isDm={true} />

      <div class="flex-1 relative overflow-hidden">
        <!-- 🐉 Full-Page Bestiary View (Elevated Full-Site Tab) -->
        <div class="absolute inset-0 z-10 {uiStore.activeView === 'bestiary' ? '' : 'hidden'}">
          <FullBestiaryView />
        </div>

        <!-- 👥 Party Roster with nested Economy/Stash -->
        <div class="absolute inset-0 {uiStore.activeView !== 'bestiary' && activeTab === 'party' ? '' : 'hidden'}">
          <PartyRosterView />
        </div>

        <!-- ⚔️ Encounter & Combat -->
        <div class="absolute inset-0 {activeTab === 'encounter' ? '' : 'hidden'}">
          <EncounterDashboard />
        </div>

        <!-- 🗺️ Tactical Mat PixiJS Canvas / Overland World Atlas -->
        <div class="absolute inset-0 {activeTab === 'battlemat' ? '' : 'hidden'}">
          <!-- DM Map View Mode Switcher -->
          <div class="absolute top-3 right-4 z-20 flex items-center gap-1 bg-slate-900/90 backdrop-blur-md border border-slate-800 p-1 rounded-xl shadow-xl text-xs">
            <button
              type="button"
              onclick={() => dmMapMode = 'tactical'}
              class="px-2.5 py-1 rounded-lg font-bold transition-all {dmMapMode === 'tactical' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}"
            >
              ⚔️ Tactical Battlemap
            </button>
            <button
              type="button"
              onclick={() => dmMapMode = 'atlas'}
              class="px-2.5 py-1 rounded-lg font-bold transition-all {dmMapMode === 'atlas' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}"
            >
              🗺️ World Atlas
            </button>
          </div>

          {#if dmMapMode === 'atlas'}
            <AtlasMapView isDm={true} />
          {:else}
            <TacticalMat />
          {/if}
        </div>

        <!-- 🏰 Unified Holdings & Downtime (Strongholds, Guild, Crafting) -->
        <div class="absolute inset-0 {uiStore.activeView !== 'bestiary' && activeTab === 'holdings' ? '' : 'hidden'}">
          <UnifiedHoldingsView />
        </div>

        <!-- 📚 Lore Wiki & Relational Graph -->
        <div class="absolute inset-0 {activeTab === 'lore' ? '' : 'hidden'}">
          <LoreWikiView />
        </div>

        <!-- 📜 Handout Studio -->
        <div class="absolute inset-0 {activeTab === 'handouts' ? '' : 'hidden'}">
          <HandoutStudioView />
        </div>
      </div>
    </main>

  </div>

  <!-- Global Non-Blocking Floating Panels, Modals, and Overlays -->
  <SoundboardDrawer bind:isOpen={uiStore.isSoundboardOpen} />
  <BestiaryDrawer bind:isOpen={isBestiaryOpen} />
  <SettingsModal bind:isOpen={uiStore.isSettingsOpen} />
  <PlayerCompanionPortalModal bind:isOpen={isPlayerPortalOpen} />
  <PlayerHandoutModal />

  <FloatingPanel id="sources" title="Local Source Engine & Rulebook Explorer" icon="📚">
    <SourceExplorerDrawer />
  </FloatingPanel>

  <FloatingPanel id="copilot" title="AI DM Co-Pilot Terminal" icon="🤖">
    <DualChatPanel initialMode="copilot" />
  </FloatingPanel>

  <FloatingPanel id="archivist" title="Rules Archivist (SRD & Lore RAG)" icon="📖">
    <DualChatPanel initialMode="archivist" />
  </FloatingPanel>

  <!-- Interactive Session Chat & Universal Dice Drawer -->
  <SessionChatLog isDm={true} userName="Dungeon Master" />

  <!-- Global Physical Tabletop Dice Manual Input Modal -->
  <PhysicalDicePromptModal />

  <!-- Global Omnibar Search & Command Palette (Ctrl+K) -->
  <OmnibarPalette />

  <!-- Initial Setup Wizard Modal -->
  <FirstRunWizardModal />

  <!-- Universal Map Manager Modal -->
  <MapManagerModal bind:isOpen={isMapManagerOpen} />
</div>
