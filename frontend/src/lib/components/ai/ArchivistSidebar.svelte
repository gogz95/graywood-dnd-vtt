<script lang="ts">
  // ArchivistSidebar.svelte — LLM chat panel with offline KB ingestion + RAG injection

  import { onMount } from 'svelte';

  interface ArchivistMessage {
    id: string;
    sender: 'user' | 'archivist';
    text: string;
    timestamp: number;
    citations?: string[];
    isLoading?: boolean;
  }

  interface KbChunk {
    id: string;
    fileName: string;
    text: string;
    tags: string[];
  }

  const KB_KEY   = 'vtt_archivist_kb';
  const CHAT_KEY = 'vtt_archivist_chat';
  const MODEL_KEY = 'vtt_archivist_model';

  // ── State ──────────────────────────────────────────────────────────────────
  let queryInput    = $state('');
  let isGenerating  = $state(false);
  let abortCtrl: AbortController | null = null;
  let chatBottom    = $state<HTMLElement | null>(null);
  let showKbPanel   = $state(false);
  let modelName     = $state(localStorage.getItem(MODEL_KEY) ?? 'qwen2.5:7b');
  let temperature   = $state(0.1);

  let messages = $state<ArchivistMessage[]>((() => {
    try {
      const raw = localStorage.getItem(CHAT_KEY);
      const parsed = raw ? (JSON.parse(raw) as ArchivistMessage[]) : [];
      if (parsed.length > 0) return parsed;
    } catch { /* empty */ }
    return [{
      id: 'init-0', sender: 'archivist', timestamp: Date.now(),
      text: 'Rules Archivist online. I answer D&D 5e / 5.5e SRD questions. Load source files to expand my knowledge base.',
    }];
  })());

  let kb = $state<KbChunk[]>((() => {
    try { return JSON.parse(localStorage.getItem(KB_KEY) ?? '[]') as KbChunk[]; } catch { return []; }
  })());

  // ── Persist ────────────────────────────────────────────────────────────────
  $effect(() => {
    localStorage.setItem(CHAT_KEY, JSON.stringify(messages.filter(m => !m.isLoading).slice(-60)));
  });
  $effect(() => { localStorage.setItem(KB_KEY, JSON.stringify(kb)); });
  $effect(() => { localStorage.setItem(MODEL_KEY, modelName); });

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  $effect(() => {
    if (messages.length) {
      setTimeout(() => { chatBottom?.scrollIntoView({ behavior: 'smooth' }); }, 50);
    }
  });

  // ── KB helpers ─────────────────────────────────────────────────────────────
  function chunkText(text: string, maxLen = 800): string[] {
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

  async function ingestFile(file: File) {
    const text = await file.text();
    const chunks = chunkText(text);
    const newChunks: KbChunk[] = chunks.map((c, i) => ({
      id: `${file.name}-${i}-${Date.now()}`,
      fileName: file.name,
      text: c,
      tags: inferTags(c),
    }));
    kb = [...kb, ...newChunks];
  }

  function inferTags(text: string): string[] {
    const lower = text.toLowerCase();
    const tags: string[] = [];
    if (/spell|cast|cantrip|slot/.test(lower)) tags.push('spells');
    if (/combat|attack|action|initiative|turn|round/.test(lower)) tags.push('combat');
    if (/rest|hit dice|exhaustion/.test(lower)) tags.push('resting');
    if (/magic item|artifact|rarity/.test(lower)) tags.push('items');
    if (/monster|creature|cr|challenge/.test(lower)) tags.push('monsters');
    return tags;
  }

  function removeKbFile(fileName: string) {
    kb = kb.filter(c => c.fileName !== fileName);
  }

  function kbFileList(): string[] {
    return [...new Set(kb.map(c => c.fileName))];
  }

  function retrieveContext(query: string): string {
    if (kb.length === 0) return '';
    const queryWords = query.toLowerCase().split(/\W+/).filter(w => w.length > 3);
    const scored = kb.map(chunk => {
      const lower = chunk.text.toLowerCase();
      const score = queryWords.reduce((s, w) => s + (lower.split(w).length - 1), 0);
      return { chunk, score };
    });
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 3).filter(s => s.score > 0);
    if (top.length === 0) return '';
    return top.map(s => `[Source: ${s.chunk.fileName}]\n${s.chunk.text}`).join('\n\n---\n\n');
  }

  // ── Chat handling ──────────────────────────────────────────────────────────
  async function sendQuery() {
    const raw = queryInput.trim();
    if (!raw || isGenerating) return;

    const userMsg: ArchivistMessage = { id: `u-${Date.now()}`, sender: 'user', text: raw, timestamp: Date.now() };
    const loadingMsg: ArchivistMessage = { id: `loading-${Date.now()}`, sender: 'archivist', text: '…', timestamp: Date.now(), isLoading: true };
    messages = [...messages, userMsg, loadingMsg];
    queryInput = '';
    isGenerating = true;

    const ragContext = retrieveContext(raw);
    const systemPrompt = `You are an expert D&D 5e/5.5e (2024) SRD Rules Referee. Answer with exact SRD mechanics. Use only verifiable rules — no homebrew.\n\n${ragContext ? `Relevant source material:\n${ragContext}\n\n` : ''}User question:`;

    abortCtrl = new AbortController();

    try {
      const res = await fetch('http://127.0.0.1:11434/api/generate', {
        method: 'POST',
        signal: abortCtrl.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelName,
          prompt: `${systemPrompt}\n${raw}`,
          stream: false,
          options: { temperature },
        }),
      });

      if (res.ok) {
        const data = await res.json() as { response: string };
        const citations = ragContext ? kbFileList().filter(f => ragContext.includes(f)) : [];
        const replyMsg: ArchivistMessage = {
          id: `a-${Date.now()}`, sender: 'archivist', text: data.response,
          timestamp: Date.now(), citations: citations.length > 0 ? citations : undefined,
        };
        messages = [...messages.filter(m => !m.isLoading), replyMsg];
        return;
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        messages = messages.filter(m => !m.isLoading);
        isGenerating = false;
        return;
      }
    } finally {
      isGenerating = false;
      abortCtrl = null;
    }

    // Offline deterministic fallback
    const fallback = offlineFallback(raw);
    messages = [...messages.filter(m => !m.isLoading), {
      id: `a-${Date.now()}`, sender: 'archivist', text: `[Offline Mode — Ollama unavailable]\n\n${fallback}`,
      timestamp: Date.now(),
    }];
  }

  function cancelGeneration() {
    abortCtrl?.abort();
    messages = messages.filter(m => !m.isLoading);
    isGenerating = false;
  }

  function clearChat() {
    messages = [{
      id: 'init-clear', sender: 'archivist', timestamp: Date.now(),
      text: 'Chat cleared. Ask a rules question to begin.',
    }];
  }

  function offlineFallback(query: string): string {
    const q = query.toLowerCase();
    if (q.match(/grapple|unarmed|shove|athletics/))
      return 'SRD 5.2 — Grappling: A grapple replaces an attack. The target must succeed on a Str or Dex saving throw (DC = 8 + your Str mod + Prof). The Grappled condition reduces the target\'s speed to 0.';
    if (q.match(/concentrat|spell/))
      return 'SRD 5.1 — Concentration: When a concentrating caster takes damage, make a Constitution saving throw. DC = 10 or half the damage taken (whichever is higher). Multiple damage sources require separate saves.';
    if (q.match(/rest|exhaustion|hit dice/))
      return 'SRD 5.1 — Short Rest: 1+ hours, spend Hit Dice to regain HP. Long Rest: 8 hours, regain all HP and half of maximum Hit Dice. Exhaustion reduces by 1 on a Long Rest.';
    if (q.match(/cover|darkvision|light/))
      return 'SRD 5.2 — Cover: Half Cover +2 AC/Dex saves, Three-Quarters Cover +5 AC/Dex saves, Total Cover prevents direct targeting. Darkvision: treats Darkness as Dim Light within range.';
    if (q.match(/initiative|combat|surprise/))
      return 'SRD 5e — Initiative: Roll Dex check at start of combat; highest result goes first. A surprised creature cannot move, take actions, or reactions on its first turn. Initiative order is fixed until end of encounter.';
    return 'No matching SRD rule found in offline library. Connect Ollama (qwen2.5:7b on port 11434) for a full language model response, or load source documents via the Knowledge Base panel.';
  }

  function formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const QUICK_QUERIES = [
    '2024 Grapple rules', 'Concentration DC formula', 'Cover AC bonuses',
    'Short rest vs long rest', 'Surprise round mechanics', 'Opportunity attack triggers',
  ];

  let dragOver = $state(false);

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    const files = Array.from(e.dataTransfer?.files ?? []);
    for (const f of files) {
      if (f.name.match(/\.(txt|md|json)$/i)) ingestFile(f);
    }
  }
</script>

<div class="h-full flex flex-col overflow-hidden bg-slate-950">

  <!-- ── Header ──────────────────────────────────────────────────────────── -->
  <div class="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 bg-slate-900 shrink-0">
    <div>
      <h2 class="text-sm font-bold text-slate-200 uppercase tracking-wide">Rules Archivist</h2>
      <p class="text-[10px] text-slate-500">Ollama · {modelName} · {kb.length} KB chunks</p>
    </div>
    <div class="flex items-center gap-1.5">
      <button onclick={() => showKbPanel = !showKbPanel} class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-colors {showKbPanel ? 'bg-indigo-900/50 text-indigo-300' : ''}">📚 KB</button>
      <button onclick={clearChat} class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs rounded-lg transition-colors">🗑 Clear</button>
    </div>
  </div>

  <!-- ── KB Panel ─────────────────────────────────────────────────────────── -->
  {#if showKbPanel}
    <div
      class="border-b border-slate-800 bg-slate-900/60 shrink-0 p-3 space-y-2 transition-all"
      role="region"
      ondragover={(e) => { e.preventDefault(); dragOver = true; }}
      ondragleave={() => dragOver = false}
      ondrop={handleDrop}
    >
      <div class="flex items-center justify-between">
        <h3 class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Knowledge Base ({kbFileList().length} files, {kb.length} chunks)</h3>
        <label class="px-2.5 py-1 bg-indigo-700 hover:bg-indigo-600 text-white text-xs font-semibold rounded cursor-pointer transition-colors">
          + Import File
          <input type="file" accept=".txt,.md,.json" multiple class="hidden"
            onchange={(e) => { for (const f of Array.from((e.target as HTMLInputElement).files ?? [])) ingestFile(f); }} />
        </label>
      </div>

      <div class="border-2 border-dashed {dragOver ? 'border-indigo-500 bg-indigo-950/20' : 'border-slate-800'} rounded-xl p-3 text-center text-xs text-slate-600 transition-colors">
        {dragOver ? 'Drop to ingest…' : 'Drag .txt / .md / .json files here'}
      </div>

      {#if kbFileList().length > 0}
        <div class="space-y-1 max-h-32 overflow-y-auto">
          {#each kbFileList() as fname}
            <div class="flex items-center justify-between px-2.5 py-1.5 bg-slate-800/60 rounded-lg">
              <div class="min-w-0">
                <p class="text-[11px] font-semibold text-slate-300 truncate">{fname}</p>
                <p class="text-[9px] text-slate-600">{kb.filter(c => c.fileName === fname).length} chunks</p>
              </div>
              <button onclick={() => removeKbFile(fname)} class="text-slate-600 hover:text-rose-400 text-xs ml-2 transition-colors shrink-0">✕</button>
            </div>
          {/each}
        </div>
      {/if}

      <!-- Model config -->
      <div class="flex items-center gap-2 pt-1">
        <span class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Model</span>
        <input type="text" bind:value={modelName} class="flex-1 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs font-mono text-slate-300 focus:outline-none focus:border-indigo-500" />
        <span class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Temp</span>
        <input type="number" min="0" max="1" step="0.05" bind:value={temperature} class="w-14 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs font-mono text-slate-300 focus:outline-none focus:border-indigo-500" />
      </div>
    </div>
  {/if}

  <!-- ── Quick queries ────────────────────────────────────────────────────── -->
  <div class="flex gap-1.5 px-3 py-2 border-b border-slate-800/60 overflow-x-auto shrink-0">
    {#each QUICK_QUERIES as q}
      <button
        onclick={() => { queryInput = q; sendQuery(); }}
        class="whitespace-nowrap px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-[10px] font-semibold text-slate-400 hover:text-slate-200 rounded-full transition-colors"
      >{q}</button>
    {/each}
  </div>

  <!-- ── Chat Feed ─────────────────────────────────────────────────────────── -->
  <div class="flex-1 overflow-y-auto px-3 py-3 space-y-3">
    {#each messages as msg (msg.id)}
      <div class="flex {msg.sender === 'user' ? 'justify-end' : 'justify-start'}">
        <div class="max-w-[85%] {msg.sender === 'user'
          ? 'bg-indigo-700/60 text-slate-100 rounded-2xl rounded-tr-sm'
          : 'bg-slate-800/80 text-slate-200 rounded-2xl rounded-tl-sm'} px-3 py-2.5 shadow">
          {#if msg.isLoading}
            <div class="flex gap-1 items-center py-1">
              <div class="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style="animation-delay:0ms"></div>
              <div class="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style="animation-delay:150ms"></div>
              <div class="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style="animation-delay:300ms"></div>
            </div>
          {:else}
            <p class="text-xs leading-relaxed whitespace-pre-wrap">{msg.text}</p>
            {#if msg.citations?.length}
              <div class="mt-2 flex flex-wrap gap-1">
                {#each msg.citations as cit}
                  <span class="px-1.5 py-0.5 bg-indigo-950/60 text-indigo-300 text-[9px] font-semibold rounded border border-indigo-800/30">[{cit}]</span>
                {/each}
              </div>
            {/if}
            <p class="text-[9px] text-slate-500 mt-1.5 text-right">{formatTime(msg.timestamp)}</p>
          {/if}
        </div>
      </div>
    {/each}
    <div bind:this={chatBottom}></div>
  </div>

  <!-- ── Input Area ───────────────────────────────────────────────────────── -->
  <div class="px-3 py-3 border-t border-slate-800 bg-slate-900/80 shrink-0">
    <div class="flex gap-2">
      <textarea
        bind:value={queryInput}
        rows="2"
        placeholder="Ask a SRD rules question…"
        onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendQuery(); } }}
        class="flex-1 resize-none bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 placeholder:text-slate-600"
      ></textarea>
      {#if isGenerating}
        <button onclick={cancelGeneration} class="px-3 py-2 bg-rose-900/60 hover:bg-rose-800/70 text-rose-300 text-xs font-bold rounded-xl transition-colors border border-rose-800/30">✕ Stop</button>
      {:else}
        <button
          onclick={sendQuery}
          disabled={!queryInput.trim()}
          class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-colors shadow-md shadow-indigo-600/20"
        >Ask</button>
      {/if}
    </div>
    <p class="text-[9px] text-slate-600 mt-1.5 text-center">Enter to send · Shift+Enter for newline · Ollama on port 11434</p>
  </div>
</div>
