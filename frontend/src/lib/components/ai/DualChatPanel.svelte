<script lang="ts">
  // DualChatPanel.svelte — Decoupled, concurrent dual AI chat subsystems:
  // Panel 1: Rules Archivist (strict SRD referee, low temp, rules RAG, offline fallback)
  // Panel 2: Live DM Co-Pilot (creative improv assistant, higher temp, narrative RAG, prompt chips)

  import { onMount } from 'svelte';

  interface ChatMessage {
    id: string;
    sender: 'user' | 'assistant';
    text: string;
    timestamp: number;
    citations?: string[];
    isLoading?: boolean;
  }

  interface RAGChunk {
    id: string;
    fileName: string;
    text: string;
    tags: string[];
  }

  type ViewMode = 'dual' | 'archivist' | 'copilot';

  // ── Storage Keys ────────────────────────────────────────────────────────────
  const K_ARCHIVIST_CHAT  = 'vtt_archivist_chat';
  const K_ARCHIVIST_KB    = 'vtt_archivist_kb';
  const K_ARCHIVIST_MODEL = 'vtt_archivist_model';
  const K_ARCHIVIST_TEMP  = 'vtt_archivist_temp';

  const K_COPILOT_CHAT    = 'vtt_copilot_chat';
  const K_COPILOT_KB      = 'vtt_copilot_kb';
  const K_COPILOT_MODEL   = 'vtt_copilot_model';
  const K_COPILOT_TEMP    = 'vtt_copilot_temp';

  // ── View Mode State ─────────────────────────────────────────────────────────
  let viewMode = $state<ViewMode>('dual');

  // ═══════════════════════════════════════════════════════════════════════════
  // PANEL 1: RULES ARCHIVIST STATE & LOGIC
  // ═══════════════════════════════════════════════════════════════════════════
  let archivistInput       = $state('');
  let archivistGenerating  = $state(false);
  let archivistAbort: AbortController | null = null;
  let archivistBottom      = $state<HTMLElement | null>(null);
  let archivistShowKb      = $state(false);
  let archivistShowConfig  = $state(false);
  let archivistModel       = $state(localStorage.getItem(K_ARCHIVIST_MODEL) ?? 'qwen2.5:7b');
  let archivistTemp        = $state(Number(localStorage.getItem(K_ARCHIVIST_TEMP) ?? '0.0'));

  let archivistMessages = $state<ChatMessage[]>((() => {
    try {
      const raw = localStorage.getItem(K_ARCHIVIST_CHAT);
      const parsed = raw ? (JSON.parse(raw) as ChatMessage[]) : [];
      if (parsed.length > 0) return parsed;
    } catch { /* empty */ }
    return [{
      id: 'arch-init',
      sender: 'assistant',
      timestamp: Date.now(),
      text: 'Rules Archivist initialized. Ask any 5e / 5.5e (2024) SRD mechanics question. Ingest rules documents in the KB tab for augmented citations.',
    }];
  })());

  let archivistKb = $state<RAGChunk[]>((() => {
    try {
      const raw = localStorage.getItem(K_ARCHIVIST_KB);
      return raw ? (JSON.parse(raw) as RAGChunk[]) : [];
    } catch { return []; }
  })());

  $effect(() => {
    localStorage.setItem(K_ARCHIVIST_CHAT, JSON.stringify(archivistMessages.filter(m => !m.isLoading).slice(-60)));
  });
  $effect(() => { localStorage.setItem(K_ARCHIVIST_KB, JSON.stringify(archivistKb)); });
  $effect(() => { localStorage.setItem(K_ARCHIVIST_MODEL, archivistModel); });
  $effect(() => { localStorage.setItem(K_ARCHIVIST_TEMP, String(archivistTemp)); });

  $effect(() => {
    if (archivistMessages.length) {
      setTimeout(() => archivistBottom?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PANEL 2: LIVE DM CO-PILOT STATE & LOGIC
  // ═══════════════════════════════════════════════════════════════════════════
  let copilotInput       = $state('');
  let copilotGenerating  = $state(false);
  let copilotAbort: AbortController | null = null;
  let copilotBottom      = $state<HTMLElement | null>(null);
  let copilotShowKb      = $state(false);
  let copilotShowConfig  = $state(false);
  let copilotModel       = $state(localStorage.getItem(K_COPILOT_MODEL) ?? 'qwen2.5:7b');
  let copilotTemp        = $state(Number(localStorage.getItem(K_COPILOT_TEMP) ?? '0.6'));

  let copilotMessages = $state<ChatMessage[]>((() => {
    try {
      const raw = localStorage.getItem(K_COPILOT_CHAT);
      const parsed = raw ? (JSON.parse(raw) as ChatMessage[]) : [];
      if (parsed.length > 0) return parsed;
    } catch { /* empty */ }
    return [{
      id: 'copilot-init',
      sender: 'assistant',
      timestamp: Date.now(),
      text: 'Live DM Co-Pilot online. Ready for on-the-fly room descriptions, NPC improvisations, combat twists, and sensory worldbuilding.',
    }];
  })());

  let copilotKb = $state<RAGChunk[]>((() => {
    try {
      const raw = localStorage.getItem(K_COPILOT_KB);
      return raw ? (JSON.parse(raw) as RAGChunk[]) : [];
    } catch { return []; }
  })());

  $effect(() => {
    localStorage.setItem(K_COPILOT_CHAT, JSON.stringify(copilotMessages.filter(m => !m.isLoading).slice(-60)));
  });
  $effect(() => { localStorage.setItem(K_COPILOT_KB, JSON.stringify(copilotKb)); });
  $effect(() => { localStorage.setItem(K_COPILOT_MODEL, copilotModel); });
  $effect(() => { localStorage.setItem(K_COPILOT_TEMP, String(copilotTemp)); });

  $effect(() => {
    if (copilotMessages.length) {
      setTimeout(() => copilotBottom?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  });

  // ── Shared Chunking & RAG Retrieval Helper ─────────────────────────────────
  function chunkText(text: string, maxLen = 750): string[] {
    const paragraphs = text.split(/\n{2,}/);
    const chunks: string[] = [];
    let current = '';
    for (const p of paragraphs) {
      if ((current + p).length > maxLen) {
        if (current) chunks.push(current.trim());
        current = p;
      } else {
        current += (current ? '\n\n' : '') + p;
      }
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks;
  }

  function inferTags(text: string): string[] {
    const lower = text.toLowerCase();
    const tags: string[] = [];
    if (/spell|cantrip|magic|slot|evocation|abjuration/.test(lower)) tags.push('spells');
    if (/combat|attack|initiative|action|grapple|shove/.test(lower)) tags.push('combat');
    if (/monster|beast|dragon|undead|fiend|cr|hit points/.test(lower)) tags.push('creatures');
    if (/item|weapon|armor|potion|scroll|attunement/.test(lower)) tags.push('gear');
    if (/npc|quest|rumor|tavern|dialogue|secret/.test(lower)) tags.push('narrative');
    return tags;
  }

  function scoreRag(kb: RAGChunk[], query: string): { chunk: RAGChunk; score: number }[] {
    if (kb.length === 0) return [];
    const words = query.toLowerCase().split(/\W+/).filter(w => w.length > 2);
    const scored = kb.map(chunk => {
      const lower = chunk.text.toLowerCase();
      const score = words.reduce((acc, w) => acc + (lower.split(w).length - 1), 0);
      return { chunk, score };
    });
    return scored.sort((a, b) => b.score - a.score).filter(s => s.score > 0);
  }

  // Ingest into Archivist KB
  async function handleArchivistUpload(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    if (!files) return;
    for (const file of Array.from(files)) {
      const text = await file.text();
      const chunks = chunkText(text);
      const items: RAGChunk[] = chunks.map((c, i) => ({
        id: `arch-${file.name}-${i}-${Date.now()}`,
        fileName: file.name,
        text: c,
        tags: inferTags(c),
      }));
      archivistKb = [...archivistKb, ...items];
    }
    (e.target as HTMLInputElement).value = '';
  }

  // Ingest into Co-Pilot KB
  async function handleCopilotUpload(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    if (!files) return;
    for (const file of Array.from(files)) {
      const text = await file.text();
      const chunks = chunkText(text);
      const items: RAGChunk[] = chunks.map((c, i) => ({
        id: `copilot-${file.name}-${i}-${Date.now()}`,
        fileName: file.name,
        text: c,
        tags: inferTags(c),
      }));
      copilotKb = [...copilotKb, ...items];
    }
    (e.target as HTMLInputElement).value = '';
  }

  // ── Archivist Query Dispatcher ─────────────────────────────────────────────
  async function sendArchivistQuery() {
    const raw = archivistInput.trim();
    if (!raw || archivistGenerating) return;

    const userMsg: ChatMessage = { id: `u-arch-${Date.now()}`, sender: 'user', text: raw, timestamp: Date.now() };
    const loadingMsg: ChatMessage = { id: `l-arch-${Date.now()}`, sender: 'assistant', text: 'Consulting Rules Codex…', timestamp: Date.now(), isLoading: true };

    archivistMessages = [...archivistMessages, userMsg, loadingMsg];
    archivistInput = '';
    archivistGenerating = true;

    // RAG retrieval
    const topScored = scoreRag(archivistKb, raw).slice(0, 3);
    const ragContext = topScored.map(s => `[Source: ${s.chunk.fileName}]\n${s.chunk.text}`).join('\n\n---\n\n');
    const citations = [...new Set(topScored.map(s => s.chunk.fileName))];

    const systemPrompt = `You are a strict, authoritative D&D 5e / 5.5e (2024) SRD Rules Referee.
State the exact mechanical resolution clearly, citing official actions, conditions, DCs, and dice calculations.
Be direct, precise, and completely objective. Never include unofficial homebrew.
${ragContext ? `\n\nVerified Reference Material:\n${ragContext}` : ''}\n\nQuestion:`;

    archivistAbort = new AbortController();

    try {
      const res = await fetch('http://127.0.0.1:11434/api/generate', {
        method: 'POST',
        signal: archivistAbort.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: archivistModel,
          prompt: `${systemPrompt}\n${raw}`,
          stream: false,
          options: { temperature: archivistTemp },
        }),
      });

      if (res.ok) {
        const data = await res.json() as { response: string };
        archivistMessages = [
          ...archivistMessages.filter(m => !m.isLoading),
          {
            id: `a-arch-${Date.now()}`,
            sender: 'assistant',
            text: data.response,
            timestamp: Date.now(),
            citations: citations.length > 0 ? citations : undefined,
          },
        ];
        return;
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        archivistMessages = archivistMessages.filter(m => !m.isLoading);
        return;
      }
    } finally {
      archivistGenerating = false;
      archivistAbort = null;
    }

    // Offline SRD deterministic lookup
    const fallback = getSrdOfflineAnswer(raw);
    archivistMessages = [
      ...archivistMessages.filter(m => !m.isLoading),
      {
        id: `a-arch-${Date.now()}`,
        sender: 'assistant',
        text: `[Offline Mode — Ollama unreachable]\n\n${fallback}`,
        timestamp: Date.now(),
      },
    ];
  }

  function getSrdOfflineAnswer(q: string): string {
    const l = q.toLowerCase();
    if (l.match(/grapple|unarmed/)) {
      return '**SRD 5.2 Grappling:** Replaces one attack in the Attack action. Target must make a Strength or Dexterity saving throw (DC = 8 + your Strength mod + Proficiency bonus). On failure, target has the Grappled condition (Speed 0; disadvantage on attacks against creatures other than you).';
    }
    if (l.match(/shove|push|prone/)) {
      return '**SRD 5.2 Shoving:** Replaces one attack. Target makes a Str or Dex saving throw (DC = 8 + Str mod + Prof). On failure, pushed 5 ft or knocked Prone.';
    }
    if (l.match(/cover/)) {
      return '**SRD Cover Rules:**\n- **Half Cover:** +2 bonus to AC and Dex saving throws.\n- **Three-Quarters Cover:** +5 bonus to AC and Dex saving throws.\n- **Total Cover:** Cannot be targeted directly by attacks or spells.';
    }
    if (l.match(/rest|short rest|long rest/)) {
      return '**SRD Resting:**\n- **Short Rest (1 hour):** Spend Hit Dice to regain HP (roll HD + Con mod per die).\n- **Long Rest (8 hours):** Regain all lost HP, half total HD, and reset spell slots/abilities. Max 1 long rest per 24 hours.';
    }
    if (l.match(/death save|stabiliz/)) {
      return '**SRD Death Saving Throws:** At the start of your turn with 0 HP, roll a d20 (no modifiers). 10+ is success, 9 or lower is failure. 3 successes = Stable (0 HP). 3 failures = Death. Natural 20 = Regain 1 HP immediately. Natural 1 = Counts as two failures.';
    }
    if (l.match(/exhaustion/)) {
      return '**SRD 5.5e Exhaustion:** Has 6 levels. Each level imposes a -2 penalty to D20 tests and -5 ft to speed. At level 6, the creature dies. Finishing a Long Rest reduces exhaustion by 1 level.';
    }
    return 'SRD Lookup: Standard Action types in combat include: Attack, Cast a Spell, Dash, Disengage, Dodge, Help, Hide, Ready, Search, and Use an Object. Bonus Actions and Reactions occur only when granted by a specific ability or spell.';
  }

  // ── Co-Pilot Query Dispatcher ──────────────────────────────────────────────
  async function sendCopilotQuery(promptOverride?: string) {
    const raw = promptOverride ?? copilotInput.trim();
    if (!raw || copilotGenerating) return;

    const userMsg: ChatMessage = { id: `u-copilot-${Date.now()}`, sender: 'user', text: raw, timestamp: Date.now() };
    const loadingMsg: ChatMessage = { id: `l-copilot-${Date.now()}`, sender: 'assistant', text: 'Improvising narrative hooks…', timestamp: Date.now(), isLoading: true };

    copilotMessages = [...copilotMessages, userMsg, loadingMsg];
    if (!promptOverride) copilotInput = '';
    copilotGenerating = true;

    // RAG retrieval from campaign notes
    const topScored = scoreRag(copilotKb, raw).slice(0, 3);
    const ragContext = topScored.map(s => `[Campaign Notes: ${s.chunk.fileName}]\n${s.chunk.text}`).join('\n\n---\n\n');

    const systemPrompt = `You are the Live DM Co-Pilot for an active D&D 5e/5.5e session.
You assist the Dungeon Master with real-time creative improvisation:
- Vivid sensory scene descriptions (sounds, smells, weather, atmosphere).
- NPC dialogue, quirky mannerisms, and hidden motivations.
- Unexpected combat complications, dynamic terrain shifts, and tactical enemy morale.
- Actionable, evocative ideas formatted with clean bullet points.
Keep responses snappy and focused so the DM can read them at a glance during gameplay.
${ragContext ? `\n\nCampaign Lore / World Context:\n${ragContext}` : ''}\n\nDM Prompt:`;

    copilotAbort = new AbortController();

    try {
      const res = await fetch('http://127.0.0.1:11434/api/generate', {
        method: 'POST',
        signal: copilotAbort.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: copilotModel,
          prompt: `${systemPrompt}\n${raw}`,
          stream: false,
          options: { temperature: copilotTemp },
        }),
      });

      if (res.ok) {
        const data = await res.json() as { response: string };
        copilotMessages = [
          ...copilotMessages.filter(m => !m.isLoading),
          {
            id: `a-copilot-${Date.now()}`,
            sender: 'assistant',
            text: data.response,
            timestamp: Date.now(),
          },
        ];
        return;
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        copilotMessages = copilotMessages.filter(m => !m.isLoading);
        return;
      }
    } finally {
      copilotGenerating = false;
      copilotAbort = null;
    }

    // Creative offline improv generator
    const creativeFallback = getCreativeOfflineHooks(raw);
    copilotMessages = [
      ...copilotMessages.filter(m => !m.isLoading),
      {
        id: `a-copilot-${Date.now()}`,
        sender: 'assistant',
        text: `[Offline Mode — Local AI unavailable]\n\n${creativeFallback}`,
        timestamp: Date.now(),
      },
    ];
  }

  function getCreativeOfflineHooks(prompt: string): string {
    const l = prompt.toLowerCase();
    if (l.includes('scene') || l.includes('room') || l.includes('describe')) {
      return `**Atmospheric Scene Details:**
- **Sensory:** The metallic tang of stagnant water mixes with damp cellar mold. Chilly draft extinguishes torches on a DC 12 check.
- **Visuals:** Cracked flagstones overgrown with bioluminescent lichen casting faint teal luminescence. Deep claw marks gouged into the granite lintel.
- **Audio:** Irregular dripping from the ceiling vault echoes like slow, heavy footsteps.`;
    }
    if (l.includes('npc')) {
      return `**NPC Improv Snapshot:**
- **Name/Appearance:** Sergeant Walter Finch, gaunt human with a nervous tic rubbing his notched ring.
- **Mannerism:** Speaks in urgent half-whispers, frequently glancing over his shoulder toward the door.
- **Secret Motivation:** Deeply in debt to the local smugglers; desperate for quick silver but terrified of the city magistrate.`;
    }
    if (l.includes('complication') || l.includes('twist')) {
      return `**Combat Complication:**
- **Environmental Hazard:** At the start of round 2, the rotting wooden scaffolding collapses (Dex save DC 13 or 2d6 bludgeoning and pinned).
- **Tactical Shift:** The goblin scout sounds a bronze horn; 1d4 reinforcements arrive from the northern corridor in 1 round!`;
    }
    if (l.includes('loot') || l.includes('reward')) {
      return `**Quick Discovery / Loot:**
- Pouch with 18 SP, 7 GP, and a carved horn dice set loaded on the 6.
- A silver signet ring depicting an owl clutching a key (worth 25 GP).
- Potion of Healing in a wax-sealed cobalt glass vial.`;
    }
    return `**Co-Pilot Suggestions:**
- **Immediate Threat:** A sudden sound behind the party forces a DC 14 Passive Perception check.
- **Tactical Terrain:** An oil barrel is tipped over; fire spells will ignite a 15ft square for 1d8 fire damage.
- **Dynamic Choice:** The enemy commander offers a surrender bargain if spared.`;
  }

  // Quick Action Chips for Co-Pilot
  const COPILOT_CHIPS = [
    { label: '👁️ Describe Scene', prompt: 'Describe the current room with vivid sensory details: lighting, smells, sounds, and an ominous feature.' },
    { label: '🎭 NPC Improv', prompt: 'Generate a memorable NPC with appearance, a peculiar mannerism, a spoken quote, and a hidden secret.' },
    { label: '⚡ Combat Twist', prompt: 'Give me an unexpected combat complication or terrain hazard to raise the stakes right now.' },
    { label: '⚔️ Enemy Morale', prompt: 'How do intelligent foes react when their leader falls or half their allies are slain?' },
    { label: '💰 Quick Loot', prompt: 'Roll 3 interesting non-standard trinkets and valuables found in this monster lair.' },
    { label: '🌫️ Hazard', prompt: 'Describe a dynamic dungeon trap or environmental hazard with DC and damage.' },
  ];
</script>

<!-- Outer Container -->
<div class="h-full w-full flex flex-col overflow-hidden bg-slate-950 text-slate-100 select-none">

  <!-- ═════════════════════════════════════════════════════════════════════════
       HEADER & VIEW CONTROLS
  ══════════════════════════════════════════════════════════════════════════ -->
  <header class="h-11 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-3 shrink-0 z-20">
    <div class="flex items-center gap-2">
      <span class="text-sm">🔮</span>
      <span class="font-black text-xs uppercase tracking-widest text-slate-200">AI Hub: Rules Archivist &amp; DM Co-Pilot</span>
    </div>

    <!-- View Mode Selector -->
    <div class="flex items-center rounded-lg bg-slate-950 p-0.5 border border-slate-800 text-xs">
      <button
        type="button"
        onclick={() => viewMode = 'dual'}
        class="px-2.5 py-1 rounded-md font-semibold transition-colors flex items-center gap-1
          {viewMode === 'dual' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}"
        title="Side-by-side Dual Panels"
      >
        <span>⚡ Split View</span>
      </button>

      <button
        type="button"
        onclick={() => viewMode = 'archivist'}
        class="px-2.5 py-1 rounded-md font-semibold transition-colors flex items-center gap-1
          {viewMode === 'archivist' ? 'bg-indigo-700 text-indigo-100 shadow-sm' : 'text-slate-400 hover:text-slate-200'}"
        title="Rules Archivist Solo Mode"
      >
        <span>📖 Rules Solo</span>
      </button>

      <button
        type="button"
        onclick={() => viewMode = 'copilot'}
        class="px-2.5 py-1 rounded-md font-semibold transition-colors flex items-center gap-1
          {viewMode === 'copilot' ? 'bg-amber-600 text-slate-950 font-bold shadow-sm' : 'text-slate-400 hover:text-slate-200'}"
        title="DM Co-Pilot Solo Mode"
      >
        <span>🎭 Co-Pilot Solo</span>
      </button>
    </div>
  </header>

  <!-- ═════════════════════════════════════════════════════════════════════════
       MAIN DUAL WORKSPACE
  ══════════════════════════════════════════════════════════════════════════ -->
  <div class="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-slate-800">

    <!-- ═══════════════════════════════════════════════════════════════════════
         PANEL 1: RULES ARCHIVIST (Strict SRD Mechanics)
    ════════════════════════════════════════════════════════════════════════════ -->
    {#if viewMode === 'dual' || viewMode === 'archivist'}
      <div class="flex-1 flex flex-col min-w-0 min-h-0 bg-slate-900/40 relative">

        <!-- Panel 1 Subheader -->
        <div class="h-9 bg-slate-900 border-b border-slate-800 px-3 flex items-center justify-between shrink-0">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-indigo-500 shadow-sm shadow-indigo-500/50"></span>
            <span class="text-xs font-bold text-indigo-300 uppercase tracking-wider">Rules Archivist</span>
            <span class="text-[10px] px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-400 border border-indigo-800/40 font-mono">SRD 5e/5.5e</span>
          </div>

          <div class="flex items-center gap-1 text-xs">
            <button
              type="button"
              onclick={() => archivistShowKb = !archivistShowKb}
              class="px-2 py-0.5 rounded text-[11px] {archivistShowKb ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}"
              title="Knowledge Base / RAG Chunks"
            >
              📚 KB ({archivistKb.length})
            </button>
            <button
              type="button"
              onclick={() => archivistShowConfig = !archivistShowConfig}
              class="px-2 py-0.5 rounded text-[11px] {archivistShowConfig ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}"
              title="Model & Temperature"
            >
              ⚙️ {archivistModel}
            </button>
            <button
              type="button"
              onclick={() => archivistMessages = []}
              class="px-1.5 py-0.5 text-slate-500 hover:text-rose-400 text-[11px]"
              title="Clear Archivist Chat"
            >
              ✕
            </button>
          </div>
        </div>

        <!-- Archivist KB Drawer -->
        {#if archivistShowKb}
          <div class="p-3 bg-slate-900 border-b border-indigo-900/60 flex flex-col gap-2 shrink-0 text-xs animate-in slide-in-from-top-1">
            <div class="flex items-center justify-between">
              <span class="font-bold text-indigo-300">Rules Knowledge Base Ingestion</span>
              <label class="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded cursor-pointer font-semibold">
                + Upload (.txt, .md, .json)
                <input type="file" accept=".txt,.md,.json" multiple class="hidden" onchange={handleArchivistUpload} />
              </label>
            </div>
            {#if archivistKb.length === 0}
              <p class="text-slate-500 text-[11px]">No documents ingested. Upload SRD tables, spell lists, or custom rules to inject into prompt context.</p>
            {:else}
              <div class="max-h-24 overflow-y-auto space-y-1">
                {#each [...new Set(archivistKb.map(k => k.fileName))] as fileName}
                  <div class="flex items-center justify-between px-2 py-1 bg-slate-950 rounded border border-slate-800 text-[11px]">
                    <span class="truncate text-slate-300">{fileName}</span>
                    <button
                      type="button"
                      onclick={() => archivistKb = archivistKb.filter(k => k.fileName !== fileName)}
                      class="text-rose-400 hover:text-rose-200"
                    >
                      Delete
                    </button>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}

        <!-- Archivist Config Drawer -->
        {#if archivistShowConfig}
          <div class="p-3 bg-slate-900 border-b border-indigo-900/60 flex items-center gap-3 shrink-0 text-xs">
            <div class="flex items-center gap-1.5 flex-1 min-w-0">
              <span class="text-slate-400 text-[10px] uppercase font-bold">Model:</span>
              <input
                type="text"
                bind:value={archivistModel}
                placeholder="qwen2.5:7b or llama3"
                class="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-[11px] flex-1 min-w-0"
              />
            </div>
            <div class="flex items-center gap-1.5">
              <span class="text-slate-400 text-[10px] uppercase font-bold">Temp:</span>
              <input type="number" step="0.05" min="0" max="1" bind:value={archivistTemp} class="w-16 bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-slate-200 font-mono text-[11px]" />
            </div>
            <button type="button" onclick={() => archivistShowConfig = false} class="text-slate-500 hover:text-slate-300">✕</button>
          </div>
        {/if}

        <!-- Archivist Chat Messages Stream -->
        <div class="flex-1 overflow-y-auto p-3 space-y-3 min-h-0 select-text">
          {#each archivistMessages as msg (msg.id)}
            <div class="flex flex-col {msg.sender === 'user' ? 'items-end' : 'items-start'}">
              <div class="max-w-[90%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed shadow-sm
                {msg.sender === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-none'
                  : 'bg-slate-800/90 text-slate-200 border border-slate-700/60 rounded-bl-none'}">
                <p class="whitespace-pre-wrap">{msg.text}</p>

                {#if msg.citations && msg.citations.length > 0}
                  <div class="mt-2 pt-1.5 border-t border-slate-700/80 flex items-center gap-1 flex-wrap text-[10px] text-indigo-300">
                    <span class="font-bold">Sources:</span>
                    {#each msg.citations as cit}
                      <span class="px-1.5 py-0.2 rounded bg-indigo-950/80 border border-indigo-800/60 font-mono">{cit}</span>
                    {/each}
                  </div>
                {/if}
              </div>
              <span class="text-[9px] text-slate-600 mt-0.5 px-1">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          {/each}
          <div bind:this={archivistBottom}></div>
        </div>

        <!-- Archivist Input Dock -->
        <div class="p-2 border-t border-slate-800 bg-slate-900/90 flex items-center gap-1.5 shrink-0">
          <input
            type="text"
            bind:value={archivistInput}
            onkeydown={(e) => { if (e.key === 'Enter') sendArchivistQuery(); }}
            placeholder="Ask rules: grapple, short rest, cover, death save…"
            class="flex-1 min-w-0 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 placeholder-slate-600"
          />
          {#if archivistGenerating}
            <button
              type="button"
              onclick={() => { archivistAbort?.abort(); archivistGenerating = false; }}
              class="px-3 py-2 bg-rose-700 hover:bg-rose-600 text-white text-xs font-bold rounded-lg transition-colors"
            >
              Stop
            </button>
          {:else}
            <button
              type="button"
              onclick={sendArchivistQuery}
              disabled={!archivistInput.trim()}
              class="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors shadow"
            >
              Ask SRD
            </button>
          {/if}
        </div>

      </div>
    {/if}

    <!-- ═══════════════════════════════════════════════════════════════════════
         PANEL 2: LIVE DM CO-PILOT (Narrative, Improv, Scene Descriptions)
    ════════════════════════════════════════════════════════════════════════════ -->
    {#if viewMode === 'dual' || viewMode === 'copilot'}
      <div class="flex-1 flex flex-col min-w-0 min-h-0 bg-slate-950/40 relative">

        <!-- Panel 2 Subheader -->
        <div class="h-9 bg-slate-900 border-b border-slate-800 px-3 flex items-center justify-between shrink-0">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-amber-500 shadow-sm shadow-amber-500/50"></span>
            <span class="text-xs font-bold text-amber-300 uppercase tracking-wider">Live DM Co-Pilot</span>
            <span class="text-[10px] px-1.5 py-0.2 rounded bg-amber-950 text-amber-400 border border-amber-800/40 font-mono">Narrative Improv</span>
          </div>

          <div class="flex items-center gap-1 text-xs">
            <button
              type="button"
              onclick={() => copilotShowKb = !copilotShowKb}
              class="px-2 py-0.5 rounded text-[11px] {copilotShowKb ? 'bg-amber-600 text-slate-950 font-bold' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}"
              title="Campaign Lore & Session Notes"
            >
              🗺️ Notes ({copilotKb.length})
            </button>
            <button
              type="button"
              onclick={() => copilotShowConfig = !copilotShowConfig}
              class="px-2 py-0.5 rounded text-[11px] {copilotShowConfig ? 'bg-amber-600 text-slate-950 font-bold' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}"
              title="Model & Creative Temperature"
            >
              ⚙️ {copilotModel}
            </button>
            <button
              type="button"
              onclick={() => copilotMessages = []}
              class="px-1.5 py-0.5 text-slate-500 hover:text-rose-400 text-[11px]"
              title="Clear Co-Pilot Chat"
            >
              ✕
            </button>
          </div>
        </div>

        <!-- Co-Pilot Notes Drawer -->
        {#if copilotShowKb}
          <div class="p-3 bg-slate-900 border-b border-amber-900/60 flex flex-col gap-2 shrink-0 text-xs animate-in slide-in-from-top-1">
            <div class="flex items-center justify-between">
              <span class="font-bold text-amber-300">Campaign Notes &amp; Lore Ingestion</span>
              <label class="px-2 py-0.5 bg-amber-600 hover:bg-amber-500 text-slate-950 rounded cursor-pointer font-bold">
                + Upload Notes (.txt, .md)
                <input type="file" accept=".txt,.md" multiple class="hidden" onchange={handleCopilotUpload} />
              </label>
            </div>
            {#if copilotKb.length === 0}
              <p class="text-slate-500 text-[11px]">No campaign notes ingested. Upload adventure hooks, NPC rosters, or room keys for the Co-Pilot to reference.</p>
            {:else}
              <div class="max-h-24 overflow-y-auto space-y-1">
                {#each [...new Set(copilotKb.map(k => k.fileName))] as fileName}
                  <div class="flex items-center justify-between px-2 py-1 bg-slate-950 rounded border border-slate-800 text-[11px]">
                    <span class="truncate text-slate-300">{fileName}</span>
                    <button
                      type="button"
                      onclick={() => copilotKb = copilotKb.filter(k => k.fileName !== fileName)}
                      class="text-rose-400 hover:text-rose-200"
                    >
                      Delete
                    </button>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}

        <!-- Co-Pilot Config Drawer -->
        {#if copilotShowConfig}
          <div class="p-3 bg-slate-900 border-b border-amber-900/60 flex items-center gap-3 shrink-0 text-xs">
            <div class="flex items-center gap-1.5 flex-1 min-w-0">
              <span class="text-slate-400 text-[10px] uppercase font-bold">Model:</span>
              <input
                type="text"
                bind:value={copilotModel}
                placeholder="qwen2.5:7b or llama3"
                class="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-[11px] flex-1 min-w-0"
              />
            </div>
            <div class="flex items-center gap-1.5">
              <span class="text-slate-400 text-[10px] uppercase font-bold">Creative Temp:</span>
              <input type="number" step="0.05" min="0" max="1" bind:value={copilotTemp} class="w-16 bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-slate-200 font-mono text-[11px]" />
            </div>
            <button type="button" onclick={() => copilotShowConfig = false} class="text-slate-500 hover:text-slate-300">✕</button>
          </div>
        {/if}

        <!-- Quick Prompt Action Chips Bar -->
        <div class="px-3 py-1.5 bg-slate-950/80 border-b border-slate-800 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
          {#each COPILOT_CHIPS as chip}
            <button
              type="button"
              onclick={() => sendCopilotQuery(chip.prompt)}
              class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800/80 hover:bg-amber-600 hover:text-slate-950 text-slate-300 border border-slate-700/60 transition-colors whitespace-nowrap"
            >
              {chip.label}
            </button>
          {/each}
        </div>

        <!-- Co-Pilot Chat Messages Stream -->
        <div class="flex-1 overflow-y-auto p-3 space-y-3 min-h-0 select-text">
          {#each copilotMessages as msg (msg.id)}
            <div class="flex flex-col {msg.sender === 'user' ? 'items-end' : 'items-start'}">
              <div class="max-w-[90%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed shadow-sm
                {msg.sender === 'user'
                  ? 'bg-amber-600 text-slate-950 font-medium rounded-br-none'
                  : 'bg-stone-900/90 text-amber-50/90 border border-amber-900/40 rounded-bl-none'}">
                <p class="whitespace-pre-wrap">{msg.text}</p>
              </div>
              <span class="text-[9px] text-slate-600 mt-0.5 px-1">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          {/each}
          <div bind:this={copilotBottom}></div>
        </div>

        <!-- Co-Pilot Input Dock -->
        <div class="p-2 border-t border-slate-800 bg-slate-900/90 flex items-center gap-1.5 shrink-0">
          <input
            type="text"
            bind:value={copilotInput}
            onkeydown={(e) => { if (e.key === 'Enter') sendCopilotQuery(); }}
            placeholder="Scene ideas, NPC secrets, villain dialogue, tavern rumors…"
            class="flex-1 min-w-0 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500 placeholder-slate-600"
          />
          {#if copilotGenerating}
            <button
              type="button"
              onclick={() => { copilotAbort?.abort(); copilotGenerating = false; }}
              class="px-3 py-2 bg-rose-700 hover:bg-rose-600 text-white text-xs font-bold rounded-lg transition-colors"
            >
              Stop
            </button>
          {:else}
            <button
              type="button"
              onclick={() => sendCopilotQuery()}
              disabled={!copilotInput.trim()}
              class="px-3 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-slate-950 text-xs font-bold rounded-lg transition-colors shadow"
            >
              Improvise
            </button>
          {/if}
        </div>

      </div>
    {/if}

  </div>
</div>
