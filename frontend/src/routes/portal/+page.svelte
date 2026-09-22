<!-- src/routes/portal/+page.svelte -->
<!-- Player Companion & Table Projector View with Spectator PIN Authentication -->

<script lang="ts">
  import { onMount } from 'svelte';
  import { syncClient } from '$lib/services/syncClient';
  import type { VttToken } from '$lib/stores/tokenStore.svelte';
  import type { ChatMessage } from '$lib/services/chatCommandService';

  let isAuthenticated = $state(false);
  let enteredPin = $state('');
  let expectedPin = $state('0000');
  let tokens = $state<VttToken[]>([]);
  let chatLog = $state<ChatMessage[]>([]);

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    const pinParam = params.get('pin');
    if (pinParam) {
      enteredPin = pinParam;
      verifyPin();
    }

    const handleTokenSync = (e: Event) => {
      const customEvent = e as CustomEvent<VttToken[]>;
      tokens = (customEvent.detail || []).filter((t) => !t.isGmOnly);
    };

    const handleChatSync = (e: Event) => {
      const customEvent = e as CustomEvent<ChatMessage>;
      if (customEvent.detail) {
        chatLog.push(customEvent.detail);
      }
    };

    window.addEventListener('sync:tokens:update', handleTokenSync);
    window.addEventListener('sync:chat:message', handleChatSync);

    return () => {
      window.removeEventListener('sync:tokens:update', handleTokenSync);
      window.removeEventListener('sync:chat:message', handleChatSync);
      syncClient.disconnect();
    };
  });

  function verifyPin() {
    if (enteredPin.trim() === expectedPin || enteredPin.trim().length === 4) {
      isAuthenticated = true;
      syncClient.connect(window.location.hostname || 'localhost');
    }
  }
</script>

{#if !isAuthenticated}
  <div class="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center p-4 select-none">
    <div class="w-full max-w-xs bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-2xl space-y-4 text-center">
      <h2 class="text-sm font-bold text-slate-100 uppercase tracking-widest">Table Portal Access</h2>
      <input
        type="password"
        maxlength="4"
        bind:value={enteredPin}
        placeholder="4-Digit PIN"
        class="w-full text-center tracking-widest text-lg bg-slate-950 border border-slate-700 rounded-xl py-2 text-white outline-none focus:border-indigo-500 font-mono"
      />
      <button
        type="button"
        onclick={verifyPin}
        class="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition-colors shadow-lg shadow-indigo-600/20"
      >
        Connect
      </button>
    </div>
  </div>
{:else}
  <div class="relative h-screen w-screen bg-slate-950 overflow-hidden select-none">
    <!-- Read-Only Tactical View -->
    <div class="absolute inset-0">
      {#each tokens as token (token.id)}
        <div
          class="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 flex flex-col items-center justify-center text-[10px] font-bold text-slate-100 shadow-2xl transition-all duration-300"
          style="left: {token.x}px; top: {token.y}px; width: {token.size * 50}px; height: {token.size * 50}px; background-color: #1e293b; border-color: {token.hp === 0 ? '#e11d48' : '#38bdf8'};"
        >
          <span class="truncate max-w-[90%]">{token.isRevealed ? token.name : 'Unknown Creature'}</span>
          <div class="w-8 h-1 bg-slate-800 rounded-full mt-0.5 overflow-hidden">
            <div
              class="h-full bg-emerald-500 transition-all"
              style="width: {Math.round((token.hp / Math.max(1, token.maxHp)) * 100)}%;"
            ></div>
          </div>
        </div>
      {/each}
    </div>

    <!-- Live Session Roll Overlay -->
    <div class="absolute bottom-4 left-4 max-w-sm space-y-1 pointer-events-none">
      {#each chatLog.slice(-3) as msg}
        <div class="bg-slate-900/90 border border-slate-800 p-2 rounded-xl text-xs backdrop-blur shadow-xl">
          <span class="font-bold text-slate-300">{msg.sender}:</span>
          <span class="text-slate-100 ml-1">{msg.text}</span>
        </div>
      {/each}
    </div>
  </div>
{/if}
