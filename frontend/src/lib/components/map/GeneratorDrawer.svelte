<script lang="ts">
  // GeneratorDrawer.svelte
  // Native Procedural Canvas Generators & External Cartography Push Pipeline to Tactical Mat
  // Features Error-Guarded Canvas Context Export and Direct dispatchMapToBattlemat Integration

  import { onMount } from 'svelte';
  import { canvasStore } from '../../../stores/canvasStore.svelte';
  import { audioEngine } from '../../audio/AudioEngine';
  import { dispatchMapToBattlemat } from '../../services/mapDispatchService';
  import {
    parseGeoJsonToWalls,
    generateChamberColliders,
    generateDungeonCryptColliders
  } from '../../services/vectorMapParser';

  let {
    isOpen = $bindable(false),
    onOpenCalibration
  }: {
    isOpen?: boolean;
    onOpenCalibration?: () => void;
  } = $props();

  type GeneratorTab = 'watabou_city' | 'azgaar_atlas' | 'one_page_dungeon';
  let activeTab = $state<GeneratorTab>('watabou_city');

  // Input for custom URL or clipboard image
  let customMapUrl = $state('');
  let feedbackMessage = $state<string | null>(null);
  let isGenerating = $state(false);

  const TABS = [
    {
      id: 'watabou_city' as GeneratorTab,
      label: 'Watabou Medieval City',
      icon: '🏰',
      url: 'https://watabou.github.io/city-generator/',
      description: 'Procedural settlements, defensive walls, docks & ward districts.'
    },
    {
      id: 'azgaar_atlas' as GeneratorTab,
      label: 'Azgaar Archipelago Map',
      icon: '🗺️',
      url: 'https://azgaar.github.io/Fantasy-Map-Generator/',
      description: 'Regional geographic archipelago & political terrain generator.'
    },
    {
      id: 'one_page_dungeon' as GeneratorTab,
      label: 'One Page Dungeon',
      icon: '🗝️',
      url: 'https://watabou.github.io/one-page-dungeon/',
      description: 'Subterranean corridors, room nodes, trapped vaults & water features.'
    },
  ];

  let currentTabDef = $derived(TABS.find(t => t.id === activeTab) || TABS[0]);

  /**
   * Safely extracts Blob or Data URL from HTMLCanvasElement with fallback for WebGL/offscreen failures.
   */
  async function canvasToBlobGuarded(canvas: HTMLCanvasElement): Promise<Blob | string> {
    return new Promise((resolve, reject) => {
      try {
        if (typeof canvas.toBlob === 'function') {
          canvas.toBlob((blob) => {
            if (blob) {
              resolve(blob);
            } else {
              try {
                const dataUrl = canvas.toDataURL('image/png');
                resolve(dataUrl);
              } catch (err) {
                reject(err);
              }
            }
          }, 'image/png');
        } else {
          const dataUrl = canvas.toDataURL('image/png');
          resolve(dataUrl);
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Applies the map texture directly to the tactical battlemat canvas and projector.
   */
  async function applyMapTexture(
    source: Blob | string,
    options: { name?: string; gridSize?: number; gridCols?: number; gridRows?: number; walls?: any[] } = {}
  ) {
    try {
      const wallCount = options.walls?.length || 0;
      await dispatchMapToBattlemat({
        imageBlob: source,
        name: options.name || 'Generated Battlemat',
        gridSize: options.gridSize || 60,
        gridCols: options.gridCols,
        gridRows: options.gridRows,
        walls: options.walls
      });

      audioEngine.triggerSfx('sfx-secret');
      feedbackMessage = `⚡ Map pushed to Tactical Canvas: ${wallCount} walls loaded!`;

      if (onOpenCalibration) {
        onOpenCalibration();
      } else {
        window.dispatchEvent(new CustomEvent('vtt:open-grid-calibration'));
      }

      setTimeout(() => {
        feedbackMessage = null;
        isOpen = false;
      }, 1200);
    } catch (e) {
      feedbackMessage = 'Failed to push map to battlemat.';
      setTimeout(() => { feedbackMessage = null; }, 2500);
    }
  }

  // ── Generator 1: Procedural Arena / Hall Chamber ─────────────────────────────
  async function generateProceduralChamber() {
    isGenerating = true;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1800;
      canvas.height = 1200;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not acquire 2D canvas context');

      // Base stone floor
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const cell = 60;
      ctx.strokeStyle = 'rgba(71, 85, 105, 0.35)';
      ctx.lineWidth = 1.5;
      for (let x = 0; x < canvas.width; x += cell) {
        for (let y = 0; y < canvas.height; y += cell) {
          ctx.fillStyle = ((x / cell) + (y / cell)) % 2 === 0 ? '#1e293b' : '#172033';
          ctx.fillRect(x, y, cell, cell);
          ctx.strokeRect(x, y, cell, cell);
        }
      }

      // Chamber stone columns
      const pillars = [
        { x: 360, y: 360 }, { x: 720, y: 360 }, { x: 1080, y: 360 }, { x: 1440, y: 360 },
        { x: 360, y: 840 }, { x: 720, y: 840 }, { x: 1080, y: 840 }, { x: 1440, y: 840 }
      ];

      for (const p of pillars) {
        ctx.fillStyle = '#334155';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 26, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      // Outer fortification borders
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 6;
      ctx.strokeRect(120, 120, 1560, 960);

      // Vignette lighting
      const grad = ctx.createRadialGradient(900, 600, 300, 900, 600, 950);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(2,6,23,0.7)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const payload = await canvasToBlobGuarded(canvas);
      await applyMapTexture(payload, {
        name: `Procedural Great Hall Chamber #${Math.floor(Math.random() * 9000 + 1000)}`,
        gridSize: 60,
        gridCols: 30,
        gridRows: 20,
        walls: generateChamberColliders(canvas.width, canvas.height, cell, pillars.map(p => ({ x: p.x, y: p.y, r: 26 })))
      });
    } catch {
      feedbackMessage = 'Failed generating procedural chamber.';
      setTimeout(() => { feedbackMessage = null; }, 2500);
    } finally {
      isGenerating = false;
    }
  }

  // ── Generator 2: Subterranean Crypt & Corridors ──────────────────────────────
  async function generateDungeonCrypt() {
    isGenerating = true;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1920;
      canvas.height = 1440;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not acquire 2D canvas context');

      // Dark background void
      ctx.fillStyle = '#05070e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const cell = 60;

      // Draw paved rooms
      const rooms = [
        { x: 3, y: 3, w: 10, h: 8, label: 'Entry Crypt' },
        { x: 19, y: 3, w: 10, h: 8, label: 'Reliquary Vault' },
        { x: 11, y: 13, w: 10, h: 9, label: 'Central Sanctum' },
      ];

      // Hallway corridors connecting rooms
      const corridors = [
        { x: 8, y: 11, w: 2, h: 4 },
        { x: 22, y: 11, w: 2, h: 4 },
        { x: 13, y: 6, w: 6, h: 2 },
      ];

      ctx.lineWidth = 1;
      const drawTiledArea = (gx: number, gy: number, gw: number, gh: number) => {
        for (let ix = 0; ix < gw; ix++) {
          for (let iy = 0; iy < gh; iy++) {
            const px = (gx + ix) * cell;
            const py = (gy + iy) * cell;
            ctx.fillStyle = (ix + iy) % 2 === 0 ? '#1e293b' : '#182234';
            ctx.fillRect(px, py, cell, cell);
            ctx.strokeStyle = 'rgba(71, 85, 105, 0.4)';
            ctx.strokeRect(px, py, cell, cell);
          }
        }
      };

      for (const r of rooms) drawTiledArea(r.x, r.y, r.w, r.h);
      for (const c of corridors) drawTiledArea(c.x, c.y, c.w, c.h);

      // Sarcophagus / central altar in sanctum
      const sanctumX = 14 * cell;
      const sanctumY = 16 * cell;
      ctx.fillStyle = '#475569';
      ctx.fillRect(sanctumX, sanctumY, cell * 4, cell * 2);
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 3;
      ctx.strokeRect(sanctumX, sanctumY, cell * 4, cell * 2);

      // Crypt room walls
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 5;
      for (const r of rooms) {
        ctx.strokeRect(r.x * cell, r.y * cell, r.w * cell, r.h * cell);
      }

      // Vignette effect
      const grad = ctx.createRadialGradient(960, 720, 250, 960, 720, 1100);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(5,7,14,0.8)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const payload = await canvasToBlobGuarded(canvas);
      await applyMapTexture(payload, {
        name: `Subterranean Crypt Dungeon #${Math.floor(Math.random() * 9000 + 1000)}`,
        gridSize: 60,
        gridCols: 32,
        gridRows: 24,
        walls: generateDungeonCryptColliders(rooms, corridors, cell)
      });
    } catch {
      feedbackMessage = 'Failed generating dungeon crypt.';
      setTimeout(() => { feedbackMessage = null; }, 2500);
    } finally {
      isGenerating = false;
    }
  }

  // ── Generator 3: External Tool / Custom Export Push ─────────────────────────
  function handleExportToCanvas() {
    if (customMapUrl.trim()) {
      applyMapTexture(customMapUrl.trim(), { name: `${currentTabDef.label} Export` });
      return;
    }
    feedbackMessage = 'Paste direct map image URL or use generator buttons below.';
    setTimeout(() => { feedbackMessage = null; }, 3000);
  }

  function handleIframeMessage(e: MessageEvent) {
    if (!e.data) return;
    if (typeof e.data === 'string' && (e.data.startsWith('data:image') || e.data.startsWith('blob:'))) {
      applyMapTexture(e.data, { name: `${currentTabDef.label} Export` });
    } else if (e.data?.type === 'MAP_EXPORT' && e.data?.image) {
      applyMapTexture(e.data.image, { name: e.data.name || 'Exported Map', gridSize: e.data.gridSize });
    }
  }

  onMount(() => {
    window.addEventListener('message', handleIframeMessage);
    return () => {
      window.removeEventListener('message', handleIframeMessage);
    };
  });

  async function handlePasteFromClipboard() {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find(t => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          applyMapTexture(blob, { name: 'Clipboard Map' });
          return;
        }
      }
      const text = await navigator.clipboard.readText();
      if (text && (text.startsWith('http') || text.startsWith('data:image'))) {
        applyMapTexture(text.trim(), { name: 'Clipboard Map' });
        return;
      }
      feedbackMessage = 'No image found in clipboard.';
      setTimeout(() => { feedbackMessage = null; }, 2500);
    } catch {
      feedbackMessage = 'Clipboard permission denied. Use file upload or URL.';
      setTimeout(() => { feedbackMessage = null; }, 2500);
    }
  }

  async function processImportedFile(file: File) {
    const lower = file.name.toLowerCase();
    if (file.type.startsWith('image/')) {
      await applyMapTexture(file, { name: file.name.replace(/\.[^/.]+$/, '') });
      return;
    }

    if (lower.endsWith('.geojson') || lower.endsWith('.json')) {
      try {
        const text = await file.text();
        const parsed = parseGeoJsonToWalls(text, { targetWidth: 1920, targetHeight: 1080, padding: 60 });
        if (parsed.walls.length > 0) {
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1200, parsed.bounds.width);
          canvas.height = Math.max(800, parsed.bounds.height);
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2;
            for (const w of parsed.walls) {
              ctx.beginPath();
              ctx.moveTo(w.x1, w.y1);
              ctx.lineTo(w.x2, w.y2);
              ctx.stroke();
            }
          }
          const blob = await canvasToBlobGuarded(canvas);
          await applyMapTexture(blob, {
            name: file.name.replace(/\.[^/.]+$/, ''),
            walls: parsed.walls,
            gridSize: 60
          });
          return;
        }
      } catch (err) {
        console.error('[GeoJsonImport] Error parsing vector file:', err);
      }
    }
  }

  function handleFileDrop(e: DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      processImportedFile(file);
    }
  }

  function handleFileInput(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      processImportedFile(file);
    }
  }
</script>

{#if isOpen}
  <!-- Slide-out Drawer Panel -->
  <div
    role="presentation"
    class="fixed inset-0 bg-black/60 z-50 flex justify-end"
    onclick={(e) => { if (e.target === e.currentTarget) isOpen = false; }}
  >
    <div class="w-full max-w-5xl bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col h-full overflow-hidden animate-in slide-in-from-right duration-200">

      <!-- Header -->
      <div class="px-6 py-3.5 border-b border-slate-800 bg-slate-950 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-3">
          <span class="text-2xl">🧭</span>
          <div>
            <h2 class="text-sm font-black text-slate-100 uppercase tracking-wider">Cartography Workbench</h2>
            <p class="text-[11px] text-slate-400">Native embedded generators &amp; tactical stage dispatch</p>
          </div>
        </div>

        <!-- Tab Pills -->
        <div class="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800">
          {#each TABS as tab}
            <button
              type="button"
              onclick={() => activeTab = tab.id}
              class="px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 {activeTab === tab.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}"
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          {/each}
        </div>

        <button
          type="button"
          onclick={() => isOpen = false}
          class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-sm"
        >
          ✕
        </button>
      </div>

      <!-- Action & Export Bar -->
      <div class="px-6 py-2.5 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between gap-4 shrink-0 flex-wrap">
        <div class="flex items-center gap-3 flex-1 min-w-[280px]">
          <input
            type="text"
            bind:value={customMapUrl}
            placeholder="Paste exported map image / SVG URL..."
            class="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 placeholder:text-slate-600"
          />
          <button
            type="button"
            onclick={handlePasteFromClipboard}
            class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors"
            title="Paste image directly from clipboard"
          >
            📋 Paste Clipboard
          </button>
          <label class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg border border-slate-700 cursor-pointer flex items-center gap-1.5 transition-colors">
            📁 Upload File
            <input type="file" accept="image/*,.svg" class="hidden" onchange={handleFileInput} />
          </label>
        </div>

        <div class="flex items-center gap-2">
          {#if feedbackMessage}
            <span class="text-xs font-bold text-amber-300 animate-pulse">{feedbackMessage}</span>
          {/if}

          <!-- Generator 1: Procedural Arena Generator -->
          <button
            type="button"
            onclick={generateProceduralChamber}
            disabled={isGenerating}
            class="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-slate-950 font-black text-xs rounded-lg shadow-md transition-all active:scale-95 flex items-center gap-1.5"
            title="Procedurally generate a complete tactical encounter chamber and push directly to battlemat"
          >
            <span>⚔️</span>
            <span>Push Arena</span>
          </button>

          <!-- Generator 2: Subterranean Crypt Generator -->
          <button
            type="button"
            onclick={generateDungeonCrypt}
            disabled={isGenerating}
            class="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-black text-xs rounded-lg shadow-md transition-all active:scale-95 flex items-center gap-1.5"
            title="Procedurally generate a subterranean crypt dungeon with corridors and push directly to battlemat"
          >
            <span>🗝️</span>
            <span>Push Crypt</span>
          </button>

          <!-- Generator 3: External Tool Export -->
          <button
            type="button"
            onclick={handleExportToCanvas}
            disabled={isGenerating}
            class="px-4 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 disabled:opacity-50 text-slate-950 font-black text-xs rounded-lg shadow-md transition-all active:scale-95 flex items-center gap-1.5"
            title="Transfer exported texture to battlemat and initiate 2-click grid calibration"
          >
            <span>🎯</span>
            <span>Push to Battlemat</span>
          </button>
        </div>
      </div>

      <!-- Embedded Iframe Viewport -->
      <div
        class="flex-1 relative bg-slate-950 flex flex-col min-h-0"
        ondragover={(e) => e.preventDefault()}
        ondrop={handleFileDrop}
        role="region"
        aria-label="Embedded Cartography Viewport"
      >
        <iframe
          src={currentTabDef.url}
          title={currentTabDef.label}
          class="w-full h-full border-none flex-1"
          sandbox="allow-scripts allow-same-origin allow-downloads allow-forms allow-popups"
          allow="accelerometer; gyroscope"
        ></iframe>

        <!-- Quick Calibration Callout in Footer -->
        <div class="px-4 py-2 border-t border-slate-800 bg-slate-950/90 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
          <span>{currentTabDef.description}</span>
          <span class="font-mono text-indigo-400 font-semibold">2-Click Grid Calibration activates on export</span>
        </div>
      </div>

    </div>
  </div>
{/if}
