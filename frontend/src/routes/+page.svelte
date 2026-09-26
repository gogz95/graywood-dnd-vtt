<script lang="ts">
  // +page.svelte — Production Root Workspace Shell for 5e VTT
  // Integrates Central Viewport Switcher, Dual Right Utility Dock (Archivist & Co-Pilot),
  // and Global Header with Scannable QR Code Player Join Portal.

  import { onMount, onDestroy } from 'svelte';
  import SidebarNav, { type DmTab } from '../lib/components/navigation/SidebarNav.svelte';

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
  import BestiaryDrawer from '../lib/components/bestiary/BestiaryDrawer.svelte';
  import CalendarDisplayWidget from '../lib/components/navigation/CalendarDisplayWidget.svelte';
  import Header from '../lib/components/navigation/Header.svelte';
  import { uiStore } from '../lib/stores/uiStore.svelte';
  import FullBestiaryView from '../lib/components/bestiary/FullBestiaryView.svelte';
  import MapManagerModal from '../lib/components/map/MapManagerModal.svelte';
  import UnifiedHoldingsView from '../lib/components/downtime/UnifiedHoldingsView.svelte';
  import UniversalIngestModal from '../lib/components/ingest/UniversalIngestModal.svelte';
  import { ingestPipelineStore } from '../lib/services/ingest/ingestPipelineStore.svelte';
  import FloatingBestiaryWindow from '../lib/components/bestiary/FloatingBestiaryWindow.svelte';
  import ImageBrowserDrawer from '../lib/components/assets/ImageBrowserDrawer.svelte';
  import { assetBrowserStore } from '../lib/stores/assetBrowserStore.svelte';
  import CompendiumBrowser from '../lib/components/compendium/CompendiumBrowser.svelte';
  import DropzoneImporter from '../lib/components/ingest/DropzoneImporter.svelte';
  import { campaignDirectoryStore } from '../lib/stores/campaignDirectoryStore.svelte';
  import type { UniversalIngestionReport } from '../lib/importers/universalIngestionEngine';
  import { importUniversalMap } from '../lib/services/mapImporter';

  import CommandPalette from '../lib/components/navigation/CommandPalette.svelte';
  import ActionHotbar from '../lib/components/navigation/ActionHotbar.svelte';
  import CheatSheetModal from '../lib/components/modals/CheatSheetModal.svelte';
  import { hotkeyManager } from '../lib/services/hotkeyManager';
  import { projectorStore } from '../lib/stores/projectorStore.svelte';
  import { curtainStore } from '../lib/stores/curtainStore.svelte';

  // Aleamos Downtime, Logistics & Crafting
  import AlchemyWorkbench from '../lib/components/crafting/AlchemyWorkbench.svelte';
  import GuildNoticeBoard from '../lib/components/guild/GuildNoticeBoard.svelte';
  import BastionManagerView from '../lib/components/bastion/BastionManagerView.svelte';
  import StrongholdDashboard from '../lib/components/stronghold/StrongholdDashboard.svelte';
  import InitiativeRibbon from '../lib/components/combat/InitiativeRibbon.svelte';
  import ChatDrawer from '../lib/components/chat/ChatDrawer.svelte';
  import PhysicalDicePromptModal from '../lib/components/modals/PhysicalDicePromptModal.svelte';
  import { chatStore } from '../lib/stores/chatStore.svelte';

  // Floating Window Shells & Panels
  import FloatingPanel from '../lib/components/ui/FloatingPanel.svelte';
  import DualChatPanel from '../lib/components/ai/DualChatPanel.svelte';
  import SourceExplorerDrawer from '../lib/components/sources/SourceExplorerDrawer.svelte';
  import { floatingWindowsStore } from '../lib/stores/floatingWindowsStore.svelte';

  import PlayerCompanionPortalModal from '../lib/components/player/PlayerCompanionPortalModal.svelte';
  import PairingModal from '../lib/components/setup/PairingModal.svelte';
  import JoinQrModal from '../lib/components/network/JoinQrModal.svelte';
  import { getLanIp, getLanPort } from '../lib/services/networkDiscovery';
  import Dice3DOverlay from '../lib/components/dice/Dice3DOverlay.svelte';


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
  let isPairingModalOpen = $state(false);
  let isBestiaryOpen = $state(false);
  let isMapManagerOpen = $state(false);
  let isIngestModalOpen = $state(false);
  let isCompendiumTrayOpen = $state(false);
  let isQuickIngestOpen = $state(false);
  let isCommandPaletteOpen = $state(false);
  let isCheatSheetOpen = $state(false);
  let quickIngestToast = $state<string | null>(null);

  async function handleQuickIngestComplete(report: UniversalIngestionReport) {
    await campaignDirectoryStore.refreshAssets();
    const count = report.successful.length;
    const msg = count > 0
      ? `Ingested ${count} asset(s) successfully! Active campaign index refreshed.`
      : 'No files were ingested.';
    quickIngestToast = msg;
    setTimeout(() => {
      if (quickIngestToast === msg) quickIngestToast = null;
    }, 4500);
  }

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
    import('../lib/services/srdSeedService')
      .then((m) => m.seedSrdCompendiumIfEmpty())
      .catch(() => {});

    const handleSwitchTab = (e: Event) => {
      const detail = (e as CustomEvent<{ tab: DmTab }>).detail;
      if (detail?.tab) {
        activeTab = detail.tab;
      }
    };
    const handleToggleAudio = () => {
      floatingWindowsStore.open('audio');
    };

    const handleOpenIngest = () => {
      isQuickIngestOpen = true;
    };

    // Register Tactical DM Shortcuts via HotkeyManager
    hotkeyManager.register({
      id: 'toggle-staging-curtain',
      key: 'b',
      ctrlOrMeta: true,
      description: 'Toggle DM Staging Curtain ("Blackout Veil")',
      category: 'screen' as any,
      action: () => {
        curtainStore.toggle();
      }
    });

    hotkeyManager.register({
      id: 'toggle-compendium',
      key: 'b',
      alt: true,
      description: 'Toggle Compendium Browser Drawer (Alt+B)',
      category: 'navigation',
      action: () => {
        isCompendiumTrayOpen = !isCompendiumTrayOpen;
      }
    });

    hotkeyManager.register({
      id: 'toggle-journal',
      key: 'j',
      ctrlOrMeta: true,
      description: 'Toggle Campaign Journal Drawer',
      category: 'navigation',
      action: () => {
        activeTab = activeTab === 'lore' ? 'party' : 'lore';
      }
    });

    hotkeyManager.register({
      id: 'open-command-palette',
      key: 'k',
      ctrlOrMeta: true,
      description: 'Open Quick Command Palette / Search',
      category: 'navigation',
      action: () => {
        isCommandPaletteOpen = !isCommandPaletteOpen;
      }
    });

    hotkeyManager.register({
      id: 'toggle-cheat-sheet-f1',
      key: 'F1',
      description: 'Open Keyboard Shortcuts & Cheat Sheet Modal',
      category: 'general',
      action: () => {
        isCheatSheetOpen = !isCheatSheetOpen;
      }
    });

    hotkeyManager.register({
      id: 'toggle-cheat-sheet-question',
      key: '?',
      description: 'Open Keyboard Shortcuts & Cheat Sheet Modal',
      category: 'general',
      action: () => {
        isCheatSheetOpen = !isCheatSheetOpen;
      }
    });

    hotkeyManager.register({
      id: 'toggle-ingest',
      key: 'i',
      ctrlOrMeta: true,
      description: 'Toggle Quick Asset Ingest Tray',
      category: 'general',
      action: () => {
        isQuickIngestOpen = !isQuickIngestOpen;
      }
    });

    const unbindHotkeys = hotkeyManager.init();

    window.addEventListener('vtt:switch-tab', handleSwitchTab);
    window.addEventListener('vtt:toggle-audio', handleToggleAudio);
    window.addEventListener('vtt:open-ingest-modal', handleOpenIngest);

    const handleToast = (e: Event) => {
      const detail = (e as CustomEvent<{ message: string }>).detail;
      if (detail?.message) {
        quickIngestToast = detail.message;
        setTimeout(() => {
          if (quickIngestToast === detail.message) quickIngestToast = null;
        }, 4500);
      }
    };
    window.addEventListener('vtt:toast', handleToast);

    dropCleanup = registerGlobalDropZone(async (asset) => {
      if (asset.category === 'audio') {
        floatingWindowsStore.open('audio');
      } else if (asset.category === 'map' && asset.file) {
        const res = await importUniversalMap(asset.file, asset.fileName);
        if (res.success) {
          activeTab = 'battlemat';
          dmMapMode = 'tactical';
          await campaignDirectoryStore.refreshAssets();
        }
      } else if ((asset.category === 'text' || asset.category === 'pdf') && asset.file) {
        ingestPipelineStore.addFiles([asset.file]);
        ingestPipelineStore.openModal();
      }
    });

    return () => {
      stopAutoSaver?.();
      dropCleanup?.();
      unbindHotkeys();
      window.removeEventListener('vtt:switch-tab', handleSwitchTab);
      window.removeEventListener('vtt:toggle-audio', handleToggleAudio);
      window.removeEventListener('vtt:open-ingest-modal', handleOpenIngest);
      window.removeEventListener('vtt:toast', handleToast);
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
    onOpenPairing={() => isPairingModalOpen = true}
    onToggleCombat={() => activeTab = activeTab === 'encounter' ? 'battlemat' : 'encounter'}
    onToggleCompendium={() => isCompendiumTrayOpen = !isCompendiumTrayOpen}
    onOpenIngest={() => isQuickIngestOpen = true}
    isCompendiumOpen={isCompendiumTrayOpen}
  />

  <!-- ═════════════════════════════════════════════════════════════════════════
       2. WORKSPACE BODY: SIDEBAR + CENTRAL FULL-WIDTH STAGE
  ══════════════════════════════════════════════════════════════════════════ -->
  <div class="flex-1 flex min-h-0 overflow-hidden relative">

    <!-- Collapsible Multi-Level Sidebar Accordion Navigation -->
    <SidebarNav bind:activeTab bind:dmMapMode />

    <!-- Central Stage Viewport Switcher -->
    <main class="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col relative bg-slate-950">
      <!-- Tactical Combat Initiative Strip (Synchronous with Combat Tracker) -->
      <InitiativeRibbon isDm={true} />

      <div class="flex-1 relative overflow-hidden">
        <!-- 🐉 Full-Page Bestiary View (Elevated Full-Site Tab) -->
        <div class="absolute inset-0 z-10 {uiStore.activeView === 'bestiary' ? '' : 'hidden'}">
          <FullBestiaryView />
        </div>

        <!-- 📚 Full-Page Compendium Browser (Spells, Items, Monsters) -->
        <div class="absolute inset-0 z-10 {uiStore.activeView === 'compendium' ? '' : 'hidden'}">
          <CompendiumBrowser />
        </div>

        <!-- 👥 Party Roster with nested Economy/Stash -->
        <div class="absolute inset-0 {uiStore.activeView !== 'bestiary' && uiStore.activeView !== 'compendium' && activeTab === 'party' ? '' : 'hidden'}">
          <PartyRosterView />
        </div>

        <!-- ⚔️ Encounter & Combat -->
        <div class="absolute inset-0 {activeTab === 'encounter' ? '' : 'hidden'}">
          <EncounterDashboard />
        </div>

        <!-- 🗺️ Tactical Mat PixiJS Canvas / Overland World Atlas -->
        <div class="absolute inset-0 {activeTab === 'battlemat' ? '' : 'hidden'}">
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
  <PairingModal bind:isOpen={isPairingModalOpen} />
  <JoinQrModal bind:isOpen={isPairingModalOpen} />
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
  <ChatDrawer isDm={true} userName="Dungeon Master" playerName="DM" />

  <!-- Persistent Macro & Quick-Action Hotbar -->
  <ActionHotbar />

  <!-- Global Physical Tabletop Dice Manual Input Modal -->
  <PhysicalDicePromptModal />

  <!-- Global Tactical Command Palette (Ctrl+K) -->
  <CommandPalette bind:isOpen={isCommandPaletteOpen} />

  <!-- Tactical DM Cheat Sheet & Shortcuts Modal (F1 / ?) -->
  <CheatSheetModal bind:isOpen={isCheatSheetOpen} />

  <!-- Initial Setup Wizard Modal -->
  <FirstRunWizardModal />

  <!-- Universal Map Manager Modal -->
  <MapManagerModal bind:isOpen={isMapManagerOpen} />

  <!-- Universal Multi-Category Asset Ingestion Pipeline Modal -->
  <UniversalIngestModal bind:isOpen={ingestPipelineStore.isModalOpen} />

  <!-- Floating Detachable Bestiary HUD Window -->
  <FloatingBestiaryWindow onDock={() => (isBestiaryOpen = true)} />

  <!-- Campaign Image Browser Drawer (Maps, Tokens, Props, Handouts) -->
  <ImageBrowserDrawer
    bind:isOpen={assetBrowserStore.isOpen}
    onClose={() => assetBrowserStore.close()}
  />

  <!-- ═════════════════════════════════════════════════════════════════════════
       GLOBAL INGESTION NOTIFICATION TOAST
  ══════════════════════════════════════════════════════════════════════════ -->
  {#if quickIngestToast}
    <div class="fixed bottom-6 right-6 z-50 px-4 py-2.5 bg-emerald-950/90 border border-emerald-600 text-emerald-200 text-xs font-bold rounded-xl shadow-2xl flex items-center gap-2 animate-bounce">
      <span>⚡</span>
      <span>{quickIngestToast}</span>
    </div>
  {/if}

  <!-- ═════════════════════════════════════════════════════════════════════════
       COMPENDIUM BROWSER SLIDE-OUT TRAY (Ctrl+B)
  ══════════════════════════════════════════════════════════════════════════ -->
  {#if isCompendiumTrayOpen}
    <div
      class="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm transition-opacity"
      role="presentation"
      onclick={() => (isCompendiumTrayOpen = false)}
    ></div>

    <div
      class="fixed inset-y-0 right-0 z-40 w-full max-w-2xl bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col transition-transform duration-300 ease-out"
      role="dialog"
      aria-label="5e SRD Compendium Browser"
    >
      <div class="flex items-center justify-between px-4 py-2.5 bg-slate-950 border-b border-slate-800 shrink-0">
        <div class="flex items-center gap-2">
          <span class="text-lg">🏛️</span>
          <h2 class="text-xs font-black uppercase tracking-wider text-slate-100">
            5e SRD Compendium Tray
          </h2>
          <span class="text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
            Ctrl+B
          </span>
        </div>
        <button
          type="button"
          onclick={() => (isCompendiumTrayOpen = false)}
          class="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          aria-label="Close Compendium Tray"
        >
          ✕
        </button>
      </div>

      <div class="flex-1 min-h-0 overflow-hidden">
        <CompendiumBrowser />
      </div>
    </div>
  {/if}

  <!-- ═════════════════════════════════════════════════════════════════════════
       INGESTION QUICK-DROP MODAL / TRAY (Ctrl+I)
  ══════════════════════════════════════════════════════════════════════════ -->
  {#if isQuickIngestOpen}
    <div
      class="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity"
      role="presentation"
      onclick={(e) => { if (e.target === e.currentTarget) isQuickIngestOpen = false; }}
    >
      <div
        class="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-ingest-title"
      >
        <div class="flex items-center justify-between border-b border-slate-800 pb-3">
          <div class="flex items-center gap-2.5">
            <span class="text-2xl">📥</span>
            <div>
              <h2 id="quick-ingest-title" class="text-sm font-black uppercase tracking-wider text-slate-100">
                Quick Campaign Asset Ingestion
              </h2>
              <p class="text-xs text-slate-400">
                Drop .dd2vtt battlemaps, tokens, audio, or lore markdown into active campaign storage
              </p>
            </div>
          </div>
          <button
            type="button"
            onclick={() => (isQuickIngestOpen = false)}
            class="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            ✕
          </button>
        </div>

        <DropzoneImporter
          onComplete={handleQuickIngestComplete}
        />
      </div>
    </div>
  {/if}

  <!-- Floating Desktop Toast Notification -->
  {#if quickIngestToast}
    <aside
      aria-label="Notification"
      class="fixed bottom-6 right-6 z-50 max-w-md bg-slate-900/95 border border-indigo-500/80 rounded-2xl shadow-2xl p-4 text-xs font-semibold text-slate-100 flex items-center justify-between gap-3 backdrop-blur-md animate-in fade-in slide-in-from-bottom-3"
    >
      <div class="flex items-center gap-2.5">
        <span class="text-base text-indigo-400">🗺️</span>
        <span>{quickIngestToast}</span>
      </div>
      <button
        type="button"
        onclick={() => (quickIngestToast = null)}
        class="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        aria-label="Dismiss toast"
      >
        ✕
      </button>
    </aside>
  {/if}

  <!-- 3D Physics Synchronized Dice Overlay -->
  <Dice3DOverlay theme="gemstone" />
</div>

