<!-- src/lib/components/combat/DeathSaveTracker.svelte -->
<!-- Complete 5e SRD Death Saving Throw Engine (Requirement 14) -->
<!-- Tracks 0-3 Successes and 0-3 Failures; supports automated digital rolling and physical dice prompts -->

<script lang="ts">
  import { automationSettings } from '../../stores/automationSettings.svelte';
  import { promptManualRoll } from '../../services/physicalDiceService.svelte';
  import { chatStore } from '../../stores/chatStore.svelte';
  import { audioEngine } from '../../audio/AudioEngine';

  let {
    characterName = 'Combatant',
    successes = $bindable(0),
    failures = $bindable(0),
    onStabilized,
    onDied,
    onRevived
  }: {
    characterName?: string;
    successes?: number;
    failures?: number;
    onStabilized?: () => void;
    onDied?: () => void;
    onRevived?: () => void;
  } = $props();

  let isRolling = $state(false);

  export async function executeDeathSave(): Promise<{ roll: number; outcome: 'revived' | 'success' | 'failure' | 'stable' | 'dead' }> {
    isRolling = true;
    let roll: number;

    const autoRoll = automationSettings.shouldAutoRoll('autoRollDeathSaves');
    if (autoRoll) {
      roll = Math.floor(Math.random() * 20) + 1;
    } else {
      roll = await promptManualRoll({
        title: `Death Save: ${characterName}`,
        formula: '1d20'
      });
    }

    let outcome: 'revived' | 'success' | 'failure' | 'stable' | 'dead';

    if (roll === 20) {
      // Natural 20: Immediately regain 1 HP
      successes = 0;
      failures = 0;
      outcome = 'revived';
      audioEngine.triggerSfx('sfx-critical');
      chatStore.sendMessage(`⭐ ${characterName} rolled a NATURAL 20 on a Death Saving Throw! Regains 1 HP and rises!`, 'System');
      onRevived?.();
    } else if (roll === 1) {
      // Natural 1: 2 failures
      failures = Math.min(3, failures + 2);
      audioEngine.triggerSfx('sfx-sword');
      if (failures >= 3) {
        outcome = 'dead';
        chatStore.sendMessage(`💀 ${characterName} rolled a NATURAL 1 on a Death Saving Throw! (2 Failures: ${failures}/3). The character has fallen.`, 'System');
        onDied?.();
      } else {
        outcome = 'failure';
        chatStore.sendMessage(`💀 ${characterName} rolled a NATURAL 1 on a Death Saving Throw! (2 Failures: ${failures}/3).`, 'System');
      }
    } else if (roll >= 10) {
      successes = Math.min(3, successes + 1);
      audioEngine.triggerSfx('sfx-rest');
      if (successes >= 3) {
        outcome = 'stable';
        chatStore.sendMessage(`🛡️ ${characterName} rolled ${roll} on a Death Saving Throw! (3 Successes). Character is STABILIZED!`, 'System');
        onStabilized?.();
      } else {
        outcome = 'success';
        chatStore.sendMessage(`✓ ${characterName} rolled ${roll} on a Death Saving Throw (Success: ${successes}/3).`, 'System');
      }
    } else {
      failures = Math.min(3, failures + 1);
      audioEngine.triggerSfx('sfx-click');
      if (failures >= 3) {
        outcome = 'dead';
        chatStore.sendMessage(`💀 ${characterName} rolled ${roll} on a Death Saving Throw (Failure: ${failures}/3). The character has fallen.`, 'System');
        onDied?.();
      } else {
        outcome = 'failure';
        chatStore.sendMessage(`⚠️ ${characterName} rolled ${roll} on a Death Saving Throw (Failure: ${failures}/3).`, 'System');
      }
    }

    isRolling = false;
    return { roll, outcome };
  }

  function handleReset() {
    successes = 0;
    failures = 0;
  }
</script>

<div class="p-2.5 rounded-xl bg-slate-950 border border-rose-900/60 shadow-lg space-y-2 select-none text-xs">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-1.5">
      <span class="text-rose-500 font-bold animate-pulse">💀</span>
      <span class="font-black uppercase tracking-wider text-[10px] text-rose-300">
        Death Saves · {characterName}
      </span>
    </div>
    <button
      type="button"
      onclick={handleReset}
      class="text-[9px] text-slate-500 hover:text-slate-300 transition-colors"
      title="Reset counters"
    >
      ↺ Reset
    </button>
  </div>

  <!-- Pips Grid -->
  <div class="grid grid-cols-2 gap-2 text-[10px]">
    <!-- Successes (0-3) -->
    <div class="p-1.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between">
      <span class="font-bold text-emerald-400">Successes</span>
      <div class="flex items-center gap-1">
        {#each [1, 2, 3] as pip}
          <button
            type="button"
            onclick={() => successes = successes === pip ? pip - 1 : pip}
            class="w-4 h-4 rounded-full border transition-all flex items-center justify-center text-[8px] {pip <= successes ? 'bg-emerald-500 border-emerald-400 text-slate-950 font-bold shadow-sm shadow-emerald-500/50' : 'bg-slate-950 border-slate-700 text-slate-600'}"
          >
            {pip <= successes ? '✓' : ''}
          </button>
        {/each}
      </div>
    </div>

    <!-- Failures (0-3) -->
    <div class="p-1.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between">
      <span class="font-bold text-rose-400">Failures</span>
      <div class="flex items-center gap-1">
        {#each [1, 2, 3] as pip}
          <button
            type="button"
            onclick={() => failures = failures === pip ? pip - 1 : pip}
            class="w-4 h-4 rounded-full border transition-all flex items-center justify-center text-[8px] {pip <= failures ? 'bg-rose-600 border-rose-500 text-white font-bold shadow-sm shadow-rose-600/50' : 'bg-slate-950 border-slate-700 text-slate-600'}"
          >
            {pip <= failures ? '✕' : ''}
          </button>
        {/each}
      </div>
    </div>
  </div>

  <!-- Roll Action Button -->
  <button
    type="button"
    disabled={isRolling || successes >= 3 || failures >= 3}
    onclick={executeDeathSave}
    class="w-full py-1.5 rounded-lg bg-gradient-to-r from-rose-700 to-rose-600 hover:from-rose-600 hover:to-rose-500 active:scale-95 text-white font-black text-[10px] uppercase tracking-wider shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
  >
    <span>🎲</span>
    <span>{isRolling ? 'Resolving...' : 'Roll Death Saving Throw'}</span>
  </button>
</div>
