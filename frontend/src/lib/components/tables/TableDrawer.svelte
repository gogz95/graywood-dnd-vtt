<!-- frontend/src/lib/components/tables/TableDrawer.svelte -->
<!-- Rollable Table Manager Drawer & Evaluation Panel -->
<script lang="ts">
  import { tableStore } from '../../stores/tableStore';
  import { chatLogService, type RollableTable, type TableEntry } from '../../services/chatLogService';

  let searchQuery = $state('');
  let expandedTableId = $state<string | null>(null);

  const tables = $derived(tableStore.tables);
  const isOpen = $derived(tableStore.isDrawerOpen);
  const isLoading = $derived(tableStore.isLoading);

  const filteredTables = $derived(
    tables.filter((t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.formula.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  function toggleExpand(id: string) {
    expandedTableId = expandedTableId === id ? null : id;
  }

  function rollTable(table: RollableTable) {
    tableStore.rollTable(table);
  }

  async function spawnTokens(entry: TableEntry) {
    await chatLogService.spawnTokensFromEntry(entry);
  }

  function openSource(sourceFileRel: string, pageNumber?: number) {
    if (sourceFileRel) {
      tableStore.openSourceViewer(sourceFileRel, pageNumber || 1);
    }
  }

  function closeDrawer() {
    tableStore.closeDrawer();
  }

  function syncTables() {
    tableStore.syncWorkspaceTables();
  }
</script>

{#if isOpen}
  <!-- Drawer Backdrop -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs transition-opacity duration-200"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onclick={closeDrawer}
  ></div>

  <!-- Slide-out Drawer Panel -->
  <aside
    class="fixed top-0 right-0 z-50 h-full w-full max-w-md bg-slate-900 border-l border-slate-700/80 shadow-2xl flex flex-col transform transition-transform duration-300 ease-out"
    aria-label="Rollable Tables Drawer"
  >
    <!-- Drawer Header -->
    <div class="px-5 py-4 border-b border-slate-700/80 flex items-center justify-between bg-slate-800/80">
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <h2 class="text-sm font-bold text-slate-100 tracking-wide">Rollable Tables</h2>
          <p class="text-xs text-slate-400">Workspace CSV/MD & PDF Tables</p>
        </div>
      </div>

      <div class="flex items-center gap-1.5">
        <button
          class="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 text-xs font-medium flex items-center gap-1 transition disabled:opacity-50"
          onclick={syncTables}
          disabled={isLoading}
          title="Scan and Sync Workspace Tables"
        >
          <svg class="w-3.5 h-3.5 {isLoading ? 'animate-spin' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Sync
        </button>

        <button
          class="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition"
          onclick={closeDrawer}
          title="Close Drawer"
        >
          ✕
        </button>
      </div>
    </div>

    <!-- Search Toolbar -->
    <div class="p-3 border-b border-slate-800 bg-slate-900/50">
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Filter tables by title or formula..."
        class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
      />
    </div>

    <!-- Table List -->
    <div class="flex-1 overflow-y-auto p-4 space-y-3">
      {#if filteredTables.length === 0}
        <div class="text-center py-12 px-4 border border-dashed border-slate-800 rounded-xl">
          <p class="text-sm font-medium text-slate-400">No tables discovered</p>
          <p class="text-xs text-slate-500 mt-1">
            Place CSV or Markdown tables in <code class="text-indigo-400">Campaign_Workspace/Tables/</code> or compile a sourcebook PDF.
          </p>
        </div>
      {:else}
        {#each filteredTables as table (table.id)}
          <div class="bg-slate-800/60 border border-slate-700/70 rounded-xl overflow-hidden shadow-sm hover:border-slate-600 transition">
            <!-- Table Header Row -->
            <div class="p-3.5 flex items-center justify-between gap-3">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {table.formula}
                  </span>
                  <h3 class="text-xs font-semibold text-slate-100 truncate">{table.name}</h3>
                </div>
                <div class="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                  <span>{table.entries?.length || 0} entries</span>
                  {#if table.provenance?.source_file_rel}
                    <span>•</span>
                    <button
                      class="px-2 py-0.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-semibold flex items-center gap-1 transition-colors"
                      onclick={() => openSource(table.provenance.source_file_rel, table.provenance.page_number)}
                      title="Open in Sourcebook PDF"
                    >
                      <span>📖</span>
                      <span>Open in Source{table.provenance.page_number ? ` (p. ${table.provenance.page_number})` : ''}</span>
                    </button>
                  {/if}
                </div>
              </div>

              <div class="flex items-center gap-1.5 shrink-0">
                <button
                  class="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium shadow-sm transition flex items-center gap-1"
                  onclick={() => rollTable(table)}
                  title="Roll this table to chat"
                >
                  🎲 Roll
                </button>
                <button
                  class="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition text-xs"
                  onclick={() => toggleExpand(table.id)}
                  title="Toggle Entries Preview"
                >
                  {expandedTableId === table.id ? '▲' : '▼'}
                </button>
              </div>
            </div>

            <!-- Expandable Entries Table -->
            {#if expandedTableId === table.id}
              <div class="border-t border-slate-700/60 bg-slate-950/70 p-3 max-h-56 overflow-y-auto">
                <table class="w-full text-left text-xs">
                  <thead>
                    <tr class="text-[10px] uppercase font-mono text-slate-500 border-b border-slate-800 pb-1">
                      <th class="py-1 w-14">Range</th>
                      <th class="py-1">Result</th>
                      <th class="py-1 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-800/60 text-slate-300">
                    {#each table.entries as entry}
                      <tr class="hover:bg-slate-800/40 transition">
                        <td class="py-1.5 font-mono text-indigo-400 text-[11px]">
                          {entry.range[0] === entry.range[1]
                            ? entry.range[0]
                            : `${entry.range[0]}-${entry.range[1]}`}
                        </td>
                        <td class="py-1.5 pr-2">
                          <span class="text-xs">{entry.text}</span>
                          {#if entry.linked_entity_id}
                            <span class="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              Monster Linked
                            </span>
                          {/if}
                        </td>
                        <td class="py-1.5 text-right">
                          {#if entry.linked_entity_id}
                            <button
                              class="px-2 py-0.5 rounded bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/30 text-[10px] transition"
                              onclick={() => spawnTokens(entry)}
                              title="Spawn Tokens directly onto map"
                            >
                              Spawn
                            </button>
                          {/if}
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  </aside>
{/if}
