<!-- src/lib/components/modals/PhysicalDicePromptModal.svelte -->
<!-- Physical Tabletop Dice Manual Input Modal (Requirements 9 & 11) -->

<script lang="ts">
  import { physicalDiceService } from '../../services/physicalDiceService.svelte';

  let inputVal = $state<number | ''>('');
  let inputEl = $state<HTMLInputElement | null>(null);

  let activePrompt = $derived(physicalDiceService.currentPrompt);

  $effect(() => {
    if (activePrompt) {
      inputVal = '';
      setTimeout(() => {
        inputEl?.focus();
      }, 50);
    }
  });

  function handleSubmit() {
    if (inputVal === '' || isNaN(Number(inputVal))) return;
    physicalDiceService.submitManualResult(Number(inputVal));
    inputVal = '';
  }

  function handleDigitalInstead() {
    physicalDiceService.rollDigitallyInstead();
  }

  function handleCancel() {
    physicalDiceService.cancelPrompt();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  }
</script>

{#if activePrompt}
  <div
    role="presentation"
    class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150 select-none"
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-label={activePrompt.title}
      class="w-full max-w-md bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-amber-600/60 rounded-2xl shadow-2xl p-6 space-y-5 text-center"
      tabindex="-1"
      onkeydown={handleKeyDown}
    >
      <!-- Icon & Title -->
      <div class="space-y-1.5">
        <div class="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center text-3xl mx-auto shadow-inner">
          🎲
        </div>
        <h3 class="text-lg font-black text-slate-100 uppercase tracking-wide">
          {activePrompt.title}
        </h3>
        <p class="text-xs text-amber-300/90 font-mono">
          Roll <span class="px-2 py-0.5 rounded bg-amber-950/80 border border-amber-500/40 text-amber-200 font-bold">{activePrompt.formula}</span>
          {#if activePrompt.dc}
            <span class="text-slate-400">vs</span> <span class="text-indigo-300 font-bold">DC {activePrompt.dc}</span>
          {:else if activePrompt.targetAc}
            <span class="text-slate-400">vs</span> <span class="text-rose-300 font-bold">Target AC {activePrompt.targetAc}</span>
          {/if}
        </p>
      </div>

      <!-- Roll Prompt Instructions -->
      <p class="text-xs text-slate-400 leading-relaxed">
        Roll your physical dice on the table, then enter the total result below:
      </p>

      <!-- Number Input Field -->
      <div class="flex justify-center">
        <input
          bind:this={inputEl}
          bind:value={inputVal}
          type="number"
          step="1"
          placeholder="e.g. 17"
          class="w-36 text-center text-3xl font-black font-mono bg-slate-950 border-2 border-amber-500/60 rounded-xl px-3 py-2 text-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-400 shadow-inner"
        />
      </div>

      <!-- Action Buttons -->
      <div class="space-y-2 pt-2">
        <button
          type="button"
          onclick={handleSubmit}
          disabled={inputVal === ''}
          class="w-full py-2.5 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:opacity-40 disabled:pointer-events-none text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-amber-600/20 transition-all active:scale-95"
        >
          Submit Physical Roll ✓
        </button>

        <div class="flex items-center gap-2">
          <button
            type="button"
            onclick={handleDigitalInstead}
            class="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold rounded-xl border border-slate-700 transition-colors flex items-center justify-center gap-1.5"
            title="Auto-roll digitally via random number generator"
          >
            <span>💻</span> Digital Roll Instead
          </button>

          <button
            type="button"
            onclick={handleCancel}
            class="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-bold rounded-xl border border-slate-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
