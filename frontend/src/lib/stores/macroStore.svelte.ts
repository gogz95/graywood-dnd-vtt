// src/lib/stores/macroStore.svelte.ts
// Tactical Macro Action Engine & Token Dynamic Property Resolver

import { chatStore } from './chatStore.svelte';
import { canvasStore } from './canvasStore';
import type { SavedEncounter } from '../../types/combat';

export interface MacroAction {
  id: string;
  name: string;
  icon: string;
  command: string;
  keybinding?: string;
}

const STORAGE_KEY = 'vtt_macro_slots';

const DEFAULT_MACROS: MacroAction[] = [
  { id: 'm1', name: 'Weapon Strike', icon: '⚔️', command: '/roll 1d20 + @selected.str', keybinding: '1' },
  { id: 'm2', name: 'Spell Slot 1', icon: '✨', command: '/spell 1', keybinding: '2' },
  { id: 'm3', name: 'Dodge / Dash', icon: '🛡️', command: '/condition dodge', keybinding: '3' },
  { id: 'm4', name: 'Fog Brush', icon: '🌫️', command: '/fog', keybinding: '4' },
  { id: 'm5', name: 'Ping Tool', icon: '📍', command: '/ping', keybinding: '5' },
  { id: 'm6', name: 'Ranged Shot', icon: '🏹', command: '/roll 1d20 + @selected.dex', keybinding: '6' },
  { id: 'm7', name: 'Apply -5 Dmg', icon: '💥', command: '/hp -5', keybinding: '7' },
  { id: 'm8', name: 'Heal +5 HP', icon: '💚', command: '/hp +5', keybinding: '8' },
  { id: 'm9', name: 'Initiative', icon: '⚡', command: '/roll 1d20 + @selected.dex', keybinding: '9' },
];

export class MacroStore {
  slots = $state<Array<MacroAction | null>>(new Array(9).fill(null));

  constructor() {
    this.loadSlots();
  }

  public loadSlots(): void {
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length === 9) {
            this.slots = parsed;
            return;
          }
        }
      } catch {
        // ignore
      }
    }

    // Default initialization
    const initial = new Array(9).fill(null);
    DEFAULT_MACROS.forEach((m, idx) => {
      if (idx < 9) initial[idx] = m;
    });
    this.slots = initial;
    this.saveSlots();
  }

  public saveSlots(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.slots));
    } catch {}
  }

  public setSlot(index: number, macro: MacroAction): void {
    if (index >= 0 && index < 9) {
      const copy = [...this.slots];
      copy[index] = { ...macro, keybinding: (index + 1).toString() };
      this.slots = copy;
      this.saveSlots();
    }
  }

  public clearSlot(index: number): void {
    if (index >= 0 && index < 9) {
      const copy = [...this.slots];
      copy[index] = null;
      this.slots = copy;
      this.saveSlots();
    }
  }

  /**
   * Resolves token and combatant properties for @selected expressions
   */
  private getSelectedActorContext(): { name: string; str: number; dex: number; con: number; int: number; wis: number; cha: number; id: string } {
    const activeTokId = canvasStore.activeTokenId;
    let actor = {
      id: activeTokId || 'token-default',
      name: 'Selected Token',
      str: 0,
      dex: 0,
      con: 0,
      int: 0,
      wis: 0,
      cha: 0,
    };

    if (!activeTokId) return actor;

    // Check encounters in localStorage
    try {
      const raw = localStorage.getItem('vtt_encounters');
      if (raw) {
        const encounters: Record<string, SavedEncounter> = JSON.parse(raw);
        for (const enc of Object.values(encounters)) {
          const comb = enc.combatants?.find(c => c.id === activeTokId || c.token_id === activeTokId);
          if (comb) {
            actor.name = comb.name;
            const dexScore = comb.scores?.dex ?? 10;
            const intScore = comb.scores?.int ?? 10;
            const wisScore = comb.scores?.wis ?? 10;
            actor.dex = Math.floor((dexScore - 10) / 2);
            actor.int = Math.floor((intScore - 10) / 2);
            actor.wis = Math.floor((wisScore - 10) / 2);
            return actor;
          }
        }
      }
    } catch {}

    // Check canvas store token
    const tok = canvasStore.tokens.find(t => t.id === activeTokId);
    if (tok) {
      actor.name = tok.id;
    }

    return actor;
  }

  public executeMacro(index: number): void {
    const macro = this.slots[index];
    if (!macro) return;

    const actor = this.getSelectedActorContext();
    let cmd = macro.command.trim();

    // 1. Script formula: /roll
    if (cmd.startsWith('/roll')) {
      let formula = cmd.replace(/^\/roll\s*/i, '');

      // Replace @selected.<attr> tags
      formula = formula.replace(/@selected\.(\w+)/gi, (_, attr: string) => {
        const key = attr.toLowerCase() as keyof typeof actor;
        const val = actor[key];
        const num = typeof val === 'number' ? val : 0;
        return num >= 0 ? `+ ${num}` : `- ${Math.abs(num)}`;
      });

      chatStore.roll(formula, {
        label: `${macro.name} (${actor.name})`,
        actorName: actor.name,
      });
      return;
    }

    // 2. Condition modifier: /condition <name>
    if (cmd.startsWith('/condition')) {
      const condName = cmd.replace(/^\/condition\s*/i, '').trim();
      const activeTokId = canvasStore.activeTokenId;
      if (activeTokId) {
        canvasStore.toggleTokenCondition(activeTokId, condName);
        chatStore.sendMessage(
          `🏷️ Toggled condition **${condName}** on **${actor.name}**.`,
          'System'
        );
      } else {
        chatStore.sendMessage(
          `⚠ No active token selected to toggle condition **${condName}**.`,
          'System'
        );
      }
      return;
    }

    // 3. HP delta: /hp <delta>
    if (cmd.startsWith('/hp')) {
      const deltaStr = cmd.replace(/^\/hp\s*/i, '').trim();
      const delta = parseInt(deltaStr, 10);
      if (!isNaN(delta)) {
        chatStore.sendMessage(
          `${delta >= 0 ? '💚 Healed' : '💥 Damaged'} **${actor.name}** by ${Math.abs(delta)} HP.`,
          'System'
        );
      }
      return;
    }

    // 4. Fog brush toggle: /fog or /tool fog
    if (cmd.startsWith('/fog') || cmd.startsWith('/tool fog')) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vtt:toggle-fog-tool'));
      }
      chatStore.sendMessage(`🌫️ Fog brush toggled.`, 'System');
      return;
    }

    // 5. Ping tool: /ping
    if (cmd.startsWith('/ping')) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vtt:trigger-ping'));
      }
      chatStore.sendMessage(`📍 Ping tool triggered at viewport center.`, 'System');
      return;
    }

    // 6. Spell slot cast: /spell <level> or /cast <level>
    if (cmd.startsWith('/spell') || cmd.startsWith('/cast')) {
      const parts = cmd.split(/\s+/);
      const level = parseInt(parts[1], 10) || 1;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vtt:cast-spell-slot', { detail: { level } }));
      }
      chatStore.sendMessage(`✨ Cast Level ${level} Spell Slot for **${actor.name}**.`, 'System');
      return;
    }

    // Fallback: Post raw text/command
    chatStore.sendMessage(cmd, actor.name);
  }
}

export const macroStore = new MacroStore();
