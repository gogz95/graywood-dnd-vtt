<script lang="ts">
  // src/lib/components/settings/LoreIngestionSettingsTab.svelte
  // Grounded Markdown & Text Lore Ingestion Dropzone and Purge Management

  import { onMount } from 'svelte';
  import { ingestMarkdownLore, type IngestionResult } from '../../importers/loreMarkdownParser';
  import { sourceDb, type SourceDocument } from '../../db/sourceStore';

  let isDragging = $state(false);
  let isProcessing = $state(false);
  let purgeMockData = $state(true);
  let progressStatus = $state<string | null>(null);
  let lastResult = $state<IngestionResult | null>(null);
  let errorMessage = $state<string | null>(null);
  let existingDocuments = $state<SourceDocument[]>([]);

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

  async function handleFiles(files: FileList | File[]) {
    isProcessing = true;
    errorMessage = null;
    lastResult = null;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.name.endsWith('.md') && !file.name.endsWith('.txt')) {
          continue;
        }

        progressStatus = `Reading and parsing ${file.name} (${i + 1}/${files.length})...`;
        const text = await file.text();

        progressStatus = `Indexing chunks and grounding Aleamos lore for ${file.name}...`;
        const result = await ingestMarkdownLore(file.name, text, purgeMockData);
        lastResult = result;
      }
      progressStatus = 'Ingestion complete! All lore grounded into active compendium.';
      await loadExistingDocs();
    } catch (err: any) {
      errorMessage = err?.message || 'Failed to ingest markdown lore file.';
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

  async function handleDelete(id: string) {
    await sourceDb.documents.delete(id);
    await loadExistingDocs();
  }

  async function handlePurgeAll() {
    if (confirm('Purge all indexed source lore documents and chunks?')) {
      await sourceDb.documents.clear();
      await sourceDb.chunks.clear();
      await loadExistingDocs();
      lastResult = null;
      progressStatus = 'All source lore documents purged from IndexedDB.';
    }
  }
</script>

<div class="space-y-6 text-slate-200">
  <!-- Header -->
  <div class="border-b border-slate-800 pb-4">
    <h3 class="text-base font-bold text-slate-100 flex items-center gap-2">
      <span>📚</span> Grounded Lore Ingestion &amp; Archive Management
    </h3>
    <p class="text-xs text-slate-400 mt-1">
      Import Aleamos campaign dossiers, regional settlement profiles, and economic rules directly into local IndexedDB for the AI Archivist and Lore Wiki.
    </p>
  </div>

  <!-- Options -->
  <div class="flex items-center justify-between p-3.5 bg-slate-900/80 border border-slate-800 rounded-xl">
    <label class="flex items-center gap-2.5 cursor-pointer text-xs font-semibold select-none">
      <input
        type="checkbox"
        bind:checked={purgeMockData}
        class="w-4 h-4 rounded bg-slate-950 border-slate-700 text-indigo-600 focus:ring-indigo-500"
      />
      <span>Purge placeholder and mockup lore upon import</span>
    </label>

    <button
      type="button"
      onclick={handlePurgeAll}
      class="text-[11px] font-bold text-rose-400 hover:text-rose-300 hover:underline transition-colors"
    >
      Clear All Lore
    </button>
  </div>

  <!-- Drag-and-Drop Dropzone -->
  <div
    role="region"
    aria-label="Lore Dossier Drag and Drop Target"
    ondragover={(e) => { e.preventDefault(); isDragging = true; }}
    ondragleave={() => isDragging = false}
    ondrop={onDrop}
    class="border-2 border-dashed rounded-2xl p-8 text-center transition-all flex flex-col items-center justify-center min-h-[180px] {isDragging ? 'border-indigo-500 bg-indigo-950/20 shadow-lg shadow-indigo-500/10' : 'border-slate-700 bg-slate-900/40 hover:border-slate-600'}"
  >
    <div class="w-12 h-12 rounded-2xl bg-indigo-600/15 border border-indigo-500/30 flex items-center justify-center text-2xl mb-3">
      📜
    </div>
    <p class="text-sm font-bold text-slate-200">
      Drag &amp; Drop Markdown or Text Dossiers Here
    </p>
    <p class="text-xs text-slate-400 mt-1 max-w-sm">
      Supports <code class="text-indigo-300">.md</code> and <code class="text-indigo-300">.txt</code> (e.g. <em>Aleamos Lore - Non Campaign.md</em>). Parses categories, essence tags, and regional dialect markers.
    </p>

    <label class="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5">
      <span>📂 Browse Files</span>
      <input type="file" multiple accept=".md,.txt" class="hidden" onchange={onFileInput} />
    </label>
  </div>

  <!-- Progress & Results -->
  {#if isProcessing}
    <div class="p-4 bg-indigo-950/40 border border-indigo-800/50 rounded-xl space-y-2 animate-pulse">
      <div class="flex items-center gap-2 text-xs font-bold text-indigo-300">
        <span class="inline-block animate-spin">⏳</span>
        <span>{progressStatus || 'Processing dossier...'}</span>
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

  {#if lastResult}
    <div class="p-4 bg-emerald-950/40 border border-emerald-800/50 rounded-xl space-y-2 text-xs text-emerald-200">
      <div class="flex items-center justify-between">
        <span class="font-bold flex items-center gap-1.5">
          <span>✅</span> Ingested: <span class="font-mono text-white">{lastResult.docName}</span>
        </span>
        {#if lastResult.purgedMockCount > 0}
          <span class="px-2 py-0.5 bg-rose-900/60 text-rose-300 rounded font-mono text-[10px]">
            Purged {lastResult.purgedMockCount} placeholder files
          </span>
        {/if}
      </div>
      <div class="grid grid-cols-3 gap-2 pt-2 border-t border-emerald-800/30 text-center font-mono">
        <div class="bg-slate-900/70 p-2 rounded-lg">
          <div class="text-base font-black text-white">{lastResult.categoriesFound.length}</div>
          <div class="text-[10px] text-slate-400">Categories</div>
        </div>
        <div class="bg-slate-900/70 p-2 rounded-lg">
          <div class="text-base font-black text-white">{lastResult.sectionsCount}</div>
          <div class="text-[10px] text-slate-400">Sections</div>
        </div>
        <div class="bg-slate-900/70 p-2 rounded-lg">
          <div class="text-base font-black text-white">{lastResult.chunksCount}</div>
          <div class="text-[10px] text-slate-400">Chunks Indexed</div>
        </div>
      </div>
      {#if lastResult.categoriesFound.length > 0}
        <div class="pt-1 text-[11px] text-slate-300">
          <span class="text-slate-400 font-semibold">Identified Categories:</span>
          {lastResult.categoriesFound.join(' • ')}
        </div>
      {/if}
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
        No documents currently indexed in IndexedDB. Drop a file above to ground your campaign.
      </div>
    {:else}
      <div class="space-y-2 max-h-56 overflow-y-auto pr-1">
        {#each existingDocuments as doc (doc.id)}
          <div class="flex items-center justify-between p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs">
            <div class="flex items-center gap-2.5 min-w-0">
              <span class="text-base">{doc.type === 'md' ? '📘' : '📄'}</span>
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
