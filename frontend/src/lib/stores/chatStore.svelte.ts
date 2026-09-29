// src/lib/stores/chatStore.svelte.ts
// Universal Dice Roller & Interactive Session Chat Log Store
// Svelte 5 runes implementation managing dice rolls, arithmetic breakdowns, and public/secret whisper channels.

import { audioEngine } from '../audio/AudioEngine';
import { soundboardEngine } from '../audio/soundboardEngine';
import { sendWsEvent, latestDiceRollStore } from '../../stores/websocketStore';
import { evaluateDice, type DiceEvaluationResult, type DiceRollTerm, type ExplicitTerm } from '../services/diceEngine';

export interface RollTerm {
  label: string;
  type: 'die' | 'modifier' | 'dice' | 'flat';
  dieSides?: number;
  rolls?: number[];
  diceResults?: number[];
  kept?: number[];
  dropped?: number[];
  modifier?: number;
  value: number;
}

export interface RollBreakdown {
  rawFormula: string;
  formula?: string;
  terms: RollTerm[];
  total: number;
  formattedBreakdown: string; // e.g. "[1d20 (14) + 3 (DEX) + 2 (Prof)] = 19"
  isCritical: boolean; // Natural 20 on d20
  isFumble: boolean;   // Natural 1 on d20
  isCrit?: boolean;
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
  sender_id?: string;
  sender_name?: string;
  channel: MessageChannel;
  text?: string;
  content?: string;
  recipient_id?: string | null;
  recipient_name?: string | null;
  is_system?: boolean;
  is_ooc?: boolean;
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

    // Subscribe to external WebSocket chat messages (e.g. from companion mobile devices or desktop relay)
    window.addEventListener('vtt:chat-message', (event: Event) => {
      const customEvent = event as CustomEvent<{
        id: string;
        sender_id: string;
        sender_name: string;
        content: string;
        recipient_id?: string | null;
        is_system: boolean;
        timestamp: number;
      }>;
      const data = customEvent.detail;
      if (!data || !data.id) return;

      if (!this.messages.some(m => m.id === data.id)) {
        const isWhisper = Boolean(data.recipient_id);
        const isOoc = data.content.startsWith('(( ') && data.content.endsWith(' ))');
        const textContent = isOoc ? data.content.slice(3, -3) : data.content;

        const chatMsg: ChatMessage = {
          id: data.id,
          sender: data.sender_name || 'Anonymous',
          sender_id: data.sender_id,
          sender_name: data.sender_name,
          channel: isWhisper ? 'whisper' : 'public',
          content: data.content,
          text: textContent,
          recipient_id: data.recipient_id,
          is_system: data.is_system,
          is_ooc: isOoc,
          timestamp: data.timestamp || Date.now(),
        };

        this.messages = [...this.messages, chatMsg];
        this.saveToStorage();
        if (isWhisper) {
          audioEngine.triggerSfx('sfx-secret');
        } else {
          audioEngine.triggerSfx('sfx-dice');
        }
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
   * Evaluates standard 5e dice algebra, keep/drop (kh/kl), exploding dice (!),
   * and arithmetic operations with exact structured breakdowns.
   */
  evaluateFormula(
    formula: string,
    explicitTerms?: Array<{ label: string; value: number }>
  ): RollBreakdown {
    const result = evaluateDice(formula, explicitTerms);
    return {
      rawFormula: result.rawFormula,
      formula: result.formula,
      terms: result.terms as RollTerm[],
      total: result.total,
      formattedBreakdown: result.formattedBreakdown,
      isCritical: result.isCrit,
      isFumble: result.isFumble,
      isCrit: result.isCrit,
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
    soundboardEngine.onDiceRoll(breakdown.isCritical, breakdown.isFumble);
    if (breakdown.isCritical) {
      audioEngine.triggerSfx('sfx-critical');
    } else if (breakdown.isFumble) {
      audioEngine.triggerSfx('sfx-fumble');
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

    // Trigger local 3D Physics WebGL Dice Overlay simulation
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('vtt:dice-roll', {
          detail: {
            formula: breakdown.rawFormula,
            result: breakdown.total,
            character_name: actorName,
            is_critical: breakdown.isCritical,
          },
        })
      );
    }

    return message;
  }

  /**
   * Post a plain text chat message or process slash commands:
   * /r <formula> [label]        -> Public Roll
   * /roll <formula> [label]     -> Public Roll
   * /gmroll <formula> [label]   -> Secret DM Whisper Roll
   * /w <target> <message>       -> Private Whisper
   * /whisper <target> <message> -> Private Whisper
   * /gm <message>               -> Direct Whisper to DM
   * /ooc <message>              -> Out-Of-Character bracketed bubble
   */
   sendMessage(rawText: string, sender: string = 'DM', isDm: boolean = true) {
    const text = rawText.trim();
    if (!text) return;

    // 1. /r or /roll <formula> [#label]
    const rollMatch = text.match(/^\/(?:r|roll)\s+([^#]+)(?:#\s*(.*))?$/i);
    if (rollMatch) {
      const formula = rollMatch[1].trim();
      const label = rollMatch[2]?.trim() || 'Roll';
      this.roll(formula, { label, actorName: sender, isSecret: false });
      return;
    }

    // 2. /gmroll or /gr <formula> [#label]
    const gmRollMatch = text.match(/^\/(?:gmroll|gr)\s+([^#]+)(?:#\s*(.*))?$/i);
    if (gmRollMatch) {
      const formula = gmRollMatch[1].trim();
      const label = gmRollMatch[2]?.trim() || 'Secret DM Roll';
      this.roll(formula, { label, actorName: sender, isSecret: true });
      return;
    }

    // 3. /gm <message> -> Direct shortcut to whisper DM
    const gmMatch = text.match(/^\/gm\s+(.+)$/i);
    if (gmMatch) {
      const whisperContent = gmMatch[1].trim();
      const msgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const timestamp = Date.now();
      const senderId = sender.toLowerCase().replace(/\s+/g, '-');

      const msg: ChatMessage = {
        id: msgId,
        sender,
        sender_id: senderId,
        sender_name: sender,
        channel: 'whisper',
        text: whisperContent,
        content: whisperContent,
        recipient_id: 'dm',
        recipient_name: 'Dungeon Master',
        is_system: false,
        timestamp,
      };

      this.messages = [...this.messages, msg];
      this.saveToStorage();
      this.broadcastChannel?.postMessage(msg);
      audioEngine.triggerSfx('sfx-secret');

      // Forward to WebSocket relay
      sendWsEvent({
        type: 'CHAT_MESSAGE',
        message: {
          id: msgId,
          sender_id: senderId,
          sender_name: sender,
          content: whisperContent,
          recipient_id: 'dm',
          is_system: false,
          timestamp,
        },
      });
      return;
    }

    // 4. /w or /whisper <target> <message>
    const whisperMatch = text.match(/^\/(?:w|whisper)\s+(\S+)\s+(.+)$/i);
    if (whisperMatch) {
      const target = whisperMatch[1].trim();
      const whisperContent = whisperMatch[2].trim();
      const msgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const timestamp = Date.now();
      const senderId = sender.toLowerCase().replace(/\s+/g, '-');

      const msg: ChatMessage = {
        id: msgId,
        sender,
        sender_id: senderId,
        sender_name: sender,
        channel: 'whisper',
        text: `(To ${target}) ${whisperContent}`,
        content: whisperContent,
        recipient_id: target,
        recipient_name: target,
        is_system: false,
        timestamp,
      };

      this.messages = [...this.messages, msg];
      this.saveToStorage();
      this.broadcastChannel?.postMessage(msg);
      audioEngine.triggerSfx('sfx-secret');

      // Forward to WebSocket relay
      sendWsEvent({
        type: 'CHAT_MESSAGE',
        message: {
          id: msgId,
          sender_id: senderId,
          sender_name: sender,
          content: whisperContent,
          recipient_id: target,
          is_system: false,
          timestamp,
        },
      });
      return;
    }

    // 5. /ooc <message> -> Out-Of-Character bracketed bubble
    const oocMatch = text.match(/^\/ooc\s+(.+)$/i);
    if (oocMatch) {
      const oocContent = oocMatch[1].trim();
      const msgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const timestamp = Date.now();
      const senderId = sender.toLowerCase().replace(/\s+/g, '-');

      const msg: ChatMessage = {
        id: msgId,
        sender,
        sender_id: senderId,
        sender_name: sender,
        channel: 'public',
        text: oocContent,
        content: `(( ${oocContent} ))`,
        is_ooc: true,
        is_system: false,
        timestamp,
      };

      this.messages = [...this.messages, msg];
      this.saveToStorage();
      this.broadcastChannel?.postMessage(msg);

      // Forward to WebSocket relay
      sendWsEvent({
        type: 'CHAT_MESSAGE',
        message: {
          id: msgId,
          sender_id: senderId,
          sender_name: sender,
          content: `(( ${oocContent} ))`,
          recipient_id: null,
          is_system: false,
          timestamp,
        },
      });
      return;
    }

    // 6. Standard public chat message
    const msgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const timestamp = Date.now();
    const senderId = sender.toLowerCase().replace(/\s+/g, '-');

    const msg: ChatMessage = {
      id: msgId,
      sender,
      sender_id: senderId,
      sender_name: sender,
      channel: 'public',
      text,
      content: text,
      is_system: false,
      timestamp,
    };

    this.messages = [...this.messages, msg];
    this.saveToStorage();
    this.broadcastChannel?.postMessage(msg);

    // Forward to WebSocket relay
    sendWsEvent({
      type: 'CHAT_MESSAGE',
      message: {
        id: msgId,
        sender_id: senderId,
        sender_name: sender,
        content: text,
        recipient_id: null,
        is_system: false,
        timestamp,
      },
    });
  }
}

export const chatStore = new ChatStore();
