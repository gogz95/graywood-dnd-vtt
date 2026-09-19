<script lang="ts">
  import { onMount } from 'svelte';
  import {
    rosterStore,
    claimCharacter,
    isClaimingStore,
    claimErrorStore,
    fetchRoster,
  } from '../stores/characterStore';
  import type { PublicRosterEntry } from '../types/character';
  import Icons from './Icons.svelte';

  let selectedCharacter: PublicRosterEntry | null = $state(null);
  let pinDigits: string[] = $state(['', '', '', '']);
  let activePinIndex: number = $state(0);

  onMount(() => {
    fetchRoster();
  });

  function selectCard(char: PublicRosterEntry) {
    selectedCharacter = char;
    pinDigits = ['', '', '', ''];
    activePinIndex = 0;
    claimErrorStore.set(null);
  }

  function closeModal() {
    selectedCharacter = null;
    pinDigits = ['', '', '', ''];
    activePinIndex = 0;
  }

  function handleKeypadPress(digit: string) {
    if (activePinIndex < 4) {
      pinDigits[activePinIndex] = digit;
      activePinIndex++;
      if (activePinIndex === 4) {
        submitPin();
      }
    }
  }

  function handleBackspace() {
    if (activePinIndex > 0) {
      activePinIndex--;
      pinDigits[activePinIndex] = '';
    }
  }

  function handleClear() {
    pinDigits = ['', '', '', ''];
    activePinIndex = 0;
  }

  async function submitPin() {
    const pin = pinDigits.join('');
    if (pin.length !== 4 || !selectedCharacter) return;
    const success = await claimCharacter(selectedCharacter.id, pin);
    if (success) {
      closeModal();
    }
  }
</script>

<div class="min-h-screen bg-dark-950 px-4 py-8 max-w-4xl mx-auto flex flex-col justify-center">
  <!-- Brand Header -->
  <div class="text-center mb-8">
    <div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 mb-3 shadow-lg shadow-amber-500/5">
      <Icons name="shield" size={28} />
    </div>
    <h1 class="text-3xl font-black text-slate-100 tracking-tight">5e Tactical Workstation</h1>
    <p class="text-slate-400 text-sm mt-1 max-w-md mx-auto">
      Select your hero card from the roster and enter your secret 4-digit PIN to claim and synchronize your character sheet.
    </p>
  </div>

  <!-- Roster Grid -->
  {#if $rosterStore.length === 0}
    <div class="bg-dark-900 border border-dark-700/60 rounded-2xl p-8 text-center text-slate-400">
      <p class="animate-pulse">Loading active campaign roster...</p>
      <button
        onclick={fetchRoster}
        class="mt-4 px-4 py-2 bg-dark-800 hover:bg-dark-700 text-slate-200 text-xs font-semibold rounded-lg border border-dark-600 inline-flex items-center gap-2"
      >
        <Icons name="refresh" size={14} /> Retry Query
      </button>
    </div>
  {:else}
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each $rosterStore as char}
        <button
          onclick={() => selectCard(char)}
          class="bg-dark-900/90 hover:bg-dark-800/90 border border-dark-700 hover:border-amber-500/50 rounded-2xl p-5 text-left transition-all duration-200 shadow-lg hover:shadow-amber-500/10 hover:-translate-y-0.5 group relative overflow-hidden flex flex-col justify-between"
        >
          {#if char.is_orb_sealed}
            <div class="absolute top-2 right-2 px-2 py-0.5 bg-purple-950/80 border border-purple-500/40 text-purple-300 rounded text-[10px] font-bold tracking-wider uppercase">
              Sealed in Void
            </div>
          {/if}

          <div>
            <div class="w-10 h-10 rounded-xl bg-dark-800 border border-dark-600 flex items-center justify-center text-amber-400 font-bold text-lg mb-3 group-hover:border-amber-500/40">
              {char.name.charAt(0)}
            </div>
            <h3 class="text-lg font-bold text-slate-100 group-hover:text-amber-400 transition-colors">
              {char.name}
            </h3>
            <p class="text-xs text-slate-400 mt-0.5 font-mono">ID: {char.id}</p>
          </div>

          <div class="mt-4 pt-3 border-t border-dark-800 flex items-center justify-between text-xs text-slate-400">
            <span class="inline-flex items-center gap-1">
              <Icons name="lock" size={12} class="text-amber-400/80" /> 4-Digit PIN
            </span>
            <span class="text-amber-400 font-medium group-hover:translate-x-0.5 transition-transform inline-flex items-center gap-1">
              Claim &rarr;
            </span>
          </div>
        </button>
      {/each}
    </div>
  {/if}

  <!-- 4-Digit PIN Entry Modal -->
  {#if selectedCharacter}
    <div class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-dark-900 border border-dark-700 rounded-3xl p-6 w-full max-w-sm shadow-2xl relative">
        <button
          onclick={closeModal}
          class="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-dark-800"
          aria-label="Close"
        >
          <Icons name="x" size={18} />
        </button>

        <div class="text-center mb-5">
          <div class="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto mb-2">
            <Icons name="lock" size={24} />
          </div>
          <h2 class="text-xl font-bold text-slate-100">Claim {selectedCharacter.name}</h2>
          <p class="text-xs text-slate-400 mt-1">Enter your assigned 4-digit PIN</p>
        </div>

        <!-- PIN Dots Display -->
        <div class="flex justify-center gap-3 mb-6">
          {#each [0, 1, 2, 3] as idx}
            <div
              class="w-12 h-14 rounded-xl border-2 flex items-center justify-center text-2xl font-bold font-mono transition-all duration-150 {
                pinDigits[idx]
                  ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                  : idx === activePinIndex
                  ? 'border-slate-500 bg-dark-800'
                  : 'border-dark-700 bg-dark-950 text-slate-600'
              }"
            >
              {pinDigits[idx] ? '●' : ''}
            </div>
          {/each}
        </div>

        {#if $claimErrorStore}
          <div class="mb-4 p-2.5 bg-red-950/60 border border-red-500/40 rounded-xl text-red-300 text-xs text-center flex items-center justify-center gap-2">
            <Icons name="alert-triangle" size={14} />
            <span>{$claimErrorStore}</span>
          </div>
        {/if}

        <!-- Numerical Keypad -->
        <div class="grid grid-cols-3 gap-2 mb-4">
          {#each ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as digit}
            <button
              onclick={() => handleKeypadPress(digit)}
              disabled={$isClaimingStore}
              class="h-12 rounded-xl bg-dark-800 hover:bg-dark-700 active:bg-amber-500/20 active:border-amber-500/40 border border-dark-700/80 text-lg font-bold text-slate-200 transition-colors disabled:opacity-50"
            >
              {digit}
            </button>
          {/each}
          <button
            onclick={handleClear}
            disabled={$isClaimingStore}
            class="h-12 rounded-xl bg-dark-800/60 hover:bg-dark-700 border border-dark-700/80 text-xs font-semibold text-slate-400 transition-colors"
          >
            CLR
          </button>
          <button
            onclick={() => handleKeypadPress('0')}
            disabled={$isClaimingStore}
            class="h-12 rounded-xl bg-dark-800 hover:bg-dark-700 active:bg-amber-500/20 active:border-amber-500/40 border border-dark-700/80 text-lg font-bold text-slate-200 transition-colors"
          >
            0
          </button>
          <button
            onclick={handleBackspace}
            disabled={$isClaimingStore}
            class="h-12 rounded-xl bg-dark-800/60 hover:bg-dark-700 border border-dark-700/80 text-sm font-semibold text-slate-400 transition-colors flex items-center justify-center"
          >
            ⌫
          </button>
        </div>

        <!-- Submit Button -->
        <button
          onclick={submitPin}
          disabled={$isClaimingStore || pinDigits.join('').length !== 4}
          class="w-full py-3 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 active:from-amber-600 active:to-amber-500 text-black font-bold rounded-xl transition-all shadow-lg shadow-amber-500/20 disabled:opacity-40 disabled:pointer-events-none"
        >
          {$isClaimingStore ? 'Verifying PIN...' : 'Authorize & Claim'}
        </button>
      </div>
    </div>
  {/if}
</div>
