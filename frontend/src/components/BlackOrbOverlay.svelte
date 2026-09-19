<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { characterStore, toggleBlackOrb } from '../stores/characterStore';
  import Icons from './Icons.svelte';

  let character = $derived($characterStore);
  let isSealed = $derived(character?.is_orb_sealed ?? false);

  let canvasEl: HTMLCanvasElement | null = $state(null);
  let animationFrameId: number | null = null;
  let mouseX = 0;
  let mouseY = 0;

  interface Particle {
    x: number;
    y: number;
    radius: number;
    angle: number;
    distance: number;
    speed: number;
    color: string;
  }

  let particles: Particle[] = [];

  function initParticles(width: number, height: number) {
    particles = [];
    const count = 90;
    const colors = ['#7c3aed', '#6366f1', '#a855f7', '#ec4899', '#3b82f6'];

    for (let i = 0; i < count; i++) {
      particles.push({
        x: width / 2,
        y: height / 2,
        radius: Math.random() * 2 + 1,
        angle: Math.random() * Math.PI * 2,
        distance: Math.random() * (Math.min(width, height) * 0.45) + 30,
        speed: (Math.random() * 0.02 + 0.005) * (Math.random() > 0.5 ? 1 : -1),
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }

  function renderVoid() {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    const width = canvasEl.width;
    const height = canvasEl.height;
    const centerX = width / 2 + (mouseX - width / 2) * 0.05;
    const centerY = height / 2 + (mouseY - height / 2) * 0.05;

    // Soft trail clear
    ctx.fillStyle = 'rgba(3, 0, 18, 0.2)';
    ctx.fillRect(0, 0, width, height);

    // Singularity Core (Event Horizon)
    const coreGradient = ctx.createRadialGradient(
      centerX,
      centerY,
      5,
      centerX,
      centerY,
      65
    );
    coreGradient.addColorStop(0, '#000000');
    coreGradient.addColorStop(0.7, '#000000');
    coreGradient.addColorStop(0.85, '#3b0764');
    coreGradient.addColorStop(1, 'transparent');

    ctx.fillStyle = coreGradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 70, 0, Math.PI * 2);
    ctx.fill();

    // Swirling Accretion Disc Particles
    for (const p of particles) {
      p.angle += p.speed;
      // Gravitational pull inward
      p.distance -= 0.15;
      if (p.distance < 20) {
        p.distance = Math.min(width, height) * 0.45;
      }

      const px = centerX + Math.cos(p.angle) * p.distance;
      const py = centerY + Math.sin(p.angle) * p.distance * 0.6; // elliptical tilt

      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(px, py, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    animationFrameId = requestAnimationFrame(renderVoid);
  }

  function handleMouseMove(e: MouseEvent) {
    mouseX = e.clientX;
    mouseY = e.clientY;
  }

  function handleTouchMove(e: TouchEvent) {
    if (e.touches.length > 0) {
      mouseX = e.touches[0].clientX;
      mouseY = e.touches[0].clientY;
    }
  }

  $effect(() => {
    if (isSealed) {
      // Setup canvas when sealed
      setTimeout(() => {
        if (canvasEl) {
          canvasEl.width = window.innerWidth;
          canvasEl.height = window.innerHeight;
          initParticles(canvasEl.width, canvasEl.height);
          renderVoid();
        }
      }, 50);
    } else {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    }
  });

  onDestroy(() => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
  });
</script>

{#if isSealed}
  <!-- Fullscreen Chromatic Scanline Glitch Animation & Dark Void Graphic -->
  <div
    class="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-black/95 select-none pointer-events-auto"
    onmousemove={handleMouseMove}
    ontouchmove={handleTouchMove}
    role="dialog"
    aria-modal="true"
    aria-label="Black Orb Protocol Overlay"
    tabindex="-1"
  >
    <!-- Background Interactive Void Canvas -->
    <canvas
      bind:this={canvasEl}
      class="absolute inset-0 w-full h-full object-cover opacity-80"
    ></canvas>

    <!-- CRT Scanline Overlay -->
    <div class="absolute inset-0 crt-scanlines opacity-70"></div>

    <!-- Chromatic Aberration Vignette -->
    <div class="absolute inset-0 bg-radial from-transparent via-purple-950/30 to-black pointer-events-none"></div>

    <!-- Central Quarantine Notice & Sealed Status -->
    <div class="relative z-10 text-center px-6 max-w-lg mx-auto flex flex-col items-center">
      <!-- Pulsing Void Seal Icon -->
      <div class="w-20 h-20 rounded-full bg-purple-950/80 border-2 border-purple-500/70 shadow-2xl shadow-purple-500/30 flex items-center justify-center mb-6 animate-pulse">
        <div class="w-12 h-12 rounded-full bg-black border border-purple-400 flex items-center justify-center text-purple-300">
          <Icons name="alert-triangle" size={24} />
        </div>
      </div>

      <!-- Main Protocol Notice with Chromatic Glitch Effect -->
      <h2 class="text-2xl sm:text-3xl font-black text-white tracking-tight uppercase chromatic-glitch mb-3">
        Form Excised — Sealed in Black Orb.
      </h2>

      <!-- Lore & System Status -->
      <div class="bg-dark-900/90 border border-purple-500/40 rounded-2xl p-5 mb-6 backdrop-blur-md shadow-2xl">
        <p class="text-xs font-mono text-purple-300 uppercase tracking-widest mb-1">
          [System 15 Quarantine Protocol Active]
        </p>
        <p class="text-sm text-slate-300 leading-relaxed">
          Your physical form and active inventory have been quarantined into an obsidian containment singularity. All biological vitals and sensory actions are suspended.
        </p>
        <div class="mt-3 flex items-center justify-center gap-2 text-xs font-mono text-red-400">
          <span class="inline-block w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
          INPUTS FROZEN &bull; VESSEL DORMANT
        </div>
      </div>

      <!-- DM / Player Emergency Unseal Action Button -->
      <button
        onclick={() => toggleBlackOrb(false)}
        class="px-5 py-2.5 bg-dark-800/80 hover:bg-dark-700 active:bg-purple-900 border border-purple-500/50 hover:border-purple-400 rounded-xl text-purple-200 text-xs font-bold tracking-wider uppercase transition-all shadow-lg shadow-purple-500/10 flex items-center gap-2"
      >
        <Icons name="unlock" size={14} /> Disengage Quarantine (Unseal)
      </button>
    </div>
  </div>
{/if}
