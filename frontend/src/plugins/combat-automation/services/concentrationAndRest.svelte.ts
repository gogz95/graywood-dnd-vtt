// frontend/src/plugins/combat-automation/services/concentrationAndRest.svelte.ts
// Concentration Watchdog & 5e Rest Automation Engine with Svelte 5 Runes

import type { CoreActor } from '$lib/types/coreModels';
import type { PluginContext } from '$lib/types/plugin';

export interface ConcentrationPrompt {
  id: string;
  actorId: string;
  actorName: string;
  damageTaken: number;
  dc: number;
  spellName?: string;
}

export class ConcentrationAndRestEngine {
  pendingPrompts = $state<ConcentrationPrompt[]>([]);

  computeConcentrationDc(damage: number): number {
    return Math.max(10, Math.floor(damage / 2));
  }

  handleDamageEvent(
    payload: {
      actorId?: string;
      actorName?: string;
      damage?: number;
      amount?: number;
      conditions?: string[];
      spellName?: string;
    },
    context: PluginContext
  ): void {
    const actorId = payload.actorId || 'unknown';
    const actorName = payload.actorName || 'Combatant';
    const damage = payload.damage ?? payload.amount ?? 0;
    const conditions = Array.isArray(payload.conditions) ? payload.conditions : [];

    const isConcentrating = conditions.some((c) =>
      c.toLowerCase().includes('concentrat')
    );

    if (isConcentrating && damage > 0) {
      const dc = this.computeConcentrationDc(damage);
      const prompt: ConcentrationPrompt = {
        id: `con_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        actorId,
        actorName,
        damageTaken: damage,
        dc,
        spellName: payload.spellName || 'Active Spell'
      };

      this.pendingPrompts.push(prompt);

      context.emit('NOTIFICATION', {
        type: 'warning',
        title: 'Concentration Check Required',
        message: `${actorName} took ${damage} damage! DC ${dc} Constitution save required.`
      });
    }
  }

  resolvePrompt(promptId: string, success: boolean, context: PluginContext): void {
    const idx = this.pendingPrompts.findIndex((p) => p.id === promptId);
    if (idx !== -1) {
      const prompt = this.pendingPrompts[idx];
      this.pendingPrompts.splice(idx, 1);

      if (success) {
        context.emit('NOTIFICATION', {
          type: 'success',
          title: 'Concentration Maintained',
          message: `${prompt.actorName} maintained concentration (DC ${prompt.dc}).`
        });
      } else {
        context.emit('NOTIFICATION', {
          type: 'error',
          title: 'Concentration Broken',
          message: `${prompt.actorName} dropped concentration on ${prompt.spellName || 'spell'}.`
        });
        context.emit('CONCENTRATION_LOST', {
          actorId: prompt.actorId,
          actorName: prompt.actorName
        }, true);
      }
    }
  }

  executeRest(type: 'short' | 'long', actors: CoreActor[], context: PluginContext): void {
    if (type === 'long') {
      for (const actor of actors) {
        actor.vitals.hpCurrent = actor.vitals.hpMax;
        actor.vitals.hpTemp = 0;

        if (actor.sheetData) {
          const maxLevel = (actor.sheetData.level as number) || 1;
          const currentHd = (actor.sheetData.hitDiceCurrent as number) ?? maxLevel;
          const recoverHd = Math.max(1, Math.floor(maxLevel / 2));
          actor.sheetData.hitDiceCurrent = Math.min(maxLevel, currentHd + recoverHd);

          if (Array.isArray(actor.sheetData.spellSlots)) {
            for (const slot of actor.sheetData.spellSlots) {
              if (slot && typeof slot === 'object') {
                slot.used = 0;
              }
            }
          }
        }
      }

      context.emit('TIME_ADVANCED', { hours: 8 }, true);
      context.emit('NOTIFICATION', {
        type: 'success',
        title: 'Long Rest Finished (8 Hours)',
        message: 'All party members restored full HP, recovered spell slots and half Hit Dice.'
      });
      context.emit('REST_COMPLETED', { type: 'long', hours: 8 }, true);
    } else {
      // Short Rest (1 Hour)
      for (const actor of actors) {
        const conMod = (actor.sheetData?.abilityModifiers as any)?.con ?? 1;
        const hitDieSize = (actor.sheetData?.hitDieSize as number) || 8;
        const currentHd = (actor.sheetData?.hitDiceCurrent as number) ?? 1;

        if (currentHd > 0 && actor.vitals.hpCurrent < actor.vitals.hpMax) {
          const avgHeal = Math.floor(hitDieSize / 2) + 1 + conMod;
          actor.vitals.hpCurrent = Math.min(actor.vitals.hpMax, actor.vitals.hpCurrent + Math.max(1, avgHeal));
          if (actor.sheetData) {
            actor.sheetData.hitDiceCurrent = currentHd - 1;
          }
        }
      }

      context.emit('TIME_ADVANCED', { hours: 1 }, true);
      context.emit('NOTIFICATION', {
        type: 'success',
        title: 'Short Rest Finished (1 Hour)',
        message: 'Party rested for 1 hour, spent Hit Dice, and regained stamina.'
      });
      context.emit('REST_COMPLETED', { type: 'short', hours: 1 }, true);
    }
  }
}

export const concentrationAndRestEngine = new ConcentrationAndRestEngine();

export function computeConcentrationDc(damage: number): number {
  return concentrationAndRestEngine.computeConcentrationDc(damage);
}

export function handleDamageEvent(
  payload: {
    actorId?: string;
    actorName?: string;
    damage?: number;
    amount?: number;
    conditions?: string[];
  },
  context: PluginContext
): void {
  concentrationAndRestEngine.handleDamageEvent(payload, context);
}

export function executeRest(
  type: 'short' | 'long',
  actors: CoreActor[],
  context: PluginContext
): void {
  concentrationAndRestEngine.executeRest(type, actors, context);
}
