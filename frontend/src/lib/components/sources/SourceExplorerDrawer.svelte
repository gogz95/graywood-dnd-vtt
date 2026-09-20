<script lang="ts">
  // src/lib/components/sources/SourceExplorerDrawer.svelte
  // NotebookLM-Style Local Source Engine & Rulebook Explorer (3-Column Layout)

  import { onMount } from 'svelte';
  import {
    getAllDocuments,
    setDocumentEnabled,
    deleteDocumentAndChunks,
    saveDocumentWithChunks,
    getChunksByDocId,
    type SourceDocument,
    type SourceChunk
  } from '../../db/sourceStore';
  import { ingestFileToDocument } from '../../importers/sourceIngestionEngine';
  import { searchGroundedSources, type SearchResultMatch } from '../../services/sourceSearch';

  let documents = $state<SourceDocument[]>([]);
  let searchQuery = $state('');
  let searchResults = $state<SearchResultMatch[]>([]);
  let isSearching = $state(false);

  let selectedResult = $state<SearchResultMatch | null>(null);
  let selectedDocForReading = $state<SourceDocument | null>(null);
  let selectedDocChunks = $state<SourceChunk[]>([]);
  let isUploading = $state(false);

  const enabledCount = $derived(documents.filter(d => d.isEnabled).length);

  onMount(async () => {
    await refreshDocuments();
  });

  async function refreshDocuments() {
    documents = await getAllDocuments();
    if (searchQuery.trim()) {
      await handleSearch();
    }
  }

  async function handleToggleDoc(doc: SourceDocument) {
    const nextState = !doc.isEnabled;
    doc.isEnabled = nextState;
    await setDocumentEnabled(doc.id, nextState);
    if (searchQuery.trim()) {
      await handleSearch();
    }
  }

  async function handleDeleteDoc(docId: string) {
    if (confirm('Delete this source document and all its indexed chunks?')) {
      await deleteDocumentAndChunks(docId);
      if (selectedDocForReading?.id === docId) {
        selectedDocForReading = null;
        selectedDocChunks = [];
      }
      if (selectedResult?.docId === docId) {
        selectedResult = null;
      }
      await refreshDocuments();
    }
  }

  async function handleSearch() {
    if (!searchQuery.trim()) {
      searchResults = [];
      return;
    }
    isSearching = true;
    try {
      searchResults = await searchGroundedSources(searchQuery);
    } finally {
      isSearching = false;
    }
  }

  async function handleSelectResult(result: SearchResultMatch) {
    selectedResult = result;
    selectedDocForReading = null;
  }

  async function handleSelectDocForReading(doc: SourceDocument) {
    selectedDocForReading = doc;
    selectedResult = null;
    selectedDocChunks = await getChunksByDocId(doc.id);
  }

  async function handleFileUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    isUploading = true;
    try {
      for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i];
        const { doc, chunks } = await ingestFileToDocument(file);
        await saveDocumentWithChunks(doc, chunks);
      }
      await refreshDocuments();
    } finally {
      isUploading = false;
      input.value = '';
    }
  }

  async function handleFileDrop(e: DragEvent) {
    e.preventDefault();
    if (!e.dataTransfer?.files || e.dataTransfer.files.length === 0) return;

    isUploading = true;
    try {
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const file = e.dataTransfer.files[i];
        const { doc, chunks } = await ingestFileToDocument(file);
        await saveDocumentWithChunks(doc, chunks);
      }
      await refreshDocuments();
    } finally {
      isUploading = false;
    }
  }
</script>

<div class="h-full w-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans">
  <!-- Top Bar -->
  <header class="h-12 px-4 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between shrink-0">
    <div class="flex items-center gap-2">
      <span class="text-lg">📚</span>
      <h2 class="text-xs font-black uppercase tracking-wider text-slate-200">
        Local Source Engine &amp; Rulebook Explorer
      </h2>
      <span class="px-2 py-0.5 rounded-full text-[10px] font-mono bg-indigo-950 text-indigo-300 border border-indigo-800/40">
        {enabledCount} / {documents.length} Sources Active
      </span>
    </div>

    <!-- Quick Upload Button -->
    <div>
      <input
        id="source-file-upload-input"
        type="file"
        multiple
        accept=".md,.txt,.pdf,.json"
        onchange={handleFileUpload}
        class="hidden"
      />
      <label
        for="source-file-upload-input"
        class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow"
      >
        <span>📁</span>
        <span>Upload Sources</span>
      </label>
    </div>
  </header>

  <!-- 3-Column Layout -->
  <div class="flex-1 flex min-h-0 overflow-hidden">
    
    <!-- ═══════════════════════════════════════════════════════════════════════
         COLUMN 1: Sources Checklist & Ingestion Dropzone (280px)
    ════════════════════════════════════════════════════════════════════════ -->
    <aside
      class="w-72 border-r border-slate-800 bg-slate-900/40 flex flex-col shrink-0 overflow-y-auto"
      ondragover={(e) => e.preventDefault()}
      ondrop={handleFileDrop}
    >
      <div class="p-3 border-b border-slate-800 flex items-center justify-between">
        <span class="text-[10px] uppercase font-bold text-slate-400">Sources Index</span>
        <span class="text-[10px] text-slate-500 font-mono">{documents.length} files</span>
      </div>

      <!-- Drag & Drop Zone Hint -->
      <div class="p-3 border-b border-slate-800/80 bg-slate-950/40 text-center">
        <div class="border-2 border-dashed border-slate-800 hover:border-indigo-500/50 rounded-xl p-3 transition-colors">
          <span class="text-xl block mb-1">📄</span>
          <p class="text-[11px] font-semibold text-slate-300">Drag &amp; drop .md, .pdf, or .txt</p>
          <p class="text-[9px] text-slate-500 mt-0.5">Auto-chunked into ~500-word blocks</p>
        </div>
      </div>

      <!-- Document List -->
      <div class="flex-1 p-2 space-y-1.5 overflow-y-auto">
        {#if documents.length === 0}
          <div class="p-4 text-center text-slate-500 text-xs">
            No source documents loaded. Upload rulebooks, campaign setting PDFs, or notes to begin.
          </div>
        {:else}
          {#each documents as doc (doc.id)}
            <div class="group flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 transition-colors">
              <div class="flex items-center gap-2 min-w-0">
                <input
                  id="toggle-doc-{doc.id}"
                  type="checkbox"
                  checked={doc.isEnabled}
                  onchange={() => handleToggleDoc(doc)}
                  class="rounded accent-indigo-500 cursor-pointer shrink-0"
                />
                <label
                  for="toggle-doc-{doc.id}"
                  class="text-xs font-semibold truncate cursor-pointer {doc.isEnabled ? 'text-slate-200' : 'text-slate-500 line-through'}"
                  title={doc.name}
                >
                  {doc.name}
                </label>
              </div>

              <div class="flex items-center gap-1 shrink-0">
                <button
                  onclick={() => handleSelectDocForReading(doc)}
                  class="p-1 rounded text-slate-400 hover:text-indigo-300 hover:bg-slate-800 text-xs"
                  title="Read Document"
                >
                  📖
                </button>
                <button
                  onclick={() => handleDeleteDoc(doc.id)}
                  class="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 text-xs"
                  title="Delete Document"
                >
                  🗑️
                </button>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </aside>

    <!-- ═══════════════════════════════════════════════════════════════════════
         COLUMN 2: Grounded Keyword Search & Result Snippets (380px)
    ════════════════════════════════════════════════════════════════════════ -->
    <section class="w-96 border-r border-slate-800 bg-slate-900/60 flex flex-col shrink-0 overflow-hidden">
      <!-- Search Input Header -->
      <div class="p-3 border-b border-slate-800 space-y-2">
        <label for="grounded-source-search-input" class="text-[10px] uppercase font-bold text-slate-400 block">
          Grounded Rulebook Query
        </label>
        <div class="relative">
          <input
            id="grounded-source-search-input"
            type="text"
            bind:value={searchQuery}
            oninput={handleSearch}
            placeholder="Search mechanics, rules, spells, lore…"
            class="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-semibold"
          />
          <span class="absolute left-2.5 top-2.5 text-xs text-slate-500">🔍</span>
        </div>
      </div>

      <!-- Results List -->
      <div class="flex-1 p-3 overflow-y-auto space-y-2.5">
        {#if isSearching}
          <div class="py-8 text-center text-slate-500 text-xs">
            <span class="animate-spin inline-block mr-1.5">⏳</span>
            Searching active sources…
          </div>
        {:else if searchQuery && searchResults.length === 0}
          <div class="py-8 text-center text-slate-500 text-xs">
            No grounded citations found across {enabledCount} active sources.
          </div>
        {:else if !searchQuery}
          <div class="py-8 text-center text-slate-500 text-xs">
            Type keywords above to query grounded citations across enabled rulebooks.
          </div>
        {:else}
          {#each searchResults as result (result.chunkId)}
            <button
              type="button"
              onclick={() => handleSelectResult(result)}
              class="w-full text-left p-3 rounded-xl border transition-all {selectedResult?.chunkId === result.chunkId
                ? 'bg-indigo-950/60 border-indigo-500 shadow-md'
                : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'}"
            >
              <div class="flex items-center justify-between gap-1 mb-1">
                <span class="text-[11px] font-bold text-indigo-300 truncate">
                  {result.sectionHeader}
                </span>
                <span class="text-[9px] px-1.5 py-0.2 rounded bg-slate-900 border border-slate-800 text-slate-400 font-mono shrink-0">
                  score {result.score}
                </span>
              </div>
              <p class="text-xs text-slate-300 leading-relaxed line-clamp-3 mb-2 font-serif">
                {result.snippet}
              </p>
              <div class="text-[10px] text-slate-500 flex items-center gap-1">
                <span>📄</span>
                <span class="truncate">{result.docName}</span>
              </div>
            </button>
          {/each}
        {/if}
      </div>
    </section>

    <!-- ═══════════════════════════════════════════════════════════════════════
         COLUMN 3: Full-Text Reading & Citation Inspector (Flex-1)
    ════════════════════════════════════════════════════════════════════════ -->
    <main class="flex-1 bg-slate-950 p-6 overflow-y-auto">
      {#if selectedResult}
        <div class="max-w-3xl mx-auto space-y-4">
          <div class="border-b border-slate-800 pb-4">
            <div class="flex items-center gap-2 text-xs text-indigo-400 font-semibold mb-1">
              <span>Source Citation:</span>
              <span class="text-slate-300">{selectedResult.docName}</span>
            </div>
            <h1 class="text-xl font-black text-slate-100 font-serif">
              {selectedResult.sectionHeader}
            </h1>
          </div>

          <div class="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-xl leading-relaxed text-sm text-slate-200 font-serif whitespace-pre-wrap">
            {selectedResult.fullText}
          </div>
        </div>
      {:else if selectedDocForReading}
        <div class="max-w-3xl mx-auto space-y-4">
          <div class="border-b border-slate-800 pb-4 flex items-center justify-between">
            <div>
              <span class="text-[10px] uppercase font-bold text-slate-500 block mb-0.5">Full Reading Pane</span>
              <h1 class="text-xl font-black text-slate-100">{selectedDocForReading.name}</h1>
            </div>
            <span class="text-xs font-mono text-slate-400">
              {selectedDocChunks.length} chunks indexed
            </span>
          </div>

          <div class="space-y-6">
            {#each selectedDocChunks as chunk (chunk.id)}
              <div class="bg-slate-900/40 border border-slate-800/60 rounded-xl p-5 space-y-2">
                <h3 class="text-xs font-bold uppercase tracking-wider text-indigo-300 font-mono">
                  {chunk.sectionHeader}
                </h3>
                <p class="text-xs text-slate-300 leading-relaxed font-serif whitespace-pre-wrap">
                  {chunk.text}
                </p>
              </div>
            {/each}
          </div>
        </div>
      {:else}
        <div class="h-full flex flex-col items-center justify-center text-center p-8 text-slate-500">
          <span class="text-4xl block mb-3">📖</span>
          <h3 class="text-sm font-bold text-slate-300 mb-1">Citation Reading Pane</h3>
          <p class="text-xs max-w-sm">
            Select a search result from Column 2 or click the read icon on any document in Column 1 to inspect the full text block.
          </p>
        </div>
      {/if}
    </main>

  </div>
</div>
