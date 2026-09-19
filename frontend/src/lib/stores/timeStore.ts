// timeStore.ts — Central Reactive In-Game Timekeeper & Calendar Spoilage Engine
// Decrements perishable shelf life when time advances and auto-flags unpreserved biological viscera as 'Spoiled' after 24h.

import { writable, get } from 'svelte/store';
import { partyStashStore, type PartyStashItem } from '../../stores/sessionStore';
import { getCalendarTotalHours, auditPartyStashDecay } from '../harvest/harvestEngine';
import { audioEngine } from '../audio/AudioEngine';

export interface CalendarTimeState {
  currentYear: number;
  currentMonth: number; // 0-indexed (0-11)
  currentDay: number;   // 1-indexed (1-30)
  currentHour: number;  // 0-23
  currentMinute: number;// 0-59
  yearPrefix: string;
}

const STORAGE_CALENDAR_KEY = 'vtt_calendar_config';

const DEFAULT_TIME: CalendarTimeState = {
  currentYear: 1,
  currentMonth: 0,
  currentDay: 1,
  currentHour: 8,
  currentMinute: 0,
  yearPrefix: 'Year',
};

function loadInitialTime(): CalendarTimeState {
  if (typeof localStorage === 'undefined') return DEFAULT_TIME;
  try {
    const raw = localStorage.getItem(STORAGE_CALENDAR_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        currentYear: parsed.currentYear ?? DEFAULT_TIME.currentYear,
        currentMonth: parsed.currentMonth ?? DEFAULT_TIME.currentMonth,
        currentDay: parsed.currentDay ?? DEFAULT_TIME.currentDay,
        currentHour: parsed.currentHour ?? DEFAULT_TIME.currentHour,
        currentMinute: parsed.currentMinute ?? DEFAULT_TIME.currentMinute,
        yearPrefix: parsed.yearPrefix ?? DEFAULT_TIME.yearPrefix,
      };
    }
  } catch {
    // fallback
  }
  return DEFAULT_TIME;
}

export const timeStore = writable<CalendarTimeState>(loadInitialTime());

/**
 * Calculates continuous running hour count since epoch.
 */
export function getTotalHours(time?: CalendarTimeState): number {
  const t = time || get(timeStore);
  return getCalendarTotalHours(t);
}

/**
 * Runs an audit on all player inventories in localStorage and flags expired perishable items as Spoiled.
 */
export function auditPlayerInventoriesDecay(totalHours: number): number {
  if (typeof localStorage === 'undefined') return 0;
  let spoiledCount = 0;

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('vtt_inventory_')) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const items = JSON.parse(raw);
        let modified = false;

        const updated = items.map((item: any) => {
          if (!item.isPerishable || item.isPreserved || item.isSpoiled) return item;

          const harvestedAtHour = typeof item.harvestedAtHour === 'number'
            ? item.harvestedAtHour
            : typeof item.harvestTimestamp === 'number'
            ? Math.floor(item.harvestTimestamp / 3600)
            : null;

          if (harvestedAtHour !== null) {
            const elapsed = totalHours - harvestedAtHour;
            if (elapsed >= 24) {
              spoiledCount++;
              modified = true;
              return {
                ...item,
                isSpoiled: true,
                decayState: 'spoiled',
                name: item.name.startsWith('Spoiled ') ? item.name : `Spoiled ${item.name}`,
                description: `${item.description} [SPOILED: Decayed past 24-hour viability window.]`,
                valueGp: 0,
              };
            }
          }
          return item;
        });

        if (modified) {
          localStorage.setItem(key, JSON.stringify(updated));
          const charId = key.replace('vtt_inventory_', '');
          window.dispatchEvent(new CustomEvent('vtt:inventory-updated', { detail: { characterId: charId } }));
        }
      }
    }
  } catch (err) {
    console.error('Error auditing player inventories for decay:', err);
  }

  return spoiledCount;
}

/**
 * Synchronizes party stash and player inventory spoilage against current calendar time.
 */
function runFullDecayAudit(time: CalendarTimeState) {
  const currentTotalHours = getTotalHours(time);

  // 1. Audit Party Stash
  const currentStash = get(partyStashStore);
  const { updatedItems, newlySpoiledCount } = auditPartyStashDecay(currentStash, currentTotalHours);
  if (newlySpoiledCount > 0) {
    partyStashStore.set(updatedItems);
  }

  // 2. Audit Player Inventories
  const playerSpoiled = auditPlayerInventoriesDecay(currentTotalHours);

  if (newlySpoiledCount > 0 || playerSpoiled > 0) {
    audioEngine.triggerSfx('sfx-nat1');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('vtt:spoilage-alert', {
          detail: {
            stashSpoiled: newlySpoiledCount,
            playerSpoiled,
            totalHours: currentTotalHours,
          },
        })
      );
    }
  }
}

// Auto-persist calendar time
timeStore.subscribe((state) => {
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_CALENDAR_KEY);
      const existing = raw ? JSON.parse(raw) : {};
      localStorage.setItem(STORAGE_CALENDAR_KEY, JSON.stringify({ ...existing, ...state }));
    } catch {
      // ignore
    }
  }
});

/**
 * Advances in-game time by hours, automatically triggering decay checks.
 */
export function advanceHours(hours: number): void {
  if (hours <= 0) return;

  timeStore.update((curr) => {
    let totalH = curr.currentHour + hours;
    let extraDays = Math.floor(totalH / 24);
    let newHour = totalH % 24;

    let newDay = curr.currentDay + extraDays;
    let newMonth = curr.currentMonth;
    let newYear = curr.currentYear;

    while (newDay > 30) {
      newDay -= 30;
      newMonth += 1;
      if (newMonth >= 12) {
        newMonth = 0;
        newYear += 1;
      }
    }

    const nextState: CalendarTimeState = {
      ...curr,
      currentYear: newYear,
      currentMonth: newMonth,
      currentDay: newDay,
      currentHour: newHour,
    };

    runFullDecayAudit(nextState);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vtt:time-advanced', { detail: { hours, nextState } }));
    }

    return nextState;
  });
}

/**
 * Advances in-game time by days (e.g. Long Rest = 8 hours or 1 day travel).
 */
export function advanceDays(days: number): void {
  advanceHours(days * 24);
}

/**
 * Advances in-game time by minutes.
 */
export function advanceMinutes(minutes: number): void {
  if (minutes <= 0) return;

  timeStore.update((curr) => {
    let totalM = curr.currentMinute + minutes;
    let extraHours = Math.floor(totalM / 60);
    let newMin = totalM % 60;

    if (extraHours > 0) {
      advanceHours(extraHours);
    }

    return {
      ...curr,
      currentMinute: newMin,
    };
  });
}
