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
  private darknessContainer: Container;
  private darknessBaseGraphics: Graphics;
  private darknessCutoutGraphics: Graphics;
  private lightEmissionContainer: Container;
  private exploredShroudContainer: Container;
  private shroudBaseGraphics: Graphics;
  private shroudCutoutGraphics: Graphics;

  constructor(app: Application, width: number, height: number, isDmView = false) {
    this.app = app;
    this.width = width;
    this.height = height;
    this.isDmView = isDmView;

    this.container = new Container();
    this.container.label = 'VTT_LightingAndVisionLayer';

    // 1. Explored Historical Shroud Layer (dimly lit explored areas)
    this.exploredShroudContainer = new Container({ isRenderGroup: true });
    this.exploredShroudContainer.label = 'VTT_ExploredShroudLayer';
    this.container.addChild(this.exploredShroudContainer);

    this.shroudBaseGraphics = new Graphics();
    this.shroudCutoutGraphics = new Graphics();
    this.shroudCutoutGraphics.blendMode = 'erase';
    this.exploredShroudContainer.addChild(this.shroudBaseGraphics);
    this.exploredShroudContainer.addChild(this.shroudCutoutGraphics);

    // 2. Ambient Darkness Layer (unexplored pitch black)
    this.darknessContainer = new Container({ isRenderGroup: true });
    this.darknessContainer.label = 'VTT_DarknessOverlay';
    this.container.addChild(this.darknessContainer);

    this.darknessBaseGraphics = new Graphics();
    this.darknessCutoutGraphics = new Graphics();
    this.darknessCutoutGraphics.blendMode = 'erase';
    this.activeVisionMaskGraphics = new Graphics();
    this.activeVisionMaskGraphics.blendMode = 'erase';

    this.darknessContainer.addChild(this.darknessBaseGraphics);
    this.darknessContainer.addChild(this.darknessCutoutGraphics);
    this.darknessContainer.addChild(this.activeVisionMaskGraphics);

    // 3. Light Emission Container (additive blending: bright/dim/darkvision)
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
    this.darknessBaseGraphics.clear();
    this.shroudBaseGraphics.clear();

    if (!lightingStore.dynamicLightingEnabled) {
      return;
    }

    // Parse ambient hex color to number
    const colorHex = parseInt(lightingStore.ambientColor.replace('#', ''), 16) || 0x030712;
    const darknessAlpha = this.isDmView && lightingStore.gmVisionOverride
      ? 0.30 // 30% ghost shroud overlay for DM omniscience (Shift+V)
      : lightingStore.ambientDarkness;

    // Pitch black darkness rectangle
    this.darknessBaseGraphics
      .rect(0, 0, this.width, this.height)
      .fill({ color: colorHex, alpha: darknessAlpha });

    // Semi-transparent dark fog shroud (rgba(10, 15, 30, 0.75))
    this.shroudBaseGraphics
      .rect(0, 0, this.width, this.height)
      .fill({ color: 0x0a0f1e, alpha: 0.75 });
  }

  /**
   * Main rendering pass executed on token movement, light changes, or environment cycles.
   */
  public renderLighting(tokens: any[], cellPx = 50): void {
    if (!lightingStore.dynamicLightingEnabled) {
      this.darknessContainer.visible = false;
      this.exploredShroudContainer.visible = false;
      this.lightEmissionContainer.visible = false;
      return;
    }

    this.darknessContainer.visible = true;
    this.exploredShroudContainer.visible = true;
    this.lightEmissionContainer.visible = true;

    // 1. Refresh base rectangles
    this.updateDarknessRect();

    // 2. Clear per-frame active masks & light emissions
    this.activeVisionMaskGraphics.clear();
    this.shroudCutoutGraphics.clear();
    this.lightEmissionContainer.removeChildren();

    // 3. Resolve vision profiles (party vision vs DM omniscience)
    const partyProfiles = tokenVisionResolver.resolvePartyVision(tokens, cellPx, {
      minX: 0,
      minY: 0,
      maxX: this.width,
      maxY: this.height,
    });

    const activeProfiles = this.isDmView && !lightingStore.gmVisionOverride
      ? tokens.map((t) => tokenVisionResolver.resolveTokenVision(t, cellPx))
      : partyProfiles;

    // 4. Cut out active vision polygons and blit to explored buffer
    for (const profile of activeProfiles) {
      if (profile.polygon.length < 3) continue;

      const flat: number[] = [];
      for (const [x, y] of profile.polygon) {
        flat.push(x, y);
      }

      // Erase from pitch-black darkness
      this.activeVisionMaskGraphics
        .poly(flat)
        .fill({ color: 0xffffff, alpha: 1.0 });

      // Erase from 0.75 shroud (active LoS is 100% visible)
      this.shroudCutoutGraphics
        .poly(flat)
        .fill({ color: 0xffffff, alpha: 1.0 });

      // Record to persistent explored cutout and Dexie manager
      this.darknessCutoutGraphics
        .poly(flat)
        .fill({ color: 0xffffff, alpha: 1.0 });

      if (profile.isPlayer) {
        fogOfWarTextureManager.blitExploredPolygon(profile.polygon);
      }

      // 5. Render Bright/Dim/Darkvision light emissions
      this.renderTokenLightEmission(profile);
    }
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

    // Dim Light Radial Boundary (0.5 exposure falloff)
    lightG
      .circle(profile.x, profile.y, profile.dimRadius)
      .fill({ color: 0xffbe76, alpha: 0.12 });

    // 60ft Darkvision in pitch blackness (subtle desaturated cyan boost)
    if (profile.hasDarkvision && lightingStore.darkvisionEnabled) {
      lightG
        .circle(profile.x, profile.y, profile.darkvisionRadius)
        .fill({ color: 0x93c5fd, alpha: 0.08 });
    }

    this.lightEmissionContainer.addChild(lightG);
  }

  public destroy(): void {
    this.container.destroy({ children: true });
  }
}
