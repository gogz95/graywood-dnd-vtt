<!-- TokenLayer.svelte — Modular Token Management Overlay & Inspector -->
<script lang="ts">
  import { tokenStore, type VttToken, parseSizeToCells, type VisionType, type LightEmission } from '../../stores/tokenStore.svelte';

  interface Props {
    gridSize?: number;
    onSpawnQuickToken?: (type: 'player' | 'monster' | 'large' | 'huge') => void;
  }

  let {
    gridSize = 60,
    onSpawnQuickToken,
  }: Props = $props();

  const selectedToken = $derived(tokenStore.selectedToken);

  const COMMON_CONDITIONS = [
    { name: 'Poisoned', icon: '🤢', color: 'text-emerald-400' },
    { name: 'Concentrating', icon: '⚡', color: 'text-cyan-400' },
    { name: 'Prone', icon: '🛌', color: 'text-amber-400' },
    { name: 'Stunned', icon: '💫', color: 'text-purple-400' },
    { name: 'Blinded', icon: '👁️', color: 'text-slate-400' },
    { name: 'Frightened', icon: '😱', color: 'text-rose-400' },
    { name: 'Paralyzed', icon: '⚡', color: 'text-yellow-400' },
    { name: 'Invisible', icon: '👻', color: 'text-sky-300' },
  ];

  function handleSizeChange(sizeCategory: string) {
    if (!selectedToken) return;
    const cells = parseSizeToCells(sizeCategory);
    tokenStore.updateToken(selectedToken.id, {
      size: cells,
      sizeCategory: sizeCategory as any,
    });
  }

  function handleElevationStep(delta: number) {
    if (!selectedToken) return;
    const current = selectedToken.elevation || 0;
    tokenStore.setElevation(selectedToken.id, current + delta);
  }

  function handleVisionChange(visionType: VisionType) {
    if (!selectedToken) return;
    const defaultRange = visionType === 'darkvision' ? 60 : visionType === 'blind' ? 0 : 60;
    tokenStore.setVision(selectedToken.id, visionType, selectedToken.visionRange ?? defaultRange);
  }

  function handleVisionRangeChange(range: number) {
    if (!selectedToken) return;
    tokenStore.setVision(selectedToken.id, selectedToken.visionType ?? 'normal', range);
  }

  function toggleLightEmission() {
    if (!selectedToken) return;
    const current = selectedToken.lightEmission;
    if (current && current.enabled) {
      tokenStore.setLightEmission(selectedToken.id, { enabled: false });
    } else {
      // Default torch: 20ft bright, 20ft dim
      tokenStore.setLightEmission(selectedToken.id, {
        brightRadius: current?.brightRadius || 20,
        dimRadius: current?.dimRadius || 20,
        color: current?.color || '#ffaa44',
        enabled: true,
      });
    }
  }

  function setLightPreset(preset: 'torch' | 'lantern' | 'cantrip' | 'off') {
    if (!selectedToken) return;
    if (preset === 'off') {
      tokenStore.setLightEmission(selectedToken.id, { enabled: false });
    } else if (preset === 'torch') {
      tokenStore.setLightEmission(selectedToken.id, {
        brightRadius: 20,
        dimRadius: 20,
        color: '#ff9900',
        enabled: true,
      });
    } else if (preset === 'lantern') {
      tokenStore.setLightEmission(selectedToken.id, {
        brightRadius: 30,
        dimRadius: 30,
        color: '#ffbb44',
        enabled: true,
      });
    } else if (preset === 'cantrip') {
      tokenStore.setLightEmission(selectedToken.id, {
        brightRadius: 20,
        dimRadius: 20,
        color: '#60a5fa',
        enabled: true,
      });
    }
  }

  function addPresetAura(preset: 'paladin-10' | 'paladin-30' | 'spirit-guardians' | 'pass-without-trace') {
    if (!selectedToken) return;
    if (preset === 'paladin-10') {
      tokenStore.addAura(selectedToken.id, {
        id: `aura-paladin-10-${Date.now()}`,
        radiusFeet: 10,
        color: '#f59e0b',
        fillAlpha: 0.15,
        borderStyle: 'solid',
        attachedTokenId: selectedToken.id,
      });
    } else if (preset === 'paladin-30') {
      tokenStore.addAura(selectedToken.id, {
        id: `aura-paladin-30-${Date.now()}`,
        radiusFeet: 30,
        color: '#f59e0b',
        fillAlpha: 0.12,
        borderStyle: 'solid',
        attachedTokenId: selectedToken.id,
      });
    } else if (preset === 'spirit-guardians') {
      tokenStore.addAura(selectedToken.id, {
        id: `aura-spirit-guardians-${Date.now()}`,
        radiusFeet: 15,
        color: '#a855f7',
        fillAlpha: 0.18,
        borderStyle: 'solid',
        attachedTokenId: selectedToken.id,
      });
    } else if (preset === 'pass-without-trace') {
      tokenStore.addAura(selectedToken.id, {
        id: `aura-pass-without-trace-${Date.now()}`,
        radiusFeet: 30,
        color: '#10b981',
        fillAlpha: 0.14,
        borderStyle: 'dashed',
        attachedTokenId: selectedToken.id,
      });
    }
  }

  function removeAura(auraId: string) {
    if (!selectedToken) return;
    tokenStore.removeAura(selectedToken.id, auraId);
  }
</script>


<!-- ── Selected Token Inspector HUD ─────────────────────────────────────────── -->
{#if selectedToken}
  <div class="absolute bottom-6 right-6 z-40 w-72 bg-slate-900/95 border border-indigo-500/50 rounded-2xl p-3 shadow-2xl backdrop-blur-md text-xs font-sans animate-fade-in pointer-events-auto">
    <!-- Header: Name & Type -->
    <div class="flex items-center justify-between pb-2 border-b border-slate-800">
      <div class="flex items-center gap-2">
        <div
          class="w-4 h-4 rounded-full border border-white/40"
          style="background-color: {selectedToken.color || (selectedToken.isPlayer ? '#3b82f6' : '#ef4444')};"
        ></div>
        <span class="font-bold text-white truncate max-w-[130px]">{selectedToken.name}</span>
        <span class="px-1.5 py-0.5 rounded text-[10px] font-mono {selectedToken.isPlayer ? 'bg-blue-900/60 text-blue-300 border border-blue-700/50' : 'bg-rose-900/60 text-rose-300 border border-rose-700/50'}">
          {selectedToken.isPlayer ? 'PC' : 'NPC'}
        </span>
      </div>

      <button
        type="button"
        class="text-slate-400 hover:text-rose-400 p-1 rounded transition-colors"
        onclick={() => tokenStore.deleteToken(selectedToken.id)}
        title="Delete Token (Delete / Backspace)"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>

    <!-- Health Controls -->
    <div class="py-2 border-b border-slate-800">
      <div class="flex items-center justify-between text-[11px] mb-1">
        <span class="text-slate-400 font-medium">Hit Points</span>
        <span class="font-mono font-bold text-emerald-400">{selectedToken.hp} / {selectedToken.maxHp} HP</span>
      </div>
      <div class="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mb-2">
        <div
          class="h-full transition-all duration-300 {selectedToken.hp / selectedToken.maxHp > 0.5 ? 'bg-emerald-500' : selectedToken.hp / selectedToken.maxHp > 0.2 ? 'bg-amber-500' : 'bg-rose-500'}"
          style="width: {Math.max(0, Math.min(100, (selectedToken.hp / selectedToken.maxHp) * 100))}%;"
        ></div>
      </div>
      <div class="flex items-center justify-between gap-1">
        <button
          type="button"
          class="flex-1 py-1 bg-rose-950/80 hover:bg-rose-900 border border-rose-800/50 rounded text-rose-300 font-bold"
          onclick={() => tokenStore.updateHp(selectedToken.id, -5)}
        >
          -5
        </button>
        <button
          type="button"
          class="flex-1 py-1 bg-rose-950/80 hover:bg-rose-900 border border-rose-800/50 rounded text-rose-300 font-bold"
          onclick={() => tokenStore.updateHp(selectedToken.id, -1)}
        >
          -1
        </button>
        <button
          type="button"
          class="flex-1 py-1 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800/50 rounded text-emerald-300 font-bold"
          onclick={() => tokenStore.updateHp(selectedToken.id, 1)}
        >
          +1
        </button>
        <button
          type="button"
          class="flex-1 py-1 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800/50 rounded text-emerald-300 font-bold"
          onclick={() => tokenStore.updateHp(selectedToken.id, 5)}
        >
          +5
        </button>
      </div>
    </div>

    <!-- Size Category & Elevation -->
    <div class="grid grid-cols-2 gap-2 py-2 border-b border-slate-800 text-[11px]">
      <div>
        <span class="text-slate-400 block mb-1">Footprint Size</span>
        <select
          value={selectedToken.size === 1 ? 'medium' : selectedToken.size === 2 ? 'large' : selectedToken.size === 3 ? 'huge' : 'gargantuan'}
          onchange={(e) => handleSizeChange(e.currentTarget.value)}
          class="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
        >
          <option value="medium">Medium (1×1)</option>
          <option value="large">Large (2×2)</option>
          <option value="huge">Huge (3×3)</option>
          <option value="gargantuan">Gargantuan (4×4)</option>
        </select>
      </div>

      <div>
        <span class="text-slate-400 block mb-1">Elevation</span>
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="w-6 h-6 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 font-bold"
            onclick={() => handleElevationStep(-5)}
          >
            -
          </button>
          <span class="flex-1 text-center font-mono text-cyan-300 font-bold">
            {selectedToken.elevation || 0} ft
          </span>
          <button
            type="button"
            class="w-6 h-6 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 font-bold"
            onclick={() => handleElevationStep(5)}
          >
            +
          </button>
        </div>
      </div>
    </div>

    <!-- 5e Vision & Lighting -->
    <div class="py-2 border-b border-slate-800 text-[11px] space-y-2">
      <!-- Vision Sensory Type -->
      <div>
        <div class="flex items-center justify-between mb-1">
          <span class="text-slate-400">Vision Mode</span>
          <span class="font-mono text-cyan-300 font-bold">{selectedToken.visionRange ?? 60} ft</span>
        </div>
        <div class="grid grid-cols-3 gap-1">
          {#each ['normal', 'darkvision', 'blind'] as vType}
            {@const isSelected = (selectedToken.visionType ?? 'normal') === vType}
            <button
              type="button"
              class="py-1 px-1.5 rounded text-[10px] font-medium capitalize transition-all border {isSelected ? 'bg-cyan-950/80 text-cyan-300 border-cyan-700/80' : 'bg-slate-950/80 text-slate-400 border-slate-800 hover:text-slate-200'}"
              onclick={() => handleVisionChange(vType as VisionType)}
            >
              {vType}
            </button>
          {/each}
        </div>
      </div>

      <!-- Light Emission Presets -->
      <div>
        <div class="flex items-center justify-between mb-1">
          <span class="text-slate-400">Light Emission</span>
          <span class="font-mono text-amber-300 font-bold">
            {selectedToken.lightEmission?.enabled ? `${selectedToken.lightEmission.brightRadius}/${selectedToken.lightEmission.dimRadius} ft` : 'Off'}
          </span>
        </div>
        <div class="grid grid-cols-4 gap-1">
          <button
            type="button"
            class="py-1 rounded text-[10px] font-medium transition-all border {!selectedToken.lightEmission?.enabled ? 'bg-slate-800 text-white border-slate-600' : 'bg-slate-950/80 text-slate-400 border-slate-800 hover:text-slate-200'}"
            onclick={() => setLightPreset('off')}
          >
            None
          </button>
          <button
            type="button"
            class="py-1 rounded text-[10px] font-medium transition-all border {selectedToken.lightEmission?.enabled && selectedToken.lightEmission.brightRadius === 20 && selectedToken.lightEmission.color === '#ff9900' ? 'bg-amber-950/90 text-amber-300 border-amber-600' : 'bg-slate-950/80 text-slate-400 border-slate-800 hover:text-amber-200'}"
            onclick={() => setLightPreset('torch')}
            title="Torch: 20ft bright / 20ft dim"
          >
            🔥 Torch
          </button>
          <button
            type="button"
            class="py-1 rounded text-[10px] font-medium transition-all border {selectedToken.lightEmission?.enabled && selectedToken.lightEmission.brightRadius === 30 ? 'bg-amber-950/90 text-amber-300 border-amber-600' : 'bg-slate-950/80 text-slate-400 border-slate-800 hover:text-amber-200'}"
            onclick={() => setLightPreset('lantern')}
            title="Bullseye / Hooded Lantern: 30ft bright / 30ft dim"
          >
            🏮 Lantern
          </button>
          <button
            type="button"
            class="py-1 rounded text-[10px] font-medium transition-all border {selectedToken.lightEmission?.enabled && selectedToken.lightEmission.color === '#60a5fa' ? 'bg-blue-950/90 text-blue-300 border-blue-600' : 'bg-slate-950/80 text-slate-400 border-slate-800 hover:text-blue-200'}"
            onclick={() => setLightPreset('cantrip')}
            title="Light Cantrip: 20ft bright / 20ft dim (Blue)"
          >
            ✨ Cantrip
          </button>
        </div>
      </div>
    </div>

    <!-- Attached 5e Auras -->
    <div class="py-2 border-b border-slate-800 text-[11px] space-y-1.5">
      <div class="flex items-center justify-between">
        <span class="text-slate-400 font-medium">Attached Auras</span>
        {#if selectedToken.auras && selectedToken.auras.length > 0}
          <button
            type="button"
            class="text-[9px] text-rose-400 hover:text-rose-300"
            onclick={() => tokenStore.clearAuras(selectedToken.id)}
          >
            Clear All
          </button>
        {/if}
      </div>

      <!-- Presets -->
      <div class="grid grid-cols-2 gap-1">
        <button
          type="button"
          class="py-1 px-1.5 rounded text-[10px] font-medium bg-amber-950/60 text-amber-300 border border-amber-800/60 hover:bg-amber-900/80 transition-all text-left truncate flex items-center justify-between"
          onclick={() => addPresetAura('paladin-10')}
          title="Paladin Aura of Protection (10 ft)"
        >
          <span>🛡️ Paladin (10ft)</span>
          <span class="text-[9px] opacity-70">+</span>
        </button>
        <button
          type="button"
          class="py-1 px-1.5 rounded text-[10px] font-medium bg-amber-950/60 text-amber-300 border border-amber-800/60 hover:bg-amber-900/80 transition-all text-left truncate flex items-center justify-between"
          onclick={() => addPresetAura('paladin-30')}
          title="Paladin Aura of Protection (30 ft)"
        >
          <span>🛡️ Paladin (30ft)</span>
          <span class="text-[9px] opacity-70">+</span>
        </button>
        <button
          type="button"
          class="py-1 px-1.5 rounded text-[10px] font-medium bg-purple-950/60 text-purple-300 border border-purple-800/60 hover:bg-purple-900/80 transition-all text-left truncate flex items-center justify-between"
          onclick={() => addPresetAura('spirit-guardians')}
          title="Spirit Guardians (15 ft)"
        >
          <span>👼 Spirit Guard (15ft)</span>
          <span class="text-[9px] opacity-70">+</span>
        </button>
        <button
          type="button"
          class="py-1 px-1.5 rounded text-[10px] font-medium bg-emerald-950/60 text-emerald-300 border border-emerald-800/60 hover:bg-emerald-900/80 transition-all text-left truncate flex items-center justify-between"
          onclick={() => addPresetAura('pass-without-trace')}
          title="Pass Without Trace (30 ft)"
        >
          <span>🍃 Pass w/o Trace (30ft)</span>
          <span class="text-[9px] opacity-70">+</span>
        </button>
      </div>

      <!-- Active Aura Chips -->
      {#if selectedToken.auras && selectedToken.auras.length > 0}
        <div class="flex flex-wrap gap-1 pt-1">
          {#each selectedToken.auras as aura (aura.id)}
            <div
              class="px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1.5 border border-slate-700 bg-slate-950"
              style="border-left: 3px solid {aura.color};"
            >
              <span class="font-mono text-slate-200">{aura.radiusFeet}ft</span>
              <span class="text-[9px] text-slate-400 capitalize">({aura.borderStyle})</span>
              <button
                type="button"
                class="text-slate-500 hover:text-rose-400"
                onclick={() => removeAura(aura.id)}
                title="Remove aura"
              >
                ✕
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Conditions Tray -->
    <div class="pt-2">
      <span class="text-[10px] text-slate-400 font-medium block mb-1.5">Conditions</span>
      <div class="flex flex-wrap gap-1">
        {#each COMMON_CONDITIONS as cond}
          {@const isActive = selectedToken.conditions?.includes(cond.name)}
          <button
            type="button"
            class="px-1.5 py-0.5 rounded text-[10px] font-medium transition-all flex items-center gap-1 {isActive ? 'bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-400' : 'bg-slate-950/80 text-slate-400 hover:text-slate-200 border border-slate-800'}"
            onclick={() => tokenStore.toggleCondition(selectedToken.id, cond.name)}
          >
            <span>{cond.icon}</span>
            <span>{cond.name}</span>
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}
