<!-- src/lib/components/system/ErrorBoundary.svelte -->
<!-- Resilient UI crash wrapper around critical routes with emergency backup options -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { exportCampaignBundle } from '../../services/campaignBundleService';

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();

  let hasError = $state<boolean>(false);
  let errorMessage = $state<string>('');
  let isBackingUp = $state<boolean>(false);

  function handleError(event: ErrorEvent) {
    hasError = true;
    errorMessage = event.message || 'An unexpected rendering error occurred in the scene.';
  }

  function handleUnhandledRejection(event: PromiseRejectionEvent) {
    hasError = true;
    errorMessage = event.reason?.message || String(event.reason) || 'Unhandled async runtime error.';
  }

  function handleReloadScene(): void {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }

  async function handleEmergencyBackup(): Promise<void> {
    isBackingUp = true;
    try {
      const bundleBlob = await exportCampaignBundle();
      const url = URL.createObjectURL(bundleBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `emergency-campaign-backup-${new Date().toISOString().slice(0, 10)}.vttbundle`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert('Emergency backup creation failed. Please check storage status.');
    } finally {
      isBackingUp = false;
    }
  }
</script>

<svelte:window onerror={handleError} onunhandledrejection={handleUnhandledRejection} />

{#if hasError}
  <div class="fixed top-0 left-0 right-0 z-50 bg-rose-950/95 border-b-2 border-rose-500 text-rose-100 px-4 py-3 shadow-2xl backdrop-blur-md flex flex-wrap items-center justify-between gap-4 font-sans text-xs select-none">
    <div class="flex items-center gap-2.5">
      <span class="text-xl">⚠️</span>
      <div>
        <div class="font-bold text-rose-200">Scene Render Crash Prevented</div>
        <div class="text-rose-300/80 font-mono text-[11px] truncate max-w-xl">{errorMessage}</div>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <button
        onclick={handleEmergencyBackup}
        disabled={isBackingUp}
        class="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow"
      >
        <span>💾</span>
        <span>{isBackingUp ? 'Exporting...' : 'Download Emergency Campaign Backup'}</span>
      </button>

      <button
        onclick={handleReloadScene}
        class="px-3 py-1.5 rounded bg-rose-700 hover:bg-rose-600 text-white font-bold transition-colors flex items-center gap-1.5 shadow"
      >
        <span>🔄</span>
        <span>Reload Scene</span>
      </button>
    </div>
  </div>
{/if}

{@render children()}
