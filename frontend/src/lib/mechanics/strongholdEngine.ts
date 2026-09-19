// strongholdEngine.ts — Aleamos Stronghold Commercial Revenue & Settlement Logistics Engine
// Calculates monthly commercial yield for Market Stalls, Mill, Caravansary, Water Docks,
// and enforces automated hireling payroll debits with 7-day desertion warnings.

export type CommercialFacilityId =
  | 'market_stalls'
  | 'mill'
  | 'caravansary'
  | 'water_docks';

export interface CommercialFacilityDef {
  id: CommercialFacilityId;
  name: string;
  icon: string;
  cycle: 'month' | 'decade';
  formulaDesc: string;
  description: string;
}

export const COMMERCIAL_FACILITIES: Record<CommercialFacilityId, CommercialFacilityDef> = {
  market_stalls: {
    id: 'market_stalls',
    name: 'Chartered Market Stalls',
    icon: '⚖️',
    cycle: 'month',
    formulaDesc: '30 gp × 2d6 per month',
    description: 'Rented stalls for regional merchants, peddlers, and itinerant craftsmen.',
  },
  mill: {
    id: 'mill',
    name: 'Grist / Timber Mill',
    icon: '⚙️',
    cycle: 'month',
    formulaDesc: '1d10 × 100 gp processed goods/month',
    description: 'Water-wheel or wind-driven mill processing harvested grain, timber, and flour.',
  },
  caravansary: {
    id: 'caravansary',
    name: 'Fortified Caravansary',
    icon: '🐪',
    cycle: 'month',
    formulaDesc: '50 gp × 1d8 staging fees/month',
    description: 'Enclosed stables, wagon yards, and secure teamster dormitories.',
  },
  water_docks: {
    id: 'water_docks',
    name: 'Deepwater Wharves & Docks',
    icon: '⚓',
    cycle: 'decade',
    formulaDesc: '20 gp per moored vessel per Decade (10 days)',
    description: 'Mooring bollards, cargo cranes, and customs staging berths.',
  },
};

export interface CommercialYieldResult {
  facilityId: CommercialFacilityId;
  name: string;
  gpYield: number;
  rollFormula: string;
  rolls: number[];
  cycle: 'month' | 'decade';
  notes: string;
}

/**
 * Calculates commercial yield for an installed facility.
 */
export function rollFacilityYield(
  facilityId: CommercialFacilityId,
  params: { mooredVesselsCount?: number } = {}
): CommercialYieldResult {
  switch (facilityId) {
    case 'market_stalls': {
      // 30 gp * 2d6
      const d1 = Math.floor(Math.random() * 6) + 1;
      const d2 = Math.floor(Math.random() * 6) + 1;
      const diceSum = d1 + d2;
      const gpYield = 30 * diceSum;
      return {
        facilityId,
        name: COMMERCIAL_FACILITIES.market_stalls.name,
        gpYield,
        rollFormula: `30 gp × 2d6 (${d1} + ${d2} = ${diceSum})`,
        rolls: [d1, d2],
        cycle: 'month',
        notes: `Charter stall fees from regional peddlers and guild trade permits.`,
      };
    }

    case 'mill': {
      // 1d10 * 100 gp
      const d10 = Math.floor(Math.random() * 10) + 1;
      const gpYield = d10 * 100;
      return {
        facilityId,
        name: COMMERCIAL_FACILITIES.mill.name,
        gpYield,
        rollFormula: `1d10 (${d10}) × 100 gp`,
        rolls: [d10],
        cycle: 'month',
        notes: `Milled grain, refined flour, and squared timber export parcels.`,
      };
    }

    case 'caravansary': {
      // 50 gp * 1d8
      const d8 = Math.floor(Math.random() * 8) + 1;
      const gpYield = 50 * d8;
      return {
        facilityId,
        name: COMMERCIAL_FACILITIES.caravansary.name,
        gpYield,
        rollFormula: `50 gp × 1d8 (${d8})`,
        rolls: [d8],
        cycle: 'month',
        notes: `Wagon staging fees, draught beast fodder, and teamster lodging tolls.`,
      };
    }

    case 'water_docks': {
      // 20 gp per moored vessel per Decade (10-day cycle)
      const vessels = params.mooredVesselsCount ?? Math.floor(Math.random() * 4) + 2; // Default 2-5 vessels
      const gpYield = 20 * vessels;
      return {
        facilityId,
        name: COMMERCIAL_FACILITIES.water_docks.name,
        gpYield,
        rollFormula: `${vessels} moored vessels × 20 gp`,
        rolls: [vessels],
        cycle: 'decade',
        notes: `Harbor dues, harbor pilotage, and quay cargo handling tolls.`,
      };
    }
  }
}

export interface PayrollStatus {
  dailyCostGp: number;
  monthlyCostGp: number;
  daysUnpaid: number;
  isDesertionImminent: boolean; // Flagged at 7 days without pay
  skilledPayrollDaily: number;   // 2 gp/day per skilled hireling
  unskilledPayrollDaily: number; // 0.2 gp (2 sp)/day per unskilled hireling
}

/**
 * Calculates daily and monthly payroll liabilities.
 * Skilled: 2 gp/day; Unskilled: 2 sp (0.2 gp)/day.
 */
export function calculatePayroll(
  skilledCount: number,
  unskilledCount: number,
  daysUnpaid = 0
): PayrollStatus {
  const skilledDaily = skilledCount * 2.0;
  const unskilledDaily = unskilledCount * 0.2;
  const dailyCostGp = Math.round((skilledDaily + unskilledDaily) * 100) / 100;
  const monthlyCostGp = Math.round(dailyCostGp * 30 * 100) / 100;

  return {
    dailyCostGp,
    monthlyCostGp,
    daysUnpaid,
    isDesertionImminent: daysUnpaid >= 7,
    skilledPayrollDaily: skilledDaily,
    unskilledPayrollDaily: unskilledDaily,
  };
}

/**
 * Processes daily payroll deduction from stronghold treasury.
 * Rule: Flags desertion alert when 7 days elapse without pay.
 */
export function processDailyPayrollDebit(
  treasuryGp: number,
  skilledCount: number,
  unskilledCount: number,
  currentDaysUnpaid: number
): {
  newTreasuryGp: number;
  newDaysUnpaid: number;
  paidSuccessfully: boolean;
  desertionTriggered: boolean;
  message: string;
} {
  const { dailyCostGp } = calculatePayroll(skilledCount, unskilledCount, currentDaysUnpaid);

  if (treasuryGp >= dailyCostGp) {
    const nextTreasury = Math.round((treasuryGp - dailyCostGp) * 100) / 100;
    return {
      newTreasuryGp: nextTreasury,
      newDaysUnpaid: 0,
      paidSuccessfully: true,
      desertionTriggered: false,
      message: `Daily payroll of ${dailyCostGp} gp successfully debited from stronghold treasury.`,
    };
  }

  // Insufficient funds: Increment unpaid days counter
  const newDaysUnpaid = currentDaysUnpaid + 1;
  const desertionTriggered = newDaysUnpaid >= 7;

  let msg = `PAYROLL DEFAULT: Insufficient funds (${treasuryGp} gp < ${dailyCostGp} gp daily cost). Unpaid days: ${newDaysUnpaid}.`;
  if (desertionTriggered) {
    msg += ` CRITICAL DESERTION ALERT: Hirelings have gone 7 or more days without wages! Skilled artisans and guards are abandoning their posts.`;
  }

  return {
    newTreasuryGp: treasuryGp,
    newDaysUnpaid,
    paidSuccessfully: false,
    desertionTriggered,
    message: msg,
  };
}

/**
 * Generates comprehensive monthly commercial and payroll report.
 */
export function generateMonthlySettlementReport(
  activeFacilities: CommercialFacilityId[],
  skilledCount: number,
  unskilledCount: number,
  mooredVesselsCount = 3
): {
  commercialYields: CommercialYieldResult[];
  totalGrossYieldGp: number;
  payroll: PayrollStatus;
  netMonthlyIncomeGp: number;
} {
  const commercialYields = activeFacilities.map(f =>
    rollFacilityYield(f, { mooredVesselsCount })
  );

  const totalGrossYieldGp = commercialYields.reduce((sum, item) => sum + item.gpYield, 0);
  const payroll = calculatePayroll(skilledCount, unskilledCount);
  const netMonthlyIncomeGp = Math.round((totalGrossYieldGp - payroll.monthlyCostGp) * 100) / 100;

  return {
    commercialYields,
    totalGrossYieldGp,
    payroll,
    netMonthlyIncomeGp,
  };
}
