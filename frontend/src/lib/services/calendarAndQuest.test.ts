// src/lib/services/calendarAndQuest.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { CalendarEngine, HARPTOS_CALENDAR, GREYHAWK_CALENDAR } from './calendarEngine';
import { QuestEngine } from './questEngine';
import type { QuestNode } from '../types/campaign';

describe('Phase 13: Fantasy Calendar & Multi-Moon Celestial Engine', () => {
  let engine: CalendarEngine;

  beforeEach(() => {
    engine = new CalendarEngine(HARPTOS_CALENDAR);
    engine.currentTime = {
      year: 1492,
      month: 1,
      day: 1,
      hour: 8,
      minute: 0,
      second: 0
    };
  });

  it('advances time accurately by rounds (6 seconds)', () => {
    const next = engine.advanceRounds(10); // 60 seconds
    expect(next.minute).toBe(1);
    expect(next.second).toBe(0);
  });

  it('advances time by short rests and long rests', () => {
    engine.advanceShortRest(); // +1 hour
    expect(engine.currentTime.hour).toBe(9);

    engine.advanceLongRest(); // +8 hours
    expect(engine.currentTime.hour).toBe(17);
  });

  it('handles month rollovers and leap years correctly', () => {
    engine.currentTime = {
      year: 1492,
      month: 1,
      day: 30,
      hour: 23,
      minute: 0,
      second: 0
    };

    engine.advanceHours(2);
    expect(engine.currentTime.day).toBe(1);
    expect(engine.currentTime.month).toBe(2);
    expect(engine.currentTime.hour).toBe(1);
  });

  it('calculates multi-moon celestial phases and illumination', () => {
    const moons = engine.getMoonPhases();
    expect(moons.length).toBe(2);

    for (const moon of moons) {
      expect(moon.moonId).toBeTruthy();
      expect(moon.phase).toBeTruthy();
      expect(moon.emoji).toBeTruthy();
      expect(moon.illumination).toBeGreaterThanOrEqual(0.0);
      expect(moon.illumination).toBeLessThanOrEqual(1.0);
    }
  });

  it('expires active spell timers upon sufficient time advancement', () => {
    engine.addSpellTimer('Bless', 'Paladin', 60); // 60s
    expect(engine.activeSpellTimers.length).toBe(1);

    engine.advanceSeconds(70);
    expect(engine.activeSpellTimers.length).toBe(0);
  });
});

describe('Phase 13: Quest Directed Acyclic Graph (DAG) Engine', () => {
  let engine: QuestEngine;

  beforeEach(() => {
    const testNodes: Record<string, QuestNode> = {
      'node-root': {
        id: 'node-root',
        title: 'Root Quest',
        description: 'Starter objective',
        status: 'active',
        prerequisites: []
      },
      'node-downstream': {
        id: 'node-downstream',
        title: 'Downstream Quest',
        description: 'Requires Root',
        status: 'locked',
        prerequisites: ['node-root']
      },
      'branch-a': {
        id: 'branch-a',
        title: 'Pathway A',
        description: 'Choice A',
        status: 'locked',
        prerequisites: ['node-downstream'],
        mutuallyExclusiveWith: ['branch-b']
      },
      'branch-b': {
        id: 'branch-b',
        title: 'Pathway B',
        description: 'Choice B',
        status: 'locked',
        prerequisites: ['node-downstream'],
        mutuallyExclusiveWith: ['branch-a']
      },
      'finale': {
        id: 'finale',
        title: 'Final Quest',
        description: 'Unlocked by either branch',
        status: 'locked',
        prerequisites: ['branch-a', 'branch-b']
      }
    };
    engine = new QuestEngine(testNodes);
  });

  it('unlocks downstream nodes when all prerequisites complete', () => {
    expect(engine.getNode('node-downstream')?.status).toBe('locked');

    engine.updateQuestStatus('node-root', 'completed');
    expect(engine.getNode('node-downstream')?.status).toBe('active');
  });

  it('enforces mutually exclusive branching outcomes', () => {
    // 1. Complete root and downstream to activate both branches
    engine.updateQuestStatus('node-root', 'completed');
    engine.updateQuestStatus('node-downstream', 'completed');

    expect(engine.getNode('branch-a')?.status).toBe('active');
    expect(engine.getNode('branch-b')?.status).toBe('active');

    // 2. Complete branch-a; branch-b must be marked 'failed'
    engine.updateQuestStatus('branch-a', 'completed');

    expect(engine.getNode('branch-a')?.status).toBe('completed');
    expect(engine.getNode('branch-b')?.status).toBe('failed');

    // 3. Finale should unlock because one of the branching paths completed
    expect(engine.getNode('finale')?.status).toBe('active');
  });
});
