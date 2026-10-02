// frontend/src/lib/services/diceParser.ts
// Recursive Descent AST Dice Parser supporting Keep/Drop, Exploding, Rerolls & Target Successes

export type TokenType =
  | 'NUMBER'
  | 'DICE'
  | 'PLUS'
  | 'MINUS'
  | 'MULTIPLY'
  | 'DIVIDE'
  | 'LPAREN'
  | 'RPAREN'
  | 'MOD_KEEP_HIGH'
  | 'MOD_KEEP_LOW'
  | 'MOD_DROP_HIGH'
  | 'MOD_DROP_LOW'
  | 'MOD_EXPLODE_PENETRATING'
  | 'MOD_EXPLODE'
  | 'MOD_REROLL_ONCE'
  | 'MOD_REROLL'
  | 'MOD_COUNT_SUCCESS'
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
  count?: number;
  sides?: number;
  param?: number;
  operator?: string;
}

export interface DieRoll {
  value: number;
  sides: number;
  isKept: boolean;
  isExploded?: boolean;
  isRerolled?: boolean;
  isSuccess?: boolean;
}

export interface RollStepBreakdown {
  expression: string;
  rolls: DieRoll[];
  subtotal: number;
}

export interface ParsedRollResult {
  total: number;
  expression: string;
  breakdown: string;
  steps: RollStepBreakdown[];
  isCritical?: boolean;
  isFumble?: boolean;
}

export type DiceRollEventListener = (result: ParsedRollResult) => void;
const rollEventListeners = new Set<DiceRollEventListener>();

export function onDiceRollEvaluated(listener: DiceRollEventListener): () => void {
  rollEventListeners.add(listener);
  return () => rollEventListeners.delete(listener);
}

export function notifyDiceRollEvaluated(result: ParsedRollResult): void {
  rollEventListeners.forEach((listener) => {
    try {
      listener(result);
    } catch (err) {
      console.error('[DiceParser] Event listener error:', err);
    }
  });
}


/**
 * Tokenizes a complex dice formula string.
 */
export function tokenizeDiceFormula(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const str = input.replace(/\s+/g, '');

  while (i < str.length) {
    const char = str[i];

    if (char === '+') {
      tokens.push({ type: 'PLUS', value: '+' });
      i++;
      continue;
    }
    if (char === '-') {
      tokens.push({ type: 'MINUS', value: '-' });
      i++;
      continue;
    }
    if (char === '*') {
      tokens.push({ type: 'MULTIPLY', value: '*' });
      i++;
      continue;
    }
    if (char === '/') {
      tokens.push({ type: 'DIVIDE', value: '/' });
      i++;
      continue;
    }
    if (char === '(') {
      tokens.push({ type: 'LPAREN', value: '(' });
      i++;
      continue;
    }
    if (char === ')') {
      tokens.push({ type: 'RPAREN', value: ')' });
      i++;
      continue;
    }

    // Dice Pattern: e.g. 4d6, 1d20, d10, 2d8!p
    const diceMatch = str.slice(i).match(/^(\d*)d(\d+)/i);
    if (diceMatch) {
      const count = diceMatch[1] ? parseInt(diceMatch[1], 10) : 1;
      const sides = parseInt(diceMatch[2], 10);
      tokens.push({
        type: 'DICE',
        value: diceMatch[0],
        count,
        sides,
      });
      i += diceMatch[0].length;

      // Check attached modifiers
      while (i < str.length) {
        // Keep / Drop: kh<N>, kl<N>, dh<N>, dl<N>
        const kdMatch = str.slice(i).match(/^(kh|kl|dh|dl)(\d+)/i);
        if (kdMatch) {
          const modType = kdMatch[1].toLowerCase();
          const p = parseInt(kdMatch[2], 10);
          const type: TokenType =
            modType === 'kh'
              ? 'MOD_KEEP_HIGH'
              : modType === 'kl'
              ? 'MOD_KEEP_LOW'
              : modType === 'dh'
              ? 'MOD_DROP_HIGH'
              : 'MOD_DROP_LOW';
          tokens.push({ type, value: kdMatch[0], param: p });
          i += kdMatch[0].length;
          continue;
        }

        // Exploding & Penetrating: !p or !
        if (str.slice(i).startsWith('!p')) {
          tokens.push({ type: 'MOD_EXPLODE_PENETRATING', value: '!p' });
          i += 2;
          continue;
        }
        if (str[i] === '!') {
          tokens.push({ type: 'MOD_EXPLODE', value: '!' });
          i += 1;
          continue;
        }

        // Rerolls: ro<N>, ro<=N, r<N>
        const rerollMatch = str.slice(i).match(/^(ro|r)(<=|<|>=|>|=)?(\d+)/i);
        if (rerollMatch) {
          const isOnce = rerollMatch[1].toLowerCase() === 'ro';
          const op = rerollMatch[2] || '<=';
          const val = parseInt(rerollMatch[3], 10);
          tokens.push({
            type: isOnce ? 'MOD_REROLL_ONCE' : 'MOD_REROLL',
            value: rerollMatch[0],
            param: val,
            operator: op,
          });
          i += rerollMatch[0].length;
          continue;
        }

        // Target Successes: cs>=N, cs>N, cs=N
        const csMatch = str.slice(i).match(/^cs(>=|>|<=|<|=)(\d+)/i);
        if (csMatch) {
          tokens.push({
            type: 'MOD_COUNT_SUCCESS',
            value: csMatch[0],
            operator: csMatch[1],
            param: parseInt(csMatch[2], 10),
          });
          i += csMatch[0].length;
          continue;
        }

        break;
      }
      continue;
    }

    // Plain Number
    const numMatch = str.slice(i).match(/^(\d+(\.\d+)?)/);
    if (numMatch) {
      tokens.push({ type: 'NUMBER', value: numMatch[0] });
      i += numMatch[0].length;
      continue;
    }

    // Skip unknown character
    i++;
  }

  tokens.push({ type: 'EOF', value: '' });
  return tokens;
}

/**
 * Executes evaluation of dice rolls according to tokenized modifiers.
 */
export function evaluateDiceGroup(
  count: number,
  sides: number,
  modifiers: Token[],
  rng: () => number = Math.random
): { rolls: DieRoll[]; subtotal: number; isSuccessCount: boolean } {
  let rolls: DieRoll[] = [];

  // Exploding logic
  const isExploding = modifiers.some((m) => m.type === 'MOD_EXPLODE');
  const isPenetrating = modifiers.some((m) => m.type === 'MOD_EXPLODE_PENETRATING');
  const rerollOnce = modifiers.find((m) => m.type === 'MOD_REROLL_ONCE');
  const countSuccessMod = modifiers.find((m) => m.type === 'MOD_COUNT_SUCCESS');

  for (let c = 0; c < count; c++) {
    let rollVal = Math.floor(rng() * sides) + 1;

    // Reroll once check
    if (rerollOnce) {
      const threshold = rerollOnce.param ?? 1;
      const op = rerollOnce.operator ?? '<=';
      const shouldReroll =
        op === '<='
          ? rollVal <= threshold
          : op === '<'
          ? rollVal < threshold
          : rollVal === threshold;
      if (shouldReroll) {
        rolls.push({ value: rollVal, sides, isKept: false, isRerolled: true });
        rollVal = Math.floor(rng() * sides) + 1;
      }
    }

    rolls.push({ value: rollVal, sides, isKept: true });

    // Explode chain
    let currentVal = rollVal;
    let chainCount = 0;
    while ((isExploding || isPenetrating) && currentVal === sides && chainCount < 10) {
      chainCount++;
      let extra = Math.floor(rng() * sides) + 1;
      currentVal = extra;
      if (isPenetrating) {
        extra = Math.max(1, extra - 1);
      }
      rolls.push({ value: extra, sides, isKept: true, isExploded: true });
    }
  }

  // Keep / Drop logic
  const keepHigh = modifiers.find((m) => m.type === 'MOD_KEEP_HIGH');
  const keepLow = modifiers.find((m) => m.type === 'MOD_KEEP_LOW');
  const dropHigh = modifiers.find((m) => m.type === 'MOD_DROP_HIGH');
  const dropLow = modifiers.find((m) => m.type === 'MOD_DROP_LOW');

  if (keepHigh) {
    const k = keepHigh.param ?? 1;
    const sortedIndices = rolls
      .map((r, idx) => ({ ...r, originalIdx: idx }))
      .filter((r) => !r.isRerolled)
      .sort((a, b) => b.value - a.value)
      .map((r) => r.originalIdx);

    const keptSet = new Set(sortedIndices.slice(0, k));
    rolls.forEach((r, idx) => {
      if (!r.isRerolled) r.isKept = keptSet.has(idx);
    });
  } else if (keepLow) {
    const k = keepLow.param ?? 1;
    const sortedIndices = rolls
      .map((r, idx) => ({ ...r, originalIdx: idx }))
      .filter((r) => !r.isRerolled)
      .sort((a, b) => a.value - b.value)
      .map((r) => r.originalIdx);

    const keptSet = new Set(sortedIndices.slice(0, k));
    rolls.forEach((r, idx) => {
      if (!r.isRerolled) r.isKept = keptSet.has(idx);
    });
  } else if (dropLow) {
    const d = dropLow.param ?? 1;
    const sortedIndices = rolls
      .map((r, idx) => ({ ...r, originalIdx: idx }))
      .filter((r) => !r.isRerolled)
      .sort((a, b) => a.value - b.value)
      .map((r) => r.originalIdx);

    const droppedSet = new Set(sortedIndices.slice(0, d));
    rolls.forEach((r, idx) => {
      if (!r.isRerolled) r.isKept = !droppedSet.has(idx);
    });
  } else if (dropHigh) {
    const d = dropHigh.param ?? 1;
    const sortedIndices = rolls
      .map((r, idx) => ({ ...r, originalIdx: idx }))
      .filter((r) => !r.isRerolled)
      .sort((a, b) => b.value - a.value)
      .map((r) => r.originalIdx);

    const droppedSet = new Set(sortedIndices.slice(0, d));
    rolls.forEach((r, idx) => {
      if (!r.isRerolled) r.isKept = !droppedSet.has(idx);
    });
  }

  // Count Successes or Sum
  if (countSuccessMod) {
    const targetVal = countSuccessMod.param ?? 1;
    const op = countSuccessMod.operator ?? '>=';
    let successes = 0;

    for (const r of rolls) {
      if (!r.isKept) continue;
      const isSuccess =
        op === '>='
          ? r.value >= targetVal
          : op === '>'
          ? r.value > targetVal
          : op === '<='
          ? r.value <= targetVal
          : op === '<'
          ? r.value < targetVal
          : r.value === targetVal;
      r.isSuccess = isSuccess;
      if (isSuccess) successes++;
    }

    return { rolls, subtotal: successes, isSuccessCount: true };
  }

  const subtotal = rolls
    .filter((r) => r.isKept)
    .reduce((sum, r) => sum + r.value, 0);

  return { rolls, subtotal, isSuccessCount: false };
}

/**
 * Top-level recursive descent evaluator for dice formulas.
 * Evaluates binary expressions (+, -, *, /) and nested dice.
 */
export function parseAndEvaluateDice(
  formula: string,
  rng: () => number = Math.random
): ParsedRollResult {
  const tokens = tokenizeDiceFormula(formula);
  let tokenIdx = 0;
  const steps: RollStepBreakdown[] = [];

  function currentToken(): Token {
    return tokens[tokenIdx] || { type: 'EOF', value: '' };
  }

  function consume(expected?: TokenType): Token {
    const t = currentToken();
    if (expected && t.type !== expected) {
      throw new Error(`Unexpected token ${t.type}, expected ${expected}`);
    }
    tokenIdx++;
    return t;
  }

  // Primary expression parser (handles numbers, dice, parentheses)
  function parsePrimary(): number {
    const t = currentToken();

    if (t.type === 'NUMBER') {
      consume('NUMBER');
      return parseFloat(t.value);
    }

    if (t.type === 'LPAREN') {
      consume('LPAREN');
      const val = parseAddSub();
      consume('RPAREN');
      return val;
    }

    if (t.type === 'DICE') {
      const diceTok = consume('DICE');
      const count = diceTok.count || 1;
      const sides = diceTok.sides || 20;

      // Gather attached modifiers
      const mods: Token[] = [];
      while (
        currentToken().type.startsWith('MOD_')
      ) {
        mods.push(consume());
      }

      const evalResult = evaluateDiceGroup(count, sides, mods, rng);

      // Create breakdown string
      const diceStr = evalResult.rolls
        .map((r) => {
          if (r.isRerolled) return `${r.value}(rerolled)`;
          if (!r.isKept) return `${r.value}(dropped)`;
          if (r.isExploded) return `${r.value}!`;
          return `${r.value}`;
        })
        .join(', ');

      const exprLabel = `${diceTok.value}${mods.map((m) => m.value).join('')}`;
      steps.push({
        expression: exprLabel,
        rolls: evalResult.rolls,
        subtotal: evalResult.subtotal,
      });

      return evalResult.subtotal;
    }

    if (t.type === 'MINUS') {
      consume('MINUS');
      return -parsePrimary();
    }

    return 0;
  }

  // Multiplicative (*, /)
  function parseMulDiv(): number {
    let left = parsePrimary();
    while (currentToken().type === 'MULTIPLY' || currentToken().type === 'DIVIDE') {
      const op = consume().type;
      const right = parsePrimary();
      left = op === 'MULTIPLY' ? left * right : right !== 0 ? Math.floor(left / right) : 0;
    }
    return left;
  }

  // Additive (+, -)
  function parseAddSub(): number {
    let left = parseMulDiv();
    while (currentToken().type === 'PLUS' || currentToken().type === 'MINUS') {
      const op = consume().type;
      const right = parseMulDiv();
      left = op === 'PLUS' ? left + right : left - right;
    }
    return left;
  }

  const total = Math.floor(parseAddSub());

  // Check critical (natural 20 on single d20)
  const isCritical =
    steps.length === 1 &&
    steps[0].rolls.length === 1 &&
    steps[0].rolls[0].sides === 20 &&
    steps[0].rolls[0].value === 20;

  // Check fumble (natural 1 on single d20)
  const isFumble =
    steps.length === 1 &&
    steps[0].rolls.length === 1 &&
    steps[0].rolls[0].sides === 20 &&
    steps[0].rolls[0].value === 1;

  // Assemble human-readable breakdown
  const breakdownParts = steps.map((s) => {
    const rollVals = s.rolls
      .map((r) => (r.isKept ? `${r.value}` : `~~${r.value}~~`))
      .join('+');
    return `[${s.expression}: ${rollVals}]`;
  });

  const parsedResult: ParsedRollResult = {
    total,
    expression: formula,
    breakdown: breakdownParts.join(' ') || `${total}`,
    steps,
    isCritical,
    isFumble,
  };

  notifyDiceRollEvaluated(parsedResult);

  return parsedResult;
}
