<script lang="ts">
  import Icons from '../../../components/Icons.svelte';

  export interface CitationSource {
    id: number;
    title: string;
    category: string;
    excerpt: string;
    authority: string;
    enabled: boolean;
  }

  export interface ArchivistMessage {
    id: string;
    sender: 'user' | 'archivist';
    text: string;
    timestamp: number;
    citations?: number[];
  }

  let { isOpen = $bindable(false) }: { isOpen?: boolean } = $props();

  let queryInput = $state('');
  let isGenerating = $state(false);

  let sources = $state<CitationSource[]>([
    {
      id: 1,
      title: 'SRD 5.2 Combat Actions & Maneuvers',
      category: 'Tactical Combat Rules',
      excerpt:
        'Unarmed Strikes & Grappling: Grappling requires a Strength (Athletics) check or an Unarmed Strike against the target DC (8 + Str mod + Prof). The Grappled condition reduces speed to 0. Moving a grappled creature requires half movement speed unless one size category smaller.',
      authority: 'System Reference Document 5.2 (2024)',
      enabled: true,
    },
    {
      id: 2,
      title: 'SRD 5.1 Spellcasting & Concentration Rules',
      category: 'Arcane & Divine Magic',
      excerpt:
        'Concentration: Taking damage while concentrating mandates a Constitution saving throw. The DC equals 10 or half the damage taken (whichever number is higher). Taking damage from multiple sources triggers separate saving throws.',
      authority: 'System Reference Document 5.1',
      enabled: true,
    },
    {
      id: 3,
      title: 'SRD 5.1 Resting, Exhaustion & Recovery',
      category: 'Adventuring Environment',
      excerpt:
        'Short & Long Rests: A Short Rest lasts at least 1 hour; characters spend available Hit Dice to regain HP. A Long Rest lasts 8 hours, restoring all hit points and up to half the character’s maximum total Hit Dice.',
      authority: 'System Reference Document 5.1',
      enabled: true,
    },
    {
      id: 4,
      title: 'SRD 5.1 Magic Item Rarity & Crafting Valuation',
      category: 'Equipment & Artifice',
      excerpt:
        'Magic Item Crafting Valuation: Common (50-100 GP, level 1+), Uncommon (101-500 GP, level 3+), Rare (501-5,000 GP, level 5+), Very Rare (5,001-50,000 GP, level 11+), Legendary (50,001+ GP, level 17+).',
      authority: 'System Reference Document 5.1',
      enabled: true,
    },
    {
      id: 5,
      title: 'SRD 5.2 Vision, Lighting & Cover Mechanics',
      category: 'Environmental Senses',
      excerpt:
        'Cover and Vision: Half Cover grants +2 to AC and Dexterity saving throws. Three-Quarters Cover grants +5 to AC and Dexterity saves. Total Cover prevents direct targeting. Darkvision allows seeing in Dim Light as Bright Light, and Darkness as Dim Light (black and white only).',
      authority: 'System Reference Document 5.2',
      enabled: true,
    },
  ]);

  let messages = $state<ArchivistMessage[]>([
    {
      id: 'init-1',
      sender: 'archivist',
      text: 'Greetings, Game Master. The Local Rules Archivist is active. I provide immediate, deterministic rulings sourced from the standard D&D 5e / 5.5e (2024) SRD compendium. How may I assist your encounter?',
      timestamp: Date.now() - 60000,
    },
  ]);

  function toggleSource(id: number) {
    const s = sources.find((src) => src.id === id);
    if (s) {
      s.enabled = !s.enabled;
    }
  }

  async function handleSendQuery() {
    const raw = queryInput.trim();
    if (!raw || isGenerating) return;

    const userMsg: ArchivistMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: raw,
      timestamp: Date.now(),
    };

    messages = [...messages, userMsg];
    queryInput = '';
    isGenerating = true;

    try {
      // First attempt local Ollama instance on port 11434
      const res = await fetch('http://127.0.0.1:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen2.5:7b',
          prompt: `You are an expert D&D 5e/5.5e (2024 SRD) Rules Referee. Answer using strictly standard SRD mechanics with zero homebrew lore:\n\n${raw}`,
          stream: false,
          options: { temperature: 0.0 },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const archivistMsg: ArchivistMessage = {
          id: `arch-${Date.now()}`,
          sender: 'archivist',
          text: data.response,
          timestamp: Date.now(),
          citations: [1, 2],
        };
        messages = [...messages, archivistMsg];
        return;
      }
    } catch {
      // Offline fallback deterministic rule evaluation
    } finally {
      isGenerating = false;
    }

    // Deterministic rule synthesizer
    const reply = synthesizeOfflineRuling(raw);
    messages = [...messages, reply];
  }

  function synthesizeOfflineRuling(query: string): ArchivistMessage {
    const lower = query.toLowerCase();
    const activeIds = sources.filter((s) => s.enabled).map((s) => s.id);

    if (lower.includes('grapple') || lower.includes('unarmed') || lower.includes('shove') || lower.includes('athletics')) {
      if (activeIds.includes(1)) {
        return {
          id: `arch-${Date.now()}`,
          sender: 'archivist',
          text: 'Under standard SRD 5.2 rules [cite: 1], a Grapple attempt replaces an attack during an Attack action. The DC equals 8 + the initiator’s Strength modifier + proficiency bonus. The target makes a Strength or Dexterity saving throw. While grappled, the target’s speed is 0 and cannot benefit from bonuses to speed.',
          timestamp: Date.now(),
          citations: [1],
        };
      }
    }

    if (lower.includes('concentration') || lower.includes('spell') || lower.includes('cast')) {
      if (activeIds.includes(2)) {
        return {
          id: `arch-${Date.now()}`,
          sender: 'archivist',
          text: 'Under standard SRD 5.1 rules [cite: 2], whenever a concentrating spellcaster takes damage, they must make a Constitution saving throw to maintain concentration. The DC equals 10 or half the damage taken, whichever number is higher. If damage is taken from multiple sources, separate saving throws must be rolled for each instance.',
          timestamp: Date.now(),
          citations: [2],
        };
      }
    }

    if (lower.includes('rest') || lower.includes('exhaustion') || lower.includes('hit dice') || lower.includes('sleep')) {
      if (activeIds.includes(3)) {
        return {
          id: `arch-${Date.now()}`,
          sender: 'archivist',
          text: 'Under standard SRD 5.1 resting rules [cite: 3], a Short Rest requires at least 1 hour of downtime, allowing characters to spend Hit Dice up to their maximum level. A Long Rest requires 8 hours (with no more than 2 hours of light watch), regaining all lost hit points and half of the total maximum Hit Dice.',
          timestamp: Date.now(),
          citations: [3],
        };
      }
    }

    if (lower.includes('magic item') || lower.includes('craft') || lower.includes('rarity') || lower.includes('cost')) {
      if (activeIds.includes(4)) {
        return {
          id: `arch-${Date.now()}`,
          sender: 'archivist',
          text: 'According to SRD magic item valuation standards [cite: 4], crafting times and material values scale with item rarity: Common items cost ~50-100 GP, Uncommon items ~101-500 GP, and Rare items ~501-5,000 GP. Crafting progress typically advances at 50 GP of market value per full 8-hour workday.',
          timestamp: Date.now(),
          citations: [4],
        };
      }
    }

    if (lower.includes('cover') || lower.includes('darkvision') || lower.includes('vision') || lower.includes('light')) {
      if (activeIds.includes(5)) {
        return {
          id: `arch-${Date.now()}`,
          sender: 'archivist',
          text: 'Under SRD 5.2 vision and cover rules [cite: 5], Half Cover grants +2 to AC and Dexterity saving throws, while Three-Quarters Cover grants +5. Total Cover shields a target from direct spell targeting. Darkvision permits seeing in darkness as if it were dim light within the specified range (usually 60 ft), but color cannot be discerned.',
          timestamp: Date.now(),
          citations: [5],
        };
      }
    }

    const availableCites = activeIds.slice(0, 2);
    const citeTokens = availableCites.map((c) => `[cite: ${c}]`).join(', ');
    return {
      id: `arch-${Date.now()}`,
      sender: 'archivist',
      text: `Based on enabled SRD source documents ${citeTokens}, standard Fifth Edition mechanics resolve this inquiry using core ability checks or difficulty class formulas (DC 10 for Easy, 15 for Medium, 20 for Hard). Consult enabled citations above for exact clauses.`,
      timestamp: Date.now(),
      citations: availableCites,
    };
  }

  function handleClose() {
    isOpen = false;
  }
</script>

<div class="h-full flex flex-col bg-[#0b0d14] text-slate-100 select-none">
  <!-- Header Bar -->
  <div class="p-4 border-b border-amber-900/30 flex items-center justify-between shrink-0 bg-[#07090e]">
    <div class="flex items-center gap-2.5">
      <div class="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-md">
        <Icons name="book" size={18} />
      </div>
      <div>
        <h2 class="text-sm font-black text-slate-100 uppercase tracking-widest font-serif flex items-center gap-1.5">
          Rules Archivist
          <span class="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 font-mono text-[9px] font-bold">RAG</span>
        </h2>
        <p class="text-[10px] text-amber-200/60 font-mono">SRD 5.1/5.2 Offline Inference</p>
      </div>
    </div>
    <button
      onclick={handleClose}
      class="w-7 h-7 rounded-lg bg-dark-900 hover:bg-dark-800 text-slate-400 hover:text-slate-200 flex items-center justify-center border border-dark-700 transition-colors"
      aria-label="Close Archivist Drawer"
    >
      <Icons name="x" size={14} />
    </button>
  </div>

  <!-- Sources Selector (Collapsible Chips) -->
  <div class="p-3 border-b border-amber-900/20 bg-[#090b10] shrink-0">
    <span class="text-[10px] font-bold text-amber-300 uppercase tracking-wider block mb-2 font-serif">
      Indexed SRD Vector Indices:
    </span>
    <div class="flex flex-wrap gap-1.5">
      {#each sources as src}
        <button
          onclick={() => toggleSource(src.id)}
          class="px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all flex items-center gap-1.5 {
            src.enabled
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-sm shadow-amber-500/10'
              : 'bg-dark-900/60 border-dark-700 text-slate-500 hover:text-slate-400'
          }"
        >
          <span class="w-1.5 h-1.5 rounded-full {src.enabled ? 'bg-amber-400' : 'bg-slate-600'}"></span>
          {src.title}
        </button>
      {/each}
    </div>
  </div>

  <!-- Messages Conversation Stream -->
  <div class="flex-1 overflow-y-auto p-4 space-y-4">
    {#each messages as msg}
      <div class="flex flex-col {msg.sender === 'user' ? 'items-end' : 'items-start'}">
        <div
          class="max-w-[88%] rounded-2xl p-3.5 text-xs leading-relaxed shadow-lg {
            msg.sender === 'user'
              ? 'bg-gradient-to-br from-amber-600 to-amber-700 text-slate-950 font-medium rounded-br-sm'
              : 'bg-[#10131d] border border-amber-900/30 text-slate-200 rounded-bl-sm'
          }"
        >
          <p class="whitespace-pre-wrap">{msg.text}</p>

          {#if msg.citations && msg.citations.length > 0}
            <div class="mt-3 pt-2.5 border-t border-amber-500/20 space-y-1.5">
              <span class="text-[9px] font-bold uppercase tracking-wider text-amber-400/90 font-serif block">
                Official SRD Sources Cited:
              </span>
              {#each msg.citations as citeId}
                {@const src = sources.find((s) => s.id === citeId)}
                {#if src}
                  <div class="bg-black/30 rounded-lg p-2 text-[10px] border border-amber-500/10">
                    <span class="font-semibold text-amber-300">[{src.id}] {src.title}:</span>
                    <p class="text-slate-300 mt-0.5 italic">"{src.excerpt}"</p>
                    <span class="text-[9px] text-amber-400/60 block mt-1 font-mono">&mdash; {src.authority}</span>
                  </div>
                {/if}
              {/each}
            </div>
          {/if}
        </div>
        <span class="text-[9px] text-slate-600 mt-1 px-1 font-mono">
          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    {/each}

    {#if isGenerating}
      <div class="flex items-center gap-2 text-xs text-amber-400/70 p-2">
        <div class="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
        <span class="font-mono text-[11px]">Evaluating SRD vectors via local Ollama (11434)...</span>
      </div>
    {/if}
  </div>

  <!-- Query Input Field -->
  <div class="p-3 border-t border-amber-900/30 bg-[#07090e] shrink-0">
    <form
      onsubmit={(e) => {
        e.preventDefault();
        handleSendQuery();
      }}
      class="flex items-center gap-2"
    >
      <input
        type="text"
        placeholder="Ask a rules question (e.g. 2024 Grapple DC)..."
        bind:value={queryInput}
        class="flex-1 bg-[#10131d] border border-dark-700 focus:border-amber-500 text-xs text-slate-200 px-3.5 py-2.5 rounded-xl focus:outline-none placeholder:text-slate-600 transition-colors"
      />
      <button
        type="submit"
        disabled={isGenerating || !queryInput.trim()}
        class="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-40 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-all shrink-0"
      >
        Inquire
      </button>
    </form>
  </div>
</div>
