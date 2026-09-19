import { describe, it, expect } from 'vitest';
import { isPointInPolygon } from './LightShadowRenderer';
import {
  calculatePartyEffectiveCr,
  calculateEncounterThreat,
} from '../../stores/sessionStore';

describe('Fog of War & Security Leak Audit', () => {
  it('correctly determines whether coordinates are within player vision polygon', () => {
    // Triangle vision cone: (0,0), (100, -50), (100, 50)
    const visionPolygon = [
      { x: 0, y: 0 },
      { x: 100, y: -50 },
      { x: 100, y: 50 },
    ];

    // Inside vision cone
    expect(isPointInPolygon({ x: 50, y: 0 }, visionPolygon)).toBe(true);
    expect(isPointInPolygon({ x: 80, y: 20 }, visionPolygon)).toBe(true);

    // Outside vision cone (behind player, or beyond spread)
    expect(isPointInPolygon({ x: -10, y: 0 }, visionPolygon)).toBe(false);
    expect(isPointInPolygon({ x: 50, y: 60 }, visionPolygon)).toBe(false);
    expect(isPointInPolygon({ x: 200, y: 200 }, visionPolygon)).toBe(false);
  });

  it('filters out monsters from player projector display if outside line-of-sight', () => {
    // Active player vision polygon at origin
    const playerVision = [
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 60 },
      { x: 0, y: 60 },
    ];

    const visibleMonster = { id: 'm-1', name: 'Goblin Scout', x: 0, y: 0 }; // px: (30, 30) - Inside
    const hiddenMonster = { id: 'm-2', name: 'Bugbear Ambush', x: 5, y: 5 }; // px: (330, 330) - Outside

    const gridSize = 60;
    const isM1Visible = isPointInPolygon(
      { x: (visibleMonster.x + 0.5) * gridSize, y: (visibleMonster.y + 0.5) * gridSize },
      playerVision
    );
    const isM2Visible = isPointInPolygon(
      { x: (hiddenMonster.x + 0.5) * gridSize, y: (hiddenMonster.y + 0.5) * gridSize },
      playerVision
    );

    expect(isM1Visible).toBe(true);
    expect(isM2Visible).toBe(false);
  });

  it('recalculates party CR and shifts encounter difficulty when member is stowed into Black Orb', () => {
    // 4 Level 5 characters vs a CR 5 monster (1800 XP)
    const party = [
      { id: 'c1', name: 'Valen', level: 5, isOrbSealed: false },
      { id: 'c2', name: 'Althaea', level: 5, isOrbSealed: false },
      { id: 'c3', name: 'Kaelen', level: 5, isOrbSealed: false },
      { id: 'c4', name: 'Lyra', level: 5, isOrbSealed: false },
    ];

    const encounterMonsters = [{ cr: 5, is_monster: true }];

    // 1. Initial 4-player encounter
    const initialCr = calculatePartyEffectiveCr(party);
    expect(initialCr.activeCount).toBe(4);
    expect(initialCr.effectiveCr).toBe('5.0');

    const initialThreat = calculateEncounterThreat(party, encounterMonsters);
    // 4 level 5 PCs: Easy: 1000, Med: 2000, Hard: 3000, Deadly: 4400. Monster XP: 1800 -> Easy
    expect(initialThreat.threatLevel).toBe('Easy');

    // 2. Stow 2 characters into Black Orb (Lyra and Kaelen absent)
    const stowedParty = party.map(m =>
      m.id === 'c3' || m.id === 'c4' ? { ...m, isOrbSealed: true } : m
    );

    const stowedCr = calculatePartyEffectiveCr(stowedParty);
    expect(stowedCr.activeCount).toBe(2);
    expect(stowedCr.effectiveCr).toBe('5.0');

    const stowedThreat = calculateEncounterThreat(stowedParty, encounterMonsters);
    // 2 level 5 PCs: Easy: 500, Med: 1000, Hard: 1500, Deadly: 2200. Monster XP: 1800 -> Hard!
    expect(stowedThreat.threatLevel).toBe('Hard');
  });
});
