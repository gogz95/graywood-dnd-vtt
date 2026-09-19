<script lang="ts">
  import { onMount } from 'svelte';
  import Icons from '../../../components/Icons.svelte';
  import { dispatchSoundEvent } from '../../audio/soundboardBridge';
  import { campaignDateStore } from '../../../stores/websocketStore';

  export interface ChancelleryDate {
    year: number;
    day_of_year: number;
    month?: number;
    month_name?: string;
    decade?: number;
    day_of_decade?: number;
    intercalary_festival?: string;
    formatted: string;
  }

  export interface AyModlahdDate {
    solar_year: number;
    regnal_year: number;
    emperor_name: string;
    day_of_solar_year: number;
    solar_mansion?: number;
    mansion_name?: string;
    day_of_mansion?: number;
    epagomenal_sun_festival?: string;
    formatted: string;
  }

  export interface RuceanTideDate {
    year: number;
    cycle: number;
    cycle_name: string;
    day_of_cycle: number;
    moon_phase: string;
    tide_status: string;
    formatted: string;
  }

  export interface MultiCalendarDate {
    epoch_days: number;
    chancellery: ChancelleryDate;
    ay_modlahd: AyModlahdDate;
    rucean: RuceanTideDate;
  }

  export interface LogEntry {
    id: string;
    epochDay: number;
    dateStr: string;
    title: string;
    details: string;
    tag: 'time' | 'spoilage' | 'contract' | 'lore';
  }

  let calendars = $state<MultiCalendarDate | null>(null);
  let isAdvancing = $state(false);
  let advanceFeedback = $state<string | null>(null);
  let customDays = $state(1);

  let campaignLogs = $state<LogEntry[]>([
    {
      id: 'log-1',
      epochDay: 1428,
      dateStr: '14th of Umbrel, Year 1428 G.E.',
      title: 'Arrival at Coastal Harbor Bastion',
      details: 'Party chartered the caravel Sea Nymph into the High Pier. Equipment and supplies inspected and verified by Gate Bailiffs.',
      tag: 'lore',
    },
    {
      id: 'log-2',
      epochDay: 1428,
      dateStr: '14th of Umbrel, Year 1428 G.E.',
      title: 'Port Assay Currency Exchange',
      details: 'Exchanged foreign western tender at the Port Assay Mint under standard exchange rates.',
      tag: 'contract',
    },
  ]);

  let newLogTitle = $state('');
  let newLogDetails = $state('');

  onMount(async () => {
    await fetchCalendar();
  });

  async function fetchCalendar() {
    try {
      const res = await fetch('/api/campaign/calendar');
      if (res.ok) {
        const data = await res.json();
        calendars = data.calendars;
      }
    } catch (err) {
      console.error('Failed fetching campaign calendars:', err);
    }
  }

  async function advanceDays(days: number) {
    if (days <= 0 || isAdvancing) return;
    isAdvancing = true;
    advanceFeedback = null;

    try {
      const res = await fetch('/api/campaign/advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days }),
      });

      if (res.ok) {
        const data = await res.json();
        const result = data.result;
        await fetchCalendar();
        dispatchSoundEvent('turn_bell');

        let msg = `Advanced ${days} day(s). New Epoch Day: ${result.new_epoch_days}.`;
        if (result.spoiled_items_count > 0) {
          msg += ` Warning: ${result.spoiled_items_count} unpreserved harvest reagents spoiled!`;
        }
        if (result.expired_contracts_count > 0) {
          msg += ` Notice: ${result.expired_contracts_count} regional notice-board contracts expired.`;
        }
        advanceFeedback = msg;

        // Auto-append time advancement log entry
        if (calendars) {
          campaignLogs = [
            {
              id: `log-${Date.now()}`,
              epochDay: result.new_epoch_days,
              dateStr: calendars.chancellery.formatted,
              title: `Campaign Time Advanced (+${days} Days)`,
              details: msg,
              tag: result.spoiled_items_count > 0 ? 'spoilage' : 'time',
            },
            ...campaignLogs,
          ];
        }
      }
    } catch (err) {
      console.error('Failed to advance campaign time:', err);
      advanceFeedback = 'Error advancing campaign days.';
    } finally {
      isAdvancing = false;
    }
  }

  function handleAddCustomLog() {
    if (!newLogTitle.trim()) return;
    const dateStr = calendars?.chancellery.formatted ?? 'Unknown Date';
    const epoch = calendars?.epoch_days ?? 0;

    const entry: LogEntry = {
      id: `custom-log-${Date.now()}`,
      epochDay: epoch,
      dateStr,
      title: newLogTitle.trim(),
      details: newLogDetails.trim() || 'No additional details noted.',
      tag: 'lore',
    };

    campaignLogs = [entry, ...campaignLogs];
    newLogTitle = '';
    newLogDetails = '';
    dispatchSoundEvent('coin_clink');
  }
</script>

<div class="space-y-6">
  <!-- Top Calendar Header Card -->
  <div class="bg-dark-900 border border-amber-900/40 rounded-2xl p-4 shadow-xl">
    <div class="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Icons name="calendar" size={18} />
          </div>
          <h2 class="text-base font-black text-slate-100 uppercase tracking-tight font-serif">
            Campaign Timekeeper & Tri-Calendar System
          </h2>
        </div>
        <p class="text-xs text-amber-200/60 mt-1">
          Campaign Chronicles &bull; Epoch Elapsed Days:
          <span class="font-mono text-amber-400 font-bold">{calendars?.epoch_days ?? '...'}</span>
        </p>
      </div>

      <!-- Quick Fast-Forward Stepper -->
      <div class="flex flex-wrap items-center gap-2 self-stretch sm:self-auto">
        <button
          onclick={() => advanceDays(1)}
          disabled={isAdvancing}
          class="px-3 py-1.5 bg-dark-800 hover:bg-dark-700 border border-dark-600 rounded-xl text-xs font-bold text-slate-200 transition-colors flex items-center gap-1"
        >
          +1 Day
        </button>
        <button
          onclick={() => advanceDays(10)}
          disabled={isAdvancing}
          class="px-3 py-1.5 bg-dark-800 hover:bg-dark-700 border border-dark-600 rounded-xl text-xs font-bold text-amber-300 transition-colors flex items-center gap-1"
        >
          +1 Tenday (Decade)
        </button>
        <button
          onclick={() => advanceDays(28)}
          disabled={isAdvancing}
          class="px-3 py-1.5 bg-dark-800 hover:bg-dark-700 border border-dark-600 rounded-xl text-xs font-bold text-purple-300 transition-colors flex items-center gap-1"
        >
          +1 Moon (28 Days)
        </button>
        <button
          onclick={() => advanceDays(91)}
          disabled={isAdvancing}
          class="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 text-black font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-amber-500/20 flex items-center gap-1"
        >
          +1 Season
        </button>
      </div>
    </div>
  </div>

  {#if advanceFeedback}
    <div class="p-3 bg-dark-900 border border-amber-500/60 rounded-xl text-xs text-amber-200 font-medium flex items-center gap-2 animate-fadeIn">
      <Icons name="info" size={16} class="text-amber-400 shrink-0" />
      <span>{advanceFeedback}</span>
    </div>
  {/if}

  <!-- Tri-Calendar Canonical Cards -->
  <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
    <!-- Calendar 1: Civil Standard -->
    <div class="bg-dark-900/90 border border-amber-500/30 rounded-2xl p-4 shadow-xl space-y-3 relative overflow-hidden">
      <div class="flex items-center justify-between">
        <span class="text-[10px] uppercase font-black text-amber-400 tracking-wider">Civil Realm Standard</span>
        <span class="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
      </div>
      <div>
        <h3 class="text-base font-black text-slate-100 font-serif">
          {calendars?.chancellery.formatted ?? 'Loading...'}
        </h3>
        <p class="text-[11px] text-slate-400 mt-1">
          364-Day Year &bull; 36 Decades &bull; 4 Solstice/Equinox Festivals
        </p>
      </div>
      <div class="bg-dark-950 p-2.5 rounded-xl border border-dark-800 text-xs space-y-1 font-mono">
        <div class="flex justify-between text-slate-400">
          <span>Decade / Day:</span>
          <span class="text-amber-300 font-bold">Decade {calendars?.chancellery.decade ?? 1}, Day {calendars?.chancellery.day_of_decade ?? 1}</span>
        </div>
        <div class="flex justify-between text-slate-400">
          <span>Day of Year:</span>
          <span class="text-slate-200">{calendars?.chancellery.day_of_year ?? 1} / 364</span>
        </div>
      </div>
    </div>

    <!-- Calendar 2: Ay Modlahd Solar Regnal -->
    <div class="bg-dark-900/90 border border-orange-500/30 rounded-2xl p-4 shadow-xl space-y-3 relative overflow-hidden">
      <div class="flex items-center justify-between">
        <span class="text-[10px] uppercase font-black text-orange-400 tracking-wider">Solar Empire Regnal</span>
        <span class="w-2.5 h-2.5 rounded-full bg-orange-400"></span>
      </div>
      <div>
        <h3 class="text-base font-black text-slate-100 font-serif">
          {calendars?.ay_modlahd.formatted ?? 'Loading...'}
        </h3>
        <p class="text-[11px] text-slate-400 mt-1">
          365-Day Solar &bull; Reign of Emperor Kaelen VI &bull; 12 Solar Mansions
        </p>
      </div>
      <div class="bg-dark-950 p-2.5 rounded-xl border border-dark-800 text-xs space-y-1 font-mono">
        <div class="flex justify-between text-slate-400">
          <span>Solar Mansion:</span>
          <span class="text-orange-300 font-bold">{calendars?.ay_modlahd.mansion_name ?? 'Solar Zenith'}</span>
        </div>
        <div class="flex justify-between text-slate-400">
          <span>Regnal Year:</span>
          <span class="text-slate-200">Year {calendars?.ay_modlahd.regnal_year ?? 1} of Ascension</span>
        </div>
      </div>
    </div>

    <!-- Calendar 3: Rucean Tide Cycle -->
    <div class="bg-dark-900/90 border border-purple-500/30 rounded-2xl p-4 shadow-xl space-y-3 relative overflow-hidden">
      <div class="flex items-center justify-between">
        <span class="text-[10px] uppercase font-black text-purple-400 tracking-wider">Ancient Lunar Tide Cycle</span>
        <span class="w-2.5 h-2.5 rounded-full bg-purple-400"></span>
      </div>
      <div>
        <h3 class="text-base font-black text-slate-100 font-serif">
          {calendars?.rucean.formatted ?? 'Loading...'}
        </h3>
        <p class="text-[11px] text-slate-400 mt-1">
          13 Lunar Cycles of 28 Days &bull; Rucean Archipelago Tide Tracking
        </p>
      </div>
      <div class="bg-dark-950 p-2.5 rounded-xl border border-dark-800 text-xs space-y-1 font-mono">
        <div class="flex justify-between text-slate-400">
          <span>Moon Phase:</span>
          <span class="text-purple-300 font-bold">{calendars?.rucean.moon_phase ?? 'Waxing Gibbous'}</span>
        </div>
        <div class="flex justify-between text-slate-400">
          <span>Tidal Flow:</span>
          <span class="text-slate-200">{calendars?.rucean.tide_status ?? 'High Spring Tide'}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Campaign Chronicle Journal & Daily Log -->
  <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
    <!-- Log Entries Feed (7 Cols) -->
    <div class="lg:col-span-7 space-y-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Icons name="book" size={16} class="text-amber-400" />
          <h3 class="text-xs font-black text-slate-200 uppercase tracking-wider font-serif">
            Campaign Chronicle & Spoilage Logs
          </h3>
        </div>
        <span class="text-[11px] text-slate-400 font-mono">{campaignLogs.length} Entries Recorded</span>
      </div>

      <div class="space-y-2.5">
        {#each campaignLogs as log}
          <div class="bg-dark-900 border border-dark-800 rounded-xl p-3.5 space-y-1.5 transition-colors hover:border-amber-900/60">
            <div class="flex items-start justify-between gap-2">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full {
                  log.tag === 'spoilage' ? 'bg-red-500' : log.tag === 'contract' ? 'bg-amber-400' : 'bg-blue-400'
                }"></span>
                <h4 class="font-bold text-xs text-slate-100 font-serif">{log.title}</h4>
              </div>
              <span class="text-[10px] text-slate-400 font-mono shrink-0">{log.dateStr}</span>
            </div>
            <p class="text-[11px] text-slate-300 leading-relaxed">{log.details}</p>
          </div>
        {/each}
      </div>
    </div>

    <!-- Add Chronicle Note Drawer (5 Cols) -->
    <div class="lg:col-span-5 space-y-4">
      <div class="bg-dark-900 border border-amber-900/40 rounded-2xl p-4 shadow-xl space-y-3">
        <div class="flex items-center gap-2">
          <Icons name="file-text" size={16} class="text-amber-400" />
          <h3 class="text-xs font-black text-slate-100 uppercase tracking-wider font-serif">
            Record Chronicle Event
          </h3>
        </div>

        <div class="space-y-2.5">
          <div>
            <label for="new-log-title" class="text-[10px] font-bold text-slate-400 uppercase block mb-1">
              Event Title
            </label>
            <input
              id="new-log-title"
              type="text"
              placeholder="e.g. Cleared Coastal Sluice Gates"
              bind:value={newLogTitle}
              class="w-full bg-dark-950 border border-dark-700 focus:border-amber-500 text-slate-200 text-xs px-3 py-1.5 rounded-xl focus:outline-none"
            />
          </div>

          <div>
            <label for="new-log-details" class="text-[10px] font-bold text-slate-400 uppercase block mb-1">
              Historical Details / Reagents Gathered
            </label>
            <textarea
              id="new-log-details"
              rows="4"
              placeholder="Record exploration discoveries, harvested reagents, or dungeon milestones..."
              bind:value={newLogDetails}
              class="w-full bg-dark-950 border border-dark-700 focus:border-amber-500 text-slate-200 text-xs p-3 rounded-xl focus:outline-none resize-none"
            ></textarea>
          </div>

          <button
            onclick={handleAddCustomLog}
            disabled={!newLogTitle.trim()}
            class="w-full py-2 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 text-black font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-amber-500/20 disabled:opacity-40 flex items-center justify-center gap-1.5"
          >
            <Icons name="plus" size={14} />
            Commit to Chronicle
          </button>
        </div>
      </div>
    </div>
  </div>
</div>
