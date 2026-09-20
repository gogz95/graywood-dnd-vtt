<script lang="ts">
  // src/lib/components/player/WhisperInboxModal.svelte
  // Secret DM-to-Player Whisper Inbox with distinct purple banner & mobile haptic alerts

  import { onMount, onDestroy } from 'svelte';
  import { dmWhispersStore, type WhisperMessage } from '../../../stores/websocketStore';

  let {
    characterId,
    isOpen = $bindable(false),
    onClose
  }: {
    characterId: string;
    isOpen?: boolean;
    onClose?: () => void;
  } = $props();

  let unreadCount = $state(0);
  let whispers = $state<WhisperMessage[]>([]);
  let lastSeenCount = 0;

  // Filter whispers targeted to this character or party
  const myWhispers = $derived(
    whispers.filter(w => !w.target_character_id || w.target_character_id === characterId || w.target_character_id === 'ALL')
  );

  let unsubscribe: (() => void) | null = null;

  onMount(() => {
    unsubscribe = dmWhispersStore.subscribe((messages) => {
      whispers = messages;
      const relevant = messages.filter(w => !w.target_character_id || w.target_character_id === characterId || w.target_character_id === 'ALL');
      if (relevant.length > lastSeenCount) {
        // Trigger haptic vibration for mobile clients
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate([100, 50, 100]);
          } catch {
            // Browser might restrict without user interaction
          }
        }
        unreadCount += (relevant.length - lastSeenCount);
        lastSeenCount = relevant.length;
      }
    });
  });

  onDestroy(() => {
    if (unsubscribe) unsubscribe();
  });

  function handleOpen() {
    isOpen = true;
    unreadCount = 0;
  }

  function handleClose() {
    isOpen = false;
    unreadCount = 0;
    if (onClose) onClose();
  }

  function formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
</script>

<!-- Floating Whisper Trigger Badge -->
{#if !isOpen}
  <button
    onclick={handleOpen}
    class="relative p-2 rounded-xl bg-purple-950/80 border border-purple-500/50 hover:bg-purple-900 text-purple-200 shadow-lg transition-transform active:scale-95 flex items-center gap-1.5 text-xs font-bold"
    title="Open Secret DM Whispers"
  >
    <span>🤫</span>
    <span>Whispers</span>
    {#if unreadCount > 0}
      <span class="absolute -top-1.5 -right-1.5 bg-purple-500 text-white font-mono text-[10px] w-5 h-5 rounded-full flex items-center justify-center animate-bounce shadow">
        {unreadCount}
      </span>
    {/if}
  </button>
{/if}

<!-- Modal Drawer -->
{#if isOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
    <div class="w-full max-w-lg bg-slate-900 border border-purple-600/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
      <!-- Distinct Purple Header Banner -->
      <div class="bg-gradient-to-r from-purple-950 via-purple-900 to-indigo-950 border-b border-purple-700/50 p-3.5 flex items-center justify-between text-purple-100">
        <div class="flex items-center gap-2">
          <span class="text-xl">🤫</span>
          <div>
            <h3 class="text-xs font-black uppercase tracking-wider text-purple-200">
              Confidential DM Whispers
            </h3>
            <span class="text-[10px] text-purple-300/80">
              Encrypted direct channel for secret perception &amp; insight
            </span>
          </div>
        </div>
        <button
          onclick={handleClose}
          class="p-1 rounded-lg text-purple-300 hover:text-white hover:bg-purple-800/50 transition-colors text-xs font-bold"
          title="Close Whisper Inbox"
        >
          ✕
        </button>
      </div>

      <!-- Messages List Body -->
      <div class="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-950">
        {#if myWhispers.length === 0}
          <div class="py-12 text-center text-slate-500 text-xs">
            <span class="text-2xl block mb-2">📭</span>
            No secret whispers received. Private DM cues and passive perception checks will appear here.
          </div>
        {:else}
          {#each myWhispers as whisper (whisper.id)}
            <div class="bg-slate-900 border border-purple-900/40 rounded-xl p-3 shadow-md space-y-1.5">
              <div class="flex items-center justify-between text-[11px] text-purple-300">
                <span class="font-bold flex items-center gap-1">
                  <span>🗝️</span>
                  <span>{whisper.sender_name || 'Dungeon Master'}</span>
                </span>
                <span class="font-mono text-[10px] text-slate-400">
                  {formatTime(whisper.timestamp)}
                </span>
              </div>
              <p class="text-xs text-purple-100 leading-relaxed font-serif">
                {whisper.message}
              </p>
            </div>
          {/each}
        {/if}
      </div>

      <!-- Modal Footer -->
      <div class="p-3 bg-slate-900 border-t border-slate-800 flex justify-end">
        <button
          onclick={handleClose}
          class="px-4 py-1.5 bg-purple-700 hover:bg-purple-600 text-white text-xs font-bold rounded-lg transition-colors shadow"
        >
          Acknowledge
        </button>
      </div>
    </div>
  </div>
{/if}
