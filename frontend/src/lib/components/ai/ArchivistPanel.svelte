<script lang="ts">
  // ArchivistPanel.svelte — Independent, dockable Rules Archivist RAG panel
  // Features: Strict SRD 5e/5.5e referee answers, grounded citations, knowledge base dropzone

  import { onMount } from 'svelte';
  import { archivistStore, type ArchivistMessage } from '../../stores/archivistStore.svelte';
  import KnowledgeBaseModal from './KnowledgeBaseModal.svelte';
  import { ingestDocument } from '../../importers/documentImporter';
  import { audioEngine } from '../../audio/AudioEngine';

  let inputVal = $state('');
  let showKbModal = $state(false);
  let showSettings = $state(false);
  let chatBottom: HTMLElement | null = $state(null);
  let isDragOver = $state(false);

  function handleSend() {
    if (!inputVal.trim() || archivistStore.isGenerating) return;
    const q = inputVal;
    inputVal = '';
    archivistStore.askQuestion(q);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleDropFiles(e: DragEvent) {
    e.preventDefault();
    isDragOver = false;
    if (!e.dataTransfer?.files || e.dataTransfer.files.length === 0) return;

    for (let i = 0; i < e.dataTransfer.files.length; i++) {
      const file = e.dataTransfer.files[i];
      try {
        await ingestDocument(file);
      } catch (err) {
        console.error('File drop ingest error:', err);
      }
    }
    audioEngine.triggerSfx('sfx-secret');
    showKbModal = true;
  }

  $effect(() => {
    if (archivistStore.messages.length) {
      setTimeout(() => chatBottom?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  });
</script>

<div
  role="region"
  aria-label="Rules Archivist Panel"
  class="h-full flex flex-col bg-slate-900 border-l border-slate-800 text-slate-100 select-none overflow-hidden"
  ondragover={(e) => { e.preventDefault(); isDragOver = true; }}
  ondragleave={() => { isDragOver = false; }}
  ondrop={handleDropFiles}
>
  <!-- Header -->
  <div class="h-10 px-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
    <div class="flex items-center gap-2">
      <span class="text-sm">📖</span>
      <span class="text-xs font-bold uppercase tracking-wider text-indigo-300">Rules Archivist</span>
      <span class="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-950/80 text-indigo-400 border border-indigo-800/40">SRD RAG</span>
    </div>

    <div class="flex items-center gap-1">
      <button
        onclick={() => showKbModal = true}
        class="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors flex items-center gap-1"
        title="Knowledge Base & RAG Chunks"
      >
        <span>📚</span>
        <span>KB</span>
      </button>
      <button
        onclick={() => showSettings = !showSettings}
        class="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors text-xs"
        title="Model Settings"
      >
        ⚙️
      </button>
      <button
        onclick={() => archivistStore.clearChat()}
        class="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors text-xs"
        title="Clear Chat History"
      >
        🗑️
      </button>
    </div>
  </div>

  <!-- Dropzone overlay indicator -->
  {#if isDragOver}
    <div class="bg-indigo-950/90 border-2 border-dashed border-indigo-500 p-3 text-center text-xs text-indigo-200 animate-pulse">
      Drop .md / .txt / .json rulebook to ingest into RAG Knowledge Base!
    </div>
  {/if}

  <!-- Model Settings Popdown -->
  {#if showSettings}
    <div class="p-3 bg-slate-950/95 border-b border-slate-800 space-y-2 text-xs shrink-0">
      <div class="flex items-center justify-between">
        <label for="archivist-model" class="text-[10px] font-bold uppercase text-slate-400">Ollama Model</label>
        <input
          id="archivist-model"
          type="text"
          bind:value={archivistStore.model}
          class="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-xs text-slate-200 w-36"
        />
      </div>
      <div class="flex items-center justify-between">
        <label for="archivist-temp" class="text-[10px] font-bold uppercase text-slate-400">Temperature</label>
        <span class="font-mono text-indigo-400 text-xs">{archivistStore.temperature.toFixed(2)}</span>
      </div>
      <input
        id="archivist-temp"
        type="range"
        min="0"
        max="1"
        step="0.05"
        bind:value={archivistStore.temperature}
        class="w-full accent-indigo-500"
      />
    </div>
  {/if}

  <!-- Message Thread -->
  <div class="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
    {#each archivistStore.messages as msg (msg.id)}
      <div class="flex flex-col gap-1 {msg.sender === 'user' ? 'items-end' : 'items-start'}">
        <div class="flex items-center gap-1.5 text-[10px] text-slate-500">
          <span class="font-semibold uppercase tracking-wider">{msg.sender === 'user' ? 'DM' : 'Archivist'}</span>
        </div>

        <div
          class="max-w-[92%] rounded-xl px-3 py-2 leading-relaxed whitespace-pre-wrap {msg.sender === 'user'
            ? 'bg-indigo-600 text-white rounded-tr-none'
            : 'bg-slate-950 border border-slate-800 text-slate-200 rounded-tl-none shadow-sm'}"
        >
          {#if msg.isLoading}
            <div class="flex items-center gap-2 text-indigo-400 py-1">
              <span class="animate-spin text-sm">⏳</span>
              <span class="italic text-[11px]">Consulting SRD rules &amp; RAG records…</span>
            </div>
          {:else}
            {msg.text}
          {/if}

          <!-- Grounded citations -->
          {#if msg.citations && msg.citations.length > 0}
            <div class="mt-2 pt-2 border-t border-slate-800/80 space-y-1">
              <span class="text-[9px] uppercase font-bold text-indigo-400 block">Sources &amp; Citations:</span>
              <div class="flex flex-wrap gap-1">
                {#each msg.citations as cit}
                  <span class="text-[9px] px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/50 font-mono">
                    {cit}
                  </span>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/each}
    <div bind:this={chatBottom}></div>
  </div>

  <!-- Input Area -->
  <div class="p-2.5 bg-slate-950 border-t border-slate-800 shrink-0">
    <div class="flex gap-1.5">
      <textarea
        bind:value={inputVal}
        onkeydown={handleKeyDown}
        placeholder="Ask SRD mechanics question (e.g. grapple rules, surprise, concentration)…"
        rows="2"
        class="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 resize-none"
      ></textarea>
      {#if archivistStore.isGenerating}
        <button
          onclick={() => archivistStore.abort()}
          class="px-3 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-colors"
        >
          Stop
        </button>
      {:else}
        <button
          onclick={handleSend}
          disabled={!inputVal.trim()}
          class="px-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white rounded-lg text-xs font-bold transition-colors shadow"
        >
          Ask
        </button>
      {/if}
    </div>
  </div>

  <!-- Knowledge Base Modal -->
  <KnowledgeBaseModal bind:isOpen={showKbModal} />
</div>
