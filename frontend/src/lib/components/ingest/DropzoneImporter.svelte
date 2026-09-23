<!-- src/lib/components/ingest/DropzoneImporter.svelte -->
<!-- Universal Drag-and-Drop Ingestion Component for Graywood VTT (Svelte 5 Runes) -->

<script lang="ts">
  import {
    ingestFiles,
    ingestionProgressStore,
    type UniversalIngestionReport,
    type IngestionFileResult,
  } from '../../importers/universalIngestionEngine';
  import { audioEngine } from '../../audio/AudioEngine';

  let {
    onComplete,
    onFileIngested,
  }: {
    onComplete?: (report: UniversalIngestionReport) => void;
    onFileIngested?: (file: IngestionFileResult) => void;
  } = $props();

  // ── Svelte 5 Reactive State ────────────────────────────────────────────────
  let isDragging = $state(false);
  let isProcessing = $state(false);
  let report = $state<UniversalIngestionReport | null>(null);

  let currentFileName = $state('');
  let currentStep = $state('');
  let currentPercent = $state(0);

  let fileInputElement: HTMLInputElement | null = null;

  // Subscribe to engine progress store
  $effect(() => {
    const unsub = ingestionProgressStore.subscribe((state) => {
      currentFileName = state.fileName;
      currentStep = state.currentStep;
      currentPercent = state.progressPercent;
    });
    return unsub;
  });

  // ── Drag & Drop Handlers ───────────────────────────────────────────────────
  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!isProcessing) {
      isDragging = true;
    }
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    isDragging = false;
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    isDragging = false;
    if (isProcessing) return;

    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      await processFiles(files);
    }
  }

  async function handleFileInputChange(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      const files = Array.from(target.files);
      await processFiles(files);
      target.value = ''; // Reset input so same file can be re-selected if desired
    }
  }

  function triggerBrowse() {
    if (!isProcessing && fileInputElement) {
      fileInputElement.click();
    }
  }

  async function processFiles(files: File[]) {
    if (files.length === 0) return;

    isProcessing = true;
    report = null;
    audioEngine.triggerSfx('sfx-dice');

    try {
      const result = await ingestFiles(files);
      report = result;

      // Dispatch individual file callbacks
      if (onFileIngested) {
        for (const f of result.fileResults) {
          onFileIngested(f);
        }
      }

      onComplete?.(result);

      if (result.failed.length === 0) {
        audioEngine.triggerSfx('sfx-bell');
      }
    } catch (err: any) {
      report = {
        totalFiles: files.length,
        mapsExtracted: 0,
        tokensExtracted: 0,
        loreChunksCreated: 0,
        statblocksExtracted: 0,
        successful: [],
        failed: [err?.message || 'Ingestion engine failure'],
        fileResults: [],
      };
    } finally {
      isProcessing = false;
    }
  }

  function resetImporter() {
    report = null;
    isProcessing = false;
    isDragging = false;
  }

  const SUPPORTED_FORMATS = [
    { label: '.dd2vtt / .uvtt', desc: 'Tactical Maps & LOS Walls' },
    { label: '.pdf', desc: 'Rulebooks & Text' },
    { label: '.md / .txt', desc: 'Lore & 5e Statblocks' },
    { label: '.geojson', desc: 'Vector World Atlas' },
    { label: '.png / .webp', desc: 'Battlemaps & Tokens' },
    { label: '.mp3 / .ogg', desc: 'Campaign Audio' },
  ];
</script>

<div class="w-full flex flex-col space-y-4 font-sans select-none text-slate-100">
  <!-- Hidden Native File Input -->
  <input
    bind:this={fileInputElement}
    type="file"
    multiple
    onchange={handleFileInputChange}
    class="hidden"
    accept=".dd2vtt,.uvtt,.pdf,.md,.txt,.geojson,.ds,.png,.jpg,.jpeg,.webp,.mp3,.wav,.ogg,.flac,.m4a,.csv,.tsv,.json,.zip"
  />

  <!-- ═════════════════════════════════════════════════════════════════════════
       1. DRAG-AND-DROP ACTIVE ZONE
  ══════════════════════════════════════════════════════════════════════════ -->
  {#if !report}
    <div
      role="button"
      tabindex="0"
      aria-label="Campaign Asset Dropzone"
      ondragover={handleDragOver}
      ondragleave={handleDragLeave}
      ondrop={handleDrop}
      onclick={triggerBrowse}
      onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && triggerBrowse()}
      class="relative p-8 rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer flex flex-col items-center justify-center text-center {isDragging
        ? 'border-indigo-500 bg-indigo-950/40 shadow-xl shadow-indigo-950/50 scale-[1.01]'
        : 'border-slate-800 hover:border-slate-700 bg-slate-900/60 hover:bg-slate-900/90'}"
    >
      {#if isProcessing}
        <!-- Ingestion Processing / Progress Spinner -->
        <div class="py-6 flex flex-col items-center space-y-4 max-w-md w-full">
          <div class="relative w-14 h-14 flex items-center justify-center">
            <div class="absolute inset-0 rounded-full border-4 border-indigo-900 border-t-indigo-400 animate-spin"></div>
            <span class="text-xl">⚙️</span>
          </div>

          <div class="space-y-1 w-full text-center">
            <h4 class="text-sm font-bold text-slate-200">
              {currentStep || 'Processing Assets…'}
            </h4>
            <p class="text-xs text-indigo-400 font-mono truncate px-4">
              {currentFileName}
            </p>
          </div>

          <!-- Progress Bar -->
          <div class="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
            <div
              class="bg-gradient-to-r from-indigo-500 to-cyan-400 h-full transition-all duration-300"
              style="width: {currentPercent}%"
            ></div>
          </div>
          <span class="text-[10px] font-mono text-slate-500">{currentPercent}% complete</span>
        </div>

      {:else}
        <!-- Idle Dropzone Instructions -->
        <div class="space-y-3 flex flex-col items-center pointer-events-none">
          <div class="w-14 h-14 rounded-2xl bg-indigo-950/60 border border-indigo-800/60 flex items-center justify-center text-2xl shadow-inner">
            {isDragging ? '⚡' : '📥'}
          </div>

          <div>
            <h3 class="text-sm font-black uppercase tracking-wider text-slate-200">
              {isDragging ? 'Release to Ingest Campaign Files' : 'Drag & Drop Campaign Assets Here'}
            </h3>
            <p class="text-xs text-slate-400 mt-1">
              or <span class="text-indigo-400 font-bold underline">click to browse</span> from your local workstation
            </p>
          </div>

          <!-- Supported Format Badges -->
          <div class="flex flex-wrap items-center justify-center gap-1.5 pt-2 max-w-lg">
            {#each SUPPORTED_FORMATS as fmt}
              <span
                class="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-slate-950 text-slate-400 border border-slate-800"
                title={fmt.desc}
              >
                {fmt.label}
              </span>
            {/each}
          </div>
        </div>
      {/if}
    </div>

  <!-- ═════════════════════════════════════════════════════════════════════════
       2. POST-INGESTION REPORT VIEW
  ══════════════════════════════════════════════════════════════════════════ -->
  {:else}
    <div class="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <div class="flex items-center gap-2.5">
          <span class="text-2xl">
            {report.failed.length === 0 ? '✅' : '⚠️'}
          </span>
          <div>
            <h3 class="text-sm font-black text-slate-100 uppercase tracking-wider">
              Ingestion Report
            </h3>
            <p class="text-xs text-slate-400">
              Processed {report.totalFiles} asset{report.totalFiles === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onclick={resetImporter}
          class="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
        >
          Import More Files
        </button>
      </div>

      <!-- Extraction Metric Badges -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div class="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col">
          <span class="text-[10px] font-bold text-slate-500 uppercase">Total Files</span>
          <span class="text-lg font-black text-slate-200 font-mono mt-0.5">{report.totalFiles}</span>
        </div>

        <div class="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col">
          <span class="text-[10px] font-bold text-cyan-400 uppercase">Maps Extracted</span>
          <span class="text-lg font-black text-cyan-300 font-mono mt-0.5">{report.mapsExtracted}</span>
        </div>

        <div class="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col">
          <span class="text-[10px] font-bold text-amber-400 uppercase">Tokens Extracted</span>
          <span class="text-lg font-black text-amber-300 font-mono mt-0.5">{report.tokensExtracted}</span>
        </div>

        <div class="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col">
          <span class="text-[10px] font-bold text-emerald-400 uppercase">Statblocks Found</span>
          <span class="text-lg font-black text-emerald-300 font-mono mt-0.5">{report.statblocksExtracted}</span>
        </div>
      </div>

      <!-- File Results Breakdown -->
      {#if report.fileResults.length > 0}
        <div class="space-y-1.5 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
          <h4 class="text-[11px] font-bold uppercase tracking-wider text-slate-400">Processed Items</h4>
          {#each report.fileResults as file}
            <div class="px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs">
              <div class="flex items-center gap-2 min-w-0">
                <span class="text-xs">{file.success ? '✓' : '✗'}</span>
                <span class="font-semibold text-slate-200 truncate">{file.fileName}</span>
                <span class="px-1.5 py-0.2 rounded text-[9px] font-mono bg-slate-800 text-slate-400">
                  {file.format}
                </span>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                {#if file.success}
                  <span class="text-[10px] text-emerald-400 font-semibold">Indexed</span>
                {:else}
                  <span class="text-[10px] text-rose-400 font-semibold" title={file.error}>Failed</span>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}

      <!-- Failed Items Alert Box -->
      {#if report.failed.length > 0}
        <div class="p-3 rounded-xl bg-rose-950/40 border border-rose-900/60 text-xs space-y-1">
          <strong class="font-bold text-rose-400 block flex items-center gap-1.5">
            <span>⚠️</span> The following {report.failed.length} file{report.failed.length === 1 ? '' : 's'} could not be processed:
          </strong>
          <ul class="list-disc list-inside space-y-0.5 text-rose-300/80 font-mono text-[11px]">
            {#each report.failed as fail}
              <li class="truncate">{fail}</li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>
  {/if}
</div>
