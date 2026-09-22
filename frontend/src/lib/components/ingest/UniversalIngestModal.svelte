<!-- src/lib/components/ingest/UniversalIngestModal.svelte -->
<!-- Universal Multi-Category Ingestion Pipeline & Folder Scanner Modal (Svelte 5 Runes) -->

<script lang="ts">
  import { ingestPipelineStore } from '../../services/ingest/ingestPipelineStore.svelte';
  import { ALL_SUPPORTED_EXTENSIONS } from '../../services/ingest/assetClassifier';
  import type { AssetCategory, IngestQueueItem } from '../../services/ingest/ingestTypes';

  let {
    isOpen = $bindable(false),
    onClose = () => { isOpen = false; },
  }: {
    isOpen?: boolean;
    onClose?: () => void;
  } = $props();

  let fileInputRef = $state<HTMLInputElement | null>(null);
  let isDraggingOver = $state(false);
  let showHardResetConfirm = $state(false);
  let isResetting = $state(false);
  let resetSuccessMessage = $state<string | null>(null);

  // File accept string for input element
  const acceptAttribute = ALL_SUPPORTED_EXTENSIONS.map((e) => `.${e}`).join(',');

  const CATEGORY_TABS: Array<{ id: string; label: string; icon: string }> = [
    { id: 'all', label: 'All Assets', icon: '📦' },
    { id: 'source', label: 'Source Material', icon: '📚' },
    { id: 'image', label: 'Images & Maps', icon: '🗺️' },
    { id: 'audio', label: 'Audio Tracks', icon: '🎵' },
    { id: 'video', label: 'Video Battlemaps', icon: '🎬' },
  ];

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    isDraggingOver = true;
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    isDraggingOver = false;
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDraggingOver = false;
    if (e.dataTransfer && e.dataTransfer.files.length > 0) {
      ingestPipelineStore.addFiles(e.dataTransfer.files);
    }
  }

  function handleFileInputChange(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      ingestPipelineStore.addFiles(target.files);
      target.value = '';
    }
  }

  async function executeHardReset() {
    isResetting = true;
    try {
      await ingestPipelineStore.hardResetCompendiumCache();
      resetSuccessMessage = 'Dexie compendium cache purged successfully! SRD 5.1 baseline preserved.';
      setTimeout(() => {
        resetSuccessMessage = null;
        showHardResetConfirm = false;
      }, 2500);
    } catch (err: any) {
      alert(`Hard reset failed: ${err?.message}`);
    } finally {
      isResetting = false;
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function getCategoryBadgeClass(category: AssetCategory): string {
    switch (category) {
      case 'source':
        return 'bg-emerald-950/80 text-emerald-400 border-emerald-800/60';
      case 'image':
        return 'bg-indigo-950/80 text-indigo-400 border-indigo-800/60';
      case 'audio':
        return 'bg-amber-950/80 text-amber-400 border-amber-800/60';
      case 'video':
        return 'bg-purple-950/80 text-purple-400 border-purple-800/60';
    }
  }
</script>

{#if isOpen}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6"
    role="presentation"
  >
    <!-- Modal Dialog Window -->
    <div
      class="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-slate-100"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ingest-modal-title"
    >
      <!-- ═════════════════════════════════════════════════════════════════════
           1. MODAL HEADER
      ══════════════════════════════════════════════════════════════════════ -->
      <div class="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 shrink-0">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-xl">
            📥
          </div>
          <div>
            <h2 id="ingest-modal-title" class="text-base font-black tracking-wide text-slate-100 flex items-center gap-2">
              Universal Asset Ingestion Pipeline
              <span class="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800/50">
                Multi-Category
              </span>
            </h2>
            <p class="text-xs text-slate-400 mt-0.5">
              Automated crawler & batch router for Source material, Images/Maps, Audio, and Video backgrounds
            </p>
          </div>
        </div>

        <button
          type="button"
          onclick={onClose}
          class="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          aria-label="Close Ingestion Modal"
        >
          ✕
        </button>
      </div>

      <!-- ═════════════════════════════════════════════════════════════════════
           2. PRIMARY ACTION CONTROLS & DROPZONE
      ══════════════════════════════════════════════════════════════════════ -->
      <div class="p-5 border-b border-slate-800/80 bg-slate-950/40 space-y-4 shrink-0">
        <!-- Action Toolbar -->
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <!-- Scan Campaign Folder Button -->
            <button
              type="button"
              onclick={() => ingestPipelineStore.scanCampaignFolder()}
              disabled={ingestPipelineStore.isScanning}
              class="px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 disabled:opacity-50"
              title="Recursively scan Ingest/ directory or select a campaign folder"
            >
              {#if ingestPipelineStore.isScanning}
                <span class="animate-spin">⏳</span> Scanning Folder...
              {:else}
                <span>🔍</span> Scan Campaign Folder
              {/if}
            </button>

            <!-- Browse Files Button -->
            <button
              type="button"
              onclick={() => fileInputRef?.click()}
              class="px-3 py-2 rounded-xl text-xs font-semibold transition-all border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5"
            >
              <span>📁</span> Browse Files
            </button>
            <input
              type="file"
              multiple
              accept={acceptAttribute}
              bind:this={fileInputRef}
              onchange={handleFileInputChange}
              class="hidden"
            />
          </div>

          <!-- Hard Reset Compendium Cache Button -->
          <button
            type="button"
            onclick={() => (showHardResetConfirm = true)}
            class="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border border-rose-900/60 bg-rose-950/30 hover:bg-rose-900/50 text-rose-300 flex items-center gap-1.5"
            title="Purge parsed compendium cache in Dexie while preserving campaign disk files"
          >
            <span>🗑️</span> Hard Reset Cache
          </button>
        </div>

        <!-- Drag & Drop Zone -->
        <button
          type="button"
          ondragover={handleDragOver}
          ondragleave={handleDragLeave}
          ondrop={handleDrop}
          aria-label="File Drop Zone"
          class="w-full border-2 border-dashed rounded-2xl p-4 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 {isDraggingOver
            ? 'border-indigo-500 bg-indigo-950/30 scale-[0.99]'
            : 'border-slate-800 hover:border-slate-700 bg-slate-900/40'}"
          onclick={() => fileInputRef?.click()}
        >
          <span class="text-2xl">📤</span>
          <span class="text-xs font-semibold text-slate-300">
            Drag & drop files or subfolders here (Source material, Image, Audio, Video)
          </span>
          <span class="text-[10px] text-slate-500 max-w-xl">
            Supported: .md, .txt, .json, .csv, .zip, .ds, .pdf, .png, .jpg, .webp, .dd2vtt, .uvtt, .geojson, .ogg, .mp3, .wav, .flac, .mp4, .webm
          </span>
        </button>

        {#if ingestPipelineStore.errorMessage}
          <div class="p-2.5 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-center gap-2">
            <span>⚠️</span>
            <span>{ingestPipelineStore.errorMessage}</span>
          </div>
        {/if}
      </div>

      <!-- ═════════════════════════════════════════════════════════════════════
           3. CATEGORY FILTER TABS & QUEUE HEADER
      ══════════════════════════════════════════════════════════════════════ -->
      <div class="px-5 py-2.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60 shrink-0">
        <div class="flex items-center gap-1 overflow-x-auto">
          {#each CATEGORY_TABS as tab}
            {@const count =
              tab.id === 'all'
                ? ingestPipelineStore.totalCount
                : ingestPipelineStore.categoryCounts[tab.id as AssetCategory] || 0}
            <button
              type="button"
              onclick={() => (ingestPipelineStore.activeFilter = tab.id)}
              class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 {ingestPipelineStore.activeFilter === tab.id
                ? 'bg-slate-800 text-indigo-300 border border-indigo-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'}"
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              <span class="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-950 text-slate-400">
                {count}
              </span>
            </button>
          {/each}
        </div>

        <div class="text-xs text-slate-400 font-mono">
          <span>{ingestPipelineStore.doneCount} / {ingestPipelineStore.totalCount} Processed</span>
        </div>
      </div>

      <!-- ═════════════════════════════════════════════════════════════════════
           4. INGESTION QUEUE LIST
      ══════════════════════════════════════════════════════════════════════ -->
      <div class="flex-1 min-h-[160px] overflow-y-auto p-4 space-y-2 scrollbar-thin">
        {#if ingestPipelineStore.filteredQueue.length === 0}
          <div class="h-40 flex flex-col items-center justify-center text-slate-500 text-xs space-y-1">
            <span class="text-3xl opacity-60">📭</span>
            <p class="font-medium">No assets queued in this view</p>
            <p class="text-[11px] text-slate-600">Scan your campaign Ingest/ directory or drop files to begin</p>
          </div>
        {:else}
          {#each ingestPipelineStore.filteredQueue as item (item.id)}
            <div class="p-3 bg-slate-950/60 border border-slate-800/90 rounded-xl flex items-center justify-between gap-3 text-xs transition-colors hover:border-slate-700">
              <!-- Item Info -->
              <div class="min-w-0 flex-1 flex items-center gap-3">
                <span class="text-lg shrink-0">
                  {#if item.category === 'source'}📚{:else if item.category === 'image'}🗺️{:else if item.category === 'audio'}🎵{:else}🎬{/if}
                </span>

                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-slate-200 truncate">{item.name}</span>
                    <span class="text-[9px] font-mono px-1.5 py-0.5 rounded border uppercase font-semibold {getCategoryBadgeClass(item.category)}">
                      {item.category}
                    </span>
                    <span class="text-[10px] font-mono text-slate-500 uppercase shrink-0">
                      .{item.extension} · {formatBytes(item.sizeBytes)}
                    </span>
                  </div>

                  {#if item.relativePath && item.relativePath !== item.name}
                    <div class="text-[10px] font-mono text-slate-500 truncate mt-0.5">
                      {item.relativePath}
                    </div>
                  {/if}

                  <!-- Progress Bar / Status Message -->
                  {#if item.status === 'processing'}
                    <div class="mt-1.5 space-y-1">
                      <div class="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          class="h-full bg-indigo-500 transition-all duration-300 rounded-full"
                          style="width: {item.progress}%"
                        ></div>
                      </div>
                      <span class="text-[10px] text-indigo-400">{item.message || 'Processing...'}</span>
                    </div>
                  {:else if item.status === 'done'}
                    <div class="text-[10px] text-emerald-400 flex items-center gap-1 mt-0.5">
                      <span>✓</span> {item.resultSummary || 'Successfully ingested'}
                    </div>
                  {:else if item.status === 'error'}
                    <div class="text-[10px] text-rose-400 flex items-center gap-1 mt-0.5">
                      <span>✕</span> {item.error || 'Ingestion error'}
                    </div>
                  {/if}
                </div>
              </div>

              <!-- Status Badge -->
              <div class="shrink-0 flex items-center gap-2">
                {#if item.status === 'queued'}
                  <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                    Queued
                  </span>
                {:else if item.status === 'processing'}
                  <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 animate-pulse">
                    Routing...
                  </span>
                {:else if item.status === 'done'}
                  <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60 font-bold">
                    Done
                  </span>
                {:else if item.status === 'error'}
                  <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-800/60 font-bold">
                    Failed
                  </span>
                {/if}
              </div>
            </div>
          {/each}
        {/if}
      </div>

      <!-- ═════════════════════════════════════════════════════════════════════
           5. FOOTER & BATCH EXECUTION BAR
      ══════════════════════════════════════════════════════════════════════ -->
      <div class="p-4 border-t border-slate-800 bg-slate-900 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-3">
          {#if ingestPipelineStore.isProcessing}
            <div class="flex items-center gap-2 text-xs font-semibold text-indigo-400">
              <span class="animate-spin">⚙️</span>
              <span>Processing Queue ({ingestPipelineStore.overallProgressPercent}%)</span>
            </div>
          {:else}
            <span class="text-xs text-slate-400">
              {ingestPipelineStore.queuedCount} items ready to ingest
            </span>
          {/if}
        </div>

        <div class="flex items-center gap-2">
          {#if ingestPipelineStore.doneCount > 0 || ingestPipelineStore.errorCount > 0}
            <button
              type="button"
              onclick={() => ingestPipelineStore.clearCompleted()}
              class="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              Clear Finished
            </button>
          {/if}

          <button
            type="button"
            onclick={() => ingestPipelineStore.startIngestion()}
            disabled={ingestPipelineStore.isProcessing || ingestPipelineStore.queuedCount === 0}
            class="px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 {ingestPipelineStore.queuedCount > 0 && !ingestPipelineStore.isProcessing
              ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed'}"
          >
            <span>⚡</span>
            <span>{ingestPipelineStore.isProcessing ? 'Ingesting Batch...' : 'Start Ingestion'}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Confirmation Gate Modal: Hard Reset Compendium Cache -->
{#if showHardResetConfirm}
  <div class="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
    <div class="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4 text-slate-100">
      <div class="w-12 h-12 rounded-2xl bg-rose-950/50 border border-rose-800/40 flex items-center justify-center text-2xl mx-auto">
        ⚠️
      </div>
      <div class="text-center space-y-1">
        <h3 class="text-base font-bold text-slate-100">Hard Reset Compendium Cache?</h3>
        <p class="text-xs text-slate-400">
          This purges all parsed compendium entries (monsters, spells, tables) from local Dexie storage.
          Your physical campaign disk files (maps, audio, original sourcebooks) will <strong class="text-slate-200">NOT</strong> be deleted.
        </p>
      </div>

      {#if resetSuccessMessage}
        <div class="p-2.5 rounded-xl bg-emerald-950/80 border border-emerald-800 text-emerald-400 text-xs text-center font-semibold">
          {resetSuccessMessage}
        </div>
      {/if}

      <div class="flex items-center gap-2 pt-2">
        <button
          type="button"
          onclick={() => (showHardResetConfirm = false)}
          disabled={isResetting}
          class="flex-1 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onclick={executeHardReset}
          disabled={isResetting}
          class="flex-1 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-colors shadow-lg shadow-rose-600/20"
        >
          {isResetting ? 'Purging Cache...' : 'Confirm Purge'}
        </button>
      </div>
    </div>
  </div>
{/if}
