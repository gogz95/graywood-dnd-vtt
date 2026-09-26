<script lang="ts">
  import {
    vttTimeStore,
    epochDayToGameDay,
    formatDuration,
    type WeatherMode,
    type ActiveSpellEffect,
  } from '../../stores/timeStore.svelte';
  import { onMount } from 'svelte';

  let isExpanded = $state(false);
  let showEffectModal = $state(false);
  let newEffectName = $state('');
  let newEffectDuration = $state(60); // seconds

  const WEATHER_ICONS: Record<WeatherMode, string> = {
    none: '☀️',
    rain: '🌧️',
    snow: '❄️',
    fog: '🌫️',
    embers: '🔥',
  };

  const TIME_INCREMENTS: Array<{ label: string; seconds: number; title: string }> = [
    { label: '+6s',  seconds: 6,     title: '1 Tactical Round' },
    { label: '+1m',  seconds: 60,    title: '1 Minute' },
    { label: '+10m', seconds: 600,   title: '10 Minutes (Short Search)' },
    { label: '+1h',  seconds: 3600,  title: '1 Hour (Short Rest)' },
    { label: '+8h',  seconds: 28800, title: '8 Hours (Long Rest)' },
    { label: '+1d',  seconds: 86400, title: '1 Full Day' },
  ];

  const WEATHER_MODES: WeatherMode[] = ['none', 'rain', 'snow', 'fog', 'embers'];

  // Current calendar details & moon phase
  let currentDate = $derived(vttTimeStore.getCurrentDate());
  let currentMoon = $derived(vttTimeStore.getMoonPhase());
  let activeEffects = $derived(vttTimeStore.activeEffects);

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
    return currentMoon.icon;
  });

  onMount(() => {
    vttTimeStore.fetchTime();
  });

  function handleAddEffect() {
    if (!newEffectName.trim()) return;
    vttTimeStore.addActiveEffect(newEffectName.trim(), newEffectDuration);
    newEffectName = '';
    showEffectModal = false;
  }
</script>

<div class="relative">
  <!-- ── Compact Clock Pill ── -->
  <button
    type="button"
    id="world-clock-pill"
    onclick={() => isExpanded = !isExpanded}
    class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono transition-all select-none
      bg-slate-950/90 hover:bg-slate-800 border-slate-700/80 text-slate-200 shadow-sm"
    title="Calendarium World Clock — Click to expand time controls"
  >
    <span class="text-sm leading-none" title={currentMoon.phase}>{timeIcon()}</span>
    <span class="font-bold text-indigo-300 tabular-nums tracking-tight">{vttTimeStore.formattedTime}</span>
    <span class="text-amber-400 text-[10px] font-semibold">{currentDate.month} {currentDate.day}</span>
    <span class="text-slate-500 text-[9px]">{currentMoon.icon}</span>
    <span class="text-sm leading-none">{WEATHER_ICONS[vttTimeStore.weather]}</span>
    {#if activeEffects.length > 0}
      <span class="px-1 py-0.2 rounded-full bg-rose-950 text-rose-300 border border-rose-800 text-[9px] font-bold">
        {activeEffects.length}⚡
      </span>
    {/if}
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

    <div class="absolute right-0 top-full mt-1.5 z-50 w-80 bg-slate-900/98 border border-slate-700/90 rounded-2xl shadow-2xl p-3.5 flex flex-col gap-3 backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">

      <!-- Header row: Calendarium Date & Moon -->
      <div class="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div class="flex items-center gap-2.5">
          <span class="text-2xl">{currentMoon.icon}</span>
          <div>
            <div class="font-mono font-black text-sm text-indigo-300 tabular-nums tracking-tight flex items-center gap-1.5">
              <span>{vttTimeStore.formattedTime}</span>
              <span class="text-[10px] text-slate-400 font-sans font-normal">({timeLabel()})</span>
            </div>
            <div class="text-[11px] text-amber-300 font-semibold">
              {currentDate.weekday}, {currentDate.month} {currentDate.day}, {currentDate.year} {currentDate.epochName}
            </div>
            <div class="text-[10px] text-slate-400 italic">
              Lunar: {currentMoon.phase} ({Math.round(currentMoon.progress * 100)}% cycle)
            </div>
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
        <div class="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1.5 flex items-center justify-between">
          <span>Advance World Clock</span>
          <span class="text-[9px] text-slate-400 lowercase">round / rest shortcuts</span>
        </div>
        <div class="grid grid-cols-3 gap-1.5">
          {#each TIME_INCREMENTS as inc}
            <button
              type="button"
              id="time-advance-{inc.label.replace('+','').replace(' ','')}"
              onclick={() => vttTimeStore.advanceSeconds(inc.seconds)}
              title={inc.title}
              class="px-2 py-1.5 bg-slate-800 hover:bg-indigo-700 text-slate-200 hover:text-white rounded-lg text-xs font-mono font-bold transition-all border border-slate-700/60 hover:border-indigo-500/60 flex flex-col items-center"
            >
              <span class="text-xs">{inc.label}</span>
              <span class="text-[8px] font-sans text-slate-400 font-normal truncate max-w-full">{inc.title.split(' ')[0]}</span>
            </button>
          {/each}
        </div>
      </div>

      <!-- Active Spell / Effect Tracking -->
      <div class="border-t border-slate-800/80 pt-2">
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Active Spells &amp; Effects</span>
          <button
            type="button"
            onclick={() => showEffectModal = !showEffectModal}
            class="text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold"
          >
            + Track Spell
          </button>
        </div>

        {#if showEffectModal}
          <div class="bg-slate-950 p-2 rounded-lg border border-slate-800 mb-2 space-y-1.5 text-xs">
            <input
              type="text"
              bind:value={newEffectName}
              placeholder="Spell/Effect name (e.g. Bless, Haste)..."
              class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs focus:outline-none"
            />
            <div class="flex items-center gap-1">
              <select
                bind:value={newEffectDuration}
                class="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs focus:outline-none"
              >
                <option value={60}>1 Minute (10 rounds)</option>
                <option value={600}>10 Minutes</option>
                <option value={3600}>1 Hour</option>
                <option value={28800}>8 Hours</option>
                <option value={86400}>24 Hours</option>
              </select>
              <button
                type="button"
                onclick={handleAddEffect}
                class="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-bold text-xs"
              >
                Add
              </button>
            </div>
          </div>
        {/if}

        {#if activeEffects.length > 0}
          <div class="space-y-1 max-h-24 overflow-y-auto">
            {#each activeEffects as effect}
              {@const currentTotal = vttTimeStore.epochDays * 86400 + vttTimeStore.currentEpochSeconds}
              {@const remaining = Math.max(0, effect.expiresAtEpochSeconds - currentTotal)}
              <div class="flex items-center justify-between bg-slate-950/60 border border-slate-800 px-2 py-1 rounded text-[11px]">
                <div class="truncate mr-2">
                  <span class="text-indigo-300 font-semibold">{effect.name}</span>
                  <span class="text-[9px] text-slate-500 font-mono ml-1">({formatDuration(remaining)} left)</span>
                </div>
                <button
                  type="button"
                  onclick={() => vttTimeStore.removeActiveEffect(effect.id)}
                  class="text-slate-500 hover:text-rose-400 text-xs"
                  title="Dismiss effect"
                >✕</button>
              </div>
            {/each}
          </div>
        {:else}
          <div class="text-[10px] text-slate-500 italic">No active duration effects tracked.</div>
        {/if}
      </div>

      <!-- Weather mode selector -->
      <div class="border-t border-slate-800/80 pt-2">
        <div class="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1.5">Weather State</div>
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
