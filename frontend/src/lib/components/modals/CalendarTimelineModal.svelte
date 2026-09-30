<!-- frontend/src/lib/components/modals/CalendarTimelineModal.svelte -->
<!-- Fantasy Calendar, Celestial Moon Phases & Timeline Engine Drawer Modal -->

<script lang="ts">
  import { onMount } from 'svelte';
  import { calendarEngine, type WeatherCondition } from '../../services/calendarEngine';
  import type { CampaignDateTime, MoonPhaseInfo, CalendarEvent } from '../../types/campaign';

  let { isOpen = $bindable(false) }: { isOpen?: boolean } = $props();

  let currentTime = $state<CampaignDateTime>({ ...calendarEngine.currentTime });
  let moonPhases = $state<MoonPhaseInfo[]>(calendarEngine.getMoonPhases());
  let weather = $state<WeatherCondition>(calendarEngine.currentWeather);
  let formattedDate = $state<string>(calendarEngine.getFormattedDate());
  let formattedTime = $state<string>(calendarEngine.getFormattedTime());
  let activeTimers = $state(calendarEngine.activeSpellTimers);

  // New Spell Timer Form State
  let newSpellName = $state('');
  let newTargetName = $state('');
  let newSpellDurationMins = $state(10);

  export function open() {
    isOpen = true;
    syncState();
  }

  export function close() {
    isOpen = false;
  }

  function syncState() {
    currentTime = { ...calendarEngine.currentTime };
    moonPhases = calendarEngine.getMoonPhases();
    weather = calendarEngine.currentWeather;
    formattedDate = calendarEngine.getFormattedDate();
    formattedTime = calendarEngine.getFormattedTime();
    activeTimers = [...calendarEngine.activeSpellTimers];
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  function advance(action: 'round' | 'shortRest' | 'longRest' | 'day' | 'tenday' | 'hour') {
    switch (action) {
      case 'round':
        calendarEngine.advanceRounds(1);
        break;
      case 'hour':
        calendarEngine.advanceHours(1);
        break;
      case 'shortRest':
        calendarEngine.advanceShortRest();
        break;
      case 'longRest':
        calendarEngine.advanceLongRest();
        break;
      case 'day':
        calendarEngine.advanceDays(1);
        break;
      case 'tenday':
        calendarEngine.advanceDays(10);
        break;
    }
    syncState();
  }

  function handleAddTimer() {
    if (!newSpellName || !newTargetName) return;
    calendarEngine.addSpellTimer(newSpellName, newTargetName, newSpellDurationMins * 60);
    newSpellName = '';
    newTargetName = '';
    syncState();
  }

  onMount(() => {
    const handleUpdate = () => syncState();
    window.addEventListener('vtt:calendar-advanced', handleUpdate);
    return () => {
      window.removeEventListener('vtt:calendar-advanced', handleUpdate);
    };
  });
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if isOpen}
  <div class="calendar-backdrop" onclick={close} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="calendar-window"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label="Campaign Calendar & Timeline"
      tabindex="-1"
    >
      <!-- Header -->
      <div class="modal-header">
        <div class="header-titles">
          <div class="header-icon">📅</div>
          <div>
            <h2>Campaign Calendar & Timeline</h2>
            <span class="subtitle">{calendarEngine.config.name}</span>
          </div>
        </div>
        <button class="close-btn" onclick={close} title="Close (Esc)">×</button>
      </div>

      <!-- Current Date & Weather Banner -->
      <div class="date-hero">
        <div class="datetime-block">
          <span class="date-text">{formattedDate}</span>
          <span class="time-text">{formattedTime}</span>
        </div>
        <div class="weather-badge">
          <span class="weather-label">Atmosphere</span>
          <span class="weather-val">🌤️ {weather}</span>
        </div>
      </div>

      <!-- Quick Time Advance Bar -->
      <div class="advance-bar">
        <span class="advance-label">Advance Time:</span>
        <button class="advance-btn" onclick={() => advance('round')}>+1 Round (6s)</button>
        <button class="advance-btn" onclick={() => advance('hour')}>+1 Hour</button>
        <button class="advance-btn rest-btn" onclick={() => advance('shortRest')}>☕ Short Rest (1h)</button>
        <button class="advance-btn rest-btn" onclick={() => advance('longRest')}>⛺ Long Rest (8h)</button>
        <button class="advance-btn" onclick={() => advance('day')}>+1 Day</button>
        <button class="advance-btn" onclick={() => advance('tenday')}>+1 Tenday</button>
      </div>

      <div class="body-scroll">
        <!-- Celestial Bodies / Moon Phases -->
        <div class="section-card">
          <h3 class="card-title">Celestial Cycles & Moon Phases</h3>
          <div class="moons-grid">
            {#each moonPhases as moon}
              <div class="moon-card">
                <span class="moon-emoji">{moon.emoji}</span>
                <div class="moon-meta">
                  <h4 class="moon-name">{moon.moonName}</h4>
                  <span class="moon-phase">{moon.phase}</span>
                  <div class="illumination-bar">
                    <div
                      class="illumination-fill"
                      style="width: {moon.illumination * 100}%"
                    ></div>
                  </div>
                  <span class="illum-text">{Math.round(moon.illumination * 100)}% Illumination</span>
                </div>
              </div>
            {/each}
          </div>
        </div>

        <!-- Active Spell Timers -->
        <div class="section-card">
          <h3 class="card-title">Active Spell Timers & Duration Watcher</h3>
          {#if activeTimers.length === 0}
            <p class="empty-text">No active spells currently tracked on the timeline clock.</p>
          {:else}
            <div class="timers-list">
              {#each activeTimers as timer}
                <div class="timer-item">
                  <div class="timer-info">
                    <span class="timer-spell">✨ {timer.spellName}</span>
                    <span class="timer-target">Target: {timer.targetName}</span>
                  </div>
                  <span class="timer-remaining">
                    {Math.ceil(timer.remainingSeconds / 60)} min remaining ({timer.remainingSeconds}s)
                  </span>
                </div>
              {/each}
            </div>
          {/if}

          <!-- Add Timer Form -->
          <div class="add-timer-row">
            <input
              type="text"
              placeholder="Spell Name (e.g. Bless, Haste)"
              bind:value={newSpellName}
            />
            <input
              type="text"
              placeholder="Target (e.g. Thorgar)"
              bind:value={newTargetName}
            />
            <input
              type="number"
              min="1"
              max="1440"
              placeholder="Mins"
              bind:value={newSpellDurationMins}
              style="width: 70px"
            />
            <button class="add-timer-btn" onclick={handleAddTimer}>+ Track Spell</button>
          </div>
        </div>

        <!-- Month Breakdown & Holidays -->
        <div class="section-card">
          <h3 class="card-title">Annual Cycle Overview</h3>
          <div class="months-overview">
            {#each calendarEngine.config.months as month, idx}
              <div class="month-pill {currentTime.month === idx + 1 ? 'current' : ''}">
                <span class="month-num">{idx + 1}</span>
                <span class="month-label">{month.name}</span>
                <span class="month-days">{month.days} days</span>
              </div>
            {/each}
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="modal-footer">
        <span class="footer-tip">💡 Advancing time automatically evaluates spell expirations and rest recoveries.</span>
        <button class="done-btn" onclick={close}>Done</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .calendar-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
  }

  .calendar-window {
    width: 100%;
    max-width: 820px;
    max-height: 90vh;
    background: #11141b;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.6);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: #e2e8f0;
    font-family: inherit;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    background: rgba(255, 255, 255, 0.03);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .header-titles {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .header-icon {
    font-size: 1.5rem;
  }

  .header-titles h2 {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 700;
    color: #f8fafc;
  }

  .subtitle {
    font-size: 0.8rem;
    color: #94a3b8;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 1.5rem;
    cursor: pointer;
    border-radius: 6px;
    padding: 0.2rem 0.5rem;
  }

  .date-hero {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    background: rgba(99, 102, 241, 0.1);
    border-bottom: 1px solid rgba(99, 102, 241, 0.25);
  }

  .datetime-block {
    display: flex;
    flex-direction: column;
  }

  .date-text {
    font-size: 1.3rem;
    font-weight: 700;
    color: #f8fafc;
  }

  .time-text {
    font-size: 0.95rem;
    font-weight: 600;
    color: #818cf8;
  }

  .weather-badge {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }

  .weather-label {
    font-size: 0.68rem;
    color: #94a3b8;
    text-transform: uppercase;
  }

  .weather-val {
    font-size: 0.95rem;
    font-weight: 600;
    color: #fde047;
  }

  .advance-bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.75rem 1.25rem;
    background: rgba(15, 23, 42, 0.6);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .advance-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: #94a3b8;
    text-transform: uppercase;
  }

  .advance-btn {
    background: #1e293b;
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #f1f5f9;
    padding: 0.35rem 0.65rem;
    font-size: 0.78rem;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .advance-btn:hover {
    background: #334155;
  }

  .advance-btn.rest-btn {
    background: rgba(99, 102, 241, 0.2);
    border-color: rgba(99, 102, 241, 0.4);
    color: #a5b4fc;
  }

  .advance-btn.rest-btn:hover {
    background: rgba(99, 102, 241, 0.35);
  }

  .body-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .section-card {
    background: #1a1e29;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 1rem;
  }

  .card-title {
    margin: 0 0 0.85rem 0;
    font-size: 0.85rem;
    text-transform: uppercase;
    font-weight: 700;
    color: #cbd5e1;
    letter-spacing: 0.04em;
  }

  .moons-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 0.75rem;
  }

  .moon-card {
    background: rgba(15, 23, 42, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
    padding: 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.85rem;
  }

  .moon-emoji {
    font-size: 2rem;
  }

  .moon-meta {
    flex: 1;
  }

  .moon-name {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 700;
    color: #f8fafc;
  }

  .moon-phase {
    font-size: 0.75rem;
    color: #94a3b8;
  }

  .illumination-bar {
    width: 100%;
    height: 4px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
    margin: 0.35rem 0;
    overflow: hidden;
  }

  .illumination-fill {
    height: 100%;
    background: #facc15;
  }

  .illum-text {
    font-size: 0.7rem;
    color: #64748b;
  }

  .timers-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 0.85rem;
  }

  .timer-item {
    background: rgba(15, 23, 42, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .timer-info {
    display: flex;
    flex-direction: column;
  }

  .timer-spell {
    font-weight: 600;
    color: #e2e8f0;
    font-size: 0.85rem;
  }

  .timer-target {
    font-size: 0.72rem;
    color: #94a3b8;
  }

  .timer-remaining {
    font-size: 0.78rem;
    font-weight: 600;
    color: #38bdf8;
  }

  .empty-text {
    font-size: 0.8rem;
    color: #64748b;
    font-style: italic;
    margin: 0 0 0.85rem 0;
  }

  .add-timer-row {
    display: flex;
    gap: 0.5rem;
  }

  .add-timer-row input {
    background: #0f172a;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    padding: 0.35rem 0.6rem;
    color: #f1f5f9;
    font-size: 0.8rem;
    outline: none;
    flex: 1;
  }

  .add-timer-btn {
    background: #4f46e5;
    border: 1px solid #6366f1;
    color: #ffffff;
    padding: 0.35rem 0.75rem;
    font-size: 0.8rem;
    font-weight: 600;
    border-radius: 6px;
    cursor: pointer;
  }

  .months-overview {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 0.5rem;
  }

  .month-pill {
    background: rgba(15, 23, 42, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 6px;
    padding: 0.45rem 0.6rem;
    display: flex;
    flex-direction: column;
  }

  .month-pill.current {
    border-color: #6366f1;
    background: rgba(99, 102, 241, 0.15);
  }

  .month-num {
    font-size: 0.65rem;
    color: #64748b;
    font-weight: 700;
  }

  .month-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: #f1f5f9;
  }

  .month-days {
    font-size: 0.7rem;
    color: #94a3b8;
  }

  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1.25rem;
    background: rgba(255, 255, 255, 0.02);
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .footer-tip {
    font-size: 0.75rem;
    color: #64748b;
  }

  .done-btn {
    background: #334155;
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #f8fafc;
    padding: 0.4rem 1rem;
    font-size: 0.85rem;
    border-radius: 6px;
    cursor: pointer;
  }
</style>
