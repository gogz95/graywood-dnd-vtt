// frontend/src/lib/canvas/interaction/tokenPointerHandler.ts
// Token Elevation Wheel Interceptor & Pointer Handling Engine

import { stepElevationFeet, calculateDropShadowParams, getElevationBadge } from '../elevationEngine';
import { canvasStore, type CanvasToken } from '../../../stores/canvasStore.svelte';
import { tokenStore } from '../../stores/tokenStore.svelte';

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
 * clamping between -100 ft and +500 ft.
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
  const newElevation = stepElevationFeet(currentElevation, stepDirection);

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
