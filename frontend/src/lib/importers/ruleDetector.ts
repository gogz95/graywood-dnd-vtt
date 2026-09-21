// src/lib/importers/ruleDetector.ts
// Heuristic Rule Detection Scanner for Ingested Documents

export interface RuleDetectionResult {
  ruleId: string;
  ruleName: string;
  category: 'combat' | 'equipment' | 'calendar' | 'roster';
  matchedKeywords: string[];
  snippet: string;
  matchCount: number;
  confidence: number;
}

interface RulePatternDef {
  ruleId: string;
  ruleName: string;
  category: 'combat' | 'equipment' | 'calendar' | 'roster';
  patterns: RegExp[];
  threshold: number;
}

const RULE_PATTERNS: RulePatternDef[] = [
  {
    ruleId: 'enableDurabilitySystem',
    ruleName: 'Resistance Points & Equipment Sunder',
    category: 'equipment',
    patterns: [
      /\bresistance points?\b/i,
      /\barmor durability\b/i,
      /\bsunder\b/i,
      /\bfractured armor\b/i,
      /\brepair dc\b/i,
      /\bitem durability\b/i
    ],
    threshold: 1
  },
  {
    ruleId: 'enableTriStatInitiative',
    ruleName: 'Tri-Stat / Mental Initiative',
    category: 'combat',
    patterns: [
      /\btri-stat initiative\b/i,
      /\bmental initiative\b/i,
      /\bwisdom initiative\b/i,
      /\bintelligence initiative\b/i
    ],
    threshold: 1
  },
  {
    ruleId: 'enableCustomCalendars',
    ruleName: 'Fantasy & Decade Calendars',
    category: 'calendar',
    patterns: [
      /\b10-day decade\b/i,
      /\bdecade calendar\b/i,
      /\bten-day cycle\b/i,
      /\b10-day cycle\b/i,
      /\b10d decade\b/i
    ],
    threshold: 1
  },
  {
    ruleId: 'enableBlackOrbRoster',
    ruleName: 'Temporal Black Orb Roster',
    category: 'roster',
    patterns: [
      /\bblack orb\b/i,
      /\btemporal stasis roster\b/i,
      /\btemporal extraction\b/i,
      /\borb stowed\b/i
    ],
    threshold: 1
  }
];

function extractSnippet(text: string, matchIndex: number, matchLength: number, contextRadius = 75): string {
  const start = Math.max(0, matchIndex - contextRadius);
  const end = Math.min(text.length, matchIndex + matchLength + contextRadius);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return `${prefix}${text.substring(start, end).trim()}${suffix}`;
}

/**
 * Scans parsed text chunks from ingested documents to detect modular homebrew rules.
 */
export function detectHomebrewRules(chunks: string[]): RuleDetectionResult[] {
  if (!chunks || chunks.length === 0) return [];

  const results: RuleDetectionResult[] = [];

  for (const def of RULE_PATTERNS) {
    let totalMatches = 0;
    const matchedKeywordsSet = new Set<string>();
    let bestSnippet = '';

    for (const chunk of chunks) {
      if (!chunk) continue;

      for (const pat of def.patterns) {
        const regex = new RegExp(pat.source, pat.flags.includes('g') ? pat.flags : `${pat.flags}g`);
        let match: RegExpExecArray | null;

        while ((match = regex.exec(chunk)) !== null) {
          totalMatches++;
          matchedKeywordsSet.add(match[0].toLowerCase());
          if (!bestSnippet) {
            bestSnippet = extractSnippet(chunk, match.index, match[0].length);
          }
        }
      }
    }

    if (totalMatches >= def.threshold) {
      const confidence = Math.min(1.0, 0.5 + totalMatches * 0.1);
      results.push({
        ruleId: def.ruleId,
        ruleName: def.ruleName,
        category: def.category,
        matchedKeywords: Array.from(matchedKeywordsSet),
        snippet: bestSnippet || `Detected ${totalMatches} occurrences of ${def.ruleName} terminology.`,
        matchCount: totalMatches,
        confidence: Math.round(confidence * 100) / 100
      });
    }
  }

  return results.sort((a, b) => b.matchCount - a.matchCount);
}
