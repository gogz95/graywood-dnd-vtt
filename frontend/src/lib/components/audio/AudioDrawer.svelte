<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { audioEngine } from '../../audio/AudioEngine';
  import type { SfxEntry, TrackEntry } from '../../audio/AudioEngine';

  let { isOpen = $bindable(false) }: { isOpen?: boolean } = $props();

  // ─── Reactive sliders (mirrored from engine; updated locally) ────────────
  let masterVol = $state(audioEngine.getMasterVolume());
  let ambienceVol = $state(audioEngine.getAmbienceVolume());
  let sfxVol = $state(audioEngine.getSfxVolume());

  // ─── Track & SFX lists ───────────────────────────────────────────────────
  let tracks = $state<TrackEntry[]>([...audioEngine.getTracks()]);
  let sfxButtons = $state<SfxEntry[]>([...audioEngine.getSfxButtons()]);
  let activeTrackId = $state<string | null>(audioEngine.getActiveTrackId());

  // ─── New track URL input ─────────────────────────────────────────────────
  let newTrackUrl = $state('');
  let newTrackLabel = $state('');
  let triggerFeedback = $state<string | null>(null);

  // ─── Polling interval to keep active track status in sync ────────────────
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  // ─── Hotkey listener ─────────────────────────────────────────────────────
  function handleKeydown(e: KeyboardEvent) {
    const numpadMap: Record<string, number> = {
      Numpad1: 1, Numpad2: 2, Numpad3: 3, Numpad4: 4, Numpad5: 5,
      Numpad6: 6, Numpad7: 7, Numpad8: 8, Numpad9: 9,
    };
    const key = numpadMap[e.code];
    if (key !== undefined) {
      audioEngine.handleHotkey(key);
      const sfx = sfxButtons.find(s => s.hotkey === key);
      if (sfx) {
        triggerFeedback = sfx.label;
        setTimeout(() => { triggerFeedback = null; }, 900);
      }
    }
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
    if (pollInterval) clearInterval(pollInterval);
  });

  // ─── Volume handlers ─────────────────────────────────────────────────────
  function handleMasterVol(e: Event) {
    masterVol = parseFloat((e.target as HTMLInputElement).value);
    audioEngine.setMasterVolume(masterVol);
  }

  function handleAmbienceVol(e: Event) {
    ambienceVol = parseFloat((e.target as HTMLInputElement).value);
    audioEngine.setAmbienceVolume(ambienceVol);
  }

  function handleSfxVol(e: Event) {
    sfxVol = parseFloat((e.target as HTMLInputElement).value);
    audioEngine.setSfxVolume(sfxVol);
  }

  // ─── Track handlers ──────────────────────────────────────────────────────
  function playTrack(id: string) {
    audioEngine.playTrack(id);
    activeTrackId = id;
  }

  function stopTrack() {
    audioEngine.stopTrack();
    activeTrackId = null;
  }

  function addTrackFromUrl() {
    const url = newTrackUrl.trim();
    const label = newTrackLabel.trim() || `Track ${tracks.length + 1}`;
    if (!url) return;
    audioEngine.addTrack({
      id: `track-${Date.now()}`,
      label,
      url,
      loop: true,
      isAmbience: true,
    });
    tracks = [...audioEngine.getTracks()];
    newTrackUrl = '';
    newTrackLabel = '';
  }

  // ─── SFX trigger ─────────────────────────────────────────────────────────
  function triggerSfx(sfxId: string, label: string) {
    audioEngine.triggerSfx(sfxId);
    triggerFeedback = label;
    setTimeout(() => { triggerFeedback = null; }, 900);
  }

  function close() {
    isOpen = false;
  }

  function volPercent(v: number): string {
    return `${Math.round(v * 100)}%`;
  }
</script>

{#if isOpen}
  <!-- Backdrop -->
  <div
    role="presentation"
    class="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
    onclick={close}
  ></div>

  <!-- Drawer Panel -->
  <aside
    class="fixed top-0 right-0 h-full w-[28rem] max-w-full bg-slate-900 border-l border-slate-800 z-50 flex flex-col shadow-2xl"
    aria-label="Audio Studio Drawer"
  >
    <!-- Header -->
    <div class="px-5 py-4 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-950/60">
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-base">🎵</div>
        <div>
          <h2 class="text-sm font-bold text-slate-100 uppercase tracking-wide">Audio Studio</h2>
          <p class="text-[10px] text-slate-400">Dual-bus engine: ambience & SFX</p>
        </div>
      </div>
      <button onclick={close} class="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-xs transition-colors" aria-label="Close Audio Drawer">✕</button>
    </div>

    <!-- Scrollable Body -->
    <div class="flex-1 overflow-y-auto p-4 space-y-5">

      <!-- ── Volume Controls ────────────────────────────────────────── -->
      <section class="space-y-3 bg-slate-950/60 rounded-xl border border-slate-800 p-4">
        <h3 class="text-xs font-bold uppercase tracking-wider text-slate-300">Volume Buses</h3>

        {#each [
          { label: 'Master',   vol: masterVol,   handler: handleMasterVol,   color: 'accent-slate-400' },
          { label: 'Ambience', vol: ambienceVol, handler: handleAmbienceVol, color: 'accent-indigo-500' },
          { label: 'SFX',      vol: sfxVol,      handler: handleSfxVol,      color: 'accent-amber-500' },
        ] as bus}
          <div class="flex items-center gap-3">
            <span class="w-16 text-[11px] font-semibold text-slate-400 uppercase tracking-wider shrink-0">{bus.label}</span>
            <input
              type="range" min="0" max="1" step="0.01"
              value={bus.vol}
              oninput={bus.handler}
              class="flex-1 h-1.5 rounded-full {bus.color} cursor-pointer"
            />
            <span class="w-8 text-[11px] font-mono text-slate-300 text-right shrink-0">{volPercent(bus.vol)}</span>
          </div>
        {/each}
      </section>

      <!-- ── Ambience Tracks ────────────────────────────────────────── -->
      <section class="space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-300">Ambience Tracks</h3>
          {#if activeTrackId}
            <button
              onclick={stopTrack}
              class="px-2.5 py-1 bg-rose-900/50 hover:bg-rose-800/60 text-rose-300 text-[11px] font-semibold rounded border border-rose-800/40 transition-colors"
            >
              ⏹ Stop
            </button>
          {/if}
        </div>

        {#if tracks.length === 0}
          <div class="p-4 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
            No tracks loaded. Add a URL below or drop an audio file onto the window.
          </div>
        {:else}
          <div class="space-y-2">
            {#each tracks as track}
              <div
                class="p-3 rounded-xl border flex items-center justify-between gap-3 transition-all {activeTrackId === track.id ? 'bg-indigo-950/40 border-indigo-500 shadow-md shadow-indigo-600/10' : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'}"
              >
                <div class="flex items-center gap-2 min-w-0">
                  <div class="w-2 h-2 rounded-full shrink-0 {activeTrackId === track.id ? 'bg-indigo-400 animate-pulse' : 'bg-slate-700'}"></div>
                  <div class="min-w-0">
                    <span class="text-xs font-semibold text-slate-200 block truncate">{track.label}</span>
                    <span class="text-[10px] font-mono text-slate-500 block truncate">{track.url.length > 40 ? '…' + track.url.slice(-38) : track.url}</span>
                  </div>
                </div>
                <button
                  onclick={() => activeTrackId === track.id ? stopTrack() : playTrack(track.id)}
                  class="px-3 py-1 rounded-lg text-[11px] font-bold shrink-0 transition-colors {activeTrackId === track.id ? 'bg-rose-800/60 text-rose-300 hover:bg-rose-700' : 'bg-indigo-600 text-white hover:bg-indigo-500'}"
                >
                  {activeTrackId === track.id ? '⏸ Pause' : '▶ Play'}
                </button>
              </div>
            {/each}
          </div>
        {/if}

        <!-- Add track input -->
        <div class="space-y-2 pt-1">
          <div class="flex gap-2">
            <input
              type="text"
              bind:value={newTrackLabel}
              placeholder="Track label…"
              class="w-32 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 placeholder:text-slate-600 shrink-0"
            />
            <input
              type="text"
              bind:value={newTrackUrl}
              placeholder="Audio URL (mp3, ogg, wav)…"
              class="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 placeholder:text-slate-600"
            />
          </div>
          <button
            onclick={addTrackFromUrl}
            disabled={!newTrackUrl.trim()}
            class="w-full py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 text-xs font-semibold rounded-lg transition-colors"
          >
            + Add Track
          </button>
        </div>
      </section>

      <!-- ── SFX Soundboard Grid ────────────────────────────────────── -->
      <section class="space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-300">SFX Soundboard</h3>
          <span class="text-[10px] text-slate-500">NumPad 1–9 hotkeys active</span>
        </div>

        {#if triggerFeedback}
          <div class="p-2 bg-amber-950/60 border border-amber-600/40 rounded-lg text-center text-xs font-bold text-amber-300 animate-pulse">
            🔊 {triggerFeedback}
          </div>
        {/if}

        <div class="grid grid-cols-3 gap-2">
          {#each sfxButtons as sfx}
            <button
              onclick={() => triggerSfx(sfx.id, sfx.label)}
              class="p-3 rounded-xl bg-slate-950 border border-slate-800 hover:bg-slate-800 hover:border-slate-700 active:scale-95 transition-all text-left group"
            >
              <div class="flex flex-col gap-1">
                <div class="flex items-center justify-between">
                  <span class="text-[9px] font-mono text-slate-600 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                    {sfx.hotkey != null ? `NP${sfx.hotkey}` : '—'}
                  </span>
                  <span class="text-xs opacity-60 group-hover:opacity-100">▶</span>
                </div>
                <span class="text-[11px] font-semibold text-slate-300 leading-tight">{sfx.label}</span>
              </div>
            </button>
          {/each}
        </div>
      </section>

    </div>

    <!-- Footer hint -->
    <div class="px-4 py-3 border-t border-slate-800 bg-slate-950/60 shrink-0">
      <p class="text-[10px] text-slate-500 text-center">Drop <span class="text-slate-400">.mp3 / .wav / .ogg</span> files onto the window to load them automatically.</p>
    </div>
  </aside>
{/if}
