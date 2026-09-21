// src/lib/stores/calendarStore.svelte.ts
// Campaign Calendar & In-World Timekeeping Engine with Rest Hooks and Moon Phase Tracking

import { systemBus } from '../services/systemBus';

export interface CalendarConfig {
  epochYear: number;
  monthNames: string[];
  daysPerMonth: number;
  daysPerWeek: number;
  weekDayNames: string[];
}

export interface InWorldTime {
  year: number;
  month: number; // 1-indexed
  day: number;   // 1-indexed
  hour: number;  // 0-23
  minute: number; // 0-59
}

export type MoonPhase =
  | 'New Moon'
  | 'Waxing Crescent'
  | 'First Quarter'
  | 'Waxing Gibbous'
  | 'Full Moon'
  | 'Waning Gibbous'
  | 'Third Quarter'
  | 'Waning Crescent';

const DEFAULT_CONFIG: CalendarConfig = {
  epochYear: 1492,
  monthNames: [
    'Hammer', 'Alturiak', 'Ches', 'Tarsakh',
    'Mirtul', 'Kythorn', 'Flamerule', 'Eleasis',
    'Eleint', 'Marpenoth', 'Uktar', 'Nightal'
  ],
  daysPerMonth: 30,
  daysPerWeek: 10, // Standard Faerûn Tenday
  weekDayNames: ['First-day', 'Second-day', 'Third-day', 'Fourth-day', 'Fifth-day', 'Sixth-day', 'Seventh-day', 'Eighth-day', 'Ninth-day', 'Ride-end'],
};

const STORAGE_KEY = 'vtt_campaign_calendar';

export class CalendarStore {
  config = $state<CalendarConfig>(DEFAULT_CONFIG);

  year = $state(1492);
  month = $state(1);
  day = $state(1);
  hour = $state(8); // 8:00 AM start
  minute = $state(0);

  constructor() {
    if (typeof window !== 'undefined') {
      this.loadState();
      this.initRestHooks();
    }
  }

  private loadState(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.year !== undefined) this.year = saved.year;
        if (saved.month !== undefined) this.month = saved.month;
        if (saved.day !== undefined) this.day = saved.day;
        if (saved.hour !== undefined) this.hour = saved.hour;
        if (saved.minute !== undefined) this.minute = saved.minute;
        if (saved.config) this.config = { ...DEFAULT_CONFIG, ...saved.config };
      }
    } catch {
      // ignore parse failure
    }
  }

  private saveState(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const payload = {
        year: this.year,
        month: this.month,
        day: this.day,
        hour: this.hour,
        minute: this.minute,
        config: this.config,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      window.dispatchEvent(new CustomEvent('vtt:calendar-advanced', { detail: payload }));
    } catch {
      // ignore
    }
  }

  private initRestHooks(): void {
    // Automatically tick in-game time when rests complete via SystemBus
    systemBus.on('REST_COMPLETED', (payload) => {
      if (payload.restType === 'short') {
        this.advanceTime(60); // 1 hour for short rest
      } else if (payload.restType === 'long') {
        this.advanceTime(8 * 60); // 8 hours for long rest
      }
    });
  }

  public advanceTime(minutesToAdd: number): void {
    let totalMinutes = this.minute + minutesToAdd;
    let extraHours = Math.floor(totalMinutes / 60);
    this.minute = totalMinutes % 60;

    let totalHours = this.hour + extraHours;
    let extraDays = Math.floor(totalHours / 24);
    this.hour = totalHours % 24;

    if (extraDays > 0) {
      let totalDays = this.day + extraDays;
      const daysInMonth = this.config.daysPerMonth;

      while (totalDays > daysInMonth) {
        totalDays -= daysInMonth;
        this.month += 1;
        if (this.month > this.config.monthNames.length) {
          this.month = 1;
          this.year += 1;
        }
      }
      this.day = totalDays;
    }

    this.saveState();
  }

  public advanceToDawn(): void {
    // Fast-forward to next 06:00
    if (this.hour < 6) {
      const mins = (6 - this.hour) * 60 - this.minute;
      this.advanceTime(mins);
    } else {
      const minsRemainingToday = (24 - this.hour) * 60 - this.minute;
      this.advanceTime(minsRemainingToday + 6 * 60);
    }
  }

  public advanceToDusk(): void {
    // Fast-forward to next 18:00
    if (this.hour < 18) {
      const mins = (18 - this.hour) * 60 - this.minute;
      this.advanceTime(mins);
    } else {
      const minsRemainingToday = (24 - this.hour) * 60 - this.minute;
      this.advanceTime(minsRemainingToday + 18 * 60);
    }
  }

  // ── Derived View Helpers ──────────────────────────────────────────────────

  monthName = $derived(
    this.config.monthNames[this.month - 1] || 'Unknown'
  );

  formattedDate = $derived(
    `${this.day} ${this.monthName}, ${this.year} DR`
  );

  formattedTime = $derived(
    `${this.hour.toString().padStart(2, '0')}:${this.minute.toString().padStart(2, '0')}`
  );

  timeOfDay = $derived.by(() => {
    if (this.hour >= 5 && this.hour < 7) return 'Dawn';
    if (this.hour >= 7 && this.hour < 12) return 'Morning';
    if (this.hour >= 12 && this.hour < 14) return 'Noon';
    if (this.hour >= 14 && this.hour < 18) return 'Afternoon';
    if (this.hour >= 18 && this.hour < 20) return 'Dusk';
    return 'Night';
  });

  moonPhase = $derived.by<MoonPhase>(() => {
    // 29.5-day synodic lunar cycle calculation
    const totalDayCount = (this.year * 365) + (this.month * this.config.daysPerMonth) + this.day;
    const lunarAge = (totalDayCount % 29.5);

    if (lunarAge < 1.84) return 'New Moon';
    if (lunarAge < 5.53) return 'Waxing Crescent';
    if (lunarAge < 9.22) return 'First Quarter';
    if (lunarAge < 12.91) return 'Waxing Gibbous';
    if (lunarAge < 16.61) return 'Full Moon';
    if (lunarAge < 20.30) return 'Waning Gibbous';
    if (lunarAge < 23.99) return 'Third Quarter';
    if (lunarAge < 27.68) return 'Waning Crescent';
    return 'New Moon';
  });

  moonEmoji = $derived.by(() => {
    switch (this.moonPhase) {
      case 'New Moon': return '🌑';
      case 'Waxing Crescent': return '🌒';
      case 'First Quarter': return '🌓';
      case 'Waxing Gibbous': return '🌔';
      case 'Full Moon': return '🌕';
      case 'Waning Gibbous': return '🌖';
      case 'Third Quarter': return '🌗';
      case 'Waning Crescent': return '🌘';
    }
  });
}

export const calendarStore = new CalendarStore();
