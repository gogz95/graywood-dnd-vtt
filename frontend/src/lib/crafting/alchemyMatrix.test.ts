import { describe, it, expect } from 'vitest';
import {
  ESSENCE_MATRIX_RECIPES,
  calculateIngredientPoints,
  calculateWorkHours,
  requiresStrongholdLab,
  lookupEssenceCombination,
  type ElementalType,
} from '../components/crafting/alchemyMatrix';

describe('Aleamos 28-Essence Matrix & Crafting Math Engine', () => {
  it('contains exactly 28 unique non-redundant essence recipes', () => {
    expect(ESSENCE_MATRIX_RECIPES.length).toBe(28);

    const elements: ElementalType[] = [
      'FIRE', 'WATER', 'EARTH', 'AIR', 'POSITIVE', 'NEGATIVE', 'ORDER', 'CHAOS'
    ];

    let foundCount = 0;
    for (let i = 0; i < elements.length; i++) {
      for (let j = i + 1; j < elements.length; j++) {
        const recipe = lookupEssenceCombination(elements[i], elements[j]);
        expect(recipe).toBeTruthy();
        foundCount++;
      }
    }
    expect(foundCount).toBe(28);
  });

  it('calculates 10 points for first ingredient + 15 points per additional ingredient', () => {
    expect(calculateIngredientPoints(0)).toBe(0);
    expect(calculateIngredientPoints(1)).toBe(10);
    expect(calculateIngredientPoints(2)).toBe(25);
    expect(calculateIngredientPoints(3)).toBe(40);
    expect(calculateIngredientPoints(4)).toBe(55);
  });

  it('calculates 4-hour uninterrupted work session per 25 points', () => {
    expect(calculateWorkHours(0)).toBe(0);
    expect(calculateWorkHours(10)).toBe(4); // 1-25 pts = 4 hrs
    expect(calculateWorkHours(25)).toBe(4);
    expect(calculateWorkHours(26)).toBe(8); // 26-50 pts = 8 hrs
    expect(calculateWorkHours(40)).toBe(8);
    expect(calculateWorkHours(55)).toBe(12); // 51-75 pts = 12 hrs
  });

  it('enforces workshop restrictions: <= 25 points at camp, > 25 points requires Stronghold Lab', () => {
    expect(requiresStrongholdLab(10)).toBe(false);
    expect(requiresStrongholdLab(25)).toBe(false); // 2 ingredients = 25 pts = camp allowed
    expect(requiresStrongholdLab(26)).toBe(true);  // > 25 pts = complex brew requires lab
    expect(requiresStrongholdLab(40)).toBe(true);
  });

  it('looks up exact codified recipes including Shrapnel Bomb and Paralytic Toxin', () => {
    const shrapnel = lookupEssenceCombination('FIRE', 'EARTH');
    expect(shrapnel).toBeTruthy();
    expect(shrapnel!.name).toBe('Shrapnel Bomb');
    expect(shrapnel!.radiusFeet).toBe(15);
    expect(shrapnel!.saveDc).toBe(14);

    const toxin = lookupEssenceCombination('WATER', 'NEGATIVE');
    expect(toxin).toBeTruthy();
    expect(toxin!.name).toBe('Paralytic Toxin (Viscous)');
    expect(toxin!.saveDc).toBe(15);
    expect(toxin!.saveType).toBe('CON');
  });
});
