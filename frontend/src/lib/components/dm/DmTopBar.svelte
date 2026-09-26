<!-- frontend/src/lib/components/dm/DmTopBar.svelte -->
<!-- Top bar component providing DM controls and phone connection QR trigger -->

<script lang="ts">
  import { curtainStore } from '../../stores/curtainStore.svelte';
  import JoinQrModal from '../network/JoinQrModal.svelte';

  let isQrModalOpen = $state(false);
</script>

<div class="flex items-center gap-2">
  <!-- Connect Phones QR Trigger -->
  <button
    type="button"
    onclick={() => (isQrModalOpen = true)}
    class="px-2.5 py-1 text-xs font-bold rounded-lg border transition-all flex items-center gap-1.5 bg-sky-950/80 hover:bg-sky-900/90 text-sky-300 border-sky-700/80 shadow-sm"
    title="Open Mobile LAN Pairing QR Code"
  >
    <span>📶</span>
    <span class="hidden sm:inline">Connect Phones</span>
  </button>

  <!-- Staging Curtain Blackout Veil Button -->
  <button
    type="button"
    onclick={() => curtainStore.toggle()}
    class="px-2.5 py-1 text-xs font-bold rounded-lg border transition-all flex items-center gap-1.5 {curtainStore.active
      ? 'bg-rose-950/90 text-rose-300 border-rose-500 shadow-md shadow-rose-900/50 animate-pulse'
      : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border-slate-800'}"
    title="Toggle DM Staging Curtain (Ctrl+B)"
  >
    <span class={curtainStore.active ? 'text-rose-400' : 'text-slate-400'}>🌑</span>
    <span class="hidden md:inline">{curtainStore.active ? 'Curtain Active' : 'Curtain'}</span>
  </button>

  <JoinQrModal bind:isOpen={isQrModalOpen} />
</div>
