<!-- src/lib/components/setup/SetupWizardModal.svelte -->
<!-- Initial Setup Wizard: Guided onboarding for DM workstation with Dexie persistence -->

<script lang="ts">
  import { onMount } from 'svelte';
  import { compendiumDb } from '../../db/compendiumDb';
  import { rulesEngine } from '../../stores/rulesEngine.svelte';
  import { projectorStore } from '../../stores/projectorStore.svelte';
  import { campaignStore } from '../../stores/campaignStore.svelte';
  import { ingestUniversalFile } from '../../importers/universalIngestionEngine';
  import { importUniversalMap } from '../../services/mapImporter';
  import { campaignDirectoryStore } from '../../stores/campaignDirectoryStore.svelte';
  import { mapsDb } from '../../db/mapsDb';
  import { canvasStore } from '../../../stores/canvasStore.svelte';
  import { ingestPipelineStore } from '../../services/ingest/ingestPipelineStore.svelte';
  import Step2Scaffolding from './Step2Scaffolding.svelte';
  import {
    SUNKEN_CRYPT_BATTLEMAP,
    SUNKEN_CRYPT_MAP_ID,
    STARTER_CHARACTERS,
    STARTER_MONSTERS,
    STARTER_JOURNAL_NOTE,
    STARTER_CANVAS_TOKENS,
  } from '../../data/starterCampaignSeed';
  import { seedDemoEncounter } from '../../services/demoEncounterSeeder';

  let {
    isOpen = $bindable(false),
    onComplete,
    maxSteps = 3,
  }: {
    isOpen?: boolean;
    onComplete?: () => void;
    maxSteps?: number;
  } = $props();

  let step = $state<number>(1);

  // Step 1: Campaign Identity
  let campaignName = $state('Default Campaign');
  let dmName = $state('Dungeon Master');
  let tablePin = $state('1337');

  // Step 2: Campaign Directory & Scaffolding
  let selectedDirectory = $state<string | null>(null);
  let isSelectingFolder = $state(false);
  const requiredSubdirs = [
    'Ingest/Source material/',
    'Ingest/Image/',
    'Ingest/Audio/',
    'Ingest/Video/',
    'maps/',
    'tokens/',
    'audio/'
  ];

  // Step 3: Display Mode & Rules Presets
  let displayPreset = $state<'projector' | 'companion' | 'solo'>('projector');
  let ruleDexInit = $state(true);
  let ruleGrittyRealism = $state(false);
  let ruleDurability = $state(false);

  // Step 3 Ingestion
  let isDragging = $state(false);
  let importedFiles = $state<string[]>([]);
  let autoScannedDirectory: string | null = null;

  $effect(() => {
    if (step === 3 && selectedDirectory && autoScannedDirectory !== selectedDirectory) {
      autoScannedDirectory = selectedDirectory;
      triggerAutoScan(selectedDirectory);
    }
  });

  async function triggerAutoScan(targetPath?: string) {
    const dir = targetPath || selectedDirectory;
    if (!dir) return;
    const res = await ingestPipelineStore.scanCampaignFolder(dir);
    if (res && res.entries.length > 0) {
      ingestPipelineStore.startIngestion().catch((err) => {
        console.warn('Auto-ingestion error:', err);
      });
    }
  }

  const detectedMaps = $derived(
    ingestPipelineStore.queue.filter((i) => {
      const lower = i.name.toLowerCase();
      return (
        i.category === 'image' &&
        !lower.includes('token') &&
        (lower.endsWith('.png') ||
          lower.endsWith('.webp') ||
          lower.endsWith('.jpg') ||
          lower.endsWith('.jpeg') ||
          lower.endsWith('.dd2vtt') ||
          lower.endsWith('.uvtt') ||
          lower.endsWith('.ds') ||
          lower.endsWith('.geojson'))
      );
    })
  );

  const detectedTokens = $derived(
    ingestPipelineStore.queue.filter((i) => {
      const lower = (i.name + ' ' + i.relativePath).toLowerCase();
      return lower.includes('token') || (i.category === 'image' && lower.startsWith('tokens'));
    })
  );

  const detectedDocs = $derived(
    ingestPipelineStore.queue.filter((i) => i.category === 'source')
  );

  onMount(async () => {
    await campaignStore.initPromise;
    campaignName = campaignStore.campaignName || 'Default Campaign';
    dmName = campaignStore.dmAlias || 'Dungeon Master';
    tablePin = campaignStore.masterPin || '1337';
    selectedDirectory = campaignDirectoryStore.directoryPath ?? null;

    if (!campaignStore.hasCompletedWizard) {
      isOpen = true;
    }
  });

  async function handleSelectDirectory(): Promise<void> {
    isSelectingFolder = true;
    try {
      const info = await campaignDirectoryStore.selectDirectory();
      if (info) {
        const rootPath = typeof info === 'string' ? info : info.root_path;
        const dirName = typeof info === 'string' ? info.split(/[/\\]/).pop() || 'Campaign' : info.name;
        selectedDirectory = rootPath;
        if (dirName) campaignName = dirName;
        if (compendiumDb.campaignFlags) {
          await compendiumDb.campaignFlags.bulkPut([
            { key: 'campaignRootDir', value: rootPath },
            { key: 'activeCampaignProfile', value: dirName }
          ]);
        }
      }
    } catch (err) {
      console.warn('Directory selection failed:', err);
    } finally {
      isSelectingFolder = false;
    }
  }

  async function syncInputsToStore(): Promise<void> {
    campaignStore.campaignName = campaignName.trim() || 'Default Campaign';
    campaignStore.dmAlias = dmName.trim() || 'Dungeon Master';
    campaignStore.masterPin = tablePin.trim() || '1337';
    await campaignStore.persistFlags();
  }

  async function dismissWizard(): Promise<void> {
    await syncInputsToStore();
    await campaignStore.completeWizard();
    isOpen = false;
    onComplete?.();
  }

  let isSeedingDemo = $state(false);

  async function loadSampleOneShot(): Promise<void> {
    isSeedingDemo = true;
    try {
      campaignName = 'The Sunken Crypt';
      dmName = 'Dungeon Master';
      tablePin = '1337';
      await syncInputsToStore();

      // 1. Seed Battlemap to Dexie mapsDb
      await mapsDb.tacticalMaps.put(SUNKEN_CRYPT_BATTLEMAP);

      // 2. Seed Monsters & Journal Note to compendiumDb
      for (const mob of STARTER_MONSTERS) {
        await compendiumDb.monsters.put(mob);
      }
      await compendiumDb.journal.put(STARTER_JOURNAL_NOTE);

      // 3. Populate 4 Player Characters in localStorage roster
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('vtt_party_roster', JSON.stringify(STARTER_CHARACTERS));
        localStorage.setItem('vtt_campaign_name', 'The Sunken Crypt');
      }

      // 4. Activate The Sunken Crypt on Canvas
      canvasStore.setGridSize(60);
      canvasStore.setGridColor('#38bdf8');
      canvasStore.setWallsAndDoors(
        SUNKEN_CRYPT_BATTLEMAP.walls.filter(w => w.type === 'wall').map(w => ({
          id: w.id,
          x1: w.p1.x,
          y1: w.p1.y,
          x2: w.p2.x,
          y2: w.p2.y,
        })),
        SUNKEN_CRYPT_BATTLEMAP.walls.filter(w => w.type.startsWith('door')).map(d => ({
          id: d.id,
          x1: d.p1.x,
          y1: d.p1.y,
          x2: d.p2.x,
          y2: d.p2.y,
          state: d.type === 'door_open' ? 'OPEN' : 'CLOSED',
          doorType: 'STANDARD',
          portalType: 'door',
          portalState: d.type === 'door_open' ? 'open' : 'closed',
        }))
      );
      canvasStore.setTokens(STARTER_CANVAS_TOKENS);
      canvasStore.revealAllFog(20, 20);

      projectorStore.activeMapId = SUNKEN_CRYPT_MAP_ID;

      // 5. Complete wizard and launch workstation immediately
      await campaignStore.completeWizard();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vtt:roster-updated'));
        window.dispatchEvent(new CustomEvent('vtt:switch-tab', { detail: { tab: 'battlemat', view: 'canvas' } }));
      }
      isOpen = false;
      onComplete?.();
    } catch (err) {
      console.error('Failed to seed starter campaign:', err);
    } finally {
      isSeedingDemo = false;
    }
  }

  async function handleExploreDemo(): Promise<void> {
    isSeedingDemo = true;
    try {
      await seedDemoEncounter(false);
      await campaignStore.completeWizard();
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('wizardCompleted', 'true');
        localStorage.setItem('vtt_setup_complete', 'true');
      }
      isOpen = false;
      onComplete?.();
    } catch (err) {
      console.error('Failed to seed demo encounter:', err);
    } finally {
      isSeedingDemo = false;
    }
  }

  async function handleNextStep(): Promise<void> {
    await syncInputsToStore();
    if (step < maxSteps) {
      step += 1;
    } else {
      await finishSetup();
    }
  }

  async function handleDropFiles(e: DragEvent): Promise<void> {
    e.preventDefault();
    isDragging = false;
    if (!e.dataTransfer || !e.dataTransfer.files) return;

    for (let i = 0; i < e.dataTransfer.files.length; i++) {
      const file = e.dataTransfer.files[i];
      try {
        const lower = file.name.toLowerCase();
        if (lower.endsWith('.map') || lower.endsWith('.dd2vtt') || lower.endsWith('.uvtt')) {
          await importUniversalMap(file, file.name);
        } else {
          await ingestUniversalFile(file, file.name);
        }
        importedFiles = [...importedFiles, file.name];
      } catch {
        // ignore
      }
    }
  }

  async function finishSetup(): Promise<void> {
    await syncInputsToStore();
    await campaignStore.completeWizard();
    isOpen = false;

    // Apply Display Mode Preset
    if (displayPreset === 'projector') {
      projectorStore.setCastingSource('battlemap');
      projectorStore.updateSettings({ showGrid: true });
    }

    // Apply Rules Preset
    const applyRule = (modId: string, state: boolean) => {
      if (typeof (rulesEngine as any).setModuleEnabled === 'function') {
        (rulesEngine as any).setModuleEnabled(modId, state);
      } else if (typeof (rulesEngine as any).toggleRule === 'function') {
        (rulesEngine as any).toggleRule(modId, state);
      } else if ((rulesEngine as any).config && modId in (rulesEngine as any).config) {
        (rulesEngine as any).config[modId] = state;
      } else if (typeof (rulesEngine as any).toggleModule === 'function') {
        if ((rulesEngine as any).isEnabled?.(modId) !== state) {
          (rulesEngine as any).toggleModule(modId);
        }
      }
    };

    if (ruleDexInit) {
      applyRule('enableTriStatInitiative', false);
    }
    applyRule('enableDurabilitySystem', ruleDurability);

    onComplete?.();
  }
</script>

{#if isOpen}
  <div
    role="presentation"
    class="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in select-none"
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Graywood VTT Setup Wizard"
      tabindex="-1"
      class="w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
    >
      <!-- Header -->
      <div class="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <span class="text-xl">🎲</span>
          <div>
            <h2 class="text-sm font-black text-slate-100 uppercase tracking-wider">GRAYWOOD VTT SETUP WIZARD</h2>
            <p class="text-[11px] text-slate-400">Step {step} of {maxSteps}: {step === 1 ? 'Campaign Identity' : step === 2 ? 'Campaign Scaffolding' : 'Display & Rules'}</p>
          </div>
        </div>
        <!-- Step Indicators & Dismiss Button -->
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-1.5">
            {#each Array.from({ length: maxSteps }, (_, i) => i + 1) as s}
              <div class="w-6 h-1.5 rounded-full {step === s ? 'bg-indigo-500' : step > s ? 'bg-emerald-500' : 'bg-slate-800'} transition-all"></div>
            {/each}
          </div>
          <button
            type="button"
            onclick={dismissWizard}
            class="px-2 py-1 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold transition-colors"
            title="Skip Setup Wizard"
          >
            ✕ Skip
          </button>
        </div>
      </div>

      <!-- Step Content Body -->
      <div class="p-6 space-y-4 flex-1 text-xs">
        {#if step === 1}
          <div class="space-y-3">
            <h3 class="font-bold text-sm text-slate-200">Name Your World &amp; Master Table</h3>
            <div class="space-y-1">
              <label for="wizard-campaign-name" class="text-[10px] uppercase font-bold text-slate-400">Campaign Name</label>
              <input
                id="wizard-campaign-name"
                type="text"
                bind:value={campaignName}
                class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 font-semibold text-xs"
                placeholder="e.g. Default Campaign"
              />
            </div>
            <div class="space-y-1">
              <label for="wizard-dm-name" class="text-[10px] uppercase font-bold text-slate-400">Dungeon Master Alias</label>
              <input
                id="wizard-dm-name"
                type="text"
                bind:value={dmName}
                class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 font-semibold text-xs"
                placeholder="e.g. Master of the Table"
              />
            </div>
            <div class="space-y-1">
              <label for="wizard-table-pin" class="text-[10px] uppercase font-bold text-slate-400">4-Digit Master Table PIN</label>
              <input
                id="wizard-table-pin"
                type="text"
                maxlength="4"
                bind:value={tablePin}
                class="w-36 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono font-bold text-center tracking-widest text-sm"
              />
              <span class="text-[10px] text-slate-500 block">Default companion login code for local Wi-Fi devices.</span>
            </div>

            <!-- Zero-Prep First-Run Onboarding: Ambush at Triboar Trail -->
            <div class="pt-2 border-t border-slate-800/80 space-y-2">
              <div class="bg-gradient-to-r from-emerald-950/80 via-slate-900 to-indigo-950/80 border border-emerald-500/50 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-xl">
                <div>
                  <div class="flex items-center gap-2">
                    <span class="text-base">🌲</span>
                    <span class="font-black text-sm text-emerald-300">Ambush at Triboar Trail</span>
                    <span class="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Zero-Prep Starter
                    </span>
                  </div>
                  <p class="text-[11px] text-slate-300 mt-1 max-w-md">
                    Instant play: 25×20 forest crossroads battlemap with campfire dynamic lighting, tree LoS colliders, 4 Level 1 heroes, and 3 goblin ambushers in stealth.
                  </p>
                </div>
                <button
                  type="button"
                  onclick={handleExploreDemo}
                  disabled={isSeedingDemo}
                  class="w-full md:w-auto px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 active:scale-95 disabled:opacity-50 text-slate-950 rounded-xl font-black text-xs shadow-lg shadow-emerald-500/30 transition-all shrink-0 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>{isSeedingDemo ? '⏳' : '⚡'}</span>
                  <span>{isSeedingDemo ? 'Mounting Encounter…' : 'Explore Demo Encounter (Instant Play)'}</span>
                </button>
              </div>

              <!-- Secondary Option: Sunken Crypt -->
              <div class="bg-slate-950/60 border border-slate-800/80 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3">
                <div class="text-[11px] text-slate-400">
                  <span class="font-bold text-slate-300">Alternate Starter:</span> The Sunken Crypt dungeon one-shot.
                </div>
                <button
                  type="button"
                  onclick={loadSampleOneShot}
                  disabled={isSeedingDemo}
                  class="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg font-bold text-[11px] transition-colors shrink-0"
                >
                  Load Sunken Crypt
                </button>
              </div>
            </div>
          </div>
        {:else if step === 2}
          <Step2Scaffolding
            bind:selectedDirectory
            onDirectoryConfirmed={(path) => {
              selectedDirectory = path;
              if (!campaignName || campaignName === 'Default Campaign') {
                // derive a friendly name from the folder basename
                const parts = path.replace(/\\/g, '/').split('/');
                const base = parts.filter(Boolean).at(-1);
                if (base) campaignName = base;
              }
              triggerAutoScan(path);
              step = 3;
            }}
          />
        {:else if step === 3}
          <div class="space-y-4">
            <!-- Automated Campaign Ingestion & Entity Preview (Automated Viewer) -->
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="font-bold text-sm text-slate-200">Campaign Auto-Ingestion Pipeline</h3>
                  <p class="text-[10px] text-slate-400">
                    {#if selectedDirectory}
                      Scanning: <span class="font-mono text-indigo-300">{selectedDirectory}</span>
                    {:else}
                      No directory selected yet.
                    {/if}
                  </p>
                </div>
                {#if selectedDirectory}
                  <button
                    type="button"
                    onclick={() => { triggerAutoScan(); }}
                    disabled={ingestPipelineStore.isScanning || ingestPipelineStore.isProcessing}
                    class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold rounded-lg border border-slate-700 transition-colors disabled:opacity-50"
                  >
                    {ingestPipelineStore.isScanning ? '⏳ Scanning…' : '🔄 Rescan'}
                  </button>
                {/if}
              </div>

              <!-- Real-time Progress Bar -->
              {#if ingestPipelineStore.isScanning || ingestPipelineStore.isProcessing || ingestPipelineStore.totalCount > 0}
                <div class="bg-slate-950 border border-slate-800/80 rounded-xl p-3 space-y-2">
                  <div class="flex items-center justify-between text-[11px]">
                    <span class="text-slate-300 font-semibold flex items-center gap-1.5">
                      {#if ingestPipelineStore.isScanning}
                        <span class="animate-spin">⏳</span> Detecting assets in vault…
                      {:else if ingestPipelineStore.isProcessing}
                        <span class="animate-pulse text-indigo-400">⚡</span> Processing {ingestPipelineStore.processingCount} of {ingestPipelineStore.totalCount} items…
                      {:else}
                        <span class="text-emerald-400">✓</span> Ingestion pipeline idle ({ingestPipelineStore.doneCount} completed)
                      {/if}
                    </span>
                    <span class="font-mono font-bold text-indigo-300">{ingestPipelineStore.overallProgressPercent}%</span>
                  </div>
                  <div class="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                    <div
                      class="bg-gradient-to-r from-indigo-500 via-sky-500 to-emerald-500 h-full transition-all duration-300"
                      style="width: {ingestPipelineStore.overallProgressPercent}%"
                    ></div>
                  </div>
                  {#if ingestPipelineStore.pdfProgress}
                    <div class="pt-1 text-[10px] text-indigo-300 flex items-center justify-between bg-slate-900/90 px-2 py-1 rounded border border-indigo-900/60 font-mono">
                      <span class="truncate">📄 [{ingestPipelineStore.pdfProgress.count}/{ingestPipelineStore.pdfProgress.total}] {ingestPipelineStore.pdfProgress.filename}</span>
                      <span class="uppercase font-bold text-sky-400 shrink-0 ml-2">{ingestPipelineStore.pdfProgress.status}</span>
                    </div>
                  {/if}
                </div>
              {/if}

              <!-- Entity Count Preview Badges -->
              <div class="grid grid-cols-3 gap-2">
                <div class="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 flex items-center gap-2">
                  <span class="text-lg">🗺️</span>
                  <div>
                    <span class="font-black text-slate-100 text-xs block">{detectedMaps.length}</span>
                    <span class="text-[10px] text-slate-400 block">Maps Detected</span>
                  </div>
                </div>
                <div class="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 flex items-center gap-2">
                  <span class="text-lg">🛡️</span>
                  <div>
                    <span class="font-black text-slate-100 text-xs block">{detectedTokens.length}</span>
                    <span class="text-[10px] text-slate-400 block">Tokens Detected</span>
                  </div>
                </div>
                <div class="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 flex items-center gap-2">
                  <span class="text-lg">📜</span>
                  <div>
                    <span class="font-black text-slate-100 text-xs block">{detectedDocs.length}</span>
                    <span class="text-[10px] text-slate-400 block">Docs &amp; Lore</span>
                  </div>
                </div>
              </div>

              <!-- Detected Asset Preview List -->
              {#if ingestPipelineStore.queue.length > 0}
                <div class="border border-slate-800 rounded-xl bg-slate-950/60 p-2 max-h-36 overflow-y-auto space-y-1">
                  {#each ingestPipelineStore.queue.slice(0, 15) as item}
                    <div class="flex items-center justify-between text-[10px] px-2 py-1 rounded bg-slate-900/60 border border-slate-800/40">
                      <div class="flex items-center gap-1.5 truncate max-w-[70%]">
                        <span>{item.category === 'image' ? (item.name.toLowerCase().includes('token') ? '🛡️' : '🗺️') : item.category === 'audio' ? '🎵' : '📄'}</span>
                        <span class="text-slate-300 font-mono truncate" title={item.name}>{item.name}</span>
                      </div>
                      <span class="px-1.5 py-0.5 rounded text-[9px] font-bold font-mono uppercase {item.status === 'done' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/50' : item.status === 'processing' ? 'bg-indigo-950 text-indigo-300 border border-indigo-800/50' : item.status === 'error' ? 'bg-rose-950 text-rose-300 border border-rose-800/50' : 'bg-slate-800 text-slate-400'}">
                        {item.status}
                      </span>
                    </div>
                  {/each}
                  {#if ingestPipelineStore.queue.length > 15}
                    <div class="text-[9px] text-slate-500 text-center py-0.5 font-mono">
                      + {ingestPipelineStore.queue.length - 15} more assets queued
                    </div>
                  {/if}
                </div>
              {/if}
            </div>

            <!-- Display Architecture -->
            <div class="pt-2 border-t border-slate-800">
              <h3 class="font-bold text-sm text-slate-200 mb-2">Display Architecture</h3>
              <div class="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onclick={() => displayPreset = 'projector'}
                  class="p-2.5 rounded-xl border text-left transition-all {displayPreset === 'projector' ? 'bg-indigo-950/80 border-indigo-500 text-indigo-200' : 'bg-slate-950 border-slate-800 text-slate-400'}"
                >
                  <span class="text-xl block mb-0.5">🖥️</span>
                  <span class="font-bold block text-xs">TV / Projector</span>
                  <span class="text-[10px] text-slate-500 block mt-0.5">Dual-screen tabletop display.</span>
                </button>
                <button
                  type="button"
                  onclick={() => displayPreset = 'companion'}
                  class="p-2.5 rounded-xl border text-left transition-all {displayPreset === 'companion' ? 'bg-indigo-950/80 border-indigo-500 text-indigo-200' : 'bg-slate-950 border-slate-800 text-slate-400'}"
                >
                  <span class="text-xl block mb-0.5">📱</span>
                  <span class="font-bold block text-xs">Companion</span>
                  <span class="text-[10px] text-slate-500 block mt-0.5">Mobile Wi-Fi character sheets.</span>
                </button>
                <button
                  type="button"
                  onclick={() => displayPreset = 'solo'}
                  class="p-2.5 rounded-xl border text-left transition-all {displayPreset === 'solo' ? 'bg-indigo-950/80 border-indigo-500 text-indigo-200' : 'bg-slate-950 border-slate-800 text-slate-400'}"
                >
                  <span class="text-xl block mb-0.5">🏰</span>
                  <span class="font-bold block text-xs">Solo Prep</span>
                  <span class="text-[10px] text-slate-500 block mt-0.5">Single-screen DM workstation.</span>
                </button>
              </div>
            </div>

            <!-- Table Rules Preset (5e SRD) -->
            <div class="space-y-1.5 pt-2 border-t border-slate-800">
              <h3 class="font-bold text-sm text-slate-200">Table Rules Preset (5e SRD)</h3>
              <div class="space-y-1.5">
                <label class="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer">
                  <div>
                    <span class="font-bold text-slate-200 block text-xs">Standard DEX Initiative</span>
                    <span class="text-[10px] text-slate-500">Pure 5e SRD Dexterity initiative checks without house rules.</span>
                  </div>
                  <input type="checkbox" bind:checked={ruleDexInit} class="accent-indigo-500 rounded" />
                </label>
                <label class="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer">
                  <div>
                    <span class="font-bold text-slate-200 block text-xs">Gritty Realism Resting</span>
                    <span class="text-[10px] text-slate-500">Short rest = 8 hours; Long rest = 7 days.</span>
                  </div>
                  <input type="checkbox" bind:checked={ruleGrittyRealism} class="accent-indigo-500 rounded" />
                </label>
                <label class="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer">
                  <div>
                    <span class="font-bold text-slate-200 block text-xs">Equipment Durability (RP &amp; Sunder)</span>
                    <span class="text-[10px] text-slate-500">Enable Resistance Points and weapon maintenance wear.</span>
                  </div>
                  <input type="checkbox" bind:checked={ruleDurability} class="accent-indigo-500 rounded" />
                </label>
              </div>
            </div>
          </div>
        {/if}
      </div>

      <!-- Footer Navigation Buttons -->
      <div class="px-6 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
        {#if step > 1}
          <button
            type="button"
            onclick={() => step = step - 1}
            class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-bold text-xs transition-colors"
          >
            Back
          </button>
        {:else}
          <div></div>
        {/if}

        <button
          type="button"
          onclick={handleNextStep}
          class="px-4 py-1.5 {step < maxSteps ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-600/30'} text-white rounded-lg font-bold text-xs transition-colors shadow"
          title="Next Step"
        >
          {step < maxSteps ? 'Next Step' : 'Next Step (Launch Workstation)'}
        </button>
      </div>
    </div>
  </div>
{/if}
