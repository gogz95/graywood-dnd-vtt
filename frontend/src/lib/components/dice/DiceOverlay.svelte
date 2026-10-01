<!-- frontend/src/lib/components/dice/DiceOverlay.svelte -->
<!-- 3D Polyhedral Dice Physics Simulation Canvas & Upward Face Detection Hook -->

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { systemBus } from '$lib/services/systemBus';
  import { parseAndEvaluateDice, type ParsedRollResult } from '$lib/services/diceParser';

  interface PhysicsDie {
    id: string;
    sides: number;
    targetValue: number;
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    rotX: number;
    rotY: number;
    rotZ: number;
    vRotX: number;
    vRotY: number;
    vRotZ: number;
    isResting: boolean;
    color: string;
    faceText: string;
  }

  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let activeDice = $state<PhysicsDie[]>([]);
  let isRolling = $state(false);
  let animId: number | null = null;
  let lastRollResult = $state<ParsedRollResult | null>(null);

  const DIE_COLORS: Record<number, string> = {
    4: '#f97316',
    6: '#3b82f6',
    8: '#10b981',
    10: '#8b5cf6',
    12: '#ec4899',
    20: '#f59e0b',
    100: '#64748b',
  };

  export function triggerPhysicsRoll(
    formula: string = '1d20'
  ): Promise<ParsedRollResult> {
    return new Promise((resolve) => {
      const parsed = parseAndEvaluateDice(formula);
      lastRollResult = parsed;
      isRolling = true;

      const newDice: PhysicsDie[] = [];
      const w = canvasEl?.width || 800;
      const h = canvasEl?.height || 600;

      for (const step of parsed.steps) {
        for (const r of step.rolls) {
          const spawnX = w * 0.2 + Math.random() * (w * 0.6);
          const spawnY = h * 0.2 + Math.random() * (h * 0.4);

          newDice.push({
            id: `die_${Date.now()}_${Math.random()}`,
            sides: r.sides,
            targetValue: r.value,
            x: spawnX,
            y: spawnY,
            z: 220 + Math.random() * 80, // Drop height
            vx: (Math.random() - 0.5) * 12,
            vy: (Math.random() - 0.5) * 10,
            vz: -2 - Math.random() * 4,
            rotX: Math.random() * Math.PI * 2,
            rotY: Math.random() * Math.PI * 2,
            rotZ: Math.random() * Math.PI * 2,
            vRotX: (Math.random() - 0.5) * 0.25,
            vRotY: (Math.random() - 0.5) * 0.25,
            vRotZ: (Math.random() - 0.5) * 0.25,
            isResting: false,
            color: DIE_COLORS[r.sides] || '#f59e0b',
            faceText: `${r.value}`,
          });
        }
      }

      activeDice = newDice;

      // Completion timer after physics settles (~1.8 seconds)
      setTimeout(() => {
        isRolling = false;
        resolve(parsed);
      }, 1900);
    });
  }

  function physicsLoop() {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    const gravity = -0.55;
    const bounceRestitution = 0.52;
    const friction = 0.94;
    const rotFriction = 0.96;

    let anyMoving = false;

    for (const die of activeDice) {
      if (!die.isResting) {
        anyMoving = true;
        // Gravity & Velocity
        die.vz += gravity;
        die.x += die.vx;
        die.y += die.vy;
        die.z += die.vz;

        // Rotation
        die.rotX += die.vRotX;
        die.rotY += die.vRotY;
        die.rotZ += die.vRotZ;

        // Floor collision (z <= 0)
        if (die.z <= 0) {
          die.z = 0;
          die.vz = -die.vz * bounceRestitution;
          die.vx *= friction;
          die.vy *= friction;
          die.vRotX *= rotFriction;
          die.vRotY *= rotFriction;
          die.vRotZ *= rotFriction;

          // Resting threshold check
          if (
            Math.abs(die.vz) < 0.3 &&
            Math.abs(die.vx) < 0.2 &&
            Math.abs(die.vy) < 0.2 &&
            die.z < 2
          ) {
            die.isResting = true;
            die.vz = 0;
            die.vx = 0;
            die.vy = 0;
          }
        }
      }

      // Render 3D Projected Die
      ctx.save();
      // Drop Shadow
      const shadowScale = Math.max(0.2, 1.0 - die.z / 300);
      const shadowBlur = Math.min(25, 4 + die.z * 0.12);
      ctx.fillStyle = `rgba(0, 0, 0, ${0.4 * shadowScale})`;
      ctx.beginPath();
      ctx.ellipse(die.x, die.y, 22 * shadowScale, 14 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();

      // Project die body above shadow based on z
      const projY = die.y - die.z * 0.85;

      ctx.translate(die.x, projY);
      ctx.rotate(die.rotZ);

      const radius = 24;

      // Hexagonal / Polyhedral facet rendering
      ctx.fillStyle = die.color;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;

      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI) / 3;
        const px = Math.cos(angle) * radius;
        const py = Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Top face value indicator
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(die.faceText, 0, 1);

      ctx.restore();
    }

    animId = requestAnimationFrame(physicsLoop);
  }

  onMount(() => {
    if (canvasEl) {
      canvasEl.width = window.innerWidth;
      canvasEl.height = window.innerHeight;
    }

    const unsub = systemBus.on('ROLL_3D_DICE', (payload: any) => {
      const formula = typeof payload === 'string' ? payload : payload?.formula || '1d20';
      triggerPhysicsRoll(formula);
    });

    animId = requestAnimationFrame(physicsLoop);

    return () => {
      unsub();
      if (animId) cancelAnimationFrame(animId);
    };
  });
</script>

<canvas
  bind:this={canvasEl}
  class="pointer-events-none fixed inset-0 z-40 w-full h-full {isRolling || activeDice.length > 0 ? 'block' : 'hidden'}"
></canvas>

{#if lastRollResult && !isRolling && activeDice.length > 0}
  <div
    class="fixed bottom-12 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 border border-amber-500/80 rounded-2xl px-5 py-3 shadow-2xl backdrop-blur-md flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200"
  >
    <div class="text-xl">🎲</div>
    <div>
      <div class="text-[10px] text-slate-400 font-mono uppercase tracking-wider">
        {lastRollResult.expression}
      </div>
      <div class="font-bold text-amber-300 font-mono text-lg flex items-center gap-2">
        <span>{lastRollResult.total}</span>
        {#if lastRollResult.isCritical}
          <span class="text-xs bg-amber-500 text-slate-950 font-black px-1.5 py-0.5 rounded shadow">
            NAT 20!
          </span>
        {/if}
      </div>
    </div>
    <div class="text-[11px] text-slate-400 font-mono max-w-xs truncate border-l border-slate-700 pl-3">
      {lastRollResult.breakdown}
    </div>
    <button
      type="button"
      onclick={() => (activeDice = [])}
      class="text-slate-500 hover:text-slate-200 text-sm ml-2"
      aria-label="Dismiss 3D Dice"
    >
      ✕
    </button>
  </div>
{/if}
