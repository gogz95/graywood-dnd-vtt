import { describe, it, expect } from 'vitest';
import {
  calculateHarvestDC,
  calculateDressMinutes,
  formatDressMinutes,
  calculateAppraisalPayout,
  getCalendarTotalHours,
  checkItemDecay,
  auditPartyStashDecay,
  generatePotentialYields,
} from './harvestEngine';
import type { PartyStashItem } from '../../stores/sessionStore';

describe('Aleamos Harvest & Decay Engine', () => {
  it('calculates extraction skill DCs across CR and Size matrices', () => {
    // CR 0, Medium Beast: Base 10 + 0 + 0 - 1 (Nature favored) = 9
    const dcTiny = calculateHarvestDC(2, 'Tiny', 'Nature', 'Beast');
    // CR 2 -> +1 CR mod, Tiny -> -2 mod. 10 + 1 - 2 - 1 = 8
    expect(dcTiny).toBe(8);

    // CR 10 Gargantuan Dragon:
    // Base 10 + 5 (crMod) + 4 (sizeMod) - 1 (Arcana favored) = 18
    const dcDragon = calculateHarvestDC(10, 'Gargantuan', 'Arcana', 'Dragon');
    expect(dcDragon).toBe(18);

    // Unfavored skill penalty
    const dcUnfavored = calculateHarvestDC(2, 'Medium', 'Arcana', 'Beast');
    // Base 10 + 1 + 0 + 2 = 13
    expect(dcUnfavored).toBe(13);
  });

  it('calculates dress times based on creature size and CR', () => {
    expect(calculateDressMinutes('Tiny', 1)).toBe(10);
    expect(calculateDressMinutes('Medium', 4)).toBe(45);
    expect(calculateDressMinutes('Large', 6)).toBe(120);
    expect(calculateDressMinutes('Huge', 8)).toBe(240);
    expect(calculateDressMinutes('Gargantuan', 9)).toBe(480);

    // CR 15 Gargantuan creature gets extra dissection time (+30 min base + 30 min per 5 CR above 10 = +60 min)
    const highCrDress = calculateDressMinutes('Gargantuan', 15);
    expect(highCrDress).toBe(480 + 60);
    expect(formatDressMinutes(highCrDress)).toBe('9 hrs');
    expect(formatDressMinutes(45)).toBe('45 min');
    expect(formatDressMinutes(120)).toBe('2 hrs');
  });

  it('applies 0% to 50% appraisal penalty slider to harvested payouts', () => {
    const baseValue = 100;
    // 0% penalty -> 100 gp
    expect(calculateAppraisalPayout(baseValue, 0)).toBe(100);

    // 25% penalty -> 75 gp
    expect(calculateAppraisalPayout(baseValue, 25)).toBe(75);

    // 50% max penalty -> 50 gp
    expect(calculateAppraisalPayout(baseValue, 50)).toBe(50);

    // Clamps values exceeding 50%
    expect(calculateAppraisalPayout(baseValue, 70)).toBe(50);
  });

  it('generates thematic yields and elemental essences', () => {
    const redDragonYields = generatePotentialYields('Young Red Dragon', 'Dragon (Fire)', 10, 'Large');
    expect(redDragonYields.length).toBeGreaterThanOrEqual(3);

    const fireEssence = redDragonYields.find(y => y.essence === 'FIRE');
    expect(fireEssence).toBeDefined();
    expect(fireEssence?.category).toBe('Essence');

    const organicGland = redDragonYields.find(y => y.isOrganic);
    expect(organicGland).toBeDefined();
  });

  it('accurately enforces the 24-hour decay window for unpreserved organic viscera', () => {
    const calStart = { currentYear: 1, currentMonth: 0, currentDay: 1, currentHour: 8 };
    const startHour = getCalendarTotalHours(calStart);

    const freshItem: PartyStashItem = {
      id: 'viscera-1',
      name: 'Wyvern Venom Sac',
      category: 'Organic Viscera',
      quantity: 1,
      weight: 1.0,
      description: 'Potent venom gland.',
      valueGp: 80,
      harvestedAtHour: startHour,
      isPreserved: false,
      isSpoiled: false,
    };

    // Check after 12 hours -> should still be fresh with 12 hours remaining
    const check12h = checkItemDecay(freshItem, startHour + 12);
    expect(check12h.isSpoiled).toBe(false);
    expect(check12h.hoursRemaining).toBe(12);

    // Check after exactly 24 hours -> becomes spoiled!
    const check24h = checkItemDecay(freshItem, startHour + 24);
    expect(check24h.isSpoiled).toBe(true);
    expect(check24h.hoursRemaining).toBe(0);

    // Test preserved item: should never spoil even after 100 hours
    const preservedItem: PartyStashItem = {
      ...freshItem,
      id: 'viscera-2',
      isPreserved: true,
    };
    const checkPreserved = checkItemDecay(preservedItem, startHour + 100);
    expect(checkPreserved.isSpoiled).toBe(false);

    // Test stash decay audit
    const stash = [freshItem, preservedItem];
    const auditResult = auditPartyStashDecay(stash, startHour + 30);
    expect(auditResult.newlySpoiledCount).toBe(1);

    const spoiledWyvern = auditResult.updatedItems.find(i => i.id === 'viscera-1');
    expect(spoiledWyvern?.isSpoiled).toBe(true);
    expect(spoiledWyvern?.name).toContain('Spoiled');
    expect(spoiledWyvern?.valueGp).toBe(0);

    const preservedAfterAudit = auditResult.updatedItems.find(i => i.id === 'viscera-2');
    expect(preservedAfterAudit?.isSpoiled).toBe(false);
  });
});
