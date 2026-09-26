<!-- WorldClockPill.svelte — Compact in-game world clock display for the header bar -->
<!-- Displays formatted time, day number, weather state, and DM time-advance controls -->

<script lang="ts">
  import { vttTimeStore, epochDayToGameDay, type WeatherMode } from '../../stores/timeStore.svelte';
  import { onMount } from 'svelte';

  let isExpanded = $state(false);

  const WEATHER_ICONS: Record<WeatherMode, string> = {
    none: '☀️',
    rain: '🌧️',
    snow: '❄️',
    fog: '🌫️',
    embers: '🔥',
  };

  const TIME_INCREMENTS: Array<{ label: string; seconds: number }> = [
    { label: '+6s',  seconds: 6 },
    { label: '+1m',  seconds: 60 },
    { label: '+10m', seconds: 600 },
    { label: '+1h',  seconds: 3600 },
    { label: '+8h',  seconds: 28800 },
  ];

  const WEATHER_MODES: WeatherMode[] = ['none', 'rain', 'snow', 'fog', 'embers'];

  // Time-of-day semantic label
  let timeLabel = $derived(() => {
    const s = vttTimeStore.currentEpochSeconds;
    if (s >= 21600  && s < 43200) return 'Morning';
    if (s >= 43200  && s < 61200) return 'Afternoon';
    if (s >= 61200  && s < 72000) return 'Dusk';
    if (s >= 72000  && s < 82800) return 'Night';
    return 'Midnight';
  });

  // Sun/moon phase icon
  let timeIcon = $derived(() => {
    const s = vttTimeStore.currentEpochSeconds;
    if (s >= 18000 && s < 64800) return '☀️';
    if (s >= 64800 && s < 72000) return '🌅';
    return '🌙';
  });

  onMount(() => {
    // Fetch initial time from backend on mount
    vttTimeStore.fetchTime();
  });
</script>

<div class="relative">
  <!-- ── Compact Clock Pill ── -->
  <button
    type="button"
    id="world-clock-pill"
    onclick={() => isExpanded = !isExpanded}
    class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono transition-all select-none
      bg-slate-950/90 hover:bg-slate-800 border-slate-700/80 text-slate-200 shadow-sm"
    title="In-Game World Clock — Click to expand time controls"
  >
    <span class="text-sm leading-none">{timeIcon()}</span>
    <span class="font-bold text-indigo-300 tabular-nums tracking-tight">{vttTimeStore.formattedTime}</span>
    <span class="text-slate-500 text-[10px]">D{epochDayToGameDay(vttTimeStore.epochDays)}</span>
    <span class="text-sm leading-none">{WEATHER_ICONS[vttTimeStore.weather]}</span>
    <span class="text-slate-600 text-[9px]">▾</span>
  </button>

  <!-- ── Expanded Controls Popover ── -->
  {#if isExpanded}
    <!-- Backdrop -->
    <div
      class="fixed inset-0 z-40"
      onclick={() => isExpanded = false}
      role="presentation"
    ></div>

    <div class="absolute right-0 top-full mt-1.5 z-50 w-72 bg-slate-900/98 border border-slate-700/90 rounded-2xl shadow-2xl p-3 flex flex-col gap-3 backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">

      <!-- Header row -->
      <div class="flex items-center justify-between border-b border-slate-800 pb-2">
        <div class="flex items-center gap-2">
          <span class="text-lg">{timeIcon()}</span>
          <div>
            <div class="font-mono font-black text-sm text-indigo-300 tabular-nums tracking-tight">{vttTimeStore.formattedTime}</div>
            <div class="text-[10px] text-slate-400 font-semibold">{timeLabel()} · Day {epochDayToGameDay(vttTimeStore.epochDays)}</div>
          </div>
        </div>
        <button
          type="button"
          onclick={() => isExpanded = false}
          class="text-slate-500 hover:text-white text-sm p-1 rounded"
          aria-label="Close clock panel"
        >✕</button>
      </div>

      <!-- Time advance buttons -->
      <div>
        <div class="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1.5">Advance Time</div>
        <div class="flex items-center gap-1 flex-wrap">
          {#each TIME_INCREMENTS as inc}
            <button
              type="button"
              id="time-advance-{inc.label.replace('+','').replace(' ','')}"
              onclick={() => vttTimeStore.advanceSeconds(inc.seconds)}
              class="px-2 py-1 bg-slate-800 hover:bg-indigo-800 hover:text-indigo-100 text-slate-300 rounded-lg text-xs font-mono font-bold transition-all border border-slate-700/60 hover:border-indigo-500/60 hover:shadow-sm"
            >
              {inc.label}
            </button>
          {/each}
        </div>
      </div>

      <!-- Weather mode selector -->
      <div>
        <div class="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1.5">Weather</div>
        <div class="flex items-center gap-1 flex-wrap">
          {#each WEATHER_MODES as mode}
            <button
              type="button"
              id="weather-mode-{mode}"
              onclick={() => vttTimeStore.setWeather(mode)}
              class="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-all border
                {vttTimeStore.weather === mode
                  ? 'bg-indigo-700 text-white border-indigo-500/80 shadow-sm shadow-indigo-900/40'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700/50'}"
            >
              <span>{WEATHER_ICONS[mode]}</span>
              <span class="capitalize">{mode}</span>
            </button>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>
