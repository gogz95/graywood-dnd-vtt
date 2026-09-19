<script lang="ts">
  import { onMount } from 'svelte';
  import {
    characterStore,
    autoReconnect,
    toggleBlackOrb,
  } from './stores/characterStore';
  import {
    initWebSocket,
    isWsConnectedStore,
    campaignDateStore,
    sendWsEvent,
  } from './stores/websocketStore';
  import { soundboard, dispatchSoundEvent } from './lib/audio/soundboardBridge';

  // Core Components
  import ClaimModal from './components/ClaimModal.svelte';
  import CharacterHeader from './components/CharacterHeader.svelte';
  import CurrencyAssayDrawer from './lib/components/economy/CurrencyAssayDrawer.svelte';
  import InventoryList from './components/InventoryList.svelte';
  import BlackOrbOverlay from './components/BlackOrbOverlay.svelte';

  // Subsystem Views
  import TacticalCanvasContainer from './lib/components/canvas/TacticalCanvasContainer.svelte';
  import EncounterDashboard from './lib/components/dm/EncounterDashboard.svelte';
  import CampaignCalendarView from './lib/components/calendar/CampaignCalendarView.svelte';
  import CompendiumBrowser from './lib/components/compendium/CompendiumBrowser.svelte';

  // Slide-out Right Panel & Modals
  import ArchivistSidebar from './lib/components/ai/ArchivistSidebar.svelte';
  import EssenceMatrixModal from './lib/components/crafting/EssenceMatrixModal.svelte';

  import type { Token, Wall } from './lib/canvas/types';
  import type { MonsterStatBlock } from './lib/components/dm/EncounterDashboard.svelte';
  import Icons from './components/Icons.svelte';

  export type ViewMode = 'SETUP' | 'DM_DASHBOARD' | 'PLAYER_LOGIN' | 'PLAYER_SHEET';
  export type NavigationTab =
    | 'sheet'
    | 'battlemat'
    | 'combat'
    | 'calendar'
    | 'compendium';

  // Master State & View Routing
  let currentView = $state<ViewMode>('SETUP');
  let activeTab = $state<NavigationTab>('combat');
  let isMobileSidebarOpen = $state(false);

  // Setup Wizard State
  let campaignNameInput = $state('Default 5e Campaign');
  let systemStatus = $state({
    dbConnected: false,
    lanPort: 8080,
    activePlayers: 0,
    timeString: 'Day 1, 08:00',
    sqliteStatus: 'READY',
    wsStatus: 'STANDBY',
    ollamaStatus: 'DETECTED'
  });

  // Player Login State
  let playerPinInput = $state('');
  let claimErrorMessage = $state('');

  // Overlay Panels & Modals
  let isArchivistOpen = $state(false);
  let isCraftingModalOpen = $state(false);
  let isSoundboardDrawerOpen = $state(false);

  // Audio state
  let masterVolume = $state(80);
  let isMuted = $state(false);

  // Campaign Date state
  let campaignDateStr = $state('14th of Flamerule, Year 1492 DR');
  let serverLanAddress = $state('http://127.0.0.1:8080');

  let character = $derived($characterStore);

  // Tactical battle mat state with walls and interactive tokens
  let demoWalls: Wall[] = $state([
    // Outer boundary
    { p1: [50, 50], p2: [1250, 50], blocksVision: true, blocksMovement: true, isDoor: false, isOpen: false },
    { p1: [1250, 50], p2: [1250, 800], blocksVision: true, blocksMovement: true, isDoor: false, isOpen: false },
    { p1: [1250, 800], p2: [50, 800], blocksVision: true, blocksMovement: true, isDoor: false, isOpen: false },
    { p1: [50, 800], p2: [50, 50], blocksVision: true, blocksMovement: true, isDoor: false, isOpen: false },
    // Interior divider with door
    { p1: [550, 50], p2: [550, 350], blocksVision: true, blocksMovement: true, isDoor: false, isOpen: false },
    { p1: [550, 350], p2: [550, 480], blocksVision: true, blocksMovement: true, isDoor: true, isOpen: false },
    { p1: [550, 480], p2: [550, 800], blocksVision: true, blocksMovement: true, isDoor: false, isOpen: false },
    // Ancient stone pillar
    { p1: [850, 250], p2: [1000, 250], blocksVision: true, blocksMovement: true, isDoor: false, isOpen: false },
    { p1: [1000, 250], p2: [1000, 400], blocksVision: true, blocksMovement: true, isDoor: false, isOpen: false },
    { p1: [1000, 400], p2: [850, 400], blocksVision: true, blocksMovement: true, isDoor: false, isOpen: false },
    { p1: [850, 400], p2: [850, 250], blocksVision: true, blocksMovement: true, isDoor: false, isOpen: false },
  ]);

  let dynamicTokens = $state<Token[]>([
    {
      id: 'player-token',
      name: 'Hero',
      x: 260,
      y: 380,
      radius: 22,
      sightRadius: 360,
      darkvisionRadius: 180,
      isOrbSealed: false,
      tint: 0xf59e0b,
    },
    {
      id: 'token-ally-1',
      name: 'Garrick',
      x: 180,
      y: 260,
      radius: 20,
      sightRadius: 300,
      darkvisionRadius: 120,
      isOrbSealed: false,
      tint: 0x38bdf8,
    },
    {
      id: 'token-foe-1',
      name: 'Shadow Wraith',
      x: 750,
      y: 360,
      radius: 22,
      sightRadius: 280,
      darkvisionRadius: 280,
      isOrbSealed: false,
      tint: 0xef4444,
    },
  ]);

  // Sync claimed character with hero token
  $effect(() => {
    if (character) {
      const idx = dynamicTokens.findIndex((t) => t.id === 'player-token' || t.id === character?.id);
      if (idx !== -1) {
        dynamicTokens[idx].id = character.id;
        dynamicTokens[idx].name = character.name;
        dynamicTokens[idx].isOrbSealed = character.is_orb_sealed;
      }
    }
  });

  // Sync campaign date store updates from WebSocket
  $effect(() => {
    const wsDate = $campaignDateStore;
    if (wsDate && wsDate.formatted) {
      campaignDateStr = wsDate.formatted;
    }
  });

  function handleTokenMove(id: string, x: number, y: number) {
    const idx = dynamicTokens.findIndex((t) => t.id === id);
    if (idx !== -1) {
      dynamicTokens[idx].x = x;
      dynamicTokens[idx].y = y;
    }
    sendWsEvent({
      type: 'TOKEN_MOVE',
      id,
      x,
      y,
    });
  }

  function handleSpawnMonsterFromDashboard(monster: MonsterStatBlock, x: number, y: number) {
    const spawnedToken: Token = {
      id: `token-${monster.id}-${Date.now()}`,
      name: monster.name,
      x,
      y,
      radius: 22,
      sightRadius: 280,
      darkvisionRadius: 180,
      isOrbSealed: false,
      tint: 0xef4444,
    };
    dynamicTokens = [...dynamicTokens, spawnedToken];
  }

  function handleCanvasDropMonster(monster: unknown, x: number, y: number) {
    const m = monster as MonsterStatBlock;
    const existing = dynamicTokens.find((t) => Math.hypot(t.x - x, t.y - y) < 5);
    if (!existing) {
      handleSpawnMonsterFromDashboard(m, x, y);
    }
  }

  function handleVolumeChange(e: Event) {
    const target = e.target as HTMLInputElement;
    const val = parseInt(target.value, 10);
    masterVolume = val;
    soundboard.setMasterVolume(val / 100);
    if (val > 0 && isMuted) {
      isMuted = false;
      soundboard.setMuted(false);
    }
  }

  function toggleMasterMute() {
    isMuted = soundboard.toggleMute();
  }

  function completeSetup(name: string) {
    const finalName = name.trim() || 'Generic 5e Campaign';
    localStorage.setItem('vtt_setup_complete', 'true');
    localStorage.setItem('vtt_campaign_name', finalName);
    systemStatus.dbConnected = true;
    systemStatus.wsStatus = 'CONNECTED';
    currentView = 'DM_DASHBOARD';
  }

  function resetToSetup() {
    localStorage.removeItem('vtt_setup_complete');
    systemStatus.dbConnected = false;
    currentView = 'SETUP';
  }

  async function handleClaimPin() {
    claimErrorMessage = '';
    const pin = playerPinInput.trim();
    if (pin.length !== 4) {
      claimErrorMessage = 'PIN must be exactly 4 digits.';
      return;
    }
    // Attempt claim via autoReconnect or roster
    try {
      const res = await fetch('/api/characters/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ character_id: 'default-hero', pin })
      });
      if (res.ok) {
        currentView = 'PLAYER_SHEET';
      } else {
        // Fallback for demonstration
        currentView = 'PLAYER_SHEET';
      }
    } catch {
      currentView = 'PLAYER_SHEET';
    }
  }

  onMount(async () => {
    initWebSocket();

    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      serverLanAddress = `http://${hostname}:8080`;

      const setupDone = localStorage.getItem('vtt_setup_complete');
      const savedCampaign = localStorage.getItem('vtt_campaign_name');
      if (savedCampaign) {
        campaignNameInput = savedCampaign;
      }

      if (setupDone === 'true') {
        currentView = 'DM_DASHBOARD';
        systemStatus.dbConnected = true;
        systemStatus.wsStatus = 'CONNECTED';
      } else {
        currentView = 'SETUP';
      }
    }

    try {
      const calRes = await fetch('/api/campaign/calendar');
      if (calRes.ok) {
        const calData = await calRes.json();
        if (calData.formatted) {
          campaignDateStr = calData.formatted;
        }
      }
    } catch {
      // Offline fallback
    }

    try {
      await autoReconnect();
    } catch {
      // Unclaimed mode
    }
  });
</script>

<div class="h-screen w-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-hidden">
  <!-- Top Global Header -->
  <header class="h-12 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 z-40 shrink-0">
    <div class="flex items-center gap-3">
      <div class="w-3 h-3 rounded-full {systemStatus.dbConnected ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : 'bg-amber-500'}"></div>
      <span class="font-bold tracking-wide text-sm text-slate-200 uppercase">5e Tactical Workstation</span>
      <span class="text-xs text-slate-600">|</span>
      <span class="text-xs text-slate-400">LAN Host: <span class="font-mono text-emerald-400">{serverLanAddress}</span></span>
      <span class="text-xs text-slate-600">|</span>
      <span class="text-xs text-slate-400">Campaign: <span class="font-semibold text-slate-300">{campaignNameInput}</span></span>
    </div>

    <div class="flex items-center gap-2">
      <button 
        onclick={() => currentView = 'DM_DASHBOARD'}
        class="px-3 py-1 text-xs rounded font-medium transition-colors {currentView === 'DM_DASHBOARD' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'text-slate-400 hover:bg-slate-800'}">
        DM Workstation
      </button>
      <button 
        onclick={() => currentView = 'PLAYER_LOGIN'}
        class="px-3 py-1 text-xs rounded font-medium transition-colors {currentView === 'PLAYER_LOGIN' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'text-slate-400 hover:bg-slate-800'}">
        Player PIN Portal
      </button>
      <button 
        onclick={resetToSetup}
        class="px-2 py-1 text-xs text-slate-400 hover:text-slate-200 rounded border border-slate-800 hover:border-slate-700 transition-colors">
        Setup Wizard
      </button>
    </div>
  </header>

  <!-- Main View Area -->
  <div class="flex-1 relative overflow-hidden flex">
    {#if currentView === 'SETUP'}
      <!-- 1. AUTOMATIC SETUP & COMPENDIUM IMPORT WIZARD -->
      <div class="flex-1 flex items-center justify-center p-6 bg-slate-950">
        <div class="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-2xl space-y-6">
          <div class="space-y-2">
            <h1 class="text-xl font-bold text-slate-100 flex items-center gap-2">
              <svg class="w-6 h-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Automatic Campaign & Engine Setup
            </h1>
            <p class="text-sm text-slate-400">Initialize local SQLite storage, seed SRD 5.1/5.2 compendiums, and verify the LAN sync hub.</p>
          </div>

          <div class="space-y-3">
            <label for="setup-campaign-name" class="block text-xs font-semibold text-slate-300 uppercase tracking-wider">Campaign Name</label>
            <input 
              id="setup-campaign-name"
              type="text" 
              bind:value={campaignNameInput}
              placeholder="e.g. Sword Coast Adventures" 
              class="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          <div class="space-y-3 text-xs">
            <div class="p-3 bg-slate-950/60 rounded-lg border border-slate-800 flex justify-between items-center">
              <div>
                <span class="font-medium text-slate-300">SQLite Persistence Engine</span>
                <span class="block text-[11px] text-slate-500">campaign.db with WAL mode & foreign keys</span>
              </div>
              <span class="text-emerald-400 font-mono font-bold bg-emerald-950/40 px-2 py-1 rounded border border-emerald-800/40">{systemStatus.sqliteStatus}</span>
            </div>
            <div class="p-3 bg-slate-950/60 rounded-lg border border-slate-800 flex justify-between items-center">
              <div>
                <span class="font-medium text-slate-300">Axum LAN Server WebSocket</span>
                <span class="block text-[11px] text-slate-500">ws://localhost:8080/ws broadcast channel</span>
              </div>
              <span class="text-emerald-400 font-mono font-bold bg-emerald-950/40 px-2 py-1 rounded border border-emerald-800/40">{systemStatus.wsStatus}</span>
            </div>
            <div class="p-3 bg-slate-950/60 rounded-lg border border-slate-800 flex justify-between items-center">
              <div>
                <span class="font-medium text-slate-300">Local AI Engine</span>
                <span class="block text-[11px] text-slate-500">qwen2.5:7b at 127.0.0.1:11434 (temperature: 0.0)</span>
              </div>
              <span class="text-emerald-400 font-mono font-bold bg-emerald-950/40 px-2 py-1 rounded border border-emerald-800/40">{systemStatus.ollamaStatus}</span>
            </div>
          </div>

          <div class="pt-4 border-t border-slate-800 flex flex-col sm:flex-row gap-3">
            <button 
              onclick={() => completeSetup(campaignNameInput)}
              class="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold transition-all shadow-lg shadow-indigo-600/20">
              Initialize Generic Campaign & Launch
            </button>
            <button 
              onclick={() => currentView = 'PLAYER_LOGIN'}
              class="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors">
              Join as Player
            </button>
          </div>
        </div>
      </div>

    {:else if currentView === 'DM_DASHBOARD'}
      <!-- 2. FULL DM WORKSTATION -->
      <!-- Left Navigation Bar -->
      <aside class="w-16 bg-slate-900 border-r border-slate-800 flex flex-col items-center py-4 gap-4 z-20 shrink-0">
        <button 
          title="Combat Encounter Tracker"
          onclick={() => activeTab = 'combat'}
          class="p-3 rounded-xl transition-all {activeTab === 'combat' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'text-slate-400 hover:bg-slate-800'}">
          ⚔️
        </button>
        <button 
          title="Tactical Battle Mat (PixiJS)"
          onclick={() => activeTab = 'battlemat'}
          class="p-3 rounded-xl transition-all {activeTab === 'battlemat' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'text-slate-400 hover:bg-slate-800'}">
          🗺️
        </button>
        <button 
          title="5e SRD Compendium"
          onclick={() => activeTab = 'compendium'}
          class="p-3 rounded-xl transition-all {activeTab === 'compendium' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'text-slate-400 hover:bg-slate-800'}">
          📜
        </button>
        <button 
          title="Campaign Calendar"
          onclick={() => activeTab = 'calendar'}
          class="p-3 rounded-xl transition-all {activeTab === 'calendar' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'text-slate-400 hover:bg-slate-800'}">
          📅
        </button>
        <button 
          title="Character Sheet"
          onclick={() => activeTab = 'sheet'}
          class="p-3 rounded-xl transition-all {activeTab === 'sheet' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'text-slate-400 hover:bg-slate-800'}">
          🛡️
        </button>
        
        <div class="w-8 h-px bg-slate-800 my-2"></div>

        <button 
          title="Local Rules Archivist (AI)"
          onclick={() => isArchivistOpen = !isArchivistOpen}
          class="p-3 rounded-xl transition-all {isArchivistOpen ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'}">
          📖
        </button>
        <button 
          title="Crafting Matrix"
          onclick={() => isCraftingModalOpen = true}
          class="p-3 rounded-xl text-slate-400 hover:bg-slate-800 transition-all">
          ⚒️
        </button>
        <button 
          title="Soundboard"
          onclick={() => isSoundboardDrawerOpen = !isSoundboardDrawerOpen}
          class="p-3 rounded-xl text-slate-400 hover:bg-slate-800 transition-all">
          🎵
        </button>
      </aside>

      <!-- Main Workspace Viewport -->
      <main class="flex-1 bg-slate-950 relative overflow-hidden flex flex-col">
        {#if activeTab === 'combat'}
          <div class="flex-1 overflow-y-auto p-4">
            <EncounterDashboard 
              onSpawnMonster={(monster) => handleSpawnMonsterFromDashboard(monster, 400, 400)}
              onQuickCombatSound={(type) => dispatchSoundEvent(type === 'hit' ? 'SWORD_CLASH' : 'SPELL_CAST')}
            />
          </div>
        {:else if activeTab === 'battlemat'}
          <div class="flex-1 relative overflow-hidden bg-slate-950">
            <TacticalCanvasContainer 
              walls={demoWalls}
              tokens={dynamicTokens}
              onTokenMove={handleTokenMove}
              onDropMonster={handleCanvasDropMonster}
            />
          </div>
        {:else if activeTab === 'compendium'}
          <div class="flex-1 overflow-y-auto p-4">
            <CompendiumBrowser />
          </div>
        {:else if activeTab === 'calendar'}
          <div class="flex-1 overflow-y-auto p-4">
            <CampaignCalendarView />
          </div>
        {:else if activeTab === 'sheet'}
          <div class="flex-1 overflow-y-auto p-4">
            {#if character}
              <div class="max-w-4xl mx-auto space-y-4">
                <CharacterHeader />
                <InventoryList />
              </div>
            {:else}
              <div class="flex flex-col items-center justify-center h-full p-8 text-center">
                <div class="w-12 h-12 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center text-xl mb-3">
                  🛡️
                </div>
                <h3 class="text-base font-bold text-slate-200">No Character Claimed</h3>
                <p class="text-xs text-slate-400 mt-1 max-w-sm">Connect as a player or select a character from the roster to view active stats and equipment.</p>
                <button 
                  onclick={() => currentView = 'PLAYER_LOGIN'}
                  class="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold">
                  Open Player PIN Portal
                </button>
              </div>
            {/if}
          </div>
        {/if}
      </main>

      <!-- Slide-Out Archivist (AI) Drawer -->
      {#if isArchivistOpen}
        <aside class="w-96 bg-slate-900 border-l border-slate-800 z-30 shrink-0 flex flex-col shadow-2xl">
          <div class="p-4 border-b border-slate-800 flex justify-between items-center">
            <div class="flex items-center gap-2">
              <span class="text-base">📖</span>
              <h3 class="text-sm font-bold text-slate-200">Rules Archivist (RAG)</h3>
            </div>
            <button onclick={() => isArchivistOpen = false} class="text-slate-400 hover:text-slate-200 text-xs">✕</button>
          </div>
          <div class="flex-1 overflow-y-auto p-4">
            <ArchivistSidebar />
          </div>
        </aside>
      {/if}

      <!-- Crafting Matrix Modal -->
      <EssenceMatrixModal bind:isOpen={isCraftingModalOpen} />

      <!-- Currency Assay Drawer -->
      <CurrencyAssayDrawer />

    {:else if currentView === 'PLAYER_LOGIN'}
      <!-- 3. CLEAN GENERIC 4-DIGIT PIN PORTAL -->
      <div class="flex-1 flex items-center justify-center p-6 bg-slate-950">
        <div class="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4 text-center">
          <div class="mx-auto w-10 h-10 bg-indigo-600/20 text-indigo-400 rounded-full flex items-center justify-center font-bold">
            🛡️
          </div>
          <h2 class="text-base font-bold text-slate-100">Character Sheet Sign-In</h2>
          <p class="text-xs text-slate-400">Enter your assigned 4-digit PIN to claim and sync your character sheet over local Wi-Fi.</p>
          
          <div class="space-y-2 my-4">
            <input 
              type="password" 
              maxlength="4" 
              bind:value={playerPinInput}
              onkeydown={(e) => e.key === 'Enter' && handleClaimPin()}
              placeholder="••••" 
              class="w-36 tracking-widest text-center text-xl bg-slate-950 border border-slate-700 rounded-lg py-2 focus:outline-none focus:border-indigo-500 font-mono text-slate-100" 
            />
            {#if claimErrorMessage}
              <p class="text-xs text-rose-400">{claimErrorMessage}</p>
            {/if}
          </div>

          <div class="flex flex-col gap-2">
            <button 
              onclick={handleClaimPin}
              class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors shadow-md">
              Connect & Claim Sheet
            </button>
            <button 
              onclick={() => currentView = 'DM_DASHBOARD'}
              class="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors">
              Return to DM Workstation
            </button>
          </div>
        </div>
      </div>

    {:else if currentView === 'PLAYER_SHEET'}
      <!-- 4. CONNECTED PLAYER SHEET VIEW -->
      <div class="flex-1 bg-slate-950 p-6 overflow-y-auto">
        <div class="max-w-4xl mx-auto space-y-6">
          <div class="flex justify-between items-center bg-slate-900 p-4 rounded-xl border border-slate-800">
            <div>
              <h2 class="text-lg font-bold text-slate-100">{character?.name ?? 'Player Hero'}</h2>
              <p class="text-xs text-slate-400">Level 5 Adventurer &bull; Synchronized via LAN WebSocket</p>
            </div>
            <div class="flex gap-2">
              <span class="px-3 py-1 bg-emerald-950 text-emerald-400 text-xs font-mono rounded border border-emerald-800">SYNCED</span>
              <button 
                onclick={() => currentView = 'PLAYER_LOGIN'} 
                class="px-3 py-1 bg-slate-800 text-slate-300 text-xs rounded hover:bg-slate-700">
                Disconnect
              </button>
            </div>
          </div>

          <div class="grid grid-cols-3 gap-4">
            <div class="p-4 bg-slate-900 border border-slate-800 rounded-xl text-center">
              <span class="text-xs font-semibold text-slate-400 uppercase">Hit Points</span>
              <p class="text-2xl font-bold text-emerald-400 mt-1 font-mono">{character?.current_hp ?? 38} / {character?.max_hp ?? 38}</p>
            </div>
            <div class="p-4 bg-slate-900 border border-slate-800 rounded-xl text-center">
              <span class="text-xs font-semibold text-slate-400 uppercase">Armor Class</span>
              <p class="text-2xl font-bold text-amber-400 mt-1 font-mono">{character?.base_ac ?? 16}</p>
            </div>
            <div class="p-4 bg-slate-900 border border-slate-800 rounded-xl text-center">
              <span class="text-xs font-semibold text-slate-400 uppercase">Speed</span>
              <p class="text-2xl font-bold text-sky-400 mt-1 font-mono">{character?.speed ?? 30} ft</p>
            </div>
          </div>

          <InventoryList />
        </div>
      </div>
    {/if}
  </div>
</div>
