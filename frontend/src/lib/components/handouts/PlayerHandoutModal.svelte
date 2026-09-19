<script lang="ts">
  // PlayerHandoutModal.svelte — Client-side overlay displaying broadcast parchment handouts
  // Displays authentic fantasy parchment to players when broadcast across LAN/WebSocket.

  import ParchmentViewer from './ParchmentViewer.svelte';
  import { activePlayerHandoutStore } from '../../network/broadcastBridge';

  let handout = $derived($activePlayerHandoutStore);

  function handleClose() {
    activePlayerHandoutStore.set(null);
  }
</script>

{#if handout}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-black/85 backdrop-blur-md overflow-y-auto animate-fadeIn select-none"
    role="dialog"
    aria-modal="true"
    aria-label="Proclamation Handout"
  >
    <div class="relative w-full max-w-2xl my-auto py-6">
      <!-- Top dismissal pill -->
      <div class="flex items-center justify-between pb-3 px-2">
        <div class="flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping"></span>
          <span class="text-[11px] font-mono uppercase tracking-widest text-amber-300 font-bold">
            Incoming Handout from the DM
          </span>
        </div>
        <button
          onclick={handleClose}
          class="px-3 py-1 bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white rounded-full text-xs font-bold transition-all border border-slate-700 shadow flex items-center gap-1"
        >
          <span>✕</span>
          <span>Dismiss</span>
        </button>
      </div>

      <!-- Rendered Parchment Document -->
      <div class="shadow-2xl">
        <ParchmentViewer
          title={handout.title}
          subtitle={handout.subtitle}
          contentMarkdown={handout.content_markdown}
          theme={handout.theme}
          sealType={handout.seal_type}
          sealText={handout.seal_text}
        />
      </div>

      <!-- Bottom instruction for players -->
      <p class="text-center text-[10px] text-slate-500 mt-4 font-mono">
        Press Dismiss or click outside to return to your character sheet.
      </p>
    </div>
  </div>
{/if}

<style>
  @keyframes fadeIn {
    from { opacity: 0; transform: scale(0.97); }
    to { opacity: 1; transform: scale(1); }
  }
  .animate-fadeIn {
    animation: fadeIn 0.25s ease-out forwards;
  }
</style>
