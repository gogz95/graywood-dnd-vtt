import { describe, it, expect } from 'vitest';
import {
  UPGRADE_PROGRESSION,
  FACILITIES,
  calculateLaborDiscount,
  calculatePayroll,
  evaluateDesertionRisk,
  calculateAllocatedRp,
  calculateStaffingRequirements,
} from './strongholdEngine';

describe('Aleamos Stronghold & Room Point Engine', () => {
  it('strictly validates sequential Room Point upgrade costs and duration', () => {
    // 2 -> 3 RP: 10,000 gp, 40 days
    expect(UPGRADE_PROGRESSION[2]).toEqual({
      fromRp: 2,
      toRp: 3,
      baseCostGp: 10000,
      days: 40,
    });

    // 3 -> 4 RP: 10,000 gp, 50 days
    expect(UPGRADE_PROGRESSION[3]).toEqual({
      fromRp: 3,
      toRp: 4,
      baseCostGp: 10000,
      days: 50,
    });

    // 4 -> 5 RP: 10,000 gp, 50 days
    expect(UPGRADE_PROGRESSION[4]).toEqual({
      fromRp: 4,
      toRp: 5,
      baseCostGp: 10000,
      days: 50,
    });

    // 5 -> 6 RP: 15,000 gp, 200 days
    expect(UPGRADE_PROGRESSION[5]).toEqual({
      fromRp: 5,
      toRp: 6,
      baseCostGp: 15000,
      days: 200,
    });
  });

  it('calculates PC labor discount as half character level %', () => {
    // Level 8 PC -> 4% discount
    const lvl8 = calculateLaborDiscount(8);
    expect(lvl8.discountPercent).toBe(4);
    expect(lvl8.calculateDiscountedCost(10000)).toBe(9600);

    // Level 10 PC -> 5% discount
    const lvl10 = calculateLaborDiscount(10);
    expect(lvl10.discountPercent).toBe(5);
    expect(lvl10.calculateDiscountedCost(10000)).toBe(9500);

    // Level 20 PC -> 10% discount on 15,000 gp
    const lvl20 = calculateLaborDiscount(20);
    expect(lvl20.discountPercent).toBe(10);
    expect(lvl20.calculateDiscountedCost(15000)).toBe(13500);
  });

  it('verifies all 5 modular facilities and room point budgets', () => {
    expect(FACILITIES.alchemy_lab.rpCost).toBe(1);
    expect(FACILITIES.forge.rpCost).toBe(1);
    expect(FACILITIES.chapel.rpCost).toBe(1);
    expect(FACILITIES.vault.rpCost).toBe(1);
    expect(FACILITIES.watchtower.rpCost).toBe(1);

    const activeFacilities = ['alchemy_lab', 'forge', 'chapel'] as const;
    expect(calculateAllocatedRp([...activeFacilities])).toBe(3);
  });

  it('calculates skilled (2 gp/day) and unskilled (2 sp/day) hireling payroll', () => {
    // 2 skilled (4 gp) + 5 unskilled (1 gp) = 5 gp/day, 150 gp/month
    const payroll = calculatePayroll(2, 5);
    expect(payroll.skilledDailyGp).toBe(4);
    expect(payroll.unskilledDailyGp).toBe(1);
    expect(payroll.totalDailyGp).toBe(5);
    expect(payroll.totalMonthlyGp).toBe(150);
  });

  it('evaluates desertion risk: warns when unpaid and triggers desertion at 7 days', () => {
    // 0 days unpaid -> Loyal
    const p0 = evaluateDesertionRisk(0);
    expect(p0.isDesertionTriggered).toBe(false);
    expect(p0.status).toBe('Loyal');

    // 2 days unpaid -> Warning
    const p2 = evaluateDesertionRisk(2);
    expect(p2.isDesertionTriggered).toBe(false);
    expect(p2.status).toBe('Warning');

    // 5 days unpaid -> Critical (2 days remaining)
    const p5 = evaluateDesertionRisk(5);
    expect(p5.isDesertionTriggered).toBe(false);
    expect(p5.status).toBe('Critical');
    expect(p5.warningMessage).toContain('in 2 day(s)');

    // 7 days unpaid -> Desertion triggered!
    const p7 = evaluateDesertionRisk(7);
    expect(p7.isDesertionTriggered).toBe(true);
    expect(p7.status).toBe('Deserted');

    // 10 days unpaid -> Deserted
    const p10 = evaluateDesertionRisk(10);
    expect(p10.isDesertionTriggered).toBe(true);
    expect(p10.status).toBe('Deserted');
  });

  it('calculates hireling staffing formula based on upgraded Room Points', () => {
    // 3 RP without facilities: baseline 1 skilled, 3 unskilled
    const staff3 = calculateStaffingRequirements(3, []);
    expect(staff3.baselineSkilled).toBe(1);
    expect(staff3.baselineUnskilled).toBe(3);
    expect(staff3.recommendedSkilled).toBe(1);
    expect(staff3.recommendedUnskilled).toBe(3);

    // 6 RP without facilities: baseline 3 skilled, 6 unskilled
    const staff6 = calculateStaffingRequirements(6, []);
    expect(staff6.baselineSkilled).toBe(3);
    expect(staff6.baselineUnskilled).toBe(6);

    // 4 RP with Alchemy Lab (1 sk, 1 un) & Watchtower (2 sk, 3 un)
    const staffWithFacs = calculateStaffingRequirements(4, ['alchemy_lab', 'watchtower']);
    expect(staffWithFacs.facilitySkilled).toBe(3);
    expect(staffWithFacs.facilityUnskilled).toBe(4);
    expect(staffWithFacs.recommendedSkilled).toBe(3);
    expect(staffWithFacs.recommendedUnskilled).toBe(4);
  });
});
