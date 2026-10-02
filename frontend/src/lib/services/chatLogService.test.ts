import { describe, it, expect } from 'vitest';
import { chatLogService, type RollableTable } from './chatLogService';
import { tableStore } from '../stores/tableStore';

describe('Table Engine & Chat Log Integration', () => {
  it('rolls table and posts formatted card to chat log', () => {
    const sampleTable: RollableTable = {
      id: 'test_table_1',
      name: 'Forest Hazards',
      formula: '1d20',
      provenance: {
        source_type: 'pdf',
        source_file_rel: 'Sourcebooks/Adventures.pdf',
        page_number: 42,
      },
      entries: [
        {
          range: [1, 10],
          text: '2d4 Goblins',
          linked_entity_id: 'srd_goblin',
        },
        {
          range: [11, 20],
          text: 'Quiet Path',
        },
      ],
    };

    tableStore.tables = [sampleTable];

    const rolled = tableStore.rollTable(sampleTable);
    expect(rolled).toBeDefined();

    // Verify chat message generated
    const lastMsg = chatLogService.messages[chatLogService.messages.length - 1];
    expect(lastMsg).toBeDefined();
    expect(lastMsg.type).toBe('table_roll');
  });

  it('spawns tokens and parses dice formulas correctly', async () => {
    const entry = {
      range: [1, 4] as [number, number],
      text: '2d4 Goblins lurking in bushes',
      linked_entity_id: 'srd_goblin',
    };

    const count = await chatLogService.spawnTokensFromEntry(entry);
    expect(count).toBeGreaterThanOrEqual(2);
    expect(count).toBeLessThanOrEqual(8);

    const systemMsg = chatLogService.messages[chatLogService.messages.length - 1];
    expect(systemMsg.type).toBe('system');
    expect(systemMsg.text).toContain('srd_goblin');
  });
});
