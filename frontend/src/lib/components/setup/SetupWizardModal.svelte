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

  let {
    isOpen = $bindable(false),
    onComplete,
    maxSteps = 4,
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

  // Step 2: Display Mode Preset
  let displayPreset = $state<'projector' | 'companion' | 'solo'>('projector');

  // Step 3: Rules Preset
  let ruleDexInit = $state(true);
  let ruleGrittyRealism = $state(false);
  let ruleDurability = $state(false);

  // Step 4: Compendium & Sources
  let isSeeding = $state(false);
  let seededCount = $state<number | null>(null);
  let isDragging = $state(false);
  let importedFiles = $state<string[]>([]);

  onMount(async () => {
    await campaignStore.initPromise;
    campaignName = campaignStore.campaignName || 'Default Campaign';
    dmName = campaignStore.dmAlias || 'Dungeon Master';
    tablePin = campaignStore.masterPin || '1337';

    if (!campaignStore.hasCompletedWizard) {
      isOpen = true;
    }
  });

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

  async function handleNextStep(): Promise<void> {
    await syncInputsToStore();
    if (step < maxSteps) {
      step += 1;
    } else {
      await finishSetup();
    }
  }

  async function handleSeedSrd(): Promise<void> {
    isSeeding = true;
    try {
      await compendiumDb.ensureSrdBaseline();
      const count = await compendiumDb.spells.count();
      seededCount = count;
    } catch {
      // ignore
    } finally {
      isSeeding = false;
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
            <p class="text-[11px] text-slate-400">Step {step} of {maxSteps}: {step === 1 ? 'Campaign Identity' : step === 2 ? 'Display Preset' : step === 3 ? 'Rules Preset' : 'Compendium & Ingestion'}</p>
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
          </div>
        {:else if step === 2}
          <div class="space-y-3">
            <h3 class="font-bold text-sm text-slate-200">Select Display Architecture</h3>
            <div class="grid grid-cols-3 gap-3">
              <button
                type="button"
                onclick={() => displayPreset = 'projector'}
                class="p-3 rounded-xl border text-left transition-all {displayPreset === 'projector' ? 'bg-indigo-950/80 border-indigo-500 text-indigo-200' : 'bg-slate-950 border-slate-800 text-slate-400'}"
              >
                <span class="text-2xl block mb-1">🖥️</span>
                <span class="font-bold block text-xs">TV / Projector</span>
                <span class="text-[10px] text-slate-500 block mt-1">Dual-screen tabletop display with dedicated player window.</span>
              </button>
              <button
                type="button"
                onclick={() => displayPreset = 'companion'}
                class="p-3 rounded-xl border text-left transition-all {displayPreset === 'companion' ? 'bg-indigo-950/80 border-indigo-500 text-indigo-200' : 'bg-slate-950 border-slate-800 text-slate-400'}"
              >
                <span class="text-2xl block mb-1">📱</span>
                <span class="font-bold block text-xs">Hybrid Companion</span>
                <span class="text-[10px] text-slate-500 block mt-1">Players connect phones/tablets for live sheets and rolls.</span>
              </button>
              <button
                type="button"
                onclick={() => displayPreset = 'solo'}
                class="p-3 rounded-xl border text-left transition-all {displayPreset === 'solo' ? 'bg-indigo-950/80 border-indigo-500 text-indigo-200' : 'bg-slate-950 border-slate-800 text-slate-400'}"
              >
                <span class="text-2xl block mb-1">🏰</span>
                <span class="font-bold block text-xs">Solo Prep</span>
                <span class="text-[10px] text-slate-500 block mt-1">Single-screen DM workstation for campaign world-building.</span>
              </button>
            </div>
          </div>
        {:else if step === 3}
          <div class="space-y-3">
            <h3 class="font-bold text-sm text-slate-200">Table Rules Preset (Strict 5e Baseline)</h3>
            <div class="space-y-2">
              <label class="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                <div>
                  <span class="font-bold text-slate-200 block">Standard DEX Initiative</span>
                  <span class="text-[10px] text-slate-500">Pure 5e SRD Dexterity initiative checks without house rules.</span>
                </div>
                <input type="checkbox" bind:checked={ruleDexInit} class="accent-indigo-500 rounded" />
              </label>
              <label class="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                <div>
                  <span class="font-bold text-slate-200 block">Gritty Realism Resting</span>
                  <span class="text-[10px] text-slate-500">Short rest = 8 hours; Long rest = 7 days.</span>
                </div>
                <input type="checkbox" bind:checked={ruleGrittyRealism} class="accent-indigo-500 rounded" />
              </label>
              <label class="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                <div>
                  <span class="font-bold text-slate-200 block">Equipment Durability (RP &amp; Sunder)</span>
                  <span class="text-[10px] text-slate-500">Enable Resistance Points and weapon maintenance wear.</span>
                </div>
                <input type="checkbox" bind:checked={ruleDurability} class="accent-indigo-500 rounded" />
              </label>
            </div>
          </div>
        {:else if step === 4}
          <div class="space-y-3">
            <h3 class="font-bold text-sm text-slate-200">Compendium Seeding &amp; Source Ingestion</h3>
            <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div>
                <span class="font-bold text-slate-200 block">Seed 5e SRD 5.1 Baseline</span>
                <span class="text-[10px] text-slate-500">Populates 300+ SRD Spells, Subclasses, Monsters, and Facilities.</span>
              </div>
              <button
                type="button"
                onclick={handleSeedSrd}
                disabled={isSeeding || seededCount !== null}
                class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-lg transition-colors"
              >
                {isSeeding ? 'Seeding…' : seededCount !== null ? `✓ Seeded` : 'Seed Compendium'}
              </button>
            </div>

            <!-- Drag and drop zone -->
            <div
              role="region"
              aria-label="Dropzone"
              ondragover={(e) => { e.preventDefault(); isDragging = true; }}
              ondragleave={() => isDragging = false}
              ondrop={handleDropFiles}
              class="border-2 border-dashed rounded-xl p-6 text-center transition-all {isDragging ? 'border-indigo-400 bg-indigo-950/20' : 'border-slate-800 bg-slate-950/50'}"
            >
              <span class="text-3xl block mb-1">📂</span>
              <span class="font-bold text-slate-300 block">Drop Sourcebooks, PDFs or Azgaar Maps</span>
              <span class="text-[10px] text-slate-500 block">Accepts .pdf, .md, .txt, .geojson, .dd2vtt</span>
            </div>

            {#if importedFiles.length > 0}
              <div class="text-[10px] text-emerald-400 font-mono">
                Imported: {importedFiles.join(', ')}
              </div>
            {/if}
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
