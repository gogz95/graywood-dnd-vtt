// src/lib/canvas/tokenRenderer.ts
// Complete Tactical Token Renderer: Condition Perimeter Rings, Distance Auras, Vitality Pips & Turn Reticle.

import { CONDITION_REGISTRY, getVitalityState, renderTargetingReticleOnCanvas } from '../components/map/TokenOverlay';

export interface TokenAura {
  radiusFeet: number;
  color: string;
  opacity: number;
  pulse?: boolean;
}

export interface RenderableToken {
  id: string;
  name: string;
  x: number; // grid coordinates
  y: number;
  size?: number; // grid cell footprint (default 1)
  hp: number;
  maxHp: number;
  tempHp?: number;
  ac?: number;
  color?: string;
  isPlayer: boolean;
  isVisible?: boolean;
  isOrbSealed?: boolean;
  conditions: string[];
  aura?: TokenAura;
}

/**
 * Draws a radial translucent aura around a token pinned to its center.
 */
export function drawTokenAura(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  aura: TokenAura,
  gridSize: number,
  animTime = 0
) {
  const radiusPx = (aura.radiusFeet / 5) * gridSize;
  const pulseFactor = aura.pulse ? 1 + Math.sin(animTime * 2.5) * 0.04 : 1;
  const finalRadius = radiusPx * pulseFactor;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, finalRadius, 0, Math.PI * 2);

  // Parse color and apply opacity
  ctx.fillStyle = aura.color;
  ctx.globalAlpha = aura.opacity;
  ctx.fill();

  // Subtle boundary stroke
  ctx.strokeStyle = aura.color;
  ctx.globalAlpha = Math.min(1, aura.opacity * 2);
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.restore();
}

/**
 * Renders status condition badges dynamically along the outer perimeter of the token frame.
 */
export function drawConditionPerimeterBadges(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  conditions: string[],
  animTime = 0
) {
  if (!conditions || conditions.length === 0) return;

  const validConditions = conditions
    .map((c) => {
      const baseName = c.split(' ')[0];
      return CONDITION_REGISTRY[baseName] || {
        name: c,
        color: 'rgba(239, 68, 68, 0.4)',
        borderColor: '#ef4444',
        icon: '⚠️'
      };
    });

  const count = validConditions.length;
  const badgeRadius = Math.max(8, radius * 0.3);
  const orbitDistance = radius + badgeRadius * 0.7;

  // Distribute evenly along the perimeter with a gentle continuous rotation
  const baseAngle = animTime * 0.4;
  const angleStep = (Math.PI * 2) / count;

  for (let i = 0; i < count; i++) {
    const angle = baseAngle + i * angleStep;
    const bx = cx + Math.cos(angle) * orbitDistance;
    const by = cy + Math.sin(angle) * orbitDistance;
    const cond = validConditions[i];

    ctx.save();
    // Badge circular backdrop
    ctx.beginPath();
    ctx.arc(bx, by, badgeRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#090d16';
    ctx.fill();
    ctx.strokeStyle = cond.borderColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Condition icon or emoji
    ctx.font = `${Math.round(badgeRadius * 1.1)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cond.icon, bx, by + 0.5);
    ctx.restore();
  }
}

/**
 * Master Tactical Token Renderer.
 * Draws token body, condition badges, distance aura, HP bar or vitality pip.
 */
export function renderTacticalToken(
  ctx: CanvasRenderingContext2D,
  tok: RenderableToken,
  gridSize: number,
  zoom = 1.0,
  animTime = 0,
  isActiveTurn = false,
  isTargeted = false
) {
  if (tok.isVisible === false) return;

  const footprint = tok.size || 1;
  const pad = gridSize * 0.08;
  const widthPx = footprint * gridSize - pad * 2;
  const heightPx = footprint * gridSize - pad * 2;
  const x = tok.x * gridSize + pad;
  const y = tok.y * gridSize + pad;
  const cx = x + widthPx / 2;
  const cy = y + heightPx / 2;
  const radius = Math.min(widthPx, heightPx) / 2;

  // 1. Draw Distance Aura (underneath token)
  if (tok.aura && tok.aura.radiusFeet > 0) {
    drawTokenAura(ctx, cx, cy, tok.aura, gridSize, animTime);
  }

  // 2. Draw Active Turn Reticle if active
  if (isActiveTurn) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.35, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)';
    ctx.lineWidth = 2.5 / zoom;
    ctx.setLineDash([6, 6]);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.2, 0, Math.PI * 2);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.2 / zoom;
    ctx.setLineDash([]);
    ctx.stroke();
    ctx.restore();
  }

  // 2b. Draw Targeting Reticle if targeted
  if (isTargeted) {
    renderTargetingReticleOnCanvas(ctx, cx, cy, radius, animTime);
  }

  // 3. Stowed / Black Orb State
  if (tok.isOrbSealed) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#1e1b4b';
    ctx.fill();
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 2.5 / zoom;
    ctx.stroke();

    ctx.font = `bold ${Math.max(14, gridSize * 0.35)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🔮', cx, cy);
    ctx.restore();
    return;
  }

  // 4. Token Circular Body
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = tok.color || (tok.isPlayer ? '#4338ca' : '#991b1b');
  ctx.fill();

  // Border (Amber for Player, Crimson for Monster)
  ctx.strokeStyle = tok.isPlayer ? '#fbbf24' : '#ef4444';
  ctx.lineWidth = 2.2 / zoom;
  ctx.stroke();

  // 5. Token Initials
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.max(11, gridSize * 0.26)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const initials = tok.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  ctx.fillText(initials, cx, cy - 2);

  // 6. Player HP Bar vs. Monster Vitality Pip
  if (tok.isPlayer) {
    const barW = widthPx * 0.85;
    const barH = Math.max(3, gridSize * 0.08);
    const barX = cx - barW / 2;
    const barY = cy + radius - barH - 4;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(barX, barY, barW, barH);

    const pct = Math.max(0, Math.min(1, tok.hp / (tok.maxHp || 1)));
    ctx.fillStyle = pct <= 0.25 ? '#ef4444' : pct <= 0.5 ? '#f59e0b' : '#22c55e';
    ctx.fillRect(barX, barY, barW * pct, barH);
  } else {
    const vit = getVitalityState(tok.hp, tok.maxHp);
    const pipColor = vit.state === 'Healthy' ? '#22c55e' : vit.state === 'Bloodied' ? '#f59e0b' : '#ef4444';
    ctx.beginPath();
    ctx.arc(cx, cy + radius - 6, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = pipColor;
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.restore();

  // 7. Perimeter Condition Badges (Orbiting outside token)
  drawConditionPerimeterBadges(ctx, cx, cy, radius, tok.conditions, animTime);
}
