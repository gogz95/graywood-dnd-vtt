// src/lib/services/chatCommandService.ts
// Chat Command & Dice Parsing Service

import { evaluateLoreCheck, type LoreResolution } from '$lib/systems/loreCheckSystem';

// Safe Tauri invoke helper for browser and Tauri environments
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

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
  type: 'general' | 'roll' | 'lore';
  rollDetails?: {
    formula: string;
    rolls: number[];
    modifier: number;
    total: number;
  };
  loreDetails?: LoreResolution;
}

export function parseDiceFormula(formula: string): { rolls: number[]; modifier: number; total: number } | null {
  const match = formula.trim().match(/^(\d+)d(\d+)(?:([+-])(\d+))?$/i);
  if (!match) return null;

  const count = parseInt(match[1], 10);
  const sides = parseInt(match[2], 10);
  const sign = match[3] === '-' ? -1 : 1;
  const modifier = match[4] ? sign * parseInt(match[4], 10) : 0;

  const rolls: number[] = [];
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const r = Math.floor(Math.random() * sides) + 1;
    rolls.push(r);
    sum += r;
  }

  return { rolls, modifier, total: sum + modifier };
}

export async function processChatInput(input: string, sender = 'DM'): Promise<ChatMessage> {
  const trimmed = input.trim();

  if (trimmed.startsWith('/lore ')) {
    const topic = trimmed.replace('/lore ', '').trim();
    const resolution = await evaluateLoreCheck(topic, 0, 10);
    const msg: ChatMessage = {
      id: `lore_${Date.now()}`,
      sender,
      text: resolution ? `Lore Check: ${resolution.topic}` : `No records found for "${topic}".`,
      timestamp: Date.now(),
      type: 'lore',
      loreDetails: resolution ?? undefined
    };

    try {
      await invoke('broadcast_vtt_event', { event: 'chat:message', payload: msg });
    } catch (err) {
      console.warn('LAN broadcast unavailable:', err);
    }
    return msg;
  }

  if (trimmed.startsWith('/r ') || trimmed.startsWith('/roll ')) {
    const formula = trimmed.replace(/^\/(?:r|roll)\s+/i, '');
    const roll = parseDiceFormula(formula);
    const msg: ChatMessage = {
      id: `roll_${Date.now()}`,
      sender,
      text: roll ? `Rolled ${formula}: ${roll.total}` : `Invalid dice notation: "${formula}"`,
      timestamp: Date.now(),
      type: 'roll',
      rollDetails: roll ? { formula, ...roll } : undefined
    };

    try {
      await invoke('broadcast_vtt_event', { event: 'chat:message', payload: msg });
    } catch (err) {
      console.warn('LAN broadcast unavailable:', err);
    }
    return msg;
  }

  const msg: ChatMessage = {
    id: `msg_${Date.now()}`,
    sender,
    text: trimmed,
    timestamp: Date.now(),
    type: 'general'
  };

  try {
    await invoke('broadcast_vtt_event', { event: 'chat:message', payload: msg });
  } catch (err) {
    console.warn('LAN broadcast unavailable:', err);
  }
  return msg;
}
