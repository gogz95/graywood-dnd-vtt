// src/lib/services/encounterCalculator.ts
// Official 5e Encounter Budget and Difficulty Calculator

const XP_THRESHOLDS: Record<number, [number, number, number, number]> = {
  1: [25, 50, 75, 100],
  2: [50, 100, 150, 200],
  3: [75, 150, 225, 400],
  4: [125, 250, 375, 500],
  5: [250, 500, 750, 1100],
  6: [300, 600, 900, 1400],
  7: [350, 750, 1100, 1700],
  8: [450, 900, 1400, 2100],
  9: [550, 1100, 1600, 2400],
  10: [600, 1200, 1900, 2800],
  11: [800, 1600, 2400, 3600],
  12: [1000, 2000, 3000, 4500],
  13: [1100, 2200, 3400, 5100],
  14: [1250, 2500, 3800, 5700],
  15: [1400, 2800, 4300, 6400],
  16: [1600, 3200, 4800, 7200],
  17: [2000, 3900, 5900, 8800],
  18: [2100, 4200, 6300, 9500],
  19: [2400, 4900, 7300, 10900],
  20: [2800, 5700, 8500, 12700]
};

const MULTIPLIERS: [number, number][] = [
  [1, 1],
  [2, 1.5],
  [3, 2],
  [7, 2.5],
  [11, 3],
  [15, 4]
];

export function calculateEncounterBudget(partyLevels: number[], monsterXpList: number[]) {
  const thresholds = [0, 0, 0, 0];
  for (const lvl of partyLevels) {
    const t = XP_THRESHOLDS[lvl] || XP_THRESHOLDS[20] || [0, 0, 0, 0];
    t.forEach((val, idx) => (thresholds[idx] += val));
  }

  const rawXp = monsterXpList.reduce((acc, v) => acc + v, 0);
  const count = monsterXpList.length;

  let multiplier = 1;
  for (const [tierCount, mult] of MULTIPLIERS) {
    if (count >= tierCount) multiplier = mult;
  }

  const adjustedXp = rawXp * multiplier;
  let difficulty: 'Trivial' | 'Easy' | 'Medium' | 'Hard' | 'Deadly' = 'Trivial';

  if (adjustedXp >= thresholds[3]) difficulty = 'Deadly';
  else if (adjustedXp >= thresholds[2]) difficulty = 'Hard';
  else if (adjustedXp >= thresholds[1]) difficulty = 'Medium';
  else if (adjustedXp >= thresholds[0]) difficulty = 'Easy';

  return { rawXp, adjustedXp, difficulty, thresholds };
}
