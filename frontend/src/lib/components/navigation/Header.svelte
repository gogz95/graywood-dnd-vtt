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
  }: {
    campaignName?: string;
    onOpenSettings?: () => void;
    onOpenPlayerPortal?: () => void;
    onToggleCombat?: () => void;
  } = $props();

  let isCastMenuOpen = $state(false);

  // Standardized 6 Core Workspace Views (Part 2)
  const PRIMARY_VIEWS: Array<{ id: ActiveWorkspaceView; label: string; icon: string; title: string }> = [
    { id: 'canvas',     label: 'Tactical Canvas',   icon: '⚔️', title: 'Tactical Battlemap & Token Grid' },
    { id: 'atlas',      label: 'World Atlas',       icon: '🗺️', title: 'Overland World Atlas Vector Map' },
    { id: 'bestiary',   label: 'Bestiary',          icon: '🐉', title: 'Full-Page 5e SRD Bestiary & Monster Management' },
    { id: 'compendium', label: 'Compendium',        icon: '📚', title: 'Rules, Spells, Items & Sourcebooks' },
    { id: 'party',      label: 'Party & Roster',    icon: '👥', title: 'Active Party Stats, HP, Conditions & Loot' },
    { id: 'journal',    label: 'Journal & Handouts', icon: '📜', title: 'Handouts, Notes & Lore Chronicle' },
  ];

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
       CENTER: STANDARDIZED 6 PRIMARY WORKSPACE TABS (Part 2)
  ══════════════════════════════════════════════════════════════════════════ -->
  <nav class="flex items-center gap-1 bg-slate-950 border border-slate-800/80 rounded-xl p-0.5 shadow-inner">
    {#each PRIMARY_VIEWS as view}
      {@const isActive = uiStore.activeView === view.id}
      <button
        type="button"
        onclick={() => uiStore.setActiveView(view.id)}
        class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 {isActive
          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'}"
        title={view.title}
      >
        <span>{view.icon}</span>
        <span class="hidden lg:inline">{view.label}</span>
      </button>
    {/each}
  </nav>

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

    <!-- Audio / Ambient Mixer Toggle Button (Part 1.3) -->
    <button
      type="button"
      onclick={toggleAudioMixer}
      class="p-1.5 rounded-lg border text-sm transition-colors {floatingWindowsStore.windows.audio.isOpen || uiStore.isSoundboardOpen
        ? 'bg-indigo-700 text-white border-indigo-600'
        : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border-slate-800'}"
      title="Audio Studio & Ambient Soundboard Mixer"
      aria-label="Audio Mixer"
    >
      🎵
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

    <!-- Quick Drawers: Combat HUD & Dice Tray -->
    <div class="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs">
      <button
        type="button"
        onclick={onToggleCombat}
        class="px-2 py-1 rounded text-[10px] font-bold text-slate-400 hover:text-slate-200 transition-colors"
        title="Combat Tracker & Initiative Strip"
      >
        ⚔️
      </button>

      <button
        type="button"
        onclick={() => chatStore.toggle()}
        class="px-2 py-1 rounded text-[10px] font-bold transition-colors {chatStore.isOpen ? 'bg-amber-500 text-slate-950 font-black' : 'text-amber-400 hover:text-amber-300'}"
        title="Session Chat & Universal Dice Log"
      >
        🎲
      </button>
    </div>

    <!-- Settings Gear Button (Part 1.4) -->
    <button
      type="button"
      onclick={onOpenSettings}
      class="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors text-sm"
      title="Settings & Campaign Persistence"
      aria-label="Settings"
    >
      ⚙️
    </button>
  </div>
</header>
