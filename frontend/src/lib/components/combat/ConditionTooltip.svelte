<!-- frontend/src/lib/components/combat/ConditionTooltip.svelte -->
<!-- Floating Glassmorphism Mechanical 5e Condition Card with SRD 5.1 Advantage/Disadvantage Rules -->

<script lang="ts">
  import { getCondition5e, type ConditionDefinition5e } from '$lib/data/conditions5e';
  import { CONDITION_REGISTRY } from '$lib/components/map/TokenOverlay';

  interface Props {
    condition: string;
    showIcon?: boolean;
    compact?: boolean;
    active?: boolean;
    onclick?: () => void;
  }

  let {
    condition,
    showIcon = true,
    compact = false,
    active = false,
    onclick,
  }: Props = $props();

  let isHovered = $state(false);
  let showTooltip = $state(false);
  let hoverTimer: ReturnType<typeof setTimeout> | null = null;

  let rule: ConditionDefinition5e = $derived(getCondition5e(condition));
  let baseKey = $derived(condition.split(' ')[0]);
  let style = $derived(
    CONDITION_REGISTRY[baseKey] || {
      name: condition,
      color: 'rgba(239, 68, 68, 0.4)',
      borderColor: '#ef4444',
      icon: '⚠️',
    }
  );

  function handleMouseEnter() {
    isHovered = true;
    if (hoverTimer) clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      if (isHovered) {
        showTooltip = true;
      }
    }, 80);
  }

  function handleMouseLeave() {
    isHovered = false;
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
    showTooltip = false;
  }
</script>

<div
  class="relative inline-flex items-center"
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
  role="tooltip"
>
  {#if onclick}
    <button
      type="button"
      {onclick}
      class="inline-flex items-center gap-1 rounded-full border transition-all cursor-pointer select-none active:scale-95 {compact ? 'px-1.5 py-0.2 text-[9px]' : 'px-2 py-0.5 text-[10px]'} font-semibold {active ? 'ring-2 ring-amber-400 font-bold' : 'opacity-85 hover:opacity-100'}"
      style="border-color: {active ? '#f59e0b' : style.borderColor}; background-color: {active ? (style.color || 'rgba(239, 68, 68, 0.7)') : 'rgba(15, 23, 42, 0.8)'}; color: #f8fafc;"
    >
      {#if showIcon}
        <span class="text-xs">{rule.icon || style.icon}</span>
      {/if}
      <span class="truncate max-w-[110px]">{rule.name}</span>
    </button>
  {:else}
    <span
      class="inline-flex items-center gap-1 rounded-full border transition-all cursor-help select-none {compact ? 'px-1.5 py-0.2 text-[9px]' : 'px-2 py-0.5 text-[10px]'} font-semibold"
      style="border-color: {style.borderColor}; background-color: {style.color || 'rgba(15, 23, 42, 0.8)'}; color: #f8fafc;"
    >
      {#if showIcon}
        <span class="text-xs">{rule.icon || style.icon}</span>
      {/if}
      <span class="truncate max-w-[110px]">{rule.name}</span>
    </span>
  {/if}

  <!-- Glassmorphism Floating Mechanical Card -->
  {#if showTooltip}
    <div
      class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none w-72 p-3 bg-slate-900/95 border border-slate-700 backdrop-blur-md rounded-xl shadow-2xl text-left animate-in fade-in zoom-in-95 duration-100"
    >
      <div class="flex items-center justify-between pb-1.5 mb-2 border-b border-slate-700/80">
        <div class="flex items-center gap-1.5">
          <span class="text-base">{rule.icon || style.icon}</span>
          <span class="font-bold text-xs text-white uppercase tracking-wider">{rule.name}</span>
        </div>
        <span class="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800">
          {rule.source}
        </span>
      </div>

      <p class="text-[11px] font-medium text-amber-200/90 leading-snug mb-2">
        {rule.summary}
      </p>

      {#if rule.bulletPoints && rule.bulletPoints.length > 0}
        <ul class="space-y-1 border-t border-slate-800 pt-1.5">
          {#each rule.bulletPoints as pt}
            <li class="text-[10px] text-slate-300 flex items-start gap-1.5 leading-tight">
              <span class="text-cyan-400 mt-0.5 font-bold">▪</span>
              <span>{pt}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>
