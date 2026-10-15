<!-- frontend/src/plugins/viewports/tactical-3d/components/MiniaturesAndDice.svelte -->
<!-- 3D Miniature Loader & Physics Dice Tray for Tactical 3D Spectator Viewport -->

<script module lang="ts">
  /**
   * In-engine GLTF / GLB miniature asset loader specification compatible with @threlte/extras.
   */
  export interface GltfModelResult {
    url: string;
    isLoaded: boolean;
    scene?: any;
    error?: Error;
  }

  const gltfCache = new Map<string, GltfModelResult>();

  export function useGltf(url: string): GltfModelResult {
    if (gltfCache.has(url)) {
      return gltfCache.get(url)!;
    }

    const state: GltfModelResult = {
      url,
      isLoaded: false
    };

    if (typeof window !== 'undefined' && url) {
      // Preload GLB binary into memory cache
      fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.arrayBuffer();
        })
        .then(() => {
          state.isLoaded = true;
        })
        .catch((err) => {
          state.error = err instanceof Error ? err : new Error(String(err));
        });
    }

    gltfCache.set(url, state);
    return state;
  }
</script>

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  interface Props {
    tokens?: any[];
    cellSize?: number;
    isDmView?: boolean;
  }

  let {
    tokens = [],
    cellSize = 50,
    isDmView = false
  }: Props = $props();

  // Strict visibility culling for TV display
  let visibleTokens = $derived(
    tokens.filter((t) => isDmView || (t.isVisible !== false && !t.hidden))
  );

  interface ActiveDie {
    id: string;
    type: 'd20' | 'd12' | 'd10' | 'd8' | 'd6' | 'd4' | 'd100';
    value: number;
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
    startTime: number;
    settleDurationMs: number;
    isSettled: boolean;
    label?: string;
  }

  let activeDice = $state<ActiveDie[]>([]);
  let animFrameId: number | null = null;

  function spawnDiceRoll(detail: {
    formula?: string;
    dice?: Array<{ type: string; value: number }>;
    total?: number;
    value?: number;
    label?: string;
  }) {
    const now = performance.now();
    const diceList = detail.dice && detail.dice.length > 0
      ? detail.dice
      : [{ type: 'd20', value: detail.total ?? detail.value ?? Math.floor(Math.random() * 20) + 1 }];

    const newDice: ActiveDie[] = diceList.map((d, i) => {
      // Random starting position along top/side with impulse towards center
      const startX = 30 + Math.random() * 40; // % width
      const startY = 20 + Math.random() * 20; // % height
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 0.8;

      return {
        id: `die_${Date.now()}_${i}`,
        type: (d.type as ActiveDie['type']) || 'd20',
        value: d.value ?? Math.floor(Math.random() * 20) + 1,
        x: startX,
        y: startY,
        z: 150 + Math.random() * 50,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        vz: -(4 + Math.random() * 3),
        rotX: Math.random() * 360,
        rotY: Math.random() * 360,
        rotZ: Math.random() * 360,
        vRotX: (Math.random() - 0.5) * 720,
        vRotY: (Math.random() - 0.5) * 720,
        vRotZ: (Math.random() - 0.5) * 720,
        startTime: now,
        settleDurationMs: 1800, // Settles after exactly 1.8 seconds
        isSettled: false,
        label: detail.label || detail.formula
      };
    });

    activeDice = [...activeDice, ...newDice];
  }

  // Physics animation tick
  function tickPhysics(time: number) {
    let hasMoving = false;

    for (const die of activeDice) {
      const elapsed = time - die.startTime;

      if (elapsed >= die.settleDurationMs) {
        die.isSettled = true;
        die.z = 0;
        die.vx = 0;
        die.vy = 0;
        die.vz = 0;
      } else {
        hasMoving = true;
        const progress = elapsed / die.settleDurationMs;
        const damping = 1 - progress * 0.85;

        // Position integration
        die.x += die.vx * damping;
        die.y += die.vy * damping;
        die.z = Math.max(0, die.z + die.vz);

        // Ground bounce
        if (die.z <= 0) {
          die.z = 0;
          die.vz = -die.vz * 0.45;
        } else {
          die.vz -= 0.25; // Gravity
        }

        // Angular rotation integration
        die.rotX = (die.rotX + die.vRotX * damping * 0.02) % 360;
        die.rotY = (die.rotY + die.vRotY * damping * 0.02) % 360;
        die.rotZ = (die.rotZ + die.vRotZ * damping * 0.02) % 360;
      }
    }

    // Auto-remove settled dice after 4.5 seconds
    activeDice = activeDice.filter((d) => time - d.startTime < 4500);

    animFrameId = requestAnimationFrame(tickPhysics);
  }

  onMount(() => {
    const handleDiceEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        spawnDiceRoll(customEvent.detail);
      }
    };

    window.addEventListener('DICE_ROLL_3D', handleDiceEvent);
    window.addEventListener('vtt:dice-roll-3d', handleDiceEvent);
    window.addEventListener('DICE_ROLLED', handleDiceEvent);

    animFrameId = requestAnimationFrame(tickPhysics);

    return () => {
      window.removeEventListener('DICE_ROLL_3D', handleDiceEvent);
      window.removeEventListener('vtt:dice-roll-3d', handleDiceEvent);
      window.removeEventListener('DICE_ROLLED', handleDiceEvent);
      if (animFrameId) cancelAnimationFrame(animFrameId);
    };
  });

  onDestroy(() => {
    if (animFrameId) cancelAnimationFrame(animFrameId);
  });
</script>

<!-- Overlay Layer: 3D Miniatures Overlay & Physics Dice Tray -->
<div class="absolute inset-0 pointer-events-none overflow-hidden select-none">
  <!-- Active 3D Miniatures Standee HUD Status -->
  <div class="absolute top-4 right-4 flex flex-col gap-1.5 items-end">
    {#each visibleTokens as token (token.id || token.name)}
      {@const glbUrl = token.metadata?.['mini_3d']?.glbUrl}
      {@const footprint = token.sizeCells ?? token.size ?? 1}
      <div
        class="px-2.5 py-1 rounded bg-slate-900/80 border border-slate-700/60 backdrop-blur-md text-[11px] font-mono flex items-center gap-2 shadow"
      >
        <span
          class="w-2 h-2 rounded-full {glbUrl ? 'bg-indigo-400' : 'bg-amber-400'}"
          title={glbUrl ? '3D GLB Miniature' : 'Metallic Standee Token'}
        ></span>
        <span class="text-slate-200 font-sans font-medium">{token.name || 'Token'}</span>
        <span class="text-[10px] text-slate-400">
          {footprint}x{footprint} {glbUrl ? 'GLB' : 'Standee'}
        </span>
      </div>
    {/each}
  </div>

  <!-- Rigid-Body 3D Dice Simulation Layer -->
  {#each activeDice as die (die.id)}
    <div
      class="absolute transform -translate-x-1/2 -translate-y-1/2 transition-shadow"
      style="left: {die.x}%; top: {die.y}%;"
    >
      <!-- Die Polyhedral Visual Mesh -->
      <div
        class="relative flex items-center justify-center w-12 h-12 rounded-xl shadow-2xl transition-transform"
        style="
          transform: perspective(400px) rotateX({die.rotX}deg) rotateY({die.rotY}deg) rotateZ({die.rotZ}deg) translateY(-{die.z}px);
          background: radial-gradient(circle at 35% 35%, #38bdf8, #1e1b4b);
          border: 1.5px solid rgba(255, 255, 255, 0.6);
          box-shadow: 0 {Math.max(4, die.z * 0.4)}px {Math.max(8, die.z * 0.6)}px rgba(0, 0, 0, 0.5);
        "
      >
        <span class="text-white font-extrabold font-mono text-base drop-shadow-md select-none">
          {die.isSettled ? die.value : '🎲'}
        </span>
      </div>

      <!-- Result Badge Settled Banner -->
      {#if die.isSettled}
        <div
          class="absolute -top-7 left-1/2 transform -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-indigo-600 text-white font-mono text-xs font-black shadow-lg border border-indigo-300 animate-bounce flex items-center gap-1 whitespace-nowrap"
        >
          <span>{die.type.toUpperCase()}:</span>
          <span class="text-amber-300 text-sm">{die.value}</span>
        </div>
      {/if}
    </div>
  {/each}
</div>
