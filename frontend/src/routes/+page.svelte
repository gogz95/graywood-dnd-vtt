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
  import AudioDrawer from '../lib/components/audio/AudioDrawer.svelte';
  import SettingsModal from '../lib/components/settings/SettingsModal.svelte';

  // Aleamos Downtime, Logistics & Crafting
  import AlchemyWorkbench from '../lib/components/crafting/AlchemyWorkbench.svelte';
  import GuildNoticeBoard from '../lib/components/guild/GuildNoticeBoard.svelte';
  import StrongholdDashboard from '../lib/components/stronghold/StrongholdDashboard.svelte';

  // Dual Right Utility Dock Panels
  import ArchivistPanel from '../lib/components/ai/ArchivistPanel.svelte';
  import CopilotPanel from '../lib/components/ai/CopilotPanel.svelte';

  // Utilities
  import { generateQrCodeSvg } from '../lib/utils/qrcode';
  import { initAutoSaver } from '../lib/utils/campaignPersistence';
  import { registerGlobalDropZone } from '../lib/utils/assetDrop';

  // ── State ──────────────────────────────────────────────────────────────────
  let activeTab = $state<DmTab>('party');
  let campaignName = $state(typeof localStorage !== 'undefined' ? localStorage.getItem('vtt_campaign_name') || 'My 5e Campaign' : 'My 5e Campaign');
  let lanIp = $state(typeof localStorage !== 'undefined' ? localStorage.getItem('vtt_lan_ip') || '192.168.1.100' : '192.168.1.100');
  let lanPort = $state(5173);

  // Modals & Drawers
  let isAudioOpen = $state(false);
  let isSettingsOpen = $state(false);
  let isPlayerPortalOpen = $state(false);
  let copiedJoinLink = $state(false);

  // Right Dock Toggles
  let isArchivistDockOpen = $state(true);
  let isCopilotDockOpen = $state(true);
  let dockLayout = $state<'split' | 'archivist-only' | 'copilot-only'>('split');

  // Reactively open right dock panels when selected from sidebar
  $effect(() => {
    if (activeTab === 'archivist') {
      isArchivistDockOpen = true;
    } else if (activeTab === 'copilot') {
      isCopilotDockOpen = true;
    }
  });

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
        if (detail.tab === 'archivist') {
          isArchivistDockOpen = true;
        } else if (detail.tab === 'copilot') {
          isCopilotDockOpen = true;
        } else {
          activeTab = detail.tab;
        }
      }
    };
    const handleToggleAudio = () => { isAudioOpen = true; };

    window.addEventListener('vtt:switch-tab', handleSwitchTab);
    window.addEventListener('vtt:toggle-audio', handleToggleAudio);

    dropCleanup = registerGlobalDropZone((asset) => {
      if (asset.category === 'audio') isAudioOpen = true;
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

      <!-- Right Dock View Toggles -->
      <div class="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs">
        <button
          onclick={() => isArchivistDockOpen = !isArchivistDockOpen}
          class="px-2 py-1 rounded text-[10px] font-bold transition-colors {isArchivistDockOpen ? 'bg-indigo-700 text-white' : 'text-slate-400 hover:text-slate-200'}"
          title="Toggle Rules Archivist Panel"
        >
          📖 Rules
        </button>
        <button
          onclick={() => isCopilotDockOpen = !isCopilotDockOpen}
          class="px-2 py-1 rounded text-[10px] font-bold transition-colors {isCopilotDockOpen ? 'bg-amber-600 text-slate-950' : 'text-slate-400 hover:text-slate-200'}"
          title="Toggle Session Co-Pilot Terminal"
        >
          🤖 Co-Pilot
        </button>
      </div>

      <span class="w-px h-4 bg-slate-800 mx-1"></span>

      <!-- Audio Studio Drawer Button -->
      <button
        onclick={() => isAudioOpen = !isAudioOpen}
        class="px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1 {isAudioOpen
          ? 'bg-indigo-700/30 text-indigo-300 border-indigo-600/40'
          : 'text-slate-400 hover:bg-slate-800 border-transparent'}"
        title="Open Audio Studio"
      >
        <span>🎵</span> Audio
      </button>

      <!-- Settings Modal Button -->
      <button
        onclick={() => isSettingsOpen = true}
        class="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors text-sm"
        title="Settings & Campaign Persistence"
      >
        ⚙️
      </button>
    </div>
  </header>

  <!-- ═════════════════════════════════════════════════════════════════════════
       2. WORKSPACE BODY: SIDEBAR + CENTRAL STAGE + DUAL RIGHT DOCK
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

        <!-- ⚗️ Alchemy Lab & 28-Essence Matrix -->
        <div class="absolute inset-0 {activeTab === 'alchemy' ? '' : 'hidden'}">
          <AlchemyWorkbench />
        </div>

        <!-- 📋 Guild Notice Board -->
        <div class="absolute inset-0 {activeTab === 'guild' ? '' : 'hidden'}">
          <GuildNoticeBoard />
        </div>

        <!-- 🏰 Stronghold Manager & Room Point Upgrades -->
        <div class="absolute inset-0 {activeTab === 'stronghold' ? '' : 'hidden'}">
          <StrongholdDashboard />
        </div>

        <!-- 📚 Lore Wiki & Relational Graph -->
        <div class="absolute inset-0 {activeTab === 'lore' ? '' : 'hidden'}">
          <LoreWikiView />
        </div>

        <!-- 📜 Handout Studio -->
        <div class="absolute inset-0 {activeTab === 'handouts' ? '' : 'hidden'}">
          <HandoutStudioView />
        </div>

        <!-- 🎵 Dedicated Audio Studio View -->
        <div class="absolute inset-0 {activeTab === 'audio' ? '' : 'hidden'}">
          <div class="h-full flex flex-col items-center justify-center p-8 text-center space-y-4 bg-slate-950">
            <div class="w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-3xl shadow-lg">🎵</div>
            <div>
              <h2 class="text-lg font-black text-slate-100 uppercase tracking-wide">Audio Studio &amp; Dual-Bus Soundboard</h2>
              <p class="text-xs text-slate-400 mt-1 max-w-md">Control background ambience music with linear crossfades and trigger instant procedural sound effects.</p>
            </div>
            <button
              onclick={() => isAudioOpen = true}
              class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-indigo-600/20 flex items-center gap-2"
            >
              <span>🔊</span> Open Audio Studio Drawer
            </button>
          </div>
        </div>
      </div>
    </main>

    <!-- ═══════════════════════════════════════════════════════════════════════
         3. DUAL INDEPENDENT RIGHT UTILITY DOCK (NO LEGACY COIN PURSE)
    ════════════════════════════════════════════════════════════════════════ -->
    {#if isArchivistDockOpen || isCopilotDockOpen}
      <aside
        class="w-96 max-w-full bg-slate-900 border-l border-slate-800 flex flex-col shrink-0 z-20 shadow-2xl transition-all"
        aria-label="AI Utilities Dock"
      >
        <!-- Stacked / Split Layout -->
        {#if isArchivistDockOpen && isCopilotDockOpen}
          <div class="flex-1 min-h-0 flex flex-col divide-y divide-slate-800">
            <div class="h-1/2 min-h-0 flex flex-col">
              <ArchivistPanel />
            </div>
            <div class="h-1/2 min-h-0 flex flex-col">
              <CopilotPanel />
            </div>
          </div>
        {:else if isArchivistDockOpen}
          <div class="flex-1 min-h-0 flex flex-col">
            <ArchivistPanel />
          </div>
        {:else if isCopilotDockOpen}
          <div class="flex-1 min-h-0 flex flex-col">
            <CopilotPanel />
          </div>
        {/if}
      </aside>
    {/if}

  </div>

  <!-- Global Audio Drawer, Settings Modal, and Player Handout Overlay -->
  <AudioDrawer bind:isOpen={isAudioOpen} />
  <SettingsModal bind:isOpen={isSettingsOpen} />
  <PlayerHandoutModal />
</div>
