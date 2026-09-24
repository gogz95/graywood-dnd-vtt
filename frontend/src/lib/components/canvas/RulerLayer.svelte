<!-- frontend/src/lib/components/canvas/RulerLayer.svelte -->
<!-- Tabletop Measurement Ruler & 5e Area of Effect (AoE) Template Control HUD (Svelte 5 Runes) -->

<script lang="ts">
  import {
    canvasStore,
    type SpellAoeTemplate,
    type SpellAoeType,
    type RulerMeasurement,
    type RulerWaypoint
  } from '../../../stores/canvasStore.svelte';
  import { sendWsEvent } from '../../../stores/websocketStore';

  interface Props {
    isRulerToolActive?: boolean;
    measurementRule?: '5e-alt' | 'euclidean';
    onToggleRulerTool?: (active: boolean) => void;
    onChangeRule?: (rule: '5e-alt' | 'euclidean') => void;
    onSpawnTemplate?: (template: SpellAoeTemplate) => void;
    onClearAllTemplates?: () => void;
  }

  let {
    isRulerToolActive = $bindable(false),
    measurementRule = $bindable('5e-alt'),
    onToggleRulerTool,
    onChangeRule,
    onSpawnTemplate,
    onClearAllTemplates,
  }: Props = $props();

  // Panel collapse/expand state
  let isPanelOpen = $state(false);
  let activeTab = $state<'ruler' | 'templates'>('templates');

  // Custom template builder state
  let customType = $state<SpellAoeType>('circle');
  let customSizeFeet = $state(20);
  let customWidthFeet = $state(5);
  let customColor = $state('#ef4444');
  let customLabel = $state('Fireball');
  let customIsPublic = $state(true);

  // 5e SRD Quick Presets
  const AOE_PRESETS: Array<{
    name: string;
    icon: string;
    type: SpellAoeType;
    sizeFeet: number;
    widthFeet?: number;
    color: string;
    description: string;
  }> = [
    { name: 'Fireball', icon: '💥', type: 'circle', sizeFeet: 20, color: '#ef4444', description: '20-ft radius sphere' },
    { name: 'Burning Hands', icon: '🔥', type: 'cone', sizeFeet: 15, color: '#f97316', description: '15-ft 60° cone' },
    { name: 'Cone of Cold', icon: '❄️', type: 'cone', sizeFeet: 30, color: '#38bdf8', description: '30-ft 60° cone' },
    { name: 'Lightning Bolt', icon: '⚡', type: 'line', sizeFeet: 100, widthFeet: 5, color: '#eab308', description: '100-ft line, 5-ft wide' },
    { name: 'Spirit Guardians', icon: '🛡️', type: 'circle', sizeFeet: 15, color: '#a855f7', description: '15-ft radius sphere' },
    { name: 'Faerie Fire', icon: '✨', type: 'cube', sizeFeet: 20, color: '#ec4899', description: '20-ft cube' },
    { name: 'Darkness', icon: '🌑', type: 'circle', sizeFeet: 15, color: '#475569', description: '15-ft radius magical darkness' },
    { name: 'Thunderwave', icon: '🔊', type: 'cube', sizeFeet: 15, color: '#06b6d4', description: '15-ft cube emanating from caster' },
  ];

  const activeRuler = $derived(canvasStore.ruler);
  const aoeTemplates = $derived(canvasStore.aoeTemplates);

  function toggleRuler() {
    isRulerToolActive = !isRulerToolActive;
    onToggleRulerTool?.(isRulerToolActive);
  }

  function setRule(rule: '5e-alt' | 'euclidean') {
    measurementRule = rule;
    onChangeRule?.(rule);
  }

  function clearRuler() {
    canvasStore.setRuler(null);
  }

  function spawnPreset(preset: typeof AOE_PRESETS[0]) {
    const template: SpellAoeTemplate = {
      id: `aoe-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: preset.type,
      originX: 12,
      originY: 10,
      targetX: preset.type === 'cone' || preset.type === 'line' ? 16 : undefined,
      targetY: preset.type === 'cone' || preset.type === 'line' ? 10 : undefined,
      sizeFeet: preset.sizeFeet,
      widthFeet: preset.widthFeet,
      color: preset.color,
      label: preset.name,
      isPublic: true,
    };

    canvasStore.addAoeTemplate(template);
    onSpawnTemplate?.(template);
    broadcastAoeUpdate();
  }

  function spawnCustomTemplate() {
    const template: SpellAoeTemplate = {
      id: `aoe-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: customType,
      originX: 12,
      originY: 10,
      targetX: customType === 'cone' || customType === 'line' ? 16 : undefined,
      targetY: customType === 'cone' || customType === 'line' ? 10 : undefined,
      sizeFeet: customSizeFeet,
      widthFeet: customType === 'line' ? customWidthFeet : undefined,
      color: customColor,
      label: customLabel || 'Spell Effect',
      isPublic: customIsPublic,
    };

    canvasStore.addAoeTemplate(template);
    onSpawnTemplate?.(template);
    broadcastAoeUpdate();
  }

  function removeTemplate(id: string) {
    canvasStore.removeAoeTemplate(id);
    broadcastAoeUpdate();
  }

  function clearAll() {
    canvasStore.clearAoeTemplates();
    onClearAllTemplates?.();
    broadcastAoeUpdate();
  }

  function broadcastAoeUpdate() {
    try {
      sendWsEvent({
        type: 'SYSTEM_MESSAGE',
        message: JSON.stringify({ action: 'AOE_TEMPLATES_SYNC', count: canvasStore.aoeTemplates.length }),
        timestamp: Date.now()
      });
    } catch {}
  }
</script>

<!-- Floating Toolbar Button / Status Pill -->
<div class="absolute top-4 left-4 z-40 flex items-center gap-2 pointer-events-auto">
  <!-- Main Ruler & AoE Launcher Toggle -->
  <button
    onclick={() => isPanelOpen = !isPanelOpen}
    class="flex items-center gap-2 px-3.5 py-2 rounded-xl border backdrop-blur-md text-xs font-semibold shadow-xl transition-all active:scale-95 {isPanelOpen ? 'bg-indigo-600 border-indigo-400 text-white shadow-indigo-500/20' : 'bg-slate-900/90 border-slate-700/80 text-slate-200 hover:bg-slate-800'}"
    title="Open Measurement Ruler & 5e AoE Template HUD"
  >
    <span class="text-base">📏</span>
    <span>Measure & AoE</span>
    {#if aoeTemplates.length > 0}
      <span class="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
        {aoeTemplates.length}
      </span>
    {/if}
  </button>

  <!-- Quick Active Ruler Mode Pill -->
  <button
    onclick={toggleRuler}
    class="flex items-center gap-1.5 px-3 py-2 rounded-xl border backdrop-blur-md text-xs font-semibold shadow-lg transition-all active:scale-95 {isRulerToolActive ? 'bg-sky-500/20 border-sky-400 text-sky-200 shadow-sky-500/10' : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200'}"
    title="Toggle distance measurement tool (or hold Ctrl and drag on canvas)"
  >
    <span class="w-2 h-2 rounded-full {isRulerToolActive ? 'bg-sky-400 animate-pulse' : 'bg-slate-600'}"></span>
    <span>{isRulerToolActive ? 'Ruler Active (Ctrl+Drag)' : 'Ruler Off'}</span>
  </button>

  {#if activeRuler}
    <div class="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-sky-500/40 text-xs font-mono text-sky-300 backdrop-blur-md shadow-lg">
      <span class="font-bold text-white">{activeRuler.distanceFeet} ft</span>
      {#if activeRuler.waypoints && activeRuler.waypoints.length > 0}
        <span class="text-[10px] text-slate-400">({activeRuler.waypoints.length} waypoints)</span>
      {/if}
      <button
        onclick={clearRuler}
        class="text-slate-400 hover:text-rose-400 ml-1 text-xs"
        title="Clear Ruler"
      >
        ✕
      </button>
    </div>
  {/if}
</div>

<!-- Sliding AoE & Measurement Control Panel -->
{#if isPanelOpen}
  <div class="absolute top-16 left-4 z-40 w-80 bg-slate-900/95 border border-slate-700/80 rounded-2xl shadow-2xl backdrop-blur-md text-slate-100 flex flex-col overflow-hidden text-xs font-sans pointer-events-auto animate-in fade-in zoom-in-95 duration-150">
    <!-- Header with Tab Switcher -->
    <div class="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
      <div class="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
        <button
          onclick={() => activeTab = 'templates'}
          class="px-2.5 py-1 rounded text-xs font-medium transition-colors {activeTab === 'templates' ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'}"
        >
          Spell AoE ({aoeTemplates.length})
        </button>
        <button
          onclick={() => activeTab = 'ruler'}
          class="px-2.5 py-1 rounded text-xs font-medium transition-colors {activeTab === 'ruler' ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'}"
        >
          Ruler Settings
        </button>
      </div>

      <button
        onclick={() => isPanelOpen = false}
        class="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
        title="Close Panel"
      >
        ✕
      </button>
    </div>

    <!-- Tab 1: 5e Spell AoE Templates -->
    {#if activeTab === 'templates'}
      <div class="p-3 space-y-3.5 max-h-[75vh] overflow-y-auto">
        <!-- Quick 5e Presets Grid -->
        <div>
          <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
            Quick 5e Spell Presets
          </span>
          <div class="grid grid-cols-2 gap-1.5">
            {#each AOE_PRESETS as preset (preset.name)}
              <button
                onclick={() => spawnPreset(preset)}
                class="flex items-center gap-2 p-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 hover:border-slate-600 text-left transition-all active:scale-[0.98]"
              >
                <span class="text-base">{preset.icon}</span>
                <div class="min-w-0">
                  <div class="font-bold text-xs truncate text-slate-100">{preset.name}</div>
                  <div class="text-[10px] text-slate-400 truncate">{preset.description}</div>
                </div>
              </button>
            {/each}
          </div>
        </div>

        <!-- Custom Template Builder -->
        <div class="border-t border-slate-800/80 pt-3 space-y-2.5">
          <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Custom Area of Effect
          </span>

          <!-- Shape Type Selector -->
          <div class="grid grid-cols-4 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px] text-center font-medium">
            <button
              onclick={() => { customType = 'circle'; customLabel = 'Circle AoE'; }}
              class="py-1 rounded transition-colors {customType === 'circle' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'}"
            >
              Circle
            </button>
            <button
              onclick={() => { customType = 'cone'; customLabel = 'Cone AoE'; }}
              class="py-1 rounded transition-colors {customType === 'cone' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'}"
            >
              Cone (60°)
            </button>
            <button
              onclick={() => { customType = 'line'; customLabel = 'Line AoE'; }}
              class="py-1 rounded transition-colors {customType === 'line' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'}"
            >
              Line
            </button>
            <button
              onclick={() => { customType = 'cube'; customLabel = 'Cube AoE'; }}
              class="py-1 rounded transition-colors {customType === 'cube' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'}"
            >
              Cube
            </button>
          </div>

          <!-- Radius / Length Slider -->
          <div>
            <div class="flex justify-between text-[11px] font-medium text-slate-300 mb-1">
              <span>{customType === 'circle' ? 'Radius' : customType === 'cone' || customType === 'line' ? 'Length' : 'Side Length'}</span>
              <span class="font-mono text-amber-300 font-bold">{customSizeFeet} ft</span>
            </div>
            <input
              type="range"
              min="5"
              max="120"
              step="5"
              bind:value={customSizeFeet}
              class="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>

          <!-- Line Width if Line Shape -->
          {#if customType === 'line'}
            <div>
              <div class="flex justify-between text-[11px] font-medium text-slate-300 mb-1">
                <span>Line Width</span>
                <span class="font-mono text-amber-300 font-bold">{customWidthFeet} ft</span>
              </div>
              <div class="flex gap-2">
                <button
                  onclick={() => customWidthFeet = 5}
                  class="flex-1 py-1 rounded border text-xs font-mono {customWidthFeet === 5 ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400'}"
                >
                  5 ft
                </button>
                <button
                  onclick={() => customWidthFeet = 10}
                  class="flex-1 py-1 rounded border text-xs font-mono {customWidthFeet === 10 ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400'}"
                >
                  10 ft
                </button>
              </div>
            </div>
          {/if}

          <!-- Color & Label -->
          <div class="flex items-center gap-2">
            <input
              type="color"
              bind:value={customColor}
              class="w-8 h-8 rounded-lg border border-slate-700 bg-transparent cursor-pointer p-0.5"
              title="Template Fill Color"
            />
            <input
              type="text"
              placeholder="Label / Spell Name"
              bind:value={customLabel}
              class="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <!-- Public to Projector Toggle -->
          <label class="flex items-center gap-2 cursor-pointer text-xs text-slate-300 select-none">
            <input type="checkbox" bind:checked={customIsPublic} class="rounded accent-indigo-500" />
            <span>Broadcast to Player Projector & Mobile</span>
          </label>

          <!-- Spawn Custom Button -->
          <button
            onclick={spawnCustomTemplate}
            class="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-1.5"
          >
            <span>✨</span>
            <span>Spawn Template</span>
          </button>
        </div>

        <!-- Active Templates List -->
        {#if aoeTemplates.length > 0}
          <div class="border-t border-slate-800/80 pt-3 space-y-1.5">
            <div class="flex items-center justify-between mb-1">
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Active On Battlemat ({aoeTemplates.length})
              </span>
              <button
                onclick={clearAll}
                class="text-[10px] text-rose-400 hover:text-rose-300 underline"
              >
                Clear All
              </button>
            </div>

            {#each aoeTemplates as t (t.id)}
              <div class="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800 text-xs">
                <div class="flex items-center gap-2 min-w-0">
                  <span
                    class="w-3 h-3 rounded-full border border-white/40 flex-shrink-0"
                    style="background-color: {t.color};"
                  ></span>
                  <div class="truncate">
                    <span class="font-bold text-slate-200">{t.label || t.type}</span>
                    <span class="text-[10px] text-slate-400 ml-1">({t.sizeFeet} ft {t.type})</span>
                  </div>
                </div>
                <button
                  onclick={() => removeTemplate(t.id)}
                  class="p-1 text-slate-400 hover:text-rose-400"
                  title="Remove Template"
                >
                  ✕
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Tab 2: Ruler Settings & Shortcuts -->
    {#if activeTab === 'ruler'}
      <div class="p-3.5 space-y-3.5">
        <!-- Diagonal Rule Selection -->
        <div>
          <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
            Distance Calculation Rule
          </span>
          <div class="space-y-1.5">
            <button
              onclick={() => setRule('5e-alt')}
              class="w-full text-left p-2.5 rounded-xl border transition-all {measurementRule === '5e-alt' ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200 font-semibold' : 'bg-slate-950/40 border-slate-800 hover:bg-slate-800/40 text-slate-300'}"
            >
              <div class="font-bold text-xs mb-0.5">D&D 5e Standard (Alternating 5/10 ft)</div>
              <div class="text-[10px] text-slate-400 font-normal">
                1st diagonal = 5 ft, 2nd diagonal = 10 ft, 3rd = 5 ft. Per DMG p. 252.
              </div>
            </button>

            <button
              onclick={() => setRule('euclidean')}
              class="w-full text-left p-2.5 rounded-xl border transition-all {measurementRule === 'euclidean' ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200 font-semibold' : 'bg-slate-950/40 border-slate-800 hover:bg-slate-800/40 text-slate-300'}"
            >
              <div class="font-bold text-xs mb-0.5">Euclidean Direct Ray Distance</div>
              <div class="text-[10px] text-slate-400 font-normal">
                Straight line Pythagorean distance: √(Δx² + Δy²).
              </div>
            </button>
          </div>
        </div>

        <!-- Waypoint Controls Guide -->
        <div class="bg-slate-950/80 p-3 rounded-xl border border-slate-800/80 space-y-1 text-slate-400 text-[11px] leading-relaxed">
          <div class="font-bold text-slate-200 text-xs mb-1 flex items-center gap-1">
            <span>⌨️</span> Measurement Hotkeys
          </div>
          <div>• <strong class="text-slate-200">Ctrl + Drag:</strong> Measure distance from anywhere.</div>
          <div>• <strong class="text-slate-200">Space or Shift+Click:</strong> Drop a waypoint corner while dragging to path around walls.</div>
          <div>• <strong class="text-slate-200">Escape:</strong> Clear active ruler measurement.</div>
        </div>

        {#if activeRuler}
          <button
            onclick={clearRuler}
            class="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
          >
            Clear Active Ruler
          </button>
        {/if}
      </div>
    {/if}
  </div>
{/if}
