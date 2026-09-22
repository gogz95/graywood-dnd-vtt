<!-- src/lib/components/navigation/NavAccordionGroup.svelte -->
<!-- Hierarchical Accordion Sub-Menu Group with Smooth Height Transitions & Chevron Rotation -->

<script lang="ts">
  export interface NavItem {
    id: string;
    label: string;
    badge?: string;
    icon?: string;
    action?: string;
  }

  export interface NavGroup {
    id: string;
    label: string;
    icon: string;
    defaultChildId: string;
    children: NavItem[];
  }

  let {
    group,
    isOpen = false,
    isCollapsedRail = false,
    activeItemId = '',
    onToggle,
    onSelectChild,
    onSelectGroup,
  }: {
    group: NavGroup;
    isOpen?: boolean;
    isCollapsedRail?: boolean;
    activeItemId?: string;
    onToggle?: () => void;
    onSelectChild?: (child: NavItem, group: NavGroup) => void;
    onSelectGroup?: (group: NavGroup) => void;
  } = $props();

  let isGroupActive = $derived(
    group.children.some(c => c.id === activeItemId) || group.id === activeItemId
  );
</script>

{#if isCollapsedRail}
  <!-- Docked Icon-Rail Mode: Compact Square Button with Active Indicator -->
  <button
    type="button"
    title="{group.label} — {group.children.map(c => c.label).join(', ')}"
    onclick={() => {
      onSelectGroup?.(group);
      onToggle?.();
    }}
    class="w-11 h-11 mx-auto rounded-xl flex items-center justify-center transition-all relative group
      {isGroupActive
        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'}"
  >
    <span class="text-lg leading-none transition-transform group-hover:scale-110 select-none">
      {group.icon}
    </span>
    {#if isGroupActive}
      <span class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-indigo-300 rounded-r-full"></span>
    {/if}
  </button>
{:else}
  <!-- Expanded Navigation Panel Mode: Header with Dynamic Chevron & Accordion Branch -->
  <div class="rounded-xl transition-colors overflow-hidden {isGroupActive ? 'bg-slate-800/30' : ''}">
    <!-- Accordion Section Header -->
    <button
      type="button"
      onclick={() => onToggle?.()}
      class="w-full text-left px-3 py-2.5 rounded-xl flex items-center justify-between text-xs font-semibold transition-all group
        {isGroupActive
          ? 'text-slate-100 bg-slate-800/70 shadow-sm'
          : 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/40'}"
      aria-expanded={isOpen}
    >
      <div class="flex items-center gap-2.5 min-w-0">
        <span class="text-base leading-none shrink-0 group-hover:scale-105 transition-transform select-none">
          {group.icon}
        </span>
        <span class="truncate tracking-wide">{group.label}</span>
      </div>

      <div class="flex items-center gap-1.5 shrink-0 ml-2">
        <svg
          class="w-3.5 h-3.5 transition-transform duration-200 {isOpen ? 'rotate-90 text-indigo-400' : 'rotate-0 text-slate-500'}"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </div>
    </button>

    <!-- Child Accordion Branch (Smooth Height CSS Grid Transition) -->
    <div
      class="grid transition-[grid-template-rows] duration-200 ease-out {isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}"
    >
      <div class="overflow-hidden">
        <div class="pl-3 pr-1 py-1 space-y-0.5 border-l border-slate-800 ml-4 my-1">
          {#each group.children as child (child.id)}
            {@const isChildActive = child.id === activeItemId}
            <button
              type="button"
              onclick={() => onSelectChild?.(child, group)}
              class="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center justify-between group
                {isChildActive
                  ? 'bg-indigo-600 text-white font-semibold shadow-sm shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'}"
            >
              <span class="truncate flex items-center gap-2 min-w-0">
                {#if child.icon}
                  <span class="text-xs opacity-75 shrink-0">{child.icon}</span>
                {/if}
                <span class="truncate">{child.label}</span>
              </span>

              {#if child.badge}
                <span
                  class="text-[9px] px-1.5 py-0.5 rounded-md font-mono shrink-0 ml-1.5 {isChildActive
                    ? 'bg-indigo-700/80 text-indigo-100'
                    : 'bg-slate-800 text-slate-400 group-hover:text-slate-300'}"
                >
                  {child.badge}
                </span>
              {/if}
            </button>
          {/each}
        </div>
      </div>
    </div>
  </div>
{/if}
