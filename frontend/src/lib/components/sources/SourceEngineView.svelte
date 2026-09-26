<script lang="ts">
  // SourceEngineView.svelte — Source & Lore Engine with Quartz-style Wikilinks & Popovers
  // Displays campaign sourcebook rules, journals, and lore notes with interactive Wikilink resolution.

  import WikilinkRenderer from '../lore/WikilinkRenderer.svelte';
  import { compendiumStore } from '../../stores/compendiumStore.svelte';

  let searchQuery = $state('');
  let selectedTab = $state<'journal' | 'rules'>('journal');
  let selectedId = $state<string>('');

  const journals = $derived(compendiumStore.journal);
  const rules = $derived(compendiumStore.rules);

  const filteredItems = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase();
    const source = selectedTab === 'journal' ? journals : rules;
    if (!q) return source;
    return source.filter((item: any) =>
      (item.title || item.name || '').toLowerCase().includes(q) ||
      (item.content || item.body || '').toLowerCase().includes(q)
    );
  });

  const activeDoc = $derived.by(() => {
    const source = selectedTab === 'journal' ? journals : rules;
    if (selectedId) {
      const found = source.find((item: any) => item.id === selectedId);
      if (found) return found;
    }
    return source[0] || null;
  });
</script>

<div class="h-full flex bg-slate-950 text-slate-100 overflow-hidden select-none">
  <!-- Left Sidebar -->
  <aside class="w-72 border-r border-slate-800 bg-slate-900/60 flex flex-col shrink-0">
    <div class="p-3 border-b border-slate-800 space-y-2">
      <div class="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
        <button
          onclick={() => { selectedTab = 'journal'; selectedId = ''; }}
          class="flex-1 py-1 text-xs font-bold rounded transition-colors {selectedTab === 'journal' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}"
        >
          📖 Journals ({journals.length})
        </button>
        <button
          onclick={() => { selectedTab = 'rules'; selectedId = ''; }}
          class="flex-1 py-1 text-xs font-bold rounded transition-colors {selectedTab === 'rules' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}"
        >
          📜 Rules ({rules.length})
        </button>
      </div>

      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Filter source notes..."
        class="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
      />
    </div>

    <!-- Items List -->
    <div class="flex-1 overflow-y-auto p-2 space-y-1">
      {#each filteredItems as item}
        {@const title = item.title || 'Untitled Document'}
        <button
          onclick={() => selectedId = item.id}
          class="w-full text-left p-2 rounded-lg text-xs transition-colors flex items-center justify-between
            {(activeDoc && activeDoc.id === item.id) ? 'bg-indigo-600/30 border border-indigo-500/60 text-indigo-200 font-bold' : 'hover:bg-slate-800 text-slate-300'}"
        >
          <span class="truncate">{title}</span>
          <span class="text-[10px] text-slate-500 ml-2 font-mono">5e</span>
        </button>
      {/each}
      {#if filteredItems.length === 0}
        <div class="p-4 text-center text-xs text-slate-500">
          No records found.
        </div>
      {/if}
    </div>
  </aside>

  <!-- Right Viewer Pane with WikilinkRenderer -->
  <main class="flex-1 overflow-y-auto p-8 bg-slate-950 flex flex-col items-center">
    {#if activeDoc}
      <article class="w-full max-w-3xl space-y-4">
        <header class="border-b border-slate-800 pb-3">
          <h1 class="text-2xl font-bold text-slate-100">{activeDoc.title}</h1>
          {#if activeDoc.category || activeDoc.sourceBook}
            <p class="text-xs text-slate-400 italic mt-0.5">
              Source: {activeDoc.sourceBook || 'SRD 5.1'} {activeDoc.category ? `• ${activeDoc.category}` : ''}
            </p>
          {/if}
        </header>

        <!-- Markdown body with live interactive Wikilinks -->
        <div class="text-sm leading-relaxed text-slate-300 bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 shadow-xl">
          <WikilinkRenderer markdown={activeDoc.content || ''} isDm={true} />
        </div>
      </article>
    {:else}
      <div class="h-full flex items-center justify-center text-slate-600 text-xs">
        Select a compendium rule or journal note to view interactive references.
      </div>
    {/if}
  </main>
</div>
