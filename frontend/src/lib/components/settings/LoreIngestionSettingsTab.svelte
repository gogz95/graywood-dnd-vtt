<script lang="ts">
  // src/lib/components/settings/LoreIngestionSettingsTab.svelte
  // Universal Multi-Format Lore Ingestion, Native Folder Scan, Activity Log, and Compendium Hard Reset

  import { onMount } from 'svelte';
  import { sourceDb, type SourceDocument } from '../../db/sourceStore';
  import {
    ingestUniversalFile,
    type IngestionFileResult
  } from '../../importers/universalIngestionEngine';
  import { loreGraphStore } from '../../stores/loreGraphStore.svelte';
  import { detectHomebrewRules, type RuleDetectionResult } from '../../importers/ruleDetector';
  import HomebrewSuggestionModal from '../modals/HomebrewSuggestionModal.svelte';

  let isDragging = $state(false);
  let isProcessing = $state(false);
  let progressStatus = $state<string | null>(null);
  let errorMessage = $state<string | null>(null);
  let existingDocuments = $state<SourceDocument[]>([]);
  let activityLogs = $state<IngestionFileResult[]>([]);
  let folderInputEl = $state<HTMLInputElement | null>(null);

  // Homebrew Suggestion Modal State
  let showSuggestionModal = $state(false);
  let detectedRules = $state<RuleDetectionResult[]>([]);

  async function loadExistingDocs() {
    try {
      existingDocuments = await sourceDb.documents.toArray();
    } catch (err) {
      console.warn('Failed loading existing source documents', err);
    }
  }

  onMount(() => {
    loadExistingDocs();
  });

  async function scanForHomebrewRules() {
    try {
      const chunks = await sourceDb.chunks.toArray();
      if (chunks.length > 0) {
        const detections = detectHomebrewRules(chunks.map((c) => c.text));
        if (detections.length > 0) {
          detectedRules = detections;
          showSuggestionModal = true;
        }
      }
    } catch (err) {
      console.warn('Failed scanning chunks for homebrew rules', err);
    }
  }

  async function handleFiles(files: FileList | File[]) {
    isProcessing = true;
    errorMessage = null;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        progressStatus = `Ingesting ${file.name} (${i + 1}/${files.length})...`;
        const results = await ingestUniversalFile(file, file.name);
        activityLogs = [...results, ...activityLogs];
      }
      progressStatus = 'Universal ingestion complete! Documents grounded in source compendium.';
      await loadExistingDocs();
      await scanForHomebrewRules();
    } catch (err: any) {
      errorMessage = err?.message || 'Failed to ingest files.';
    } finally {
      isProcessing = false;
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }

  function onFileInput(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      handleFiles(input.files);
    }
  }

  async function handleNativeFolderScan() {
    isProcessing = true;
    errorMessage = null;
    progressStatus = 'Opening native campaign directory picker...';

    try {
      // 1. Check if running inside Tauri window with IPC
      const tauri = (window as any).__TAURI__;
      if (tauri?.core?.invoke) {
        progressStatus = 'Scanning directory with native Rust engine...';
        const entries: Array<{
          name: string;
          relative_path: string;
          extension: string;
          size_bytes: number;
          content: string;
        }> = await tauri.core.invoke('pick_and_read_campaign_folder');

        if (!entries || entries.length === 0) {
          progressStatus = 'Folder scan cancelled or no supported files found.';
          isProcessing = false;
          return;
        }

        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          progressStatus = `Ingesting vault file ${entry.name} (${i + 1}/${entries.length})...`;
          const blob = new Blob([entry.content], { type: 'text/plain' });
          const results = await ingestUniversalFile(blob, entry.name);
          activityLogs = [...results, ...activityLogs];
        }

        progressStatus = `Successfully scanned and ingested ${entries.length} vault files!`;
        await loadExistingDocs();
        await scanForHomebrewRules();
      } else {
        // Fallback in web browser mode: trigger webkitdirectory file input
        folderInputEl?.click();
      }
    } catch (err: any) {
      errorMessage = err?.message || 'Failed during folder scan.';
    } finally {
      isProcessing = false;
    }
  }

  async function handleDelete(id: string) {
    await sourceDb.documents.delete(id);
    await loadExistingDocs();
  }

  // ── Hard Reset Compendium Cache (Part 4) ──────────────────────────────────
  async function handleHardResetCompendiumCache() {
    if (confirm('HARD RESET: Purge all documents, chunks, and lore from cache without re-seeding dummy records?')) {
      isProcessing = true;
      try {
        await sourceDb.documents.clear();
        await sourceDb.chunks.clear();
        loreGraphStore.clearAll();
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('vtt_seeds_initialized', 'true');
          localStorage.removeItem('vtt_lore_entities');
          localStorage.removeItem('vtt_lore_relationships');
        }
        await loadExistingDocs();
        activityLogs = [];
        progressStatus = 'Compendium cache hard reset complete. Zero mock data retained.';
      } catch (err: any) {
        errorMessage = 'Failed during hard reset: ' + err?.message;
      } finally {
        isProcessing = false;
      }
    }
  }
</script>

<div class="space-y-6 text-slate-200 select-none">
  <!-- Header & Reset Utility -->
  <div class="border-b border-slate-800 pb-4 flex items-center justify-between flex-wrap gap-3">
    <div>
      <h3 class="text-base font-bold text-slate-100 flex items-center gap-2">
        <span>📚</span> Universal Multi-Format Data Ingestion
      </h3>
      <p class="text-xs text-slate-400 mt-1">
        Ingest rulebooks, campaign dossiers, item tables, and vector maps into local IndexedDB for the AI Archivist and Lore Wiki.
      </p>
    </div>

    <!-- Hard Reset Compendium Cache Button (Part 4) -->
    <button
      type="button"
      onclick={handleHardResetCompendiumCache}
      class="px-3.5 py-1.5 bg-rose-950/80 hover:bg-rose-900 border border-rose-800/80 text-rose-200 text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-1.5"
      title="Purge all documents, chunks, and lore cache without re-seeding dummy records"
    >
      <span>💥</span>
      <span>Hard Reset Compendium Cache</span>
    </button>
  </div>

  <!-- Folder Scanning & Drag-and-Drop Dropzone -->
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <span class="text-xs font-bold uppercase tracking-wider text-slate-400">Supported Formats:</span>
      <span class="text-[11px] font-mono text-indigo-400">.md · .txt · .json · .jsonl · .csv · .tsv · .zip · .ds · .dd2vtt · .pdf</span>
    </div>

    <div
      role="region"
      aria-label="Universal Ingestion Drop Target"
      ondragover={(e) => { e.preventDefault(); isDragging = true; }}
      ondragleave={() => isDragging = false}
      ondrop={onDrop}
      class="border-2 border-dashed rounded-2xl p-8 text-center transition-all flex flex-col items-center justify-center min-h-[190px] {isDragging ? 'border-indigo-500 bg-indigo-950/20 shadow-lg shadow-indigo-500/10' : 'border-slate-700 bg-slate-900/40 hover:border-slate-600'}"
    >
      <div class="w-12 h-12 rounded-2xl bg-indigo-600/15 border border-indigo-500/30 flex items-center justify-center text-2xl mb-3">
        📥
      </div>
      <p class="text-sm font-bold text-slate-200">
        Drag &amp; Drop Multi-Format Lore or Map Files Here
      </p>
      <p class="text-xs text-slate-400 mt-1 max-w-md">
        Processes markdown header hierarchies, JSON matrices, TSV tables, ZIP archives, Line of Sight geometry, and PDF pages.
      </p>

      <div class="mt-4 flex items-center gap-3 flex-wrap justify-center">
        <!-- Native Directory Picker (Obsidian Vaults) -->
        <button
          type="button"
          onclick={handleNativeFolderScan}
          class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
          title="Scan campaign vault or local folder using native file dialog"
        >
          <span>📁</span>
          <span>Scan Campaign Folder</span>
        </button>

        <!-- Multi-file picker -->
        <label class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5">
          <span>📄 Browse Files</span>
          <input
            type="file"
            multiple
            accept=".md,.txt,.json,.jsonl,.csv,.tsv,.zip,.ds,.dd2vtt,.uvtt,.pdf"
            class="hidden"
            onchange={onFileInput}
          />
        </label>

        <!-- Hidden directory input for web browser fallback -->
        <input
          type="file"
          bind:this={folderInputEl}
          webkitdirectory
          class="hidden"
          onchange={onFileInput}
        />
      </div>
    </div>
  </div>

  <!-- Status & Progress -->
  {#if isProcessing}
    <div class="p-4 bg-indigo-950/40 border border-indigo-800/50 rounded-xl space-y-2 animate-pulse">
      <div class="flex items-center gap-2 text-xs font-bold text-indigo-300">
        <span class="inline-block animate-spin">⏳</span>
        <span>{progressStatus || 'Processing files...'}</span>
      </div>
      <div class="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
        <div class="bg-indigo-500 h-full w-2/3 animate-pulse"></div>
      </div>
    </div>
  {/if}

  {#if errorMessage}
    <div class="p-3 bg-rose-950/40 border border-rose-800/50 rounded-xl text-xs text-rose-300">
      ⚠️ {errorMessage}
    </div>
  {/if}

  <!-- Scrollable Ingestion Activity Log -->
  {#if activityLogs.length > 0}
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400">
          Activity Log ({activityLogs.length} Entries)
        </h4>
        <button
          type="button"
          onclick={() => activityLogs = []}
          class="text-[11px] text-slate-500 hover:text-slate-300"
        >
          Clear Log
        </button>
      </div>

      <div class="space-y-1.5 max-h-48 overflow-y-auto pr-1">
        {#each activityLogs as log}
          <div class="p-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs flex items-center justify-between">
            <div class="flex items-center gap-2 min-w-0">
              <span class="px-1.5 py-0.5 rounded bg-indigo-950 border border-indigo-800/60 font-mono text-[10px] text-indigo-300 font-bold shrink-0">
                {log.format}
              </span>
              <span class="font-medium text-slate-200 truncate">{log.fileName}</span>
            </div>
            <div class="flex items-center gap-3 shrink-0 text-[11px] font-mono text-slate-400">
              <span>{log.chunksCount} chunks</span>
              <span>{(log.sizeBytes / 1024).toFixed(1)} KB</span>
              {#if log.success}
                <span class="text-emerald-400 font-bold">✓ Ready</span>
              {:else}
                <span class="text-rose-400 font-bold">✗ Failed</span>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Indexed Documents Inventory -->
  <div class="space-y-3 pt-2">
    <div class="flex items-center justify-between">
      <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400">
        Indexed Lore Archive ({existingDocuments.length} Documents)
      </h4>
    </div>

    {#if existingDocuments.length === 0}
      <div class="p-6 bg-slate-900/40 border border-slate-800 rounded-xl text-center text-xs text-slate-500">
        No documents currently indexed in IndexedDB. Drop files or scan a campaign folder above.
      </div>
    {:else}
      <div class="space-y-2 max-h-56 overflow-y-auto pr-1">
        {#each existingDocuments as doc (doc.id)}
          <div class="flex items-center justify-between p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs">
            <div class="flex items-center gap-2.5 min-w-0">
              <span class="text-base">
                {#if doc.type === 'md'}📘
                {:else if doc.type === 'pdf'}📕
                {:else if doc.type === 'json'}📙
                {:else}📄{/if}
              </span>
              <div class="min-w-0">
                <div class="font-bold text-slate-200 truncate">{doc.name}</div>
                <div class="text-[10px] text-slate-500 font-mono">
                  {(doc.sizeBytes / 1024).toFixed(1)} KB · Added {new Date(doc.dateAdded).toLocaleDateString()}
                </div>
              </div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span class="px-2 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-800/40 rounded text-[10px] font-mono font-semibold">
                ACTIVE
              </span>
              <button
                type="button"
                onclick={() => handleDelete(doc.id)}
                class="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                title="Delete document"
              >
                🗑️
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

{#if showSuggestionModal}
  <HomebrewSuggestionModal
    detectedRules={detectedRules}
    onclose={() => {
      showSuggestionModal = false;
    }}
  />
{/if}
