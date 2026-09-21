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
  <header class="h-11 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 z-30 shrink-0">
    <!-- Left: Brand & Campaign info -->
    <div class="flex items-center gap-3 min-w-0">
      <div class="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/60"></div>
      <span class="font-black text-xs text-slate-200 uppercase tracking-widest whitespace-nowrap">Aleamos Workstation</span>
      <span class="text-slate-700 text-xs">|</span>
      <span class="text-xs text-slate-400 font-semibold truncate">{campaignName}</span>
    </div>

    <!-- Center: In-World Campaign Calendar & Timekeeping -->
    <CalendarDisplayWidget />

    <!-- Right: Projector Casting, Player Portal launcher, Right Dock toggles, Audio, Settings -->
    <div class="flex items-center gap-2 shrink-0">

      <!-- Projector Casting Switchboard -->
      <ProjectorCastingBar />

      <span class="w-px h-4 bg-slate-800 mx-0.5"></span>

      <!-- Player Join Portal Button -->
      <div>
        <button
          onclick={() => isPlayerPortalOpen = true}
          class="px-3 py-1 text-xs font-bold rounded-lg border transition-all flex items-center gap-1.5 {isPlayerPortalOpen
            ? 'bg-amber-600 text-slate-950 border-amber-500 shadow-sm'
            : 'bg-indigo-950/70 hover:bg-indigo-900/80 text-indigo-300 border-indigo-800/50'}"
          title="Open Scannable QR Code & Player Mobile Companion Portal"
        >
          <span>📱</span>
          <span>Player Join Portal</span>
        </button>
      </div>

      <span class="w-px h-4 bg-slate-800 mx-1"></span>

      <!-- Global Floating Tools Toggles (Top Navigation Bar Beside Settings) -->
      <div class="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs">
        <button
          type="button"
          onclick={() => floatingWindowsStore.toggleWindow('sources')}
          class="px-2 py-1 rounded text-[10px] font-bold transition-colors {floatingWindowsStore.windows.sources.isOpen ? 'bg-indigo-700 text-white' : 'text-slate-400 hover:text-slate-200'}"
          title="Local Sources Engine & Rulebook Explorer"
        >
          📚 Sources
        </button>
        <button
          type="button"
          onclick={() => floatingWindowsStore.toggleWindow('copilot')}
          class="px-2 py-1 rounded text-[10px] font-bold transition-colors {floatingWindowsStore.windows.copilot.isOpen ? 'bg-indigo-700 text-white' : 'text-slate-400 hover:text-slate-200'}"
          title="Session Co-Pilot Terminal"
        >
          🤖 Co-Pilot
        </button>
        <button
          type="button"
          onclick={() => floatingWindowsStore.toggleWindow('archivist')}
          class="px-2 py-1 rounded text-[10px] font-bold transition-colors {floatingWindowsStore.windows.archivist.isOpen ? 'bg-indigo-700 text-white' : 'text-slate-400 hover:text-slate-200'}"
          title="Rules Archivist (SRD & Lore RAG)"
        >
          📖 Archivist
        </button>
        <button
          type="button"
          onclick={() => floatingWindowsStore.toggleWindow('audio')}
          class="px-2 py-1 rounded text-[10px] font-bold transition-colors {floatingWindowsStore.windows.audio.isOpen ? 'bg-indigo-700 text-white' : 'text-slate-400 hover:text-slate-200'}"
          title="Audio Studio & Soundboard"
        >
          🎵 Audio
        </button>
        <button
          type="button"
          onclick={() => isBestiaryOpen = !isBestiaryOpen}
          class="px-2 py-1 rounded text-[10px] font-bold transition-colors {isBestiaryOpen ? 'bg-amber-600 text-white font-black shadow-sm' : 'text-slate-400 hover:text-slate-200'}"
          title="5e SRD Bestiary & Monster Compendium"
        >
          🐉 Bestiary
        </button>
        <button
          type="button"
          onclick={() => chatStore.toggle()}
          class="px-2 py-1 rounded text-[10px] font-bold transition-colors {chatStore.isOpen ? 'bg-amber-500 text-slate-950 font-black' : 'text-amber-400/90 hover:text-amber-300'}"
          title="Session Chat & Universal Dice Log"
        >
          🎲 Dice &amp; Chat
        </button>
      </div>

      <span class="w-px h-4 bg-slate-800 mx-1"></span>

      <!-- Settings Modal Button -->
      <button
        type="button"
        onclick={() => isSettingsOpen = true}
        class="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors text-sm"
        title="Settings & Campaign Persistence"
      >
        ⚙️
      </button>
    </div>
  </header>

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
        <!-- 👥 Party Roster with nested Economy/Stash -->
        <div class="absolute inset-0 {activeTab === 'party' ? '' : 'hidden'}">
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

        <!-- ⚗️ Alchemy Lab & Crafting Workbench -->
        <div class="absolute inset-0 {activeTab === 'alchemy' ? '' : 'hidden'}">
          <AlchemyWorkbench />
        </div>

        <!-- 📋 Guild Notice Board -->
        <div class="absolute inset-0 {activeTab === 'guild' ? '' : 'hidden'}">
          <GuildNoticeBoard />
        </div>

        <!-- 🏰 Stronghold / Bastion Zero-State Manager -->
        <div class="absolute inset-0 {activeTab === 'stronghold' ? '' : 'hidden'}">
          <BastionManagerView />
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
  <SoundboardDrawer />
  <BestiaryDrawer bind:isOpen={isBestiaryOpen} />
  <SettingsModal bind:isOpen={isSettingsOpen} />
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
</div>
