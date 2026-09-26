// frontend/src/lib/stores/hotbarStore.svelte.ts
// Svelte 5 Persistent Macro & Quick-Action Hotbar Store

import type { HotbarSlotItem } from '../types/hotbar';
import { chatStore } from './chatStore.svelte';
import { audioEngine } from '../audio/AudioEngine';
import { soundboardEngine } from '../audio/soundboardEngine';

const STORAGE_KEY = 'vtt_quick_action_hotbar';
const TOTAL_SLOTS = 10;

function createDefaultSlots(): Array<HotbarSlotItem | null> {
  const slots: Array<HotbarSlotItem | null> = new Array(TOTAL_SLOTS).fill(null);

  // Provide initial sensible defaults for an immersive first impression
  slots[0] = {
    slotIndex: 0,
    itemType: 'weapon',
    label: 'Longsword Attack',
    iconGlyph: '⚔️',
    payload: {
      formula: '1d20 + 5',
      damageFormula: '1d8 + 3',
      label: 'Longsword Attack',
    },
  };
  slots[1] = {
    slotIndex: 1,
    itemType: 'spell',
    label: 'Fire Bolt',
    iconGlyph: '🔥',
    payload: {
      formula: '1d20 + 5',
      damageFormula: '1d10',
      label: 'Fire Bolt Cantrip',
    },
  };
  slots[2] = {
    slotIndex: 2,
    itemType: 'audio_sfx',
    label: 'Sword Clash SFX',
    iconGlyph: '💥',
    payload: {
      trigger: 'sword_clash',
      sfxId: 'sfx-sword',
    },
  };
  slots[3] = {
    slotIndex: 3,
    itemType: 'macro',
    label: 'Initiative Check',
    iconGlyph: '⚡',
    payload: {
      formula: '1d20 + 2',
      label: 'Initiative Roll',
    },
  };

  return slots;
}

function loadInitialSlots(): Array<HotbarSlotItem | null> {
  if (typeof localStorage === 'undefined') return createDefaultSlots();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultSlots();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === TOTAL_SLOTS) {
      return parsed;
    }
    return createDefaultSlots();
  } catch {
    return createDefaultSlots();
  }
}

class HotbarStore {
  slots = $state<Array<HotbarSlotItem | null>>(loadInitialSlots());
  activeTriggeredSlot = $state<number | null>(null);

  private persist() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.slots));
    } catch {
      // ignore quota issues
    }
  }

  setSlot(index: number, item: Omit<HotbarSlotItem, 'slotIndex'> | null) {
    if (index < 0 || index >= TOTAL_SLOTS) return;
    if (item === null) {
      this.slots[index] = null;
    } else {
      this.slots[index] = {
        ...item,
        slotIndex: index,
      };
    }
    this.persist();
  }

  clearSlot(index: number) {
    this.setSlot(index, null);
  }

  clearAll() {
    this.slots = new Array(TOTAL_SLOTS).fill(null);
    this.persist();
  }

  resetDefaults() {
    this.slots = createDefaultSlots();
    this.persist();
  }

  /**
   * Execute the action assigned to slotIndex (0–9)
   */
  async executeSlot(index: number) {
    if (index < 0 || index >= TOTAL_SLOTS) return;
    const item = this.slots[index];
    if (!item) return;

    // Trigger visual press effect (glow and pulse)
    this.activeTriggeredSlot = index;
    setTimeout(() => {
      if (this.activeTriggeredSlot === index) {
        this.activeTriggeredSlot = null;
      }
    }, 450);

    const payload = item.payload || {};

    switch (item.itemType) {
      case 'weapon':
      case 'spell': {
        const rollLabel = payload.label || item.label;
        const attackFormula = payload.formula || '1d20';
        chatStore.roll(attackFormula, {
          label: `${rollLabel} (Attack)`,
          actorName: payload.actorName || 'Player',
          actionType: 'attack',
        });

        if (payload.damageFormula) {
          setTimeout(() => {
            chatStore.roll(payload.damageFormula, {
              label: `${rollLabel} (Damage)`,
              actorName: payload.actorName || 'Player',
              actionType: 'damage',
            });
          }, 300);
        }
        break;
      }

      case 'audio_sfx': {
        const trigger = payload.trigger || payload.sfxId || 'sword_clash';
        if (payload.sfxId) {
          audioEngine.triggerSfx(payload.sfxId);
        }
        soundboardEngine.playSfx(trigger);
        break;
      }

      case 'macro': {
        const formula = payload.formula || payload.command;
        if (formula) {
          if (formula.startsWith('/')) {
            chatStore.sendMessage(formula, payload.actorName || 'Player');
          } else {
            chatStore.roll(formula, {
              label: payload.label || item.label,
              actorName: payload.actorName || 'Player',
            });
          }
        } else if (payload.commandText) {
          chatStore.sendMessage(payload.commandText, payload.actorName || 'Player');
        }
        break;
      }

      case 'feature': {
        const desc = payload.description || payload.text || item.label;
        chatStore.sendMessage(`[Feature] ${item.label}: ${desc}`, payload.actorName || 'Player');
        audioEngine.triggerSfx('sfx-dice');
        break;
      }

      default: {
        if (payload.formula) {
          chatStore.roll(payload.formula, { label: item.label });
        }
      }
    }
  }
}

export const hotbarStore = new HotbarStore();
