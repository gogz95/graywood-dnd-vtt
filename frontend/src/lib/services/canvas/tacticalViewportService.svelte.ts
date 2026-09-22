// src/lib/services/canvas/tacticalViewportService.svelte.ts
// Reactive camera viewport service projecting world-space coordinates to screen-space overlays.

export interface CameraState {
  panX: number;
  panY: number;
  zoom: number;
}

export class TacticalViewportService {
  panX = $state(0);
  panY = $state(0);
  zoom = $state(1.0);
  minZoom = 0.1;
  maxZoom = 6.0;

  // CSS transform strings
  matrixTransformCSS = $derived(
    `matrix(${this.zoom}, 0, 0, ${this.zoom}, ${this.panX}, ${this.panY})`
  );

  transformStyle = $derived(
    `transform: matrix(${this.zoom}, 0, 0, ${this.zoom}, ${this.panX}, ${this.panY}); transform-origin: 0 0;`
  );

  /**
   * Projects a pure world coordinate (px/units) to current screen-space pixels.
   */
  worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    return {
      x: worldX * this.zoom + this.panX,
      y: worldY * this.zoom + this.panY,
    };
  }

  /**
   * Unprojects screen-space cursor/touch coordinates to world-space coordinates.
   */
  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: (screenX - this.panX) / this.zoom,
      y: (screenY - this.panY) / this.zoom,
    };
  }

  /**
   * Translates the camera by screen-space pixel offsets.
   */
  panBy(deltaX: number, deltaY: number) {
    this.panX += deltaX;
    this.panY += deltaY;
  }

  /**
   * Smoothly zooms anchored at a screen-space focal point (e.g., mouse cursor or pinch midpoint).
   */
  zoomAt(factor: number, screenX: number, screenY: number) {
    const oldZoom = this.zoom;
    const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, oldZoom * factor));
    if (newZoom === oldZoom) return;

    // Preserve world coordinate under screen focal point
    const worldX = (screenX - this.panX) / oldZoom;
    const worldY = (screenY - this.panY) / oldZoom;

    this.panX = screenX - worldX * newZoom;
    this.panY = screenY - worldY * newZoom;
    this.zoom = newZoom;
  }

  /**
   * Manually sets the camera coordinates and zoom level.
   */
  setCamera(panX: number, panY: number, zoom: number) {
    this.panX = panX;
    this.panY = panY;
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
  }

  /**
   * Resets camera to center and fit a given battlemat dimension into the container.
   */
  fitToView(mapWidth: number, mapHeight: number, viewWidth: number, viewHeight: number) {
    if (mapWidth <= 0 || mapHeight <= 0 || viewWidth <= 0 || viewHeight <= 0) return;
    const scaleX = viewWidth / mapWidth;
    const scaleY = viewHeight / mapHeight;
    const fitZoom = Math.min(scaleX, scaleY, 1.0);
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, fitZoom));
    this.panX = (viewWidth - mapWidth * this.zoom) / 2;
    this.panY = (viewHeight - mapHeight * this.zoom) / 2;
  }
}

export const tacticalViewport = new TacticalViewportService();
