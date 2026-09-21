<!-- src/lib/components/combat/TurnTimerWidget.svelte -->
<!-- Visual countdown timer for tactical combat turns with warning pulses and auto-advance support -->

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { audioEngine } from '../../audio/AudioEngine';

  let {
    activeCombatantId = '',
    isDm = true,
    onTimeout = () => {}
  }: {
    activeCombatantId?: string;
    isDm?: boolean;
    onTimeout?: () => void;
  } = $props();

  // Duration options (0 = unlimited)
  const DURATION_OPTIONS = [
    { label: '30s', value: 30 },
    { label: '60s', value: 60 },
    { label: '90s', value: 90 },
    { label: '120s', value: 120 },
    { label: '∞', value: 0 }
  ];

  let durationSec = $state(60);
  let timeRemaining = $state(60);
  let isRunning = $state(true);
  let autoAdvance = $state(false);
  let showConfig = $state(false);
  let overtimeSec = $state(0);

  let timerInterval: number | null = null;
  let lastWarningSec = -1;

  // Track turn changes
  let currentActiveId = $state('');

  $effect(() => {
    if (activeCombatantId && activeCombatantId !== currentActiveId) {
      currentActiveId = activeCombatantId;
      resetTimer();
    }
  });

  function resetTimer() {
    timeRemaining = durationSec;
    overtimeSec = 0;
    isRunning = true;
    lastWarningSec = -1;
  }

  function tick() {
    if (!isRunning || durationSec === 0) return;

    if (timeRemaining > 0) {
      timeRemaining -= 1;

      // Audio warning pulse at 10s, 5s, 3s, 2s, 1s
      if (timeRemaining <= 10 && timeRemaining > 0 && timeRemaining !== lastWarningSec) {
        lastWarningSec = timeRemaining;
        try {
          audioEngine.triggerSfx('sfx-dice');
        } catch (_) {}
      }

      if (timeRemaining === 0) {
        if (autoAdvance) {
          onTimeout();
        }
      }
    } else {
      overtimeSec += 1;
    }
  }

  onMount(() => {
    timerInterval = window.setInterval(tick, 1000);
  });

  onDestroy(() => {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  });

  function togglePlayPause() {
    isRunning = !isRunning;
  }

  function selectDuration(sec: number) {
    durationSec = sec;
    resetTimer();
    showConfig = false;
  }

  let isWarning = $derived(durationSec > 0 && timeRemaining <= 10 && timeRemaining > 0);
  let isOvertime = $derived(durationSec > 0 && timeRemaining <= 0);

  let formattedTime = $derived.by(() => {
    if (durationSec === 0) return '∞';
    if (timeRemaining > 0) {
      const m = Math.floor(timeRemaining / 60);
      const s = timeRemaining % 60;
      return `${m}:${s.toString().padStart(2, '0')}`;
    }
    return `+${overtimeSec}s`;
  });

  let progressPct = $derived(
    durationSec === 0 ? 100 : Math.max(0, Math.min(100, (timeRemaining / durationSec) * 100))
  );
</script>

<div class="relative flex items-center gap-1.5 shrink-0 select-none">
  <!-- Main Timer Pill -->
  <div
    class="flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs font-mono font-black transition-all {
      isOvertime
        ? 'bg-rose-950/90 border-rose-500 text-rose-300 animate-pulse shadow-md shadow-rose-500/20'
        : isWarning
        ? 'bg-amber-950/80 border-amber-500 text-amber-300 animate-pulse shadow-md shadow-amber-500/20'
        : 'bg-slate-900/90 border-slate-800 text-slate-300'
    }"
  >
    <!-- Status Icon -->
    <span class="text-[11px] {isOvertime ? 'text-rose-400' : isWarning ? 'text-amber-400' : 'text-slate-400'}">
      {isOvertime ? '⚠️' : '⏱️'}
    </span>

    <!-- Countdown Text -->
    <span class="tracking-tight min-w-[28px] text-center">
      {formattedTime}
    </span>

    {#if isOvertime}
      <span class="px-1 py-0.2 rounded bg-rose-900/60 text-rose-300 text-[8px] uppercase tracking-wider font-sans font-bold">
        SLOW
      </span>
    {/if}

    <!-- Play/Pause Button -->
    <button
      type="button"
      onclick={togglePlayPause}
      class="text-[10px] text-slate-400 hover:text-slate-100 px-1 py-0.5 rounded hover:bg-slate-800 transition-colors"
      title={isRunning ? 'Pause Turn Timer' : 'Resume Turn Timer'}
    >
      {isRunning ? '⏸' : '▶'}
    </button>

    <!-- Reset Button -->
    <button
      type="button"
      onclick={resetTimer}
      class="text-[10px] text-slate-400 hover:text-slate-100 px-1 py-0.5 rounded hover:bg-slate-800 transition-colors"
      title="Reset Turn Timer"
    >
      ↺
    </button>

    <!-- Settings Gear (DM Only) -->
    {#if isDm}
      <button
        type="button"
        onclick={() => showConfig = !showConfig}
        class="text-[11px] text-slate-500 hover:text-amber-400 px-0.5 transition-colors"
        title="Timer Settings"
      >
        ⚙
      </button>
    {/if}
  </div>

  <!-- Settings Dropdown Popover -->
  {#if showConfig}
    <div
      class="absolute top-full mt-1.5 left-0 z-50 w-44 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl p-2.5 space-y-2 text-xs animate-in fade-in duration-150"
    >
      <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
        Turn Duration
      </div>
      <div class="grid grid-cols-5 gap-1">
        {#each DURATION_OPTIONS as opt}
          <button
            type="button"
            onclick={() => selectDuration(opt.value)}
            class="py-1 rounded text-center font-bold text-[10px] transition-colors {
              durationSec === opt.value
                ? 'bg-amber-500 text-slate-950 font-black'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-750 hover:text-slate-200'
            }"
          >
            {opt.label}
          </button>
        {/each}
      </div>

      <div class="pt-1.5 border-t border-slate-800 flex items-center justify-between">
        <label for="autoadvance-toggle" class="text-[11px] text-slate-300 font-medium cursor-pointer">
          Auto-Advance
        </label>
        <input
          id="autoadvance-toggle"
          type="checkbox"
          bind:checked={autoAdvance}
          class="rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-amber-500 h-3.5 w-3.5"
        />
      </div>
    </div>
  {/if}
</div>
