// src/lib/services/fogOfWarService.ts
// Dynamic Fog of War masking & 5e vision radius cuts

export interface VisionSource {
  x: number;
  y: number;
  brightRadiusPx: number;
  dimRadiusPx: number;
}

export type VisionPreset = 'blind' | 'torch' | 'darkvision' | 'light_cantrip';

export function getPresetRadii(preset: VisionPreset, pixelsPerSquare = 70): { bright: number; dim: number } {
  const sq = pixelsPerSquare / 5; // Pixels per foot
  switch (preset) {
    case 'torch':
      return { bright: 20 * sq, dim: 40 * sq };
    case 'darkvision':
      return { bright: 0, dim: 60 * sq };
    case 'light_cantrip':
      return { bright: 20 * sq, dim: 40 * sq };
    case 'blind':
    default:
      return { bright: 0, dim: 0 };
  }
}

export function renderFogMask(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sources: VisionSource[],
  isGmView = false
) {
  // Clear buffer
  ctx.save();
  ctx.clearRect(0, 0, width, height);

  // Fill black exploration shroud
  ctx.fillStyle = isGmView ? 'rgba(15, 23, 42, 0.65)' : 'rgba(2, 6, 23, 0.98)';
  ctx.fillRect(0, 0, width, height);

  // Cut out active vision sources
  ctx.globalCompositeOperation = 'destination-out';

  for (const src of sources) {
    if (src.dimRadiusPx <= 0) continue;

    const grad = ctx.createRadialGradient(
      src.x,
      src.y,
      Math.max(0, src.brightRadiusPx),
      src.x,
      src.y,
      src.dimRadiusPx
    );
    grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(src.x, src.y, src.dimRadiusPx, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
