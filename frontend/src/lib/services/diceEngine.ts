// src/lib/services/diceEngine.ts
// Unified 5e Dice Notation Algebra & Evaluator Engine
// Supports standard dice, flats, advantage/disadvantage keep (kh/kl), exploding dice (!),
// parentheses, and operator precedence (+, -, *, /) with structured arithmetic breakdowns.

export interface ExplicitTerm {
  label: string;
  value: number;
}

export interface DiceRollTerm {
  type: 'dice' | 'flat';
  label: string;
  dieSides?: number;
  diceResults?: number[];
  rolls?: number[];
  kept?: number[];
  dropped?: number[];
  modifier?: number;
  value: number;
}

export interface DiceEvaluationResult {
  formula: string;
  rawFormula: string;
  total: number;
  terms: DiceRollTerm[];
  isCrit: boolean;
  isFumble: boolean;
  isCritical: boolean;
  formattedBreakdown: string;
}

type TokenType = 'DICE' | 'NUMBER' | 'PLUS' | 'MINUS' | 'STAR' | 'SLASH' | 'LPAREN' | 'RPAREN' | 'EOF';

interface Token {
  type: TokenType;
  value: string;
  count?: number;
  sides?: number;
  exploding?: boolean;
  keepMode?: 'kh' | 'kl' | 'k' | 'dh' | 'dl';
  keepCount?: number;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = input.trim();

  while (i < s.length) {
    const ch = s[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (ch === '+') {
      tokens.push({ type: 'PLUS', value: '+' });
      i++;
      continue;
    }
    if (ch === '-') {
      tokens.push({ type: 'MINUS', value: '-' });
      i++;
      continue;
    }
    if (ch === '*') {
      tokens.push({ type: 'STAR', value: '*' });
      i++;
      continue;
    }
    if (ch === '/') {
      tokens.push({ type: 'SLASH', value: '/' });
      i++;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'LPAREN', value: '(' });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'RPAREN', value: ')' });
      i++;
      continue;
    }

    // Match dice expression e.g. 2d20kh1, 1d6!, 4d6kh3, d20
    const rest = s.slice(i);
    const diceMatch = rest.match(/^(\d*)d(\d+)(!)?((?:kh|kl|k|dh|dl)\d+)?/i);
    if (diceMatch) {
      const count = diceMatch[1] ? Math.max(1, parseInt(diceMatch[1], 10)) : 1;
      const sides = Math.max(1, parseInt(diceMatch[2], 10));
      const exploding = Boolean(diceMatch[3]);
      let keepMode: 'kh' | 'kl' | 'k' | 'dh' | 'dl' | undefined;
      let keepCount: number | undefined;

      if (diceMatch[4]) {
        const km = diceMatch[4].toLowerCase().match(/^(kh|kl|k|dh|dl)(\d+)$/);
        if (km) {
          keepMode = km[1] as any;
          keepCount = parseInt(km[2], 10);
        }
      }

      tokens.push({
        type: 'DICE',
        value: diceMatch[0],
        count,
        sides,
        exploding,
        keepMode,
        keepCount
      });
      i += diceMatch[0].length;
      continue;
    }

    // Match flat number
    const numMatch = rest.match(/^\d+(?:\.\d+)?/);
    if (numMatch) {
      tokens.push({
        type: 'NUMBER',
        value: numMatch[0]
      });
      i += numMatch[0].length;
      continue;
    }

    // Skip unrecognized single char
    i++;
  }

  tokens.push({ type: 'EOF', value: '' });
  return tokens;
}

interface ParsedNode {
  value: number;
  formatted: string;
}

class DiceParser {
  private tokens: Token[];
  private pos = 0;
  private explicitTerms: ExplicitTerm[];
  private explicitIndex = 0;
  public terms: DiceRollTerm[] = [];
  public hasCrit = false;
  public hasFumble = false;

  constructor(tokens: Token[], explicitTerms: ExplicitTerm[] = []) {
    this.tokens = tokens;
    this.explicitTerms = explicitTerms;
  }

  private current(): Token {
    return this.tokens[this.pos] || { type: 'EOF', value: '' };
  }

  private consume(): Token {
    const tok = this.current();
    this.pos++;
    return tok;
  }

  public parse(): ParsedNode {
    if (this.current().type === 'EOF') {
      // Fallback for empty formula: roll 1d20
      return this.rollDiceToken({
        type: 'DICE',
        value: '1d20',
        count: 1,
        sides: 20
      });
    }

    const result = this.parseExpression();
    return result;
  }

  private parseExpression(): ParsedNode {
    let left = this.parseTerm();

    while (this.current().type === 'PLUS' || this.current().type === 'MINUS') {
      const op = this.consume().type;
      const termsBefore = this.terms.length;
      const right = this.parseTerm();

      if (op === 'PLUS') {
        left = {
          value: left.value + right.value,
          formatted: `${left.formatted} + ${right.formatted}`
        };
      } else {
        // Negate any flat terms added during right operand evaluation
        for (let idx = termsBefore; idx < this.terms.length; idx++) {
          if (this.terms[idx].type === 'flat') {
            this.terms[idx].modifier = -(this.terms[idx].modifier !== undefined ? this.terms[idx].modifier! : this.terms[idx].value);
            this.terms[idx].value = -Math.abs(this.terms[idx].value);
            if (this.terms[idx].label && !this.terms[idx].label.startsWith('-') && !this.explicitTerms.some(e => e.label === this.terms[idx].label)) {
              this.terms[idx].label = `-${Math.abs(this.terms[idx].value)}`;
            }
          }
        }
        left = {
          value: left.value - right.value,
          formatted: `${left.formatted} - ${right.formatted}`
        };
      }
    }

    return left;
  }

  private parseTerm(): ParsedNode {
    let left = this.parseFactor(true);

    while (this.current().type === 'STAR' || this.current().type === 'SLASH') {
      const op = this.consume().type;
      const right = this.parseFactor(false); // Scalar multiplier/divisor is not a flat additive term

      if (op === 'STAR') {
        left = {
          value: left.value * right.value,
          formatted: `${left.formatted} * ${right.formatted}`
        };
      } else {
        const divisor = right.value === 0 ? 1 : right.value;
        left = {
          value: Math.floor(left.value / divisor),
          formatted: `${left.formatted} / ${right.formatted}`
        };
      }
    }

    return left;
  }

  private parseFactor(isAdditive = true): ParsedNode {
    const tok = this.current();

    if (tok.type === 'PLUS') {
      this.consume();
      return this.parseFactor(isAdditive);
    }

    if (tok.type === 'MINUS') {
      this.consume();
      const next = this.current();
      if (next.type === 'NUMBER') {
        // Negate flat number immediately
        this.consume();
        const rawVal = parseFloat(next.value);
        const modVal = -rawVal;
        const explicit = isAdditive ? this.explicitTerms[this.explicitIndex++] : undefined;
        const label = explicit ? explicit.label : `${modVal}`;
        const labelFormatted = explicit && !explicit.label.includes(Math.abs(rawVal).toString())
          ? `${rawVal} (${explicit.label})`
          : `${rawVal}`;

        if (isAdditive) {
          this.terms.push({
            type: 'flat',
            label,
            modifier: modVal,
            value: modVal
          });
        }

        return {
          value: modVal,
          formatted: `${rawVal}${explicit ? ` (${explicit.label})` : ''}`
        };
      }

      const child = this.parseFactor(isAdditive);
      return {
        value: -child.value,
        formatted: `-${child.formatted}`
      };
    }

    if (tok.type === 'LPAREN') {
      this.consume();
      const inner = this.parseExpression();
      if (this.current().type === 'RPAREN') {
        this.consume();
      }
      return {
        value: inner.value,
        formatted: `(${inner.formatted})`
      };
    }

    if (tok.type === 'DICE') {
      this.consume();
      return this.rollDiceToken(tok);
    }

    if (tok.type === 'NUMBER') {
      this.consume();
      const rawVal = parseFloat(tok.value);
      const explicit = isAdditive ? this.explicitTerms[this.explicitIndex++] : undefined;
      const label = explicit ? explicit.label : `+${rawVal}`;
      const labelFormatted = explicit && !explicit.label.includes(rawVal.toString())
        ? `${rawVal} (${explicit.label})`
        : `${rawVal}`;

      if (isAdditive) {
        this.terms.push({
          type: 'flat',
          label,
          modifier: rawVal,
          value: rawVal
        });
      }

      return {
        value: rawVal,
        formatted: labelFormatted
      };
    }

    // Fallback if unexpected token
    this.consume();
    return { value: 0, formatted: '0' };
  }

  private rollDiceToken(tok: Token): ParsedNode {
    const count = Math.min(100, Math.max(1, tok.count || 1));
    const sides = Math.min(1000, Math.max(1, tok.sides || 20));
    const isExploding = Boolean(tok.exploding);

    const allRolls: number[] = [];
    const rollObjects: Array<{ val: number; originalIndex: number }> = [];

    for (let c = 0; c < count; c++) {
      let r = Math.floor(Math.random() * sides) + 1;
      allRolls.push(r);
      rollObjects.push({ val: r, originalIndex: allRolls.length - 1 });

      if (isExploding && sides > 1) {
        let explosions = 0;
        while (r === sides && explosions < 50) {
          explosions++;
          r = Math.floor(Math.random() * sides) + 1;
          allRolls.push(r);
          rollObjects.push({ val: r, originalIndex: allRolls.length - 1 });
        }
      }
    }

    // Determine kept vs dropped
    let keptIndices = new Set<number>();

    if (tok.keepMode && tok.keepCount !== undefined) {
      const kCount = Math.max(1, Math.min(rollObjects.length, tok.keepCount));
      const sorted = [...rollObjects];

      if (tok.keepMode === 'kh' || tok.keepMode === 'k') {
        sorted.sort((a, b) => b.val - a.val);
        for (let i = 0; i < kCount; i++) {
          keptIndices.add(sorted[i].originalIndex);
        }
      } else if (tok.keepMode === 'kl') {
        sorted.sort((a, b) => a.val - b.val);
        for (let i = 0; i < kCount; i++) {
          keptIndices.add(sorted[i].originalIndex);
        }
      } else if (tok.keepMode === 'dh') {
        sorted.sort((a, b) => b.val - a.val);
        const dropSet = new Set(sorted.slice(0, kCount).map(x => x.originalIndex));
        for (const obj of rollObjects) {
          if (!dropSet.has(obj.originalIndex)) keptIndices.add(obj.originalIndex);
        }
      } else if (tok.keepMode === 'dl') {
        sorted.sort((a, b) => a.val - b.val);
        const dropSet = new Set(sorted.slice(0, kCount).map(x => x.originalIndex));
        for (const obj of rollObjects) {
          if (!dropSet.has(obj.originalIndex)) keptIndices.add(obj.originalIndex);
        }
      }
    } else {
      // Keep all
      for (const obj of rollObjects) {
        keptIndices.add(obj.originalIndex);
      }
    }

    const keptRolls: number[] = [];
    const droppedRolls: number[] = [];

    for (let i = 0; i < allRolls.length; i++) {
      if (keptIndices.has(i)) {
        keptRolls.push(allRolls[i]);
      } else {
        droppedRolls.push(allRolls[i]);
      }
    }

    const subtotal = keptRolls.reduce((sum, r) => sum + r, 0);

    // 5e SRD Critical hit & fumble evaluation for d20
    if (sides === 20 && keptRolls.length > 0) {
      if (keptRolls.some(r => r === 20)) {
        this.hasCrit = true;
      }
      if (keptRolls.every(r => r === 1)) {
        this.hasFumble = true;
      }
    }

    const diceTerm: DiceRollTerm = {
      type: 'dice',
      label: tok.value,
      dieSides: sides,
      diceResults: allRolls,
      rolls: allRolls,
      kept: keptRolls,
      dropped: droppedRolls,
      value: subtotal
    };
    this.terms.push(diceTerm);

    // Format individual dice term e.g. "1d20 (14)", "2d20kh1 (18, [7 dropped])"
    let formattedDice = '';
    if (droppedRolls.length > 0) {
      formattedDice = `${tok.value} (${keptRolls.join(', ')}, [${droppedRolls.join(', ')} dropped])`;
    } else {
      formattedDice = `${tok.value} (${allRolls.join(', ')})`;
    }

    return {
      value: subtotal,
      formatted: formattedDice
    };
  }
}

/**
 * Universal 5e Dice Evaluator
 * Evaluates any valid 5e arithmetic dice formula and returns a structured breakdown.
 */
export function evaluateDice(
  formula: string,
  explicitTerms?: ExplicitTerm[]
): DiceEvaluationResult {
  const clean = formula.trim() || '1d20';
  const tokens = tokenize(clean);
  const parser = new DiceParser(tokens, explicitTerms || []);
  const parsed = parser.parse();

  // If no terms were registered, insert fallback
  if (parser.terms.length === 0) {
    const r = Math.floor(Math.random() * 20) + 1;
    parser.terms.push({
      type: 'dice',
      label: '1d20',
      dieSides: 20,
      diceResults: [r],
      rolls: [r],
      kept: [r],
      dropped: [],
      value: r
    });
    parsed.value = r;
    parsed.formatted = `1d20 (${r})`;
    if (r === 20) parser.hasCrit = true;
    if (r === 1) parser.hasFumble = true;
  }

  const formattedBreakdown = `[${parsed.formatted}] = ${parsed.value}`;

  return {
    formula: clean,
    rawFormula: clean,
    total: parsed.value,
    terms: parser.terms,
    isCrit: parser.hasCrit,
    isFumble: parser.hasFumble,
    isCritical: parser.hasCrit,
    formattedBreakdown
  };
}

/**
 * Backwards-compatible parser for simple formulas and services
 */
export function parseDiceFormula(formula: string): { rolls: number[]; modifier: number; total: number } | null {
  try {
    const result = evaluateDice(formula);
    if (!result || result.terms.length === 0) return null;

    const rolls = result.terms
      .filter(t => t.type === 'dice')
      .flatMap(t => t.diceResults || []);

    const modifier = result.terms
      .filter(t => t.type === 'flat')
      .reduce((acc, t) => acc + (t.modifier !== undefined ? t.modifier : t.value), 0);

    return { rolls, modifier, total: result.total };
  } catch {
    return null;
  }
}
