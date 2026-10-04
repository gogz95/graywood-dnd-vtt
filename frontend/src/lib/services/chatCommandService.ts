import { evaluateLoreCheck, type LoreResolution } from '$lib/systems/loreCheckSystem';
import { audioEngine } from '$lib/services/audioEngine';
import { evaluateDice, parseDiceFormula, type DiceEvaluationResult } from '$lib/services/diceEngine';
import { parseAndEvaluateDice } from '$lib/services/diceParser';

export { evaluateDice, parseDiceFormula };

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
    audioEngine.playDiceClatter();
    const formula = trimmed.replace(/^\/(?:r|roll)\s+/i, '');
    const roll = parseDiceFormula(formula);
    const parsed = parseAndEvaluateDice(formula);
    const msg: ChatMessage = {
      id: `roll_${Date.now()}`,
      sender,
      text: roll ? `Rolled ${formula}: ${roll.total}` : (parsed ? `Rolled ${formula}: ${parsed.total}` : `Invalid dice notation: "${formula}"`),
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
