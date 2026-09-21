// src/lib/services/physicalDiceService.svelte.ts
// Service managing physical tabletop dice manual input prompts (Requirements 9 & 11)

import { chatStore } from '../stores/chatStore.svelte';

export interface ManualRollRequest {
  title: string;
  formula: string;
  dc?: number;
  targetAc?: number;
  actorName?: string;
  actionType?: 'attack' | 'damage' | 'check' | 'save' | 'custom';
}

interface ActiveRollPrompt extends ManualRollRequest {
  id: string;
  resolve: (value: number) => void;
  reject: (reason?: any) => void;
}

class PhysicalDiceService {
  currentPrompt = $state<ActiveRollPrompt | null>(null);

  promptManualRoll(request: ManualRollRequest): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      this.currentPrompt = {
        ...request,
        id: `prompt-${Date.now()}`,
        resolve: (val: number) => {
          this.currentPrompt = null;
          resolve(val);
        },
        reject: (reason?: any) => {
          this.currentPrompt = null;
          reject(reason);
        },
      };
    });
  }

  submitManualResult(resultNumber: number) {
    if (!this.currentPrompt) return;
    const prompt = this.currentPrompt;
    const total = Math.floor(resultNumber);

    // Format chat entry reflecting physical dice input
    const breakdown = {
      rawFormula: prompt.formula,
      terms: [{ label: 'Physical Table Roll', type: 'die' as const, value: total }],
      total,
      formattedBreakdown: `[Physical Dice: ${total} (${prompt.formula})] = ${total}`,
      isCritical: prompt.formula.includes('1d20') && total >= 20,
      isFumble: prompt.formula.includes('1d20') && total === 1,
    };

    chatStore.messages = [
      ...chatStore.messages,
      {
        id: `phys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        sender: prompt.actorName || 'Player',
        channel: 'public',
        timestamp: Date.now(),
        roll: breakdown,
        rollLabel: prompt.title,
        actionType: prompt.actionType || 'custom',
      },
    ];

    prompt.resolve(total);
  }

  rollDigitallyInstead() {
    if (!this.currentPrompt) return;
    const prompt = this.currentPrompt;
    const msg = chatStore.roll(prompt.formula, {
      label: prompt.title,
      actorName: prompt.actorName || 'Player',
      actionType: prompt.actionType || 'custom',
    });
    prompt.resolve(msg.roll ? msg.roll.total : 0);
  }

  cancelPrompt() {
    if (!this.currentPrompt) return;
    this.currentPrompt.reject(new Error('Manual roll prompt cancelled'));
  }
}

export const physicalDiceService = new PhysicalDiceService();
export const promptManualRoll = (req: ManualRollRequest) => physicalDiceService.promptManualRoll(req);
