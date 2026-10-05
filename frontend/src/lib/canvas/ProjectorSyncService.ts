// src/lib/canvas/ProjectorSyncService.ts
// Decoupled DM ↔ /projector viewport synchronization:
//   1. Throttled DM-side viewport broadcast ({ x, y, scale }) over the battlemat
//      BroadcastChannel + WebSocket + companion viewport channel.
//   2. Smooth exponential lerp on the projector side so DM pans/zooms are
//      followed without hard snapping.
//   3. Player-safe token filtering helpers for the public projector canvas.

import { broadcastBattlematUpdate, type SyncMessage } from '../services/battlematSyncBridge';
import { broadcastViewport as broadcastCompanionViewport } from '../services/companionSync';
import type { ViewportTransform } from '../../stores/canvasStore.svelte';

export interface ProjectorViewportTarget {
  x: number;
  y: number;
  scale: number;
}

/** 'mirror' targets originate from DM pans; 'focus' targets are local (active-turn centering). */
export type ViewportTargetMode = 'mirror' | 'focus';

const VIEWPORT_THROTTLE_MS = 60;
const LERP_TAU_MS = 90;
const SNAP_DISTANCE_PX = 0.5;
const SNAP_SCALE_EPSILON = 0.0005;

class ProjectorSyncService {
  private lastBroadcastAt = 0;
  private throttleTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingViewport: ProjectorViewportTarget | null = null;
  private target: ProjectorViewportTarget | null = null;
  private targetMode: ViewportTargetMode = 'mirror';

  // ── Projector side: lerp target management ──────────────────────────────

  setTarget(vp: ProjectorViewportTarget, mode: ViewportTargetMode = 'mirror'): void {
    this.target = { ...vp };
    this.targetMode = mode;
  }

  /** Clears the active target, optionally only when it matches the given mode. */
  clearTarget(mode?: ViewportTargetMode): void {
    if (!mode || this.targetMode === mode) {
      this.target = null;
    }
  }

  hasTarget(): boolean {
    return this.target !== null;
  }

  peekTargetMode(): ViewportTargetMode {
    return this.targetMode;
  }

  /**
   * Steps `current` toward the target with exponential smoothing.
   * Returns null once settled (caller should skip the write).
   */
  tick(dtMs: number, current: ViewportTransform): ViewportTransform | null {
    if (!this.target) return null;
    const k = 1 - Math.exp(-Math.max(0, dtMs) / LERP_TAU_MS);
    const nx = current.x + (this.target.x - current.x) * k;
    const ny = current.y + (this.target.y - current.y) * k;
    const ns = current.zoom + (this.target.scale - current.zoom) * k;

    const settled =
      Math.abs(this.target.x - nx) < SNAP_DISTANCE_PX &&
      Math.abs(this.target.y - ny) < SNAP_DISTANCE_PX &&
      Math.abs(this.target.scale - ns) < SNAP_SCALE_EPSILON;

    if (settled) {
      const snapped = { x: this.target.x, y: this.target.y, zoom: this.target.scale };
      this.target = null;
      return snapped;
    }
    return { x: nx, y: ny, zoom: ns };
  }

  // ── DM side: throttled outgoing viewport broadcast ──────────────────────

  broadcastViewport(vp: ProjectorViewportTarget, followDm = true): void {
    const now = Date.now();
    if (now - this.lastBroadcastAt >= VIEWPORT_THROTTLE_MS) {
      this.flushViewport(vp, followDm);
      return;
    }
    // Trailing edge: coalesce bursts into one final send.
    this.pendingViewport = { ...vp };
    if (!this.throttleTimer) {
      this.throttleTimer = setTimeout(() => {
        this.throttleTimer = null;
        const pending = this.pendingViewport;
        this.pendingViewport = null;
        if (pending) this.flushViewport(pending, followDm);
      }, VIEWPORT_THROTTLE_MS - (now - this.lastBroadcastAt));
    }
  }

  private flushViewport(vp: ProjectorViewportTarget, followDm: boolean): void {
    this.lastBroadcastAt = Date.now();
    const msg: SyncMessage = {
      type: 'VIEWPORT_UPDATE',
      x: vp.x,
      y: vp.y,
      zoom: vp.scale,
      scale: vp.scale,
      follow_dm: followDm,
    };
    broadcastBattlematUpdate(msg);
    broadcastCompanionViewport({ x: vp.x, y: vp.y, zoom: vp.scale, followDm });
  }

  /** Cancel any pending throttled send (call from destroy hooks). */
  disposeViewportThrottle(): void {
    if (this.throttleTimer) {
      clearTimeout(this.throttleTimer);
      this.throttleTimer = null;
    }
    this.pendingViewport = null;
  }
}

export const projectorSyncService = new ProjectorSyncService();

// ── Player-safe token filtering ────────────────────────────────────────────

interface PlayerSafeToken {
  name?: string;
  x?: number;
  y?: number;
  isVisible?: boolean;
  hidden?: boolean;
  is_hidden?: boolean;
  stealth?: boolean;
  invisible?: boolean;
  isGmOnly?: boolean;
  is_gm_only?: boolean;
}

/**
 * Returns true only when a token is safe to render on the player-facing
 * projector canvas: excludes hidden / stealth / invisible / GM-only flagged
 * tokens and classic "(hidden)" / "[secret]" name markers.
 */
export function isTokenPlayerVisible(token: PlayerSafeToken): boolean {
  if (token.isVisible === false) return false;
  if (token.hidden === true || token.is_hidden === true) return false;
  if (token.stealth === true) return false;
  if (token.invisible === true) return false;
  if (token.isGmOnly === true || token.is_gm_only === true) return false;
  const name = (token.name ?? '').toLowerCase();
  if (name.includes('(hidden)') || name.includes('[secret]')) return false;
  return true;
}

export function filterPlayerVisibleTokens<T extends PlayerSafeToken>(tokens: T[]): T[] {
  return tokens.filter((t) => isTokenPlayerVisible(t));
}

/**
 * True when a token's grid cell lies outside the explored fog-of-war set.
 * An empty fog set is treated as "no fog data" so scenes without fog don't
 * blank the entire board.
 */
export function isTokenInUnexploredFog(
  token: { x?: number; y?: number },
  fogExplored: readonly string[]
): boolean {
  if (fogExplored.length === 0) return false;
  if (token.x === undefined || token.y === undefined) return false;
  return !fogExplored.includes(`${token.x},${token.y}`);
}