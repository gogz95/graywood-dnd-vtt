<!-- src/lib/components/journal/HandoutViewerModal.svelte -->
<!-- Responsive display modal for visual player handouts & DM projector casting -->
<script lang="ts">
  import type { JournalEntry } from '$lib/types/journal';
  import { journalDb } from '$lib/db/journalDb';
  import { projectorStore } from '$lib/stores/projectorStore.svelte';
  import { systemBus } from '$lib/services/systemBus';

  interface Props {
    entry: JournalEntry;
    onClose: () => void;
  }

  let { entry, onClose }: Props = $props();

  let imageUrl = $state<string | null>(null);
  let isCastingThis = $derived(
    projectorStore.castSource === 'handout' && projectorStore.activeHandout?.id === entry.id
  );

  $effect(() => {
    if (entry.imageBlob) {
      const url = URL.createObjectURL(entry.imageBlob);
      imageUrl = url;
      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      imageUrl = null;
    }
  });

  async function handleShowOnProjector(): Promise<void> {
    projectorStore.setHandout({
      id: entry.id,
      title: entry.title,
      playerContent: entry.playerContent,
      imageUrl: imageUrl ?? undefined,
    });
    await journalDb.journals.update(entry.id, { isSharedOnProjector: true, updatedAt: Date.now() });
    entry.isSharedOnProjector = true;
  }

  async function handleHideFromProjector(): Promise<void> {
    projectorStore.returnToMap();
    await journalDb.journals.update(entry.id, { isSharedOnProjector: false, updatedAt: Date.now() });
    entry.isSharedOnProjector = false;
  }

  async function handleShareWithPlayers(): Promise<void> {
    const willShare = !entry.isSharedWithPlayers;
    await journalDb.journals.update(entry.id, {
      isSharedWithPlayers: willShare,
      updatedAt: Date.now(),
    });
    entry.isSharedWithPlayers = willShare;

    if (willShare) {
      systemBus.emit('HANDOUT_SHARED', {
        id: entry.id,
        title: entry.title,
        playerContent: entry.playerContent,
        imageUrl: imageUrl ?? undefined,
      });
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onclick={onClose}>
  <div
    class="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-[#fbf6e9] text-stone-900 border-4 border-[#8c6d46] rounded-xl shadow-2xl overflow-hidden"
    onclick={(e) => e.stopPropagation()}
  >
    <!-- Modal Header -->
    <div class="flex items-center justify-between border-b-2 border-[#8c6d46]/40 px-6 py-4 bg-[#f3ebd6]">
      <div>
        <h2 class="text-2xl font-bold font-serif text-[#3a2411] flex items-center gap-2">
          <span>📜</span>
          <span>{entry.title}</span>
        </h2>
        {#if entry.folder}
          <span class="text-xs uppercase tracking-wider text-stone-600 font-sans font-semibold">
            📁 {entry.folder}
          </span>
        {/if}
      </div>

      <button
        onclick={onClose}
        class="text-stone-500 hover:text-stone-800 p-1.5 rounded-lg text-xl font-bold leading-none hover:bg-stone-300/50 transition-colors"
        aria-label="Close Handout"
      >
        ✕
      </button>
    </div>

    <!-- Modal Body -->
    <div class="flex-1 overflow-y-auto p-6 space-y-6">
      {#if imageUrl}
        <div class="flex justify-center bg-stone-900/10 p-3 rounded-lg border border-[#8c6d46]/30">
          <img
            src={imageUrl}
            alt={entry.title}
            class="max-h-[50vh] max-w-full object-contain rounded shadow-lg"
          />
        </div>
      {/if}

      {#if entry.playerContent}
        <div class="bg-[#fefcf8] border border-[#d6c4a5] rounded-lg p-5 shadow-inner">
          <h3 class="text-xs uppercase font-sans font-bold tracking-wider text-amber-900/80 mb-2">Player Content</h3>
          <div class="prose prose-stone max-w-none text-base font-serif leading-relaxed text-[#2c1d11] whitespace-pre-line">
            {entry.playerContent}
          </div>
        </div>
      {:else}
        <p class="text-sm italic text-stone-500 text-center font-serif">No player content provided.</p>
      {/if}

      {#if entry.gmNotes}
        <div class="bg-amber-100/50 border border-amber-300/70 rounded-lg p-4 font-sans text-xs text-amber-950">
          <span class="font-bold flex items-center gap-1 mb-1 text-amber-900">
            🔒 DM Secret Notes:
          </span>
          <p class="whitespace-pre-line leading-relaxed">{entry.gmNotes}</p>
        </div>
      {/if}
    </div>

    <!-- Modal Footer Controls -->
    <div class="flex flex-wrap items-center justify-between gap-3 border-t-2 border-[#8c6d46]/30 px-6 py-4 bg-[#f3ebd6]">
      <div class="flex items-center gap-2">
        <button
          onclick={handleShareWithPlayers}
          class="px-4 py-2 rounded font-sans text-xs font-bold transition-colors flex items-center gap-2 {entry.isSharedWithPlayers
            ? 'bg-emerald-700 text-white hover:bg-emerald-800'
            : 'bg-stone-300 text-stone-800 hover:bg-stone-400'}"
        >
          <span>{entry.isSharedWithPlayers ? '✓ Shared with /play' : 'Share to /play'}</span>
        </button>
      </div>

      <div class="flex items-center gap-2">
        {#if isCastingThis}
          <button
            onclick={handleHideFromProjector}
            class="px-4 py-2 rounded font-sans text-xs font-bold bg-amber-700 hover:bg-amber-800 text-white transition-colors flex items-center gap-2"
          >
            <span>📺</span>
            <span>Hide / Return to Map</span>
          </button>
        {:else}
          <button
            onclick={handleShowOnProjector}
            class="px-4 py-2 rounded font-sans text-xs font-bold bg-[#8c6d46] hover:bg-[#725735] text-white transition-colors flex items-center gap-2"
          >
            <span>📺</span>
            <span>Show on Projector</span>
          </button>
        {/if}

        <button
          onclick={onClose}
          class="px-4 py-2 rounded font-sans text-xs font-bold bg-stone-200 hover:bg-stone-300 text-stone-800 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  </div>
</div>
