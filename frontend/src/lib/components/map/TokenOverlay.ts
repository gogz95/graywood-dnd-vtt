// TokenOverlay.ts — Token condition rings, animated turn reticles, and player-safe vitality states
// Renders condition badges directly onto token sprites for both DM workstation and projector screen.

export interface ConditionStyle {
  name: string;
  color: string;
  borderColor: string;
  icon: string;
}

export const CONDITION_REGISTRY: Record<string, ConditionStyle> = {
  Blinded: {
    name: 'Blinded',
    color: 'rgba(100, 116, 139, 0.4)',
    borderColor: '#94a3b8',
    icon: '👁️‍🗨️',
  },
  Charmed: {
    name: 'Charmed',
    color: 'rgba(236, 72, 153, 0.4)',
    borderColor: '#f472b6',
    icon: '💖',
  },
  Concentrating: {
    name: 'Concentrating',
    color: 'rgba(6, 182, 212, 0.4)',
    borderColor: '#22d3ee',
    icon: '🧠',
  },
  Poisoned: {
    name: 'Poisoned',
    color: 'rgba(132, 204, 22, 0.4)',
    borderColor: '#a3e635',
    icon: '🧪',
  },
  Restrained: {
    name: 'Restrained',
    color: 'rgba(217, 119, 6, 0.4)',
    borderColor: '#fbbf24',
    icon: '⛓️',
  },
  Stunned: {
    name: 'Stunned',
    color: 'rgba(234, 179, 8, 0.4)',
    borderColor: '#facc15',
    icon: '⚡',
  },
  Paralyzed: {
    name: 'Paralyzed',
    color: 'rgba(239, 68, 68, 0.4)',
    borderColor: '#f87171',
    icon: '🛑',
  },
  Frightened: {
    name: 'Frightened',
    color: 'rgba(168, 85, 247, 0.4)',
    borderColor: '#c084fc',
    icon: '😱',
  },
  Unconscious: {
    name: 'Unconscious',
    color: 'rgba(15, 23, 42, 0.8)',
    borderColor: '#ef4444',
    icon: '💀',
  },
};

export type VitalityState = 'Healthy' | 'Bloodied' | 'Critical' | 'Downed';

export interface VitalityInfo {
  state: VitalityState;
  label: string;
  badgeBg: string;
  textColor: string;
  borderColor: string;
}

/**
 * Calculates player-safe vitality state without exposing exact monster hit point numbers.
 */
export function getVitalityState(hp: number, maxHp: number): VitalityInfo {
  if (hp <= 0) {
    return {
      state: 'Downed',
      label: 'Downed',
      badgeBg: 'bg-rose-950/80',
      textColor: 'text-rose-400',
      borderColor: 'border-rose-700/60',
    };
  }

  const ratio = hp / (maxHp || 1);

  if (ratio <= 0.25) {
    return {
      state: 'Critical',
      label: 'Critical',
      badgeBg: 'bg-rose-950/60',
      textColor: 'text-rose-300',
      borderColor: 'border-rose-600/50',
    };
  }

  if (ratio <= 0.5) {
    return {
      state: 'Bloodied',
      label: 'Bloodied',
      badgeBg: 'bg-amber-950/60',
      textColor: 'text-amber-300',
      borderColor: 'border-amber-600/50',
    };
  }

  return {
    state: 'Healthy',
    label: 'Healthy',
    badgeBg: 'bg-emerald-950/60',
    textColor: 'text-emerald-300',
    borderColor: 'border-emerald-600/50',
  };
}

/**
 * Renders concentric condition status rings around a token on an HTML5 2D Canvas context.
 */
export function renderConditionRingsOnCanvas(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  tokenRadius: number,
  conditions: string[],
  timeSec = 0
): void {
  if (!conditions || conditions.length === 0) return;

  ctx.save();

  conditions.forEach((condName, index) => {
    const style = CONDITION_REGISTRY[condName] || {
      name: condName,
      color: 'rgba(99, 102, 241, 0.4)',
      borderColor: '#818cf8',
      icon: '✨',
    };

    const ringRadius = tokenRadius + 3 + index * 4.5;
    const pulse = condName === 'Concentrating' ? Math.sin(timeSec * 5) * 1.2 : 0;

    // Glowing condition ring
    ctx.beginPath();
    ctx.arc(centerX, centerY, ringRadius + pulse, 0, Math.PI * 2);
    ctx.strokeStyle = style.borderColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Condition icon pip at top
    const pipAngle = -Math.PI / 2 + index * (Math.PI / 3);
    const pipX = centerX + Math.cos(pipAngle) * (ringRadius + 2);
    const pipY = centerY + Math.sin(pipAngle) * (ringRadius + 2);

    ctx.font = '8px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(style.icon, pipX, pipY);
  });

  ctx.restore();
}

/**
 * Renders an animated glowing initiative turn reticle beneath the active combatant token.
 */
export function renderTurnReticleOnCanvas(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  tokenRadius: number,
  timeSec = 0
): void {
  ctx.save();

  const pulse = Math.sin(timeSec * 4) * 0.15; // 0.85 to 1.15 scale
  const reticleRadius = (tokenRadius + 8) * (1 + pulse);

  // Outer ambient glow ring
  const grad = ctx.createRadialGradient(
    centerX, centerY, tokenRadius * 0.8,
    centerX, centerY, reticleRadius + 6
  );
  grad.addColorStop(0, 'rgba(245, 158, 11, 0)');
  grad.addColorStop(0.7, 'rgba(245, 158, 11, 0.35)');
  grad.addColorStop(1, 'rgba(245, 158, 11, 0)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(centerX, centerY, reticleRadius + 6, 0, Math.PI * 2);
  ctx.fill();

  // Rotating dashed targeting ring
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 2.5;
  ctx.setLineDash([8, 6]);
  ctx.lineDashOffset = -timeSec * 30; // Clockwise rotation

  ctx.beginPath();
  ctx.arc(centerX, centerY, reticleRadius, 0, Math.PI * 2);
  ctx.stroke();

  // 4 Cardinal targeting notches
  ctx.setLineDash([]);
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 3;
  const notchLen = 7;

  // North
  ctx.beginPath();
  ctx.moveTo(centerX, centerY - reticleRadius - notchLen);
  ctx.lineTo(centerX, centerY - reticleRadius + 2);
  ctx.stroke();

  // South
  ctx.beginPath();
  ctx.moveTo(centerX, centerY + reticleRadius - 2);
  ctx.lineTo(centerX, centerY + reticleRadius + notchLen);
  ctx.stroke();

  // East
  ctx.beginPath();
  ctx.moveTo(centerX + reticleRadius - 2, centerY);
  ctx.lineTo(centerX + reticleRadius + notchLen, centerY);
  ctx.stroke();

  // West
  ctx.beginPath();
  ctx.moveTo(centerX - reticleRadius - notchLen, centerY);
  ctx.lineTo(centerX - reticleRadius + 2, centerY);
  ctx.stroke();

  ctx.restore();
}
