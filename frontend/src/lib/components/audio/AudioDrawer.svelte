<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { audioEngine, type SfxEntry, type TrackEntry } from '../../audio/AudioEngine';

  let { isOpen = $bindable(false) }: { isOpen?: boolean } = $props();

  // ─── Reactive sliders (mirrored from engine; updated locally) ────────────
  let masterVol = $state(audioEngine.getMasterVolume());
  let ambienceVol = $state(audioEngine.getAmbienceVolume());
  let sfxVol = $state(audioEngine.getSfxVolume());

  // ─── Track & SFX lists ───────────────────────────────────────────────────
  let tracks = $state<TrackEntry[]>([...audioEngine.getTracks()]);
  let sfxButtons = $state<SfxEntry[]>([...audioEngine.getSfxButtons()]);
  let activeTrackId = $state<string | null>(audioEngine.getActiveTrackId());

  // ─── Track inputs ─────────────────────────────────────────────────────────
  let newTrackUrl = $state('');
  let newTrackLabel = $state('');
  let triggerFeedback = $state<string | null>(null);
  let isDragOver = $state(false);

  // ─── Polling interval to keep active track status in sync ────────────────
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  // ─── Hotkey listener ─────────────────────────────────────────────────────
  function handleKeydown(e: KeyboardEvent) {
    const numpadMap: Record<string, number> = {
      Numpad1: 1, Numpad2: 2, Numpad3: 3, Numpad4: 4, Numpad5: 5,
      Numpad6: 6, Numpad7: 7, Numpad8: 8, Numpad9: 9,
      Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4, Digit5: 5, Digit6: 6,
    };
    // Only handle if not typing in an input
    const target = e.target as HTMLElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      return;
    }

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
  async function playTrack(id: string) {
    await audioEngine.playTrack(id);
    activeTrackId = id;
  }

  function stopTrack() {
    audioEngine.stopTrack();
    activeTrackId = null;
  }

  function removeTrack(id: string) {
    audioEngine.removeTrack(id);
    tracks = [...audioEngine.getTracks()];
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

  // ─── File Ingestion via Blob/Buffer ──────────────────────────────────────
  async function handleFileInput(e: Event, isAmbience: boolean) {
    const files = (e.target as HTMLInputElement).files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      await audioEngine.loadAudioFile(file, isAmbience);
    }
    tracks = [...audioEngine.getTracks()];
    sfxButtons = [...audioEngine.getSfxButtons()];
  }

  async function handleDrop(e: DragEvent, isAmbience: boolean) {
    e.preventDefault();
    isDragOver = false;
    if (!e.dataTransfer?.files || e.dataTransfer.files.length === 0) return;
    for (let i = 0; i < e.dataTransfer.files.length; i++) {
      const file = e.dataTransfer.files[i];
      await audioEngine.loadAudioFile(file, isAmbience);
    }
    tracks = [...audioEngine.getTracks()];
    sfxButtons = [...audioEngine.getSfxButtons()];
  }

  // ─── SFX trigger ─────────────────────────────────────────────────────────
  async function triggerSfx(sfxId: string, label: string) {
    await audioEngine.triggerSfx(sfxId);
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
    class="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity"
    onclick={close}
  ></div>

  <!-- Drawer Panel -->
  <aside
    class="fixed top-0 right-0 h-full w-[30rem] max-w-full bg-slate-900 border-l border-slate-800 z-50 flex flex-col shadow-2xl"
    aria-label="Audio Studio Drawer"
  >
    <!-- Header -->
    <div class="px-5 py-4 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-950/70">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-lg shadow-sm">🎵</div>
        <div>
          <h2 class="text-sm font-black text-slate-100 uppercase tracking-wider">Audio Studio</h2>
          <p class="text-[10px] text-slate-400">Dual-bus engine · Ambience &amp; Procedural SFX</p>
        </div>
      </div>
      <button onclick={close} class="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-xs transition-colors" aria-label="Close Audio Drawer">✕</button>
    </div>

    <!-- Scrollable Body -->
    <div class="flex-1 overflow-y-auto p-4 space-y-5">

      <!-- ── Volume Busses ────────────────────────────────────────── -->
      <section class="space-y-3 bg-slate-950/70 rounded-xl border border-slate-800 p-4 shadow-sm">
        <div class="flex items-center justify-between">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-300">Volume Busses</h3>
          <span class="text-[10px] text-indigo-400 font-mono">Independent Dual-Gain</span>
        </div>

        {#each [
          { label: 'Master',   vol: masterVol,   handler: handleMasterVol,   color: 'accent-slate-300' },
          { label: 'Ambience', vol: ambienceVol, handler: handleAmbienceVol, color: 'accent-indigo-500' },
          { label: 'SFX',      vol: sfxVol,      handler: handleSfxVol,      color: 'accent-amber-500' },
        ] as bus}
          <div class="flex items-center gap-3">
            <span class="w-16 text-[11px] font-semibold text-slate-400 uppercase tracking-wider shrink-0">{bus.label}</span>
            <input
              type="range" min="0" max="1" step="0.01"
              value={bus.vol}
              oninput={bus.handler}
              class="flex-1 h-1.5 rounded-full {bus.color} cursor-pointer bg-slate-800"
            />
            <span class="w-9 text-[11px] font-mono text-slate-300 text-right shrink-0">{volPercent(bus.vol)}</span>
          </div>
        {/each}
      </section>

      <!-- ── Ambience Tracks ────────────────────────────────────────── -->
      <section class="space-y-3">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-300">Ambience Tracks</h3>
            <p class="text-[10px] text-slate-500">1.5s linear crossfades on switch</p>
          </div>
          <div class="flex items-center gap-2">
            {#if activeTrackId}
              <button
                onclick={stopTrack}
                class="px-2.5 py-1 bg-rose-950/60 hover:bg-rose-900/70 text-rose-300 text-[11px] font-semibold rounded-lg border border-rose-800/40 transition-colors"
              >
                ⏹ Stop Loop
              </button>
            {/if}
            <label class="px-2.5 py-1 bg-indigo-950/60 hover:bg-indigo-900/70 text-indigo-300 text-[11px] font-semibold rounded-lg border border-indigo-800/40 cursor-pointer transition-colors">
              + File
              <input type="file" accept="audio/*" class="hidden" onchange={(e) => handleFileInput(e, true)} multiple />
            </label>
          </div>
        </div>

        <!-- Ingestion Dropzone -->
        <div
          role="region"
          aria-label="Ambience audio dropzone"
          ondragover={(e) => { e.preventDefault(); isDragOver = true; }}
          ondragleave={() => { isDragOver = false; }}
          ondrop={(e) => handleDrop(e, true)}
          class="p-3 border-2 border-dashed rounded-xl text-center transition-all {isDragOver ? 'border-indigo-500 bg-indigo-950/20' : 'border-slate-800 bg-slate-950/30'}"
        >
          <span class="text-[11px] text-slate-400">Drag &amp; drop background music/ambience files (.mp3, .wav, .ogg)</span>
        </div>

        {#if tracks.length === 0}
          <div class="p-4 text-center text-xs text-slate-500 border border-slate-800/60 rounded-xl bg-slate-950/40">
            No ambience tracks loaded. Drop an audio file above or add a URL below.
          </div>
        {:else}
          <div class="space-y-2 max-h-48 overflow-y-auto pr-1">
            {#each tracks as track (track.id)}
              <div
                class="p-2.5 rounded-xl border flex items-center justify-between gap-3 transition-all {activeTrackId === track.id ? 'bg-indigo-950/40 border-indigo-500/70 shadow-md shadow-indigo-600/10' : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'}"
              >
                <div class="flex items-center gap-2.5 min-w-0">
                  <div class="w-2.5 h-2.5 rounded-full shrink-0 {activeTrackId === track.id ? 'bg-indigo-400 animate-ping' : 'bg-slate-700'}"></div>
                  <div class="min-w-0">
                    <span class="text-xs font-semibold text-slate-200 block truncate">{track.label}</span>
                    <span class="text-[9px] font-mono text-slate-500 block truncate">{track.url.startsWith('blob:') ? 'Local In-Memory Audio' : track.url}</span>
                  </div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                  <button
                    onclick={() => activeTrackId === track.id ? stopTrack() : playTrack(track.id)}
                    class="px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors {activeTrackId === track.id ? 'bg-rose-800/70 text-rose-200 hover:bg-rose-700' : 'bg-indigo-600 text-white hover:bg-indigo-500'}"
                  >
                    {activeTrackId === track.id ? '⏸ Pause' : '▶ Play'}
                  </button>
                  <button
                    onclick={() => removeTrack(track.id)}
                    class="p-1 text-slate-600 hover:text-rose-400 text-xs transition-colors"
                    title="Remove Track"
                  >✕</button>
                </div>
              </div>
            {/each}
          </div>
        {/if}

        <!-- Add track by URL -->
        <div class="space-y-1.5 pt-1">
          <div class="flex gap-2">
            <input
              type="text"
              bind:value={newTrackLabel}
              placeholder="Track label…"
              class="w-28 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 placeholder:text-slate-600 shrink-0"
            />
            <input
              type="text"
              bind:value={newTrackUrl}
              placeholder="Stream / Remote audio URL…"
              class="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 placeholder:text-slate-600"
            />
            <button
              onclick={addTrackFromUrl}
              disabled={!newTrackUrl.trim()}
              class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 text-xs font-semibold rounded-lg transition-colors shrink-0"
            >
              Add
            </button>
          </div>
        </div>
      </section>

      <!-- ── SFX Soundboard Grid ────────────────────────────────────── -->
      <section class="space-y-3">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-300">SFX Soundboard</h3>
            <p class="text-[10px] text-slate-500">6 Web Audio Procedural Fallbacks + Hotkeys</p>
          </div>
          <label class="px-2.5 py-1 bg-amber-950/60 hover:bg-amber-900/70 text-amber-300 text-[11px] font-semibold rounded-lg border border-amber-800/40 cursor-pointer transition-colors">
            + SFX File
            <input type="file" accept="audio/*" class="hidden" onchange={(e) => handleFileInput(e, false)} multiple />
          </label>
        </div>

        {#if triggerFeedback}
          <div class="p-2 bg-amber-950/80 border border-amber-500/60 rounded-lg text-center text-xs font-bold text-amber-200 animate-pulse shadow-md">
            🔊 Playing: {triggerFeedback}
          </div>
        {/if}

        <div class="grid grid-cols-3 gap-2">
          {#each sfxButtons as sfx (sfx.id)}
            <button
              onclick={() => triggerSfx(sfx.id, sfx.label)}
              class="p-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:bg-slate-800/80 hover:border-slate-700 active:scale-95 transition-all text-left group shadow-sm"
            >
              <div class="flex flex-col gap-1">
                <div class="flex items-center justify-between">
                  <span class="text-[9px] font-mono font-bold text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                    {sfx.hotkey != null ? `NP${sfx.hotkey}` : '—'}
                  </span>
                  <span class="text-xs opacity-60 group-hover:opacity-100 text-amber-400">⚡</span>
                </div>
                <span class="text-[11px] font-bold text-slate-200 leading-tight line-clamp-1">{sfx.label}</span>
                <span class="text-[9px] text-slate-500 font-mono">
                  {sfx.procedural ? 'WebAudio Synth' : 'Audio Asset'}
                </span>
              </div>
            </button>
          {/each}
        </div>
      </section>

    </div>

    <!-- Footer hint -->
    <div class="px-4 py-3 border-t border-slate-800 bg-slate-950/70 shrink-0">
      <p class="text-[10px] text-slate-500 text-center">
        Press <kbd class="px-1 py-0.5 bg-slate-800 text-slate-300 rounded text-[9px] font-mono">NumPad 1–6</kbd> to trigger procedural synthesizers out-of-the-box.
      </p>
    </div>
  </aside>
{/if}
