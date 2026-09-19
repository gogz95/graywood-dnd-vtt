<script lang="ts">
  // CalendarWidget.svelte — Fully configurable campaign calendar, offline-first via localStorage

  interface MonthDef { name: string; days: number; }
  interface CalendarConfig {
    monthDefs: MonthDef[];
    currentDay: number;   // 1-indexed day within month
    currentMonth: number; // 0-indexed
    currentYear: number;
    currentHour: number;
    currentMinute: number;
    yearPrefix: string;   // e.g. "Year" or "DR"
  }

  const STORAGE_KEY = 'vtt_calendar_config';

  const DEFAULT_CONFIG: CalendarConfig = {
    monthDefs: [
      { name: 'Deepwinter',   days: 30 },
      { name: 'Claw of Winter', days: 30 },
      { name: 'Claw of the Sunsets', days: 30 },
      { name: 'Claw of Storms', days: 30 },
      { name: 'The Melting',   days: 30 },
      { name: 'The Time of Flowers', days: 30 },
      { name: 'Summertide',    days: 30 },
      { name: 'Highsun',       days: 30 },
      { name: 'The Fading',    days: 30 },
      { name: 'Leaffall',      days: 30 },
      { name: 'The Rotting',   days: 30 },
      { name: 'The Drawing Down', days: 30 },
    ],
    currentDay: 1,
    currentMonth: 0,
    currentYear: 1,
    currentHour: 8,
    currentMinute: 0,
    yearPrefix: 'Year',
  };

  function load(): CalendarConfig {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) as Partial<CalendarConfig> };
    } catch { /* reset */ }
    return { ...DEFAULT_CONFIG };
  }

  function save(cfg: CalendarConfig) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  }

  let config = $state<CalendarConfig>(load());
  let showSettings = $state(false);
  let settingsDraft = $state<CalendarConfig>({ ...load() });
  let feedback = $state<string | null>(null);

  // Props
  let {
    onTimeChange,
  }: {
    onTimeChange?: (s: string) => void;
  } = $props();

  let timeString = $derived(formatTime(config));

  $effect(() => {
    save(config);
    onTimeChange?.(timeString);
  });

  function formatTime(c: CalendarConfig): string {
    const month = c.monthDefs[c.currentMonth]?.name ?? `Month ${c.currentMonth + 1}`;
    const h = String(c.currentHour).padStart(2, '0');
    const m = String(c.currentMinute).padStart(2, '0');
    return `${ordinal(c.currentDay)} ${month}, ${c.yearPrefix} ${c.currentYear} — ${h}:${m}`;
  }

  function ordinal(n: number): string {
    const s = ['th','st','nd','rd'];
    const v = n % 100;
    return n + (s[(v-20) % 10] ?? s[v] ?? s[0]);
  }

  function advanceTime(minutes: number) {
    let totalMin = config.currentHour * 60 + config.currentMinute + minutes;
    const daysToAdd = Math.floor(totalMin / 1440);
    totalMin = totalMin % 1440;
    config.currentHour = Math.floor(totalMin / 60);
    config.currentMinute = totalMin % 60;

    if (daysToAdd > 0) advanceDays(daysToAdd);

    flash(`+${minutes >= 60 ? (minutes / 60) + ' hr' : minutes + ' min'}`);
  }

  function advanceDays(days: number) {
    let d = config.currentDay + days - 1;
    let m = config.currentMonth;
    let y = config.currentYear;
    while (true) {
      const monthLen = config.monthDefs[m]?.days ?? 30;
      if (d < monthLen) break;
      d -= monthLen;
      m++;
      if (m >= config.monthDefs.length) { m = 0; y++; }
    }
    config.currentDay = d + 1;
    config.currentMonth = m;
    config.currentYear = y;
  }

  function flash(msg: string) {
    feedback = msg;
    setTimeout(() => { feedback = null; }, 2000);
  }

  // Settings helpers
  function openSettings() {
    settingsDraft = JSON.parse(JSON.stringify(config)) as CalendarConfig;
    showSettings = true;
  }

  function applySettings() {
    config = JSON.parse(JSON.stringify(settingsDraft)) as CalendarConfig;
    showSettings = false;
  }

  function addMonth() {
    settingsDraft.monthDefs = [...settingsDraft.monthDefs, { name: `Month ${settingsDraft.monthDefs.length + 1}`, days: 30 }];
  }

  function removeMonth(i: number) {
    settingsDraft.monthDefs = settingsDraft.monthDefs.filter((_, idx) => idx !== i);
    if (settingsDraft.currentMonth >= settingsDraft.monthDefs.length) {
      settingsDraft.currentMonth = Math.max(0, settingsDraft.monthDefs.length - 1);
    }
  }

  const TIME_PRESETS: { label: string; minutes: number }[] = [
    { label: '+10 Min', minutes: 10 },
    { label: '+1 Hour', minutes: 60 },
    { label: 'Short Rest (1 Hr)', minutes: 60 },
    { label: 'Long Rest (8 Hr)', minutes: 480 },
  ];
</script>

<div class="h-full flex flex-col overflow-hidden bg-slate-950">
  <!-- Header -->
  <div class="flex items-center justify-between px-4 py-3 border-b border-slate-800 shrink-0 bg-slate-900">
    <div>
      <h2 class="text-sm font-bold text-slate-200 uppercase tracking-wide">Campaign Calendar</h2>
      <p class="text-[10px] text-slate-500">Offline-first · changes saved automatically</p>
    </div>
    <button onclick={openSettings} class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-colors">⚙ Configure</button>
  </div>

  <div class="flex-1 overflow-y-auto p-4 space-y-4">
    <!-- Current Date Display -->
    <div class="bg-gradient-to-br from-indigo-950/60 to-slate-900 border border-indigo-800/30 rounded-2xl p-5 text-center space-y-1">
      <p class="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Current Campaign Date &amp; Time</p>
      <p class="text-xl font-bold text-slate-100 leading-tight">{config.monthDefs[config.currentMonth]?.name ?? 'Unknown'}</p>
      <p class="text-4xl font-black text-white tracking-tight">{ordinal(config.currentDay)}</p>
      <p class="text-sm text-slate-400">{config.yearPrefix} {config.currentYear}</p>
      <div class="flex items-center justify-center gap-1 mt-2">
        <div class="px-3 py-1 bg-slate-800 rounded-full text-sm font-mono font-bold text-amber-300">
          {String(config.currentHour).padStart(2,'0')}:{String(config.currentMinute).padStart(2,'0')}
        </div>
      </div>
      {#if feedback}
        <div class="mt-2 text-emerald-400 text-xs font-bold animate-pulse">{feedback} →</div>
      {/if}
    </div>

    <!-- Time Advance Presets -->
    <div class="space-y-2">
      <h3 class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Advance Time</h3>
      <div class="grid grid-cols-2 gap-2">
        {#each TIME_PRESETS as preset}
          <button
            onclick={() => advanceTime(preset.minutes)}
            class="py-2.5 px-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-indigo-600/50 rounded-xl text-xs font-semibold text-slate-300 hover:text-slate-100 transition-all text-left"
          >
            <span class="text-indigo-400">⏱</span> {preset.label}
          </button>
        {/each}
      </div>
      <!-- Custom advance -->
      <div class="flex gap-2 pt-1">
        <div class="flex flex-col gap-1 flex-1">
          <label for="custom-hours" class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Custom Hours</label>
          <input type="number" min="0" max="8760" id="custom-hours"
            class="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono" placeholder="0" />
        </div>
        <div class="flex flex-col gap-1 flex-1">
          <label for="custom-days" class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Custom Days</label>
          <input type="number" min="0" max="999" id="custom-days"
            class="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono" placeholder="0" />
        </div>
        <div class="flex flex-col justify-end">
          <button
            onclick={() => {
              const hEl = document.getElementById('custom-hours') as HTMLInputElement;
              const dEl = document.getElementById('custom-days') as HTMLInputElement;
              const hours = parseInt(hEl?.value || '0', 10) || 0;
              const days = parseInt(dEl?.value || '0', 10) || 0;
              if (hours > 0 || days > 0) {
                advanceTime(hours * 60);
                if (days > 0) advanceDays(days);
                hEl.value = ''; dEl.value = '';
              }
            }}
            class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-colors"
          >▶ Go</button>
        </div>
      </div>
    </div>

    <!-- Month grid preview -->
    <div class="space-y-2">
      <h3 class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Month Overview</h3>
      <div class="bg-slate-900 border border-slate-800 rounded-xl p-3">
        <p class="text-xs font-semibold text-slate-300 mb-2">{config.monthDefs[config.currentMonth]?.name}</p>
        <div class="grid grid-cols-7 gap-1">
          {#each Array.from({ length: config.monthDefs[config.currentMonth]?.days ?? 30 }, (_, i) => i + 1) as day}
            <div class="aspect-square rounded text-[10px] font-mono flex items-center justify-center
              {day === config.currentDay ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-800 text-slate-500 hover:bg-slate-700 hover:text-slate-300 cursor-pointer'}"
              role="button" tabindex="0"
              onclick={() => { config.currentDay = day; }}
              onkeydown={(e) => { if (e.key === 'Enter') config.currentDay = day; }}
            >{day}</div>
          {/each}
        </div>
      </div>
    </div>
  </div>
</div>

<!-- Settings Modal -->
{#if showSettings}
  <div role="presentation" class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    onclick={(e) => { if (e.target === e.currentTarget) showSettings = false; }}>
    <div class="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col max-h-[80vh]">
      <div class="px-5 py-4 border-b border-slate-800 shrink-0 flex items-center justify-between">
        <h3 class="text-base font-bold text-slate-100">Calendar Configuration</h3>
        <button onclick={() => showSettings = false} class="text-slate-500 hover:text-white text-lg">✕</button>
      </div>
      <div class="flex-1 overflow-y-auto p-5 space-y-4">
        <div class="grid grid-cols-2 gap-3 text-xs">
          <div class="space-y-1">
            <label for="cfg-year-prefix" class="font-semibold text-slate-400 uppercase tracking-wider">Year Prefix</label>
            <input id="cfg-year-prefix" type="text" bind:value={settingsDraft.yearPrefix} class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500" placeholder="Year" />
          </div>
          <div class="space-y-1">
            <label for="cfg-current-year" class="font-semibold text-slate-400 uppercase tracking-wider">Current Year</label>
            <input id="cfg-current-year" type="number" bind:value={settingsDraft.currentYear} class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500" />
          </div>
          <div class="space-y-1">
            <label for="cfg-current-day" class="font-semibold text-slate-400 uppercase tracking-wider">Current Day</label>
            <input id="cfg-current-day" type="number" min="1" bind:value={settingsDraft.currentDay} class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500" />
          </div>
          <div class="space-y-1">
            <label for="cfg-starting-hour" class="font-semibold text-slate-400 uppercase tracking-wider">Starting Hour</label>
            <input id="cfg-starting-hour" type="number" min="0" max="23" bind:value={settingsDraft.currentHour} class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500" />
          </div>
        </div>

        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Months ({settingsDraft.monthDefs.length})</span>
            <button onclick={addMonth} class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded transition-colors">+ Add Month</button>
          </div>
          <div class="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            {#each settingsDraft.monthDefs as month, i}
              <div class="flex items-center gap-2">
                <span class="text-[10px] text-slate-600 font-mono w-4">{i+1}.</span>
                <input type="text" bind:value={month.name} class="flex-1 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500" />
                <input type="number" min="1" max="100" bind:value={month.days} class="w-14 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500" title="Days in month" />
                <span class="text-[10px] text-slate-600">days</span>
                <button onclick={() => removeMonth(i)} class="text-rose-500 hover:text-rose-300 text-xs px-1 transition-colors">✕</button>
              </div>
            {/each}
          </div>
        </div>
      </div>
      <div class="px-5 py-4 border-t border-slate-800 shrink-0 flex gap-3">
        <button onclick={applySettings} class="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-colors">Apply Changes</button>
        <button onclick={() => showSettings = false} class="px-5 py-2.5 bg-slate-800 text-slate-300 text-sm rounded-xl hover:bg-slate-700 transition-colors">Cancel</button>
      </div>
    </div>
  </div>
{/if}
