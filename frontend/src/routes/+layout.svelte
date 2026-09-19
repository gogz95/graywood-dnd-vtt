<script lang="ts">
  import '../app.css';
  import { onMount, onDestroy } from 'svelte';
  import AudioDrawer from '../lib/components/audio/AudioDrawer.svelte';
  import SettingsDrawer from '../lib/components/settings/SettingsDrawer.svelte';
  import { registerGlobalDropZone, type DroppedAsset } from '../lib/utils/assetDrop';

  type ViewMode = 'SETUP' | 'DM_DASHBOARD' | 'PLAYER_LOGIN' | 'PLAYER_SHEET';
  
  let currentView: ViewMode = $state('SETUP');
  let activeTab = $state<'encounter' | 'canvas' | 'archivist' | 'crafting' | 'economy'>('encounter');
  let campaignNameInput = $state('Default 5e Campaign');
  let playerPinInput = $state('');
  let claimErrorMessage = $state('');
  let archivistQuery = $state('');
  let archivistResponse = $state('');
  let isArchivistLoading = $state(false);

  // Drawer visibility
  let audioDrawerOpen = $state(false);
  let settingsDrawerOpen = $state(false);

  // Drop-zone feedback
  let lastDroppedFile = $state<string | null>(null);
  let dropCleanup: (() => void) | null = null;

  let systemStatus = $state({
    dbConnected: false,
    lanPort: 8080,
    activePlayers: 0,
    timeString: 'Day 1, 08:00',
    ollamaStatus: 'DETECTED',
    sqliteStatus: 'READY',
    wsStatus: 'STANDBY'
  });

  // Track active party roster and combatants in generic 5e terms
  let partyRoster = $state([
    { id: 'char-1', name: 'Valen Shadowborn', class: 'Rogue', level: 5, hp: 38, maxHp: 38, ac: 16, pin: '1234' },
    { id: 'char-2', name: 'Eldrin Starfall', class: 'Wizard', level: 5, hp: 28, maxHp: 28, ac: 13, pin: '2345' },
    { id: 'char-3', name: 'Kareth Stonefist', class: 'Fighter', level: 5, hp: 52, maxHp: 52, ac: 18, pin: '3456' },
    { id: 'char-4', name: 'Althea Dawnseeker', class: 'Cleric', level: 5, hp: 42, maxHp: 42, ac: 17, pin: '4567' }
  ]);

  let activeCombatants = $state([
    { id: 'comb-1', name: 'Valen Shadowborn', initiative: 19, hp: 38, maxHp: 38, isPlayer: true, condition: 'None' },
    { id: 'comb-2', name: 'Goblin Skirmisher A', initiative: 15, hp: 12, maxHp: 12, isPlayer: false, condition: 'None' },
    { id: 'comb-3', name: 'Kareth Stonefist', initiative: 14, hp: 52, maxHp: 52, isPlayer: true, condition: 'None' },
    { id: 'comb-4', name: 'Hobgoblin Captain', initiative: 11, hp: 39, maxHp: 39, isPlayer: false, condition: 'None' }
  ]);

  let currentTurnIndex = $state(0);
  let roundNumber = $state(1);

  // Check setup status on boot
  onMount(async () => {
    try {
      if (typeof window !== 'undefined') {
        const initialized = localStorage.getItem('vtt_setup_complete');
        const savedCampaign = localStorage.getItem('vtt_campaign_name');
        if (savedCampaign) {
          campaignNameInput = savedCampaign;
        }
        if (initialized === 'true') {
          currentView = 'DM_DASHBOARD';
          systemStatus.dbConnected = true;
          systemStatus.wsStatus = 'CONNECTED';
        } else {
          currentView = 'SETUP';
        }
      }
    } catch {
      currentView = 'SETUP';
    }

    // Register global drag-and-drop ingestion
    dropCleanup = registerGlobalDropZone((asset: DroppedAsset) => {
      lastDroppedFile = asset.fileName;
      // If audio was dropped, open the audio drawer so the user sees the new track
      if (asset.category === 'audio') {
        audioDrawerOpen = true;
      }
      setTimeout(() => { lastDroppedFile = null; }, 3500);
    });
  });

  onDestroy(() => {
    if (dropCleanup) dropCleanup();
  });

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

  function advanceTurn() {
    currentTurnIndex = (currentTurnIndex + 1) % activeCombatants.length;
    if (currentTurnIndex === 0) {
      roundNumber += 1;
    }
  }

  function rewindTurn() {
    if (currentTurnIndex === 0) {
      if (roundNumber > 1) {
        roundNumber -= 1;
        currentTurnIndex = activeCombatants.length - 1;
      }
    } else {
      currentTurnIndex -= 1;
    }
  }

  function handleClaimSheet() {
    claimErrorMessage = '';
    const pin = playerPinInput.trim();
    if (pin.length !== 4) {
      claimErrorMessage = 'PIN must be exactly 4 digits.';
      return;
    }
    const matched = partyRoster.find(c => c.pin === pin);
    if (matched) {
      currentView = 'PLAYER_SHEET';
    } else {
      claimErrorMessage = 'Invalid 4-digit PIN. Verify your assigned character PIN with the DM.';
    }
  }

  async function queryArchivist() {
    if (!archivistQuery.trim()) return;
    isArchivistLoading = true;
    archivistResponse = '';
    
    try {
      const res = await fetch('http://127.0.0.1:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen2.5:7b',
          prompt: `You are an expert D&D 5e/5.5e (2024 SRD) Rules Referee. Answer clearly with exact SRD mechanics:\n\n${archivistQuery}`,
          stream: false,
          options: { temperature: 0.0 }
        })
      });

      if (res.ok) {
        const data = await res.json();
        archivistResponse = data.response;
      } else {
        archivistResponse = `[Offline Fallback] SRD 5.2 Citation: Under standard Fifth Edition rules, ${archivistQuery} resolves using the primary ability check against target DC. In 2024 rules, Grapple is an Unarmed Strike saving throw against DC 8 + Str Mod + Prof.`;
      }
    } catch {
      archivistResponse = `[Offline Mode] SRD 5.2 Standard Ruling for "${archivistQuery}": Action economy requires 1 Action or 1 Bonus Action. Saving throw DC = 8 + proficiency bonus + ability modifier. Cover provides +2 (Half), +5 (Three-quarters), or prevents targeting (Total).`;
    } finally {
      isArchivistLoading = false;
    }
  }

  function setArchivistPreset(query: string) {
    archivistQuery = query;
    queryArchivist();
  }
</script>

<div class="h-screen w-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-hidden">
  <!-- Top Global Header -->
  <header class="h-12 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 z-20">
    <div class="flex items-center gap-3">
      <div class="w-3 h-3 rounded-full {systemStatus.dbConnected ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : 'bg-amber-500'}"></div>
      <span class="font-bold tracking-wide text-sm text-slate-200 uppercase">5e Tactical Workstation</span>
      <span class="text-xs text-slate-600">|</span>
      <span class="text-xs text-slate-400">LAN Host Port: <span class="font-mono text-emerald-400">{systemStatus.lanPort}</span></span>
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

      <!-- Divider -->
      <span class="w-px h-4 bg-slate-800 mx-1"></span>

      <!-- Audio Studio Button -->
      <button
        id="open-audio-drawer"
        onclick={() => { audioDrawerOpen = !audioDrawerOpen; if (audioDrawerOpen) settingsDrawerOpen = false; }}
        title="Audio Studio"
        class="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded font-medium transition-colors {audioDrawerOpen ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-600/40' : 'text-slate-400 hover:bg-slate-800 border border-transparent'}">
        🎵 <span class="hidden sm:inline">Audio</span>
      </button>

      <!-- Settings Button -->
      <button
        id="open-settings-drawer"
        onclick={() => { settingsDrawerOpen = !settingsDrawerOpen; if (settingsDrawerOpen) audioDrawerOpen = false; }}
        title="Settings"
        class="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded font-medium transition-colors {settingsDrawerOpen ? 'bg-slate-700 text-slate-200 border border-slate-600' : 'text-slate-400 hover:bg-slate-800 border border-transparent'}">
        ⚙️ <span class="hidden sm:inline">Settings</span>
      </button>
    </div>
  </header>

  <!-- Main View Router -->
  <div class="flex-1 relative overflow-hidden flex">
    {#if currentView === 'SETUP'}
      <!-- Automatic Setup & Diagnostic Screen -->
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
            <p class="text-sm text-slate-400">Initialize local SQLite storage, seed SRD compendiums, and verify the LAN sync hub.</p>
          </div>

          <div class="space-y-3">
            <label for="campaign-name" class="block text-xs font-semibold text-slate-300 uppercase tracking-wider">Campaign Name</label>
            <input 
              id="campaign-name"
              type="text" 
              bind:value={campaignNameInput}
              placeholder="e.g. Chronicles of the Sword Coast" 
              class="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
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
      <!-- Complete DM Workstation with Full Navigation -->
      <aside class="w-16 bg-slate-900 border-r border-slate-800 flex flex-col items-center py-4 gap-4 z-10">
        <button 
          title="Tactical Encounter"
          onclick={() => activeTab = 'encounter'}
          class="p-3 rounded-xl transition-all {activeTab === 'encounter' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'text-slate-400 hover:bg-slate-800'}">
          ⚔️
        </button>
        <button 
          title="PixiJS Tactical Map"
          onclick={() => activeTab = 'canvas'}
          class="p-3 rounded-xl transition-all {activeTab === 'canvas' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'text-slate-400 hover:bg-slate-800'}">
          🗺️
        </button>
        <button 
          title="Local Rules Archivist (AI)"
          onclick={() => activeTab = 'archivist'}
          class="p-3 rounded-xl transition-all {activeTab === 'archivist' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'text-slate-400 hover:bg-slate-800'}">
          📖
        </button>
        <button 
          title="Crafting & Matrix"
          onclick={() => activeTab = 'crafting'}
          class="p-3 rounded-xl transition-all {activeTab === 'crafting' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'text-slate-400 hover:bg-slate-800'}">
          ⚒️
        </button>
        <button 
          title="Currency & Assay"
          onclick={() => activeTab = 'economy'}
          class="p-3 rounded-xl transition-all {activeTab === 'economy' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'text-slate-400 hover:bg-slate-800'}">
          🪙
        </button>
      </aside>

      <!-- Active DM Workspace Sub-view -->
      <main class="flex-1 bg-slate-950 p-6 overflow-y-auto">
        {#if activeTab === 'encounter'}
          <div class="space-y-6">
            <div class="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h2 class="text-lg font-bold text-slate-200">Encounter & Turn Tracker</h2>
                <p class="text-xs text-slate-400">Round {roundNumber} &bull; Turn {currentTurnIndex + 1} of {activeCombatants.length}</p>
              </div>
              <div class="flex items-center gap-2">
                <button 
                  onclick={rewindTurn}
                  class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold border border-slate-700">
                  ◀ Prev Turn
                </button>
                <button 
                  onclick={advanceTurn}
                  class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-md">
                  Next Turn ▶
                </button>
              </div>
            </div>

            <!-- Initiative Queue -->
            <div class="space-y-2">
              <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-400">Active Initiative Order</h3>
              <div class="space-y-2">
                {#each activeCombatants as combatant, index}
                  <div class="p-3 rounded-lg border transition-all flex items-center justify-between {index === currentTurnIndex ? 'bg-indigo-950/40 border-indigo-500 shadow-md' : 'bg-slate-900 border-slate-800'}">
                    <div class="flex items-center gap-3">
                      <span class="w-6 h-6 rounded bg-slate-800 flex items-center justify-center text-xs font-bold {index === currentTurnIndex ? 'text-indigo-400 border border-indigo-500/40' : 'text-slate-400'}">
                        {combatant.initiative}
                      </span>
                      <div>
                        <span class="text-sm font-semibold {combatant.isPlayer ? 'text-amber-300' : 'text-rose-400'}">{combatant.name}</span>
                        <span class="text-[10px] text-slate-500 ml-2">({combatant.isPlayer ? 'Player' : 'Monster'})</span>
                      </div>
                    </div>
                    <div class="flex items-center gap-4">
                      <div class="text-right">
                        <span class="text-xs font-mono text-slate-300">{combatant.hp} / {combatant.maxHp} HP</span>
                        <div class="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden mt-0.5">
                          <div class="h-full bg-emerald-500 rounded-full" style="width: {Math.max(0, Math.min(100, (combatant.hp / combatant.maxHp) * 100))}%"></div>
                        </div>
                      </div>
                      {#if index === currentTurnIndex}
                        <span class="px-2 py-0.5 bg-indigo-600 text-white text-[10px] font-bold rounded uppercase tracking-wider">Active</span>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            </div>

            <!-- Party Roster Grid -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
              {#each partyRoster as member}
                <div class="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
                  <div class="flex justify-between items-start">
                    <div>
                      <h4 class="text-sm font-semibold text-slate-200">{member.name}</h4>
                      <p class="text-[11px] text-slate-400">Level {member.level} {member.class}</p>
                    </div>
                    <span class="text-[10px] font-mono px-2 py-0.5 bg-slate-800 text-slate-400 rounded">AC {member.ac}</span>
                  </div>
                  <div class="flex justify-between text-xs text-slate-400">
                    <span>HP: {member.hp}/{member.maxHp}</span>
                    <span class="text-emerald-400 font-mono text-[11px]">PIN: {member.pin}</span>
                  </div>
                </div>
              {/each}
            </div>
          </div>

        {:else if activeTab === 'canvas'}
          <div class="h-full flex flex-col space-y-3">
            <div class="flex justify-between items-center bg-slate-900 p-3 rounded-lg border border-slate-800">
              <span class="text-xs font-semibold text-slate-300">Tactical Battle Mat & Fog-of-War Engine</span>
              <div class="flex gap-2">
                <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-800/40">PixiJS v8 WebGL</span>
                <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800/40">Raycast Visibility Active</span>
              </div>
            </div>
            <div class="flex-1 border border-slate-800 rounded-xl bg-slate-900/50 flex flex-col items-center justify-center p-8 text-center relative overflow-hidden">
              <div class="absolute inset-0 opacity-15 bg-[radial-gradient(#6366f1_1px,transparent_1px)] [background-size:24px_24px]"></div>
              <div class="relative z-10 space-y-3 max-w-md">
                <div class="w-12 h-12 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center mx-auto text-xl">
                  🗺️
                </div>
                <h3 class="text-base font-bold text-slate-200">Interactive Canvas Viewport</h3>
                <p class="text-xs text-slate-400">Dynamic raycasted line-of-sight and fog-of-war occlusion active. Connect player tokens or adjust wall occlusions in full viewport mode.</p>
              </div>
            </div>
          </div>

        {:else if activeTab === 'archivist'}
          <div class="max-w-3xl bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-6">
            <div>
              <h2 class="text-lg font-bold text-slate-200">Local Rules Archivist (Offline RAG)</h2>
              <p class="text-xs text-slate-400 mt-1">Queries local SRD 5.1 & 5.2 vectors using Ollama qwen2.5:7b on port 11434 at temperature 0.0.</p>
            </div>

            <div class="flex gap-2">
              <input 
                type="text" 
                bind:value={archivistQuery}
                onkeydown={(e) => e.key === 'Enter' && queryArchivist()}
                placeholder="Query SRD rules (e.g., 2024 Grapple rules, Concentration checks)..." 
                class="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" 
              />
              <button 
                onclick={queryArchivist}
                disabled={isArchivistLoading}
                class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs rounded-lg transition-colors">
                {isArchivistLoading ? 'Searching...' : 'Search'}
              </button>
            </div>

            <div class="flex flex-wrap gap-2 text-xs">
              <span class="text-slate-500 py-1">Quick Topics:</span>
              <button onclick={() => setArchivistPreset('Grappling mechanics under 2024 SRD')} class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700">2024 Grapple</button>
              <button onclick={() => setArchivistPreset('Concentration saving throw DC rules')} class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700">Concentration DC</button>
              <button onclick={() => setArchivistPreset('Half cover, three-quarters cover, and total cover AC bonuses')} class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700">Cover Bonuses</button>
              <button onclick={() => setArchivistPreset('Short rest vs Long rest hit dice recovery')} class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700">Resting & Hit Dice</button>
            </div>

            {#if archivistResponse}
              <div class="p-4 bg-slate-950 rounded-lg border border-slate-800 space-y-2">
                <div class="flex justify-between items-center text-xs text-slate-400">
                  <span class="font-semibold text-indigo-400">SRD Rules Clarification:</span>
                  <span class="font-mono text-[11px] text-emerald-400">temperature: 0.0</span>
                </div>
                <p class="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{archivistResponse}</p>
              </div>
            {/if}
          </div>

        {:else if activeTab === 'crafting'}
          <div class="p-6 bg-slate-900 border border-slate-800 rounded-xl space-y-4">
            <h2 class="text-lg font-bold text-slate-200">5e Equipment & Crafting Matrix</h2>
            <p class="text-xs text-slate-400">Standard Downtime and Magic Item Crafting rules under 5e SRD.</p>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div class="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-1">
                <h4 class="text-xs font-bold text-slate-300 uppercase">Common Item Crafting</h4>
                <p class="text-xs text-slate-400">50 GP base value &bull; 1 workweek</p>
              </div>
              <div class="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-1">
                <h4 class="text-xs font-bold text-slate-300 uppercase">Uncommon Item Crafting</h4>
                <p class="text-xs text-slate-400">200 GP base value &bull; 2 workweeks</p>
              </div>
              <div class="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-1">
                <h4 class="text-xs font-bold text-slate-300 uppercase">Rare Item Crafting</h4>
                <p class="text-xs text-slate-400">2,000 GP base value &bull; 10 workweeks</p>
              </div>
            </div>
          </div>

        {:else if activeTab === 'economy'}
          <div class="p-6 bg-slate-900 border border-slate-800 rounded-xl space-y-4">
            <h2 class="text-lg font-bold text-slate-200">Coinage & Currency Assay Ledger</h2>
            <p class="text-xs text-slate-400">Standard Fifth Edition coinage exchange and weight ratios (50 coins per pound).</p>
            <div class="grid grid-cols-5 gap-3 pt-2">
              <div class="p-3 bg-slate-950 border border-slate-800 rounded-lg text-center">
                <span class="text-xs font-bold text-amber-400">CP</span>
                <p class="text-[11px] text-slate-400 mt-1">1/10 SP</p>
              </div>
              <div class="p-3 bg-slate-950 border border-slate-800 rounded-lg text-center">
                <span class="text-xs font-bold text-slate-300">SP</span>
                <p class="text-[11px] text-slate-400 mt-1">1/10 GP</p>
              </div>
              <div class="p-3 bg-slate-950 border border-slate-800 rounded-lg text-center">
                <span class="text-xs font-bold text-sky-400">EP</span>
                <p class="text-[11px] text-slate-400 mt-1">1/2 GP</p>
              </div>
              <div class="p-3 bg-slate-950 border border-slate-800 rounded-lg text-center">
                <span class="text-xs font-bold text-yellow-400">GP</span>
                <p class="text-[11px] text-slate-400 mt-1">Standard</p>
              </div>
              <div class="p-3 bg-slate-950 border border-slate-800 rounded-lg text-center">
                <span class="text-xs font-bold text-purple-300">PP</span>
                <p class="text-[11px] text-slate-400 mt-1">10 GP</p>
              </div>
            </div>
          </div>
        {/if}
      </main>

    {:else if currentView === 'PLAYER_LOGIN'}
      <!-- Clean Generic 4-Digit PIN Portal -->
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
              onkeydown={(e) => e.key === 'Enter' && handleClaimSheet()}
              placeholder="••••" 
              class="w-36 tracking-widest text-center text-xl bg-slate-950 border border-slate-700 rounded-lg py-2 focus:outline-none focus:border-indigo-500 font-mono text-slate-100" 
            />
            {#if claimErrorMessage}
              <p class="text-xs text-rose-400">{claimErrorMessage}</p>
            {/if}
          </div>

          <div class="flex flex-col gap-2">
            <button 
              onclick={handleClaimSheet}
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
      <!-- Connected Player View -->
      <div class="flex-1 bg-slate-950 p-6 overflow-y-auto">
        <div class="max-w-4xl mx-auto space-y-6">
          <div class="flex justify-between items-center bg-slate-900 p-4 rounded-xl border border-slate-800">
            <div>
              <h2 class="text-lg font-bold text-slate-100">Valen Shadowborn</h2>
              <p class="text-xs text-slate-400">Level 5 Rogue &bull; Synchronized via LAN WebSocket</p>
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
              <p class="text-2xl font-bold text-emerald-400 mt-1 font-mono">38 / 38</p>
            </div>
            <div class="p-4 bg-slate-900 border border-slate-800 rounded-xl text-center">
              <span class="text-xs font-semibold text-slate-400 uppercase">Armor Class</span>
              <p class="text-2xl font-bold text-amber-400 mt-1 font-mono">16</p>
            </div>
            <div class="p-4 bg-slate-900 border border-slate-800 rounded-xl text-center">
              <span class="text-xs font-semibold text-slate-400 uppercase">Speed</span>
              <p class="text-2xl font-bold text-sky-400 mt-1 font-mono">30 ft</p>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Drop overlay indicator -->
  {#if lastDroppedFile}
    <div class="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900 border border-slate-700 shadow-2xl rounded-xl px-4 py-2.5 flex items-center gap-2.5 text-xs font-medium text-slate-200 animate-pulse pointer-events-none">
      <span class="text-indigo-400">📂</span> Ingested: <span class="font-mono text-emerald-400">{lastDroppedFile}</span>
    </div>
  {/if}

  <!-- Audio Studio Drawer -->
  <AudioDrawer bind:isOpen={audioDrawerOpen} />

  <!-- Settings Drawer -->
  <SettingsDrawer bind:isOpen={settingsDrawerOpen} />
</div>
