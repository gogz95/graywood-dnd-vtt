<!-- frontend/src/lib/components/navigation/ActionHotbar.svelte -->
<!-- Floating Macro & Quick-Action Hotbar with Drag-and-Drop Ingestion & Hotkeys 1-0 -->

<script lang="ts">
  import { hotbarStore } from '../../stores/hotbarStore.svelte';
  import type { HotbarItemType } from '../../types/hotbar';

  // State for right-click context menu
  let contextMenu = $state<{
    visible: boolean;
    x: number;
    y: number;
    slotIndex: number;
  }>({
    visible: false,
    x: 0,
    y: 0,
    slotIndex: 0,
  });

  // State for Macro Edit Modal
  let isEditingMacro = $state(false);
  let editSlotIndex = $state(0);
  let editLabel = $state('');
  let editType = $state<HotbarItemType>('macro');
  let editFormula = $state('');
  let editGlyph = $state('⚡');

  // Drag over tracking
  let dragOverSlot = $state<number | null>(null);

  function getHotkeyBadge(index: number): string {
    return index === 9 ? '0' : (index + 1).toString();
  }

  function handleSlotClick(index: number) {
    hotbarStore.executeSlot(index);
  }

  function handleContextMenu(e: MouseEvent, index: number) {
    e.preventDefault();
    contextMenu = {
      visible: true,
      x: e.clientX,
      y: e.clientY,
      slotIndex: index,
    };
  }

  function closeContextMenu() {
    contextMenu.visible = false;
  }

  function openEditModal(index: number) {
    const slot = hotbarStore.slots[index];
    editSlotIndex = index;
    if (slot) {
      editLabel = slot.label;
      editType = slot.itemType;
      editFormula = slot.payload.formula || slot.payload.command || '';
      editGlyph = slot.iconGlyph || '⚡';
    } else {
      editLabel = `Custom Macro ${getHotkeyBadge(index)}`;
      editType = 'macro';
      editFormula = '1d20 + 5';
      editGlyph = '⚡';
    }
    isEditingMacro = true;
    closeContextMenu();
  }

  function saveEditedMacro() {
    hotbarStore.setSlot(editSlotIndex, {
      itemType: editType,
      label: editLabel.trim() || `Macro ${getHotkeyBadge(editSlotIndex)}`,
      iconGlyph: editGlyph.trim() || '⚡',
      payload: {
        formula: editFormula.trim(),
        label: editLabel.trim(),
      },
    });
    isEditingMacro = false;
  }

  function clearSlot(index: number) {
    hotbarStore.clearSlot(index);
    closeContextMenu();
  }

  // ── Drag & Drop Handlers ───────────────────────────────────────────────────
  function handleDragOver(e: DragEvent, index: number) {
    e.preventDefault();
    dragOverSlot = index;
  }

  function handleDragLeave(_e: DragEvent, index: number) {
    if (dragOverSlot === index) {
      dragOverSlot = null;
    }
  }

  function handleDrop(e: DragEvent, index: number) {
    e.preventDefault();
    dragOverSlot = null;

    if (!e.dataTransfer) return;

    try {
      const rawData = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain');
      if (!rawData) return;

      const data = JSON.parse(rawData);

      // Recognize Compendium Spells, Character Attacks, SFX buttons
      if (data.type === 'spell' || data.itemType === 'spell') {
        hotbarStore.setSlot(index, {
          itemType: 'spell',
          label: data.name || data.label || 'Spell',
          iconGlyph: '✨',
          payload: {
            formula: data.attackRoll || data.damage || '1d20 + 5',
            damageFormula: data.damageFormula || data.damage,
            label: data.name || data.label,
          },
        });
      } else if (data.type === 'weapon' || data.itemType === 'weapon' || data.type === 'attack') {
        hotbarStore.setSlot(index, {
          itemType: 'weapon',
          label: data.name || data.label || 'Weapon',
          iconGlyph: '⚔️',
          payload: {
            formula: data.attackRoll || data.bonus || '1d20 + 4',
            damageFormula: data.damage || data.damageFormula || '1d8 + 2',
            label: data.name || data.label,
          },
        });
      } else if (data.type === 'audio_sfx' || data.itemType === 'audio_sfx' || data.sfxId) {
        hotbarStore.setSlot(index, {
          itemType: 'audio_sfx',
          label: data.label || data.name || 'Sound SFX',
          iconGlyph: '🔊',
          payload: {
            trigger: data.trigger || data.sfxId || 'sword_clash',
            sfxId: data.sfxId,
          },
        });
      } else {
        // Generic Macro payload
        hotbarStore.setSlot(index, {
          itemType: 'macro',
          label: data.name || data.label || 'Quick Action',
          iconGlyph: data.iconGlyph || '⚡',
          payload: data,
        });
      }
    } catch {
      // If plain text was dropped (e.g. dice formula "1d20+3")
      const text = e.dataTransfer.getData('text/plain');
      if (text) {
        hotbarStore.setSlot(index, {
          itemType: 'macro',
          label: text,
          iconGlyph: '🎲',
          payload: {
            formula: text,
            label: text,
          },
        });
      }
    }
  }

  // Window click dismisses context menu
  function handleWindowClick() {
    if (contextMenu.visible) {
      closeContextMenu();
    }
  }
</script>

<svelte:window onclick={handleWindowClick} />

<!-- ═══════════════════════════════════════════════════════════════════════════
     FLOATING QUICK-ACTION HOTBAR DOCK (CENTER-BOTTOM)
════════════════════════════════════════════════════════════════════════════ -->
<aside
  class="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-slate-950/80 backdrop-blur-xl border border-slate-800/90 rounded-2xl p-1.5 shadow-2xl shadow-black/80 flex items-center gap-1.5 select-none pointer-events-auto transition-all"
  aria-label="Macro & Quick-Action Hotbar"
>
  {#each hotbarStore.slots as slot, idx (idx)}
    {@const hotkeyLabel = getHotkeyBadge(idx)}
    {@const isTriggered = hotbarStore.activeTriggeredSlot === idx}
    {@const isHoveredDrop = dragOverSlot === idx}

    <button
      type="button"
      onclick={() => handleSlotClick(idx)}
      oncontextmenu={(e) => handleContextMenu(e, idx)}
      ondragover={(e) => handleDragOver(e, idx)}
      ondragleave={(e) => handleDragLeave(e, idx)}
      ondrop={(e) => handleDrop(e, idx)}
      class="relative group w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center border transition-all duration-150 {isTriggered
        ? 'scale-110 border-amber-400 bg-amber-950/80 shadow-lg shadow-amber-500/50 ring-2 ring-amber-400/80'
        : isHoveredDrop
        ? 'border-indigo-400 bg-indigo-950/80 scale-105 ring-2 ring-indigo-400/70'
        : slot
        ? 'border-slate-700/80 bg-slate-900/90 hover:bg-slate-800 hover:border-slate-600 active:scale-95 shadow-md shadow-black/50'
        : 'border-slate-800/60 bg-slate-950/40 hover:bg-slate-900/50 hover:border-slate-700/60'}"
      title={slot ? `${slot.label} (Press ${hotkeyLabel}) - Right click to edit` : `Slot ${hotkeyLabel} (Empty) - Drop spell/action or right click to configure`}
    >
      <!-- Hotkey Indicator Badge (Top-Left) -->
      <span
        class="absolute -top-1.5 -left-1.5 px-1 py-0.2 rounded-md bg-slate-900 border border-slate-700 font-mono text-[9px] font-black text-amber-400 shadow-sm pointer-events-none group-hover:border-amber-500 transition-colors"
      >
        {hotkeyLabel}
      </span>

      <!-- Slot Icon / Glyph / Label Content -->
      {#if slot}
        {#if slot.iconUrl}
          <img src={slot.iconUrl} alt={slot.label} class="w-6 h-6 object-contain pointer-events-none" />
        {:else}
          <span class="text-base sm:text-lg pointer-events-none transition-transform group-hover:scale-110">
            {slot.iconGlyph || '⚡'}
          </span>
        {/if}

        <!-- Active Item Type Sub-Indicator -->
        <span
          class="absolute bottom-0.5 right-1 w-1.5 h-1.5 rounded-full {slot.itemType === 'spell'
            ? 'bg-sky-400 shadow-sm shadow-sky-400/80'
            : slot.itemType === 'weapon'
            ? 'bg-rose-400 shadow-sm shadow-rose-400/80'
            : slot.itemType === 'audio_sfx'
            ? 'bg-emerald-400 shadow-sm shadow-emerald-400/80'
            : 'bg-amber-400 shadow-sm shadow-amber-400/80'}"
        ></span>
      {:else}
        <!-- Empty Slot Placeholder Dot -->
        <span class="w-1.5 h-1.5 rounded-full bg-slate-800 group-hover:bg-slate-700 transition-colors"></span>
      {/if}

      <!-- Tooltip on Hover -->
      {#if slot}
        <div
          class="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 transform group-hover:-translate-y-1 bg-slate-950 border border-slate-700 px-2 py-1 rounded-lg text-[10px] font-bold text-slate-200 whitespace-nowrap shadow-xl z-50 flex items-center gap-1.5"
        >
          <span>{slot.iconGlyph || '⚡'}</span>
          <span>{slot.label}</span>
          <span class="text-[9px] font-mono text-amber-400">[{hotkeyLabel}]</span>
        </div>
      {/if}
    </button>
  {/each}
</aside>

<!-- ═══════════════════════════════════════════════════════════════════════════
     RIGHT-CLICK CONTEXT MENU
════════════════════════════════════════════════════════════════════════════ -->
{#if contextMenu.visible}
  <div
    class="fixed z-50 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-1 text-xs text-slate-200 min-w-[140px] animate-in fade-in zoom-in-95 duration-100"
    style="left: {contextMenu.x}px; top: {contextMenu.y - 80}px;"
    role="menu"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => { if (e.key === 'Escape') closeContextMenu(); }}
  >
    <div class="px-3 py-1 text-[10px] font-mono text-slate-400 uppercase tracking-wider border-b border-slate-800">
      Slot {getHotkeyBadge(contextMenu.slotIndex)}
    </div>

    <button
      type="button"
      onclick={() => openEditModal(contextMenu.slotIndex)}
      class="w-full px-3 py-1.5 text-left hover:bg-slate-800 flex items-center gap-2 transition-colors"
      role="menuitem"
    >
      <span>✏️</span>
      <span>Edit Macro</span>
    </button>

    {#if hotbarStore.slots[contextMenu.slotIndex]}
      <button
        type="button"
        onclick={() => clearSlot(contextMenu.slotIndex)}
        class="w-full px-3 py-1.5 text-left hover:bg-rose-950/60 text-rose-400 hover:text-rose-300 flex items-center gap-2 transition-colors"
        role="menuitem"
      >
        <span>🗑️</span>
        <span>Clear Slot</span>
      </button>
    {/if}
  </div>
{/if}

<!-- ═══════════════════════════════════════════════════════════════════════════
     EDIT MACRO MODAL
════════════════════════════════════════════════════════════════════════════ -->
{#if isEditingMacro}
  <div class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
    <div class="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-sm w-full shadow-2xl text-slate-200 space-y-4">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <div class="flex items-center gap-2">
          <span class="text-xl">⚡</span>
          <h3 class="text-sm font-bold text-slate-100">Configure Hotbar Slot {getHotkeyBadge(editSlotIndex)}</h3>
        </div>
        <button
          type="button"
          onclick={() => isEditingMacro = false}
          class="text-slate-400 hover:text-slate-100 text-sm font-bold p-1 rounded-lg hover:bg-slate-800"
        >
          ✕
        </button>
      </div>

      <div class="space-y-3 text-xs">
        <div>
          <label for="macro-label-input" class="block text-slate-400 font-bold mb-1">Action Label</label>
          <input
            id="macro-label-input"
            type="text"
            bind:value={editLabel}
            placeholder="e.g. Fireball, Greatsword, Stealth Check"
            class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-500 font-medium"
          />
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label for="macro-type-select" class="block text-slate-400 font-bold mb-1">Item Type</label>
            <select
              id="macro-type-select"
              bind:value={editType}
              class="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-slate-100 focus:outline-none focus:border-amber-500 font-medium"
            >
              <option value="macro">Macro / Formula</option>
              <option value="spell">Spell</option>
              <option value="weapon">Weapon Attack</option>
              <option value="audio_sfx">Audio SFX</option>
              <option value="feature">Class Feature</option>
            </select>
          </div>

          <div>
            <label for="macro-glyph-input" class="block text-slate-400 font-bold mb-1">Icon Glyph</label>
            <input
              id="macro-glyph-input"
              type="text"
              bind:value={editGlyph}
              maxlength="4"
              class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-center text-base focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        <div>
          <label for="macro-formula-input" class="block text-slate-400 font-bold mb-1">
            {editType === 'audio_sfx' ? 'SFX Trigger Name' : 'Dice Formula / Slash Command'}
          </label>
          <input
            id="macro-formula-input"
            type="text"
            bind:value={editFormula}
            placeholder={editType === 'audio_sfx' ? 'sword_clash or sfx-sword' : 'e.g. 1d20 + 7 or 8d6'}
            class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-500 font-mono"
          />
        </div>
      </div>

      <div class="flex items-center gap-2 pt-2 border-t border-slate-800">
        <button
          type="button"
          onclick={saveEditedMacro}
          class="flex-1 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all active:scale-95 shadow-md shadow-amber-950/40"
        >
          Save Slot
        </button>
        <button
          type="button"
          onclick={() => isEditingMacro = false}
          class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
{/if}
