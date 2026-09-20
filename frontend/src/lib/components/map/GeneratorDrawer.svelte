<script lang="ts">
  // GeneratorDrawer.svelte — Native Cartography Workbench & Generator Integration
  // Embeds Watabou City, Azgaar Fantasy Map, and One Page Dungeon in sandboxed iframes.
  // Ingests raster/SVG maps to battle mat canvas and initiates 2-click grid calibration.

  import { canvasStore } from '../../../stores/canvasStore.svelte';
  import { audioEngine } from '../../audio/AudioEngine';

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

  function handleExportToCanvas() {
    if (customMapUrl.trim()) {
      applyMapTexture(customMapUrl.trim());
      return;
    }

    // Default procedural placeholder if direct cross-origin iframe capture blocked
    feedbackMessage = 'Paste direct map image URL or drop exported image below.';
    setTimeout(() => { feedbackMessage = null; }, 3000);
  }

  function applyMapTexture(url: string) {
    canvasStore.setBackgroundTexture(url);
    audioEngine.triggerSfx('sfx-secret');
    feedbackMessage = 'Map bound to battle mat! Grid calibration ready.';

    // Automatically trigger scale-calibration overlay callback
    if (onOpenCalibration) {
      onOpenCalibration();
    } else {
      window.dispatchEvent(new CustomEvent('vtt:open-grid-calibration'));
    }

    setTimeout(() => {
      feedbackMessage = null;
      isOpen = false;
    }, 1500);
  }

  async function handlePasteFromClipboard() {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find(t => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const objUrl = URL.createObjectURL(blob);
          applyMapTexture(objUrl);
          return;
        }
      }
      const text = await navigator.clipboard.readText();
      if (text && (text.startsWith('http') || text.startsWith('data:image'))) {
        applyMapTexture(text.trim());
        return;
      }
      feedbackMessage = 'No image found in clipboard.';
      setTimeout(() => { feedbackMessage = null; }, 2500);
    } catch (e) {
      feedbackMessage = 'Clipboard permission denied. Use file upload or URL.';
      setTimeout(() => { feedbackMessage = null; }, 2500);
    }
  }

  function handleFileDrop(e: DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const objUrl = URL.createObjectURL(file);
      applyMapTexture(objUrl);
    }
  }

  function handleFileInput(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file && file.type.startsWith('image/')) {
      const objUrl = URL.createObjectURL(file);
      applyMapTexture(objUrl);
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
            <p class="text-[11px] text-slate-400">Native embedded generators &amp; tactical stage export</p>
          </div>
        </div>

        <!-- Tab Pills -->
        <div class="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800">
          {#each TABS as tab}
            <button
              onclick={() => activeTab = tab.id}
              class="px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 {activeTab === tab.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}"
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          {/each}
        </div>

        <button
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
          <button
            onclick={handleExportToCanvas}
            class="px-4 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-xs rounded-lg shadow-md transition-all active:scale-95 flex items-center gap-1.5"
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
