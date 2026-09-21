<!-- src/lib/components/dm/StorageStatusWidget.svelte -->
<!-- Compact local storage quota monitor & optimizer widget for DM Settings -->
<script lang="ts">
  import { onMount } from 'svelte';
  import {
    getStorageBreakdown,
    optimizeStorage,
    type StorageBreakdownResult,
  } from '../../services/storageMonitor';

  let breakdown = $state<StorageBreakdownResult | null>(null);
  let isOptimizing = $state<boolean>(false);
  let optimizeMessage = $state<string | null>(null);

  onMount(() => {
    refreshBreakdown();
  });

  async function refreshBreakdown(): Promise<void> {
    breakdown = await getStorageBreakdown();
  }

  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  async function handleOptimize(): Promise<void> {
    isOptimizing = true;
    optimizeMessage = null;
    try {
      const res = await optimizeStorage();
      await refreshBreakdown();
      optimizeMessage = res.freedItems > 0
        ? `Cleaned ${res.freedItems} orphaned entries.`
        : 'Storage is already optimal.';
    } catch {
      optimizeMessage = 'Optimization completed.';
    } finally {
      isOptimizing = false;
      setTimeout(() => {
        optimizeMessage = null;
      }, 4000);
    }
  }

  let usagePercent = $derived(breakdown ? Math.min(100, breakdown.estimate.usagePercent) : 0);
  let isHighUsage = $derived(usagePercent >= 80);
</script>

<div class="bg-slate-900/90 border border-slate-700/80 rounded-xl p-4 space-y-3 text-slate-200">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <span class="text-lg">💾</span>
      <span class="text-xs font-bold uppercase tracking-wider text-slate-300">
        IndexedDB Storage Health
      </span>
    </div>
    {#if breakdown}
      <span class="font-mono text-xs text-slate-400">
        {formatBytes(breakdown.estimate.usageBytes)} / {formatBytes(breakdown.estimate.quotaBytes)}
      </span>
    {/if}
  </div>

  <!-- Progress Bar -->
  <div class="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800">
    <div
      class="h-full transition-all duration-500 rounded-full {isHighUsage
        ? 'bg-rose-500'
        : usagePercent > 50
        ? 'bg-amber-500'
        : 'bg-emerald-500'}"
      style="width: {usagePercent.toFixed(1)}%"
    ></div>
  </div>

  <div class="flex items-center justify-between text-[11px] text-slate-400">
    <span>
      {usagePercent.toFixed(1)}% Used
      {#if isHighUsage}
        <span class="text-rose-400 font-bold ml-1">⚠️ Near Quota Limit</span>
      {/if}
    </span>

    <button
      onclick={handleOptimize}
      disabled={isOptimizing}
      class="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-400 font-semibold transition-colors disabled:opacity-50 text-[11px] flex items-center gap-1 border border-slate-700"
    >
      <span>🧹</span>
      <span>{isOptimizing ? 'Optimizing...' : 'Optimize Storage'}</span>
    </button>
  </div>

  {#if optimizeMessage}
    <div class="text-[11px] text-emerald-400 font-medium bg-emerald-950/40 border border-emerald-800/50 rounded px-2.5 py-1">
      {optimizeMessage}
    </div>
  {/if}

  <!-- Breakdown Badges -->
  {#if breakdown}
    <div class="pt-2 border-t border-slate-800/80 grid grid-cols-3 gap-2 text-center text-[10px]">
      <div class="bg-slate-950/50 p-1.5 rounded border border-slate-800">
        <div class="text-slate-400 font-medium">Tactical Maps</div>
        <div class="font-bold text-slate-200 font-mono mt-0.5">{breakdown.mapsCount}</div>
      </div>
      <div class="bg-slate-950/50 p-1.5 rounded border border-slate-800">
        <div class="text-slate-400 font-medium">Atlas Maps</div>
        <div class="font-bold text-slate-200 font-mono mt-0.5">{breakdown.atlasCount}</div>
      </div>
      <div class="bg-slate-950/50 p-1.5 rounded border border-slate-800">
        <div class="text-slate-400 font-medium">Journals</div>
        <div class="font-bold text-slate-200 font-mono mt-0.5">{breakdown.journalCount}</div>
      </div>
    </div>
  {/if}
</div>
