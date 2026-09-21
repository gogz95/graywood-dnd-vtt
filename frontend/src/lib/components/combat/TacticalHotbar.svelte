<!-- src/lib/components/combat/TacticalHotbar.svelte -->
<!-- Bottom-Docked Tactical Macro Hotbar (Slots 1-9) with keyboard triggers and drag-and-drop assignment -->

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { macroStore, type MacroAction } from '../../stores/macroStore.svelte';

  let activeTriggerSlot = $state<number | null>(null);

  function handleKeyDown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }
    // Number keys 1-9
    const keyNum = parseInt(e.key, 10);
    if (!isNaN(keyNum) && keyNum >= 1 && keyNum <= 9) {
      const idx = keyNum - 1;
      triggerSlot(idx);
    }
  }

  function triggerSlot(idx: number) {
    activeTriggerSlot = idx;
    macroStore.executeMacro(idx);
    setTimeout(() => {
      if (activeTriggerSlot === idx) activeTriggerSlot = null;
    }, 200);
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
    window.addEventListener('keydown', handleKeyDown);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeyDown);
  });
</script>

<div class="flex items-center gap-1.5 p-1.5 bg-slate-950/90 backdrop-blur-md border border-slate-800 rounded-2xl shadow-2xl select-none">
  {#each macroStore.slots as slot, idx}
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
        if (e.key === 'Enter') triggerSlot(idx);
      }}
      class="relative w-10 h-10 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer border {
        activeTriggerSlot === idx
          ? 'scale-110 bg-amber-500 border-amber-400 text-slate-950 shadow-lg shadow-amber-500/30'
          : slot
          ? 'bg-slate-900 hover:bg-slate-800 border-slate-700/80 text-slate-200 hover:border-slate-500'
          : 'bg-slate-950/60 border-dashed border-slate-800 text-slate-600 hover:border-slate-700'
      }"
      title={slot ? `${slot.name} (${slot.command}) - Right click to clear` : `Slot ${idx + 1} (Drag action or spell here)`}
    >
      <!-- Keybinding Badge -->
      <span class="absolute top-0.5 left-1 text-[8px] font-mono font-bold {activeTriggerSlot === idx ? 'text-slate-950' : 'text-slate-500'}">
        {idx + 1}
      </span>

      {#if slot}
        <span class="text-base leading-none mt-1">{slot.icon}</span>
        <span class="text-[7px] font-bold uppercase truncate max-w-[34px] leading-tight mt-0.5">
          {slot.name}
        </span>
      {:else}
        <span class="text-[10px] text-slate-700 font-bold mt-1">+</span>
      {/if}
    </div>
  {/each}
</div>
