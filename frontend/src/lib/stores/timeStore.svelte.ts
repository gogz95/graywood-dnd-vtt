// timeStore.svelte.ts — In-Game Temporal Clock (Svelte 5 Runes)
// Binds to backend Axum /api/campaign/time endpoints and vtt:time-update WebSocket events.

export type WeatherMode = 'none' | 'rain' | 'snow' | 'fog' | 'embers';

export interface CalendarMonth {
  name: string;
  days: number;
}

export interface ActiveSpellEffect {
  id: string;
  name: string;
  casterName?: string;
  durationSeconds: number;
  startEpochSeconds: number;
  expiresAtEpochSeconds: number;
  notes?: string;
}

export interface CalendariumConfig {
  epochName: string;
  currentYear: number;
  currentDayOfYear: number;
  lunarCycleDays: number; // e.g. 28.0 days
  months: CalendarMonth[];
  weekdays: string[];
}

export interface VttTimeState {
  epochDays: number;
  currentEpochSeconds: number; // 0..86399
  formattedTime: string;
  weather: WeatherMode;
  calendarConfig: CalendariumConfig;
  activeEffects: ActiveSpellEffect[];
}

// Default Calendarium Configuration (Harptos / Faerûn-inspired baseline)
const DEFAULT_CALENDAR_CONFIG: CalendariumConfig = {
  epochName: 'Dale Reckoning (DR)',
  currentYear: 1492,
  currentDayOfYear: 1,
  lunarCycleDays: 28.0,
  weekdays: ['Firstday', 'Moonday', 'Truthday', 'Waterday', 'Highsun', 'Godsday', 'Restday'],
  months: [
    { name: 'Hammer', days: 30 },
    { name: 'Alturiak', days: 30 },
    { name: 'Ches', days: 30 },
    { name: 'Tarsakh', days: 30 },
    { name: 'Mirtul', days: 30 },
    { name: 'Kythorn', days: 30 },
    { name: 'Flamerule', days: 30 },
    { name: 'Eleasis', days: 30 },
    { name: 'Eleint', days: 30 },
    { name: 'Marpenoth', days: 30 },
    { name: 'Uktar', days: 30 },
    { name: 'Nightal', days: 30 },
  ],
};

const DEFAULT_STATE: VttTimeState = {
  epochDays: 0,
  currentEpochSeconds: 43200, // 12:00:00
  formattedTime: '12:00:00',
  weather: 'none',
  calendarConfig: { ...DEFAULT_CALENDAR_CONFIG },
  activeEffects: [],
};

// ── Reactive singleton ─────────────────────────────────────────────────────
function createTimeStore() {
  let state = $state<VttTimeState>({ ...DEFAULT_STATE });

  /** Fetch current time from backend and hydrate state. */
  async function fetchTime(): Promise<void> {
    try {
      const res = await fetch('/api/campaign/time');
      if (!res.ok) return;
      const data = await res.json();
      state.epochDays = data.epoch_days ?? data.epochDays ?? 0;
      state.currentEpochSeconds = data.current_epoch_seconds ?? data.currentEpochSeconds ?? 43200;
      state.formattedTime = data.formatted_time ?? data.formattedTime ?? formatClock(state.currentEpochSeconds);
    } catch {
      // Offline / backend not running – keep current state
    }
  }

  /** Advance in-game time by the given seconds via POST to backend or local fallback. */
  async function advanceSeconds(seconds: number): Promise<void> {
    const priorTotalSeconds = state.epochDays * 86400 + state.currentEpochSeconds;
    const newTotalSeconds = priorTotalSeconds + seconds;

    try {
      const res = await fetch('/api/campaign/time/advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seconds }),
      });
      if (res.ok) {
        const data = await res.json();
        state.epochDays = data.epoch_days ?? data.epochDays ?? state.epochDays;
        state.currentEpochSeconds = data.current_epoch_seconds ?? data.currentEpochSeconds ?? state.currentEpochSeconds;
        state.formattedTime = data.formatted_time ?? data.formattedTime ?? formatClock(state.currentEpochSeconds);
      } else {
        applyLocalAdvance(seconds);
      }
    } catch {
      applyLocalAdvance(seconds);
    }

    // Check active spell/effect duration expirations
    checkExpiredEffects(newTotalSeconds);
  }

  function applyLocalAdvance(seconds: number) {
    const total = state.currentEpochSeconds + seconds;
    const dayOverflow = Math.floor(total / 86400);
    state.epochDays += dayOverflow;
    state.currentEpochSeconds = ((total % 86400) + 86400) % 86400;
    state.formattedTime = formatClock(state.currentEpochSeconds);
  }

  function checkExpiredEffects(currentTotalSeconds: number) {
    const remaining: ActiveSpellEffect[] = [];
    for (const effect of state.activeEffects) {
      if (currentTotalSeconds >= effect.expiresAtEpochSeconds) {
        // Trigger expiration notification
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('vtt:effect-expired', {
              detail: { effect, expiredAt: currentTotalSeconds },
            })
          );
          window.dispatchEvent(
            new CustomEvent('vtt:notification', {
              detail: {
                title: 'Spell Effect Expired',
                message: `"${effect.name}" has expired after ${formatDuration(effect.durationSeconds)}.`,
                type: 'warning',
              },
            })
          );
        }
      } else {
        remaining.push(effect);
      }
    }
    state.activeEffects = remaining;
  }

  function addActiveEffect(name: string, durationSeconds: number, casterName?: string, notes?: string): ActiveSpellEffect {
    const currentTotal = state.epochDays * 86400 + state.currentEpochSeconds;
    const newEffect: ActiveSpellEffect = {
      id: `effect-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      casterName,
      durationSeconds,
      startEpochSeconds: currentTotal,
      expiresAtEpochSeconds: currentTotal + durationSeconds,
      notes,
    };
    state.activeEffects = [...state.activeEffects, newEffect];
    return newEffect;
  }

  function removeActiveEffect(effectId: string) {
    state.activeEffects = state.activeEffects.filter(e => e.id !== effectId);
  }

  function setCalendarConfig(config: Partial<CalendariumConfig>) {
    state.calendarConfig = { ...state.calendarConfig, ...config };
  }

  /** Calculate current Calendarium date (Year, Month, Day of Month, Weekday) */
  function getCurrentDate() {
    const { months, weekdays, currentYear, epochName } = state.calendarConfig;
    const daysInYear = months.reduce((sum, m) => sum + m.days, 0) || 365;

    // Total days elapsed since epoch start
    const totalDayCount = state.epochDays;
    const yearOffset = Math.floor(totalDayCount / daysInYear);
    const effectiveYear = currentYear + yearOffset;
    let dayIndexInYear = totalDayCount % daysInYear;
    if (dayIndexInYear < 0) dayIndexInYear += daysInYear;

    let monthName = months[0]?.name || 'Month 1';
    let dayOfMonth = dayIndexInYear + 1;

    for (const m of months) {
      if (dayOfMonth <= m.days) {
        monthName = m.name;
        break;
      }
      dayOfMonth -= m.days;
    }

    const weekdayIndex = totalDayCount % (weekdays.length || 7);
    const weekday = weekdays[weekdayIndex < 0 ? weekdayIndex + weekdays.length : weekdayIndex] || 'Firstday';

    return {
      year: effectiveYear,
      epochName,
      month: monthName,
      day: dayOfMonth,
      weekday,
      totalDayOfYear: dayIndexInYear + 1,
    };
  }

  /** Calculate current Moon Phase based on world days elapsed */
  function getMoonPhase(): { phase: string; icon: string; progress: number } {
    const cycle = state.calendarConfig.lunarCycleDays || 28.0;
    const dayProgress = (state.epochDays % cycle + cycle) % cycle;
    const ratio = dayProgress / cycle;

    if (ratio < 0.06 || ratio >= 0.94) return { phase: 'New Moon', icon: '🌑', progress: ratio };
    if (ratio < 0.22) return { phase: 'Waxing Crescent', icon: '🌒', progress: ratio };
    if (ratio < 0.28) return { phase: 'First Quarter', icon: '🌓', progress: ratio };
    if (ratio < 0.44) return { phase: 'Waxing Gibbous', icon: '🌔', progress: ratio };
    if (ratio < 0.56) return { phase: 'Full Moon', icon: '🌕', progress: ratio };
    if (ratio < 0.72) return { phase: 'Waning Gibbous', icon: '🌖', progress: ratio };
    if (ratio < 0.78) return { phase: 'Third Quarter', icon: '🌗', progress: ratio };
    return { phase: 'Waning Crescent', icon: '🌘', progress: ratio };
  }

  /** Handle incoming WebSocket TIME_UPDATE broadcast. */
  function applyWsUpdate(event: { epoch_days: number; current_epoch_seconds: number; formatted_time: string }) {
    state.epochDays = event.epoch_days;
    state.currentEpochSeconds = event.current_epoch_seconds;
    state.formattedTime = event.formatted_time;
    checkExpiredEffects(event.epoch_days * 86400 + event.current_epoch_seconds);
  }

  function setWeather(mode: WeatherMode) {
    state.weather = mode;
  }

  return {
    get epochDays() { return state.epochDays; },
    get currentEpochSeconds() { return state.currentEpochSeconds; },
    get formattedTime() { return state.formattedTime; },
    get weather() { return state.weather; },
    get calendarConfig() { return state.calendarConfig; },
    get activeEffects() { return state.activeEffects; },
    fetchTime,
    advanceSeconds,
    applyWsUpdate,
    setWeather,
    setCalendarConfig,
    getCurrentDate,
    getMoonPhase,
    addActiveEffect,
    removeActiveEffect,
  };
}

export const vttTimeStore = createTimeStore();

// ── Formatting helpers ─────────────────────────────────────────────────────
export function formatClock(epochSeconds: number): string {
  const s = Math.max(0, epochSeconds) % 86400;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** Returns the in-game day number (1-indexed) from epoch days. */
export function epochDayToGameDay(epochDays: number): number {
  return epochDays + 1;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

// ── Ambient Tint Engine ────────────────────────────────────────────────────
export interface AmbientTint {
  color: number;  // 0xRRGGBB
  alpha: number;  // 0.0 – 1.0
}

interface TintKeyframe {
  second: number;  // time of day (0..86399)
  color: number;
  alpha: number;
}

const TINT_KEYFRAMES: TintKeyframe[] = [
  { second: 0,     color: 0x1e1b4b, alpha: 0.55 }, // midnight
  { second: 5400,  color: 0xfbbf24, alpha: 0.20 }, // 01:30 deep night softening
  { second: 18000, color: 0xfbbf24, alpha: 0.20 }, // 05:00 dawn rose/gold
  { second: 25200, color: 0xffffff, alpha: 0.02 }, // 07:00 sunrise clear
  { second: 43200, color: 0xffffff, alpha: 0.00 }, // noon daylight
  { second: 61200, color: 0xffffff, alpha: 0.00 }, // 17:00 still daylight
  { second: 64800, color: 0xf97316, alpha: 0.25 }, // 18:00 dusk amber
  { second: 72000, color: 0xf97316, alpha: 0.25 }, // 20:00 dusk end
  { second: 79200, color: 0x1e1b4b, alpha: 0.45 }, // 22:00 deepening night
  { second: 86399, color: 0x1e1b4b, alpha: 0.55 }, // 23:59 midnight mirror
];

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

export function getAmbientTint(epochSeconds: number): AmbientTint {
  const s = ((epochSeconds % 86400) + 86400) % 86400;
  const frames = TINT_KEYFRAMES;

  let prev = frames[0];
  let next = frames[frames.length - 1];
  for (let i = 0; i < frames.length - 1; i++) {
    if (s >= frames[i].second && s <= frames[i + 1].second) {
      prev = frames[i];
      next = frames[i + 1];
      break;
    }
  }

  const range = next.second - prev.second;
  const t = range === 0 ? 0 : (s - prev.second) / range;
  return {
    color: lerpColor(prev.color, next.color, t),
    alpha: prev.alpha + (next.alpha - prev.alpha) * t,
  };
}
