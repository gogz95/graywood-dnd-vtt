<script lang="ts">
  import { onMount } from 'svelte';
  import {
    ingestDocument,
    getDocuments,
    deleteDocument,
    clearKnowledgeBase,
    type KnowledgeDocument
  } from '../../importers/documentImporter';
  import { audioEngine } from '../../audio/AudioEngine';

  let { isOpen = $bindable(false) }: { isOpen?: boolean } = $props();

  let documents = $state<KnowledgeDocument[]>([]);
  let isLoading = $state(false);
  let isDragging = $state(false);
  let feedbackMessage = $state<{ text: string; isError?: boolean } | null>(null);
  let showWipeConfirm = $state(false);

  async function refreshDocs() {
    isLoading = true;
    try {
      documents = await getDocuments();
    } catch (err) {
      console.error('Failed to load knowledge documents:', err);
    } finally {
      isLoading = false;
    }
  }

  onMount(() => {
    refreshDocs();
  });

  $effect(() => {
    if (isOpen) {
      refreshDocs();
    }
  });

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    isLoading = true;
    feedbackMessage = null;
    let successCount = 0;
    let totalChunks = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const doc = await ingestDocument(file);
        successCount++;
        totalChunks += doc.totalChunks;
      } catch (err) {
        console.error(`Error ingesting ${file.name}:`, err);
      }
    }

    await refreshDocs();
    isLoading = false;

    if (successCount > 0) {
      audioEngine.triggerSfx('sfx-secret');
      feedbackMessage = {
        text: `Successfully ingested ${successCount} document(s) generating ${totalChunks} semantic RAG chunks!`,
      };
      setTimeout(() => { feedbackMessage = null; }, 5000);
    } else {
      feedbackMessage = {
        text: 'Failed to ingest selected files. Ensure they are valid .md, .txt, or .json files.',
        isError: true,
      };
    }
  }

  async function handleDelete(docId: string, title: string) {
    isLoading = true;
    try {
      await deleteDocument(docId);
      await refreshDocs();
      feedbackMessage = { text: `Removed "${title}" and purged its semantic chunks.` };
      setTimeout(() => { feedbackMessage = null; }, 3500);
    } catch (err) {
      console.error('Delete error:', err);
    } finally {
      isLoading = false;
    }
  }

  async function handleWipe() {
    isLoading = true;
    showWipeConfirm = false;
    try {
      await clearKnowledgeBase();
      await refreshDocs();
      feedbackMessage = { text: 'All documents and RAG knowledge chunks have been wiped.' };
      setTimeout(() => { feedbackMessage = null; }, 4000);
    } catch (err) {
      console.error('Wipe error:', err);
    } finally {
      isLoading = false;
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDate(ts: number): string {
    return new Date(ts).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
</script>

{#if isOpen}
  <div
    role="presentation"
    class="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    onclick={(e) => { if (e.target === e.currentTarget) isOpen = false; }}
  >
    <div class="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">

      <!-- Header -->
      <div class="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80 shrink-0">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-lg">📚</div>
          <div>
            <h2 class="text-base font-black text-slate-100 uppercase tracking-wide">Knowledge Base &amp; RAG Chunker</h2>
            <p class="text-xs text-slate-400">IndexedDB Grounded Context Engine for Rules Archivist &amp; DM Co-Pilot</p>
          </div>
        </div>
        <button
          onclick={() => isOpen = false}
          class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors text-sm"
        >
          ✕
        </button>
      </div>

      <!-- Feedback Banner -->
      {#if feedbackMessage}
        <div class="px-5 py-2.5 text-xs font-semibold shrink-0 {feedbackMessage.isError ? 'bg-rose-950/80 text-rose-300 border-b border-rose-800/40' : 'bg-emerald-950/80 text-emerald-300 border-b border-emerald-800/40'}">
          {feedbackMessage.text}
        </div>
      {/if}

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-6 space-y-6">

        <!-- Drag & Drop Upload Zone -->
        <label
          role="region"
          aria-label="Document dropzone"
          ondragover={(e) => { e.preventDefault(); isDragging = true; }}
          ondragleave={() => { isDragging = false; }}
          ondrop={(e) => { e.preventDefault(); isDragging = false; handleFiles(e.dataTransfer?.files || null); }}
          class="block w-full py-8 px-6 border-2 border-dashed rounded-2xl text-center cursor-pointer transition-all {isDragging ? 'border-indigo-500 bg-indigo-950/20' : 'border-slate-700 hover:border-indigo-500/70 bg-slate-950/50'}"
        >
          <span class="text-3xl block mb-2">📥</span>
          <span class="text-sm font-bold text-slate-200 block">Drag &amp; Drop Rulebooks or Source Text Files</span>
          <span class="text-xs text-slate-400 block mt-1">Supports Markdown (.md), Plain Text (.txt), and Structured JSON (.json)</span>
          <input
            type="file"
            accept=".md,.txt,.json"
            multiple
            class="hidden"
            onchange={(e) => handleFiles((e.target as HTMLInputElement).files)}
          />
        </label>

        <!-- Documents Table -->
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-300">
              Ingested Documents ({documents.length})
            </h3>
            <span class="text-xs font-mono text-slate-500">
              Total Chunks: {documents.reduce((acc, d) => acc + d.totalChunks, 0)}
            </span>
          </div>

          {#if documents.length === 0}
            <div class="p-8 text-center text-xs text-slate-500 border border-slate-800 rounded-xl bg-slate-950/30">
              No documents ingested yet. Upload standard 5e SRD rulebooks or campaign docs above to ground the AI in official rules.
            </div>
          {:else}
            <div class="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40">
              <table class="w-full text-left text-xs">
                <thead class="bg-slate-900/80 border-b border-slate-800 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  <tr>
                    <th class="py-2.5 px-3">Document Title</th>
                    <th class="py-2.5 px-3">File Size</th>
                    <th class="py-2.5 px-3">Semantic Chunks</th>
                    <th class="py-2.5 px-3">Ingestion Date</th>
                    <th class="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-800/60 font-medium">
                  {#each documents as doc (doc.id)}
                    <tr class="hover:bg-slate-900/50 transition-colors">
                      <td class="py-2.5 px-3 font-semibold text-slate-200 truncate max-w-[12rem]">
                        📄 {doc.title}
                      </td>
                      <td class="py-2.5 px-3 font-mono text-slate-400">
                        {formatBytes(doc.fileSize)}
                      </td>
                      <td class="py-2.5 px-3 font-mono text-indigo-400 font-bold">
                        {doc.totalChunks} chunks
                      </td>
                      <td class="py-2.5 px-3 text-slate-500">
                        {formatDate(doc.timestamp)}
                      </td>
                      <td class="py-2.5 px-3 text-right">
                        <button
                          onclick={() => handleDelete(doc.id, doc.title)}
                          class="px-2 py-1 bg-rose-950/50 hover:bg-rose-900/70 text-rose-300 rounded border border-rose-800/30 transition-colors text-[10px] font-bold"
                          title="Delete Document & Chunks"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>

      </div>

      <!-- Footer Actions -->
      <div class="px-6 py-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between shrink-0">
        <div>
          {#if !showWipeConfirm}
            <button
              onclick={() => showWipeConfirm = true}
              disabled={documents.length === 0}
              class="px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/50 text-rose-400 disabled:opacity-30 rounded-xl text-xs font-semibold border border-rose-900/30 transition-colors"
            >
              Clear Knowledge Base
            </button>
          {:else}
            <div class="flex items-center gap-2">
              <span class="text-xs text-rose-400 font-bold">Confirm wipe?</span>
              <button
                onclick={handleWipe}
                class="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-colors"
              >
                Yes, Wipe All
              </button>
              <button
                onclick={() => showWipeConfirm = false}
                class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors"
              >
                Cancel
              </button>
            </div>
          {/if}
        </div>

        <button
          onclick={() => isOpen = false}
          class="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-colors"
        >
          Close
        </button>
      </div>

    </div>
  </div>
{/if}
