<!-- src/lib/components/assets/ImageBrowserDrawer.svelte -->
<!-- Campaign Image Browser Drawer indexing raster files from maps/, tokens/, and Ingest/Image/ with drag-and-drop to battlemat -->

<script lang="ts">
  import { onMount } from 'svelte';
  import {
    assetBrowserStore,
    type CampaignAsset,
    type AssetCategory,
  } from '../../stores/assetBrowserStore.svelte';

  let {
    isOpen = $bindable(false),
    onClose = () => {},
  }: {
    isOpen?: boolean;
    onClose?: () => void;
  } = $props();

  const CATEGORIES: { id: AssetCategory; label: string; icon: string }[] = [
    { id: 'all', label: 'All Assets', icon: '🖼️' },
    { id: 'map', label: 'Battlemaps', icon: '🗺️' },
    { id: 'token', label: 'Tokens', icon: '♟️' },
    { id: 'prop', label: 'Props', icon: '📦' },
    { id: 'handout', label: 'Handouts', icon: '📜' },
  ];

  let selectedAsset = $state<CampaignAsset | null>(null);

  function handleDragStart(e: DragEvent, asset: CampaignAsset) {
    if (!e.dataTransfer) return;
    const payload = {
      type: 'IMAGE_ASSET',
      assetType: asset.category,
      filePath: asset.relative_path,
      url: asset.url,
      name: asset.name,
      filename: asset.filename,
      id: asset.id,
    };
    e.dataTransfer.setData('application/json', JSON.stringify(payload));
    e.dataTransfer.setData('text/plain', JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'copy';
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  onMount(() => {
    if (isOpen) {
      assetBrowserStore.refreshAssets().catch(() => {});
    }
  });

  $effect(() => {
    if (isOpen && assetBrowserStore.assets.length === 0 && !assetBrowserStore.isLoading) {
      assetBrowserStore.refreshAssets().catch(() => {});
    }
  });
</script>

{#if isOpen}
  <!-- Drawer Backdrop -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs transition-opacity"
    onclick={onClose}
    role="presentation"
  ></div>

  <!-- Main Drawer Panel -->
  <div
    class="fixed inset-y-0 right-0 z-50 w-full max-w-xl bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200 select-none"
    role="dialog"
    aria-label="Campaign Image Browser"
  >
    <!-- Header -->
    <div
      class="px-5 py-3.5 border-b border-slate-800 bg-slate-950 flex items-center justify-between shrink-0"
    >
      <div class="flex items-center gap-2">
        <span class="text-xl">🖼️</span>
        <div>
          <h2 class="text-sm font-black text-slate-100 uppercase tracking-wider">
            Campaign Asset Browser
          </h2>
          <p class="text-[10px] text-slate-400">
            Indexing maps/, tokens/, and Ingest/Image/
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          onclick={() => assetBrowserStore.refreshAssets()}
          class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-colors flex items-center gap-1"
          title="Rescan disk for assets"
        >
          <span class={assetBrowserStore.isLoading ? 'animate-spin' : ''}>🔄</span>
          <span>Refresh</span>
        </button>
        <button
          type="button"
          onclick={onClose}
          class="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-100 flex items-center justify-center font-bold text-sm transition-colors"
          aria-label="Close Asset Browser"
        >
          ✕
        </button>
      </div>
    </div>

    <!-- Search & Filter Controls -->
    <div class="p-4 border-b border-slate-800 bg-slate-900/90 space-y-3 shrink-0">
      <div class="relative">
        <input
          type="text"
          bind:value={assetBrowserStore.searchQuery}
          placeholder="Search battlemaps, tokens, props..."
          class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
        />
        {#if assetBrowserStore.searchQuery}
          <button
            type="button"
            onclick={() => (assetBrowserStore.searchQuery = '')}
            class="absolute right-2.5 top-2 text-xs text-slate-500 hover:text-slate-300"
          >
            ✕
          </button>
        {/if}
      </div>

      <!-- Category Filter Tabs -->
      <div class="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-bold scrollbar-none">
        {#each CATEGORIES as cat}
          {@const count = assetBrowserStore.categoryCounts[cat.id] || 0}
          <button
            type="button"
            onclick={() => (assetBrowserStore.selectedCategory = cat.id)}
            class="px-3 py-1.5 rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 {assetBrowserStore.selectedCategory ===
            cat.id
              ? 'bg-amber-500 text-slate-950 font-black shadow-md'
              : 'bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-slate-200'}"
          >
            <span>{cat.icon}</span>
            <span>{cat.label}</span>
            <span
              class="px-1.5 py-0.2 rounded-full text-[10px] {assetBrowserStore.selectedCategory ===
              cat.id
                ? 'bg-slate-950 text-amber-400'
                : 'bg-slate-900 text-slate-400'}"
            >
              {count}
            </span>
          </button>
        {/each}
      </div>
    </div>

    <!-- Asset Thumbnail Grid -->
    <div class="flex-1 overflow-y-auto p-4 scrollbar-thin">
      {#if assetBrowserStore.isLoading}
        <div class="h-64 flex flex-col items-center justify-center text-xs text-slate-500 gap-2">
          <span class="text-2xl animate-spin">⏳</span>
          <p>Scanning campaign image directories...</p>
        </div>
      {:else if assetBrowserStore.errorMessage}
        <div class="p-6 bg-red-950/40 border border-red-800/60 rounded-xl text-center text-xs text-red-300 space-y-2">
          <p class="font-bold">⚠️ Scan Notice</p>
          <p>{assetBrowserStore.errorMessage}</p>
          <button
            type="button"
            onclick={() => assetBrowserStore.refreshAssets()}
            class="px-3 py-1 bg-red-900/60 hover:bg-red-800 text-white rounded font-bold text-xs"
          >
            Retry Scan
          </button>
        </div>
      {:else if assetBrowserStore.filteredAssets.length === 0}
        <div class="h-64 flex flex-col items-center justify-center text-xs text-slate-500 space-y-2 text-center p-6">
          <span class="text-3xl">📭</span>
          <p class="font-bold text-slate-400">No Image Assets Found</p>
          <p class="text-[11px] max-w-xs text-slate-500">
            Place images into <code class="text-amber-400">maps/</code>, <code class="text-cyan-400">tokens/</code>, or <code class="text-indigo-400">Ingest/Image/</code> in your active campaign folder.
          </p>
        </div>
      {:else}
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {#each assetBrowserStore.filteredAssets as asset, idx (`${asset.id || asset.relative_path || 'asset'}-${idx}`)}
            {@const isMap = asset.category === 'map'}
            <div
              class="group relative bg-slate-950 border border-slate-800 hover:border-amber-500/60 rounded-xl overflow-hidden flex flex-col transition-all duration-150 cursor-grab active:cursor-grabbing hover:shadow-lg"
              draggable="true"
              ondragstart={(e) => handleDragStart(e, asset)}
              role="button"
              tabindex="0"
              onclick={() => (selectedAsset = asset)}
              onkeydown={(e) => {
                if (e.key === 'Enter') selectedAsset = asset;
              }}
              title="Drag onto battlemat to spawn {isMap ? 'as background map' : 'as tactical token'}"
            >
              <!-- Thumbnail Preview -->
              <div class="w-full aspect-square bg-slate-900 overflow-hidden relative flex items-center justify-center">
                <img
                  src={asset.url}
                  alt={asset.name}
                  loading="lazy"
                  class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  onerror={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />

                <!-- Category Badge -->
                <span
                  class="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider backdrop-blur-md {isMap
                    ? 'bg-indigo-950/85 text-indigo-300 border border-indigo-500/40'
                    : asset.category === 'token'
                      ? 'bg-amber-950/85 text-amber-300 border border-amber-500/40'
                      : 'bg-emerald-950/85 text-emerald-300 border border-emerald-500/40'}"
                >
                  {asset.category}
                </span>

                <!-- Drag indicator hint -->
                <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span class="px-2 py-1 bg-slate-900/90 text-amber-300 text-[10px] font-bold rounded-lg border border-slate-700 shadow">
                    Drag to Canvas
                  </span>
                </div>
              </div>

              <!-- Metadata info -->
              <div class="p-2 flex flex-col gap-0.5 bg-slate-950">
                <span class="text-xs font-bold text-slate-200 truncate capitalize" title={asset.name}>
                  {asset.name}
                </span>
                <div class="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                  <span>.{asset.extension}</span>
                  <span>{formatBytes(asset.size_bytes)}</span>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Drag Help Bar -->
    <div class="px-4 py-2.5 bg-slate-950 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between shrink-0">
      <div class="flex items-center gap-1.5">
        <span class="text-amber-400">💡</span>
        <span>Drag <strong>Tokens</strong> to place creatures; drag <strong>Maps</strong> to set the battlemat floor.</span>
      </div>
    </div>
  </div>
{/if}
