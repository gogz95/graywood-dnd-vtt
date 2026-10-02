// frontend/src/lib/services/chatLogService.svelte.ts
// Chat log message dispatcher, table roll card evaluator, and token spawning integration.

import { evaluateDice, parseDiceFormula } from './diceEngine';
import { audioEngine } from './audioEngine';
import { spawnCombatantToken } from '../ipc/tauriBridge';

export interface TableEntry {
  range: [number, number];
  text: string;
  linked_entity_id?: string;
}

export interface TableProvenance {
  source_type: string;
  source_file_rel: string;
  page_number?: number;
}

export interface RollableTable {
  id: string;
  name: string;
  formula: string;
  provenance: TableProvenance;
  entries: TableEntry[];
}

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
  type: 'general' | 'roll' | 'table_roll' | 'system';
  tableRollDetails?: {
    tableId: string;
    tableName: string;
    formula: string;
    rollValue: number;
    entry: TableEntry;
    provenance?: TableProvenance;
  };
}

export class ChatLogService {
  messages = $state<ChatMessage[]>([]);

  constructor() {
    this.addSystemMessage('Chat channel initialized.');
  }

  addMessage(msg: Omit<ChatMessage, 'id' | 'timestamp'>): ChatMessage {
    const fullMsg: ChatMessage = {
      ...msg,
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
    };
    this.messages.push(fullMsg);
    return fullMsg;
  }

  addSystemMessage(text: string): ChatMessage {
    return this.addMessage({
      sender: 'SYSTEM',
      text,
      type: 'system',
    });
  }

  postTableRollCard(table: RollableTable, rollValue: number, entry: TableEntry): ChatMessage {
    if (typeof window !== 'undefined' && typeof window.Audio !== 'undefined') {
      audioEngine.playDiceClatter();
    }

    return this.addMessage({
      sender: 'TABLE EVALUATOR',
      text: `Rolled [${rollValue}] on ${table.name}: ${entry.text}`,
      type: 'table_roll',
      tableRollDetails: {
        tableId: table.id,
        tableName: table.name,
        formula: table.formula,
        rollValue,
        entry,
        provenance: table.provenance,
      },
    });
  }

  /**
   * Evaluates monster count from entry text (e.g. "2d4 Goblins" -> rolls 2d4)
   * and spawns active tokens onto the battlemat canvas coordinates.
   */
  async spawnTokensFromEntry(
    entry: TableEntry,
    encounterId = 'default_encounter',
    originX = 400,
    originY = 300
  ): Promise<number> {
    if (!entry.linked_entity_id) {
      return 0;
    }

    let count = 1;
    const formulaMatch = entry.text.match(/(\d+d\d+)/i);
    if (formulaMatch) {
      const dice = parseDiceFormula(formulaMatch[1]);
      count = Math.max(1, dice.total);
    } else {
      const numMatch = entry.text.match(/^(\d+)\s+/);
      if (numMatch) {
        count = Math.max(1, parseInt(numMatch[1], 10));
      }
    }

    if (typeof window !== 'undefined' && typeof window.Audio !== 'undefined') {
      audioEngine.playSfx('/audio/spell.wav');
    }

    for (let idx = 0; idx < count; idx++) {
      const offsetX = originX + (idx % 3) * 60;
      const offsetY = originY + Math.floor(idx / 3) * 60;

      try {
        await spawnCombatantToken({
          encounter_id: encounterId,
          monster_compendium_id: entry.linked_entity_id,
          custom_name: `${entry.text.split(' ')[1] || 'Creature'} #${idx + 1}`,
          canvas_x: offsetX,
          canvas_y: offsetY,
        });
      } catch (err) {
        console.warn('Spawn token failed:', err);
      }
    }

    this.addSystemMessage(
      `Spawned ${count} token(s) [${entry.linked_entity_id}] onto tactical scene grid.`
    );

    return count;
  }
}

export const chatLogService = new ChatLogService();
