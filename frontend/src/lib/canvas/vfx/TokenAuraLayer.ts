// frontend/src/lib/canvas/vfx/TokenAuraLayer.ts
// Dynamic Token Aura Emanation Layer (Paladin Auras, Spirit Guardians)

export interface TokenAuraConfig {
  id: string;
  tokenId: string;
  name: string;
  radiusFeet: number; // e.g. 10, 15, 30 ft
  color: string; // e.g. 'rgba(251, 191, 36, 0.25)' (Paladin Gold), 'rgba(168, 85, 247, 0.25)' (Spirit Guardians)
  isHostileToEnemies?: boolean;
  isBeneficialToAllies?: boolean;
  saveBonus?: number; // Paladin Charisma bonus to all saves
  damageFormula?: string; // e.g. '3d8 radiant'
  movementPenaltyMultiplier?: number; // e.g. 0.5 for Spirit Guardians difficult terrain
}

export interface RenderedAuraInstance extends TokenAuraConfig {
  centerX: number;
  centerY: number;
  radiusPx: number;
}

export class TokenAuraLayerRenderer {
  public auras: TokenAuraConfig[] = [];

  public registerAura(config: TokenAuraConfig): void {
    this.auras = this.auras.filter((a) => a.id !== config.id);
    this.auras.push(config);
  }

  public removeAura(auraId: string): void {
    this.auras = this.auras.filter((a) => a.id !== auraId);
  }

  /**
   * Renders active token emanations with soft Hermite falloff and harmonic breathing.
   */
  public renderAuras(
    ctx: CanvasRenderingContext2D,
    tokens: Array<{ id: string; x: number; y: number; sizeInCells?: number; isVisible?: boolean }>,
    gridSize: number,
    feetPerGridCell: number = 5.0,
    timeMs: number = Date.now()
  ): void {
    if (this.auras.length === 0) return;

    ctx.save();
    const timeSec = timeMs * 0.001;

    for (const aura of this.auras) {
      const parentToken = tokens.find((t) => t.id === aura.tokenId);
      if (!parentToken || parentToken.isVisible === false) continue;

      const size = (parentToken.sizeInCells || 1) * gridSize;
      const centerX = parentToken.x * gridSize + size / 2;
      const centerY = parentToken.y * gridSize + size / 2;

      const baseRadiusPx = (aura.radiusFeet / feetPerGridCell) * gridSize;
      // Soft breathing pulse (±3% radius oscillation)
      const pulse = Math.sin(timeSec * 2.2 + centerX * 0.01) * 0.03 + 1.0;
      const radiusPx = baseRadiusPx * pulse;

      // Radial soft-falloff gradient matching AuraShaders GLSL curve
      const grad = ctx.createRadialGradient(
        centerX,
        centerY,
        radiusPx * 0.35, // Inner soft start
        centerX,
        centerY,
        radiusPx // Outer boundary
      );

      // Parse base color components
      const isGold = aura.color.includes('251') || aura.name.toLowerCase().includes('paladin');
      const rgbBase = isGold ? '245, 158, 11' : '168, 85, 247';

      grad.addColorStop(0, `rgba(${rgbBase}, 0.28)`);
      grad.addColorStop(0.7, `rgba(${rgbBase}, 0.16)`);
      grad.addColorStop(0.92, `rgba(${rgbBase}, 0.05)`);
      grad.addColorStop(1, `rgba(${rgbBase}, 0.0)`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radiusPx, 0, Math.PI * 2);
      ctx.fill();

      // Outer wave boundary ring
      ctx.strokeStyle = `rgba(${rgbBase}, 0.35)`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.lineDashOffset = -timeSec * 15;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radiusPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }
}
