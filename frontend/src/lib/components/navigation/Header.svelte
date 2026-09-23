<!-- src/lib/components/navigation/Header.svelte -->
<!-- Clean Top Workspace Header with Brand, Standardized 6 Views, Cast Dropdown & Utilities -->

<script lang="ts">
  import { uiStore, type ActiveWorkspaceView } from '../../stores/uiStore.svelte';
  import { chatStore } from '../../stores/chatStore.svelte';
  import { floatingWindowsStore } from '../../stores/floatingWindowsStore.svelte';
  import { projectorStore } from '../../stores/projectorStore.svelte';
  import { broadcaster } from '../../services/broadcaster';
  import CalendarDisplayWidget from './CalendarDisplayWidget.svelte';

  let {
    campaignName = 'Default Campaign',
    onOpenSettings = () => { uiStore.isSettingsOpen = true; },
    onOpenPlayerPortal = () => {},
    onToggleCombat = () => {},
    onToggleCompendium = () => {},
    onOpenIngest = () => {},
    isCompendiumOpen = false,
  }: {
    campaignName?: string;
    onOpenSettings?: () => void;
    onOpenPlayerPortal?: () => void;
    onToggleCombat?: () => void;
    onToggleCompendium?: () => void;
    onOpenIngest?: () => void;
    isCompendiumOpen?: boolean;
  } = $props();

  let isCastMenuOpen = $state(false);



  function setCastSource(source: 'battlemap' | 'atlas' | 'blackout') {
    projectorStore.setCastingSource(source);
    isCastMenuOpen = false;
  }

  function handleCastHandout() {
    isCastMenuOpen = false;
    const promptTitle = prompt('Handout Title / Name:');
    if (!promptTitle) return;
    const promptUrl = prompt('Image / Handout URL (or leave blank for demo scroll):');
    broadcaster.showHandout({
      mediaId: `cast-${Date.now()}`,
      title: promptTitle,
      url: promptUrl || 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=1200&q=80',
      caption: 'Cast to Player & Projector Screen from DM Workstation',
    });
  }

  function openProjectorTab() {
    isCastMenuOpen = false;
    if (typeof window !== 'undefined') {
      window.open('/projector', '_blank');
    }
  }

  function toggleAudioMixer() {
    uiStore.isSoundboardOpen = !uiStore.isSoundboardOpen;
    floatingWindowsStore.toggleWindow('audio');
  }
</script>

<header class="h-11 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 z-30 shrink-0 select-none">
  <!-- ═════════════════════════════════════════════════════════════════════════
       LEFT: BRAND & CAMPAIGN IDENTIFIER
  ══════════════════════════════════════════════════════════════════════════ -->
  <div class="flex items-center gap-2.5 min-w-0">
    <div class="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/60 shrink-0"></div>
    <span class="font-black text-xs text-slate-200 uppercase tracking-widest whitespace-nowrap">
      Graywood VTT
    </span>
    <span class="text-slate-700 text-xs hidden sm:inline">|</span>
    <span class="text-xs text-slate-400 font-semibold truncate max-w-[110px] md:max-w-xs" title={campaignName}>
      {campaignName}
    </span>
  </div>

  <!-- ═════════════════════════════════════════════════════════════════════════
       CENTER: ACTIVE WORKSPACE CONTEXT BADGE (Top Tabs moved to SidebarNav)
  ══════════════════════════════════════════════════════════════════════════ -->
  <div class="hidden md:flex items-center gap-2 px-3 py-1 bg-slate-950/60 border border-slate-800/80 rounded-xl text-xs">
    <span class="text-slate-500 font-medium">Workspace:</span>
    <span class="font-bold text-slate-200 capitalize flex items-center gap-1.5">
      {#if uiStore.activeView === 'canvas'}
        <span>⚔️</span> Tactical Canvas
      {:else if uiStore.activeView === 'atlas'}
        <span>🗺️</span> World Atlas
      {:else if uiStore.activeView === 'bestiary'}
        <span>🐉</span> Bestiary
      {:else if uiStore.activeView === 'compendium'}
        <span>📚</span> Compendium
      {:else if uiStore.activeView === 'party'}
        <span>👥</span> Party & Roster
      {:else if uiStore.activeView === 'journal'}
        <span>📜</span> Journal & Lore
      {/if}
    </span>
  </div>

  <!-- ═════════════════════════════════════════════════════════════════════════
       RIGHT: UTILITY TRAY & MODAL CONTROLS (Part 1)
  ══════════════════════════════════════════════════════════════════════════ -->
  <div class="flex items-center gap-1.5 shrink-0 relative">
    <!-- Calendar Pill -->
    <div class="hidden xl:block">
      <CalendarDisplayWidget />
    </div>

    <!-- Compact Projector / Cast Dropdown Menu (Part 1.2) -->
    <div class="relative">
      <button
        type="button"
        onclick={() => isCastMenuOpen = !isCastMenuOpen}
        class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all border flex items-center gap-1.5 {isCastMenuOpen || projectorStore.castSource !== 'blackout'
          ? 'bg-indigo-950/80 text-indigo-300 border-indigo-700/80 shadow-sm'
          : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border-slate-800'}"
        title="Projector Screen & Player Screen Casting Controls"
      >
        <span class="text-sm">📺</span>
        <span class="hidden md:inline">Cast</span>
        <span class="text-[9px] text-slate-500">▼</span>
      </button>

      {#if isCastMenuOpen}
        <!-- Backdrop click-catcher -->
        <div
          class="fixed inset-0 z-40"
          onclick={() => isCastMenuOpen = false}
          role="presentation"
        ></div>

        <!-- Sleek Dropdown -->
        <div class="absolute right-0 top-full mt-1.5 z-50 w-60 bg-slate-900 border border-slate-700/90 rounded-xl shadow-2xl py-1.5 text-xs animate-in fade-in zoom-in-95">
          <div class="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-500 border-b border-slate-800">
            Projector Stream Target
          </div>

          <button
            type="button"
            onclick={() => setCastSource('battlemap')}
            class="w-full text-left px-3 py-2 flex items-center justify-between hover:bg-slate-800 text-slate-200 transition-colors {projectorStore.castSource === 'battlemap' ? 'text-indigo-400 font-bold bg-slate-800/50' : ''}"
          >
            <span class="flex items-center gap-2">
              <span>⚔️</span>
              <span>Show Active Battlemap</span>
            </span>
            {#if projectorStore.castSource === 'battlemap'}
              <span class="text-[10px] text-indigo-400">LIVE</span>
            {/if}
          </button>

          <button
            type="button"
            onclick={() => setCastSource('atlas')}
            class="w-full text-left px-3 py-2 flex items-center justify-between hover:bg-slate-800 text-slate-200 transition-colors {projectorStore.castSource === 'atlas' ? 'text-indigo-400 font-bold bg-slate-800/50' : ''}"
          >
            <span class="flex items-center gap-2">
              <span>🗺️</span>
              <span>Show World Atlas</span>
            </span>
            {#if projectorStore.castSource === 'atlas'}
              <span class="text-[10px] text-indigo-400">LIVE</span>
            {/if}
          </button>

          <button
            type="button"
            onclick={handleCastHandout}
            class="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-800 text-slate-200 transition-colors"
          >
            <span>📜</span>
            <span>Show Handout / Art</span>
          </button>

          <div class="my-1 border-t border-slate-800"></div>

          <button
            type="button"
            onclick={() => setCastSource(projectorStore.castSource === 'blackout' ? 'battlemap' : 'blackout')}
            class="w-full text-left px-3 py-2 flex items-center justify-between hover:bg-slate-800 text-slate-200 transition-colors"
          >
            <span class="flex items-center gap-2">
              <span>🌑</span>
              <span>Toggle Blackout Curtain</span>
            </span>
            {#if projectorStore.castSource === 'blackout'}
              <span class="text-[10px] text-amber-400 font-bold">BLACKOUT</span>
            {/if}
          </button>

          <button
            type="button"
            onclick={openProjectorTab}
            class="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-800 text-indigo-300 font-semibold transition-colors"
          >
            <span>↗</span>
            <span>Open Projector Screen (New Tab)</span>
          </button>
        </div>
      {/if}
    </div>

    <!-- 🏛️ Compendium Quick Tray Toggle (Ctrl+B) -->
    <button
      type="button"
      onclick={onToggleCompendium}
      class="px-2.5 py-1 text-xs font-bold rounded-lg border transition-all flex items-center gap-1.5 {isCompendiumOpen
        ? 'bg-cyan-950/80 text-cyan-300 border-cyan-700/80 shadow-sm'
        : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border-slate-800'}"
      title="5e SRD Compendium Browser (Ctrl+B)"
    >
      <span>🏛️</span>
      <span class="hidden md:inline">Compendium</span>
    </button>

    <!-- 📥 Ingestion Quick-Drop Toggle (Ctrl+I) -->
    <button
      type="button"
      onclick={onOpenIngest}
      class="px-2.5 py-1 text-xs font-bold rounded-lg border transition-all flex items-center gap-1.5 bg-slate-950 hover:bg-slate-800 text-slate-300 border-slate-800"
      title="Quick Ingest Campaign Assets (Ctrl+I)"
    >
      <span>📥</span>
      <span class="hidden md:inline">Ingest</span>
    </button>

    <!-- Player Join Portal Button -->
    <button
      type="button"
      onclick={onOpenPlayerPortal}
      class="px-2.5 py-1 text-xs font-bold rounded-lg border transition-all flex items-center gap-1.5 bg-indigo-950/70 hover:bg-indigo-900/80 text-indigo-300 border-indigo-800/50"
      title="Open Scannable QR Code & Player Mobile Companion Portal"
    >
      <span>📱</span>
      <span class="hidden md:inline">Portal</span>
    </button>

    <!-- Universal Dice Tray & Session Chat Toggle -->
    <button
      type="button"
      onclick={() => chatStore.toggle()}
      class="px-2.5 py-1 rounded-lg text-xs font-bold transition-colors border {chatStore.isOpen
        ? 'bg-amber-500 text-slate-950 border-amber-400 font-black shadow'
        : 'bg-slate-950 hover:bg-slate-800 text-amber-400 border-slate-800'}"
      title="Session Chat & Universal Dice Log"
    >
      <span>🎲</span>
      <span class="hidden md:inline ml-1">Dice</span>
    </button>
  </div>
</header>
