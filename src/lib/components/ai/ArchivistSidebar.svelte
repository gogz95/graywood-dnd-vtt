<script lang="ts">
  import Icons from '../../../components/Icons.svelte';
  import { dispatchSoundEvent } from '../../audio/soundboardBridge';

  export interface CitationSource {
    id: number;
    title: string;
    category: string;
    excerpt: string;
    authority: string;
    enabled: boolean;
  }

  export interface ChatMessage {
    id: string;
    sender: 'user' | 'archivist';
    text: string;
    timestamp: number;
    citations?: number[];
  }

  let {
    isOpen = $bindable(false),
    onClose,
  }: {
    isOpen: boolean;
    onClose?: () => void;
  } = $props();

  let sources = $state<CitationSource[]>([
    {
      id: 1,
      title: 'Gilion Lore & Precursor Ruin Records',
      category: 'Archaeology & Precursor History',
      excerpt:
        'The submerged ruins of Rucean Arch extend across three subterranean strata beneath Ostrava’s outer bay. The obsidian doors remain impenetrable to standard evocation magic unless resonating conduit harmonic seals are activated.',
      authority: 'Chancellery Antiquities Commission, 1418 G.E.',
      enabled: true,
    },
    {
      id: 2,
      title: 'Customs Laws & Eastern Port Assay Regulations',
      category: 'Commerce & Maritime Tariffs',
      excerpt:
        'Grand Chancellery Port Authority Statute §12.3: All merchantmen and exploratory caravels bearing Ay Modlahd solar tender must register at Beacon Hill Customs. Sun-disks are assayed at a mandatory 10% seigniorage tariff and reminted as Concord Sovereigns.',
      authority: 'High Commissioner Aldous Vane, Port Authority',
      enabled: true,
    },
    {
      id: 3,
      title: 'The Black Orb Containment Doctrine (System 15)',
      category: 'Arcane Quarantine & Void Protocols',
      excerpt:
        'Black Orb System 15 Containment Protocol: In the event of necrotic void breaches or resurrection failure, the obsidian orb triggers a localized temporal suppression quarantine. Darkvision is suppressed to zero and all cell degeneration is suspended.',
      authority: 'Inquisitorial Sanctum of Saint Valerius',
      enabled: true,
    },
    {
      id: 4,
      title: 'Essence Crafting Matrix & Volatility Theorems',
      category: 'Alchemical Engineering & Sockets',
      excerpt:
        'Essence Matrix Stabilization Treatise: Infusing equipment items requires 10 ingredient points for the initial essence, and 15 points per subsequent essence (10 + 15n). Infusions exceeding 25 points must be conducted within a tier-1 Stronghold Alchemical Laboratory to prevent explosive volatility.',
      authority: 'Grand Guild of Master Artificers',
      enabled: true,
    },
    {
      id: 5,
      title: 'Ostrava Municipal Peace-Bonding Ordinances',
      category: 'Security & Civil Enforcement',
      excerpt:
        'Municipal Peace-Bonding Ordinance: All blades exceeding 4 inches carried by off-duty mercenaries or adventurers within Ostrava city walls must be sheathed in leather scabbards, wound with crimson cord, and stamped with the lead seal of the High Watch. Breaking the seal incurs 50 sovereigns fine.',
      authority: 'High Watch Provost Marshal',
      enabled: true,
    },
  ]);

  let chatHistory = $state<ChatMessage[]>([
    {
      id: 'msg-init',
      sender: 'archivist',
      text: 'Greetings, Master of Chronicles. I am your NotebookLM Campaign Archivist. Select your verified knowledge corpora above or query any lore, legal tariff, or arcane treatise. Click any [cite: X] badge to inspect primary documentation.',
      timestamp: Date.now() - 120000,
    },
  ]);

  let userInput = $state('');
  let isThinking = $state(false);
  let activeCitationDossier = $state<CitationSource | null>(null);

  const PRESET_QUERIES = [
    'What are the Eastern Port Assay tariff laws?',
    'Tell me about the Drowned Precursor Vaults',
    'How does Essence Matrix volatility math work?',
    'Explain the System 15 Black Orb protocol',
    'What are the municipal weapon peace-bonding rules?',
  ];

  function toggleSource(id: number) {
    const s = sources.find((src) => src.id === id);
    if (s) {
      s.enabled = !s.enabled;
    }
  }

  function openCitation(id: number) {
    const src = sources.find((s) => s.id === id);
    if (src) {
      activeCitationDossier = src;
      dispatchSoundEvent('turn_bell');
    }
  }

  async function handleSendMessage(queryOverride?: string) {
    const query = (queryOverride ?? userInput).trim();
    if (!query || isThinking) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: Date.now(),
    };

    chatHistory = [...chatHistory, userMsg];
    userInput = '';
    isThinking = true;

    // Simulate fast localized semantic citation retrieval
    setTimeout(() => {
      const response = generateArchivistResponse(query);
      chatHistory = [...chatHistory, response];
      isThinking = false;
      dispatchSoundEvent('potion');
    }, 600);
  }

  function generateArchivistResponse(query: string): ChatMessage {
    const lower = query.toLowerCase();
    const activeIds = sources.filter((s) => s.enabled).map((s) => s.id);

    if (lower.includes('assay') || lower.includes('tariff') || lower.includes('sun-disk') || lower.includes('coin')) {
      if (activeIds.includes(2)) {
        return {
          id: `arch-${Date.now()}`,
          sender: 'archivist',
          text: 'Under Chancellery Customs Law §12.3 [cite: 2], foreign Ay Modlahd sun-disks cannot circulate within Ostrava until processed through the official Assay Mint. The port authority retains a mandatory 10% municipal assay tariff as seigniorage [cite: 2]. A merchant tendering 100 sun-disks receives 90 Concord Sovereigns while 10 sun-disks enter city reserves.',
          timestamp: Date.now(),
          citations: [2],
        };
      }
    }

    if (lower.includes('precursor') || lower.includes('rucean') || lower.includes('vault') || lower.includes('drowned')) {
      if (activeIds.includes(1)) {
        return {
          id: `arch-${Date.now()}`,
          sender: 'archivist',
          text: 'The primary sub-surface anomaly in Ostrava is "The Drowned Precursor Vault of Rucean Arch" [cite: 1]. It features three sunken strata: The Flooded Sluices, The Obsidian Atrium, and The Resonant Conduit. The gates are sealed against standard evocation spells unless resonant attunement frequencies are matched [cite: 1].',
          timestamp: Date.now(),
          citations: [1],
        };
      }
    }

    if (lower.includes('black orb') || lower.includes('system 15') || lower.includes('quarantine') || lower.includes('orb')) {
      if (activeIds.includes(3)) {
        return {
          id: `arch-${Date.now()}`,
          sender: 'archivist',
          text: 'The Black Orb Protocol (System 15) [cite: 3] represents an emergency arcane quarantine deployed when necrotic breaches occur. Once engaged, all character vision is clamped into absolute dark stasis and physiological progression freezes until the containment seal is deactivated [cite: 3].',
          timestamp: Date.now(),
          citations: [3],
        };
      }
    }

    if (lower.includes('essence') || lower.includes('craft') || lower.includes('socket') || lower.includes('stability')) {
      if (activeIds.includes(4)) {
        return {
          id: `arch-${Date.now()}`,
          sender: 'archivist',
          text: 'According to the Master Artificer Guild theorems [cite: 4], ingredient point requirements follow a 10 + 15n formula (1 slot = 10 pts, 2 slots = 25 pts, 3 slots = 40 pts). Any matrix exceeding 25 total points requires an owned Stronghold Alchemical Laboratory facility to stabilize the elemental resonance; otherwise a catastrophic volatility blowout ensues [cite: 4].',
          timestamp: Date.now(),
          citations: [4],
        };
      }
    }

    if (lower.includes('peace') || lower.includes('weapon') || lower.includes('wire') || lower.includes('law')) {
      if (activeIds.includes(5)) {
        return {
          id: `arch-${Date.now()}`,
          sender: 'archivist',
          text: 'Ostrava’s Municipal Peace-Bonding Ordinance [cite: 5] strictly mandates that all martial weapons with blades exceeding 4 inches must have their hilts bound with crimson hemp cord and sealed with Chancellery lead stamps. Unsealed blades carried in public carry a mandatory penalty of 50 sovereigns and 14 days hard labor [cite: 5].',
          timestamp: Date.now(),
          citations: [5],
        };
      }
    }

    // Default synthesis across active sources
    const availableCites = activeIds.slice(0, 2);
    const citeTokens = availableCites.map((c) => `[cite: ${c}]`).join(', ');
    return {
      id: `arch-${Date.now()}`,
      sender: 'archivist',
      text: `Based on your currently enabled source materials ${citeTokens}, the Aleamos regional archives corroborate this subject across both civil records and arcane histories. Consult the specific primary sources above for exact statutory clauses.`,
      timestamp: Date.now(),
      citations: availableCites,
    };
  }

  function handleClose() {
    isOpen = false;
    if (onClose) onClose();
  }
</script>

{#if isOpen}
  <!-- Backdrop Overlay -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity animate-fadeIn"
    onclick={handleClose}
  ></div>

  <!-- Slide-out Right Panel -->
  <aside
    class="fixed top-0 right-0 bottom-0 w-full sm:w-[480px] bg-[#090b11] border-l border-amber-900/50 shadow-2xl z-50 flex flex-col animate-slideLeft overflow-hidden"
    aria-label="NotebookLM AI Archivist Sidebar"
  >
    <!-- Header Bar -->
    <div class="p-4 bg-dark-900/90 border-b border-amber-900/40 flex items-center justify-between">
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
          <Icons name="book" size={17} />
        </div>
        <div>
          <h2 class="text-xs font-black text-slate-100 uppercase tracking-wider font-serif flex items-center gap-1.5">
            NotebookLM AI Archivist
            <span class="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono text-[9px] font-bold">
              v2.4
            </span>
          </h2>
          <p class="text-[10px] text-amber-200/60">
            Gilion Campaign Knowledge Corpus & Statutory Citations
          </p>
        </div>
      </div>

      <button
        onclick={handleClose}
        class="w-7 h-7 rounded-lg bg-dark-800 hover:bg-dark-700 text-slate-400 hover:text-slate-200 flex items-center justify-center text-lg font-bold transition-colors"
      >
        &times;
      </button>
    </div>

    <!-- Corpus Sources Checkboxes Section -->
    <div class="p-3 bg-dark-950/80 border-b border-dark-800 space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 font-serif">
          <Icons name="database" size={12} class="text-amber-400" />
          Active Grounding Corpora ({sources.filter((s) => s.enabled).length}/{sources.length})
        </span>
      </div>

      <div class="space-y-1.5 max-h-36 overflow-y-auto pr-1">
        {#each sources as src}
          <label
            class="flex items-start gap-2 p-1.5 rounded-lg border text-xs cursor-pointer transition-colors {
              src.enabled
                ? 'bg-dark-900/80 border-amber-500/30 text-slate-200'
                : 'bg-dark-950/40 border-dark-800 text-slate-500 opacity-60'
            }"
          >
            <input
              type="checkbox"
              checked={src.enabled}
              onchange={() => toggleSource(src.id)}
              class="mt-0.5 rounded bg-dark-950 border-dark-700 text-amber-500 focus:ring-0"
            />
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-1">
                <span class="font-bold text-[11px] truncate">{src.title}</span>
                <span class="font-mono text-[9px] text-amber-400 font-semibold shrink-0">
                  [cite: {src.id}]
                </span>
              </div>
              <p class="text-[9px] text-slate-400 truncate">{src.category}</p>
            </div>
          </label>
        {/each}
      </div>
    </div>

    <!-- Chat History List -->
    <div class="flex-1 overflow-y-auto p-4 space-y-4">
      <!-- Quick Prompt Pills -->
      <div class="space-y-1.5">
        <span class="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
          Suggested Research Inquiries:
        </span>
        <div class="flex flex-wrap gap-1">
          {#each PRESET_QUERIES as query}
            <button
              onclick={() => handleSendMessage(query)}
              class="text-left px-2.5 py-1 bg-dark-900 hover:bg-dark-800 border border-dark-700/80 hover:border-amber-500/40 rounded-lg text-[10px] text-amber-200/80 font-medium transition-colors"
            >
              {query} &rarr;
            </button>
          {/each}
        </div>
      </div>

      <!-- Messages Stream -->
      {#each chatHistory as msg}
        <div class="flex flex-col {msg.sender === 'user' ? 'items-end' : 'items-start'} space-y-1">
          <div class="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
            <span>{msg.sender === 'user' ? 'DM / Explorer' : 'AI Archivist'}</span>
            <span>&bull;</span>
            <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>

          <div
            class="p-3 rounded-2xl max-w-[92%] text-xs leading-relaxed {
              msg.sender === 'user'
                ? 'bg-amber-500 text-black font-semibold rounded-tr-none'
                : 'bg-dark-900/90 border border-dark-700/80 text-slate-200 rounded-tl-none font-sans'
            }"
          >
            {#if msg.sender === 'user'}
              <p>{msg.text}</p>
            {:else}
              <!-- Parse clickable bracket citations -->
              <p>
                {#each msg.text.split(/(\[cite:\s*\d+\])/g) as part}
                  {@const match = part.match(/\[cite:\s*(\d+)\]/)}
                  {#if match}
                    {@const citeId = parseInt(match[1], 10)}
                    <button
                      onclick={() => openCitation(citeId)}
                      class="inline-flex items-center gap-0.5 px-1.5 py-0.5 mx-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-mono font-bold text-[10px] transition-colors"
                      title="Click to inspect primary source dossier"
                    >
                      <Icons name="book" size={9} />
                      cite: {citeId}
                    </button>
                  {:else}
                    <span>{part}</span>
                  {/if}
                {/each}
              </p>
            {/if}
          </div>
        </div>
      {/each}

      {#if isThinking}
        <div class="flex items-center gap-2 p-3 bg-dark-900/60 rounded-2xl border border-dark-800 text-xs text-amber-300 animate-pulse">
          <Icons name="sparkles" size={14} class="animate-spin" />
          <span>Searching grounded campaign documents & citations...</span>
        </div>
      {/if}
    </div>

    <!-- Active Citation Detail Modal / Slide-over Dossier -->
    {#if activeCitationDossier}
      <div class="bg-dark-900 border-t border-amber-500/40 p-4 space-y-2 animate-fadeIn relative">
        <div class="flex items-start justify-between gap-2">
          <div>
            <span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px] font-bold uppercase">
              Citation Source #{activeCitationDossier.id}
            </span>
            <h4 class="font-bold text-xs text-slate-100 mt-1 font-serif">
              {activeCitationDossier.title}
            </h4>
          </div>
          <button
            onclick={() => (activeCitationDossier = null)}
            class="text-slate-400 hover:text-slate-200 text-sm font-bold"
          >
            &times;
          </button>
        </div>

        <div class="bg-dark-950 p-3 rounded-xl border border-dark-800 text-[11px] text-amber-100/90 leading-relaxed font-serif italic">
          "{activeCitationDossier.excerpt}"
        </div>

        <div class="flex items-center justify-between text-[10px] text-slate-400 font-mono pt-1">
          <span>Authority: {activeCitationDossier.authority}</span>
          <span class="text-amber-400">Classified Dossier</span>
        </div>
      </div>
    {/if}

    <!-- Input Footer Bar -->
    <div class="p-3 bg-dark-900/90 border-t border-amber-900/40">
      <form
        onsubmit={(e) => {
          e.preventDefault();
          handleSendMessage();
        }}
        class="flex items-center gap-2"
      >
        <input
          type="text"
          placeholder="Ask Archivist about lore, statutes, vaults..."
          bind:value={userInput}
          disabled={isThinking}
          class="flex-1 bg-dark-950 border border-dark-700 focus:border-amber-500 text-slate-200 text-xs px-3.5 py-2.5 rounded-xl focus:outline-none"
        />
        <button
          type="submit"
          disabled={!userInput.trim() || isThinking}
          class="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 disabled:opacity-40 text-black font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-amber-500/20 flex items-center justify-center shrink-0"
        >
          <Icons name="send" size={14} />
        </button>
      </form>
    </div>
  </aside>
{/if}
