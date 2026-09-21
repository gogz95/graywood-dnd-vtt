<script lang="ts">
  // SoundboardDrawer.svelte — Floating Multi-Bus Ambient & SFX Soundboard Overlay
  // Strict Zero-Blur Directive: No full-screen dimming, no backdrop blur.
  // Floats at bottom-right or docked with drag/minimize so tactical mat stays 100% visible.

  import { onMount, onDestroy } from 'svelte';
  import { audioEngine, type SfxEntry, type TrackEntry } from '../../audio/AudioEngine';
  import { floatingWindowsStore } from '../../stores/floatingWindowsStore.svelte';

  let {
    isOpen = $bindable(false),
    isMinimized = $bindable(false)
  }: {
    isOpen?: boolean;
    isMinimized?: boolean;
  } = $props();

  // Multi-bus volume states
  let masterVol = $state(audioEngine.getMasterVolume());
  let ambienceVol = $state(audioEngine.getAmbienceVolume());
  let combatMusicVol = $state(audioEngine.getCombatMusicVolume());
  let sfxVol = $state(audioEngine.getSfxVolume());

  // Tracks and SFX buttons
  let tracks = $state<TrackEntry[]>([...audioEngine.getTracks()]);
  let sfxButtons = $state<SfxEntry[]>([...audioEngine.getSfxButtons()]);
  let activeTrackId = $state<string | null>(audioEngine.getActiveTrackId());

  // Feedback on trigger
  let lastTriggeredSfx = $state<string | null>(null);
  let feedbackTimer: ReturnType<typeof setTimeout> | null = null;

  // Dragging state
  let isDragging = $state(false);
  let panelX = $state<number | null>(null);
  let panelY = $state<number | null>(null);
  let dragOffset = { x: 0, y: 0 };

  // Polling to keep track status in sync
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  function handleKeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return;
    }

    const numpadMap: Record<string, number> = {
      Numpad1: 1, Numpad2: 2, Numpad3: 3, Numpad4: 4, Numpad5: 5,
      Numpad6: 6, Numpad7: 7, Numpad8: 8, Numpad9: 9,
      Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4, Digit5: 5,
      Digit6: 6, Digit7: 7, Digit8: 8, Digit9: 9,
    };

    const key = numpadMap[e.code];
    if (key !== undefined) {
      const sfx = sfxButtons.find(s => s.hotkey === key);
      if (sfx) {
        triggerSfxWithoutFocus(sfx.id, sfx.label);
      }
    }
  }

  function triggerSfxWithoutFocus(sfxId: string, label: string) {
    audioEngine.triggerSfx(sfxId);
    lastTriggeredSfx = label;
    if (feedbackTimer) clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => {
      lastTriggeredSfx = null;
    }, 1200);
  }

  function handlePointerDown(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('button, input')) return;
    isDragging = true;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dragOffset = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
  }

  function handlePointerMove(e: MouseEvent) {
    if (!isDragging) return;
    panelX = Math.max(10, Math.min(window.innerWidth - 380, e.clientX - dragOffset.x));
    panelY = Math.max(10, Math.min(window.innerHeight - 80, e.clientY - dragOffset.y));
  }

  function handlePointerUp() {
    isDragging = false;
    window.removeEventListener('mousemove', handlePointerMove);
    window.removeEventListener('mouseup', handlePointerUp);
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
    pollInterval = setInterval(() => {
      activeTrackId = audioEngine.getActiveTrackId();
      tracks = [...audioEngine.getTracks()];
      sfxButtons = [...audioEngine.getSfxButtons()];
    }, 500);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeydown);
    window.removeEventListener('mousemove', handlePointerMove);
    window.removeEventListener('mouseup', handlePointerUp);
    if (pollInterval) clearInterval(pollInterval);
    if (feedbackTimer) clearTimeout(feedbackTimer);
  });

  // Volume handlers
  function updateMaster(val: number) {
    masterVol = val;
    audioEngine.setMasterVolume(val);
  }

  function updateAmbience(val: number) {
    ambienceVol = val;
    audioEngine.setAmbienceVolume(val);
  }

  function updateCombatMusic(val: number) {
    combatMusicVol = val;
    audioEngine.setCombatMusicVolume(val);
  }

  function updateSfx(val: number) {
    sfxVol = val;
    audioEngine.setSfxVolume(val);
  }

  function toggleTrack(id: string) {
    if (activeTrackId === id) {
      audioEngine.stopTrack();
      activeTrackId = null;
    } else {
      audioEngine.playTrack(id);
      activeTrackId = id;
    }
  }

  // Pre-configured instant trigger tiles
  const INSTANT_TILES = [
    { id: 'sfx-nat20',  label: 'Nat 20',      icon: '🌟', hotkey: '7', color: 'from-amber-600 to-yellow-500' },
    { id: 'sfx-nat1',   label: 'Nat 1',       icon: '💀', hotkey: '8', color: 'from-rose-700 to-red-600' },
    { id: 'sfx-clash',  label: 'Clash',       icon: '⚔️', hotkey: null, color: 'from-slate-700 to-slate-600' },
    { id: 'sfx-combat', label: 'Combat Pulse',icon: '🎺', hotkey: '5', color: 'from-orange-700 to-amber-700' },
    { id: 'sfx-roar',   label: 'Beast Roar',  icon: '🐉', hotkey: '9', color: 'from-emerald-700 to-teal-700' },
    { id: 'sfx-secret', label: 'Secret Chime',icon: '✨', hotkey: '6', color: 'from-cyan-700 to-blue-700' },
    { id: 'sfx-bell',   label: 'Bell Warning',icon: '🔔', hotkey: '2', color: 'from-indigo-700 to-purple-700' },
    { id: 'sfx-rest',   label: 'Short Rest',  icon: '🏕️', hotkey: '4', color: 'from-violet-700 to-purple-800' },
    { id: 'sfx-door',   label: 'Dungeon Door',icon: '🚪', hotkey: '3', color: 'from-stone-700 to-stone-600' },
    { id: 'sfx-dice',   label: 'Dice Roll',   icon: '🎲', hotkey: '1', color: 'from-slate-700 to-zinc-700' },
  ];
</script>

{#if isOpen || floatingWindowsStore.windows.audio.isOpen}
  <div
    style={panelX !== null && panelY !== null
      ? `position: fixed; left: ${panelX}px; top: ${panelY}px; z-index: 9999; width: 440px; max-height: 85vh;`
      : 'position: fixed; right: 24px; top: 64px; z-index: 9999; width: 440px; max-height: 85vh;'}
    class="bg-slate-900/95 border border-slate-700/80 rounded-xl shadow-2xl flex flex-col pointer-events-auto backdrop-blur-none overflow-hidden select-none"
    role="dialog"
    aria-label="Audio Studio & Soundboard"
  >
    <!-- Draggable Header -->
    <div
      role="presentation"
      onmousedown={handlePointerDown}
      class="px-4 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between cursor-move select-none"
    >
      <div class="flex items-center gap-2">
        <span class="text-sm">🎵</span>
        <span class="text-xs font-bold uppercase tracking-wider text-slate-200">Audio Studio & Soundboard</span>
        {#if lastTriggeredSfx}
          <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800 animate-pulse">
            ▶ {lastTriggeredSfx}
          </span>
        {/if}
      </div>
      <div class="flex items-center gap-1.5">
        <button
          type="button"
          onclick={() => isMinimized = !isMinimized}
          class="text-slate-400 hover:text-slate-200 text-xs px-1.5 py-0.5 rounded transition"
          title={isMinimized ? 'Expand' : 'Minimize'}
        >
          {isMinimized ? '▲' : '▼'}
        </button>
        <button
          type="button"
          onclick={() => { isOpen = false; floatingWindowsStore.close('audio'); }}
          class="text-slate-400 hover:text-rose-400 text-sm px-1.5 py-0.5 rounded transition"
          title="Close"
        >
          ✕
        </button>
      </div>
    </div>

    <!-- Scrollable Audio Busses & SFX Grid -->
    {#if !isMinimized}
      <div class="p-4 overflow-y-auto max-h-[calc(85vh-45px)] space-y-4">

        <!-- ── 1. Independent Multi-Bus Volume Faders ──────────────────────── -->
        <div class="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 space-y-2.5">
          <div class="flex items-center justify-between text-[10px] uppercase font-bold text-slate-400 tracking-wider">
            <span>Volume Busses</span>
            <span class="text-indigo-400 font-mono">4-Bus Gain</span>
          </div>

          <div class="space-y-2 text-xs">
            <!-- Master Bus -->
            <div class="flex items-center gap-2">
              <span class="w-14 text-[10px] font-bold uppercase text-slate-400 shrink-0">Master</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={masterVol}
                oninput={(e) => updateMaster(parseFloat((e.target as HTMLInputElement).value))}
                class="flex-1 accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                tabindex="-1"
              />
              <span class="w-8 text-right font-mono text-[10px] text-slate-400">{Math.round(masterVol * 100)}%</span>
            </div>

            <!-- Ambience Bus -->
            <div class="flex items-center gap-2">
              <span class="w-14 text-[10px] font-bold uppercase text-slate-400 shrink-0">Ambience</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={ambienceVol}
                oninput={(e) => updateAmbience(parseFloat((e.target as HTMLInputElement).value))}
                class="flex-1 accent-cyan-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                tabindex="-1"
              />
              <span class="w-8 text-right font-mono text-[10px] text-slate-400">{Math.round(ambienceVol * 100)}%</span>
            </div>

            <!-- Combat Music Bus -->
            <div class="flex items-center gap-2">
              <span class="w-14 text-[10px] font-bold uppercase text-slate-400 shrink-0">Combat</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={combatMusicVol}
                oninput={(e) => updateCombatMusic(parseFloat((e.target as HTMLInputElement).value))}
                class="flex-1 accent-rose-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                tabindex="-1"
              />
              <span class="w-8 text-right font-mono text-[10px] text-slate-400">{Math.round(combatMusicVol * 100)}%</span>
            </div>

            <!-- SFX Bus -->
            <div class="flex items-center gap-2">
              <span class="w-14 text-[10px] font-bold uppercase text-slate-400 shrink-0">SFX</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={sfxVol}
                oninput={(e) => updateSfx(parseFloat((e.target as HTMLInputElement).value))}
                class="flex-1 accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                tabindex="-1"
              />
              <span class="w-8 text-right font-mono text-[10px] text-slate-400">{Math.round(sfxVol * 100)}%</span>
            </div>
          </div>
        </div>

        <!-- ── 2. Quick-Tap SFX Tiles (Focus-Safe) ───────────────────────── -->
        <div class="space-y-2">
          <div class="flex items-center justify-between text-[10px] uppercase font-bold text-slate-400 tracking-wider">
            <span>Instant Trigger SFX</span>
            <span class="text-slate-500">NumPad 1-9 Active</span>
          </div>

          <div class="grid grid-cols-2 gap-1.5">
            {#each INSTANT_TILES as tile}
              <button
                type="button"
                tabindex="-1"
                onclick={(e) => { e.preventDefault(); triggerSfxWithoutFocus(tile.id, tile.label); }}
                class="p-2 rounded-xl bg-slate-950/80 hover:bg-slate-800 border border-slate-800/80 hover:border-slate-700 text-left transition-all active:scale-95 group flex items-center justify-between"
              >
                <div class="flex items-center gap-2 min-w-0">
                  <span class="text-base">{tile.icon}</span>
                  <span class="text-xs font-bold text-slate-200 truncate group-hover:text-amber-400">{tile.label}</span>
                </div>
                {#if tile.hotkey}
                  <kbd class="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[9px] font-mono text-slate-400 group-hover:text-slate-200">
                    {tile.hotkey}
                  </kbd>
                {/if}
              </button>
            {/each}
          </div>
        </div>

        <!-- ── 3. Ambience Track Crossfader ──────────────────────────────── -->
        <div class="space-y-2 pt-1 border-t border-slate-800">
          <div class="flex items-center justify-between text-[10px] uppercase font-bold text-slate-400 tracking-wider">
            <span>Ambience &amp; Music Loop</span>
            {#if activeTrackId}
              <button
                tabindex="-1"
                onclick={() => { audioEngine.stopTrack(); activeTrackId = null; }}
                class="text-rose-400 hover:text-rose-300 font-bold"
              >
                ⏹ Stop
              </button>
            {/if}
          </div>

          {#if tracks.length === 0}
            <div class="text-[11px] text-slate-500 p-2 text-center rounded-lg bg-slate-950/40 border border-slate-800/50">
              No ambience files registered. Audio synthesizers are ready.
            </div>
          {:else}
            <div class="space-y-1 max-h-28 overflow-y-auto pr-1">
              {#each tracks as track (track.id)}
                <button
                  type="button"
                  tabindex="-1"
                  onclick={() => toggleTrack(track.id)}
                  class="w-full text-left p-1.5 rounded-lg border text-xs flex items-center justify-between transition-colors {activeTrackId === track.id ? 'bg-indigo-950/60 border-indigo-500/60 text-indigo-200' : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200'}"
                >
                  <span class="truncate font-semibold">{track.label}</span>
                  <span class="text-[10px] font-mono ml-2 shrink-0">{activeTrackId === track.id ? '▶ Playing' : 'Select'}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>

      </div>
    {/if}
  </div>
{/if}
