// src/lib/services/diceEngine.test.ts
import { describe, it, expect } from 'vitest';
import { evaluateDice, parseDiceFormula } from './diceEngine';

describe('Unified 5e Dice Algebra & Evaluator Engine', () => {
  it('evaluates basic dice and flat modifiers: 1d20 + 5', () => {
    const res = evaluateDice('1d20 + 5');
    expect(res.formula).toBe('1d20 + 5');
    expect(res.total).toBeGreaterThanOrEqual(6);
    expect(res.total).toBeLessThanOrEqual(25);
    expect(res.terms.length).toBe(2);

    const diceTerm = res.terms[0];
    expect(diceTerm.type).toBe('dice');
    expect(diceTerm.dieSides).toBe(20);
    expect(diceTerm.diceResults?.length).toBe(1);
    expect(diceTerm.dropped?.length).toBe(0);

    const flatTerm = res.terms[1];
    expect(flatTerm.type).toBe('flat');
    expect(flatTerm.modifier).toBe(5);
    expect(res.formattedBreakdown).toMatch(/\[1d20 \(\d+\) \+ 5\] = \d+/);
  });

  it('evaluates subtraction with flats: 2d6 - 1', () => {
    const res = evaluateDice('2d6 - 1');
    expect(res.total).toBeGreaterThanOrEqual(1);
    expect(res.total).toBeLessThanOrEqual(11);
    expect(res.terms.length).toBe(2);
    expect(res.terms[0].type).toBe('dice');
    expect(res.terms[0].diceResults?.length).toBe(2);
    expect(res.terms[1].type).toBe('flat');
    expect(res.terms[1].value).toBe(-1);
    expect(res.formattedBreakdown).toMatch(/\[2d6 \(\d+, \d+\) - 1\] = \d+/);
  });

  it('evaluates advantage keep-highest: 2d20kh1', () => {
    const res = evaluateDice('2d20kh1');
    expect(res.terms.length).toBe(1);
    const term = res.terms[0];
    expect(term.type).toBe('dice');
    expect(term.diceResults?.length).toBe(2);
    expect(term.kept?.length).toBe(1);
    expect(term.dropped?.length).toBe(1);
    expect(term.kept![0]).toBeGreaterThanOrEqual(term.dropped![0]);
    expect(res.total).toBe(term.kept![0]);
    expect(res.formattedBreakdown).toMatch(/\[2d20kh1 \(\d+, \[\d+ dropped\]\)\] = \d+/);
  });

  it('evaluates disadvantage keep-lowest: 2d20kl1', () => {
    const res = evaluateDice('2d20kl1');
    expect(res.terms.length).toBe(1);
    const term = res.terms[0];
    expect(term.type).toBe('dice');
    expect(term.diceResults?.length).toBe(2);
    expect(term.kept?.length).toBe(1);
    expect(term.dropped?.length).toBe(1);
    expect(term.kept![0]).toBeLessThanOrEqual(term.dropped![0]);
    expect(res.total).toBe(term.kept![0]);
  });

  it('evaluates ability score generation: 4d6kh3', () => {
    const res = evaluateDice('4d6kh3');
    expect(res.terms.length).toBe(1);
    const term = res.terms[0];
    expect(term.diceResults?.length).toBe(4);
    expect(term.kept?.length).toBe(3);
    expect(term.dropped?.length).toBe(1);
    const expectedSum = term.kept!.reduce((a, b) => a + b, 0);
    expect(res.total).toBe(expectedSum);
    expect(res.total).toBeGreaterThanOrEqual(3);
    expect(res.total).toBeLessThanOrEqual(18);
  });

  it('evaluates exploding dice notation: 1d6!', () => {
    const res = evaluateDice('1d6!');
    expect(res.terms.length).toBe(1);
    const term = res.terms[0];
    expect(term.type).toBe('dice');
    expect(term.diceResults?.length).toBeGreaterThanOrEqual(1);
    const sum = term.diceResults!.reduce((a, b) => a + b, 0);
    expect(res.total).toBe(sum);
  });

  it('evaluates parentheses and operator precedence: (1d8 + 2) * 2', () => {
    const res = evaluateDice('(1d8 + 2) * 2');
    expect(res.terms.length).toBe(2);
    const d8 = res.terms[0].value;
    const flat = res.terms[1].value;
    expect(res.total).toBe((d8 + flat) * 2);
    expect(res.formattedBreakdown).toMatch(/\[\(1d8 \(\d+\) \+ 2\) \* 2\] = \d+/);
  });

  it('associates explicit term labels e.g. DEX and Prof', () => {
    const res = evaluateDice('1d20 + 3 + 2', [
      { label: 'DEX', value: 3 },
      { label: 'Prof', value: 2 }
    ]);
    expect(res.terms.length).toBe(3);
    expect(res.formattedBreakdown).toMatch(/\[1d20 \(\d+\) \+ 3 \(DEX\) \+ 2 \(Prof\)\] = \d+/);
  });

  it('re-exports parseDiceFormula for backward compatibility', () => {
    const parsed = parseDiceFormula('2d6 + 4');
    expect(parsed).not.toBeNull();
    expect(parsed?.rolls.length).toBe(2);
    expect(parsed?.modifier).toBe(4);
    expect(parsed?.total).toBe(parsed!.rolls[0] + parsed!.rolls[1] + 4);
  });
});
