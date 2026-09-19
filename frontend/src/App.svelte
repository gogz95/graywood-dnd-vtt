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
  import OstravaGazetteerModal from './lib/components/settlement/OstravaGazetteerModal.svelte';

  import type { Token, Wall } from './lib/canvas/types';
  import type { MonsterStatBlock } from './lib/components/dm/EncounterDashboard.svelte';
  import Icons from './components/Icons.svelte';

  export type NavigationTab =
    | 'sheet'
    | 'battlemat'
    | 'combat'
    | 'calendar'
    | 'compendium';

  let character = $derived($characterStore);
  let isCheckingAuth = $state(true);
  let activeTab = $state<NavigationTab>('sheet');
  let isMobileSidebarOpen = $state(false);

  // Overlay Panels & Modals
  let isArchivistOpen = $state(false);
  let isCraftingModalOpen = $state(false);
  let isGazetteerModalOpen = $state(false);
  let isSoundboardDrawerOpen = $state(false);

  // Audio state
  let masterVolume = $state(80);
  let isMuted = $state(false);

  // Campaign Date state (derived from websocket store or fallback)
  let campaignDateStr = $state('14th of Umbrel, Year 1428 G.E.');
  let serverLanAddress = $state('http://192.168.1.142:8080');

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

  onMount(async () => {
    initWebSocket();

    // Determine host IP or hostname for LAN header display
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      serverLanAddress = `http://${hostname}:8080`;
    }

    try {
      // Fetch initial campaign date from calendar endpoint
      const calRes = await fetch('/api/campaign/calendar');
      if (calRes.ok) {
        const calData = await calRes.json();
        if (calData.calendars?.chancellery?.formatted) {
          campaignDateStr = calData.calendars.chancellery.formatted;
        }
      }
    } catch {
      // Keep default canonical date on initial offline load
    }

    try {
      await autoReconnect();
    } finally {
      isCheckingAuth = false;
    }
  });
</script>

<div class="min-h-screen bg-[#07080d] text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-black">
  {#if isCheckingAuth}
    <div class="flex-1 flex flex-col items-center justify-center p-6 text-center">
      <div class="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center animate-spin mb-4 shadow-xl shadow-amber-500/10">
        <Icons name="refresh" size={28} />
      </div>
      <h2 class="text-base font-black text-slate-200 font-serif tracking-wide">ALEAMOS DM WORKSTATION</h2>
      <p class="text-xs text-amber-200/60 mt-1">Authenticating secure campaign token session...</p>
    </div>
  {:else if !character}
    <ClaimModal />
  {:else}
    <!-- Master Desktop Layout Frame -->
    <div class="flex-1 flex overflow-hidden">
      <!-- 1. PERSISTENT LEFT SIDEBAR NAVIGATION -->
      <aside
        class="w-64 bg-[#090b12] border-r border-amber-900/40 flex flex-col justify-between shrink-0 z-30 transition-transform duration-200 {
          isMobileSidebarOpen ? 'translate-x-0 fixed inset-y-0 left-0 shadow-2xl' : 'hidden md:flex'
        }"
        aria-label="Campaign Workspace Navigation"
      >
        <!-- Brand Insignia & Workspace Title -->
        <div class="p-4 border-b border-amber-900/30">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-950/40 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-md">
              <Icons name="shield" size={22} />
            </div>
            <div>
              <h1 class="text-sm font-black text-slate-100 uppercase tracking-widest font-serif flex items-center gap-1.5">
                Aleamos
                <span class="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 font-mono text-[9px] font-bold">
                  v2.0
                </span>
              </h1>
              <p class="text-[10px] text-amber-200/50 uppercase tracking-wider font-mono">
                DM Workstation
              </p>
            </div>
          </div>
        </div>

        <!-- Navigation Links Stack -->
        <nav class="flex-1 p-3 space-y-1.5 overflow-y-auto">
          <div class="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500 font-serif">
            Command Center
          </div>

          <!-- 1. Home / Character Sheet -->
          <button
            onclick={() => {
              activeTab = 'sheet';
              isMobileSidebarOpen = false;
            }}
            class="w-full px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 {
              activeTab === 'sheet'
                ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20 font-black'
                : 'text-slate-300 hover:bg-dark-800 hover:text-amber-300'
            }"
          >
            <Icons name="shield" size={16} />
            <span>Character Sheet</span>
          </button>

          <!-- 2. Tactical Battle Mat -->
          <button
            onclick={() => {
              activeTab = 'battlemat';
              isMobileSidebarOpen = false;
            }}
            class="w-full px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 {
              activeTab === 'battlemat'
                ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20 font-black'
                : 'text-slate-300 hover:bg-dark-800 hover:text-amber-300'
            }"
          >
            <Icons name="map" size={16} />
            <span>Tactical Battle Mat</span>
          </button>

          <!-- 3. Combat & Encounter -->
          <button
            onclick={() => {
              activeTab = 'combat';
              isMobileSidebarOpen = false;
            }}
            class="w-full px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 {
              activeTab === 'combat'
                ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20 font-black'
                : 'text-slate-300 hover:bg-dark-800 hover:text-amber-300'
            }"
          >
            <Icons name="sword" size={16} />
            <span>Combat & Encounter</span>
          </button>

          <!-- 4. Campaign Calendar & Log -->
          <button
            onclick={() => {
              activeTab = 'calendar';
              isMobileSidebarOpen = false;
            }}
            class="w-full px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 {
              activeTab === 'calendar'
                ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20 font-black'
                : 'text-slate-300 hover:bg-dark-800 hover:text-amber-300'
            }"
          >
            <Icons name="calendar" size={16} />
            <span>Calendar & Logs</span>
          </button>

          <!-- 5. Compendium & Codex -->
          <button
            onclick={() => {
              activeTab = 'compendium';
              isMobileSidebarOpen = false;
            }}
            class="w-full px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 {
              activeTab === 'compendium'
                ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20 font-black'
                : 'text-slate-300 hover:bg-dark-800 hover:text-amber-300'
            }"
          >
            <Icons name="book" size={16} />
            <span>Compendium & Codex</span>
          </button>

          <div class="pt-4 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500 font-serif">
            Campaign Systems
          </div>

          <!-- 6. Essence Crafting Matrix -->
          <button
            onclick={() => {
              isCraftingModalOpen = true;
              isMobileSidebarOpen = false;
            }}
            class="w-full px-3 py-2 rounded-xl text-xs font-bold text-amber-300 hover:bg-dark-800/80 border border-amber-500/20 flex items-center justify-between transition-colors"
          >
            <div class="flex items-center gap-2">
              <Icons name="sparkles" size={15} class="text-amber-400" />
              <span>Essence Matrix</span>
            </div>
            <span class="text-[10px] font-mono text-amber-500 font-semibold">28 Ess</span>
          </button>

          <!-- 7. Ostrava Settlement Gazetteer -->
          <button
            onclick={() => {
              isGazetteerModalOpen = true;
              isMobileSidebarOpen = false;
            }}
            class="w-full px-3 py-2 rounded-xl text-xs font-bold text-blue-300 hover:bg-dark-800/80 border border-blue-500/20 flex items-center justify-between transition-colors"
          >
            <div class="flex items-center gap-2">
              <Icons name="compass" size={15} class="text-blue-400" />
              <span>Ostrava Profile</span>
            </div>
            <span class="text-[10px] font-mono text-blue-400 font-semibold">Port</span>
          </button>

          <!-- 8. NotebookLM AI Archivist Drawer Trigger -->
          <button
            onclick={() => {
              isArchivistOpen = true;
              isMobileSidebarOpen = false;
            }}
            class="w-full px-3 py-2.5 rounded-xl text-xs font-bold text-amber-200 bg-gradient-to-r from-amber-950/40 to-dark-900 border border-amber-500/40 hover:border-amber-400 flex items-center justify-between transition-all shadow-sm"
          >
            <div class="flex items-center gap-2">
              <Icons name="message-square" size={15} class="text-amber-400" />
              <span>AI Archivist</span>
            </div>
            <span class="px-1.5 py-0.2 rounded bg-amber-500/30 text-amber-300 font-mono text-[9px] font-black uppercase">
              Citations
            </span>
          </button>
        </nav>

        <!-- Sidebar Footer: Active Character Mini-Card -->
        <div class="p-3 bg-dark-950/90 border-t border-amber-900/30 space-y-2">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 min-w-0">
              <div class="w-8 h-8 rounded-lg bg-dark-800 border border-dark-700 flex items-center justify-center font-serif font-black text-amber-400 shrink-0">
                {character.name.charAt(0)}
              </div>
              <div class="min-w-0">
                <span class="text-xs font-bold text-slate-200 truncate block font-serif">
                  {character.name}
                </span>
                <span class="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                  <Icons name="lock" size={10} class="text-emerald-400" /> PIN Locked
                </span>
              </div>
            </div>

            <div class="text-right font-mono text-xs">
              <span class="text-amber-300 font-bold">{character.current_hp}</span>
              <span class="text-slate-500">/{character.max_hp}</span>
            </div>
          </div>

          <!-- Quick Emergency Black Orb Button -->
          <button
            onclick={() => toggleBlackOrb(true)}
            class="w-full py-1.5 px-2 rounded-lg bg-purple-950/70 hover:bg-purple-900 border border-purple-500/40 text-purple-300 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors"
          >
            <Icons name="alert-triangle" size={12} class="text-purple-400" />
            Engage Black Orb Seal
          </button>
        </div>
      </aside>

      <!-- 2. MAIN DESKTOP WORKSPACE AREA -->
      <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
        <!-- TOP HEADER BAR: Campaign Date, LAN Server Status, Volume / Soundboard Drawer -->
        <header class="bg-[#090b12]/95 backdrop-blur-md border-b border-amber-900/40 px-4 py-2.5 flex items-center justify-between gap-3 shrink-0 z-20">
          <div class="flex items-center gap-3">
            <!-- Mobile Menu Toggle Button -->
            <button
              onclick={() => (isMobileSidebarOpen = !isMobileSidebarOpen)}
              class="md:hidden p-1.5 rounded-lg bg-dark-800 text-slate-300 hover:text-white"
              aria-label="Toggle navigation menu"
            >
              <Icons name="layers" size={18} />
            </button>

            <!-- Active Breadcrumb Title -->
            <div class="hidden sm:flex items-center gap-2 text-xs font-bold text-slate-300">
              <span class="text-slate-500 font-serif">Aleamos</span>
              <span class="text-slate-600">/</span>
              <span class="text-amber-400 uppercase font-serif tracking-wider">
                {activeTab === 'sheet'
                  ? 'Character Sheet'
                  : activeTab === 'battlemat'
                  ? 'Tactical Battle Mat'
                  : activeTab === 'combat'
                  ? 'DM Master Control'
                  : activeTab === 'calendar'
                  ? 'Campaign Timekeeper'
                  : 'Compendium & Codex'}
              </span>
            </div>
          </div>

          <!-- Center: Current Campaign Date Display (Click opens Calendar View) -->
          <button
            onclick={() => (activeTab = 'calendar')}
            class="px-3.5 py-1.5 bg-dark-950/80 hover:bg-dark-900 border border-amber-900/50 hover:border-amber-500/50 rounded-xl text-xs font-serif text-amber-300 flex items-center gap-2 transition-all shadow-sm group"
            title="Click to inspect Campaign Calendar"
          >
            <Icons name="calendar" size={14} class="text-amber-400 group-hover:scale-110 transition-transform" />
            <span class="font-semibold tracking-wide">{campaignDateStr}</span>
          </button>

          <!-- Right: Server LAN status & Quick Master Volume / Soundboard Dropdown -->
          <div class="flex items-center gap-2.5">
            <!-- LAN Status Pill -->
            <div
              class="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-xl bg-dark-950 border border-dark-800 text-[11px] font-mono"
              title="Axum embedded LAN server endpoint"
            >
              <span class="w-2 h-2 rounded-full {$isWsConnectedStore ? 'bg-emerald-400 shadow-sm shadow-emerald-400/80 animate-pulse' : 'bg-red-500 animate-ping'}"></span>
              <span class="text-slate-400 font-semibold">{serverLanAddress}</span>
            </div>

            <!-- Master Volume / Soundboard Drawer Dropdown Toggle -->
            <div class="relative">
              <button
                onclick={() => (isSoundboardDrawerOpen = !isSoundboardDrawerOpen)}
                class="px-2.5 py-1.5 rounded-xl border transition-all flex items-center gap-1.5 text-xs font-bold {
                  isSoundboardDrawerOpen
                    ? 'bg-amber-500 text-black border-amber-400 shadow-md shadow-amber-500/20'
                    : 'bg-dark-800 hover:bg-dark-700 border-dark-700 text-slate-300'
                }"
                title="Master Audio Volume & Procedural Soundboard"
              >
                <Icons name={isMuted ? 'volume-x' : 'volume-2'} size={15} />
                <span class="font-mono text-[11px] hidden sm:inline">{isMuted ? 'Muted' : `${masterVolume}%`}</span>
              </button>

              <!-- Soundboard Floating Dropdown Drawer -->
              {#if isSoundboardDrawerOpen}
                <div class="absolute right-0 top-11 w-72 bg-[#090b12] border border-amber-900/60 rounded-2xl p-3.5 shadow-2xl z-40 space-y-3 animate-fadeIn">
                  <div class="flex items-center justify-between border-b border-dark-800 pb-2">
                    <span class="text-xs font-bold uppercase tracking-wider text-slate-200 font-serif flex items-center gap-1.5">
                      <Icons name="sparkles" size={13} class="text-amber-400" />
                      Master Soundboard
                    </span>
                    <button
                      onclick={toggleMasterMute}
                      class="px-2 py-0.5 rounded text-[10px] font-mono font-bold border transition-colors {
                        isMuted ? 'bg-red-950 border-red-500 text-red-300' : 'bg-dark-800 border-dark-700 text-slate-300'
                      }"
                    >
                      {isMuted ? 'Unmute' : 'Mute'}
                    </button>
                  </div>

                  <!-- Volume Slider -->
                  <div class="space-y-1">
                    <div class="flex justify-between text-[10px] text-slate-400 font-mono">
                      <span>Master Volume:</span>
                      <span class="text-amber-300 font-bold">{masterVolume}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={masterVolume}
                      oninput={handleVolumeChange}
                      class="w-full accent-amber-500 bg-dark-950 h-1.5 rounded-lg cursor-pointer"
                    />
                  </div>

                  <!-- Quick Sound Buttons Grid -->
                  <div class="space-y-1 pt-1">
                    <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                      Trigger Procedural Audio:
                    </span>
                    <div class="grid grid-cols-2 gap-1.5 text-[11px]">
                      <button
                        onclick={() => dispatchSoundEvent('fireball')}
                        class="p-1.5 bg-red-950/60 hover:bg-red-900/80 border border-red-700/50 rounded-lg text-red-300 font-bold"
                      >
                        Fireball
                      </button>
                      <button
                        onclick={() => dispatchSoundEvent('critical_hit')}
                        class="p-1.5 bg-amber-950/60 hover:bg-amber-900/80 border border-amber-700/50 rounded-lg text-amber-300 font-bold"
                      >
                        Critical Strike
                      </button>
                      <button
                        onclick={() => dispatchSoundEvent('turn_bell')}
                        class="p-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 rounded-lg text-amber-300 font-bold"
                      >
                        Turn Bell
                      </button>
                      <button
                        onclick={() => dispatchSoundEvent('coin_clink')}
                        class="p-1.5 bg-yellow-950/60 hover:bg-yellow-900/80 border border-yellow-700/50 rounded-lg text-yellow-300 font-bold"
                      >
                        Coin Clink
                      </button>
                      <button
                        onclick={() => dispatchSoundEvent('potion')}
                        class="p-1.5 bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-700/50 rounded-lg text-emerald-300 font-bold"
                      >
                        Potion
                      </button>
                      <button
                        onclick={() => dispatchSoundEvent('black_orb_seal')}
                        class="p-1.5 bg-purple-950/60 hover:bg-purple-900/80 border border-purple-700/50 rounded-lg text-purple-300 font-bold"
                      >
                        Black Orb
                      </button>
                    </div>
                  </div>
                </div>
              {/if}
            </div>

            <!-- AI Archivist Slide-out Button -->
            <button
              onclick={() => (isArchivistOpen = true)}
              class="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-black font-black uppercase tracking-wider text-xs rounded-xl shadow-md shadow-amber-500/20 transition-all flex items-center gap-1.5"
            >
              <Icons name="sparkles" size={14} />
              <span class="hidden sm:inline">AI Archivist</span>
            </button>
          </div>
        </header>

        <!-- MAIN SCROLLABLE CONTENT BODY -->
        <main class="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {#if activeTab === 'sheet'}
            <!-- Character Header Info: Current/Max HP, AC, Passive Perception, Temp HP -->
            <CharacterHeader />

            <!-- Currency Breakdown & Eastern Port Assay (10%) Drawer -->
            <CurrencyAssayDrawer />

            <!-- Inventory List with Durability Bar & 24h Spoilage Badges -->
            <InventoryList />

            <!-- Black Orb System 15 Containment Protocol Card -->
            <div class="bg-dark-900 border border-dark-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div>
                <span class="font-bold text-slate-200 block font-serif text-sm">
                  Black Orb Protocol (System 15)
                </span>
                <span class="text-slate-400">
                  Simulate obsidian containment quarantine with darkvision suppression and temporal stasis.
                </span>
              </div>
              <button
                onclick={() => toggleBlackOrb(true)}
                class="px-4 py-2 bg-purple-950/80 hover:bg-purple-900 border border-purple-500/60 rounded-xl text-purple-200 font-bold uppercase tracking-wider text-[11px] transition-all shadow-md shadow-purple-950/40 flex items-center gap-1.5 shrink-0"
              >
                <Icons name="alert-triangle" size={14} class="text-purple-400" />
                Engage Black Orb Seal
              </button>
            </div>
          {:else if activeTab === 'battlemat'}
            <!-- Full-Screen Tactical Battle Mat Container with Floating Toolbars -->
            <TacticalCanvasContainer
              bind:tokens={dynamicTokens}
              bind:walls={demoWalls}
              onTokenMove={handleTokenMove}
              onDropMonster={handleCanvasDropMonster}
            />
          {:else if activeTab === 'combat'}
            <!-- DM Master Dashboard in Two-Column Grid -->
            <EncounterDashboard
              onSpawnMonster={handleSpawnMonsterFromDashboard}
            />
          {:else if activeTab === 'calendar'}
            <!-- Campaign Calendar & Chronicle Logs -->
            <CampaignCalendarView />
          {:else if activeTab === 'compendium'}
            <!-- Compendium Spells & Classes Browser -->
            <CompendiumBrowser />
          {/if}
        </main>
      </div>
    </div>

    <!-- 3. SLIDE-OUT RIGHT PANEL: NotebookLM AI Archivist Sidebar -->
    <ArchivistSidebar bind:isOpen={isArchivistOpen} />

    <!-- 4. MODALS -->
    <!-- Essence Crafting Matrix Modal -->
    <EssenceMatrixModal bind:isOpen={isCraftingModalOpen} />

    <!-- Ostrava Settlement Gazetteer Modal -->
    <OstravaGazetteerModal bind:isOpen={isGazetteerModalOpen} />

    <!-- Black Orb System 15 Fullscreen Overlay -->
    <BlackOrbOverlay />
  {/if}
</div>
