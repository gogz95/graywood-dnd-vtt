# Dual-Engine Source Ingestion Specification

Graywood VTT features a hybrid sourcebook ingestion pipeline designed to balance zero-cost offline determinism with adaptive LLM extraction for complex or non-standard tabletop publications.

---

## 1. Engine Architectures

```
                           Raw Document Text / PDF Stream
                                         │
                   ┌─────────────────────┴─────────────────────┐
                   ▼                                           ▼
      [ Mode A: Deterministic Engine ]           [ Mode B: Local AI Engine ]
      • Instant regex heuristics                 • Contextual sliding-window
      • Zero network / token cost                • Structured JSON extraction
      • Pure GFM pipe table parser               • Ollama / OpenAI-compatible
                   │                                           │
                   │                             (Unreachable / Error)
                   │                                           ▼
                   │                                ┌──────────────────────┐
                   │                                │ Auto-Fallback Probe  │
                   │                                └──────────┬───────────┘
                   │                                           │
                   └───────────────────┬───────────────────────┘
                                       ▼
                       Canonical IngestResult Schema
                       { monsters, spells, items, tables }
                                       │
                                       ▼
                         Dexie Transaction & Reactive Sync
```

### Mode A: Deterministic Offline Parsing
- **Statblock Anchors**: Evaluates standard 5e entity structures via regex heuristics matching statblock anchors:
  - Armor Class (`Armor Class\s+(\d+)`)
  - Hit Points (`Hit Points\s+(\d+)(?:\s*\(([^)]+)\))?`)
  - Ability Scores (`STR|DEX|CON|INT|WIS|CHA` tabular matrices)
  - Speed, Challenge Rating (`Challenge\s+([0-9/]+)`), and `Actions`/`Bonus Actions` section headers.
- **GFM Pipe Table Boundary Parsing**:
  - Regex pattern: `/((?:^[ \t]*\|[^\n]+\|[ \t]*(?:\n|$))+)/gm`
  - Isolates header row, validates alignment separator row (`:---:`), and splits body rows cleanly.
  - Automatically identifies preceding headers/titles within a 200-character window and extracts dice formulas (`d4`, `d6`, `d8`, `d10`, `d12`, `d20`, `d100`).

### Mode B: Local AI / Ollama Parsing
- **Inference Target**: Local Ollama server (`http://127.0.0.1:11434`) using quantized instruction models (default `qwen2.5:7b`).
- **Structured Schema Generation**:
  Enforces zero-hallucination structured output using Ollama's `format: 'json'` and temperature `0.1`:
  ```json
  {
    "monsters": [],
    "spells": [],
    "items": [],
    "tables": [
      {
        "name": "Table Name",
        "category": "Random Encounter / Loot / etc",
        "headers": ["d20", "Result"],
        "rows": [["1", "Result A"], ["2", "Result B"]],
        "diceFormula": "d20"
      }
    ]
  }
  ```
- **Sliding Window Chunking**: Large sourcebooks are split into window chunks with overlap to prevent truncation across multi-page statblocks and table boundaries.

---

## 2. Graceful Auto-Fallback Lifecycle

When configured to `mode: 'auto'` or `mode: 'llm'`, the pipeline handles network interruptions and inactive local models transparently:

1. The service issues an initial `POST` to `${ollamaUrl}/api/generate`.
2. If the connection fails, times out, or produces unparseable output:
   - The catch block intercepts the failure without surfacing blocking UI errors.
   - The pipeline immediately routes the source text into `parseDeterministic(rawText, sourceName)`.
3. Valid entities and GFM tables are parsed deterministically, ensuring the Game Master never loses import functionality while offline.
