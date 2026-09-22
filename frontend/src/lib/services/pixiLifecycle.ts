// src/lib/services/pixiLifecycle.ts
// PixiJS Texture & Container Lifecycle Manager for GPU VRAM garbage collection

import * as PIXI from 'pixi.js';

class PixiLifecycleManager {
  private activeTextures = new Set<string>();

  registerTexture(url: string) {
    this.activeTextures.add(url);
  }

  purgeFloorContainer(container: PIXI.Container, purgeTextures = true) {
    container.children.forEach((child) => {
      if (child instanceof PIXI.Sprite && purgeTextures && child.texture) {
        const texture = child.texture;
        child.destroy({ children: true });
        if (texture.source) {
          texture.destroy(true);
        }
      } else {
        child.destroy({ children: true });
      }
    });

    container.removeChildren();
  }

  purgeUnusedTextures() {
    this.activeTextures.forEach((url) => {
      if (PIXI.Assets.cache.has(url)) {
        PIXI.Assets.unload(url);
      }
    });
    this.activeTextures.clear();
  }

  handleContextLoss(app: PIXI.Application, onRestored: () => void) {
    const canvas = app.canvas;
    if (!canvas) return;

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      console.warn('WebGL Context Lost. Halting render loop...');
      app.stop();
    });

    canvas.addEventListener('webglcontextrestored', () => {
      console.info('WebGL Context Restored. Rebuilding scene buffers...');
      this.purgeUnusedTextures();
      app.start();
      onRestored();
    });
  }
}

export const pixiLifecycle = new PixiLifecycleManager();
