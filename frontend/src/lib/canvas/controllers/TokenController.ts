// frontend/src/lib/canvas/controllers/TokenController.ts
// Pure TypeScript TokenController for PixiJS v8.
// Framework-agnostic: zero Svelte runes or Svelte store imports.

import { Container, Graphics, Sprite, Text, Assets } from 'pixi.js';

export interface CanvasTokenData {
  id: string;
  name?: string;
  imageUrl?: string;
  x: number;
  y: number;
  size?: number;
  elevation?: number;
  color?: string;
  label?: string;
  [key: string]: any;
}

interface TokenEntry {
  container: Container;
  data: CanvasTokenData;
  sprite?: Sprite;
}

export class TokenController {
  public tokenLayer: Container;
  private tokenMap: Map<string, TokenEntry> = new Map();
  private parentContainer: Container;

  constructor(parent: Container) {
    this.parentContainer = parent;
    this.tokenLayer = new Container();
    this.tokenLayer.label = 'VTT_TokenLayer';
    this.tokenLayer.sortableChildren = true;

    const world = parent.label === 'VTT_WorldContainer'
      ? parent
      : (parent.getChildByLabel?.('VTT_WorldContainer') || parent);
    world.addChild(this.tokenLayer);
  }

  /**
   * Adds or replaces a token container with base shape, texture sprite, and label.
   */
  public addToken(tokenData: CanvasTokenData): Container {
    if (this.tokenMap.has(tokenData.id)) {
      this.removeToken(tokenData.id);
    }

    const container = new Container();
    container.label = `Token_${tokenData.id}`;
    container.position.set(tokenData.x, tokenData.y);

    const elevation = tokenData.elevation ?? 0;
    // Z-sorting formula: container.zIndex = elevation * 1000 + y
    container.zIndex = elevation * 1000 + tokenData.y;

    const size = tokenData.size ?? 60;
    const radius = size / 2;

    // Base circular backing
    const baseColor = tokenData.color ? parseInt(tokenData.color.replace('#', ''), 16) : 0x3b82f6;
    const baseG = new Graphics();
    baseG.circle(0, 0, radius)
      .fill({ color: isNaN(baseColor) ? 0x3b82f6 : baseColor })
      .stroke({ color: 0xffffff, width: 2, alpha: 0.9 });
    container.addChild(baseG);

    let tokenSprite: Sprite | undefined;

    if (tokenData.imageUrl) {
      Assets.load(tokenData.imageUrl)
        .then((texture) => {
          if (!this.tokenMap.has(tokenData.id)) return;

          tokenSprite = new Sprite(texture);
          tokenSprite.anchor.set(0.5);
          tokenSprite.width = size;
          tokenSprite.height = size;

          const maskG = new Graphics();
          maskG.circle(0, 0, radius).fill({ color: 0xffffff });
          container.addChild(maskG);
          tokenSprite.mask = maskG;

          container.addChild(tokenSprite);
        })
        .catch((err) => {
          console.warn(`[TokenController] Failed loading token texture for ${tokenData.id}:`, err);
        });
    }

    if (tokenData.name || tokenData.label) {
      const text = new Text({
        text: tokenData.name || tokenData.label || '',
        style: {
          fontSize: 12,
          fill: 0xffffff,
          stroke: { color: 0x000000, width: 3 },
          align: 'center',
        },
      });
      text.anchor.set(0.5, 0);
      text.position.set(0, radius + 2);
      container.addChild(text);
    }

    this.tokenLayer.addChild(container);
    this.tokenMap.set(tokenData.id, { container, data: tokenData, sprite: tokenSprite });

    return container;
  }

  /**
   * Updates an existing token's position and recalculates its z-order.
   */
  public updateTokenPosition(id: string, x: number, y: number, elevation: number = 0): void {
    const entry = this.tokenMap.get(id);
    if (!entry) return;

    entry.data.x = x;
    entry.data.y = y;
    entry.data.elevation = elevation;

    entry.container.position.set(x, y);
    // Z-sorting formula: container.zIndex = elevation * 1000 + y
    entry.container.zIndex = elevation * 1000 + y;
  }

  /**
   * Removes a token from the display hierarchy and destroys its container.
   */
  public removeToken(id: string): void {
    const entry = this.tokenMap.get(id);
    if (!entry) return;

    this.tokenLayer.removeChild(entry.container);
    entry.container.destroy({ children: true, texture: false });
    this.tokenMap.delete(id);
  }

  public getToken(id: string): Container | undefined {
    return this.tokenMap.get(id)?.container;
  }

  public getAllTokenIds(): string[] {
    return Array.from(this.tokenMap.keys());
  }

  public clearTokens(): void {
    const ids = Array.from(this.tokenMap.keys());
    for (const id of ids) {
      this.removeToken(id);
    }
  }

  /**
   * Deep destroy of the token layer container and all child sprites/graphics.
   */
  public destroy(): void {
    this.clearTokens();
    this.tokenLayer.destroy({ children: true });
    this.tokenMap.clear();
  }
}
