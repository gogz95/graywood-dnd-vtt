import { describe, it, expect } from 'vitest';

interface TestPartyMember {
  id: string;
  name: string;
  level: number;
  isOrbSealed?: boolean;
  isNpc?: boolean;
}

interface TestCombatant {
  id: string;
  name: string;
  initiative: number;
}

interface TestInventoryItem {
  id: string;
  name: string;
  weight_lbs: number;
  rarity?: string;
  is_preserved?: boolean;
}

/**
 * Calculates effective party encounter Challenge Rating (CR)
 * Formula: sum of active party member levels / (active members * 4) rounded to 1 decimal place.
 */
function calculatePartyCr(roster: TestPartyMember[]): number {
  const active = roster.filter(m => !m.isOrbSealed && !m.isNpc);
  if (active.length === 0) return 0;
  const sumLevels = active.reduce((sum, m) => sum + m.level, 0);
  return Math.round((sumLevels / (active.length * 4)) * 10) / 10;
}

/**
 * Executes the Black Orb Extraction Protocol
 */
function stowIntoBlackOrb(
  memberId: string,
  roster: TestPartyMember[],
  combatants: TestCombatant[],
  inventory: TestInventoryItem[]
) {
  const member = roster.find(m => m.id === memberId);
  if (!member) throw new Error('Member not found');

  // 1. Mark roster member sealed
  const nextRoster = roster.map(m => m.id === memberId ? { ...m, isOrbSealed: true } : m);

  // 2. Sever/pull from active combat initiative
  const nextCombatants = combatants.filter(c => c.id !== memberId && c.name !== member.name);

  // 3. Deposit 1-lb indestructible wondrous item into party inventory
  const orbItemId = `item-black-orb-${memberId}`;
  const nextInventory = [
    ...inventory,
    {
      id: orbItemId,
      name: `Black Orb of ${member.name}`,
      weight_lbs: 1.0,
      rarity: 'Wondrous (Indestructible)',
      is_preserved: true,
    },
  ];

  const nextCr = calculatePartyCr(nextRoster);

  return {
    roster: nextRoster,
    combatants: nextCombatants,
    inventory: nextInventory,
    partyCr: nextCr,
  };
}

/**
 * Executes Black Orb Re-Entry Protocol
 */
function releaseFromBlackOrb(
  memberId: string,
  roster: TestPartyMember[],
  inventory: TestInventoryItem[]
) {
  const member = roster.find(m => m.id === memberId);
  if (!member) throw new Error('Member not found');

  // 1. Restore roster member
  const nextRoster = roster.map(m => m.id === memberId ? { ...m, isOrbSealed: false } : m);

  // 2. Remove orb item from inventory
  const orbItemId = `item-black-orb-${memberId}`;
  const nextInventory = inventory.filter(item => item.id !== orbItemId);

  const nextCr = calculatePartyCr(nextRoster);

  return {
    roster: nextRoster,
    inventory: nextInventory,
    partyCr: nextCr,
  };
}

describe('Aleamos Black Orb Extraction Protocol', () => {
  it('stows character, pulls from initiative, creates 1-lb wondrous item, and recalculates CR', () => {
    const roster: TestPartyMember[] = [
      { id: 'char-1', name: 'Valen', level: 8, isOrbSealed: false },
      { id: 'char-2', name: 'Althaea', level: 4, isOrbSealed: false },
      { id: 'char-3', name: 'Kaelen', level: 4, isOrbSealed: false },
    ];
    // Baseline CR: (8 + 4 + 4) / (3 * 4) = 16 / 12 = 1.33 ≈ 1.3
    const initialCr = calculatePartyCr(roster);
    expect(initialCr).toBe(1.3);

    const combatants: TestCombatant[] = [
      { id: 'char-1', name: 'Valen', initiative: 18 },
      { id: 'char-2', name: 'Althaea', initiative: 15 },
      { id: 'char-3', name: 'Kaelen', initiative: 10 },
      { id: 'mon-1', name: 'Bugbear Chief', initiative: 12 },
    ];

    const inventory: TestInventoryItem[] = [
      { id: 'item-1', name: 'Rope (50ft)', weight_lbs: 10 },
    ];

    // Stow Valen (Level 8 high-level carry) into Black Orb
    const stowed = stowIntoBlackOrb('char-1', roster, combatants, inventory);

    // 1. Verify roster seal status
    expect(stowed.roster.find(m => m.id === 'char-1')?.isOrbSealed).toBe(true);

    // 2. Verify initiative extraction (Valen pulled out of combat list)
    expect(stowed.combatants.length).toBe(3);
    expect(stowed.combatants.some(c => c.id === 'char-1')).toBe(false);

    // 3. Verify party inventory item created
    const orbItem = stowed.inventory.find(i => i.id === 'item-black-orb-char-1');
    expect(orbItem).toBeDefined();
    expect(orbItem?.weight_lbs).toBe(1.0);
    expect(orbItem?.name).toBe('Black Orb of Valen');
    expect(orbItem?.rarity).toBe('Wondrous (Indestructible)');

    // 4. Verify CR recalculation without Valen: (4 + 4) / (2 * 4) = 8 / 8 = 1.0
    expect(stowed.partyCr).toBe(1.0);
  });

  it('releases character from Black Orb, restores standing, removes wondrous item, and recalculates CR', () => {
    const stowedRoster: TestPartyMember[] = [
      { id: 'char-1', name: 'Valen', level: 8, isOrbSealed: true },
      { id: 'char-2', name: 'Althaea', level: 4, isOrbSealed: false },
    ];

    const inventory: TestInventoryItem[] = [
      { id: 'item-1', name: 'Rope (50ft)', weight_lbs: 10 },
      { id: 'item-black-orb-char-1', name: 'Black Orb of Valen', weight_lbs: 1.0 },
    ];

    const released = releaseFromBlackOrb('char-1', stowedRoster, inventory);

    // 1. Verify unsealed
    expect(released.roster.find(m => m.id === 'char-1')?.isOrbSealed).toBe(false);

    // 2. Verify inventory item removed
    expect(released.inventory.some(i => i.id === 'item-black-orb-char-1')).toBe(false);
    expect(released.inventory.length).toBe(1);

    // 3. Verify CR restored: (8 + 4) / (2 * 4) = 12 / 8 = 1.5
    expect(released.partyCr).toBe(1.5);
  });
});
