// src/lib/stores/chatStore.svelte.ts
// Universal Dice Roller & Interactive Session Chat Log Store
// Svelte 5 runes implementation managing dice rolls, arithmetic breakdowns, and public/secret whisper channels.

import { audioEngine } from '../audio/AudioEngine';
import { sendWsEvent, latestDiceRollStore } from '../../stores/websocketStore';

export interface RollTerm {
  label: string;
  type: 'die' | 'modifier';
  dieSides?: number;
  rolls?: number[];
  value: number;
}

export interface RollBreakdown {
  rawFormula: string;
  terms: RollTerm[];
  total: number;
  formattedBreakdown: string; // e.g. "[1d20 (14) + 3 (DEX) + 2 (Prof)] = 19"
  isCritical: boolean; // Natural 20 on first d20
  isFumble: boolean;   // Natural 1 on first d20
}

export type MessageChannel = 'public' | 'whisper' | 'system';

export interface AttackResolutionData {
  isTargeted: boolean;
  targetId?: string;
  targetName?: string;
  targetAc?: number;
  isHit?: boolean;
  isCrit?: boolean;
  summaryText: string;
  badgeClass: string;
}

export interface ChatMessage {
  id: string;
  sender: string;
  channel: MessageChannel;
  text?: string;
  timestamp: number;
  roll?: RollBreakdown;
  rollLabel?: string;
  actionType?: 'attack' | 'damage' | 'check' | 'save' | 'custom';
  attackResolution?: AttackResolutionData;
  damageAmount?: number;
  targetId?: string;
}

export interface RollOptions {
  label?: string;
  actorName?: string;
  isSecret?: boolean;
  actionType?: 'attack' | 'damage' | 'check' | 'save' | 'custom';
  explicitTerms?: Array<{ label: string; value: number }>;
  attackResolution?: AttackResolutionData;
  damageAmount?: number;
  targetId?: string;
}

const STORAGE_KEY = 'vtt_session_chat_log';
const BROADCAST_CHANNEL_NAME = 'vtt_chat_sync';

class ChatStore {
  messages = $state<ChatMessage[]>([]);
  isOpen = $state<boolean>(false);
  private broadcastChannel: BroadcastChannel | null = null;

  constructor() {
    this.loadFromStorage();
    this.initSync();
  }

  private loadFromStorage() {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.messages = JSON.parse(raw);
      }
    } catch {
      this.messages = [];
    }
  }

  private saveToStorage() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.messages.slice(-80)));
    } catch {
      // ignore storage quota issues
    }
  }

  private initSync() {
    if (typeof window === 'undefined') return;

    // Cross-tab broadcast channel
    try {
      this.broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      this.broadcastChannel.onmessage = (event: MessageEvent<ChatMessage>) => {
        if (event.data && event.data.id) {
          if (!this.messages.some(m => m.id === event.data.id)) {
            this.messages = [...this.messages, event.data];
            this.saveToStorage();
          }
        }
      };
    } catch {
      // BroadcastChannel not available in all headless test environments
    }

    // Subscribe to external WebSocket dice rolls from player mobile devices
    latestDiceRollStore.subscribe((wsRoll) => {
      if (!wsRoll) return;
      // If message not already in feed, add it
      const alreadyLogged = this.messages.some(
        m => m.roll && m.roll.rawFormula === wsRoll.formula && m.roll.total === wsRoll.result && Date.now() - m.timestamp < 2000
      );
      if (!alreadyLogged) {
        const msg: ChatMessage = {
          id: `ws-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          sender: wsRoll.characterName || 'Player',
          channel: 'public',
          timestamp: Date.now(),
          rollLabel: wsRoll.formula,
          roll: {
            rawFormula: wsRoll.formula,
            terms: [{ label: wsRoll.formula, type: 'die', value: wsRoll.result }],
            total: wsRoll.result,
            formattedBreakdown: wsRoll.breakdown || `[${wsRoll.result}] = ${wsRoll.result}`,
            isCritical: Boolean(wsRoll.isCritical),
            isFumble: wsRoll.result === 1,
          },
          actionType: 'custom',
        };
        this.messages = [...this.messages, msg];
        this.saveToStorage();
      }
    });
  }

  open() {
    this.isOpen = true;
  }

  close() {
    this.isOpen = false;
  }

  toggle() {
    this.isOpen = !this.isOpen;
  }

  clear() {
    this.messages = [];
    this.saveToStorage();
  }

  /**
   * Universal Dice Expression Evaluator & Arithmetic Breakdown Engine
   * Parses standard 5e dice formulas e.g. "1d20 + 3 + 2" or "2d6 + 4"
   */
  evaluateFormula(
    formula: string,
    explicitTerms?: Array<{ label: string; value: number }>
  ): RollBreakdown {
    const cleanFormula = formula.trim();
    const terms: RollTerm[] = [];
    let isCritical = false;
    let isFumble = false;

    // Pattern to match standard dice terms: (sign)? (X)d(Y) or (sign)? (X)
    const tokenRegex = /([+-]?)\s*(?:(\d*)d(\d+)|(\d+))/gi;
    let match: RegExpExecArray | null;
    let termIndex = 0;

    while ((match = tokenRegex.exec(cleanFormula)) !== null) {
      const sign = match[1] === '-' ? -1 : 1;
      if (match[3] !== undefined) {
        // Dice term: e.g. 1d20, 2d6, d8
        const count = match[2] ? parseInt(match[2], 10) : 1;
        const sides = parseInt(match[3], 10);
        const rolls: number[] = [];
        let subtotal = 0;

        for (let i = 0; i < count; i++) {
          const r = Math.floor(Math.random() * sides) + 1;
          rolls.push(r);
          subtotal += r;
        }

        if (sides === 20 && rolls.length > 0) {
          if (rolls[0] === 20) isCritical = true;
          if (rolls[0] === 1) isFumble = true;
        }

        terms.push({
          label: `${count}d${sides}`,
          type: 'die',
          dieSides: sides,
          rolls,
          value: sign * subtotal,
        });
      } else if (match[4] !== undefined) {
        // Modifier term: e.g. +3, -2
        const rawVal = parseInt(match[4], 10);
        const modVal = sign * rawVal;

        // Associate with explicit label if provided (e.g. DEX, Prof)
        let label = explicitTerms && explicitTerms[termIndex] ? explicitTerms[termIndex].label : '';
        if (!label) {
          label = modVal >= 0 ? `+${modVal}` : `${modVal}`;
        }

        terms.push({
          label,
          type: 'modifier',
          value: modVal,
        });
        termIndex++;
      }
    }

    // Fallback if formula was empty or malformed
    if (terms.length === 0) {
      const r = Math.floor(Math.random() * 20) + 1;
      terms.push({
        label: '1d20',
        type: 'die',
        dieSides: 20,
        rolls: [r],
        value: r,
      });
      if (r === 20) isCritical = true;
      if (r === 1) isFumble = true;
    }

    const total = terms.reduce((acc, t) => acc + t.value, 0);

    // Format breakdown string: "[1d20 (14) + 3 (DEX) + 2 (Prof)] = 19"
    const breakdownParts = terms.map((t, idx) => {
      if (t.type === 'die') {
        const rollsStr = t.rolls && t.rolls.length > 0 ? ` (${t.rolls.join(', ')})` : '';
        const prefix = idx > 0 && t.value >= 0 ? '+ ' : idx > 0 && t.value < 0 ? '- ' : '';
        return `${prefix}${t.label}${rollsStr}`;
      } else {
        const valAbs = Math.abs(t.value);
        const sign = t.value >= 0 ? '+ ' : '- ';
        const labelStr = t.label && !t.label.includes(valAbs.toString()) ? ` (${t.label})` : '';
        return `${idx > 0 ? sign : t.value < 0 ? '-' : ''}${valAbs}${labelStr}`;
      }
    });

    const formattedBreakdown = `[${breakdownParts.join(' ')}] = ${total}`;

    return {
      rawFormula: cleanFormula,
      terms,
      total,
      formattedBreakdown,
      isCritical,
      isFumble,
    };
  }

  /**
   * Universal Roll Dispatcher
   * Called by Statblocks, Character Sheets, Quick Roll Tray, and Chat Input
   */
  roll(formula: string, options?: RollOptions): ChatMessage {
    const opts = options || {};
    const label = opts.label || 'Dice Roll';
    const actorName = opts.actorName || 'DM';
    const isSecret = Boolean(opts.isSecret);
    const actionType = opts.actionType || 'custom';

    const breakdown = this.evaluateFormula(formula, opts.explicitTerms);

    const message: ChatMessage = {
      id: `roll-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sender: actorName,
      channel: isSecret ? 'whisper' : 'public',
      timestamp: Date.now(),
      roll: breakdown,
      rollLabel: label,
      actionType,
      attackResolution: opts.attackResolution,
      damageAmount: opts.damageAmount !== undefined ? opts.damageAmount : (actionType === 'damage' ? breakdown.total : undefined),
      targetId: opts.targetId,
    };

    // Play appropriate sound effect
    if (breakdown.isCritical) {
      audioEngine.triggerSfx('sfx-critical');
    } else if (actionType === 'attack') {
      audioEngine.triggerSfx('sfx-sword');
    } else {
      audioEngine.triggerSfx('sfx-dice');
    }

    // Append to local store
    this.messages = [...this.messages, message];
    this.saveToStorage();

    // Broadcast across windows/tabs
    try {
      this.broadcastChannel?.postMessage(message);
    } catch {
      // ignore
    }

    // Broadcast WebSocket event if not secret
    if (!isSecret) {
      sendWsEvent({
        type: 'DICE_ROLL',
        character_id: actorName.toLowerCase().replace(/\s+/g, '-'),
        character_name: actorName,
        formula: `${label} (${breakdown.rawFormula})`,
        result: breakdown.total,
        is_critical: breakdown.isCritical,
        breakdown: breakdown.formattedBreakdown,
      });
    }

    return message;
  }

  /**
   * Post a plain text chat message or process slash commands:
   * /r <formula> [label]     -> Public Roll
   * /gmroll <formula> [label]-> Secret DM Whisper Roll
   * /w <target> <message>    -> Secret DM Whisper
   */
  sendMessage(rawText: string, sender: string = 'DM', isDm: boolean = true) {
    const text = rawText.trim();
    if (!text) return;

    // Check for /r or /roll command
    const rollMatch = text.match(/^\/(?:r|roll)\s+([^#]+)(?:#\s*(.*))?$/i);
    if (rollMatch) {
      const formula = rollMatch[1].trim();
      const label = rollMatch[2]?.trim() || 'Roll';
      this.roll(formula, { label, actorName: sender, isSecret: false });
      return;
    }

    // Check for /gmroll or /gr command
    const gmRollMatch = text.match(/^\/(?:gmroll|gr)\s+([^#]+)(?:#\s*(.*))?$/i);
    if (gmRollMatch) {
      const formula = gmRollMatch[1].trim();
      const label = gmRollMatch[2]?.trim() || 'Secret DM Roll';
      this.roll(formula, { label, actorName: sender, isSecret: true });
      return;
    }

    // Check for /w or /whisper command
    const whisperMatch = text.match(/^\/(?:w|whisper)\s+(\S+)\s+(.*)$/i);
    if (whisperMatch) {
      const target = whisperMatch[1];
      const whisperContent = whisperMatch[2];
      const msg: ChatMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        sender,
        channel: 'whisper',
        text: `(To ${target}) ${whisperContent}`,
        timestamp: Date.now(),
      };
      this.messages = [...this.messages, msg];
      this.saveToStorage();
      this.broadcastChannel?.postMessage(msg);
      audioEngine.triggerSfx('sfx-secret');
      return;
    }

    // Standard public chat message
    const msg: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sender,
      channel: 'public',
      text,
      timestamp: Date.now(),
    };

    this.messages = [...this.messages, msg];
    this.saveToStorage();
    this.broadcastChannel?.postMessage(msg);
  }
}

export const chatStore = new ChatStore();
