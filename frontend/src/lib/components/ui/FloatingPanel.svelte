<script lang="ts">
  // src/lib/components/ui/FloatingPanel.svelte
  // Non-blurring floating window shell with zero full-screen dimming and draggable titlebar

  import type { Snippet } from 'svelte';
  import { floatingWindowsStore, type WindowId } from '../../stores/floatingWindowsStore.svelte';

  let {
    id,
    title,
    icon = '🪟',
    children
  }: {
    id: WindowId;
    title: string;
    icon?: string;
    children?: Snippet;
  } = $props();

  const winState = $derived(floatingWindowsStore.windows[id]);

  let isDragging = $state(false);
  let dragStartX = 0;
  let dragStartY = 0;
  let initialX = 0;
  let initialY = 0;

  function handleMouseDown(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('button')) return;
    isDragging = true;
    floatingWindowsStore.bringToFront(id);
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    initialX = winState.x;
    initialY = winState.y;

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isDragging) return;
    const deltaX = e.clientX - dragStartX;
    const deltaY = e.clientY - dragStartY;
    floatingWindowsStore.updatePosition(id, initialX + deltaX, initialY + deltaY);
  }

  function handleMouseUp() {
    isDragging = false;
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  }

  function handleHeaderClick() {
    floatingWindowsStore.bringToFront(id);
  }
</script>

{#if winState && winState.isOpen}
  <!-- Pointer-events-none outer wrapper ensures underlying canvas stays fully interactive -->
  <div
    class="fixed pointer-events-none select-none"
    style="left: {winState.x}px; top: {winState.y}px; z-index: {winState.zIndex}; width: {winState.width}px; height: {winState.isMinimized ? 'auto' : `${winState.height}px`};"
  >
    <!-- Window Container with pointer-events-auto and strict backdrop-blur-none -->
    <div
      class="pointer-events-auto w-full h-full flex flex-col bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-none transition-shadow"
      style="box-shadow: 0 20px 40px -10px rgba(0,0,0,0.8), 0 0 1px 1px rgba(255,255,255,0.05);"
    >
      <!-- Title Bar (Draggable Handle) -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div
        onmousedown={handleMouseDown}
        onclick={handleHeaderClick}
        class="h-10 px-3 bg-slate-950/95 border-b border-slate-800 flex items-center justify-between cursor-move shrink-0"
      >
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-sm">{icon}</span>
          <span class="text-xs font-bold uppercase tracking-wider text-slate-200 truncate">
            {title}
          </span>
        </div>

        <!-- Window Action Buttons -->
        <div class="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onclick={() => floatingWindowsStore.toggleMinimize(id)}
            class="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-800 text-xs font-mono transition-colors"
            title={winState.isMinimized ? 'Restore' : 'Minimize'}
          >
            {winState.isMinimized ? '□' : '−'}
          </button>
          <button
            type="button"
            onclick={() => floatingWindowsStore.closeWindow(id)}
            class="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-rose-300 hover:bg-rose-900/50 text-xs font-bold transition-colors"
            title="Close Window"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Window Body -->
      {#if !winState.isMinimized}
        <div class="flex-1 overflow-hidden min-h-0 bg-slate-950 flex flex-col">
          {#if children}
            {@render children()}
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}
