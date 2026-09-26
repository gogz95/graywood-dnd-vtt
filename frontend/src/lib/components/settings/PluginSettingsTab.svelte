<script lang="ts">
  // PluginSettingsTab.svelte — Sandboxed Plugin & Community Addons Management
  import { onMount } from 'svelte';
  import { pluginHost, type PluginInstance } from '../../services/pluginHost.svelte';

  let searchQuery = $state('');
  let selectedPluginId = $state<string | null>(null);
  let activeDetailTab = $state<'overview' | 'errors' | 'code'>('overview');
  let isScanning = $state(false);

  onMount(() => {
    refreshPlugins();
  });

  async function refreshPlugins() {
    isScanning = true;
    try {
      await pluginHost.discoverPlugins();
      if (!selectedPluginId && pluginHost.plugins.length > 0) {
        selectedPluginId = pluginHost.plugins[0].manifest.id;
      }
    } finally {
      isScanning = false;
    }
  }

  const filteredPlugins = $derived(
    pluginHost.plugins.filter((p) => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        p.manifest.name.toLowerCase().includes(q) ||
        p.manifest.id.toLowerCase().includes(q) ||
        (p.manifest.author && p.manifest.author.toLowerCase().includes(q))
      );
    })
  );

  const selectedPlugin = $derived(
    pluginHost.plugins.find((p) => p.manifest.id === selectedPluginId) ?? pluginHost.plugins[0] ?? null
  );

  function getStatusBadge(status: PluginInstance['status']) {
    switch (status) {
      case 'active':
        return { label: 'Active', bg: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/50' };
      case 'error':
        return { label: 'Error', bg: 'bg-rose-950/80 text-rose-300 border-rose-700/50' };
      default:
        return { label: 'Disabled', bg: 'bg-slate-800/80 text-slate-400 border-slate-700/50' };
    }
  }
</script>

<div class="space-y-6">
  <!-- Header & Scan Actions -->
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
    <div>
      <h3 class="text-sm font-bold text-slate-100 flex items-center gap-2">
        <span>🧩 Sandboxed Plugin Engine</span>
        <span class="text-[11px] font-normal px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800/50">
          {pluginHost.activePluginCount} Active
        </span>
      </h3>
      <p class="text-xs text-slate-400 mt-1">
        Zero-DOM Web Worker isolation engine running third-party modules and community automations.
      </p>
    </div>

    <div class="flex items-center gap-2">
      <button
        type="button"
        onclick={refreshPlugins}
        disabled={isScanning}
        class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors"
      >
        <span class={isScanning ? 'animate-spin' : ''}>🔄</span>
        <span>{isScanning ? 'Scanning…' : 'Scan Plugins Folder'}</span>
      </button>
    </div>
  </div>

  <!-- Search & Directory Hint -->
  <div class="flex flex-col sm:flex-row items-center gap-3">
    <div class="relative flex-1 w-full">
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Filter extensions by name, ID or author…"
        class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
      />
      {#if searchQuery}
        <button
          type="button"
          onclick={() => (searchQuery = '')}
          class="absolute right-2.5 top-1.5 text-slate-500 hover:text-slate-300 text-xs"
        >
          ✕
        </button>
      {/if}
    </div>

    <div class="text-[11px] text-slate-400 bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800/80 shrink-0">
      Discovery: <code class="text-indigo-300">campaign/plugins/*/plugin.json</code>
    </div>
  </div>

  <!-- Plugins Master-Detail Split Grid -->
  {#if pluginHost.plugins.length === 0}
    <div class="text-center py-12 px-4 rounded-xl border border-dashed border-slate-800 bg-slate-950/40">
      <div class="text-3xl mb-2">🔌</div>
      <p class="text-sm font-semibold text-slate-300">No Plugins Found</p>
      <p class="text-xs text-slate-500 max-w-md mx-auto mt-1">
        Place community add-on directories containing a <code class="text-slate-400">plugin.json</code> manifest and <code class="text-slate-400">index.js</code> into the campaign's <code class="text-indigo-400">plugins/</code> folder.
      </p>
      <button
        type="button"
        onclick={refreshPlugins}
        class="mt-4 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors"
      >
        Discover Plugins Now
      </button>
    </div>
  {:else}
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <!-- List Column -->
      <div class="lg:col-span-5 space-y-2">
        {#each filteredPlugins as p (p.manifest.id)}
          {@const badge = getStatusBadge(p.status)}
          <div
            tabindex="0"
            role="button"
            onclick={() => (selectedPluginId = p.manifest.id)}
            onkeydown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                selectedPluginId = p.manifest.id;
              }
            }}
            class="p-3 rounded-xl border text-left cursor-pointer transition-all flex flex-col gap-2 relative
              {selectedPlugin?.manifest.id === p.manifest.id ? 'bg-indigo-950/30 border-indigo-500/80 shadow-sm shadow-indigo-950/50' : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'}"
          >
            <div class="flex items-start justify-between gap-2">
              <div>
                <div class="flex items-center gap-1.5">
                  <span class="text-xs font-bold text-slate-200">{p.manifest.name}</span>
                  <span class="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">v{p.manifest.version}</span>
                </div>
                <div class="text-[10px] text-slate-400 font-mono mt-0.5">{p.manifest.id}</div>
              </div>

              <!-- Enable/Disable Switch -->
              <div class="flex items-center gap-2">
                <span class="text-[10px] px-1.5 py-0.5 rounded border font-medium {badge.bg}">
                  {badge.label}
                </span>

                <button
                  type="button"
                  aria-label={p.enabled ? `Disable ${p.manifest.name}` : `Enable ${p.manifest.name}`}
                  onclick={(e) => {
                    e.stopPropagation();
                    pluginHost.togglePlugin(p.manifest.id);
                  }}
                  class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none
                    {p.status === 'active' ? 'bg-indigo-600' : 'bg-slate-800'}"
                >
                  <span
                    class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out
                      {p.status === 'active' ? 'translate-x-4' : 'translate-x-0'}"
                  ></span>
                </button>
              </div>
            </div>

            <!-- Permissions Pill Row -->
            <div class="flex items-center gap-1 flex-wrap">
              {#each p.manifest.permissions as perm}
                <span class="text-[9px] px-1.5 py-0.5 rounded bg-slate-950/80 border border-slate-800 text-slate-400 font-mono">
                  {perm}
                </span>
              {/each}
              {#if p.errors.length > 0}
                <span class="text-[9px] px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800/60 font-semibold ml-auto">
                  {p.errors.length} err
                </span>
              {/if}
            </div>
          </div>
        {/each}
      </div>

      <!-- Detail Drawer / Tab Pane -->
      <div class="lg:col-span-7 bg-slate-950 rounded-xl border border-slate-800 flex flex-col min-h-[380px]">
        {#if selectedPlugin}
          <!-- Drawer Header -->
          <div class="p-4 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-900/40">
            <div>
              <div class="flex items-center gap-2">
                <h4 class="text-sm font-bold text-slate-100">{selectedPlugin.manifest.name}</h4>
                <span class="text-[10px] px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 font-mono">
                  v{selectedPlugin.manifest.version}
                </span>
              </div>
              <div class="text-[11px] text-slate-400 flex items-center gap-3 mt-0.5">
                <span>Author: <strong class="text-slate-300">{selectedPlugin.manifest.author ?? 'Community'}</strong></span>
                <span>•</span>
                <span>Entry: <code class="text-indigo-400">{selectedPlugin.manifest.entrypoint}</code></span>
              </div>
            </div>

            <!-- Detail Subtabs -->
            <div class="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
              <button
                type="button"
                onclick={() => (activeDetailTab = 'overview')}
                class="px-2.5 py-1 rounded-md font-semibold transition-colors
                  {activeDetailTab === 'overview' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}"
              >
                Overview
              </button>
              <button
                type="button"
                onclick={() => (activeDetailTab = 'errors')}
                class="px-2.5 py-1 rounded-md font-semibold transition-colors flex items-center gap-1
                  {activeDetailTab === 'errors' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}"
              >
                <span>Logs</span>
                {#if selectedPlugin.errors.length > 0}
                  <span class="px-1 rounded-full bg-rose-500 text-white text-[10px] leading-tight">
                    {selectedPlugin.errors.length}
                  </span>
                {/if}
              </button>
              <button
                type="button"
                onclick={() => (activeDetailTab = 'code')}
                class="px-2.5 py-1 rounded-md font-semibold transition-colors
                  {activeDetailTab === 'code' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}"
              >
                Code
              </button>
            </div>
          </div>

          <!-- Drawer Body -->
          <div class="p-4 flex-1 overflow-y-auto max-h-[380px]">
            {#if activeDetailTab === 'overview'}
              <div class="space-y-4">
                {#if selectedPlugin.manifest.description}
                  <div>
                    <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">Description</span>
                    <p class="text-xs text-slate-300 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80 leading-relaxed">
                      {selectedPlugin.manifest.description}
                    </p>
                  </div>
                {/if}

                <div>
                  <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Granted Permissions</span>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {#each selectedPlugin.manifest.permissions as perm}
                      <div class="flex items-center gap-2 p-2 rounded-lg bg-slate-900/80 border border-slate-800 text-xs">
                        <span class="text-emerald-400 text-xs">✓</span>
                        <code class="text-slate-200 font-mono text-[11px]">{perm}</code>
                      </div>
                    {/each}
                  </div>
                </div>

                <div class="p-3 rounded-lg bg-indigo-950/20 border border-indigo-900/40 text-xs text-indigo-300/80 space-y-1">
                  <div class="font-semibold text-indigo-200 flex items-center gap-1.5">
                    <span>🛡️ Sandbox Isolation Guarantees</span>
                  </div>
                  <p class="text-[11px] leading-relaxed">
                    Script runs in a background Web Worker without DOM, Window, or Storage access. Communications are strictly mediated via the postMessage event bridge with rate-limiting up to 30 mutations/sec.
                  </p>
                </div>
              </div>
            {:else if activeDetailTab === 'errors'}
              <div class="space-y-3">
                <div class="flex items-center justify-between">
                  <span class="text-xs font-bold text-slate-300">
                    Execution Error Logs ({selectedPlugin.errors.length})
                  </span>
                  {#if selectedPlugin.errors.length > 0}
                    <button
                      type="button"
                      onclick={() => pluginHost.clearPluginErrors(selectedPlugin.manifest.id)}
                      class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] rounded border border-slate-700"
                    >
                      Clear Log
                    </button>
                  {/if}
                </div>

                {#if selectedPlugin.errors.length === 0}
                  <div class="text-center py-10 text-xs text-slate-500">
                    <span class="text-emerald-400 font-semibold">Clean State:</span> No runtime errors recorded for this module.
                  </div>
                {:else}
                  <div class="space-y-2">
                    {#each selectedPlugin.errors as err, idx}
                      <div class="p-2.5 rounded-lg bg-rose-950/40 border border-rose-800/50 text-xs font-mono">
                        <div class="flex items-center justify-between text-[10px] text-rose-400 mb-1">
                          <span>Error #{idx + 1}</span>
                          <span>{new Date(err.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <div class="text-rose-200 font-bold">{err.message}</div>
                        {#if err.stack}
                          <pre class="text-[10px] text-rose-300/70 mt-1 overflow-x-auto whitespace-pre-wrap">{err.stack}</pre>
                        {/if}
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            {:else if activeDetailTab === 'code'}
              <div class="space-y-2">
                <div class="flex items-center justify-between text-xs text-slate-400">
                  <span>Entrypoint Source (<code class="text-slate-200">{selectedPlugin.manifest.entrypoint}</code>)</span>
                  <span class="text-[11px] font-mono">{selectedPlugin.code.length} bytes</span>
                </div>
                <pre class="p-3 bg-slate-900 rounded-lg border border-slate-800 text-[11px] font-mono text-emerald-400 overflow-x-auto max-h-[300px] leading-relaxed selection:bg-indigo-900 selection:text-white"><code>{selectedPlugin.code}</code></pre>
              </div>
            {/if}
          </div>
        {:else}
          <div class="flex-1 flex items-center justify-center text-xs text-slate-500">
            Select an extension from the list to view manifest details.
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
