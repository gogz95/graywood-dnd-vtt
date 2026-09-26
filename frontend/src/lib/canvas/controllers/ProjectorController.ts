// frontend/src/lib/canvas/controllers/ProjectorController.ts
// Dedicated Projector / TV camera controller.
// Pure imperative camera control — no Svelte stores, no UI wiring.

import type { ViewportController } from './ViewportController';
import type { TokenController } from './TokenController';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProjectorSyncCommand = 'focus_active_turn' | 'lock_stage';

export interface FocusActiveTurnPayload {
  /** Token ids participating in the active turn (e.g. current combatant + targets). */
  tokenIds: string[];
}

export interface LockStagePayload {
  /** Explicit world-space bounds to lock the camera to. */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  padding?: number;
}

export interface ProjectorControllerOptions {
  /** Default padding (world-space pixels) added around framed bounds. */
  defaultPadding?: number;
  /** Lerp speed override (0..1). Falls back to ViewportController's lerpFactor. */
  lerpFactor?: number;
}

// ── Controller ────────────────────────────────────────────────────────────────

export class ProjectorController {
  private viewport: ViewportController;
  private tokens: TokenController;
  private defaultPadding: number;

  // Ongoing tween state
  private tweenActive: boolean = false;
  private tweenStartTime: number = 0;
  private tweenDuration: number = 600; // ms

  private tweenFromX: number = 0;
  private tweenFromY: number = 0;
  private tweenFromZoom: number = 1;

  private tweenToX: number = 0;
  private tweenToY: number = 0;
  private tweenToZoom: number = 1;

  private animFrameId: number | null = null;

  constructor(
    viewport: ViewportController,
    tokens: TokenController,
    opts: ProjectorControllerOptions = {},
  ) {
    this.viewport = viewport;
    this.tokens = tokens;
    this.defaultPadding = opts.defaultPadding ?? 80;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Frames the given world-space bounding box within the current screen.
   * Calculates the optimal zoom and center, then lerps the viewport there.
   *
   * @param minX      Left edge of the bounding box in world coordinates.
   * @param minY      Top edge.
   * @param maxX      Right edge.
   * @param maxY      Bottom edge.
   * @param padding   Extra world-space margin around the bounds (default: defaultPadding).
   * @param durationMs Animation duration in ms (default: 600ms).
   */
  public frameBounds(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    padding: number = this.defaultPadding,
    durationMs: number = 600,
  ): void {
    const screen = this.viewport.getScreenSize();

    // Expand bounds by padding in world-space.
    const pMinX = minX - padding;
    const pMinY = minY - padding;
    const pMaxX = maxX + padding;
    const pMaxY = maxY + padding;

    const boundsW = pMaxX - pMinX;
    const boundsH = pMaxY - pMinY;

    // Degenerate guard — single point or zero-area box.
    const safeW = boundsW < 1 ? 1 : boundsW;
    const safeH = boundsH < 1 ? 1 : boundsH;

    // Fit-zoom: pick the smaller scale so the full bounds fit on screen.
    const zoomX = screen.width / safeW;
    const zoomY = screen.height / safeH;
    const targetZoom = Math.max(
      this.viewport.minZoom,
      Math.min(this.viewport.maxZoom, Math.min(zoomX, zoomY)),
    );

    // World-space center of the padded bounding box.
    const worldCenterX = (pMinX + pMaxX) / 2;
    const worldCenterY = (pMinY + pMaxY) / 2;

    // Screen-space target pan: center the world point on screen at targetZoom.
    const targetX = screen.width / 2 - worldCenterX * targetZoom;
    const targetY = screen.height / 2 - worldCenterY * targetZoom;

    this._startTween(targetX, targetY, targetZoom, durationMs);
  }

  /**
   * Queries `TokenController` for the bounding box of the specified tokens,
   * then calls `frameBounds`. No-ops silently if no matching tokens are found.
   *
   * @param tokenIds   List of canvas token instance ids to frame.
   * @param padding    World-space padding (optional, defaults to `defaultPadding`).
   * @param durationMs Animation duration in ms.
   */
  public frameTokens(
    tokenIds: string[],
    padding: number = this.defaultPadding,
    durationMs: number = 600,
  ): void {
    const bounds = this.tokens.getTokenBounds(tokenIds);
    if (!bounds) return;
    this.frameBounds(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, padding, durationMs);
  }

  /**
   * WebSocket sync entry-point for the Projector/TV display client.
   * Wire this into the WS router exclusively on projector clients.
   *
   * Supported commands:
   *  - `focus_active_turn`: Frame the tokens listed in payload.tokenIds.
   *  - `lock_stage`:        Frame the explicit world bounds in the payload.
   */
  public handleSyncCommand(
    command: ProjectorSyncCommand,
    payload: FocusActiveTurnPayload | LockStagePayload,
  ): void {
    switch (command) {
      case 'focus_active_turn': {
        const p = payload as FocusActiveTurnPayload;
        if (Array.isArray(p.tokenIds) && p.tokenIds.length > 0) {
          this.frameTokens(p.tokenIds);
        }
        break;
      }

      case 'lock_stage': {
        const p = payload as LockStagePayload;
        this.frameBounds(p.minX, p.minY, p.maxX, p.maxY, p.padding);
        break;
      }
    }
  }

  /**
   * Cancels any in-progress camera tween and releases the rAF handle.
   */
  public cancelTween(): void {
    this.tweenActive = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  /** Releases all resources held by this controller. */
  public destroy(): void {
    this.cancelTween();
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Starts an rAF-driven lerp tween from the current viewport position to
   * the target pan and zoom.
   */
  private _startTween(
    toX: number,
    toY: number,
    toZoom: number,
    durationMs: number,
  ): void {
    this.cancelTween();

    this.tweenFromX = this.viewport.targetX;
    this.tweenFromY = this.viewport.targetY;
    this.tweenFromZoom = this.viewport.zoomLevel;

    this.tweenToX = toX;
    this.tweenToY = toY;
    this.tweenToZoom = toZoom;

    this.tweenDuration = durationMs > 0 ? durationMs : 1;
    this.tweenStartTime = performance.now();
    this.tweenActive = true;

    this._tick();
  }

  private _tick = (): void => {
    if (!this.tweenActive) return;

    const elapsed = performance.now() - this.tweenStartTime;
    const t = Math.min(elapsed / this.tweenDuration, 1);
    const ease = _easeInOutCubic(t);

    // Write directly to the viewport's target fields so its own lerp loop
    // picks up the animated target each frame.
    this.viewport.targetX = _lerp(this.tweenFromX, this.tweenToX, ease);
    this.viewport.targetY = _lerp(this.tweenFromY, this.tweenToY, ease);
    this.viewport.zoomLevel = _lerp(this.tweenFromZoom, this.tweenToZoom, ease);

    if (t < 1) {
      this.animFrameId = requestAnimationFrame(this._tick);
    } else {
      // Snap to exact target at end.
      this.viewport.targetX = this.tweenToX;
      this.viewport.targetY = this.tweenToY;
      this.viewport.zoomLevel = this.tweenToZoom;
      this.tweenActive = false;
      this.animFrameId = null;
    }
  };
}

// ── Pure math helpers (module-private) ────────────────────────────────────────

function _lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Smooth cubic ease-in-out: t ∈ [0,1] → [0,1]. */
function _easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}
