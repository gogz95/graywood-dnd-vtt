// src/lib/stores/combatStore.svelte.ts
// Svelte 5 Rune-based Combat Turn Order, Initiative Deck, and LAN Sync Store

import { tokenStore } from '$lib/stores/tokenStore.svelte';

async function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T | undefined> {
  if (typeof window !== 'undefined') {
    const win = window as any;
    const invokeFn = win.__TAURI__?.core?.invoke || win.__TAURI_INTERNALS__?.invoke;
    if (typeof invokeFn === 'function') {
      return invokeFn(cmd, args);
    }
  }
  return undefined;
}

export interface Combatant {
  tokenId: string;
  name: string;
  initiative: number;
  dexModifier: number;
  hp: number;
  maxHp: number;
  conditions: string[];
  isDefeated: boolean;
}

export interface ConcentrationPrompt {
  id: string;
  entityId: string;
  entityName: string;
  dc: number;
  damageTaken: number;
  conModifier: number;
  rollResult?: {
    d20: number;
    total: number;
    success: boolean;
  };
}

class CombatStore {
  isActive = $state(false);
  round = $state(1);
  turnIndex = $state(0);
  combatants = $state<Combatant[]>([]);
  activeConcentrationPrompt = $state<ConcentrationPrompt | null>(null);

  activeCombatant = $derived(
    this.combatants.length > 0 ? this.combatants[this.turnIndex] ?? null : null
  );


  startCombat() {
    const participants: Combatant[] = tokenStore.tokens
      .filter((t) => !t.isGmOnly && t.hp > 0)
      .map((t) => ({
        tokenId: t.id,
        name: t.name,
        initiative: Math.floor(Math.random() * 20) + 1,
        dexModifier: 0,
        hp: t.hp,
        maxHp: t.maxHp,
        conditions: t.conditions,
        isDefeated: false
      }));

    this.sortCombatants(participants);
    this.combatants = participants;
    this.round = 1;
    this.turnIndex = 0;
    this.isActive = true;
    this.broadcastCombat();
  }

  nextTurn() {
    if (this.combatants.length === 0) return;

    let next = this.turnIndex + 1;
    if (next >= this.combatants.length) {
      next = 0;
      this.round += 1;
    }

    this.turnIndex = next;

    // Skip defeated combatants automatically if possible
    if (this.combatants[this.turnIndex]?.isDefeated) {
      const activeRemaining = this.combatants.some((c) => !c.isDefeated);
      if (activeRemaining) {
        this.nextTurn();
        return;
      }
    }

    this.broadcastCombat();
  }

  previousTurn() {
    if (this.combatants.length === 0) return;

    let prev = this.turnIndex - 1;
    if (prev < 0) {
      if (this.round > 1) {
        this.round -= 1;
        prev = this.combatants.length - 1;
      } else {
        prev = 0;
      }
    }

    this.turnIndex = prev;
    this.broadcastCombat();
  }

  setInitiative(tokenId: string, score: number) {
    const target = this.combatants.find((c) => c.tokenId === tokenId);
    if (target) {
      target.initiative = score;
      const current = this.combatants.slice();
      this.sortCombatants(current);
      this.combatants = current;
      this.broadcastCombat();
    }
  }

  endCombat() {
    this.isActive = false;
    this.combatants = [];
    this.round = 1;
    this.turnIndex = 0;
    this.activeConcentrationPrompt = null;
    this.broadcastCombat();
  }

  triggerConcentrationCheck(entityId: string, entityName: string, damageTaken: number, conModifier: number = 0) {
    if (damageTaken <= 0) return;
    const dc = Math.max(10, Math.floor(damageTaken / 2));
    this.activeConcentrationPrompt = {
      id: `conc-${Date.now()}`,
      entityId,
      entityName,
      dc,
      damageTaken,
      conModifier,
    };
  }

  rollConcentrationSave(conModifier?: number): { d20: number; total: number; success: boolean } | null {
    if (!this.activeConcentrationPrompt) return null;
    const mod = conModifier !== undefined ? conModifier : this.activeConcentrationPrompt.conModifier;
    const d20 = Math.floor(Math.random() * 20) + 1;
    const total = d20 + mod;
    const success = total >= this.activeConcentrationPrompt.dc;
    const result = { d20, total, success };
    this.activeConcentrationPrompt.rollResult = result;
    return result;
  }

  dropConcentration(entityId?: string) {
    const id = entityId || this.activeConcentrationPrompt?.entityId;
    if (!id) return;

    // Remove from combatant conditions
    const combatant = this.combatants.find((c) => c.tokenId === id);
    if (combatant) {
      combatant.conditions = combatant.conditions.filter(
        (c) => c.toLowerCase() !== 'concentrating'
      );
    }

    // Remove from tokenStore conditions
    const token = tokenStore.tokens.find((t) => t.id === id);
    if (token) {
      token.conditions = token.conditions.filter(
        (c) => c.toLowerCase() !== 'concentrating'
      );
    }

    // Clear prompt if matching
    if (this.activeConcentrationPrompt?.entityId === id) {
      this.activeConcentrationPrompt = null;
    }

    this.broadcastCombat();
  }

  dismissConcentrationPrompt() {
    this.activeConcentrationPrompt = null;
  }

  applyDamage(tokenId: string, damage: number, conModifier: number = 0) {
    const combatant = this.combatants.find((c) => c.tokenId === tokenId);
    const actualDamage = Math.max(0, damage);
    if (combatant) {
      combatant.hp = Math.max(0, combatant.hp - actualDamage);
      if (combatant.hp <= 0) combatant.isDefeated = true;
      if (
        actualDamage > 0 &&
        combatant.conditions.some((c) => c.toLowerCase() === 'concentrating')
      ) {
        this.triggerConcentrationCheck(combatant.tokenId, combatant.name, actualDamage, conModifier);
      }
    }

    // Also sync to tokenStore
    tokenStore.updateHp(tokenId, -actualDamage);
    const token = tokenStore.tokens.find((t) => t.id === tokenId);
    if (
      !combatant &&
      token &&
      actualDamage > 0 &&
      token.conditions.some((c) => c.toLowerCase() === 'concentrating')
    ) {
      this.triggerConcentrationCheck(token.id, token.name, actualDamage, conModifier);
    }

    this.broadcastCombat();
  }


  private sortCombatants(list: Combatant[]) {
    list.sort((a, b) => {
      if (b.initiative !== a.initiative) return b.initiative - a.initiative;
      if (b.dexModifier !== a.dexModifier) return b.dexModifier - a.dexModifier;
      return a.name.localeCompare(b.name);
    });
  }

  private async broadcastCombat() {
    try {
      await invoke('broadcast_vtt_event', {
        event: 'combat:update',
        payload: {
          isActive: this.isActive,
          round: this.round,
          turnIndex: this.turnIndex,
          activeCombatantId: this.activeCombatant?.tokenId ?? null,
          combatants: this.combatants
        }
      });
    } catch (err) {
      console.warn('LAN combat broadcast unavailable:', err);
    }
  }
}

export const combatStore = new CombatStore();
