// frontend/src/lib/canvas/VideoBackgroundRenderer.ts
// Animated Video Battlemap Playback Engine for PixiJS v8 / HTMLCanvas2D
// Manages HTMLVideoElement lifecycle, seamless looping, audio guarding, and GPU texture uploads.

import { Sprite, Texture } from 'pixi.js';

export interface VideoPlaybackOptions {
  loop?: boolean;
  muted?: boolean;
  playbackRate?: number;
  autoPlay?: boolean;
}

export class VideoBackgroundRenderer {
  private videoEl: HTMLVideoElement | null = null;
  private texture: Texture | null = null;
  private sprite: Sprite | null = null;
  private isDestroyed: boolean = false;
  private onFrameUpdate?: (video: HTMLVideoElement) => void;
  private contextLostHandler: (() => void) | null = null;
  private contextRestoredHandler: (() => void) | null = null;

  constructor(options?: { onFrameUpdate?: (video: HTMLVideoElement) => void }) {
    this.onFrameUpdate = options?.onFrameUpdate;
    this.bindContextListeners();
  }

  private bindContextListeners() {
    if (typeof window === 'undefined') return;
    this.contextLostHandler = () => {
      this.pause();
    };
    this.contextRestoredHandler = () => {
      if (this.videoEl && !this.isDestroyed) {
        try {
          this.texture = Texture.from(this.videoEl);
          if (this.sprite) {
            this.sprite.texture = this.texture;
          }
        } catch (_) {}
        this.play().catch(() => {});
      }
    };

    window.addEventListener('webglcontextlost', this.contextLostHandler);
    window.addEventListener('webglcontextrestored', this.contextRestoredHandler);
  }

  /**
   * Initializes or binds an HTMLVideoElement for video battlemap playback.
   * Ensures audio is strictly muted by default to prevent audio bleed over the soundboard.
   */
  public loadVideo(
    videoSource: string | HTMLVideoElement,
    options: VideoPlaybackOptions = {},
  ): Promise<HTMLVideoElement> {
    return new Promise((resolve, reject) => {
      this.cleanup();

      const {
        loop = true,
        muted = true, // Strict guard: muted by default
        playbackRate = 1.0,
        autoPlay = true,
      } = options;

      let el: HTMLVideoElement;
      if (typeof videoSource === 'string') {
        el = document.createElement('video');
        el.src = videoSource;
        el.crossOrigin = 'anonymous';
        el.playsInline = true;
      } else {
        el = videoSource;
      }

      el.loop = loop;
      el.muted = muted;
      el.playbackRate = playbackRate;
      el.autoplay = autoPlay;

      el.onloadedmetadata = () => {
        if (this.isDestroyed) return;

        try {
          // Bind video texture using PixiJS Texture source
          this.texture = Texture.from(el);
          this.sprite = new Sprite(this.texture);
          this.sprite.label = 'VTT_VideoMapBackground';
        } catch (err) {
          console.warn('[VideoBackgroundRenderer] PixiJS Texture.from(video) fallback to element:', err);
        }

        if (autoPlay) {
          el.play().catch((playErr) => {
            console.warn('[VideoBackgroundRenderer] Autoplay prevented by browser policy:', playErr);
          });
        }

        this.videoEl = el;
        resolve(el);
      };

      el.onerror = () => {
        reject(new Error(`Failed to load video battlemap from source`));
      };

      // If already ready
      if (el.readyState >= 2) {
        el.onloadedmetadata(new Event('loadedmetadata'));
      }
    });
  }

  /**
   * Gets the created PixiJS sprite holding the video texture.
   */
  public getSprite(): Sprite | null {
    return this.sprite;
  }

  /**
   * Gets the underlying HTMLVideoElement.
   */
  public getVideoElement(): HTMLVideoElement | null {
    return this.videoEl;
  }

  /**
   * Seamless playback loop controls: play
   */
  public play(): Promise<void> {
    if (this.videoEl) {
      return this.videoEl.play();
    }
    return Promise.resolve();
  }

  /**
   * Seamless playback loop controls: pause
   */
  public pause(): void {
    if (this.videoEl) {
      this.videoEl.pause();
    }
  }

  /**
   * Seamless playback loop controls: seek to time in seconds
   */
  public seek(timeSeconds: number): void {
    if (this.videoEl && Number.isFinite(timeSeconds)) {
      this.videoEl.currentTime = Math.max(0, Math.min(this.videoEl.duration || 0, timeSeconds));
    }
  }

  /**
   * Seamless playback loop controls: mute toggle
   */
  public setMuted(muted: boolean): void {
    if (this.videoEl) {
      this.videoEl.muted = muted;
    }
  }

  /**
   * Checks whether the video element is actively playing.
   */
  public isPlaying(): boolean {
    return !!(this.videoEl && !this.videoEl.paused && !this.videoEl.ended && this.videoEl.readyState > 2);
  }

  /**
   * Renders the current video frame to an HTML5 2D Canvas context (fallback/hybrid renderer).
   */
  public renderToCanvas2D(
    ctx: CanvasRenderingContext2D,
    dx: number = 0,
    dy: number = 0,
    dWidth?: number,
    dHeight?: number,
  ): void {
    if (this.videoEl && this.videoEl.readyState >= 2) {
      const w = dWidth ?? this.videoEl.videoWidth;
      const h = dHeight ?? this.videoEl.videoHeight;
      ctx.drawImage(this.videoEl, dx, dy, w, h);
      this.onFrameUpdate?.(this.videoEl);
    }
  }

  /**
   * Cleans up textures and stops media playback without memory leak.
   */
  public cleanup(): void {
    if (this.videoEl) {
      this.videoEl.pause();
      this.videoEl.removeAttribute('src');
      this.videoEl.load();
      this.videoEl = null;
    }
    if (this.sprite) {
      this.sprite.destroy({ children: true });
      this.sprite = null;
    }
    if (this.texture) {
      this.texture.destroy(true);
      this.texture = null;
    }
  }

  /**
   * Complete destruction of the renderer.
   */
  public destroy(): void {
    this.isDestroyed = true;
    if (typeof window !== 'undefined') {
      if (this.contextLostHandler) {
        window.removeEventListener('webglcontextlost', this.contextLostHandler);
      }
      if (this.contextRestoredHandler) {
        window.removeEventListener('webglcontextrestored', this.contextRestoredHandler);
      }
    }
    this.cleanup();
  }
}
