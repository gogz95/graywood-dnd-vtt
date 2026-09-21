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
  import LoreWikiView from '../lib/components/lore/LoreWikiView.svelte';
  import HandoutStudioView from '../lib/components/handouts/HandoutStudioView.svelte';
  import PlayerHandoutModal from '../lib/components/handouts/PlayerHandoutModal.svelte';
  import SoundboardDrawer from '../lib/components/audio/SoundboardDrawer.svelte';
  import SettingsModal from '../lib/components/settings/SettingsModal.svelte';

  // Aleamos Downtime, Logistics & Crafting
  import AlchemyWorkbench from '../lib/components/crafting/AlchemyWorkbench.svelte';
  import GuildNoticeBoard from '../lib/components/guild/GuildNoticeBoard.svelte';
  import BastionManagerView from '../lib/components/bastion/BastionManagerView.svelte';
  import StrongholdDashboard from '../lib/components/stronghold/StrongholdDashboard.svelte';

  // Floating Window Shells & Panels
  import FloatingPanel from '../lib/components/ui/FloatingPanel.svelte';
  import DualChatPanel from '../lib/components/ai/DualChatPanel.svelte';
  import SourceExplorerDrawer from '../lib/components/sources/SourceExplorerDrawer.svelte';
  import { floatingWindowsStore } from '../lib/stores/floatingWindowsStore.svelte';

  // Utilities
  import { generateQrCodeSvg } from '../lib/utils/qrcode';
  import { initAutoSaver } from '../lib/utils/campaignPersistence';
  import { registerGlobalDropZone } from '../lib/utils/assetDrop';

  // ── State ──────────────────────────────────────────────────────────────────
  let activeTab = $state<DmTab>('party');
  let campaignName = $state(typeof localStorage !== 'undefined' ? localStorage.getItem('vtt_campaign_name') || 'My 5e Campaign' : 'My 5e Campaign');
  let lanIp = $state(typeof localStorage !== 'undefined' ? localStorage.getItem('vtt_lan_ip') || '192.168.1.100' : '192.168.1.100');
  let lanPort = $state(5173);

  // Modals & Popovers
  let isSettingsOpen = $state(false);
  let isPlayerPortalOpen = $state(false);
  let copiedJoinLink = $state(false);

  // Computed LAN Player Link & Scannable QR Code
  let playerJoinUrl = $derived(`http://${lanIp}:${lanPort}/play`);
  let qrCodeSvg = $derived(generateQrCodeSvg(playerJoinUrl, 200));

  let stopAutoSaver: (() => void) | null = null;
  let dropCleanup: (() => void) | null = null;

  onMount(() => {
    stopAutoSaver = initAutoSaver();

    // Auto-detect browser host IP if available
    if (typeof window !== 'undefined') {
      const host = window.location.hostname;
      if (host && host !== 'localhost' && host !== '127.0.0.1') {
        lanIp = host;
      }
      lanPort = parseInt(window.location.port || '5173', 10);
    }

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

  function copyPlayerLink() {
    navigator.clipboard.writeText(playerJoinUrl).catch(() => {});
    copiedJoinLink = true;
    setTimeout(() => { copiedJoinLink = false; }, 2500);
  }
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

    <!-- Right: Player Portal launcher, Right Dock toggles, Audio, Settings -->
    <div class="flex items-center gap-2 shrink-0">

      <!-- Player Join Portal Button -->
      <div class="relative">
        <button
          onclick={() => isPlayerPortalOpen = !isPlayerPortalOpen}
          class="px-3 py-1 text-xs font-bold rounded-lg border transition-all flex items-center gap-1.5 {isPlayerPortalOpen
            ? 'bg-amber-600 text-slate-950 border-amber-500 shadow-sm'
            : 'bg-indigo-950/70 hover:bg-indigo-900/80 text-indigo-300 border-indigo-800/50'}"
          title="Open Scannable QR Code & Player Mobile Companion Portal"
        >
          <span>📱</span>
          <span>Player Join Portal</span>
        </button>

        <!-- Player Join Portal Popover with Scannable QR Code & Quick Settings -->
        {#if isPlayerPortalOpen}
          <div
            role="dialog"
            aria-label="Player Join Portal popover"
            class="absolute top-10 right-0 w-80 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-5 space-y-4 z-50 text-slate-100"
          >
            <div class="flex items-center justify-between border-b border-slate-800 pb-2">
              <div class="flex items-center gap-2">
                <span class="text-lg">📱</span>
                <div>
                  <h4 class="text-xs font-black uppercase tracking-wider text-slate-200">Player Companion Portal</h4>
                  <p class="text-[10px] text-slate-400">Scan or navigate from table phones/tablets</p>
                </div>
              </div>
              <button onclick={() => isPlayerPortalOpen = false} class="text-slate-500 hover:text-slate-300 text-xs">✕</button>
            </div>

            <!-- Scannable QR Code SVG Container -->
            <div class="bg-white p-3 rounded-xl flex items-center justify-center shadow-inner">
              {@html qrCodeSvg}
            </div>

            <!-- LAN Direct Link & Copy -->
            <div class="space-y-1.5 text-xs">
              <div class="flex items-center justify-between">
                <span class="text-[10px] font-bold uppercase text-slate-400">Direct Mobile URL</span>
                {#if copiedJoinLink}
                  <span class="text-[10px] text-emerald-400 font-bold">Copied!</span>
                {/if}
              </div>
              <div class="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg p-1.5 font-mono text-[11px] text-indigo-300">
                <span class="truncate flex-1">{playerJoinUrl}</span>
                <button
                  onclick={copyPlayerLink}
                  class="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[10px] font-bold"
                  title="Copy URL"
                >
                  Copy
                </button>
              </div>
            </div>

            <!-- Quick Settings Modal Launcher Button -->
            <button
              onclick={() => { isPlayerPortalOpen = false; isSettingsOpen = true; }}
              class="w-full py-1.5 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border border-slate-700/60"
            >
              <span>⚙️</span>
              <span>Open Settings &amp; LAN Config</span>
            </button>

            <div class="pt-1 flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-800/80">
              <span>Port :{lanPort} · 4-Digit Character PINs</span>
              <a
                href="/play"
                target="_blank"
                class="text-indigo-400 hover:underline font-bold"
              >
                Open in New Tab ↗
              </a>
            </div>
          </div>
        {/if}
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
      <div class="flex-1 relative overflow-hidden">
        <!-- 👥 Party Roster with nested Economy/Stash -->
        <div class="absolute inset-0 {activeTab === 'party' ? '' : 'hidden'}">
          <PartyRosterView />
        </div>

        <!-- ⚔️ Encounter & Combat -->
        <div class="absolute inset-0 {activeTab === 'encounter' ? '' : 'hidden'}">
          <EncounterDashboard />
        </div>

        <!-- 🗺️ Tactical Mat PixiJS Canvas -->
        <div class="absolute inset-0 {activeTab === 'battlemat' ? '' : 'hidden'}">
          <TacticalMat />
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
  <SettingsModal bind:isOpen={isSettingsOpen} />
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
</div>
