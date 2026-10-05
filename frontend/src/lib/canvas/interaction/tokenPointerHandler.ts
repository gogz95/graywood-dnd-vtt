// frontend/src/lib/canvas/interaction/tokenPointerHandler.ts
// Token Elevation Wheel Interceptor & Pointer Handling Engine

import { stepElevationFeet, calculateDropShadowParams, getElevationBadge } from '../elevationEngine';
import { canvasStore, type CanvasToken } from '../../../stores/canvasStore.svelte';
import { tokenStore } from '../../stores/tokenStore.svelte';
import { updateTokenElevationVisuals } from '../tokenRenderer';

export interface TokenElevationWheelEventResult {
  intercepted: boolean;
  tokenId?: string;
  previousElevation?: number;
  newElevation?: number;
  badge?: {
    label: string;
    isElevated: boolean;
    isSubterranean: boolean;
    cssColor: string;
  };
  shadow?: {
    blur: number;
    offsetX: number;
    offsetY: number;
    alpha: number;
  };
}

/**
 * Intercepts WheelEvent when Alt key is pressed and cursor is hovering over an active/selected token.
 * Steps token elevation by +/- 5ft per wheel detent (deltaY < 0 = increase; deltaY > 0 = decrease),
 * clamping minimum to 0ft unless flagged as subterranean/burrowing.
 * Prevents event propagation to the camera zoom engine while Alt is engaged.
 */
export function handleTokenElevationWheel(
  event: WheelEvent,
  hoveredToken: CanvasToken | null | undefined
): TokenElevationWheelEventResult {
  // Only intercept when Alt is active and hovering over a token
  if (!event.altKey || !hoveredToken) {
    return { intercepted: false };
  }

  // Prevent camera zoom engine from handling this scroll event
  event.preventDefault();
  event.stopPropagation();

  // Determine direction: deltaY < 0 is scroll up (increase altitude), deltaY > 0 is scroll down (decrease altitude)
  const stepDirection = event.deltaY < 0 ? 5 : -5;
  const currentElevation = hoveredToken.elevation ?? 0;
  const isSubterranean = Boolean((hoveredToken as any).isSubterranean || (hoveredToken as any).subterranean || (hoveredToken as any).burrowing);
  const newElevation = stepElevationFeet(currentElevation, stepDirection, isSubterranean);

  // Update token store and canvasStore in real-time without pointer release
  canvasStore.updateToken?.(hoveredToken.id, { elevation: newElevation });
  tokenStore.updateTokenLocally?.(hoveredToken.id, { elevation: newElevation });
  hoveredToken.elevation = newElevation;

  const badge = getElevationBadge(newElevation);
  const shadow = calculateDropShadowParams(newElevation);

  return {
    intercepted: true,
    tokenId: hoveredToken.id,
    previousElevation: currentElevation,
    newElevation,
    badge,
    shadow,
  };
}

/**
 * Attaches a wheel listener on a token display object (Pixi Container, Interactive object, or HTML Element).
 * When Alt + Scroll is triggered, suppresses camera zoom, steps elevation by +/- 5ft (clamped to 0 unless subterranean),
 * and updates the token's elevation badge and drop-shadow in real time.
 */
export function attachTokenDisplayObjectWheelListener(
  displayObject: any,
  getToken: () => CanvasToken | null | undefined
): () => void {
  if (!displayObject) return () => {};

  const listener = (event: any) => {
    const raw = event.nativeEvent || event;
    if (raw.altKey || event.altKey) {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      if (typeof event.stopPropagation === 'function') event.stopPropagation();
      if (typeof raw.preventDefault === 'function') raw.preventDefault();
      if (typeof raw.stopPropagation === 'function') raw.stopPropagation();

      const tok = typeof getToken === 'function' ? getToken() : getToken;
      if (tok) {
        const result = handleTokenElevationWheel(raw as WheelEvent, tok);
        if (result.intercepted) {
          // Update Pixi container visual drop-shadow and floating badge
          if (typeof displayObject.addChild === 'function') {
            const rad = (tok as any).radius || ((tok as any).sizeInCells ? ((tok as any).sizeInCells * 25) : 25);
            updateTokenElevationVisuals(displayObject, result.newElevation ?? 0, rad);
          }

          if (displayObject.__elevationBadge && result.badge) {
            displayObject.__elevationBadge.text = result.badge.label;
            if (displayObject.__elevationBadge.style) {
              displayObject.__elevationBadge.style.fill = result.badge.cssColor;
            }
          }
          if (displayObject.__dropShadowFilter && result.shadow) {
            displayObject.__dropShadowFilter.blur = result.shadow.blur;
            displayObject.__dropShadowFilter.alpha = result.shadow.alpha;
          }
        }
      }
    }
  };

  if (typeof displayObject.on === 'function') {
    displayObject.on('wheel', listener);
    return () => {
      displayObject.off?.('wheel', listener);
    };
  } else if (typeof displayObject.addEventListener === 'function') {
    displayObject.addEventListener('wheel', listener, { passive: false });
    return () => {
      displayObject.removeEventListener?.('wheel', listener);
    };
  }

  return () => {};
}

