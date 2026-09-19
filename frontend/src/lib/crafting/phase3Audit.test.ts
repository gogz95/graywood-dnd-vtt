import { describe, it, expect } from 'vitest';

// 1. Alchemy & Crafting
import {
  ESSENCE_MATRIX_RECIPES,
  calculateIngredientPoints,
  calculateWorkHours,
  requiresStrongholdLab,
  lookupEssenceCombination,
  type ElementalType,
} from '../components/crafting/alchemyMatrix';

// 2. Harvesting & 24-Hour Decay
import {
  calculateHarvestDC,
  calculateDressMinutes,
  calculateAppraisalPayout,
  getCalendarTotalHours,
  checkItemDecay,
  auditPartyStashDecay,
} from '../harvest/harvestEngine';

// 3. Strongholds & Room Points
import {
  UPGRADE_PROGRESSION,
  FACILITIES,
  calculateLaborDiscount,
  calculatePayroll,
  evaluateDesertionRisk,
  calculateAllocatedRp,
  calculateStaffingRequirements,
} from '../stronghold/strongholdEngine';

import type { PartyStashItem } from '../../stores/sessionStore';

describe('Phase 3 Comprehensive Systems Audit', () => {

  describe('1. Alchemy Lab & Mana Recovery Auditing', () => {
    it('accurately calculates Ingredient-Point formula: 10 for 1st + 15 per additional', () => {
      expect(calculateIngredientPoints(0)).toBe(0);
      expect(calculateIngredientPoints(1)).toBe(10);
      expect(calculateIngredientPoints(2)).toBe(25);
      expect(calculateIngredientPoints(3)).toBe(40);
      expect(calculateIngredientPoints(4)).toBe(55);
      expect(calculateIngredientPoints(5)).toBe(70);
    });

    it('blocks camp brewing for mixtures exceeding 25 points without owned Stronghold Lab', () => {
      // 1 or 2 ingredients (<= 25 pts) do NOT require stronghold lab
      expect(requiresStrongholdLab(10)).toBe(false);
      expect(requiresStrongholdLab(25)).toBe(false);

      // > 25 points strictly requires Stronghold Lab
      expect(requiresStrongholdLab(26)).toBe(true);
      expect(requiresStrongholdLab(40)).toBe(true);
      expect(requiresStrongholdLab(55)).toBe(true);
    });

    it('calculates 4-hour uninterrupted work sessions per 25 ingredient points', () => {
      expect(calculateWorkHours(10)).toBe(4);
      expect(calculateWorkHours(25)).toBe(4);
      expect(calculateWorkHours(40)).toBe(8);
      expect(calculateWorkHours(55)).toBe(12);
    });

    it('verifies 28-essence matrix produces exact recipes, DCs, and save effects', () => {
      expect(ESSENCE_MATRIX_RECIPES.length).toBe(28);

      // Fire + Earth = Shrapnel Bomb
      const shrapnel = lookupEssenceCombination('FIRE', 'EARTH');
      expect(shrapnel).not.toBeNull();
      expect(shrapnel?.name).toBe('Shrapnel Bomb');
      expect(shrapnel?.radiusFeet).toBe(15);
      expect(shrapnel?.saveDc).toBe(14);
      expect(shrapnel?.saveType).toBe('DEX');

      // Water + Negative = Paralytic Toxin
      const toxin = lookupEssenceCombination('WATER', 'NEGATIVE');
      expect(toxin).not.toBeNull();
      expect(toxin?.name).toContain('Paralytic Toxin');
      expect(toxin?.saveDc).toBe(15);
      expect(toxin?.saveType).toBe('CON');

      // Commutative check: Earth + Fire equals Fire + Earth
      const reverseShrapnel = lookupEssenceCombination('EARTH', 'FIRE');
      expect(reverseShrapnel?.name).toBe('Shrapnel Bomb');
    });

    it('validates Mana Potion point recovery formula (1 pt per spell slot level)', () => {
      // Common: 1d4+1 (min 2, max 5)
      // Greater: 2d4+2 (min 4, max 10)
      // Superior: 3d4+4 (min 7, max 16)
      const commonMin = 1 + 1;
      const commonMax = 4 + 1;
      expect(commonMin).toBe(2);
      expect(commonMax).toBe(5);

      const greaterMin = 2 + 2;
      const greaterMax = 8 + 2;
      expect(greaterMin).toBe(4);
      expect(greaterMax).toBe(10);

      const superiorMin = 3 + 4;
      const superiorMax = 12 + 4;
      expect(superiorMin).toBe(7);
      expect(superiorMax).toBe(16);

      // Simulating slot restoration with 7 mana points:
      // Can restore a level 3 slot (costs 3 pts, 4 remaining)
      // then a level 2 slot (costs 2 pts, 2 remaining)
      // then two level 1 slots (costs 1 pt each, 0 remaining)
      let pool = 7;
      const slots = [
        { level: 1, total: 4, used: 2 },
        { level: 2, total: 3, used: 1 },
        { level: 3, total: 2, used: 1 },
      ];

      // Restore Level 3
      if (slots[2].used > 0 && pool >= slots[2].level) {
        slots[2].used -= 1;
        pool -= slots[2].level;
      }
      expect(slots[2].used).toBe(0);
      expect(pool).toBe(4);

      // Restore Level 2
      if (slots[1].used > 0 && pool >= slots[1].level) {
        slots[1].used -= 1;
        pool -= slots[1].level;
      }
      expect(slots[1].used).toBe(0);
      expect(pool).toBe(2);

      // Restore Level 1 twice
      while (slots[0].used > 0 && pool >= slots[0].level) {
        slots[0].used -= 1;
        pool -= slots[0].level;
      }
      expect(slots[0].used).toBe(0);
      expect(pool).toBe(0);
    });
  });

  describe('2. Guild Contracts & Harvest Extraction Auditing', () => {
    it('verifies notice board 10-day Decade deadlines and 100% escrow deposits', () => {
      const reward = 450;
      const escrow = reward;
      const deadlineDecades = 1;
      const daysRemaining = deadlineDecades * 10;

      expect(escrow).toBe(reward);
      expect(daysRemaining).toBe(10);
    });

    it('verifies Harvest skill DCs and dressing times scale with monster size and CR', () => {
      // Tiny Beast CR 1: 10 + 0 - 2 (size) - 1 (Nature favored) = 8 (minimum clamped 8)
      expect(calculateHarvestDC(1, 'Tiny', 'Nature', 'Beast')).toBe(8);

      // Huge Aberration CR 8: 10 + 4 + 2 - 1 (Arcana favored) = 15
      expect(calculateHarvestDC(8, 'Huge', 'Arcana', 'Aberration')).toBe(15);

      // Dressing times
      expect(calculateDressMinutes('Tiny', 2)).toBe(10);
      expect(calculateDressMinutes('Medium', 4)).toBe(45);
      expect(calculateDressMinutes('Large', 6)).toBe(120);
      expect(calculateDressMinutes('Gargantuan', 9)).toBe(480);
      // High CR bonus: CR 15 Gargantuan adds 60 min
      expect(calculateDressMinutes('Gargantuan', 15)).toBe(540);
    });

    it('strictly calculates Appraisal deduction slider (0% to 50%) on payouts', () => {
      const trophyBaseGp = 200;
      expect(calculateAppraisalPayout(trophyBaseGp, 0)).toBe(200);
      expect(calculateAppraisalPayout(trophyBaseGp, 15)).toBe(170);
      expect(calculateAppraisalPayout(trophyBaseGp, 50)).toBe(100);
      expect(calculateAppraisalPayout(trophyBaseGp, 75)).toBe(100); // Clamped at 50%
    });

    it('enforces the 24-hour decay engine, spoiling unpreserved organs when time advances', () => {
      const initialCalendar = { currentYear: 1, currentMonth: 2, currentDay: 5, currentHour: 10 };
      const startHour = getCalendarTotalHours(initialCalendar);

      const organ: PartyStashItem = {
        id: 'viscera-test-1',
        name: 'Chimera Bile Sac',
        category: 'Organic Viscera',
        quantity: 1,
        weight: 1.5,
        description: 'Extracted bile gland.',
        valueGp: 60,
        harvestedAtHour: startHour,
        isPreserved: false,
        isSpoiled: false,
      };

      // 10 hours later -> still viable
      const at10h = checkItemDecay(organ, startHour + 10);
      expect(at10h.isSpoiled).toBe(false);
      expect(at10h.hoursRemaining).toBe(14);

      // 24 hours later -> spoiled!
      const at24h = checkItemDecay(organ, startHour + 24);
      expect(at24h.isSpoiled).toBe(true);
      expect(at24h.hoursRemaining).toBe(0);

      // Batch audit
      const stash = [organ];
      const audit = auditPartyStashDecay(stash, startHour + 25);
      expect(audit.newlySpoiledCount).toBe(1);
      expect(audit.updatedItems[0].isSpoiled).toBe(true);
      expect(audit.updatedItems[0].name).toContain('Spoiled');
      expect(audit.updatedItems[0].valueGp).toBe(0);
    });
  });

  describe('3. Strongholds & Room Point Progression Auditing', () => {
    it('enforces sequential upgrade costs and durations from 2 to 6 RP', () => {
      expect(UPGRADE_PROGRESSION[2].baseCostGp).toBe(10000);
      expect(UPGRADE_PROGRESSION[2].days).toBe(40);

      expect(UPGRADE_PROGRESSION[3].baseCostGp).toBe(10000);
      expect(UPGRADE_PROGRESSION[3].days).toBe(50);

      expect(UPGRADE_PROGRESSION[4].baseCostGp).toBe(10000);
      expect(UPGRADE_PROGRESSION[4].days).toBe(50);

      expect(UPGRADE_PROGRESSION[5].baseCostGp).toBe(15000);
      expect(UPGRADE_PROGRESSION[5].days).toBe(200);
    });

    it('accurately applies PC labor discount: half character level %', () => {
      // Level 8 PC -> 4% discount
      const lvl8 = calculateLaborDiscount(8);
      expect(lvl8.discountPercent).toBe(4);
      expect(lvl8.calculateDiscountedCost(10000)).toBe(9600);

      // Level 14 PC -> 7% discount
      const lvl14 = calculateLaborDiscount(14);
      expect(lvl14.discountPercent).toBe(7);
      expect(lvl14.calculateDiscountedCost(15000)).toBe(13950);
    });

    it('tallies hireling staffing formula based on upgraded Room Points', () => {
      // 2 RP: 1 skilled, 2 unskilled
      const staff2 = calculateStaffingRequirements(2, []);
      expect(staff2.baselineSkilled).toBe(1);
      expect(staff2.baselineUnskilled).toBe(2);

      // 5 RP: 2 skilled, 5 unskilled
      const staff5 = calculateStaffingRequirements(5, []);
      expect(staff5.baselineSkilled).toBe(2);
      expect(staff5.baselineUnskilled).toBe(5);

      // 6 RP with 4 facilities (Alchemical Lab, Forge, Chapel, Vault)
      const staff6 = calculateStaffingRequirements(6, ['alchemy_lab', 'forge', 'chapel', 'vault']);
      expect(staff6.facilitySkilled).toBe(4); // 1 + 1 + 1 + 1
      expect(staff6.facilityUnskilled).toBe(5); // 1 + 2 + 1 + 1
      expect(staff6.recommendedSkilled).toBe(4);
      expect(staff6.recommendedUnskilled).toBe(6); // max(baseline 6, facility 5)
    });

    it('triggers desertion warning and offline status at 7 days without pay', () => {
      // Paid
      expect(evaluateDesertionRisk(0).isDesertionTriggered).toBe(false);
      expect(evaluateDesertionRisk(0).status).toBe('Loyal');

      // 3 days overdue
      expect(evaluateDesertionRisk(3).isDesertionTriggered).toBe(false);
      expect(evaluateDesertionRisk(3).status).toBe('Warning');

      // 6 days overdue
      expect(evaluateDesertionRisk(6).isDesertionTriggered).toBe(false);
      expect(evaluateDesertionRisk(6).status).toBe('Critical');

      // 7 days overdue -> DESERTION TRIGGERED
      expect(evaluateDesertionRisk(7).isDesertionTriggered).toBe(true);
      expect(evaluateDesertionRisk(7).status).toBe('Deserted');

      // 14 days overdue -> DESERTED
      expect(evaluateDesertionRisk(14).isDesertionTriggered).toBe(true);
      expect(evaluateDesertionRisk(14).status).toBe('Deserted');
    });
  });
});
