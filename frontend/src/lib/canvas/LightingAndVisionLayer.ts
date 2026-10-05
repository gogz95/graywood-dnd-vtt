// frontend/src/lib/canvas/LightingAndVisionLayer.ts
// PixiJS Light & Vision Rendering Pipeline
// Stencil mask clipping, light emission falloff (bright/dim/darkvision), ambient darkness, and explored shroud composition.

import { Container, Graphics, Sprite, Texture, RenderTexture, Application } from 'pixi.js';
import type { CanvasToken } from '../../stores/canvasStore.svelte';
import { lightingStore } from '../stores/lightingStore';
import { tokenVisionResolver, type TokenVisionProfile } from './TokenVisionResolver';
import { fogOfWarTextureManager } from './FogOfWarTextureManager';

export class LightingAndVisionLayer {
  public container: Container;
  private app: Application;
  private width: number;
  private height: number;
  private isDmView: boolean;

  // Render passes & layers
  private activeVisionMaskGraphics: Graphics;
  private darknessOverlay: Graphics;
  private lightEmissionContainer: Container;
  private exploredShroudContainer: Container;
  private exploredSprite: Sprite | null = null;

  constructor(app: Application, width: number, height: number, isDmView = false) {
    this.app = app;
    this.width = width;
    this.height = height;
    this.isDmView = isDmView;

    this.container = new Container();
    this.container.label = 'VTT_LightingAndVisionLayer';

    // 1. Explored Historical Shroud Layer (dimly lit explored areas)
    this.exploredShroudContainer = new Container();
    this.exploredShroudContainer.label = 'VTT_ExploredShroudLayer';
    this.container.addChild(this.exploredShroudContainer);

    // 2. Active Vision Mask (stencil/erase cutter for active line-of-sight)
    this.activeVisionMaskGraphics = new Graphics();
    this.activeVisionMaskGraphics.label = 'VTT_ActiveVisionMask';
    this.activeVisionMaskGraphics.blendMode = 'erase';

    // 3. Ambient Darkness Layer
    this.darknessOverlay = new Graphics();
    this.darknessOverlay.label = 'VTT_DarknessOverlay';
    this.container.addChild(this.darknessOverlay);
    this.darknessOverlay.addChild(this.activeVisionMaskGraphics);

    // 4. Light Emission Container (additive blending)
    this.lightEmissionContainer = new Container();
    this.lightEmissionContainer.label = 'VTT_LightEmissionContainer';
    this.lightEmissionContainer.blendMode = 'add';
    this.container.addChild(this.lightEmissionContainer);
  }

  public resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.updateDarknessRect();
  }

  private updateDarknessRect(): void {
    this.darknessOverlay.clear();

    if (!lightingStore.dynamicLightingEnabled) {
      return;
    }

    // Parse ambient hex color to number
    const colorHex = parseInt(lightingStore.ambientColor.replace('#', ''), 16) || 0x030712;
    const darknessAlpha = this.isDmView && lightingStore.gmVisionOverride
      ? 0.30 // 30% ghost shroud overlay for DM omniscience (Shift+V)
      : lightingStore.ambientDarkness;

    this.darknessOverlay
      .rect(0, 0, this.width, this.height)
      .fill({ color: colorHex, alpha: darknessAlpha });
  }

  /**
   * Main rendering pass executed on token movement, light changes, or environment cycles.
   */
  public renderLighting(tokens: CanvasToken[], cellPx = 70): void {
    if (!lightingStore.dynamicLightingEnabled) {
      this.darknessOverlay.visible = false;
      this.lightEmissionContainer.visible = false;
      return;
    }

    this.darknessOverlay.visible = true;
    this.lightEmissionContainer.visible = true;

    // 1. Refresh Darkness Rect
    this.updateDarknessRect();

    // 2. Clear previous active vision & light graphics
    this.activeVisionMaskGraphics.clear();
    this.lightEmissionContainer.removeChildren();

    // 3. Resolve vision profiles (Party vision for player screen, or active selection/all for DM)
    const partyProfiles = tokenVisionResolver.resolvePartyVision(tokens, cellPx, {
      minX: 0,
      minY: 0,
      maxX: this.width,
      maxY: this.height,
    });

    const activeProfiles = this.isDmView && !lightingStore.gmVisionOverride
      ? tokens.map((t) => tokenVisionResolver.resolveTokenVision(t, cellPx))
      : partyProfiles;

    // 4. Draw Active Line-of-Sight Mask Cutouts (Blend mode ERASE)
    for (const profile of activeProfiles) {
      if (profile.polygon.length < 3) continue;

      const flat: number[] = [];
      for (const [x, y] of profile.polygon) {
        flat.push(x, y);
      }

      this.activeVisionMaskGraphics
        .poly(flat)
        .fill({ color: 0xffffff, alpha: 1.0 });

      // Blit newly revealed polygon into persistent historical explored buffer
      if (profile.isPlayer) {
        fogOfWarTextureManager.blitExploredPolygon(profile.polygon);
      }

      // 5. Render Light Emission Falloff (Bright, Dim, Darkvision)
      this.renderTokenLightEmission(profile);
    }

    // 6. Update Explored Historical Shroud
    this.renderExploredShroud();
  }

  /**
   * Renders bright/dim light radial falloff and 60ft darkvision boost.
   */
  private renderTokenLightEmission(profile: TokenVisionProfile): void {
    const lightG = new Graphics();

    // Bright Light Emission (center full illumination)
    lightG
      .circle(profile.x, profile.y, profile.brightRadius)
      .fill({ color: 0xffbe76, alpha: 0.28 });

    // Dim Light Radial Boundary
    lightG
      .circle(profile.x, profile.y, profile.dimRadius)
      .fill({ color: 0xffbe76, alpha: 0.12 });

    // 60ft Darkvision in pitch blackness (subtle desaturated cyan tint)
    if (profile.hasDarkvision && lightingStore.darkvisionEnabled) {
      lightG
        .circle(profile.x, profile.y, profile.darkvisionRadius)
        .fill({ color: 0x93c5fd, alpha: 0.08 });
    }

    this.lightEmissionContainer.addChild(lightG);
  }

  /**
   * Renders the persistent explored shroud buffer (semi-transparent dark fog).
   */
  private renderExploredShroud(): void {
    const exploredCanvas = fogOfWarTextureManager.getCanvas();
    if (!exploredCanvas) return;

    this.exploredShroudContainer.removeChildren();

    // Semi-transparent dark shroud (rgba(10, 15, 30, 0.75))
    const shroudG = new Graphics();
    shroudG
      .rect(0, 0, this.width, this.height)
      .fill({ color: 0x0a0f1e, alpha: 0.75 });

    this.exploredShroudContainer.addChild(shroudG);
  }

  public destroy(): void {
    this.container.destroy({ children: true });
  }
}
