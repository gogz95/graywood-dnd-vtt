# OPERATIONAL DIRECTIVE: STRICT TOKEN ECONOMY, DIRECT OUTPUT & SURGICAL EXECUTION

### COMMUNICATION & CONTEXT CONSERVATION
- ZERO FILLER: Never output conversational filler, greetings, pleasantries, or closing remarks. Start sentence 1 directly with the requested deliverable.
- CODE-ONLY DELIVERABLES: When a code block or diff is requested, output ONLY the code block. No preceding intro text or trailing outro text.
- NO ECHOING: Do not repeat, summarize, or paraphrase user prompts or existing context. Proceed directly to generation.
- NO SELF-NARRATION: Do not output meta-commentary, planning journals, or progress updates (e.g., "I will now edit file X", "Next I am going to..."). Execute tool calls silently and state only the final deliverable.
- NO INTERMEDIATE ARTIFACTS: Do not create or write planning files, walkthrough logs, or progress scratchpads (e.g., `implementation_plan.md`, `walkthrough.md`) unless explicitly commanded.
- STRUCTURED & CONCISE: Default to concise bullet points, markdown tables, or direct code blocks. Avoid conversational prose unless explicitly requested.
- SCOPE LIMIT: Unless instructed to write narrative lore, restrict descriptive explanations to 2–3 sentences maximum.
- SEPARATION: Keep narrative flavor completely separate from 5e mechanics (DCs, damage types, math).
- INGESTION STUB: If provided with reference code, documents, or data dumps without a specific task, reply ONLY with: "Acknowledged." Do not summarize or critique until directed.

### CODE MODIFICATION & TOOL EFFICIENCY
- SURGICAL EDITS ONLY: When modifying existing files, never regenerate or rewrite the full file. Output only pinpoint string replacements (`oldStr` -> `newStr`) or isolated function swaps. Full-file generation is strictly forbidden unless creating an entirely new module.
- NO COLLATERAL CLEANUP: Touch ONLY the exact lines required for the task. Never reformat whitespace, reorder imports, or "clean up" adjacent functions.
- ZERO EXPLORATORY TRAVERSAL: Never execute open-ended workspace explorations (`list_dir`, broad file searches, or sequential 50–100 line chunk reads). Confine tool calls strictly to explicitly targeted file paths and symbols.
- TARGETED INSPECTION LIMIT: If an unread file must be inspected, target the precise line range in a single call. Never inspect the same file more than twice in a single task turn.
- NO UNSOLICITED TEST CREATION: Never author new test suites, test specs, or mock fixtures unless explicitly requested in the task prompt.
- PACKAGE INSTALL LOCK: Never run package manager commands (`npm install`, `pnpm add`, etc.) without explicit instruction. Assume all necessary packages exist or use lightweight native/in-line implementations.
- SILENT COMPILATION & DIAGNOSTICS: Suppress verbose stdout/stderr and passing test logs (`npm run check`, `npm test`, `vitest`). Return ONLY actionable compile errors or the single-line success summary.
- DIAGNOSTIC CIRCUIT BREAKER: If a build fails, patch ONLY the direct blocking errors. Never spend turns investigating non-fatal warnings, lint styling hints, or deprecation notices.
- COMPILATION ERROR AUTO-FIX: If a check/build command fails, output the surgical fix immediately in the next turn without asking for confirmation.
- NO MOCK DATA BLOAT: Never generate large dummy datasets (e.g., mock compendium catalogs, lists of 20 spells/monsters). Use minimal 1-item test fixtures.
- ATOMIC BATCHING: Implement tightly coupled units (type definitions, stores, consuming components, and export wiring) in a single execution pass rather than fragmenting across multiple turns.

### ARCHITECTURE & RULES BASELINE
- SVELTE 5 RUNES EXCLUSIVELY: Use `$state`, `$derived`, `$props`, and `$effect`. Never generate legacy Svelte 4 syntax (`$:`, writable store subscriptions, `export let`).
- SVELTE 5 RUNES MUTABILITY: Mutate `$state` runes directly (e.g., `state.count++`, `state.items.push(newItem)`) or via clean reassignment. Never use legacy Svelte 3/4 store methods (`set`, `update`) on rune-backed states.
- STRICT 5E SRD BASELINE: When creating or modifying mechanics, entities, or statblocks, strictly output pure 5e SRD 5.1 baselines. Never inject modular, campaign-specific, or homebrew attributes unless explicitly directed.