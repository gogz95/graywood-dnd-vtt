<script lang="ts">
  import '../app.css';
  import { onMount, onDestroy } from 'svelte';

  // ── Subsystem components ───────────────────────────────────────────────────
  import PartyRosterView    from '../lib/components/party/PartyRosterView.svelte';
  import EncounterDashboard from '../lib/components/dm/EncounterDashboard.svelte';
  import TacticalCanvasContainer from '../lib/components/canvas/TacticalCanvasContainer.svelte';
  import DualChatPanel      from '../lib/components/ai/DualChatPanel.svelte';
  import CompendiumBrowser  from '../lib/components/compendium/CompendiumBrowser.svelte';
  import CalendarWidget     from '../lib/components/time/CalendarWidget.svelte';
  import WorldAtlasContainer from '../lib/components/atlas/WorldAtlasContainer.svelte';
  import LoreWikiView from '../lib/components/lore/LoreWikiView.svelte';
  import HandoutStudioView from '../lib/components/handouts/HandoutStudioView.svelte';
  import PlayerHandoutModal from '../lib/components/handouts/PlayerHandoutModal.svelte';
  import Sidebar, { type DmTab } from '../lib/components/navigation/Sidebar.svelte';
  import SoundboardDrawer   from '../lib/components/audio/SoundboardDrawer.svelte';
  import QuickReferenceDrawer from '../lib/components/dm/QuickReferenceDrawer.svelte';
  import SettingsModal      from '../lib/components/settings/SettingsModal.svelte';
  import FloatingPanel      from '../lib/components/ui/FloatingPanel.svelte';
  import SourceExplorerDrawer from '../lib/components/sources/SourceExplorerDrawer.svelte';
  import { floatingWindowsStore } from '../lib/stores/floatingWindowsStore.svelte';
  import { initAutoSaver, type CampaignBundle } from '../lib/utils/campaignPersistence';
  import { registerGlobalDropZone, type DroppedAsset } from '../lib/utils/assetDrop';

  // ── View state ─────────────────────────────────────────────────────────────
  type ViewMode = 'SETUP' | 'DM_DASHBOARD' | 'PLAYER_LOGIN' | 'PLAYER_SHEET';

  let currentView = $state<ViewMode>('SETUP');
  let activeTab   = $state<DmTab>('encounter');

  // ── Campaign setup ─────────────────────────────────────────────────────────
  let campaignName = $state('My 5e Campaign');
  let systemStatus = $state({
    dbConnected: false, lanPort: 8080,
    sqliteStatus: 'READY', wsStatus: 'STANDBY', ollamaStatus: 'DETECTED'
  });

  // ── Calendar time string (updated by CalendarWidget) ──────────────────────
  let campaignTime = $state('');

  // ── Player PIN login ───────────────────────────────────────────────────────
  let playerPin = $state('');
  let playerPinError = $state('');
  let loggedInPin = $state('');

  // ── Drawers ────────────────────────────────────────────────────────────────
  let audioOpen    = $state(false);
  let quickRefOpen = $state(false);
  let settingsOpen = $state(false);

  // ── Drop zone feedback ─────────────────────────────────────────────────────
  let lastDrop = $state<string | null>(null);
  let dropCleanup: (() => void) | null = null;

  // ── Party roster (shared with player login) ────────────────────────────────
  function getRoster(): { pin: string; name: string }[] {
    try {
      const raw = localStorage.getItem('vtt_party_roster');
      if (raw) return JSON.parse(raw) as { pin: string; name: string }[];
    } catch { /* */ }
    return [];
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  onMount(() => {
    const done = localStorage.getItem('vtt_setup_complete');
    const name = localStorage.getItem('vtt_campaign_name');
    if (name) campaignName = name;
    currentView = done === 'true' ? 'DM_DASHBOARD' : 'SETUP';
    if (done === 'true') { systemStatus.dbConnected = true; systemStatus.wsStatus = 'CONNECTED'; }

    window.addEventListener('vtt:switch-tab', handleSwitchTab);
    window.addEventListener('vtt:load-battle-map', handleAutoBattleMat);
    window.addEventListener('vtt:campaign-loaded', handleCampaignLoaded);
    window.addEventListener('vtt:toggle-audio', handleToggleAudio);
    window.addEventListener('vtt:toggle-quick-ref', handleToggleQuickRef);

    stopAutoSaver = initAutoSaver();

    dropCleanup = registerGlobalDropZone((asset: DroppedAsset) => {
      lastDrop = asset.fileName;
      if (asset.category === 'audio') floatingWindowsStore.open('audio');
      setTimeout(() => { lastDrop = null; }, 3500);
    });
  });

  onDestroy(() => {
    dropCleanup?.();
    stopAutoSaver?.();
    window.removeEventListener('vtt:switch-tab', handleSwitchTab);
    window.removeEventListener('vtt:load-battle-map', handleAutoBattleMat);
    window.removeEventListener('vtt:campaign-loaded', handleCampaignLoaded);
    window.removeEventListener('vtt:toggle-audio', handleToggleAudio);
    window.removeEventListener('vtt:toggle-quick-ref', handleToggleQuickRef);
  });

  function handleToggleAudio() {
    floatingWindowsStore.open('audio');
  }

  function handleToggleQuickRef() {
    quickRefOpen = !quickRefOpen;
  }

  let stopAutoSaver: (() => void) | null = null;

  function handleCampaignLoaded(e: Event) {
    const detail = (e as CustomEvent<{ bundle: CampaignBundle }>).detail;
    if (detail?.bundle?.metadata?.campaignName) {
      campaignName = detail.bundle.metadata.campaignName;
    }
    lastDrop = `Restored: ${campaignName}`;
    setTimeout(() => { lastDrop = null; }, 3500);
  }

  function handleSwitchTab(e: Event) {
    const detail = (e as CustomEvent<{ tab: DmTab }>).detail;
    if (detail?.tab) activeTab = detail.tab;
  }

  function handleAutoBattleMat() {
    activeTab = 'battlemat';
  }

  function completeSetup() {
    const name = campaignName.trim() || 'My 5e Campaign';
    localStorage.setItem('vtt_setup_complete', 'true');
    localStorage.setItem('vtt_campaign_name', name);
    campaignName = name;
    systemStatus.dbConnected = true;
    systemStatus.wsStatus = 'CONNECTED';
    currentView = 'DM_DASHBOARD';
  }

  function resetSetup() {
    localStorage.removeItem('vtt_setup_complete');
    systemStatus.dbConnected = false;
    systemStatus.wsStatus = 'STANDBY';
    currentView = 'SETUP';
  }

  function handlePlayerLogin() {
    playerPinError = '';
    const pin = playerPin.trim();
    if (pin.length !== 4) { playerPinError = 'PIN must be exactly 4 digits.'; return; }
    const roster = getRoster();
    const match = roster.find(m => m.pin === pin);
    if (match) { loggedInPin = pin; currentView = 'PLAYER_SHEET'; }
    else { playerPinError = 'Invalid PIN. Ask your DM for your assigned 4-digit PIN.'; }
  }

  // Nav tab config matching strictly the 8 primary workstation subsystems
  const DM_TABS: { id: DmTab; icon: string; label: string; title: string }[] = [
    { id: 'party',      icon: '👥', label: 'Party',      title: 'Active Party Roster & PIN Controls' },
    { id: 'encounter',  icon: '⚔️', label: 'Combat',     title: 'Encounter & Initiative Tracker' },
    { id: 'battlemat',  icon: '🗺️', label: 'Tactical',  title: 'Tactical Mat (PixiJS Canvas)' },
    { id: 'lore',       icon: '📚', label: 'Lore',       title: 'Relational Lore Graph & Trade Valuation' },
    { id: 'handouts',   icon: '📜', label: 'Handouts',   title: 'Parchment Handout Studio & Broadcast' },
  ];
</script>

<div class="h-screen w-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-hidden">

  <!-- ═══════════════════════════════════════════════════════════════════════
       TOP HEADER
  ════════════════════════════════════════════════════════════════════════════ -->
  <header class="h-11 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 z-20 shrink-0">
    <div class="flex items-center gap-3 min-w-0">
      <div class="w-2.5 h-2.5 rounded-full shrink-0 {systemStatus.dbConnected ? 'bg-emerald-500 shadow-sm shadow-emerald-500/60' : 'bg-amber-500'}"></div>
      <span class="font-bold text-xs text-slate-200 uppercase tracking-widest whitespace-nowrap">5e Workstation</span>
      <span class="text-slate-700 text-xs">|</span>
      <span class="text-xs text-slate-400 truncate">{campaignName}</span>
      {#if campaignTime}
        <span class="text-slate-700 text-xs">|</span>
        <span class="text-[10px] font-mono text-amber-400/80 truncate">{campaignTime}</span>
      {/if}
    </div>

    <div class="flex items-center gap-1 shrink-0">
      {#if currentView === 'DM_DASHBOARD'}
        <button onclick={() => currentView = 'PLAYER_LOGIN'}
          class="px-2.5 py-1 text-xs rounded font-medium transition-colors text-slate-400 hover:bg-slate-800">👤 Player</button>
      {:else if currentView !== 'SETUP'}
        <button onclick={() => currentView = 'DM_DASHBOARD'}
          class="px-2.5 py-1 text-xs rounded font-medium transition-colors text-slate-400 hover:bg-slate-800">🖥 DM View</button>
      {/if}
      <button onclick={resetSetup}
        class="px-2 py-1 text-xs text-slate-500 hover:text-slate-300 rounded border border-slate-800 hover:border-slate-700 transition-colors">⚙ Setup</button>
      <span class="w-px h-4 bg-slate-800 mx-0.5"></span>

      <!-- Global Floating Toggles (Exclusively in Top Navigation Bar) -->
      <button
        onclick={() => floatingWindowsStore.toggleWindow('sources')}
        class="flex items-center gap-1 px-2.5 py-1 text-xs rounded transition-colors {floatingWindowsStore.windows.sources.isOpen ? 'bg-indigo-700 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-800 border border-transparent'}"
        title="Local Source Engine & Rulebook Explorer (NotebookLM-Style)"
      >
        📚 Sources
      </button>

      <button
        onclick={() => floatingWindowsStore.toggleWindow('copilot')}
        class="flex items-center gap-1 px-2.5 py-1 text-xs rounded transition-colors {floatingWindowsStore.windows.copilot.isOpen ? 'bg-indigo-700 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-800 border border-transparent'}"
        title="Session Co-Pilot (Live DM Terminal)"
      >
        🤖 Co-Pilot
      </button>

      <button
        onclick={() => floatingWindowsStore.toggleWindow('archivist')}
        class="flex items-center gap-1 px-2.5 py-1 text-xs rounded transition-colors {floatingWindowsStore.windows.archivist.isOpen ? 'bg-indigo-700 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-800 border border-transparent'}"
        title="Rules Archivist (SRD & Lore RAG)"
      >
        📖 Archivist
      </button>

      <button id="open-audio"
        onclick={() => floatingWindowsStore.toggleWindow('audio')}
        class="flex items-center gap-1 px-2.5 py-1 text-xs rounded transition-colors {floatingWindowsStore.windows.audio.isOpen ? 'bg-indigo-700/30 text-indigo-300 border border-indigo-700/40' : 'text-slate-400 hover:bg-slate-800 border border-transparent'}"
        title="Soundboard & Atmospheric Audio">
        🎵 Audio
      </button>
      <button id="open-settings"
        onclick={() => { settingsOpen = !settingsOpen; if (settingsOpen) audioOpen = false; }}
        class="flex items-center gap-1 px-2.5 py-1 text-xs rounded transition-colors {settingsOpen ? 'bg-indigo-700 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-800 border border-transparent'}"
        title="Settings & Campaign Persistence">
        ⚙️ Settings
      </button>
    </div>
  </header>

  <!-- ═══════════════════════════════════════════════════════════════════════
       MAIN VIEW ROUTER
  ════════════════════════════════════════════════════════════════════════════ -->
  <div class="flex-1 overflow-hidden flex min-h-0">

    <!-- ─── SETUP WIZARD ─────────────────────────────────────────────────── -->
    {#if currentView === 'SETUP'}
      <div class="flex-1 flex items-center justify-center p-6 bg-slate-950">
        <div class="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-6">
          <div class="space-y-1.5">
            <h1 class="text-xl font-black text-slate-100 flex items-center gap-2.5">
              <span class="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-base">⚙️</span>
              Campaign Initialization
            </h1>
            <p class="text-sm text-slate-400">Configure your local 5e Workstation. All data is stored on this machine.</p>
          </div>

          <div class="space-y-2">
            <label for="campaign-name-input" class="text-xs font-bold text-slate-400 uppercase tracking-wider">Campaign Name</label>
            <input id="campaign-name-input" type="text" bind:value={campaignName}
              placeholder="My 5e Campaign"
              class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors" />
          </div>

          <div class="space-y-2 text-xs">
            {#each [
              { label: 'SQLite Persistence', detail: 'campaign.db · WAL mode', status: systemStatus.sqliteStatus, color: 'emerald' },
              { label: 'LAN WebSocket Hub',  detail: `ws://localhost:${systemStatus.lanPort}/ws`, status: systemStatus.wsStatus, color: 'emerald' },
              { label: 'Local AI Engine',    detail: 'Ollama qwen2.5:7b on port 11434', status: systemStatus.ollamaStatus, color: 'emerald' },
            ] as row}
              <div class="p-3 bg-slate-950/60 rounded-xl border border-slate-800 flex justify-between items-center">
                <div>
                  <span class="font-semibold text-slate-300">{row.label}</span>
                  <span class="block text-[10px] text-slate-600">{row.detail}</span>
                </div>
                <span class="font-mono font-bold text-xs px-2 py-0.5 rounded border text-emerald-400 bg-emerald-950/40 border-emerald-800/40">{row.status}</span>
              </div>
            {/each}
          </div>

          <div class="pt-2 flex gap-3">
            <button onclick={completeSetup} class="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-600/20">
              Initialize &amp; Launch Workstation
            </button>
            <button onclick={() => currentView = 'PLAYER_LOGIN'} class="px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors">
              Join as Player
            </button>
          </div>
        </div>
      </div>

    <!-- ─── DM DASHBOARD ──────────────────────────────────────────────────── -->
    {:else if currentView === 'DM_DASHBOARD'}
      <!-- Vertical sidebar nav dock -->
      <Sidebar bind:activeTab />

      <!-- Tab panel -->
      <main class="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col">
        <!-- Tab title bar -->
        <div class="flex items-center gap-2 px-4 h-9 border-b border-slate-800 bg-slate-900/60 shrink-0">
          <span class="text-[11px] font-bold uppercase tracking-widest text-slate-400">
            {DM_TABS.find(t => t.id === activeTab)?.title ?? activeTab}
          </span>
          <div class="flex-1"></div>
          <span class="text-[10px] font-mono text-slate-700">LAN :{systemStatus.lanPort}</span>
        </div>

        <!-- Panels — only active is visible, all preserved in DOM for state retention -->
        <div class="flex-1 min-h-0 overflow-hidden relative">
          <div class="absolute inset-0 {activeTab === 'party'      ? '' : 'hidden'}"><PartyRosterView /></div>
          <div class="absolute inset-0 {activeTab === 'encounter'  ? '' : 'hidden'}"><EncounterDashboard /></div>
          <div class="absolute inset-0 {activeTab === 'battlemat'  ? '' : 'hidden'}"><TacticalCanvasContainer /></div>
          <div class="absolute inset-0 {activeTab === 'lore'       ? '' : 'hidden'}"><LoreWikiView /></div>
          <div class="absolute inset-0 {activeTab === 'handouts'   ? '' : 'hidden'}"><HandoutStudioView /></div>
        </div>
      </main>

    <!-- ─── PLAYER LOGIN ───────────────────────────────────────────────────── -->
    {:else if currentView === 'PLAYER_LOGIN'}
      <div class="flex-1 flex items-center justify-center p-6 bg-slate-950">
        <div class="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-7 text-center space-y-5 shadow-2xl">
          <div class="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/20 flex items-center justify-center mx-auto text-2xl">🛡️</div>
          <div>
            <h2 class="text-lg font-bold text-slate-100">Character Sign-In</h2>
            <p class="text-xs text-slate-400 mt-1">Enter your 4-digit PIN to claim your character sheet.</p>
          </div>
          <div class="space-y-3">
            <input
              type="password"
              maxlength="4"
              bind:value={playerPin}
              onkeydown={(e) => { if (e.key === 'Enter') handlePlayerLogin(); }}
              placeholder="••••"
              class="w-32 text-center tracking-[0.5em] text-2xl font-mono bg-slate-950 border border-slate-700 rounded-xl py-3 focus:outline-none focus:border-indigo-500 text-slate-100 mx-auto block"
            />
            {#if playerPinError}
              <p class="text-xs text-rose-400">{playerPinError}</p>
            {/if}
          </div>
          <div class="flex flex-col gap-2">
            <button onclick={handlePlayerLogin} class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-xl transition-colors shadow">
              Connect &amp; Claim Sheet
            </button>
            <button onclick={() => currentView = 'DM_DASHBOARD'} class="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl transition-colors">
              Return to DM Workstation
            </button>
          </div>
        </div>
      </div>

    <!-- ─── PLAYER SHEET ───────────────────────────────────────────────────── -->
    {:else if currentView === 'PLAYER_SHEET'}
      {@const roster = getRoster()}
      {@const character = roster.find(m => m.pin === loggedInPin)}
      <div class="flex-1 bg-slate-950 p-6 overflow-y-auto">
        <div class="max-w-2xl mx-auto space-y-5">
          <div class="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div>
              <h2 class="text-xl font-black text-slate-100">{character?.name ?? 'Character'}</h2>
              <p class="text-xs text-slate-400 mt-0.5">Connected · PIN {loggedInPin} · Synced via LAN WebSocket</p>
            </div>
            <div class="flex items-center gap-2">
              <span class="px-3 py-1 bg-emerald-950 text-emerald-400 text-xs font-mono font-bold rounded-lg border border-emerald-800/40">SYNCED</span>
              <button onclick={() => { currentView = 'PLAYER_LOGIN'; playerPin = ''; loggedInPin = ''; }} class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition-colors">Disconnect</button>
            </div>
          </div>
          <div class="p-6 bg-slate-900 border border-slate-800 rounded-2xl text-center text-slate-500 text-sm space-y-2">
            <p class="text-2xl">📋</p>
            <p class="font-semibold text-slate-400">Full Character Sheet</p>
            <p class="text-xs text-slate-600">Character sheet details are managed by the DM in the Party tab and synchronized over the local network.</p>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- ═══════════════════════════════════════════════════════════════════════
       GLOBAL OVERLAYS
  ════════════════════════════════════════════════════════════════════════════ -->

  <!-- Drop toast -->
  {#if lastDrop}
    <div class="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900 border border-slate-700 shadow-2xl rounded-xl px-4 py-2.5 flex items-center gap-2.5 text-xs font-medium text-slate-200 pointer-events-none animate-pulse">
      <span class="text-indigo-400">📂</span> Ingested: <span class="font-mono text-emerald-400">{lastDrop}</span>
    </div>
  {/if}

  <!-- Modals & Drawers -->
  <SoundboardDrawer bind:isOpen={audioOpen} />
  <QuickReferenceDrawer bind:isOpen={quickRefOpen} />
  <SettingsModal bind:isOpen={settingsOpen} />
  <PlayerHandoutModal />

  <!-- Global Non-Blurring Floating Window Shells -->
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
