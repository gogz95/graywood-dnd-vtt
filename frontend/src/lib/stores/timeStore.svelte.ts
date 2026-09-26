// timeStore.svelte.ts — In-Game Temporal Clock (Svelte 5 Runes)
// Binds to backend Axum /api/campaign/time endpoints and vtt:time-update WebSocket events.

export type WeatherMode = 'none' | 'rain' | 'snow' | 'fog' | 'embers';

export interface VttTimeState {
  epochDays: number;
  currentEpochSeconds: number; // 0..86399
  formattedTime: string;
  weather: WeatherMode;
}

// ── Default (noon) ─────────────────────────────────────────────────────────
const DEFAULT_STATE: VttTimeState = {
  epochDays: 0,
  currentEpochSeconds: 43200, // 12:00:00
  formattedTime: '12:00:00',
  weather: 'none',
};

// ── Reactive singleton ─────────────────────────────────────────────────────
function createTimeStore() {
  let state = $state<VttTimeState>({ ...DEFAULT_STATE });

  // Resolve API base (DM workstation talks to backend on :5174 when dev is on :5173)
  function apiBase(): string {
    if (typeof window === 'undefined') return '';
    const host =
      window.location.port === '5173'
        ? `${window.location.protocol}//${window.location.hostname}:5174`
        : `${window.location.protocol}//${window.location.host}`;
    return host;
  }

  /** Fetch current time from backend and hydrate state. */
  async function fetchTime(): Promise<void> {
    try {
      const res = await fetch(`${apiBase()}/api/campaign/time`);
      if (!res.ok) return;
      const data = await res.json();
      state.epochDays = data.epoch_days ?? data.epochDays ?? 0;
      state.currentEpochSeconds = data.current_epoch_seconds ?? data.currentEpochSeconds ?? 43200;
      state.formattedTime = data.formatted_time ?? data.formattedTime ?? formatClock(state.currentEpochSeconds);
    } catch {
      // Offline / backend not running – keep current state
    }
  }

  /** Advance in-game time by the given seconds via POST to backend. */
  async function advanceSeconds(seconds: number): Promise<void> {
    try {
      const res = await fetch(`${apiBase()}/api/campaign/time/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seconds }),
      });
      if (!res.ok) return;
      const data = await res.json();
      state.epochDays = data.epoch_days ?? data.epochDays ?? state.epochDays;
      state.currentEpochSeconds = data.current_epoch_seconds ?? data.currentEpochSeconds ?? state.currentEpochSeconds;
      state.formattedTime = data.formatted_time ?? data.formattedTime ?? formatClock(state.currentEpochSeconds);
    } catch {
      // Apply locally so UI is responsive even if backend is unreachable
      applyLocalAdvance(seconds);
    }
  }

  function applyLocalAdvance(seconds: number) {
    const total = state.currentEpochSeconds + seconds;
    const dayOverflow = Math.floor(total / 86400);
    state.epochDays += dayOverflow;
    state.currentEpochSeconds = total % 86400;
    state.formattedTime = formatClock(state.currentEpochSeconds);
  }

  /** Handle incoming WebSocket TIME_UPDATE broadcast. */
  function applyWsUpdate(event: { epoch_days: number; current_epoch_seconds: number; formatted_time: string }) {
    state.epochDays = event.epoch_days;
    state.currentEpochSeconds = event.current_epoch_seconds;
    state.formattedTime = event.formatted_time;
  }

  function setWeather(mode: WeatherMode) {
    state.weather = mode;
  }

  return {
    get epochDays() { return state.epochDays; },
    get currentEpochSeconds() { return state.currentEpochSeconds; },
    get formattedTime() { return state.formattedTime; },
    get weather() { return state.weather; },
    fetchTime,
    advanceSeconds,
    applyWsUpdate,
    setWeather,
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
