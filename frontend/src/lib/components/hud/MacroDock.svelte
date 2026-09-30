<!-- src/lib/components/hud/MacroDock.svelte -->
<!-- Bottom-Docked Tactical Macro Action Bar (Slots 1-9) with Visual Active-State Hotkey Indicators -->

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { macroStore, type MacroAction } from '../../stores/macroStore.svelte';
  import { keyboardShortcuts } from '../../services/keyboardShortcuts';

  let activeTriggerSlot = $state<number | null>(null);
  let triggerSource = $state<'hotkey' | 'click' | null>(null);
  let clearTimer: any = null;

  function handleSlotTrigger(idx: number, source: 'hotkey' | 'click') {
    activeTriggerSlot = idx;
    triggerSource = source;
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = setTimeout(() => {
      if (activeTriggerSlot === idx) {
        activeTriggerSlot = null;
        triggerSource = null;
      }
    }, 280);
  }

  function triggerSlot(idx: number) {
    handleSlotTrigger(idx, 'click');
    keyboardShortcuts.triggerSlot(idx, 'click');
  }

  function handleDrop(e: DragEvent, slotIdx: number) {
    e.preventDefault();
    const rawData = e.dataTransfer?.getData('application/json') || e.dataTransfer?.getData('text/plain');
    if (!rawData) return;

    try {
      const data = JSON.parse(rawData);
      if (data.name) {
        const newMacro: MacroAction = {
          id: `macro-${Date.now()}`,
          name: data.name,
          icon: data.icon || (data.type === 'spell' ? '✨' : '⚔️'),
          command: data.formula ? `/roll ${data.formula}` : `/roll 1d20 + @selected.dex`,
          keybinding: (slotIdx + 1).toString(),
        };
        macroStore.setSlot(slotIdx, newMacro);
      }
    } catch (_) {}
  }

  onMount(() => {
    keyboardShortcuts.init();
    const unsubscribe = keyboardShortcuts.subscribeSlotTrigger((idx, src) => {
      handleSlotTrigger(idx, src);
    });
    return () => {
      unsubscribe();
      if (clearTimer) clearTimeout(clearTimer);
    };
  });
</script>

<div
  class="macro-dock-container pointer-events-auto flex items-center gap-1.5 p-1.5 bg-slate-950/90 backdrop-blur-md border border-slate-800 rounded-2xl shadow-2xl select-none"
  role="toolbar"
  aria-label="Tactical Macro Action Dock"
>
  {#each macroStore.slots as slot, idx}
    {@const isActive = activeTriggerSlot === idx}
    <div
      role="button"
      tabindex="0"
      onclick={() => triggerSlot(idx)}
      oncontextmenu={(e) => {
        e.preventDefault();
        macroStore.clearSlot(idx);
      }}
      ondragover={(e) => e.preventDefault()}
      ondrop={(e) => handleDrop(e, idx)}
      onkeydown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          triggerSlot(idx);
        }
      }}
      class="macro-slot relative w-10 h-10 rounded-xl flex flex-col items-center justify-center transition-all duration-150 cursor-pointer border {
        isActive
          ? 'scale-110 bg-amber-500 border-amber-300 text-slate-950 shadow-lg shadow-amber-500/50 ring-2 ring-amber-400 z-10'
          : slot
          ? 'bg-slate-900 hover:bg-slate-800 border-slate-700/80 text-slate-200 hover:border-slate-500 hover:shadow-md'
          : 'bg-slate-950/60 border-dashed border-slate-800 text-slate-600 hover:border-slate-700'
      }"
      title={slot ? `${slot.name} (${slot.command}) [Key: ${idx + 1}] — Right click to clear` : `Slot ${idx + 1} (Empty: Drag action or spell here)`}
      aria-label={slot ? `${slot.name} hotkey ${idx + 1}` : `Empty slot ${idx + 1}`}
    >
      <!-- Keybinding Number Badge -->
      <span
        class="absolute top-0.5 left-1 text-[8px] font-mono font-bold transition-colors {
          isActive ? 'text-slate-950' : 'text-slate-500'
        }"
      >
        {idx + 1}
      </span>

      <!-- Active Pulse Ripple Ping Indicator -->
      {#if isActive}
        <span class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping pointer-events-none"></span>
      {/if}

      {#if slot}
        <span class="text-base leading-none mt-1 transition-transform {isActive ? 'scale-125' : ''}">
          {slot.icon}
        </span>
        <span class="text-[7px] font-bold uppercase tracking-tight truncate max-w-[34px] leading-tight mt-0.5">
          {slot.name}
        </span>
      {:else}
        <span class="text-[10px] text-slate-700 font-bold mt-1">+</span>
      {/if}
    </div>
  {/each}
</div>

<style>
  .macro-dock-container {
    pointer-events: auto;
  }
  .macro-slot {
    user-select: none;
    -webkit-user-select: none;
  }
</style>
