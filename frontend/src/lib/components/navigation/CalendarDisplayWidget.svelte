<!-- src/lib/components/navigation/CalendarDisplayWidget.svelte -->
<!-- Compact top-bar in-world calendar widget with date, time, moon phase, and time advance buttons -->

<script lang="ts">
  import { calendarStore } from '../../stores/calendarStore.svelte';

  let showAdvanceMenu = $state(false);
</script>

<div class="relative flex items-center gap-2 select-none">
  <!-- Main Display Capsule -->
  <div
    class="flex items-center gap-2 px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-xl text-xs shadow-sm"
  >
    <!-- Moon Phase & Emoji -->
    <span
      class="text-sm cursor-help"
      title="Current Moon Phase: {calendarStore.moonPhase}"
    >
      {calendarStore.moonEmoji}
    </span>

    <!-- In-world Date & Time -->
    <div class="flex items-center gap-1.5 font-mono text-[11px]">
      <span class="font-bold text-amber-300">
        {calendarStore.formattedDate}
      </span>
      <span class="text-slate-600">·</span>
      <span class="font-bold text-slate-200">
        {calendarStore.formattedTime}
      </span>
      <span class="px-1.5 py-0.2 rounded bg-slate-900 border border-slate-850 text-slate-400 font-sans text-[9px] uppercase font-bold">
        {calendarStore.timeOfDay}
      </span>
    </div>

    <!-- Quick Advance Menu Toggle -->
    <button
      type="button"
      onclick={() => showAdvanceMenu = !showAdvanceMenu}
      class="text-slate-400 hover:text-amber-300 hover:bg-slate-900 px-1.5 py-0.5 rounded transition-colors text-[10px] font-bold"
      title="Advance Time / Fast-Forward"
    >
      ⏳ +
    </button>
  </div>

  <!-- Quick Action Buttons (Visible on desktop) -->
  <div class="hidden lg:flex items-center gap-1 text-[10px] font-bold font-mono">
    <button
      type="button"
      onclick={() => calendarStore.advanceTime(10)}
      class="px-1.5 py-1 bg-slate-900 hover:bg-slate-850 active:scale-95 border border-slate-800 rounded-lg text-slate-300 hover:text-white transition-all"
      title="Advance 10 minutes"
    >
      +10m
    </button>
    <button
      type="button"
      onclick={() => calendarStore.advanceTime(60)}
      class="px-1.5 py-1 bg-slate-900 hover:bg-slate-850 active:scale-95 border border-slate-800 rounded-lg text-slate-300 hover:text-white transition-all"
      title="Advance 1 hour"
    >
      +1h
    </button>
    <button
      type="button"
      onclick={() => calendarStore.advanceTime(480)}
      class="px-2 py-1 bg-indigo-950/70 hover:bg-indigo-900/80 active:scale-95 border border-indigo-800/50 rounded-lg text-indigo-300 hover:text-indigo-100 transition-all font-sans"
      title="Advance 8 hours (Long Rest duration)"
    >
      +8h Rest
    </button>
    <button
      type="button"
      onclick={() => calendarStore.advanceTime(1440)}
      class="px-1.5 py-1 bg-slate-900 hover:bg-slate-850 active:scale-95 border border-slate-800 rounded-lg text-slate-300 hover:text-white transition-all"
      title="Advance 1 day"
    >
      +1d
    </button>
  </div>

  <!-- Dropdown Popover for Extended Time Advances -->
  {#if showAdvanceMenu}
    <div
      class="absolute top-full mt-1.5 left-0 z-50 w-48 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl p-2.5 space-y-2 text-xs animate-in fade-in duration-100"
    >
      <div class="flex items-center justify-between border-b border-slate-800 pb-1.5">
        <span class="text-[10px] font-black uppercase tracking-wider text-amber-400">Advance Clock</span>
        <button
          type="button"
          onclick={() => showAdvanceMenu = false}
          class="text-slate-500 hover:text-slate-300"
        >
          ✕
        </button>
      </div>

      <div class="grid grid-cols-2 gap-1 font-mono text-[11px]">
        <button
          type="button"
          onclick={() => { calendarStore.advanceTime(10); showAdvanceMenu = false; }}
          class="p-1 rounded bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 text-center"
        >
          +10 Mins
        </button>
        <button
          type="button"
          onclick={() => { calendarStore.advanceTime(30); showAdvanceMenu = false; }}
          class="p-1 rounded bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 text-center"
        >
          +30 Mins
        </button>
        <button
          type="button"
          onclick={() => { calendarStore.advanceTime(60); showAdvanceMenu = false; }}
          class="p-1 rounded bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 text-center"
        >
          +1 Hour
        </button>
        <button
          type="button"
          onclick={() => { calendarStore.advanceTime(240); showAdvanceMenu = false; }}
          class="p-1 rounded bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 text-center"
        >
          +4 Hours
        </button>
      </div>

      <div class="border-t border-slate-800 pt-1.5 space-y-1 font-sans">
        <button
          type="button"
          onclick={() => { calendarStore.advanceToDawn(); showAdvanceMenu = false; }}
          class="w-full py-1 px-2 rounded bg-amber-950/40 hover:bg-amber-900/60 border border-amber-800/40 text-amber-200 text-left flex items-center justify-between text-[11px]"
        >
          <span>🌅 To Dawn (06:00)</span>
        </button>
        <button
          type="button"
          onclick={() => { calendarStore.advanceToDusk(); showAdvanceMenu = false; }}
          class="w-full py-1 px-2 rounded bg-indigo-950/40 hover:bg-indigo-900/60 border border-indigo-800/40 text-indigo-200 text-left flex items-center justify-between text-[11px]"
        >
          <span>🌇 To Dusk (18:00)</span>
        </button>
      </div>
    </div>
  {/if}
</div>
