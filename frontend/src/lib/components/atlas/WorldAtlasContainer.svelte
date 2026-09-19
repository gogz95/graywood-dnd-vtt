<script lang="ts">
  // WorldAtlasContainer.svelte — Multi-tool external atlas hub & handout formatter
  // Provides sandboxed iframes for Azgaar, Watabou, Dungeon Scrawl, Kanka/Wiki,
  // plus an integrated 5e Markdown Handout Formatter and Battle Mat ingestion bridge.

  import { onMount } from 'svelte';

  type AtlasToolId = 'azgaar' | 'watabou' | 'dungeonscrawl' | 'kanka' | 'handout';

  interface AtlasToolConfig {
    id: AtlasToolId;
    name: string;
    icon: string;
    description: string;
    localUrl: string;
    hostedUrl: string;
    customUrl: string;
    useHosted: boolean;
    useCustom: boolean;
  }

  const STORAGE_KEY_CONFIGS = 'vtt_atlas_tool_configs_v1';
  const STORAGE_KEY_ACTIVE = 'vtt_atlas_active_tool_v1';
  const STORAGE_KEY_HANDOUT = 'vtt_atlas_handout_content_v1';

  // Default tool configurations
  const DEFAULT_CONFIGS: AtlasToolConfig[] = [
    {
      id: 'azgaar',
      name: 'Azgaar World Map',
      icon: '🌍',
      description: 'Procedural world & continent generator with climate, cultures, and relief maps.',
      localUrl: '/tools/azgaar/index.html',
      hostedUrl: 'https://azgaar.github.io/Fantasy-Map-Generator/',
      customUrl: '',
      useHosted: true, // Default to hosted since local folder is user-supplied
      useCustom: false,
    },
    {
      id: 'watabou',
      name: 'Watabou City Generator',
      icon: '🏰',
      description: 'Medieval settlement generator with wards, castles, streets, and docks.',
      localUrl: '/tools/watabou/city.html',
      hostedUrl: 'https://watabou.github.io/city-generator/',
      customUrl: '',
      useHosted: true,
      useCustom: false,
    },
    {
      id: 'dungeonscrawl',
      name: 'Dungeon Scrawl',
      icon: '🗝️',
      description: 'Old-school battle map and dungeon schematic architect with grid snapping.',
      localUrl: '',
      hostedUrl: 'https://app.dungeonscrawl.com/',
      customUrl: '',
      useHosted: true,
      useCustom: false,
    },
    {
      id: 'kanka',
      name: 'Campaign Database / Wiki',
      icon: '🏛️',
      description: 'Worldbuilding encyclopedia, timeline tracker, and campaign ledger.',
      localUrl: '',
      hostedUrl: 'https://kanka.io/',
      customUrl: '',
      useHosted: true,
      useCustom: false,
    },
    {
      id: 'handout',
      name: '5e Handout Formatter',
      icon: '📜',
      description: 'Parchment letter, bounty, and journal renderer formatted for player handouts.',
      localUrl: '',
      hostedUrl: '',
      customUrl: '',
      useHosted: false,
      useCustom: false,
    },
  ];

  // ── State ──────────────────────────────────────────────────────────────────
  let activeToolId = $state<AtlasToolId>('azgaar');
  let toolConfigs = $state<AtlasToolConfig[]>([]);
  let iframeKey = $state(0);
  let showConfigModal = $state(false);
  let exportSuccessToast = $state<string | null>(null);
  let isDraggingOverBridge = $state(false);

  // Handout Formatter State
  let handoutMarkdown = $state('');
  let handoutTitle = $state('Notice of Exterminators Wanted');
  let handoutType = $state<'bounty' | 'letter' | 'scroll' | 'journal'>('bounty');
  let printAreaRef = $state<HTMLDivElement | null>(null);

  // Load saved state on mount
  onMount(() => {
    try {
      const savedActive = localStorage.getItem(STORAGE_KEY_ACTIVE);
      if (savedActive && DEFAULT_CONFIGS.some(t => t.id === savedActive)) {
        activeToolId = savedActive as AtlasToolId;
      }

      const savedConfigs = localStorage.getItem(STORAGE_KEY_CONFIGS);
      if (savedConfigs) {
        const parsed = JSON.parse(savedConfigs) as AtlasToolConfig[];
        // Merge with defaults to ensure all keys exist
        toolConfigs = DEFAULT_CONFIGS.map(def => {
          const match = parsed.find(p => p.id === def.id);
          return match ? { ...def, ...match } : def;
        });
      } else {
        toolConfigs = [...DEFAULT_CONFIGS];
      }

      const savedHandout = localStorage.getItem(STORAGE_KEY_HANDOUT);
      if (savedHandout) {
        handoutMarkdown = savedHandout;
      } else {
        loadHandoutTemplate('bounty');
      }
    } catch {
      toolConfigs = [...DEFAULT_CONFIGS];
      loadHandoutTemplate('bounty');
    }
  });

  // Persist configs
  $effect(() => {
    if (toolConfigs.length > 0) {
      localStorage.setItem(STORAGE_KEY_CONFIGS, JSON.stringify(toolConfigs));
    }
  });

  $effect(() => {
    localStorage.setItem(STORAGE_KEY_ACTIVE, activeToolId);
  });

  $effect(() => {
    localStorage.setItem(STORAGE_KEY_HANDOUT, handoutMarkdown);
  });

  // Current active tool definition
  const currentTool = $derived(
    toolConfigs.find(t => t.id === activeToolId) ?? DEFAULT_CONFIGS[0]
  );

  // Effective URL for current tool
  const currentUrl = $derived.by(() => {
    if (!currentTool) return '';
    if (currentTool.useCustom && currentTool.customUrl.trim()) {
      return currentTool.customUrl.trim();
    }
    if (currentTool.useHosted || !currentTool.localUrl) {
      return currentTool.hostedUrl;
    }
    return currentTool.localUrl;
  });

  function reloadIframe() {
    iframeKey += 1;
  }

  function openInNewTab() {
    if (currentUrl) {
      window.open(currentUrl, '_blank', 'noopener,noreferrer');
    }
  }

  function updateActiveToolSource(sourceType: 'local' | 'hosted' | 'custom') {
    toolConfigs = toolConfigs.map(t => {
      if (t.id !== activeToolId) return t;
      if (sourceType === 'local') return { ...t, useHosted: false, useCustom: false };
      if (sourceType === 'hosted') return { ...t, useHosted: true, useCustom: false };
      return { ...t, useCustom: true };
    });
    reloadIframe();
  }

  function updateCustomUrl(newUrl: string) {
    toolConfigs = toolConfigs.map(t => {
      if (t.id === activeToolId) {
        return { ...t, customUrl: newUrl, useCustom: true };
      }
      return t;
    });
  }

  // ── "Export to Battle Mat" Drop Zone Bridge ─────────────────────────────────
  function handleBridgeDrop(e: DragEvent) {
    e.preventDefault();
    isDraggingOverBridge = false;

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    processMapFile(file);
  }

  function handleFileInputChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      processMapFile(input.files[0]);
      input.value = '';
    }
  }

  function processMapFile(file: File) {
    const validExtensions = /\.(png|svg|jpg|jpeg|webp)$/i;
    if (!validExtensions.test(file.name)) {
      alert('Please drop an image file (PNG, SVG, JPG, or WEBP).');
      return;
    }

    const objectUrl = URL.createObjectURL(file);

    // Also create data URL for robust persistence across reloads
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;

      // Dispatch global battle mat loading event
      window.dispatchEvent(
        new CustomEvent('vtt:load-battle-map', {
          detail: {
            url: objectUrl,
            dataUrl,
            fileName: file.name,
          },
        })
      );

      // Automatically switch DM layout tab to the battlemat
      window.dispatchEvent(
        new CustomEvent('vtt:switch-tab', {
          detail: { tab: 'battlemat' },
        })
      );

      // Feedback toast
      exportSuccessToast = `Exported "${file.name}" directly to Tactical Battle Mat!`;
      setTimeout(() => {
        exportSuccessToast = null;
      }, 4500);
    };
    reader.readAsDataURL(file);
  }

  // ── Quick Handout Formatter Logic ──────────────────────────────────────────
  function loadHandoutTemplate(template: 'bounty' | 'letter' | 'scroll' | 'journal') {
    handoutType = template;
    if (template === 'bounty') {
      handoutTitle = 'Bounty Notice: Goblins in the Sunken Quarry';
      handoutMarkdown = `# BOUNTY NOTICE: GOBLINS AT THE SUNKEN QUARRY
**Issued by Authority of the Town Constable & Magistrate**

> **BE IT KNOWN TO ALL ADVENTURERS, MERCENARIES, AND CITIZENS:**
> A band of troublesome subterranean raiders has commandeered the abandoned granite quarry north of the Old Mill. They have ambushed three merchant wagons and carried away store goods.

### TERMS OF CONTRACT
- **Target:** Elimination or dispersal of the raider warband.
- **Proof:** Recovery of the merchant ledger bearing the Constable's seal.
- **Reward:** **150 Gold Pieces (GP)** paid upon verification at the Town Watchpost.
- **Special Clause:** Captive miners must be returned unharmed for full reward dispersal.

---
*Signed and sealed on the 14th of Mirtul,*
**Magistrate Horatio Vance, First Alderman**`;
    } else if (template === 'letter') {
      handoutTitle = 'Intercepted Courier Dispatch';
      handoutMarkdown = `# CONFIDENTIAL DISPATCH
**To the Field Marshal, Southern Watch**

Brother,

The strange astrological occurrences we discussed have intensified. The obsidian obelisk unearthed beneath the barrow mounds began vibrating at midnight. Three of our excavators fell unconscious, babbling in archaic tongues about an eclipse of crimson stars.

> "When the twin moons align with the Iron Peak, the crypt threshold shall unlock without key or hammer."

We request additional armed guards and a cleric versed in abjuration before the coming solstice. Do not allow rumors to reach the common populace.

*In vigilance and duty,*
**Captain Eric Brandt**`;
    } else if (template === 'scroll') {
      handoutTitle = 'Decoded Ritual Scroll';
      handoutMarkdown = `# RITUAL INSTRUCTION: THE SEAL OF AEGIS
*Transcribed from the third stone tablet of the Sunken Vault*

To erect the barrier against planar incursions, observe the three sacred rites:

1. **The Crucible:** Anoint the threshold with holy water mixed with powdered silver (value 25 gp).
2. **The Incantation:** Recite the four cantos of protection facing the cardinal directions:
   - *East:* The rising dawn shatters deceit.
   - *South:* The blazing flame repels corruption.
   - *West:* The falling twilight calms the tempest.
   - *North:* The enduring stone anchors reality.
3. **The Binding:** Place the consecrated sigil at the center and utter the true name of the warden.

> **WARNING:** If the caster breaks concentration before the third chime of dawn, the consecrated ward collapses and the spirits shall be enraged.`;
    } else if (template === 'journal') {
      handoutTitle = 'Torn Explorer Journal Entry';
      handoutMarkdown = `# EXPEDITION DIARY — DAY 28
*Water-damaged parchment recovered from the lower caverns*

We crossed the subterranean chasm via the collapsed stone pillars. The air here tastes like sulfur and burnt copper. Morale is deteriorating rapidly. Borin swears he hears child-like weeping echoing through the ventilation shafts, but every scout returns with nothing to report.

We discovered a hidden iron door behind the stalagmite formation. The locking mechanism has three tumblers fashioned in the shapes of:
- A coiled serpent (bronze)
- An open eye (silver)
- A crescent moon (electrum)

We shall attempt to decipher the sequence tomorrow morning. If we do not return, notify the guildhouse in the capital.`;
    }
  }

  function insertMarkdownSnippet(snippet: string) {
    handoutMarkdown = `${handoutMarkdown}\n\n${snippet}`;
  }

  function printHandout() {
    window.print();
  }

  // Basic 5e Markdown Parser to clean HTML
  function renderMarkdownToHtml(md: string): string {
    if (!md) return '';
    let html = md
      // Escape script tags
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      // Blockquotes (> text)
      .replace(/^>\s*(.+)$/gm, '<blockquote class="parchment-quote">$1</blockquote>')
      // Headers
      .replace(/^### (.*$)/gm, '<h3 class="parchment-h3">$1</h3>')
      .replace(/^## (.*$)/gm, '<h2 class="parchment-h2">$1</h2>')
      .replace(/^# (.*$)/gm, '<h1 class="parchment-h1">$1</h1>')
      // Horizontal Rules
      .replace(/^---$/gm, '<hr class="parchment-hr" />')
      // Bold & Italic
      .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      // Lists (- item)
      .replace(/^\s*-\s+(.*)$/gm, '<li class="parchment-li">$1</li>')
      .replace(/^\s*(\d+)\.\s+(.*)$/gm, '<li class="parchment-li-num"><span>$1.</span> $2</li>')
      // Linebreaks / paragraphs
      .replace(/\n{2,}/g, '</p><p class="parchment-p">')
      .replace(/\n/g, '<br/>');

    return `<p class="parchment-p">${html}</p>`;
  }
</script>

<!-- Outer Container -->
<div class="h-full w-full flex flex-col overflow-hidden bg-slate-950 text-slate-100 select-none">

  <!-- ═════════════════════════════════════════════════════════════════════════
       TOP TOOL SELECTOR TOOLBAR
  ══════════════════════════════════════════════════════════════════════════ -->
  <header class="h-11 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-3 gap-2 shrink-0 z-20">
    <!-- Tool Pills -->
    <div class="flex items-center gap-1.5 overflow-x-auto py-1 no-scrollbar min-w-0">
      {#each toolConfigs as tool (tool.id)}
        <button
          type="button"
          onclick={() => { activeToolId = tool.id; }}
          class="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all
            {activeToolId === tool.id
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 ring-1 ring-indigo-400/40'
              : 'text-slate-400 bg-slate-800/60 hover:bg-slate-800 hover:text-slate-200'}"
          title={tool.description}
        >
          <span class="text-sm leading-none">{tool.icon}</span>
          <span>{tool.name}</span>
          {#if tool.id !== 'handout'}
            <span class="text-[9px] px-1 py-0.2 rounded font-mono uppercase {tool.useCustom ? 'bg-amber-900/60 text-amber-300' : tool.useHosted ? 'bg-indigo-950 text-indigo-300' : 'bg-emerald-950 text-emerald-300'}">
              {tool.useCustom ? 'Custom' : tool.useHosted ? 'Hosted' : 'Local'}
            </span>
          {/if}
        </button>
      {/each}
    </div>

    <!-- Right Controls: Source Config, Reload, Popout -->
    <div class="flex items-center gap-1.5 shrink-0">
      {#if activeToolId !== 'handout'}
        <!-- Source switcher button -->
        <button
          type="button"
          onclick={() => showConfigModal = !showConfigModal}
          class="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
          title="Configure Local vs. Hosted URL"
        >
          <span>⚙️ Source</span>
        </button>

        <button
          type="button"
          onclick={reloadIframe}
          class="p-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          title="Reload Frame"
        >
          🔄
        </button>

        <button
          type="button"
          onclick={openInNewTab}
          class="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          title="Open in Browser Window"
        >
          <span>↗ Popout</span>
        </button>
      {:else}
        <button
          type="button"
          onclick={printHandout}
          class="flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 transition-colors shadow-sm"
        >
          <span>🖨️ Print / Save PDF</span>
        </button>
      {/if}
    </div>
  </header>

  <!-- ═════════════════════════════════════════════════════════════════════════
       SOURCE CONFIGURATION DRAWER / BAR (when toggled)
  ══════════════════════════════════════════════════════════════════════════ -->
  {#if showConfigModal && activeToolId !== 'handout'}
    <div class="bg-slate-900 border-b border-indigo-900/60 px-4 py-2.5 flex items-center justify-between gap-4 text-xs shrink-0 animate-in slide-in-from-top-2">
      <div class="flex items-center gap-3 flex-1 min-w-0">
        <span class="font-bold text-slate-300 whitespace-nowrap">Source for {currentTool.name}:</span>

        <!-- Local vs Hosted toggles -->
        <div class="flex items-center rounded-lg bg-slate-950 p-0.5 border border-slate-800">
          <button
            type="button"
            onclick={() => updateActiveToolSource('local')}
            class="px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors
              {!currentTool.useHosted && !currentTool.useCustom ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}"
          >
            Local ({currentTool.localUrl || 'None'})
          </button>
          <button
            type="button"
            onclick={() => updateActiveToolSource('hosted')}
            class="px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors
              {currentTool.useHosted && !currentTool.useCustom ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}"
          >
            Hosted (GitHub / Web)
          </button>
        </div>

        <!-- Custom URL Input -->
        <div class="flex items-center gap-1.5 flex-1 min-w-0">
          <span class="text-slate-500 text-[10px] uppercase font-bold">Custom URL:</span>
          <input
            type="url"
            value={currentTool.customUrl}
            oninput={(e) => updateCustomUrl((e.target as HTMLInputElement).value)}
            placeholder="http://localhost:port or https://…"
            class="flex-1 min-w-0 bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-slate-200 font-mono text-[11px] focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      <button
        type="button"
        onclick={() => showConfigModal = false}
        class="text-slate-500 hover:text-slate-300 font-bold px-2 py-0.5"
      >
        ✕
      </button>
    </div>
  {/if}

  <!-- ═════════════════════════════════════════════════════════════════════════
       INGESTION BRIDGE: "Export to Battle Mat" Drop Zone
  ══════════════════════════════════════════════════════════════════════════ -->
  <div
    class="bg-slate-900/90 border-b border-slate-800 px-3 py-1.5 flex items-center justify-between gap-3 text-xs transition-colors shrink-0"
    class:bg-indigo-950={isDraggingOverBridge}
    class:border-indigo-500={isDraggingOverBridge}
    ondragover={(e) => { e.preventDefault(); isDraggingOverBridge = true; }}
    ondragleave={() => { isDraggingOverBridge = false; }}
    ondrop={handleBridgeDrop}
    role="region"
    aria-label="Export to Battle Mat drop zone"
  >
    <div class="flex items-center gap-2 min-w-0">
      <span class="text-base leading-none">🗺️</span>
      <span class="font-bold text-slate-300 text-[11px] uppercase tracking-wider whitespace-nowrap">Battle Mat Bridge:</span>
      <span class="text-slate-400 text-[11px] truncate">
        Drag exported PNG, SVG, or JPG maps here from your generator to immediately load onto the Tactical Battle Mat.
      </span>
    </div>

    <div class="flex items-center gap-2 shrink-0">
      <label class="px-2.5 py-1 bg-indigo-700/80 hover:bg-indigo-600 text-indigo-100 font-semibold rounded cursor-pointer transition-colors text-[11px] flex items-center gap-1">
        <span>📁 Load File to Mat</span>
        <input type="file" accept=".png,.svg,.jpg,.jpeg,.webp" class="hidden" onchange={handleFileInputChange} />
      </label>
    </div>
  </div>

  <!-- Ingestion Success Banner -->
  {#if exportSuccessToast}
    <div class="bg-emerald-900/90 border-b border-emerald-600/60 px-4 py-1.5 text-xs text-emerald-200 flex items-center justify-between shrink-0 animate-pulse">
      <span class="font-medium">✅ {exportSuccessToast}</span>
      <button type="button" onclick={() => exportSuccessToast = null} class="text-emerald-400 hover:text-emerald-100">✕</button>
    </div>
  {/if}

  <!-- ═════════════════════════════════════════════════════════════════════════
       MAIN VIEWPORT: IFRAME OR HANDOUT FORMATTER
  ══════════════════════════════════════════════════════════════════════════ -->
  <div class="flex-1 min-h-0 relative overflow-hidden bg-slate-950">

    {#if activeToolId !== 'handout'}
      <!-- Sandboxed iframe for External Generators -->
      {#key `${activeToolId}-${iframeKey}-${currentUrl}`}
        <iframe
          src={currentUrl}
          title={currentTool.name}
          class="w-full h-full border-0 bg-slate-950"
          sandbox="allow-scripts allow-same-origin allow-downloads allow-forms allow-popups"
          allow="clipboard-read; clipboard-write; fullscreen"
          loading="lazy"
        ></iframe>
      {/key}

    {:else}
      <!-- ─── 5e Quick Handout Formatter ──────────────────────────────────── -->
      <div class="h-full w-full flex flex-col md:flex-row overflow-hidden">

        <!-- Left Editor Pane -->
        <div class="w-full md:w-1/2 flex flex-col border-r border-slate-800 bg-slate-900/60 overflow-hidden">
          <!-- Template selector bar -->
          <div class="p-2 border-b border-slate-800 bg-slate-900 flex items-center gap-1.5 flex-wrap shrink-0">
            <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">5e Templates:</span>
            <button
              type="button"
              onclick={() => loadHandoutTemplate('bounty')}
              class="px-2 py-0.5 text-xs rounded {handoutType === 'bounty' ? 'bg-amber-600 text-white font-bold' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}"
            >
              📜 Bounty Notice
            </button>
            <button
              type="button"
              onclick={() => loadHandoutTemplate('letter')}
              class="px-2 py-0.5 text-xs rounded {handoutType === 'letter' ? 'bg-amber-600 text-white font-bold' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}"
            >
              ✉️ Courier Dispatch
            </button>
            <button
              type="button"
              onclick={() => loadHandoutTemplate('scroll')}
              class="px-2 py-0.5 text-xs rounded {handoutType === 'scroll' ? 'bg-amber-600 text-white font-bold' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}"
            >
              ✨ Ritual Scroll
            </button>
            <button
              type="button"
              onclick={() => loadHandoutTemplate('journal')}
              class="px-2 py-0.5 text-xs rounded {handoutType === 'journal' ? 'bg-amber-600 text-white font-bold' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}"
            >
              📖 Explorer Journal
            </button>
          </div>

          <!-- Quick Markdown format snippets -->
          <div class="px-2 py-1.5 border-b border-slate-800 bg-slate-950 flex items-center gap-1 text-[11px] flex-wrap shrink-0">
            <button type="button" onclick={() => insertMarkdownSnippet('## SECTION HEADER')} class="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-mono">H2</button>
            <button type="button" onclick={() => insertMarkdownSnippet('> "Read-aloud flavor text for the players."')} class="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-mono">Quote</button>
            <button type="button" onclick={() => insertMarkdownSnippet('**Reward:** **50 GP**')} class="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-mono">Reward</button>
            <button type="button" onclick={() => insertMarkdownSnippet('---\n*Signed and Sealed,*  \n**Archmage Vaelin**')} class="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-mono">Signature</button>
          </div>

          <!-- Markdown textarea -->
          <div class="flex-1 p-3 min-h-0 flex flex-col">
            <label for="handout-md-input" class="text-[10px] uppercase font-bold text-slate-500 mb-1">Markdown Source</label>
            <textarea
              id="handout-md-input"
              bind:value={handoutMarkdown}
              placeholder="Type your player handout content in Markdown..."
              class="flex-1 w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-200 font-mono text-xs focus:outline-none focus:border-indigo-500 resize-none leading-relaxed"
            ></textarea>
          </div>
        </div>

        <!-- Right Parchment Preview Pane -->
        <div class="w-full md:w-1/2 flex flex-col bg-stone-900 overflow-y-auto p-4 md:p-6">
          <div class="max-w-xl mx-auto w-full">
            <div
              bind:this={printAreaRef}
              class="parchment-sheet p-6 sm:p-8 rounded-lg shadow-2xl border-4 border-amber-900/60 bg-[#fbf5e6] text-[#2c1d11] font-serif select-text relative"
            >
              <!-- Decorative corner accents -->
              <div class="absolute top-2 left-2 text-amber-900/40 text-xs">❖</div>
              <div class="absolute top-2 right-2 text-amber-900/40 text-xs">❖</div>
              <div class="absolute bottom-2 left-2 text-amber-900/40 text-xs">❖</div>
              <div class="absolute bottom-2 right-2 text-amber-900/40 text-xs">❖</div>

              <!-- Rendered Markdown Output -->
              <div class="parchment-content leading-relaxed space-y-3">
                <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                {@html renderMarkdownToHtml(handoutMarkdown)}
              </div>
            </div>
          </div>
        </div>

      </div>
    {/if}

  </div>
</div>

<style>
  /* 5e Parchment Handout Typography & Styling */
  .parchment-sheet {
    box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.7), inset 0 0 40px rgba(180, 130, 80, 0.25);
    background-image: radial-gradient(circle at center, #fbf7ee 0%, #f4e8cf 70%, #ead7b0 100%);
    min-height: 480px;
  }

  :global(.parchment-h1) {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 1.35rem;
    font-weight: 800;
    color: #4a1c10;
    border-bottom: 2px solid #b38b6d;
    padding-bottom: 0.35rem;
    margin-top: 0.5rem;
    margin-bottom: 0.6rem;
    letter-spacing: 0.05em;
    text-align: center;
    text-transform: uppercase;
  }

  :global(.parchment-h2) {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 1.15rem;
    font-weight: 700;
    color: #5c2c1e;
    margin-top: 0.75rem;
    margin-bottom: 0.4rem;
  }

  :global(.parchment-h3) {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 1rem;
    font-weight: 700;
    color: #3b2014;
    margin-top: 0.6rem;
    margin-bottom: 0.3rem;
  }

  :global(.parchment-p) {
    font-size: 0.95rem;
    color: #2b1a0d;
    line-height: 1.6;
    margin-bottom: 0.6rem;
  }

  :global(.parchment-quote) {
    background-color: rgba(214, 185, 142, 0.3);
    border-left: 4px solid #8c3b24;
    padding: 0.65rem 0.85rem;
    margin: 0.75rem 0;
    font-style: italic;
    color: #381f15;
    border-radius: 0 4px 4px 0;
  }

  :global(.parchment-hr) {
    border: none;
    border-top: 1px solid #b38b6d;
    margin: 1rem 0;
  }

  :global(.parchment-li) {
    margin-left: 1.25rem;
    list-style-type: disc;
    font-size: 0.95rem;
    margin-bottom: 0.25rem;
  }

  :global(.parchment-li-num) {
    margin-left: 1.25rem;
    list-style-type: none;
    font-size: 0.95rem;
    margin-bottom: 0.25rem;
  }

  :global(.parchment-li-num span) {
    font-weight: bold;
    color: #783516;
  }

  @media print {
    :global(body *) {
      visibility: hidden;
    }
    .parchment-sheet, .parchment-sheet * {
      visibility: visible;
    }
    .parchment-sheet {
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      border: 1px solid #000;
      box-shadow: none;
    }
  }
</style>
