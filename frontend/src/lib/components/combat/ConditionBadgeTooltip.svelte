<!-- frontend/src/lib/components/combat/ConditionBadgeTooltip.svelte -->
<!-- Inline Mechanical Condition Tooltip with 80ms Fast Hover Delay & High Contrast Dark Styling -->

<script lang="ts">
  import { getConditionSummary } from '$lib/services/dndRulesEngine';
  import { CONDITION_REGISTRY } from '$lib/components/map/TokenOverlay';

  interface Props {
    condition: string;
    showIcon?: boolean;
    compact?: boolean;
    active?: boolean;
    onclick?: () => void;
  }

  let { condition, showIcon = true, compact = false, active = false, onclick }: Props = $props();

  let isHovered = $state(false);
  let showTooltip = $state(false);
  let hoverTimer: ReturnType<typeof setTimeout> | null = null;

  let rule = $derived(getConditionSummary(condition));
  let style = $derived(
    CONDITION_REGISTRY[condition.split(' ')[0]] || {
      name: condition,
      color: 'rgba(239, 68, 68, 0.4)',
      borderColor: '#ef4444',
      icon: '⚠️',
    }
  );

  function handleMouseEnter() {
    isHovered = true;
    if (hoverTimer) clearTimeout(hoverTimer);
    // Instant 80ms hover delay
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
      <span class="truncate max-w-[100px]">{rule.name}</span>
    </button>
  {:else}
    <!-- Condition Badge Trigger -->
    <span
      class="inline-flex items-center gap-1 rounded-full border transition-all cursor-help select-none {compact ? 'px-1.5 py-0.2 text-[9px]' : 'px-2 py-0.5 text-[10px]'} font-semibold"
      style="border-color: {style.borderColor}; background-color: {style.color || 'rgba(15, 23, 42, 0.8)'}; color: #f8fafc;"
    >
      {#if showIcon}
        <span class="text-xs">{rule.icon || style.icon}</span>
      {/if}
      <span class="truncate max-w-[100px]">{rule.name}</span>
    </span>
  {/if}

  <!-- Fast Hover Tooltip Modal -->
  {#if showTooltip}
    <div
      class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none w-64 p-3 bg-slate-950/95 border border-slate-700/80 rounded-xl shadow-2xl text-left animate-in fade-in zoom-in-95 duration-100 backdrop-blur-xl"
    >
      <div class="flex items-center gap-2 pb-1.5 mb-1.5 border-b border-slate-800">
        <span class="text-base">{rule.icon}</span>
        <span class="font-bold text-xs text-white uppercase tracking-wider">{rule.name}</span>
        <span class="ml-auto text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
          5e SRD
        </span>
      </div>

      <p class="text-[11px] font-medium text-amber-200/90 leading-snug">
        {rule.summary}
      </p>

      <ul class="mt-2 space-y-1 text-[10px] text-slate-300 list-disc list-inside leading-tight border-t border-slate-900 pt-1.5">
        {#each rule.mechanics as mech}
          <li>{mech}</li>
        {/each}
      </ul>

      <!-- Micro arrow notch -->
      <div class="absolute top-full left-1/2 -translate-x-1/2 -mt-px w-2 h-2 bg-slate-950 border-r border-b border-slate-700/80 rotate-45"></div>
    </div>
  {/if}
</div>
