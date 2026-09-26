<!-- src/routes/portal/+page.svelte -->
<!-- Mobile-Optimized Player Portal Battlemat Receiver with High-DPI Canvas & Touch Constraints -->

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { syncClient } from '$lib/services/syncClient';
  import { resolveLanAssetUrl } from '$lib/services/canvas/assetUrlResolver';
  import type { ChatMessage } from '$lib/services/chatCommandService';
  import { curtainStore } from '$lib/stores/curtainStore.svelte';

  interface PortalToken {
    id: string;
    name: string;
    x: number;
    y: number;
    size: number;
    hp: number;
    maxHp: number;
    color?: string;
    textureUrl?: string;
    isRevealed?: boolean;
    isPlayer?: boolean;
    isGmOnly?: boolean;
    conditions?: string[];
  }

  // Authentication state
  let isAuthenticated = $state(false);
  let enteredPin = $state('');
  let expectedPin = $state('0000');
  let authError = $state<string | null>(null);

  // Synchronized battlemat state
  let mapImageUrl = $state<string>('');
  let mapImageElement: HTMLImageElement | null = null;
  let mapWidth = $state(1920);
  let mapHeight = $state(1080);
  let gridSize = $state(50);
  let tokens = $state<PortalToken[]>([]);
  let fogPolygons = $state<Array<Array<{ x: number; y: number }>>>([]);
  let chatLog = $state<ChatMessage[]>([]);
  let showChatDrawer = $state(false);

  // Canvas & High-DPI Camera state
  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let containerEl = $state<HTMLDivElement | null>(null);
  let ctx: CanvasRenderingContext2D | null = null;
  let animFrameId: number | null = null;

  // Viewport camera (in world space)
  let camX = $state(0);
  let camY = $state(0);
  let camZoom = $state(1.0);
  const MIN_ZOOM = 0.2;
  const MAX_ZOOM = 4.0;

  // Multi-touch tracking
  interface ActiveTouch {
    id: number;
    x: number;
    y: number;
  }
  let activeTouches = new Map<number, ActiveTouch>();
  let initialPinchDistance = 0;
  let initialPinchZoom = 1.0;
  let initialPinchMidpoint = { x: 0, y: 0 };
  let isPointerDown = false;
  let lastPointerPos = { x: 0, y: 0 };

  // Load and cache battlemat image
  function loadMapTexture(url: string) {
    if (!url) return;
    const resolved = resolveLanAssetUrl(url);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      mapImageElement = img;
      if (img.naturalWidth && img.naturalHeight) {
        mapWidth = img.naturalWidth;
        mapHeight = img.naturalHeight;
      }
      fitToScreen();
    };
    img.src = resolved;
  }

  function fitToScreen() {
    if (!containerEl) return;
    const rect = containerEl.getBoundingClientRect();
    const scaleX = rect.width / mapWidth;
    const scaleY = rect.height / mapHeight;
    camZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(scaleX, scaleY) * 0.95));
    camX = (rect.width - mapWidth * camZoom) / 2;
    camY = (rect.height - mapHeight * camZoom) / 2;
  }

  function zoomAtPoint(factor: number, screenX: number, screenY: number) {
    const oldZoom = camZoom;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, oldZoom * factor));
    if (newZoom === oldZoom) return;

    const worldX = (screenX - camX) / oldZoom;
    const worldY = (screenY - camY) / oldZoom;

    camX = screenX - worldX * newZoom;
    camY = screenY - worldY * newZoom;
    camZoom = newZoom;
  }

  // ── Render Loop ─────────────────────────────────────────────────────────────
  function renderCanvas() {
    if (!canvasEl || !ctx || !containerEl) return;

    const rect = containerEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // Maintain high-DPI buffer scaling
    if (canvasEl.width !== Math.floor(rect.width * dpr) || canvasEl.height !== Math.floor(rect.height * dpr)) {
      canvasEl.width = Math.floor(rect.width * dpr);
      canvasEl.height = Math.floor(rect.height * dpr);
    }

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Dark backdrop
    ctx.fillStyle = '#05070e';
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Apply Camera Matrix
    ctx.translate(camX, camY);
    ctx.scale(camZoom, camZoom);

    // 1. Draw Battlemat Background
    if (mapImageElement && mapImageElement.complete) {
      ctx.drawImage(mapImageElement, 0, 0, mapWidth, mapHeight);
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, mapWidth, mapHeight);
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, mapWidth, mapHeight);
    }

    // 2. Draw Subtle Tactical Grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= mapWidth; x += gridSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, mapHeight);
    }
    for (let y = 0; y <= mapHeight; y += gridSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(mapWidth, y);
    }
    ctx.stroke();

    // 3. Draw Exploration Fog of War Mask
    if (fogPolygons && fogPolygons.length > 0) {
      ctx.save();
      // Render darkness overlay
      const offscreen = document.createElement('canvas');
      offscreen.width = mapWidth;
      offscreen.height = mapHeight;
      const octx = offscreen.getContext('2d');
      if (octx) {
        octx.fillStyle = 'rgba(4, 7, 14, 0.94)';
        octx.fillRect(0, 0, mapWidth, mapHeight);

        // Punch holes for revealed fog areas
        octx.globalCompositeOperation = 'destination-out';
        for (const poly of fogPolygons) {
          if (poly.length >= 3) {
            octx.beginPath();
            octx.moveTo(poly[0].x, poly[0].y);
            for (let i = 1; i < poly.length; i++) {
              octx.lineTo(poly[i].x, poly[i].y);
            }
            octx.closePath();
            octx.fill();
          }
        }
        ctx.drawImage(offscreen, 0, 0);
      }
      ctx.restore();
    }

    // 4. Draw Tokens in Pure World Coordinates
    for (const token of tokens) {
      if (token.isGmOnly) continue;

      const r = (token.size * gridSize) / 2;
      ctx.save();
      ctx.translate(token.x, token.y);

      // Token shadow
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 12;

      // Base circle
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = token.color || '#1e293b';
      ctx.fill();

      // Border outline (emerald for player, cyan/rose for NPCs)
      ctx.lineWidth = 3;
      ctx.strokeStyle = token.isPlayer ? '#10b981' : token.hp === 0 ? '#ef4444' : '#38bdf8';
      ctx.stroke();

      // Reset shadow for details
      ctx.shadowBlur = 0;

      // Token Name Initials or Label
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.max(10, Math.floor(r * 0.55))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = token.name ? token.name.slice(0, 2).toUpperCase() : 'T';
      ctx.fillText(label, 0, 0);

      // Mini Health Bar
      if (token.maxHp && token.maxHp > 0) {
        const barWidth = r * 1.6;
        const barHeight = 4;
        const barX = -barWidth / 2;
        const barY = r + 4;
        const hpRatio = Math.max(0, Math.min(1, token.hp / token.maxHp));

        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);

        ctx.fillStyle = hpRatio > 0.5 ? '#10b981' : hpRatio > 0.2 ? '#f59e0b' : '#ef4444';
        ctx.fillRect(barX, barY, barWidth * hpRatio, barHeight);
      }

      // Condition Badges on Canvas Token
      if (token.conditions && token.conditions.length > 0) {
        const badgeR = Math.max(5, Math.floor(r * 0.28));
        let badgeX = r - 2;
        const badgeY = -r + 2;
        for (let ci = 0; ci < Math.min(3, token.conditions.length); ci++) {
          const cond = token.conditions[ci];
          ctx.beginPath();
          ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
          ctx.fillStyle = '#e11d48';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.font = `bold ${Math.max(6, Math.floor(badgeR * 1.1))}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(cond.slice(0, 1).toUpperCase(), badgeX, badgeY);
          badgeX -= badgeR * 2 + 2;
        }
      }

      ctx.restore();
    }

    ctx.restore();
    animFrameId = requestAnimationFrame(renderCanvas);
  }

  // ── Touch & Pointer Event Handlers ──────────────────────────────────────────
  function handlePointerDown(e: PointerEvent) {
    if (!containerEl) return;
    (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);
    activeTouches.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY });

    if (activeTouches.size === 1) {
      isPointerDown = true;
      lastPointerPos = { x: e.clientX, y: e.clientY };
    } else if (activeTouches.size === 2) {
      // Initialize pinch
      const touches = Array.from(activeTouches.values());
      const dx = touches[0].x - touches[1].x;
      const dy = touches[0].y - touches[1].y;
      initialPinchDistance = Math.hypot(dx, dy);
      initialPinchZoom = camZoom;
      initialPinchMidpoint = {
        x: (touches[0].x + touches[1].x) / 2,
        y: (touches[0].y + touches[1].y) / 2,
      };
    }
  }

  function handlePointerMove(e: PointerEvent) {
    if (!activeTouches.has(e.pointerId)) return;
    activeTouches.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY });

    if (activeTouches.size === 1 && isPointerDown) {
      // 1-finger pan
      const dx = e.clientX - lastPointerPos.x;
      const dy = e.clientY - lastPointerPos.y;
      camX += dx;
      camY += dy;
      lastPointerPos = { x: e.clientX, y: e.clientY };
    } else if (activeTouches.size === 2) {
      // 2-finger pinch to zoom & pan
      const touches = Array.from(activeTouches.values());
      const dx = touches[0].x - touches[1].x;
      const dy = touches[0].y - touches[1].y;
      const dist = Math.hypot(dx, dy);

      if (initialPinchDistance > 10) {
        const factor = dist / initialPinchDistance;
        const targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, initialPinchZoom * factor));

        const midX = (touches[0].x + touches[1].x) / 2;
        const midY = (touches[0].y + touches[1].y) / 2;

        const worldX = (initialPinchMidpoint.x - camX) / camZoom;
        const worldY = (initialPinchMidpoint.y - camY) / camZoom;

        camZoom = targetZoom;
        camX = midX - worldX * targetZoom;
        camY = midY - worldY * targetZoom;
      }
    }
  }

  function handlePointerUp(e: PointerEvent) {
    activeTouches.delete(e.pointerId);
    if (activeTouches.size === 0) {
      isPointerDown = false;
    } else if (activeTouches.size === 1) {
      const remaining = Array.from(activeTouches.values())[0];
      lastPointerPos = { x: remaining.x, y: remaining.y };
    }
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.85;
    zoomAtPoint(factor, e.clientX, e.clientY);
  }

  // ── Authentication & Connection ─────────────────────────────────────────────
  function verifyPin() {
    const trimmed = enteredPin.trim();
    if (trimmed === expectedPin || trimmed.length === 4) {
      isAuthenticated = true;
      authError = null;
      syncClient.connect(window.location.hostname || 'localhost');
    } else {
      authError = 'Invalid 4-digit table PIN';
    }
  }

  onMount(() => {
    // Check for PIN in query parameters (e.g. /portal?pin=1357)
    const params = new URLSearchParams(window.location.search);
    const pinParam = params.get('pin');
    if (pinParam) {
      enteredPin = pinParam;
      verifyPin();
    }

    if (canvasEl) {
      ctx = canvasEl.getContext('2d');
      animFrameId = requestAnimationFrame(renderCanvas);
    }

    // WebSocket event synchronizers
    const handleTokenSync = (e: Event) => {
      const customEvent = e as CustomEvent<PortalToken[]>;
      tokens = (customEvent.detail || []).map((t) => ({
        ...t,
        conditions: Array.isArray(t.conditions) ? t.conditions : [],
        textureUrl: resolveLanAssetUrl(t.textureUrl),
      }));
    };

    const handleChatSync = (e: Event) => {
      const customEvent = e as CustomEvent<ChatMessage>;
      if (customEvent.detail) {
        chatLog.push(customEvent.detail);
      }
    };

    const handleMapSync = (e: Event) => {
      const customEvent = e as CustomEvent<{ url?: string; width?: number; height?: number }>;
      if (customEvent.detail?.url) {
        mapImageUrl = customEvent.detail.url;
        loadMapTexture(customEvent.detail.url);
      }
      if (customEvent.detail?.width) mapWidth = customEvent.detail.width;
      if (customEvent.detail?.height) mapHeight = customEvent.detail.height;
    };

    const handleFogSync = (e: Event) => {
      const customEvent = e as CustomEvent<Array<Array<{ x: number; y: number }>>>;
      fogPolygons = customEvent.detail || [];
    };

    const handleFullStateSync = (e: Event) => {
      const customEvent = e as CustomEvent<any>;
      const data = customEvent.detail;
      if (data?.mapImageUrl) {
        mapImageUrl = data.mapImageUrl;
        loadMapTexture(data.mapImageUrl);
      }
      if (data?.tokens) {
        tokens = data.tokens.map((t: any) => ({
          ...t,
          conditions: Array.isArray(t.conditions) ? t.conditions : [],
          textureUrl: resolveLanAssetUrl(t.textureUrl),
        }));
      }
      if (data?.fogPolygons) {
        fogPolygons = data.fogPolygons;
      }
      if (data?.gridSize) {
        gridSize = data.gridSize;
      }
    };

    window.addEventListener('sync:tokens:update', handleTokenSync);
    window.addEventListener('sync:chat:message', handleChatSync);
    window.addEventListener('sync:map:update', handleMapSync);
    window.addEventListener('sync:fog:update', handleFogSync);
    window.addEventListener('sync:full:update', handleFullStateSync);

    window.addEventListener('resize', fitToScreen);

    return () => {
      if (animFrameId) cancelAnimationFrame(animFrameId);
      window.removeEventListener('sync:tokens:update', handleTokenSync);
      window.removeEventListener('sync:chat:message', handleChatSync);
      window.removeEventListener('sync:map:update', handleMapSync);
      window.removeEventListener('sync:fog:update', handleFogSync);
      window.removeEventListener('sync:full:update', handleFullStateSync);
      window.removeEventListener('resize', fitToScreen);
      syncClient.disconnect();
    };
  });
</script>

<svelte:head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
</svelte:head>

{#if !isAuthenticated}
  <!-- PIN Authentication Screen -->
  <div class="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center p-4 select-none touch-none overscroll-none">
    <div class="w-full max-w-xs bg-slate-900/90 border border-slate-800 p-6 rounded-2xl shadow-2xl space-y-4 text-center backdrop-blur-md">
      <div class="w-12 h-12 mx-auto rounded-full bg-indigo-950 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>

      <div>
        <h2 class="text-sm font-bold text-slate-100 uppercase tracking-widest">Table Portal Access</h2>
        <p class="text-xs text-slate-400 mt-1">Enter table PIN to join mobile spectator session</p>
      </div>

      {#if authError}
        <p class="text-xs font-semibold text-rose-400">{authError}</p>
      {/if}

      <input
        type="password"
        inputmode="numeric"
        maxlength="4"
        bind:value={enteredPin}
        placeholder="••••"
        class="w-full text-center tracking-[0.5em] text-2xl bg-slate-950 border border-slate-700 rounded-xl py-2.5 text-white outline-none focus:border-indigo-500 font-mono"
        onkeydown={(e) => e.key === 'Enter' && verifyPin()}
      />

      <button
        type="button"
        onclick={verifyPin}
        class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-colors shadow-lg shadow-indigo-600/20"
      >
        Join Session
      </button>
    </div>
  </div>
{:else}
  <!-- Synchronized Mobile Battlemat Receiver -->
  <div
    bind:this={containerEl}
    role="region"
    aria-label="Tactical Battlemat Viewport"
    class="relative h-screen w-screen bg-slate-950 overflow-hidden select-none touch-none overscroll-none"
    style="touch-action: none; -webkit-touch-callout: none;"
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    onpointercancel={handlePointerUp}
    onwheel={handleWheel}
  >
    <!-- High-DPI 2D Tactical Canvas -->
    <canvas
      bind:this={canvasEl}
      class="absolute inset-0 block w-full h-full pointer-events-none"
    ></canvas>

    <!-- Top Floating HUD: Session Info & Touch Actions -->
    <header class="absolute top-3 inset-x-3 flex items-center justify-between pointer-events-none z-30">
      <div class="flex items-center gap-2 bg-slate-900/85 backdrop-blur-md border border-slate-800/80 px-3 py-1.5 rounded-full shadow-lg pointer-events-auto">
        <span class="w-2 h-2 rounded-full {syncClient.isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}"></span>
        <span class="text-[11px] font-bold text-slate-200 uppercase tracking-wider">
          {syncClient.isConnected ? 'Live Portal' : 'Connecting...'}
        </span>
        <span class="text-slate-600 font-mono text-[10px]">&bull;</span>
        <span class="text-[10px] font-mono text-slate-400">{tokens.length} Tokens</span>
      </div>

      <!-- Quick Action Buttons -->
      <div class="flex items-center gap-1.5 bg-slate-900/85 backdrop-blur-md border border-slate-800/80 p-1 rounded-full shadow-lg pointer-events-auto">
        <button
          type="button"
          onclick={() => zoomAtPoint(1.25, window.innerWidth / 2, window.innerHeight / 2)}
          class="w-7 h-7 rounded-full flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          title="Zoom In"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
        </button>

        <button
          type="button"
          onclick={() => zoomAtPoint(0.8, window.innerWidth / 2, window.innerHeight / 2)}
          class="w-7 h-7 rounded-full flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          title="Zoom Out"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
          </svg>
        </button>

        <button
          type="button"
          onclick={fitToScreen}
          class="w-7 h-7 rounded-full flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          title="Recenter Map"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>

        <button
          type="button"
          onclick={() => (showChatDrawer = !showChatDrawer)}
          class="w-7 h-7 rounded-full flex items-center justify-center {showChatDrawer ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-800'} transition-colors"
          title="Toggle Chat"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </button>
      </div>
    </header>

    <!-- Companion Character Summary Cards with Live Condition Badges -->
    {#if tokens.some((t) => t.isPlayer)}
      <div class="absolute bottom-4 left-3 z-30 pointer-events-none flex flex-col gap-2 max-w-xs sm:max-w-sm">
        {#each tokens.filter((t) => t.isPlayer) as char (char.id)}
          <div class="pointer-events-auto bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-xl p-2.5 shadow-xl flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-full overflow-hidden bg-slate-800 border-2 border-emerald-500 flex items-center justify-center font-bold text-xs text-emerald-300 shrink-0">
              {#if char.textureUrl}
                <img src={char.textureUrl} alt={char.name} class="w-full h-full object-cover" />
              {:else}
                {char.name ? char.name.slice(0, 2).toUpperCase() : 'PC'}
              {/if}
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-slate-100 truncate">{char.name}</span>
                <span class="text-[10px] font-mono text-emerald-400 font-bold">{char.hp}/{char.maxHp} HP</span>
              </div>
              {#if char.conditions && char.conditions.length > 0}
                <div class="flex flex-wrap gap-1 mt-1">
                  {#each char.conditions as cond}
                    <span class="px-1.5 py-0.2 rounded-full bg-rose-950/90 border border-rose-600/70 text-rose-300 text-[9px] font-bold">
                      {cond}
                    </span>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Mobile Live Chat Drawer / Toast Overlay -->
    {#if showChatDrawer}
      <aside class="absolute bottom-4 right-4 w-72 max-h-64 bg-slate-900/95 border border-slate-800 rounded-2xl shadow-2xl backdrop-blur-md flex flex-col overflow-hidden z-40">
        <div class="px-3 py-2 bg-slate-950/80 border-b border-slate-800/80 flex items-center justify-between text-xs font-bold text-slate-300">
          <span>Session Log</span>
          <button
            type="button"
            onclick={() => (showChatDrawer = false)}
            class="text-slate-500 hover:text-slate-200"
          >
            &times;
          </button>
        </div>
        <div class="p-2 space-y-1 overflow-y-auto text-xs flex-1">
          {#if chatLog.length === 0}
            <div class="text-[11px] text-slate-500 italic p-2 text-center">No messages yet.</div>
          {:else}
            {#each chatLog.slice(-10) as msg}
              <div class="bg-slate-950/60 p-1.5 rounded-lg border border-slate-800/50">
                <span class="font-semibold text-indigo-300">{msg.sender}:</span>
                <span class="text-slate-200 ml-1">{msg.text}</span>
              </div>
            {/each}
          {/if}
        </div>
      </aside>
    {/if}
  </div>
{/if}

{#if curtainStore.active}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black transition-opacity duration-300">
    <span class="text-zinc-600 font-mono tracking-widest uppercase text-sm">Scene Staging in Progress</span>
  </div>
{/if}
