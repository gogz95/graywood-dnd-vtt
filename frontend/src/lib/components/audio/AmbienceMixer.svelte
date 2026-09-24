<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { audioEngine } from '$lib/audio/AudioEngine';
  import { campaignDirectoryStore } from '$lib/stores/campaignDirectoryStore.svelte';

  // Svelte 5 Runes for Master & Bus States
  let masterVolume = $state(80);
  let ambienceVolume = $state(70);
  let sfxVolume = $state(80);
  let isMuted = $state(false);
  let prevMasterVolume = 80;

  // Active SFX triggering animation states
  let activeSfxId = $state<string | null>(null);

  // Multi-track Ambience Loopers
  interface LooperTrack {
    id: string;
    label: string;
    icon: string;
    category: 'nature' | 'combat' | 'settlement' | 'custom';
    volume: number;
    isPlaying: boolean;
    customUrl?: string;
  }

  let looperTracks = $state<LooperTrack[]>([
    { id: 'amb-rain', label: 'Rain & Storm', icon: '🌧️', category: 'nature', volume: 65, isPlaying: false },
    { id: 'amb-campfire', label: 'Campfire', icon: '🔥', category: 'nature', volume: 75, isPlaying: false },
    { id: 'amb-dungeon', label: 'Dungeon Depths', icon: '🏰', category: 'settlement', volume: 70, isPlaying: false },
    { id: 'amb-tavern', label: 'Tavern Murmur', icon: '🍻', category: 'settlement', volume: 60, isPlaying: false },
    { id: 'amb-forest', label: 'Deep Forest Wind', icon: '🌲', category: 'nature', volume: 50, isPlaying: false }
  ]);

  // Audio Context and Node Management for Multi-track Loopers
  let audioCtx: AudioContext | null = null;
  let masterGainNode: GainNode | null = null;
  let ambienceMasterGain: GainNode | null = null;
  const trackNodes = new Map<string, {
    gainNode: GainNode;
    sources: (AudioNode & { stop?: (when?: number) => void })[];
    timer?: number;
  }>();

  // One-shot SFX catalog
  const sfxButtons = [
    { id: 'sfx-dice', label: 'Dice Roll', icon: '🎲', hotkey: '1' },
    { id: 'sfx-sword', label: 'Sword Strike', icon: '⚔️', hotkey: '2' },
    { id: 'sfx-spell', label: 'Spell Surge', icon: '✨', hotkey: '3' },
    { id: 'sfx-trap', label: 'Trap Spring', icon: '🪤', hotkey: '4' },
    { id: 'sfx-bell', label: 'Alert Bell', icon: '🔔', hotkey: '5' },
    { id: 'sfx-rest', label: 'Rest Chime', icon: '🛡️', hotkey: '6' },
    { id: 'sfx-combat', label: 'Combat Pulse', icon: '⚡', hotkey: '7' },
    { id: 'sfx-nat20', label: 'Nat 20 Fanfare', icon: '🌟', hotkey: '8' },
    { id: 'sfx-nat1', label: 'Nat 1 Stinger', icon: '💀', hotkey: '9' },
    { id: 'sfx-roar', label: 'Monster Roar', icon: '🐉', hotkey: '0' }
  ];

  // Scanned audio files from campaign directory store
  let scannedFiles = $derived(campaignDirectoryStore.audioFiles);

  function getAudioContext(): AudioContext {
    if (!audioCtx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new AC();
      masterGainNode = audioCtx.createGain();
      masterGainNode.gain.setValueAtTime(masterVolume / 100, audioCtx.currentTime);

      ambienceMasterGain = audioCtx.createGain();
      ambienceMasterGain.gain.setValueAtTime(ambienceVolume / 100, audioCtx.currentTime);
      ambienceMasterGain.connect(masterGainNode);
      masterGainNode.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  // Update gains when sliders change
  $effect(() => {
    const vol = isMuted ? 0 : masterVolume / 100;
    if (masterGainNode && audioCtx) {
      masterGainNode.gain.setTargetAtTime(vol, audioCtx.currentTime, 0.05);
    }
    audioEngine.setMasterVolume(vol);
  });

  $effect(() => {
    const vol = ambienceVolume / 100;
    if (ambienceMasterGain && audioCtx) {
      ambienceMasterGain.gain.setTargetAtTime(vol, audioCtx.currentTime, 0.05);
    }
    audioEngine.setAmbienceVolume(vol);
  });

  $effect(() => {
    audioEngine.setSfxVolume(sfxVolume / 100);
  });

  function toggleMute() {
    if (isMuted) {
      isMuted = false;
      masterVolume = prevMasterVolume;
    } else {
      prevMasterVolume = masterVolume;
      isMuted = true;
    }
  }

  // Multi-track Ambience Synthesis
  function startLooperTrack(track: LooperTrack) {
    const ctx = getAudioContext();
    if (!ambienceMasterGain) return;

    // Gain node for this specific track
    const trackGain = ctx.createGain();
    trackGain.gain.setValueAtTime(0, ctx.currentTime);
    trackGain.gain.linearRampToValueAtTime((track.volume / 100), ctx.currentTime + 1.2);
    trackGain.connect(ambienceMasterGain);

    const activeSources: (AudioNode & { stop?: (when?: number) => void })[] = [];

    if (track.customUrl) {
      // Audio element or buffer source for custom audio files
      const audio = new Audio(track.customUrl);
      audio.loop = true;
      audio.volume = track.volume / 100;
      audio.play().catch(e => console.warn('Could not play custom track:', e));
      const source = ctx.createMediaElementSource(audio);
      source.connect(trackGain);
      activeSources.push(source);
      trackNodes.set(track.id, { gainNode: trackGain, sources: activeSources });
      track.isPlaying = true;
      return;
    }

    if (track.id === 'amb-rain') {
      // Seamless Rain & Storm: Continuous filtered white/pink noise + slow sweeps
      const bufferSize = ctx.sampleRate * 3;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + white * 0.0990460;
        b1 = 0.96300 * b1 + white * 0.1600000;
        b2 = 0.57000 * b2 + white * 0.5600000;
        output[i] = (b0 + b1 + b2 + white * 0.2366) * 0.12;
      }

      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;
      noiseSource.loop = true;

      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.setValueAtTime(1400, ctx.currentTime);

      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.setValueAtTime(250, ctx.currentTime);

      noiseSource.connect(lowpass);
      lowpass.connect(highpass);
      highpass.connect(trackGain);
      noiseSource.start(0);
      activeSources.push(noiseSource);

    } else if (track.id === 'amb-campfire') {
      // Campfire: Warm pink noise foundation + periodic crackle pops
      const bufferSize = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let lastVal = 0;
      for (let i = 0; i < bufferSize; i++) {
        const brown = (lastVal + (0.02 * (Math.random() * 2 - 1))) / 1.02;
        lastVal = brown;
        data[i] = brown * 0.4;
      }
      const brownNoise = ctx.createBufferSource();
      brownNoise.buffer = buffer;
      brownNoise.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, ctx.currentTime);

      brownNoise.connect(filter);
      filter.connect(trackGain);
      brownNoise.start(0);
      activeSources.push(brownNoise);

      // Random sparks interval
      const sparkInterval = window.setInterval(() => {
        if (!track.isPlaying || !audioCtx) return;
        const sparkTime = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const sparkGain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(1800 + Math.random() * 2500, sparkTime);
        sparkGain.gain.setValueAtTime(0.08, sparkTime);
        sparkGain.gain.exponentialRampToValueAtTime(0.0001, sparkTime + 0.04);
        osc.connect(sparkGain);
        sparkGain.connect(trackGain);
        osc.start(sparkTime);
        osc.stop(sparkTime + 0.05);
      }, 320);

      trackNodes.set(track.id, { gainNode: trackGain, sources: activeSources, timer: sparkInterval });
      track.isPlaying = true;
      return;

    } else if (track.id === 'amb-dungeon') {
      // Dungeon Depths: 45Hz sub drone + slow resonant pulsing
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(45, ctx.currentTime);
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(90, ctx.currentTime);

      const dFilter = ctx.createBiquadFilter();
      dFilter.type = 'lowpass';
      dFilter.frequency.setValueAtTime(220, ctx.currentTime);

      osc1.connect(dFilter);
      osc2.connect(dFilter);
      dFilter.connect(trackGain);

      osc1.start(0);
      osc2.start(0);
      activeSources.push(osc1, osc2);

    } else if (track.id === 'amb-tavern') {
      // Tavern Murmur: Warm F major acoustic chord hum + textured room resonance
      [174.61, 220.00, 261.63, 349.23].forEach(freq => {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.06, ctx.currentTime);
        osc.connect(g);
        g.connect(trackGain);
        osc.start(0);
        activeSources.push(osc);
      });

    } else if (track.id === 'amb-forest') {
      // Deep Forest Wind: Gentle sweeping filtered noise
      const bufferSize = ctx.sampleRate * 3;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.15;
      }
      const windSource = ctx.createBufferSource();
      windSource.buffer = buffer;
      windSource.loop = true;

      const bandpass = ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.setValueAtTime(400, ctx.currentTime);
      bandpass.Q.setValueAtTime(1.8, ctx.currentTime);

      windSource.connect(bandpass);
      bandpass.connect(trackGain);
      windSource.start(0);
      activeSources.push(windSource);
    }

    trackNodes.set(track.id, { gainNode: trackGain, sources: activeSources });
    track.isPlaying = true;
  }

  function stopLooperTrack(track: LooperTrack) {
    const entry = trackNodes.get(track.id);
    if (!entry) {
      track.isPlaying = false;
      return;
    }

    if (entry.timer) {
      clearInterval(entry.timer);
    }

    if (audioCtx) {
      const now = audioCtx.currentTime;
      entry.gainNode.gain.setValueAtTime(entry.gainNode.gain.value, now);
      entry.gainNode.gain.linearRampToValueAtTime(0, now + 0.8);
      setTimeout(() => {
        entry.sources.forEach(src => {
          try {
            if (typeof src.stop === 'function') src.stop();
            src.disconnect();
          } catch {}
        });
        trackNodes.delete(track.id);
      }, 850);
    } else {
      entry.sources.forEach(src => {
        try {
          if (typeof src.stop === 'function') src.stop();
          src.disconnect();
        } catch {}
      });
      trackNodes.delete(track.id);
    }

    track.isPlaying = false;
  }

  function toggleLooperTrack(track: LooperTrack) {
    if (track.isPlaying) {
      stopLooperTrack(track);
    } else {
      startLooperTrack(track);
    }
  }

  function updateTrackVolume(track: LooperTrack, volume: number) {
    track.volume = volume;
    const entry = trackNodes.get(track.id);
    if (entry && audioCtx) {
      entry.gainNode.gain.setTargetAtTime(volume / 100, audioCtx.currentTime, 0.05);
    }
  }

  // Instant SFX Trigger
  function playSfx(id: string) {
    activeSfxId = id;
    audioEngine.triggerSfx(id);
    setTimeout(() => {
      if (activeSfxId === id) activeSfxId = null;
    }, 400);
  }

  // Add scanned campaign file to atmosphere loopers
  function addScannedToLoopers(filePath: string) {
    const fileName = filePath.split(/[/\\]/).pop() || filePath;
    const cleanLabel = fileName.replace(/\.[^/.]+$/, '');
    const id = `custom-${Date.now()}`;
    const customTrack: LooperTrack = {
      id,
      label: cleanLabel,
      icon: '🎵',
      category: 'custom',
      volume: 70,
      isPlaying: false,
      customUrl: `/api/campaign/assets/${filePath}`
    };
    looperTracks.push(customTrack);
  }

  // Add scanned campaign file to soundboard
  function addScannedToSoundboard(filePath: string) {
    const fileName = filePath.split(/[/\\]/).pop() || filePath;
    const cleanLabel = fileName.replace(/\.[^/.]+$/, '');
    const id = `sfx-custom-${Date.now()}`;
    audioEngine.addSfxButton({
      id,
      label: cleanLabel,
      hotkey: null,
      url: `/api/campaign/assets/${filePath}`,
      procedural: false
    });
    playSfx(id);
  }

  onMount(() => {
    const handlePlayPreset = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      if (detail?.id) {
        const trk = looperTracks.find(t => t.id === detail.id);
        if (trk) {
          startLooperTrack(trk);
        }
      }
    };

    const handleStopAll = () => {
      looperTracks.forEach(t => {
        if (t.isPlaying) stopLooperTrack(t);
      });
    };

    window.addEventListener('vtt:play-preset-ambience', handlePlayPreset);
    window.addEventListener('vtt:stop-all-ambience', handleStopAll);

    return () => {
      window.removeEventListener('vtt:play-preset-ambience', handlePlayPreset);
      window.removeEventListener('vtt:stop-all-ambience', handleStopAll);
    };
  });

  onDestroy(() => {
    looperTracks.forEach(t => {
      if (t.isPlaying) stopLooperTrack(t);
    });
    if (audioCtx && audioCtx.state !== 'closed') {
      audioCtx.close().catch(() => {});
    }
  });
</script>

<div class="h-full flex flex-col bg-zinc-950 text-zinc-100 font-sans border-r border-zinc-800 select-none overflow-hidden">
  <!-- Top Header & Master Bus Controls -->
  <header class="p-3.5 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-md">
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-2">
        <span class="text-xl">🎛️</span>
        <div>
          <h2 class="text-sm font-semibold tracking-wide text-zinc-100 uppercase">Ambience & SFX Mixer</h2>
          <p class="text-[10px] text-zinc-400">Dual-Bus Web Audio Engine • Low Latency</p>
        </div>
      </div>
      <button
        onclick={toggleMute}
        class="px-2.5 py-1 rounded text-xs font-medium border transition-colors flex items-center gap-1.5 {isMuted ? 'bg-red-500/20 text-red-300 border-red-500/40' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700'}"
        title="Toggle Global Audio Mute"
      >
        <span>{isMuted ? '🔇' : '🔊'}</span>
        <span>{isMuted ? 'MUTED' : 'MUTE'}</span>
      </button>
    </div>

    <!-- Master Faders Grid -->
    <div class="grid grid-cols-3 gap-2.5 bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-800/80 text-xs">
      <!-- Master Volume -->
      <div>
        <div class="flex justify-between text-[11px] font-medium text-zinc-400 mb-1">
          <span>Master</span>
          <span class="text-zinc-200">{isMuted ? '0%' : `${masterVolume}%`}</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          disabled={isMuted}
          bind:value={masterVolume}
          class="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 disabled:opacity-40"
        />
      </div>

      <!-- Ambience Bus -->
      <div>
        <div class="flex justify-between text-[11px] font-medium text-zinc-400 mb-1">
          <span>Ambience</span>
          <span class="text-zinc-200">{ambienceVolume}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          bind:value={ambienceVolume}
          class="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-sky-500"
        />
      </div>

      <!-- SFX Bus -->
      <div>
        <div class="flex justify-between text-[11px] font-medium text-zinc-400 mb-1">
          <span>Sound Effects</span>
          <span class="text-zinc-200">{sfxVolume}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          bind:value={sfxVolume}
          class="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
        />
      </div>
    </div>
  </header>

  <!-- Scrollable Tracks & Soundboard Container -->
  <div class="flex-1 overflow-y-auto p-3.5 space-y-4">
    <!-- Atmosphere Multi-Track Loopers -->
    <section>
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
          <span>🎧</span> Multi-Track Atmosphere Loopers
        </h3>
        <span class="text-[10px] text-zinc-500">Simultaneous Loops</span>
      </div>

      <div class="space-y-2">
        {#each looperTracks as track (track.id)}
          <div class="bg-zinc-900/60 border rounded-lg p-2.5 transition-all {track.isPlaying ? 'border-sky-500/50 bg-sky-950/15 shadow-sm shadow-sky-500/10' : 'border-zinc-800/80'}">
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2 min-w-0">
                <span class="text-base">{track.icon}</span>
                <span class="text-xs font-medium text-zinc-200 truncate">{track.label}</span>
                {#if track.isPlaying}
                  <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-sky-500/20 text-sky-300 animate-pulse">
                    PLAYING
                  </span>
                {/if}
              </div>
              <button
                onclick={() => toggleLooperTrack(track)}
                class="px-2.5 py-1 rounded text-[11px] font-medium transition-colors {track.isPlaying ? 'bg-sky-600 hover:bg-sky-500 text-white' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'}"
              >
                {track.isPlaying ? 'Stop' : 'Play'}
              </button>
            </div>

            <!-- Individual Track Fader -->
            <div class="flex items-center gap-2">
              <span class="text-[10px] text-zinc-500 w-6">Vol</span>
              <input
                type="range"
                min="0"
                max="100"
                value={track.volume}
                oninput={(e) => updateTrackVolume(track, Number((e.target as HTMLInputElement).value))}
                class="flex-1 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-sky-400"
              />
              <span class="text-[10px] text-zinc-400 w-8 text-right font-mono">{track.volume}%</span>
            </div>
          </div>
        {/each}
      </div>
    </section>

    <!-- One-Shot SFX Soundboard -->
    <section>
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
          <span>⚡</span> SFX Soundboard
        </h3>
        <span class="text-[10px] text-zinc-500">Instant One-Shots</span>
      </div>

      <div class="grid grid-cols-2 gap-2">
        {#each sfxButtons as sfx (sfx.id)}
          <button
            onclick={() => playSfx(sfx.id)}
            class="flex items-center justify-between p-2 rounded-lg border bg-zinc-900/60 text-left transition-all active:scale-[0.98] {activeSfxId === sfx.id ? 'border-amber-400 bg-amber-500/20 text-amber-200' : 'border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900 text-zinc-300'}"
          >
            <div class="flex items-center gap-2 min-w-0">
              <span class="text-base">{sfx.icon}</span>
              <span class="text-xs font-medium truncate">{sfx.label}</span>
            </div>
            <span class="text-[9px] font-mono text-zinc-500 px-1 py-0.5 rounded bg-zinc-950 border border-zinc-800">
              {sfx.hotkey}
            </span>
          </button>
        {/each}
      </div>
    </section>

    <!-- Campaign Audio Assets Scanner -->
    <section class="border-t border-zinc-800/80 pt-3">
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
          <span>📁</span> Campaign Audio Files ({scannedFiles.length})
        </h3>
        <button
          onclick={() => campaignDirectoryStore.refreshAssets()}
          class="text-[10px] text-zinc-400 hover:text-zinc-200 underline"
        >
          Rescan
        </button>
      </div>

      {#if scannedFiles.length === 0}
        <div class="p-3 text-center border border-dashed border-zinc-800/80 rounded-lg text-zinc-500 text-xs">
          No audio files found in <code class="text-zinc-400">campaign/audio/</code>.<br />
          Place <span class="text-zinc-400">.mp3, .wav, or .ogg</span> files there to mix!
        </div>
      {:else}
        <div class="space-y-1.5 max-h-36 overflow-y-auto pr-1">
          {#each scannedFiles as file (file)}
            <div class="flex items-center justify-between p-1.5 rounded bg-zinc-900/40 border border-zinc-800/60 text-xs">
              <span class="truncate text-zinc-300 max-w-[140px]" title={file}>
                {file.split(/[/\\]/).pop()}
              </span>
              <div class="flex items-center gap-1">
                <button
                  onclick={() => addScannedToLoopers(file)}
                  class="px-1.5 py-0.5 rounded text-[10px] bg-sky-950 text-sky-300 border border-sky-800/60 hover:bg-sky-900"
                  title="Add as continuous atmosphere loop"
                >
                  + Loop
                </button>
                <button
                  onclick={() => addScannedToSoundboard(file)}
                  class="px-1.5 py-0.5 rounded text-[10px] bg-amber-950 text-amber-300 border border-amber-800/60 hover:bg-amber-900"
                  title="Add to soundboard trigger"
                >
                  + SFX
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  </div>
</div>
