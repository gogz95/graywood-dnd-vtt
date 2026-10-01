// src/lib/services/calendarEngine.ts
// Custom Fantasy Calendar & Multi-Moon Celestial Cycle Engine (Lonelog Pattern)

import type {
  FantasyCalendarConfig,
  CampaignDateTime,
  MoonPhaseInfo,
  CalendarEvent,
  CalendarMonth,
  CelestialBody
} from '../types/campaign';
import { compendiumDb } from '../db/compendiumDb';

// ── Preset Calendars ────────────────────────────────────────────────────────

export const HARPTOS_CALENDAR: FantasyCalendarConfig = {
  id: 'harptos',
  name: 'Calendar of Harptos (Faerûn)',
  epochYear: 1492,
  weekDayNames: [
    'First-day', 'Second-day', 'Third-day', 'Fourth-day', 'Fifth-day',
    'Sixth-day', 'Seventh-day', 'Eighth-day', 'Ninth-day', 'Ride-end'
  ],
  months: [
    { name: 'Hammer (Deepwinter)', days: 30, season: 'Winter' },
    { name: 'Alturiak (The Claws of Winter)', days: 30, season: 'Winter' },
    { name: 'Ches (The Claw of Sunsets)', days: 30, season: 'Spring' },
    { name: 'Tarsakh (The Claw of the Storms)', days: 30, season: 'Spring' },
    { name: 'Mirtul (The Melting)', days: 30, season: 'Spring' },
    { name: 'Kythorn (The Time of Flowers)', days: 30, season: 'Summer' },
    { name: 'Flamerule (Summertide)', days: 30, season: 'Summer' },
    { name: 'Eleasis (Highsun)', days: 30, season: 'Summer' },
    { name: 'Eleint (The Fading)', days: 30, season: 'Autumn' },
    { name: 'Marpenoth (Leafall)', days: 30, season: 'Autumn' },
    { name: 'Uktar (The Rotting)', days: 30, season: 'Autumn' },
    { name: 'Nightal (The Drawing Down)', days: 30, season: 'Winter' }
  ],
  leapYearInterval: 4,
  moons: [
    { id: 'selune', name: 'Selûne (The White Moon)', synodicPeriodDays: 30.4, color: '#e0e7ff' },
    { id: 'tears', name: 'Tears of Selûne', synodicPeriodDays: 60.8, color: '#fef08a' }
  ]
};

export const GREYHAWK_CALENDAR: FantasyCalendarConfig = {
  id: 'greyhawk',
  name: 'Common Year Calendar (Oerth)',
  epochYear: 591,
  weekDayNames: ['Starday', 'Sunday', 'Moonday', 'Godsday', 'Waterday', 'Earthday', 'Freeday'],
  months: [
    { name: 'Needfest', days: 7, season: 'Winter' },
    { name: 'Fireseek', days: 28, season: 'Winter' },
    { name: 'Readying', days: 28, season: 'Spring' },
    { name: 'Coldeven', days: 28, season: 'Spring' },
    { name: 'Planting', days: 28, season: 'Spring' },
    { name: 'Flocktime', days: 28, season: 'Summer' },
    { name: 'Wealsun', days: 28, season: 'Summer' },
    { name: 'Richfest', days: 7, season: 'Summer' },
    { name: 'Reaping', days: 28, season: 'Summer' },
    { name: 'Goodmonth', days: 28, season: 'Autumn' },
    { name: 'Harvester', days: 28, season: 'Autumn' },
    { name: 'Patchwall', days: 28, season: 'Autumn' },
    { name: 'Ready’reat', days: 28, season: 'Winter' },
    { name: 'Sunsebb', days: 28, season: 'Winter' }
  ],
  moons: [
    { id: 'luna', name: 'Luna (Great Moon)', synodicPeriodDays: 28.0, color: '#f8fafc' },
    { id: 'celene', name: 'Celene (Handmaiden)', synodicPeriodDays: 91.0, color: '#a7f3d0' }
  ]
};

// ── Time & Weather Hook Interfaces ──────────────────────────────────────────

export type WeatherCondition =
  | 'Clear & Sunny'
  | 'Partly Cloudy'
  | 'Overcast & Foggy'
  | 'Light Rain / Drizzle'
  | 'Heavy Thunderstorm'
  | 'Snow Flurries'
  | 'Blizzard / Gale';

export interface ActiveSpellTimer {
  id: string;
  spellName: string;
  targetName: string;
  remainingSeconds: number;
}

export interface TimeAdvanceListener {
  (prev: CampaignDateTime, current: CampaignDateTime, deltaSeconds: number): void;
}

// ── Calendar Engine Implementation ──────────────────────────────────────────

export class CalendarEngine {
  public config: FantasyCalendarConfig;
  public currentTime: CampaignDateTime;
  public events: CalendarEvent[] = [];
  public activeSpellTimers: ActiveSpellTimer[] = [];
  public currentWeather: WeatherCondition = 'Clear & Sunny';

  private listeners: TimeAdvanceListener[] = [];
  private readonly STORAGE_KEY = 'vtt_campaign_datetime';

  constructor(config: FantasyCalendarConfig = HARPTOS_CALENDAR) {
    this.config = config;
    this.currentTime = {
      year: config.epochYear,
      month: 1,
      day: 1,
      hour: 8,
      minute: 0,
      second: 0
    };

    if (typeof window !== 'undefined') {
      this.loadState();
    }
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  public async saveState(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
        currentTime: this.currentTime,
        configId: this.config.id,
        currentWeather: this.currentWeather
      }));

      // Persist into Dexie campaign metadata
      await compendiumDb.campaignFlags.put({
        key: 'campaign_datetime',
        value: this.currentTime,
        updatedAt: Date.now()
      });

      window.dispatchEvent(
        new CustomEvent('vtt:calendar-advanced', {
          detail: {
            currentTime: { ...this.currentTime },
            moonPhases: this.getMoonPhases(),
            weather: this.currentWeather
          }
        })
      );
    } catch {
      // ignore
    }
  }

  public loadState(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.currentTime) {
          this.currentTime = parsed.currentTime;
        }
        if (parsed.currentWeather) {
          this.currentWeather = parsed.currentWeather;
        }
      }
    } catch {
      // ignore
    }
  }

  // ── Time Progression Math ─────────────────────────────────────────────────

  public advanceSeconds(secondsToAdd: number): CampaignDateTime {
    const prev = { ...this.currentTime };
    let sec = this.currentTime.second + secondsToAdd;
    let extraMin = Math.floor(sec / 60);
    this.currentTime.second = sec % 60;

    let min = this.currentTime.minute + extraMin;
    let extraHour = Math.floor(min / 60);
    this.currentTime.minute = min % 60;

    let hour = this.currentTime.hour + extraHour;
    let extraDays = Math.floor(hour / 24);
    this.currentTime.hour = hour % 24;

    if (extraDays > 0) {
      this.advanceDaysInternal(extraDays);
    }

    // Trigger hooks: active spell timers
    this.tickSpellTimers(secondsToAdd);

    // Celestial Event hook: Check for Full Moon phases to tag Lycanthrope actors
    if (extraDays > 0 || secondsToAdd >= 3600) {
      this.checkCelestialFullMoonHook();
    }

    // Weather shift (probabilistic shift on time jumps > 6 hours)
    if (secondsToAdd >= 6 * 3600) {
      this.updateWeather();
    }

    // Notify registered listeners
    for (const listener of this.listeners) {
      listener(prev, this.currentTime, secondsToAdd);
    }

    this.saveState();
    return { ...this.currentTime };
  }

  private advanceDaysInternal(daysToAdd: number): void {
    let day = this.currentTime.day + daysToAdd;

    while (true) {
      const monthIdx = this.currentTime.month - 1;
      const monthConfig = this.config.months[monthIdx] || this.config.months[0];
      let maxDays = monthConfig.days;

      // Leap day adjustment
      const isLeapYear = this.config.leapYearInterval && (this.currentTime.year % this.config.leapYearInterval === 0);
      if (isLeapYear && monthConfig.leapDays) {
        maxDays += monthConfig.leapDays;
      }

      if (day <= maxDays) {
        this.currentTime.day = day;
        break;
      }

      day -= maxDays;
      this.currentTime.month += 1;
      if (this.currentTime.month > this.config.months.length) {
        this.currentTime.month = 1;
        this.currentTime.year += 1;
      }
    }
  }

  public advanceRounds(rounds = 1): CampaignDateTime {
    return this.advanceSeconds(rounds * 6); // 1 round = 6 seconds
  }

  public advanceMinutes(minutes = 1): CampaignDateTime {
    return this.advanceSeconds(minutes * 60);
  }

  public advanceHours(hours = 1): CampaignDateTime {
    return this.advanceSeconds(hours * 3600);
  }

  public advanceShortRest(): CampaignDateTime {
    return this.advanceHours(1); // 1 hour short rest
  }

  public advanceLongRest(): CampaignDateTime {
    return this.advanceHours(8); // 8 hours long rest
  }

  public advanceDays(days = 1): CampaignDateTime {
    return this.advanceSeconds(days * 86400);
  }

  // ── Celestial & Moon Phase Math ───────────────────────────────────────────

  public getTotalDaysSinceEpoch(): number {
    let days = 0;
    // Year component
    const yearsElapsed = this.currentTime.year - this.config.epochYear;
    const yearLength = this.config.months.reduce((sum, m) => sum + m.days, 0);
    days += yearsElapsed * yearLength;

    // Month component
    for (let m = 0; m < this.currentTime.month - 1; m++) {
      days += this.config.months[m].days;
    }

    // Day component
    days += (this.currentTime.day - 1);
    days += (this.currentTime.hour / 24) + (this.currentTime.minute / 1440);
    return days;
  }

  public getMoonPhases(): MoonPhaseInfo[] {
    const totalDays = this.getTotalDaysSinceEpoch();

    return this.config.moons.map((moon) => {
      const period = moon.synodicPeriodDays || 29.5;
      const lunarAge = ((totalDays % period) + period) % period;
      const ratio = lunarAge / period;

      let phase = 'New Moon';
      let emoji = '🌑';

      if (ratio < 0.0625 || ratio >= 0.9375) {
        phase = 'New Moon';
        emoji = '🌑';
      } else if (ratio < 0.1875) {
        phase = 'Waxing Crescent';
        emoji = '🌒';
      } else if (ratio < 0.3125) {
        phase = 'First Quarter';
        emoji = '🌓';
      } else if (ratio < 0.4375) {
        phase = 'Waxing Gibbous';
        emoji = '🌔';
      } else if (ratio < 0.5625) {
        phase = 'Full Moon';
        emoji = '🌕';
      } else if (ratio < 0.6875) {
        phase = 'Waning Gibbous';
        emoji = '🌖';
      } else if (ratio < 0.8125) {
        phase = 'Third Quarter';
        emoji = '🌗';
      } else {
        phase = 'Waning Crescent';
        emoji = '🌘';
      }

      // Illumination formula
      const illumination = Math.round(0.5 * (1 - Math.cos(ratio * 2 * Math.PI)) * 100) / 100;

      return {
        moonId: moon.id,
        moonName: moon.name,
        phase,
        emoji,
        illumination
      };
    });
  }

  // ── Active Spells & Timers ────────────────────────────────────────────────

  public addSpellTimer(spellName: string, targetName: string, durationSeconds: number): ActiveSpellTimer {
    const timer: ActiveSpellTimer = {
      id: `spell-timer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      spellName,
      targetName,
      remainingSeconds: durationSeconds
    };
    this.activeSpellTimers.push(timer);
    return timer;
  }

  private tickSpellTimers(secondsElapsed: number): void {
    const expired: ActiveSpellTimer[] = [];
    this.activeSpellTimers = this.activeSpellTimers.filter((timer) => {
      timer.remainingSeconds -= secondsElapsed;
      if (timer.remainingSeconds <= 0) {
        expired.push(timer);
        return false;
      }
      return true;
    });

    if (expired.length > 0 && typeof window !== 'undefined') {
      for (const exp of expired) {
        window.dispatchEvent(
          new CustomEvent('vtt:toast', {
            detail: { message: `⏳ Spell Expired: "${exp.spellName}" on ${exp.targetName}` }
          })
        );
      }
    }
  }

  // ── Dynamic Weather Engine ────────────────────────────────────────────────

  public updateWeather(): WeatherCondition {
    const currentMonth = this.config.months[this.currentTime.month - 1];
    const season = currentMonth?.season || 'Spring';

    const conditions: WeatherCondition[] = [
      'Clear & Sunny',
      'Partly Cloudy',
      'Overcast & Foggy',
      'Light Rain / Drizzle',
      'Heavy Thunderstorm'
    ];

    if (season === 'Winter') {
      conditions.push('Snow Flurries', 'Blizzard / Gale');
    }

    this.currentWeather = conditions[Math.floor(Math.random() * conditions.length)];
    return this.currentWeather;
  }

  // ── Event & Hook Subscriptions ────────────────────────────────────────────

  public subscribe(listener: TimeAdvanceListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public getFormattedDate(): string {
    const m = this.config.months[this.currentTime.month - 1]?.name || 'Unknown';
    return `${this.currentTime.day} ${m}, ${this.currentTime.year} (${this.getTimeOfDay()})`;
  }

  public getFormattedTime(): string {
    const h = String(this.currentTime.hour).padStart(2, '0');
    const min = String(this.currentTime.minute).padStart(2, '0');
    const s = String(this.currentTime.second).padStart(2, '0');
    return `${h}:${min}:${s}`;
  }

  public getTimeOfDay(): string {
    const h = this.currentTime.hour;
    if (h >= 5 && h < 7) return 'Dawn';
    if (h >= 7 && h < 12) return 'Morning';
    if (h >= 12 && h < 14) return 'Noon';
    if (h >= 14 && h < 18) return 'Afternoon';
    if (h >= 18 && h < 20) return 'Dusk';
    return 'Night';
  }

  /**
   * Celestial Event Hook: Evaluates active moon phases and fires custom event
   * when any moon achieves Full Moon phase, tagging Lycanthrope actors in the compendium.
   */
  public async checkCelestialFullMoonHook(): Promise<void> {
    const phases = this.getMoonPhases();
    const fullMoon = phases.find((p) => p.phase === 'Full Moon');
    if (!fullMoon) return;

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('onCelestialEvent', {
          detail: {
            type: 'FULL_MOON',
            moonName: fullMoon.moonName,
            illumination: fullMoon.illumination,
            dateTime: { ...this.currentTime },
          },
        })
      );
    }

    // Tag Lycanthrope monster records in compendiumDb with active lunar frenzy flag
    try {
      if (compendiumDb && compendiumDb.monsters) {
        const lycanthropes = await compendiumDb.monsters
          .filter((m) => !!m.name && /werewolf|weretiger|werebear|wereboar|wererat/i.test(m.name))
          .toArray();

        for (const mon of lycanthropes) {
          await compendiumDb.monsters.update(mon.id, {
            traits: [
              ...(mon.traits || []),
              {
                name: `Lunar Frenzy (${fullMoon.moonName})`,
                description: 'Under the light of the full moon, this lycanthrope has advantage on Strength checks and melee attack rolls.',
              },
            ],
          });
        }
      }
    } catch (e) {
      console.warn('[CalendarEngine] Celestial hook error:', e);
    }
  }
}

// Global Singleton
export const calendarEngine = new CalendarEngine(HARPTOS_CALENDAR);
