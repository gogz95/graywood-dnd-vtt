<script lang="ts">
  // TacticalCanvasContainer.svelte — Pan/zoom HTML5 2D canvas battle mat
  // No external renderer dependency. Works entirely with the Canvas 2D API.

  import { onMount, onDestroy } from 'svelte';

  export interface MapToken {
    id: string;
    name: string;
    x: number;        // grid column (0-indexed)
    y: number;        // grid row (0-indexed)
    color: string;
    isPlayer: boolean;
    hp: number;
    maxHp: number;
  }

  // ── Props ──────────────────────────────────────────────────────────────────
  let {
    tokens = $bindable<MapToken[]>([]),
    onTokenMove,
  }: {
    tokens?: MapToken[];
    onTokenMove?: (id: string, gx: number, gy: number) => void;
  } = $props();

  // ── Canvas refs & context ──────────────────────────────────────────────────
  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let ctx: CanvasRenderingContext2D | null = null;

  // ── Map settings ───────────────────────────────────────────────────────────
  let gridSize     = $state(60);     // px per cell
  let gridOpacity  = $state(0.35);
  let gridSnap     = $state(true);
  let mapImageUrl  = $state('');
  let mapImageInput = $state('');
  let mapImg: HTMLImageElement | null = null;
  let showSettings = $state(false);

  // ── Viewport transform ─────────────────────────────────────────────────────
  let vpX    = $state(0);   // pan offset px
  let vpY    = $state(0);
  let vpZoom = $state(1.0); // 0.25 – 4.0

  // ── Interaction state ──────────────────────────────────────────────────────
  let isPanning     = $state(false);
  let panStart      = { x: 0, y: 0, ox: 0, oy: 0 };
  let draggingToken = $state<MapToken | null>(null);
  let dragOffsetGrid = { dx: 0, dy: 0 };
  let dragCurrentGrid = $state<{ gx: number; gy: number } | null>(null);
  let hoveredCell   = $state<{ gx: number; gy: number } | null>(null);

  // ── Spawn panel ────────────────────────────────────────────────────────────
  let showSpawnPanel = $state(false);
  let spawnName      = $state('');
  let spawnColor     = $state('#6366f1');
  let spawnIsPlayer  = $state(false);
  let spawnHp        = $state(20);
  let spawnGx        = $state(0);
  let spawnGy        = $state(0);

  // ── Render loop ────────────────────────────────────────────────────────────
  let rafId = 0;

  function render() {
    if (!ctx || !canvasEl) return;
    const w = canvasEl.width;
    const h = canvasEl.height;

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(vpX, vpY);
    ctx.scale(vpZoom, vpZoom);

    // Background
    ctx.fillStyle = '#0d0f1a';
    ctx.fillRect(-vpX / vpZoom, -vpY / vpZoom, w / vpZoom, h / vpZoom);

    // Map image
    if (mapImg?.complete && mapImg.naturalWidth > 0) {
      ctx.globalAlpha = 1;
      ctx.drawImage(mapImg, 0, 0);
    }

    // Grid
    const cols = Math.ceil(w / vpZoom / gridSize) + 2;
    const rows = Math.ceil(h / vpZoom / gridSize) + 2;
    const startCol = Math.floor(-vpX / vpZoom / gridSize) - 1;
    const startRow = Math.floor(-vpY / vpZoom / gridSize) - 1;

    ctx.strokeStyle = `rgba(99, 102, 241, ${gridOpacity})`;
    ctx.lineWidth = 0.75;
    for (let c = startCol; c <= startCol + cols; c++) {
      ctx.beginPath();
      ctx.moveTo(c * gridSize, startRow * gridSize);
      ctx.lineTo(c * gridSize, (startRow + rows) * gridSize);
      ctx.stroke();
    }
    for (let r = startRow; r <= startRow + rows; r++) {
      ctx.beginPath();
      ctx.moveTo(startCol * gridSize, r * gridSize);
      ctx.lineTo((startCol + cols) * gridSize, r * gridSize);
      ctx.stroke();
    }

    // Hovered cell highlight
    if (hoveredCell && !isPanning) {
      ctx.fillStyle = 'rgba(99,102,241,0.08)';
      ctx.fillRect(hoveredCell.gx * gridSize, hoveredCell.gy * gridSize, gridSize, gridSize);
    }

    // Drag ghost
    if (draggingToken && dragCurrentGrid) {
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = draggingToken.color;
      const pad = gridSize * 0.1;
      ctx.beginPath();
      ctx.roundRect(dragCurrentGrid.gx * gridSize + pad, dragCurrentGrid.gy * gridSize + pad, gridSize - pad * 2, gridSize - pad * 2, 6);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Tokens
    for (const tok of tokens) {
      if (draggingToken?.id === tok.id) continue; // skip — drawn as ghost
      drawToken(ctx, tok);
    }

    ctx.restore();
    rafId = requestAnimationFrame(render);
  }

  function drawToken(c: CanvasRenderingContext2D, tok: MapToken) {
    const pad = gridSize * 0.1;
    const x = tok.x * gridSize + pad;
    const y = tok.y * gridSize + pad;
    const size = gridSize - pad * 2;

    // Token body
    c.fillStyle = tok.color;
    c.beginPath();
    c.roundRect(x, y, size, size, 6);
    c.fill();

    // Border
    c.strokeStyle = tok.isPlayer ? '#fbbf24' : '#ef4444';
    c.lineWidth = 1.5 / vpZoom;
    c.stroke();

    // HP bar
    const barH = Math.max(3, gridSize * 0.07);
    const barY = y + size - barH;
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.fillRect(x, barY, size, barH);
    const pct = Math.max(0, Math.min(1, tok.hp / tok.maxHp));
    c.fillStyle = pct < 0.25 ? '#ef4444' : pct < 0.5 ? '#f59e0b' : '#22c55e';
    c.fillRect(x, barY, size * pct, barH);

    // Name label
    c.fillStyle = '#fff';
    c.font = `bold ${Math.max(8, gridSize * 0.18)}px sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(tok.name.slice(0, 2).toUpperCase(), x + size / 2, y + size * 0.44, size - 4);
  }

  // ── Coordinate helpers ─────────────────────────────────────────────────────
  function screenToWorld(sx: number, sy: number): { wx: number; wy: number } {
    if (!canvasEl) return { wx: 0, wy: 0 };
    const rect = canvasEl.getBoundingClientRect();
    return {
      wx: (sx - rect.left - vpX) / vpZoom,
      wy: (sy - rect.top  - vpY) / vpZoom,
    };
  }

  function worldToGrid(wx: number, wy: number) {
    return { gx: Math.floor(wx / gridSize), gy: Math.floor(wy / gridSize) };
  }

  function tokenAt(gx: number, gy: number): MapToken | undefined {
    return tokens.find(t => t.x === gx && t.y === gy);
  }

  // ── Resize observer ────────────────────────────────────────────────────────
  let resizeObserver: ResizeObserver | null = null;

  function syncCanvasSize() {
    if (!canvasEl) return;
    const { clientWidth: w, clientHeight: h } = canvasEl.parentElement!;
    if (canvasEl.width !== w || canvasEl.height !== h) {
      canvasEl.width  = w;
      canvasEl.height = h;
    }
  }

  // ── Event handlers ─────────────────────────────────────────────────────────
  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const { wx, wy } = screenToWorld(e.clientX, e.clientY);
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    vpZoom = Math.max(0.25, Math.min(4, vpZoom * factor));
    // Zoom toward cursor
    vpX = e.clientX - canvasEl!.getBoundingClientRect().left - wx * vpZoom;
    vpY = e.clientY - canvasEl!.getBoundingClientRect().top  - wy * vpZoom;
  }

  function handleMouseDown(e: MouseEvent) {
    // Middle mouse or Space+Left = pan
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      isPanning = true;
      panStart = { x: e.clientX, y: e.clientY, ox: vpX, oy: vpY };
      return;
    }
    // Left click = drag token or place spawn
    if (e.button === 0) {
      const { wx, wy } = screenToWorld(e.clientX, e.clientY);
      const { gx, gy } = worldToGrid(wx, wy);
      const tok = tokenAt(gx, gy);
      if (tok) {
        draggingToken = tok;
        dragOffsetGrid = { dx: gx - tok.x, dy: gy - tok.y };
        dragCurrentGrid = { gx: tok.x, gy: tok.y };
      }
    }
  }

  function handleMouseMove(e: MouseEvent) {
    if (!canvasEl) return;
    const { wx, wy } = screenToWorld(e.clientX, e.clientY);
    const { gx, gy } = worldToGrid(wx, wy);
    hoveredCell = { gx, gy };

    if (isPanning) {
      vpX = panStart.ox + (e.clientX - panStart.x);
      vpY = panStart.oy + (e.clientY - panStart.y);
      return;
    }

    if (draggingToken) {
      dragCurrentGrid = { gx, gy };
    }
  }

  function handleMouseUp(e: MouseEvent) {
    if (isPanning) { isPanning = false; return; }

    if (draggingToken && dragCurrentGrid) {
      const { gx, gy } = dragCurrentGrid;
      tokens = tokens.map(t =>
        t.id === draggingToken!.id ? { ...t, x: gx, y: gy } : t
      );
      onTokenMove?.(draggingToken.id, gx, gy);
    }
    draggingToken = null;
    dragCurrentGrid = null;
  }

  let spaceDown = $state(false);
  function handleKeyDown(e: KeyboardEvent) {
    if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); spaceDown = true; }
  }
  function handleKeyUp(e: KeyboardEvent) {
    if (e.code === 'Space') spaceDown = false;
  }

  // ── Map image loading ──────────────────────────────────────────────────────
  function loadMapFromUrl(url: string) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { mapImg = img; mapImageUrl = url; };
    img.onerror = () => { alert('Could not load image from that URL.'); };
    img.src = url;
  }

  function handleMapFileInput(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    loadMapFromUrl(url);
    mapImageUrl = file.name;
  }

  // ── Spawn token ────────────────────────────────────────────────────────────
  function spawnToken() {
    if (!spawnName.trim()) return;
    const id = `tok-${Date.now()}`;
    tokens = [...tokens, {
      id, name: spawnName.trim(), x: spawnGx, y: spawnGy,
      color: spawnColor, isPlayer: spawnIsPlayer, hp: spawnHp, maxHp: spawnHp,
    }];
    showSpawnPanel = false;
    spawnName = '';
  }

  function removeToken(id: string) { tokens = tokens.filter(t => t.id !== id); }

  // ── Map Ingestion Bridge (from Atlas Hub or direct drop) ─────────────────
  let isDroppingMap = $state(false);

  function handleBattleMapEvent(e: Event) {
    const detail = (e as CustomEvent<{ url?: string; dataUrl?: string; fileName?: string }>).detail;
    if (!detail) return;
    const targetUrl = detail.dataUrl || detail.url;
    if (targetUrl) {
      loadMapFromUrl(targetUrl);
      if (detail.fileName) {
        mapImageUrl = detail.fileName;
        mapImageInput = detail.fileName;
      }
      vpX = 0;
      vpY = 0;
      vpZoom = 1.0;
    }
  }

  function handleCanvasDrop(e: DragEvent) {
    e.preventDefault();
    isDroppingMap = false;
    const files = e.dataTransfer?.files;
    if (files && files[0] && /\.(png|svg|jpg|jpeg|webp)$/i.test(files[0].name)) {
      const file = files[0];
      const url = URL.createObjectURL(file);
      loadMapFromUrl(url);
      mapImageUrl = file.name;
      mapImageInput = file.name;
      vpX = 0;
      vpY = 0;
      vpZoom = 1.0;
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  onMount(() => {
    if (!canvasEl) return;
    ctx = canvasEl.getContext('2d');
    syncCanvasSize();
    resizeObserver = new ResizeObserver(() => { syncCanvasSize(); });
    resizeObserver.observe(canvasEl.parentElement!);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('vtt:load-battle-map', handleBattleMapEvent);
    rafId = requestAnimationFrame(render);
  });

  onDestroy(() => {
    cancelAnimationFrame(rafId);
    resizeObserver?.disconnect();
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
    window.removeEventListener('vtt:load-battle-map', handleBattleMapEvent);
  });
</script>

<div class="h-full flex flex-col overflow-hidden bg-slate-950">

  <!-- ── Toolbar ──────────────────────────────────────────────────────────── -->
  <div class="flex items-center gap-2 px-3 py-2 border-b border-slate-800 bg-slate-900 shrink-0 flex-wrap">
    <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Battle Mat</span>
    <div class="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1">
      <span class="text-[10px] text-slate-600">Zoom</span>
      <span class="text-[11px] font-mono font-bold text-slate-300">{Math.round(vpZoom*100)}%</span>
    </div>
    <button onclick={() => { vpX = 0; vpY = 0; vpZoom = 1; }} class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs rounded transition-colors">Reset View</button>
    <button onclick={() => showSpawnPanel = !showSpawnPanel} class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded transition-colors">+ Token</button>
    <button onclick={() => showSettings = !showSettings} class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded transition-colors">⚙ Map Settings</button>

    <div class="flex-1"></div>
    <span class="text-[10px] text-slate-600">Space+drag or middle-click to pan · Scroll to zoom</span>
  </div>

  <!-- ── Settings Bar ─────────────────────────────────────────────────────── -->
  {#if showSettings}
    <div class="flex items-center gap-4 px-4 py-2.5 border-b border-slate-800 bg-slate-900/60 shrink-0 flex-wrap text-xs">
      <div class="flex items-center gap-2">
          <span class="text-[9px] text-slate-600 uppercase">Grid Size</span>
        <input type="range" min="30" max="120" step="10" bind:value={gridSize} class="w-24 accent-indigo-500 cursor-pointer" />
        <span class="font-mono text-slate-300 w-8">{gridSize}px</span>
      </div>
      <div class="flex items-center gap-2">
          <span class="text-slate-500 uppercase tracking-wider text-[10px] font-semibold whitespace-nowrap">Grid Opacity</span>
        <input type="range" min="0" max="1" step="0.05" bind:value={gridOpacity} class="w-24 accent-indigo-500 cursor-pointer" />
        <span class="font-mono text-slate-300 w-8">{Math.round(gridOpacity*100)}%</span>
      </div>
      <label class="flex items-center gap-1.5 text-slate-400 cursor-pointer">
        <input type="checkbox" bind:checked={gridSnap} class="rounded" /> Grid Snap
      </label>
      <div class="flex items-center gap-2 flex-1 min-w-0">
        <span class="text-slate-500 uppercase tracking-wider text-[10px] font-semibold whitespace-nowrap">Map URL</span>
        <input type="text" bind:value={mapImageInput} placeholder="https://… or drag image onto canvas"
          class="flex-1 min-w-0 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-[11px]" />
        <button onclick={() => loadMapFromUrl(mapImageInput)} class="px-2.5 py-1 bg-indigo-700 hover:bg-indigo-600 text-white text-xs font-bold rounded transition-colors whitespace-nowrap">Load</button>
      </div>
      <label class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded cursor-pointer transition-colors whitespace-nowrap">
        📁 File…
        <input type="file" accept="image/*" class="hidden" onchange={handleMapFileInput} />
      </label>
      {#if mapImageUrl}
        <button onclick={() => { mapImg = null; mapImageUrl = ''; }} class="text-rose-500 hover:text-rose-300 text-xs transition-colors">✕ Clear Map</button>
      {/if}
    </div>
  {/if}

  <!-- ── Spawn Panel ───────────────────────────────────────────────────────── -->
  {#if showSpawnPanel}
    <div class="flex items-center gap-3 px-4 py-2.5 border-b border-slate-800 bg-slate-900/60 shrink-0 flex-wrap text-xs">
      <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Spawn Token</span>
      <input type="text" bind:value={spawnName} placeholder="Token name…" class="w-36 bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500" />
      <input type="color" bind:value={spawnColor} class="w-8 h-7 rounded cursor-pointer border border-slate-700 bg-slate-900 p-0.5" title="Token color" />
      <input type="number" bind:value={spawnHp} min="1" placeholder="HP" class="w-16 bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono" />
      <div class="flex items-center gap-1">
        <span class="text-[10px] text-slate-500 uppercase">Col</span>
        <input type="number" bind:value={spawnGx} min="0" class="w-14 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 focus:outline-none font-mono" />
      </div>
      <div class="flex items-center gap-1">
        <span class="text-[10px] text-slate-500 uppercase">Row</span>
        <input type="number" bind:value={spawnGy} min="0" class="w-14 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 focus:outline-none font-mono" />
      </div>
      <label class="flex items-center gap-1.5 text-slate-400 cursor-pointer">
        <input type="checkbox" bind:checked={spawnIsPlayer} class="rounded" /> Player
      </label>
      <button onclick={spawnToken} disabled={!spawnName.trim()} class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold rounded transition-colors">Place</button>
      <button onclick={() => showSpawnPanel = false} class="px-2 py-1.5 bg-slate-800 text-slate-400 rounded hover:bg-slate-700 transition-colors">✕</button>
    </div>
  {/if}

  <!-- ── Canvas + Token List ───────────────────────────────────────────────── -->
  <div class="flex flex-1 overflow-hidden min-h-0">
    <!-- Canvas -->
    <div class="flex-1 relative overflow-hidden min-w-0 min-h-0 cursor-crosshair"
      class:cursor-grab={spaceDown}
      class:cursor-grabbing={isPanning}
      class:ring-2={isDroppingMap}
      class:ring-indigo-500={isDroppingMap}
      ondragover={(e) => { e.preventDefault(); isDroppingMap = true; }}
      ondragleave={() => { isDroppingMap = false; }}
      ondrop={handleCanvasDrop}
      role="region"
      aria-label="Tactical Battle Mat viewport"
    >
      <canvas
        bind:this={canvasEl}
        class="absolute inset-0 touch-none select-none"
        onwheel={handleWheel}
        onmousedown={handleMouseDown}
        onmousemove={handleMouseMove}
        onmouseup={handleMouseUp}
        onmouseleave={() => { hoveredCell = null; handleMouseUp(new MouseEvent('mouseup')); }}
      ></canvas>
      {#if !mapImageUrl && tokens.length === 0}
        <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div class="text-center space-y-2">
            <p class="text-4xl opacity-20">🗺️</p>
            <p class="text-xs text-slate-600">Load a map image via the toolbar, or spawn tokens to begin.</p>
          </div>
        </div>
      {/if}
    </div>

    <!-- Token sidebar -->
    {#if tokens.length > 0}
      <div class="w-44 border-l border-slate-800 bg-slate-900 flex flex-col overflow-hidden shrink-0">
        <div class="px-3 py-2 border-b border-slate-800 shrink-0">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tokens ({tokens.length})</p>
        </div>
        <div class="flex-1 overflow-y-auto p-2 space-y-1.5">
          {#each tokens as tok (tok.id)}
            <div class="flex items-center gap-2 px-2 py-1.5 bg-slate-800/60 rounded-lg">
              <div class="w-4 h-4 rounded shrink-0" style="background:{tok.color}"></div>
              <div class="flex-1 min-w-0">
                <p class="text-[11px] font-semibold text-slate-300 truncate">{tok.name}</p>
                <p class="text-[9px] font-mono text-slate-600">[{tok.x},{tok.y}]</p>
              </div>
              <button onclick={() => removeToken(tok.id)} class="text-slate-600 hover:text-rose-400 text-[10px] transition-colors">✕</button>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>
